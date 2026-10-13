// AC-142 / AC-143: el proceso mide su propio rendimiento y lo registra cada 60 s con su hora, solo si hubo jugadores en ese
// minuto. Fuentes falsas (reloj, event loop, ELU, CPU y memoria) para fijar cada campo; y una prueba con el bucle real de
// game-server.ts: un jugador conectado, ventana de 1 s, una línea con ~20 ticks y 0 perdidos
import { createServer, Server as HttpServer } from 'http';
import { AddressInfo } from 'net';
import os from 'os';
import { performance } from 'perf_hooks';
import { Server } from 'socket.io';
import { io as ioClient, Socket as ClientSocket } from 'socket.io-client';
import { C2S, S2C } from '../../src/game/protocol';
import { createRng } from '../../src/game/vec';
import { addPlayer, attack, moveTo, shipOfPlayer } from '../../src/game/world';
import { createGameServer, GameServer } from '../game-server';
import { createServerMetrics, ELD_RESOLUTION_MS, MetricsSources, parseMetricsLine } from '../metrics';

const MB = 2 ** 20;

function fakeSources() {
  const state = {
    now: Date.parse('2026-10-13T00:10:00.000Z'),
    eldP99Ns: (ELD_RESOLUTION_MS + 2.5) * 1e6,
    eldMaxNs: (ELD_RESOLUTION_MS + 40) * 1e6,
    eldResets: 0,
    eluActive: 0, // ms activos acumulados
    eluIdle: 0,
    cpuUs: 0,
    heapUsed: 70 * MB,
    heapTotal: 100 * MB,
    rss: 150 * MB,
    external: 5 * MB
  };
  const sources: MetricsSources = {
    now: () => state.now,
    eld: {
      enable: () => true,
      disable: () => true,
      reset: () => void state.eldResets++,
      percentile: () => state.eldP99Ns,
      get max() {
        return state.eldMaxNs;
      }
    },
    elu: (prev) => {
      const cur = { idle: state.eluIdle, active: state.eluActive, utilization: 0 };
      if (!prev) return cur;
      const active = cur.active - prev.active;
      const idle = cur.idle - prev.idle;
      return { idle, active, utilization: active / (active + idle) };
    },
    cpu: (prev) => ({ user: state.cpuUs - (prev?.user ?? 0), system: 0 }),
    memory: () => ({ heapUsed: state.heapUsed, heapTotal: state.heapTotal, rss: state.rss, external: state.external })
  };
  return { state, sources };
}

describe('métricas del proceso (AC-142)', () => {
  test('una ventana con jugadores da una línea con la hora y todos los campos', () => {
    const { state, sources } = fakeSources();
    const lines: string[] = [];
    let players = 0;
    const m = createServerMetrics({ players: () => players, tickRate: 20, log: (l) => lines.push(l), sources, autoStart: false });
    players = 20;
    for (let i = 0; i < 600; i++) m.loop(2, 0);
    for (let i = 1; i <= 100; i++) m.step(i / 100); // 0,01 … 1,00 ms: p99 = 0,99
    m.sampleMemory(); // externa 5
    state.heapUsed = 62 * MB; // el mínimo del minuto
    state.rss = 140 * MB;
    state.external = 3 * MB; // la externa mínima (rss − heapTotal aquí sería 40, y no es lo que se mide)
    m.sampleMemory();
    state.heapUsed = 80 * MB;
    state.rss = 160 * MB;
    state.heapTotal = 130 * MB;
    state.external = 7 * MB;
    m.sampleMemory();
    state.heapTotal = 120 * MB; // la última muestra, la de flush()
    state.external = 6 * MB;
    state.now += 60_000;
    state.eluActive = 6_000;
    state.eluIdle = 54_000;
    state.cpuUs = 6_000_000; // 6 s de CPU en 60 s = 10 %
    const line = m.flush();
    expect(line).toBe(
      '📈 Métricas 2026-10-13T00:11:00.000Z s=60.0 jugadores=20 ticks=1200 perdidos=0 step_p99_ms=0.99 eld_p99_ms=2.50 eld_max_ms=40.00 elu=0.100 cpu_pct=10.0 heap_min_mb=62.0 rss_min_mb=140.0 rss_mb=160.0 heap_total_mb=120.0 external_min_mb=3.0'
    );
    expect(lines).toEqual([line]);
    expect(parseMetricsLine(line!)).toEqual({
      at: '2026-10-13T00:11:00.000Z',
      s: 60,
      jugadores: 20,
      ticks: 1200,
      perdidos: 0,
      step_p99_ms: 0.99,
      eld_p99_ms: 2.5,
      eld_max_ms: 40,
      elu: 0.1,
      cpu_pct: 10,
      heap_min_mb: 62,
      rss_min_mb: 140,
      rss_mb: 160,
      heap_total_mb: 120,
      external_min_mb: 3
    });
  });

  test('sin jugadores en todo el minuto no registra nada, y la ventana se reinicia igual', () => {
    const { state, sources } = fakeSources();
    const lines: string[] = [];
    const m = createServerMetrics({ players: () => 0, tickRate: 20, log: (l) => lines.push(l), sources, autoStart: false });
    for (let i = 0; i < 600; i++) m.loop(2, 0);
    m.sampleMemory();
    state.now += 60_000;
    expect(m.flush()).toBeNull();
    expect(lines).toEqual([]);
    expect(state.eldResets).toBe(1);
  });

  test('la memoria externa mínima es la de cada ventana: se reinicia al registrar la línea', () => {
    const { state, sources } = fakeSources();
    const m = createServerMetrics({ players: () => 1, tickRate: 20, log: () => {}, sources, autoStart: false });
    state.external = 2 * MB;
    m.sampleMemory();
    state.now += 60_000;
    state.eluIdle += 60_000; // sin ELU el campo sale NaN y la línea no se lee más allá
    expect(parseMetricsLine(m.flush()!)?.external_min_mb).toBe(2);
    state.external = 9 * MB; // la ventana siguiente, con más memoria externa
    m.sampleMemory();
    state.now += 60_000;
    state.eluIdle += 60_000;
    expect(parseMetricsLine(m.flush()!)?.external_min_mb).toBe(9);
  });

  test('un jugador que estuvo y se fue cuenta para la ventana', () => {
    const { state, sources } = fakeSources();
    let players = 1;
    const m = createServerMetrics({ players: () => players, tickRate: 20, log: () => {}, sources, autoStart: false });
    m.sampleMemory();
    players = 0;
    m.sampleMemory();
    state.now += 60_000;
    expect(parseMetricsLine(m.flush()!)?.jugadores).toBe(1);
  });

  test('ticks perdidos: el tiempo que descarta el tope del bucle, en ticks', () => {
    const { state, sources } = fakeSources();
    const m = createServerMetrics({ players: () => 3, tickRate: 20, log: () => {}, sources, autoStart: false });
    m.loop(5, 0.25); // 250 ms descartados = 5 ticks de 50 ms
    m.loop(1, 0);
    state.now += 60_000;
    const r = parseMetricsLine(m.flush()!)!;
    expect(r.ticks).toBe(6);
    expect(r.perdidos).toBe(5);
  });

  test('el retraso del event loop descuenta la resolución del monitor y nunca es negativo', () => {
    const { state, sources } = fakeSources();
    const m = createServerMetrics({ players: () => 1, tickRate: 20, log: () => {}, sources, autoStart: false });
    state.eldP99Ns = (ELD_RESOLUTION_MS - 0.5) * 1e6;
    state.eldMaxNs = (ELD_RESOLUTION_MS + 120) * 1e6;
    state.now += 60_000;
    const r = parseMetricsLine(m.flush()!)!;
    expect(r.eld_p99_ms).toBe(0);
    expect(r.eld_max_ms).toBe(120);
  });

  test('cada ventana empieza de cero', () => {
    const { state, sources } = fakeSources();
    const m = createServerMetrics({ players: () => 2, tickRate: 20, log: () => {}, sources, autoStart: false });
    m.loop(2, 0.5);
    m.step(3);
    state.now += 60_000;
    m.flush();
    m.loop(2, 0);
    m.step(0.2);
    state.now += 60_000;
    const r = parseMetricsLine(m.flush()!)!;
    expect(r.ticks).toBe(2);
    expect(r.perdidos).toBe(0);
    expect(r.step_p99_ms).toBe(0.2);
  });

  test('parseMetricsLine ignora otras líneas del log', () => {
    expect(parseMetricsLine('🎮 Bot 01 se unió (1 en línea)')).toBeNull();
    expect(parseMetricsLine('2026-10-13T00:11:00Z 📈 Métricas 2026-10-13T00:11:00.000Z s=60.0 jugadores=1')?.jugadores).toBe(1);
    // Una línea anterior a heap_total_mb y external_min_mb (las corridas del 2026-10-12) se sigue leyendo, sin esos campos
    const old = parseMetricsLine('📈 Métricas 2026-10-13T03:14:25.102Z s=60.0 jugadores=20 heap_min_mb=60.2 rss_min_mb=91.6 rss_mb=93.6')!;
    expect(old.rss_min_mb).toBe(91.6);
    expect(old.external_min_mb).toBeUndefined();
  });

  test('con temporizadores: una línea por intervalo y nada después de stop()', () => {
    jest.useFakeTimers();
    try {
      const { state, sources } = fakeSources();
      const lines: string[] = [];
      const m = createServerMetrics({ players: () => 1, tickRate: 20, log: (l) => lines.push(l), sources, intervalMs: 60_000 });
      state.now += 60_000;
      jest.advanceTimersByTime(60_000);
      expect(lines).toHaveLength(1);
      m.stop();
      state.now += 60_000;
      jest.advanceTimersByTime(120_000);
      expect(lines).toHaveLength(1);
    } finally {
      jest.useRealTimers();
    }
  });
});

describe('métricas con el bucle real del servidor (AC-142)', () => {
  let httpServer: HttpServer;
  let io: Server;
  let game: GameServer;
  let client: ClientSocket | null = null;

  afterEach(async () => {
    client?.disconnect();
    game?.stop();
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });

  test('con un jugador conectado, la línea de 1 s trae ~20 ticks y 0 perdidos', async () => {
    const lines: string[] = [];
    httpServer = createServer();
    io = new Server(httpServer);
    game = createGameServer(io, {
      authenticate: async () => ({ userId: 'u1', guest: true }),
      spawnNpcs: false,
      metrics: true,
      metricsIntervalMs: 1000,
      log: (l) => lines.push(l)
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    client = ioClient(`http://localhost:${(httpServer.address() as AddressInfo).port}`, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => {
      client!.on(S2C.welcome, () => resolve());
      client!.emit(C2S.join, {});
    });
    const deadline = Date.now() + 5000;
    while (!lines.some((l) => parseMetricsLine(l)?.jugadores === 1) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    const r = lines.map(parseMetricsLine).find((x) => x?.jugadores === 1)!;
    expect(r).toBeDefined();
    expect(r.ticks).toBeGreaterThanOrEqual(15);
    expect(r.ticks).toBeLessThanOrEqual(25);
    expect(r.perdidos).toBe(0);
    expect(r.step_p99_ms).toBeGreaterThan(0);
  });

  test('un bloqueo de 500 ms del event loop sale como ticks perdidos y en el retraso máximo', async () => {
    const lines: string[] = [];
    httpServer = createServer();
    io = new Server(httpServer);
    game = createGameServer(io, {
      authenticate: async () => ({ userId: 'u1', guest: true }),
      spawnNpcs: false,
      metrics: true,
      metricsIntervalMs: 2000,
      log: (l) => lines.push(l)
    });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    client = ioClient(`http://localhost:${(httpServer.address() as AddressInfo).port}`, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => {
      client!.on(S2C.welcome, () => resolve());
      client!.emit(C2S.join, {});
    });
    await new Promise((r) => setTimeout(r, 100));
    const t = Date.now();
    while (Date.now() - t < 500) {
      /* bloquea el event loop: el bucle de 20 Hz se atrasa 10 ticks y el tope de 5 descarta el resto */
    }
    const deadline = Date.now() + 5000;
    while (!lines.some((l) => parseMetricsLine(l)?.jugadores === 1) && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50));
    const r = lines.map(parseMetricsLine).find((x) => x?.jugadores === 1)!;
    // Lo descartado es el atraso menos los 5 ticks que sí corren: 500 ms de bloqueo, más lo que había pasado desde la pasada
    // anterior (hasta 50 ms) y el retraso del temporizador. Da de 5 a ~6,3 ticks (6,24 y 6,26 medidos); contar todo el
    // atraso daría ≥ 10
    expect(r.perdidos).toBeGreaterThanOrEqual(4);
    expect(r.perdidos).toBeLessThanOrEqual(8);
    expect(r.eld_max_ms).toBeGreaterThanOrEqual(450);
  });

  test('sin la opción metrics no registra métricas', async () => {
    const lines: string[] = [];
    httpServer = createServer();
    io = new Server(httpServer);
    game = createGameServer(io, { authenticate: async () => ({ userId: 'u1', guest: true }), spawnNpcs: false, metricsIntervalMs: 200, log: (l) => lines.push(l) });
    await new Promise<void>((resolve) => httpServer.listen(0, resolve));
    client = ioClient(`http://localhost:${(httpServer.address() as AddressInfo).port}`, { transports: ['websocket'], reconnection: false });
    await new Promise<void>((resolve) => {
      client!.on(S2C.welcome, () => resolve());
      client!.emit(C2S.join, {});
    });
    await new Promise((r) => setTimeout(r, 700));
    expect(lines.filter((l) => l.includes('📈'))).toEqual([]);
  });
});

// AC-142: la medida va activa por defecto (también en prod) solo si apenas cuesta. Condición: el p99 del tick con la medida
// encendida no pasa en más de 0,2 ms (el 5 % de los 4 ms de GDD §16) del p99 con la medida apagada, con el método de AC-03:
// 2 000 ticks tras 200 de calentamiento, 20 jugadores con ~1 intención/s y 20 NPC, mismas semillas, el menor de 3 p99.
// Las corridas se alternan (apagada, encendida, …) para que la carga de la máquina y el JIT repartan igual
describe('coste de la medida (AC-142)', () => {
  function tickP99(metrics: boolean): { p50: number; p99: number } {
    const io = new Server(createServer());
    const game = createGameServer(io, { authenticate: async () => ({ userId: 'x', guest: true }), seed: 3, autoStart: false, metrics });
    try {
      const rng = createRng(5);
      for (let i = 0; i < 20; i++) addPlayer(game.world, `p${i}`, `P${i}`);
      for (const ship of game.world.ships.values()) ship.protectedUntil = 0;
      const times: number[] = [];
      for (let t = 0; t < 2200; t++) {
        for (let i = 0; i < 20; i++) {
          if (rng() > 1 / 20) continue;
          const id = `p${i}`;
          const ship = shipOfPlayer(game.world, id);
          if (!ship || ship.state !== 'alive') continue;
          if (rng() < 0.6) moveTo(game.world, id, { x: (rng() * 2 - 1) * 480, z: (rng() * 2 - 1) * 480 });
          else {
            const near = [...game.world.ships.values()].find((s) => s.id !== ship.id && s.state === 'alive' && Math.hypot(s.pos.x - ship.pos.x, s.pos.z - ship.pos.z) < 150);
            if (near) attack(game.world, id, near.id);
          }
        }
        const t0 = performance.now();
        game.tick();
        if (t >= 200) times.push(performance.now() - t0);
      }
      times.sort((a, b) => a - b);
      return { p50: times[Math.ceil(0.5 * times.length) - 1], p99: times[Math.ceil(0.99 * times.length) - 1] };
    } finally {
      game.stop();
      io.close();
    }
  }

  test('el menor de 3 p99 del tick con la medida no pasa en más de 0,2 ms del menor de 3 sin ella', () => {
    const off: { p50: number; p99: number }[] = [];
    const on: { p50: number; p99: number }[] = [];
    const load = [os.loadavg()[0]];
    for (let i = 0; i < 3; i++) {
      off.push(tickP99(false));
      on.push(tickP99(true));
    }
    load.push(os.loadavg()[0]);
    const bestOff = Math.min(...off.map((r) => r.p99));
    const bestOn = Math.min(...on.map((r) => r.p99));
    const fmt = (rs: { p50: number; p99: number }[]) => `p99 ${rs.map((r) => r.p99.toFixed(3)).join(' · ')} (p50 ${rs.map((r) => r.p50.toFixed(3)).join(' · ')})`;
    console.log(
      `AC-142 coste de la medida: apagada ${fmt(off)} → menor ${bestOff.toFixed(3)} ms; encendida ${fmt(on)} → menor ${bestOn.toFixed(3)} ms; ` +
        `diferencia ${(bestOn - bestOff).toFixed(3)} ms; carga ${load.map((l) => l.toFixed(2)).join(' → ')}`
    );
    expect(bestOn - bestOff).toBeLessThanOrEqual(0.2);
  });
});
