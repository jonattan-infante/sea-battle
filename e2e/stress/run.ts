// Arnés de estrés, fase A de AC-142 (docs/game/BACKLOG.md, H-904): build de producción en local con Postgres temporal y
// 20 bots con usuario de prueba (testUser, guardan progreso) durante 10 min medidos en tiempo real.
// Orden de la corrida:
// 1. Ruido: carga de 1 min ≤ 6 antes de arrancar el servidor; control con un solo bot quieto en el puerto (con NPC)
//    durante una ventana entera de métricas del servidor, con el event loop en p99 ≤ 5 ms; otra vez carga ≤ 6 antes de
//    los demás bots. Va con un bot porque sin jugadores el servidor no registra métricas.
// 2. Bots (bot.ts): 10 PvP y 10 PvE, que intercambian el rol a mitad de la medida, y el cliente 21 a la vez.
// 3. Calentamiento de ≥ 60 s; la medida empieza en la siguiente línea «📈 Métricas» del servidor (server/metrics.ts), así
//    que cada minuto medido es exactamente una ventana del servidor. Carga ≤ 10 en cada minuto.
// 4. Fin: los bots vuelven al puerto, se desconectan y 5 s después se compara cada fila de la BD con su último frame.
// Todo lo del proceso sale de las líneas «📈 Métricas» del propio servidor (server/metrics.ts), las mismas que AC-143 lee
// del log de Railway. Deja en qa-artifacts/stress/<fecha>/ stress.json, resumen.md, orders.jsonl, server.log y run.log,
// con una línea por minuto de cada métrica. Sale con 0 (APROBADO), 1 (RECHAZADO) o 2 (NO VERIFICADO).
// Variables (humo): STRESS_BOTS (20), STRESS_MINUTES (10), STRESS_WINDOW_S (60; se pasa al servidor como
// SEA_BATTLE_METRICS_MS), STRESS_WARMUP_S (60), STRESS_SEED (1) y STRESS_NOISE=report (no corta por ruido; lo anota y el
// veredicto queda NO VERIFICADO). Con otros valores que los del AC, nunca sale APROBADO.
import { execFileSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { performance } from 'perf_hooks';
import { Client } from 'pg';
import { io as ioClient } from 'socket.io-client';
import { startTempCluster, TempCluster } from '../../server/__tests__/pg/cluster';
import { MetricsLine, parseMetricsLine } from '../../server/metrics';
import { parseProgress } from '../../server/progress';
import { MAX_PLAYERS } from '../../src/game/constants';
import { C2S, S2C } from '../../src/game/protocol';
import type { PlayerView } from '../../src/game/types';
import { OwnServer, startOwnServer } from '../own-server';
import { Bot, OrderRecord } from './bot';
import { bucket, r1, r2, roundSummary, summarize, Summary } from './stats';
import { AC142, evaluate, Measured, ServerMinute } from './thresholds';

const ROOT = path.join(__dirname, '..', '..');
const JOIN_TIMEOUT_MS = 30_000;
const JOIN_STAGGER_MS = 200;
const HOME_TIMEOUT_MS = 90_000;
const SETTLE_AFTER_STOP_MS = 5000; // AC-142: la BD se compara 5 s después de parar los bots

interface Config {
  bots: number;
  minutes: number;
  windowS: number;
  warmupS: number;
  seed: number;
  noiseAbort: boolean;
}

class NotVerified extends Error {}

function numEnv(name: string, def: number, min: number, max: number): number {
  const raw = process.env[name];
  const v = raw === undefined || raw === '' ? def : Number(raw);
  if (!Number.isFinite(v) || v < min || v > max) throw new Error(`${name}=${raw}: debe estar entre ${min} y ${max}`);
  return v;
}

function readConfig(): Config {
  return {
    bots: numEnv('STRESS_BOTS', MAX_PLAYERS, 2, MAX_PLAYERS),
    minutes: numEnv('STRESS_MINUTES', AC142.minutes, 1, 60),
    windowS: numEnv('STRESS_WINDOW_S', 60, 5, 60),
    warmupS: numEnv('STRESS_WARMUP_S', 60, 0, 600),
    seed: numEnv('STRESS_SEED', 1, 0, 2 ** 31),
    noiseAbort: process.env.STRESS_NOISE !== 'report'
  };
}

const isOfficial = (c: Config) => c.bots === MAX_PLAYERS && c.minutes === AC142.minutes && c.windowS === 60 && c.warmupS >= 60;
const pad = (n: number) => String(n).padStart(2, '0');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uptime = () => execFileSync('uptime', { encoding: 'utf8' }).trim();
const load1 = () => os.loadavg()[0];

function gitSha(): string {
  try {
    const sha = execFileSync('git', ['rev-parse', '--short', 'HEAD'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const dirty = execFileSync('git', ['status', '--porcelain'], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return dirty ? `${sha} (con cambios sin commitear)` : sha;
  } catch {
    return 'desconocido (sin git)';
  }
}

async function main(): Promise<number> {
  const cfg = readConfig();
  for (const f of ['dist/server/index.js', '.next-e2e/BUILD_ID']) {
    if (!fs.existsSync(path.join(ROOT, f))) throw new Error(`Falta ${f}: ejecuta \`npm run build:e2e\` (npm run test:stress ya lo hace)`);
  }
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.join(ROOT, 'qa-artifacts', 'stress', stamp);
  fs.mkdirSync(outDir, { recursive: true });
  const runLog = fs.createWriteStream(path.join(outDir, 'run.log'));
  const log = (msg: string) => {
    console.log(msg);
    if (!runLog.writableEnded) runLog.write(msg + '\n');
  };
  const serverLog = fs.createWriteStream(path.join(outDir, 'server.log'));
  const official = isOfficial(cfg);
  const sha = gitSha();

  log(`AC-142 · ${cfg.bots} bots · ${cfg.minutes} × ${cfg.windowS} s medidos · calentamiento ${cfg.warmupS} s${official ? '' : ' · CORRIDA CORTA (nunca APROBADO)'}`);
  log(`SHA ${sha} · node ${process.version} · ${os.cpus()[0]?.model ?? '?'} × ${os.cpus().length} · ${(os.totalmem() / 2 ** 30).toFixed(0)} GB`);

  const noise = { startLoad: 0, minuteLoads: [] as number[], controlEldP99: 0 };
  const uptimes: { when: string; uptime: string }[] = [];
  const noteUptime = (when: string) => {
    const u = uptime();
    uptimes.push({ when, uptime: u });
    log(`uptime (${when}): ${u}`);
  };
  const checkStartLoad = (when: string) => {
    noteUptime(when);
    noise.startLoad = Math.max(noise.startLoad, load1());
    if (cfg.noiseAbort && load1() > AC142.startLoadMax) throw new NotVerified(`ruido: carga ${load1().toFixed(2)} > ${AC142.startLoadMax} ${when}; se repite con la máquina más tranquila`);
  };

  let cluster: TempCluster | null = null;
  let server: OwnServer | null = null;
  const bots: Bot[] = [];
  const serverLines: { at: number; m: MetricsLine }[] = [];
  const errorLines: string[] = [];
  let pendingText = '';
  let cleaned = false;
  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    for (const b of bots) b.stop();
    await server?.kill();
    await cluster?.stop().catch(() => {});
    serverLog.end();
  };
  process.once('SIGINT', () => {
    log('Interrumpido: se cierran los bots, el servidor y Postgres');
    cleanup().finally(() => process.exit(2));
  });

  try {
    checkStartLoad('antes de arrancar el servidor');
    cluster = await startTempCluster();
    server = await startOwnServer(
      {
        NODE_OPTIONS: '', // sin el cargador de tsx que hereda este proceso: el servidor corre en node pelado, como en Railway
        DATABASE_URL: cluster.url,
        SEA_BATTLE_METRICS_MS: String(cfg.windowS * 1000)
      },
      (text) => {
        serverLog.write(text);
        const lines = (pendingText + text).split('\n');
        pendingText = lines.pop() ?? '';
        for (const l of lines) {
          if (l.includes('❌')) errorLines.push(l);
          const m = parseMetricsLine(l);
          if (m) serverLines.push({ at: Date.parse(m.at), m });
        }
      }
    );
    log(`Servidor listo en ${server.url} (Postgres temporal, SEA_BATTLE_METRICS_MS=${cfg.windowS * 1000})`);

    // 1. Control: un solo bot quieto en el puerto durante una ventana entera de métricas del servidor
    const W = cfg.windowS * 1000;
    const t0 = performance.now();
    const wallStart = Date.now();
    const wall = (at: number) => wallStart + at;
    const half = Math.floor(cfg.bots / 2);
    for (let i = 0; i < cfg.bots; i++) {
      const id = `stress-${pad(i + 1)}`;
      bots.push(new Bot({ index: i + 1, url: server.url, name: `Bot ${pad(i + 1)}`, userId: `test-${id}`, auth: { testUser: id }, role: i < half ? 'pvp' : 'pve', seed: cfg.seed * 1000 + i, t0 }));
    }
    const controlBot = bots[0];
    controlBot.quiet = true;
    controlBot.start();
    const controlFrom = Date.now();
    const control = await waitFor(() => serverLines.find((l) => l.m.jugadores === 1 && l.at - l.m.s * 1000 >= controlFrom - 50), 2 * W + 10_000);
    if (!control) throw new NotVerified('el servidor no registró la ventana de control con un bot');
    noise.controlEldP99 = control.m.eld_p99_ms;
    log(`Control con un bot quieto en el puerto (${control.m.s} s): event loop p99 ${control.m.eld_p99_ms} ms, máx ${control.m.eld_max_ms} ms (cota del p99: ${AC142.controlEldP99Ms})`);
    if (cfg.noiseAbort && noise.controlEldP99 > AC142.controlEldP99Ms) throw new NotVerified(`ruido: el control dio p99 ${noise.controlEldP99} ms > ${AC142.controlEldP99Ms}`);
    checkStartLoad('antes de los bots');

    // 2. Los demás bots
    controlBot.quiet = false;
    for (const b of bots.slice(1)) {
      b.start();
      await sleep(JOIN_STAGGER_MS);
    }
    const joinDeadline = performance.now() + JOIN_TIMEOUT_MS;
    while (bots.some((b) => !b.joined) && performance.now() < joinDeadline) await sleep(100);
    if (bots.some((b) => !b.joined)) throw new NotVerified(`solo ${bots.filter((b) => b.joined).length} de ${bots.length} bots entraron en ${JOIN_TIMEOUT_MS / 1000} s`);
    const joinedWall = Date.now();
    log(`${bots.length} bots dentro (${bots.filter((b) => b.role === 'pvp').length} PvP, ${bots.filter((b) => b.role === 'pve').length} PvE); calentamiento`);

    // 3. Medida: empieza en la primera línea del servidor tras el calentamiento
    const startLine = await waitFor(() => serverLines.find((l) => l.m.jugadores > 0 && l.at >= joinedWall + cfg.warmupS * 1000), cfg.warmupS * 1000 + 2 * W + 10_000);
    if (!startLine) throw new NotVerified('el servidor no registró métricas tras el calentamiento');
    const measureStart = startLine.at;
    const measureEnd = measureStart + cfg.minutes * W;
    for (const b of bots) b.armStops();
    log(`Medida desde ${new Date(measureStart).toISOString()} (${((measureStart - joinedWall) / 1000).toFixed(0)} s de calentamiento)`);

    let roleSwap = false;
    const client21 = { tried: false, full: false, entered: false };
    const swapAt = measureStart + Math.floor(cfg.minutes / 2) * W;
    const swapTimer = setTimeout(() => {
      for (const b of bots) b.setRole(b.role === 'pvp' ? 'pve' : 'pvp');
      roleSwap = true;
      log(`Intercambio de roles (${new Date().toISOString()})`);
      if (cfg.bots === MAX_PLAYERS) tryClient21(server!.url).then((r) => Object.assign(client21, r, { tried: true }));
    }, Math.max(0, swapAt - Date.now()));

    // Una línea por minuto con cada métrica, a medida que el servidor registra las suyas
    let harnessCpu = process.cpuUsage();
    let logged = 0;
    const minutesData: { server: MetricsLine; load: number; harnessCpuPct: number }[] = [];
    const deadline = measureEnd + W + 15_000;
    while (logged < cfg.minutes && Date.now() < deadline) {
      const lines = serverLines.filter((l) => l.at > measureStart + 500 && l.at <= measureEnd + 500);
      while (logged < lines.length && logged < cfg.minutes) {
        const cpu = process.cpuUsage(harnessCpu);
        harnessCpu = process.cpuUsage();
        const load = load1();
        noise.minuteLoads.push(load);
        minutesData.push({ server: lines[logged].m, load, harnessCpuPct: ((cpu.user + cpu.system) / 1000 / W) * 100 });
        noteUptime(`minuto ${logged + 1}`);
        log(minuteLine(logged, minutesData[logged], bots, measureStart, W, wall));
        logged++;
      }
      await sleep(250);
    }
    clearTimeout(swapTimer);

    // 4. Al puerto, desconexión y comparación de la BD con el último frame
    for (const b of bots) b.homing = true;
    const homeDeadline = performance.now() + HOME_TIMEOUT_MS;
    while (bots.some((b) => !b.home && !b.me?.death) && performance.now() < homeDeadline) await sleep(250);
    const lastMe = new Map<string, PlayerView | null>(bots.map((b) => [b.userId, b.me && { ...b.me }]));
    for (const b of bots) b.stop();
    await sleep(SETTLE_AFTER_STOP_MS);
    const progress = await compareProgress(cluster.url, lastMe);
    log(`Progreso guardado: ${progress.matched} de ${progress.total} filas iguales al último frame${progress.mismatches.length ? ` (${progress.mismatches.join('; ')})` : ''}`);
    await sleep(500);
    await cleanup();

    const result = analyze({ cfg, official, sha, bots, minutesData, measureStart, measureEnd, W, wall, noise, uptimes, errorLines, progress, roleSwap, client21 });
    fs.writeFileSync(path.join(outDir, 'stress.json'), JSON.stringify(result, null, 1));
    fs.writeFileSync(path.join(outDir, 'resumen.md'), summaryMarkdown(result));
    fs.writeFileSync(
      path.join(outDir, 'orders.jsonl'),
      bots.flatMap((b, idx) => b.orders.map((o) => JSON.stringify({ bot: idx + 1, ...o, wall: new Date(wall(o.at)).toISOString(), latencyMs: o.latencyMs === undefined ? undefined : r1(o.latencyMs) }))).join('\n') + '\n'
    );
    log('');
    log(summaryMarkdown(result));
    log(`Artefactos: ${path.relative(ROOT, outDir)}/ (stress.json, resumen.md, orders.jsonl, server.log, run.log)`);
    return result.verdict === 'APROBADO' ? 0 : result.verdict === 'RECHAZADO' ? 1 : 2;
  } catch (err) {
    await cleanup();
    const notVerified = err instanceof NotVerified;
    log(`${notVerified ? 'NO VERIFICADO' : 'ERROR'}: ${(err as Error).message}`);
    fs.writeFileSync(path.join(outDir, 'stress.json'), JSON.stringify({ verdict: 'NO VERIFICADO', reason: (err as Error).message, config: cfg, sha, noise, uptimes }, null, 1));
    log(`Artefactos: ${path.relative(ROOT, outDir)}/`);
    return 2;
  } finally {
    runLog.end();
  }
}

async function waitFor<T>(get: () => T | undefined, timeoutMs: number): Promise<T | undefined> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = get();
    if (v !== undefined || Date.now() > end) return v;
    await sleep(200);
  }
}

// Cliente 21 (AC-12): con los 20 dentro, intenta entrar y debe recibir «Servidor lleno»
async function tryClient21(url: string): Promise<{ full: boolean; entered: boolean }> {
  const c = ioClient(url, { transports: ['websocket'], reconnection: false, auth: { testUser: 'stress-21' } });
  try {
    return await new Promise((resolve) => {
      const timer = setTimeout(() => resolve({ full: false, entered: false }), 5000);
      c.on('connect', () => c.emit(C2S.join, { name: 'Bot 21' }));
      c.on(S2C.full, () => {
        clearTimeout(timer);
        resolve({ full: true, entered: false });
      });
      c.on(S2C.welcome, () => {
        clearTimeout(timer);
        resolve({ full: false, entered: true });
      });
    });
  } finally {
    c.disconnect();
  }
}

async function compareProgress(url: string, lastMe: Map<string, PlayerView | null>) {
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rows } = await db.query('SELECT user_id, state FROM player_progress WHERE user_id = ANY($1)', [[...lastMe.keys()]]);
    const byUser = new Map(rows.map((r) => [r.user_id as string, parseProgress(r.state)?.progress]));
    const mismatches: string[] = [];
    let matched = 0;
    for (const [userId, me] of lastMe) {
      const row = byUser.get(userId);
      const want = me && { gold: me.gold, upgrades: me.upgrades, ownedShips: me.ownedShips, activeShip: me.activeShip, xp: me.xp };
      if (row && want && JSON.stringify(row) === JSON.stringify({ gold: want.gold, upgrades: { ...want.upgrades }, ownedShips: [...want.ownedShips], activeShip: want.activeShip, xp: want.xp })) matched++;
      else mismatches.push(`${userId}: BD ${row ? `${row.gold} de oro, ${row.activeShip}` : 'sin fila'} frente a frame ${want ? `${want.gold} de oro, ${want.activeShip}` : 'sin frame'}`);
    }
    return { matched, total: lastMe.size, mismatches };
  } finally {
    await db.end();
  }
}

// ---- Por minuto ----

function windowOf(bots: Bot[], measureStart: number, W: number, wall: (at: number) => number, w: number) {
  const from = measureStart + w * W;
  const inWin = (at: number) => wall(at) >= from && wall(at) < from + W;
  const orders = bots.flatMap((b) => b.orders).filter((o) => inWin(o.at));
  const responded = orders.filter((o) => o.outcome === 'respondida' || o.outcome === 'rechazada');
  const perBot = bots.map((b) => {
    const frames = b.framesAt.filter(inWin).length;
    const bytes = b.framesAt.reduce((a, at, i) => a + (inWin(at) ? b.frameBytes[i] : 0), 0);
    return { msgs: frames / (W / 1000), kbps: bytes / 1024 / (W / 1000), fired: b.volleysAt.some(inWin) };
  });
  return {
    orders: responded.length,
    latency: summarize(responded.map((o) => o.latencyMs!)),
    lost: orders.filter((o) => o.outcome === 'perdida').length,
    rejected: orders.filter((o) => o.outcome === 'rechazada').length,
    worstMsgs: Math.max(...perBot.map((p) => p.msgs)),
    worstKbps: Math.max(...perBot.map((p) => p.kbps)),
    firing: perBot.filter((p) => p.fired).length,
    pvp: bots.reduce((n, b) => n + b.pvpDeathsAt.filter(inWin).length, 0),
    npc: bots.reduce((n, b) => n + b.npcKillsAt.filter(inWin).length, 0),
    purchases: bots.reduce((n, b) => n + b.purchasesAt.filter(inWin).length, 0)
  };
}

function minuteLine(w: number, d: { server: MetricsLine; load: number; harnessCpuPct: number }, bots: Bot[], measureStart: number, W: number, wall: (at: number) => number): string {
  const s = d.server;
  const b = windowOf(bots, measureStart, W, wall, w);
  return (
    `[min ${pad(w + 1)}] servidor: ticks ${s.ticks} (perdidos ${s.perdidos}) · step p99 ${s.step_p99_ms} ms · loop p99 ${s.eld_p99_ms} / máx ${s.eld_max_ms} ms · ELU ${s.elu} · CPU ${s.cpu_pct} % · heap mín ${s.heap_min_mb} MB · RSS mín ${s.rss_min_mb} MB · heapTotal ${s.heap_total_mb} MB · externa mín ${s.external_min_mb} MB` +
    ` | bots: órdenes ${b.orders} (p95 ${b.latency ? r1(b.latency.p95) : '—'}, máx ${b.latency ? r1(b.latency.max) : '—'} ms; perdidas ${b.lost}, rechazadas ${b.rejected}) · peor bot ${r2(b.worstMsgs)} msg/s, ${r2(b.worstKbps)} KB/s · disparan ${b.firing}/${bots.length} · hundidos PvP ${b.pvp}, NPC ${b.npc} · compras ${b.purchases}` +
    ` | carga ${d.load.toFixed(2)} · CPU de los bots ${d.harnessCpuPct.toFixed(1)} %`
  );
}

// ---- Análisis ----

interface AnalyzeInput {
  cfg: Config;
  official: boolean;
  sha: string;
  bots: Bot[];
  minutesData: { server: MetricsLine; load: number; harnessCpuPct: number }[];
  measureStart: number;
  measureEnd: number;
  W: number;
  wall: (at: number) => number;
  noise: Measured['noise'];
  uptimes: { when: string; uptime: string }[];
  errorLines: string[];
  progress: { matched: number; total: number; mismatches: string[] };
  roleSwap: boolean;
  client21: { tried: boolean; full: boolean; entered: boolean };
}

type Result = ReturnType<typeof analyze>;

function analyze(i: AnalyzeInput) {
  const { bots, measureStart, measureEnd, W, wall } = i;
  const inRun = (o: OrderRecord) => wall(o.at) >= measureStart && wall(o.at) < measureEnd;
  const orders = bots.flatMap((b) => b.orders).filter(inRun);
  const responded = orders.filter((o) => o.outcome === 'respondida' || o.outcome === 'rechazada');
  const response = summarize(responded.map((o) => o.latencyMs!));
  const seconds = (measureEnd - measureStart) / 1000;
  const n = i.cfg.minutes;
  const perBot = bots.map((b) => {
    const at = b.framesAt.map(wall);
    const frames = bucket(at, measureStart, W, n);
    const bytes = bucket(at, measureStart, W, n, b.frameBytes);
    const volleys = bucket(b.volleysAt.map(wall), measureStart, W, n);
    const own = b.orders.filter(inRun);
    const kinds = ['attack', 'repair', 'respawn', 'buy', 'moveTo'] as const;
    return {
      bot: b.name,
      finalRole: b.role,
      joinMs: b.joinMs === null ? null : r1(b.joinMs),
      messagesPerSecond: r2(frames.reduce((a, x) => a + x, 0) / seconds),
      kbPerSecond: r2(bytes.reduce((a, x) => a + x, 0) / 1024 / seconds),
      worstMinuteMessagesPerSecond: r2(Math.max(...frames) / (W / 1000)),
      worstMinuteKbPerSecond: r2(Math.max(...bytes) / 1024 / (W / 1000)),
      firingMinutes: volleys.filter((v) => v > 0).length,
      ordersPerSecond: r2(b.sentAt.map(wall).filter((t) => t >= measureStart && t < measureEnd).length / seconds),
      overBucket: b.overBucket,
      measured: Object.fromEntries(
        kinds.map((k) => {
          const list = own.filter((o) => o.kind === k);
          const c = (x: OrderRecord['outcome']) => list.filter((o) => o.outcome === x).length;
          return [k, { respondida: c('respondida'), rechazada: c('rechazada'), perdida: c('perdida'), anulada: c('anulada'), excedeCubeta: c('excede-cubeta') }];
        })
      ),
      ruleRejections: b.ruleRejections,
      pvpDeaths: b.pvpDeathsAt.map(wall).filter((t) => t >= measureStart && t < measureEnd).length,
      npcKills: b.npcKillsAt.map(wall).filter((t) => t >= measureStart && t < measureEnd).length,
      purchases: b.purchasesAt.map(wall).filter((t) => t >= measureStart && t < measureEnd).length,
      disconnects: b.disconnects.map((d) => ({ at: new Date(wall(d.at)).toISOString(), reason: d.reason })),
      unsavedFrames: b.unsavedAt.length,
      connectErrors: b.connectErrors,
      gold: b.me?.gold ?? null
    };
  });
  const minutes: ServerMinute[] = i.minutesData.map((d) => ({
    lostTicks: d.server.perdidos,
    eldP99: d.server.eld_p99_ms,
    eldMax: d.server.eld_max_ms,
    stepP99: d.server.step_p99_ms,
    elu: d.server.elu,
    heapMinMb: d.server.heap_min_mb,
    rssMinMb: d.server.rss_min_mb,
    heapTotalMb: d.server.heap_total_mb,
    externalMinMb: d.server.external_min_mb,
    cpuPct: d.server.cpu_pct
  }));
  const measured: Measured = {
    noise: i.noise,
    response: response && { n: response.n, p95: response.p95, max: response.max },
    lostOrders: orders.filter((o) => o.outcome === 'perdida').length,
    disconnects: perBot.reduce((a, b) => a + b.disconnects.length, 0),
    client21: { tried: i.client21.tried, full: i.client21.full },
    minutes,
    messagesPerSecond: Math.max(...perBot.map((b) => b.messagesPerSecond)),
    kbPerSecond: Math.max(...perBot.map((b) => b.kbPerSecond)),
    errorLines: i.errorLines.length,
    unsavedFrames: perBot.reduce((a, b) => a + b.unsavedFrames, 0),
    progress: { matched: i.progress.matched, total: i.progress.total },
    load: {
      pvpSinkings: perBot.reduce((a, b) => a + b.pvpDeaths, 0),
      npcSinkings: perBot.reduce((a, b) => a + b.npcKills, 0),
      purchases: perBot.reduce((a, b) => a + b.purchases, 0),
      minFiringMinutes: Math.min(...perBot.map((b) => b.firingMinutes)),
      roleSwap: i.roleSwap
    }
  };
  const ev = evaluate(measured, AC142);
  let verdict = ev.verdict;
  let reason = ev.reason;
  if (!i.official && verdict !== 'RECHAZADO') {
    verdict = 'NO VERIFICADO';
    reason = `corrida corta, no es la del AC${reason ? ` (${reason})` : ''}`;
  }
  const botMinutes = (bots.length * seconds) / 60;
  return {
    version: 2,
    ac: 'AC-142',
    startedAt: new Date(measureStart).toISOString(),
    sha: i.sha,
    config: i.cfg,
    official: i.official,
    environment: { node: process.version, platform: `${os.platform()} ${os.release()}`, cpu: os.cpus()[0]?.model ?? '?', cpus: os.cpus().length, memGb: r1(os.totalmem() / 2 ** 30) },
    verdict,
    reason,
    noise: ev.noise,
    checks: ev.checks,
    load: ev.load,
    measured: { ...measured, response: roundSummary(response) },
    // Ritmos por bot y minuto, para extrapolar los mínimos de carga desde una corrida corta
    rates: {
      pvpSinkingsPerBotMinute: r2(measured.load.pvpSinkings / botMinutes),
      npcSinkingsPerBotMinute: r2(measured.load.npcSinkings / botMinutes),
      purchasesPerBotMinute: r2(measured.load.purchases / botMinutes),
      ordersPerBotSecond: r2(perBot.reduce((a, b) => a + b.ordersPerSecond, 0) / bots.length),
      maxOrdersPerBotSecond: Math.max(...perBot.map((b) => b.ordersPerSecond))
    },
    // Anuladas (O1): el servidor aceptó el attack y una regla lo terminó en el tick siguiente, sin aviso (O-26); van aparte,
    // con su motivo, y no entran ni en la respuesta ni en las perdidas
    cancelled: {
      total: orders.filter((o) => o.outcome === 'anulada').length,
      reasons: orders.filter((o) => o.outcome === 'anulada').reduce<Record<string, number>>((acc, o) => ({ ...acc, [o.reason ?? '?']: (acc[o.reason ?? '?'] ?? 0) + 1 }), {})
    },
    uptimes: i.uptimes,
    errorLines: i.errorLines.slice(0, 50),
    progressMismatches: i.progress.mismatches,
    client21: i.client21,
    perMinute: i.minutesData.map((d, w) => {
      const b = windowOf(bots, measureStart, W, wall, w);
      return {
        minute: w + 1,
        server: d.server,
        load1: r2(d.load),
        harnessCpuPct: r1(d.harnessCpuPct),
        bots: { ...b, latency: roundSummary(b.latency), worstMsgs: r2(b.worstMsgs), worstKbps: r2(b.worstKbps) }
      };
    }),
    bots: perBot
  };
}

function summaryMarkdown(r: Result): string {
  const fmt = (s: Summary | null | undefined) => (s ? `p50 ${s.p50} · p95 ${s.p95} · p99 ${s.p99} · máx ${s.max} ms (n ${s.n})` : '—');
  const row = (c: { label: string; value: number; op: string; limit: number; pass: boolean }) => `| ${c.label} | ${c.value} | ${c.op} ${c.limit} | ${c.pass ? 'ok' : 'FUERA'} |`;
  const lines = [
    `# Estrés del servidor (AC-142) — ${r.verdict}`,
    '',
    `${r.startedAt} · SHA ${r.sha} · node ${r.environment.node} · ${r.config.bots} bots · ${r.config.minutes} × ${r.config.windowS} s${r.official ? '' : ' · corrida corta'}`,
    r.reason ? `Motivo: ${r.reason}` : '',
    '',
    '## Ruido de la máquina',
    '',
    '| Criterio | Valor | Cota | |',
    '|---|---|---|---|',
    ...r.noise.map(row),
    '',
    '## Cotas',
    '',
    '| Criterio | Valor | Cota | |',
    '|---|---|---|---|',
    ...r.checks.map(row),
    '',
    `Respuesta a una orden: ${fmt(r.measured.response)}. Cliente 21: ${r.client21.tried ? (r.client21.full ? '«Servidor lleno»' : r.client21.entered ? 'ENTRÓ' : 'sin respuesta') : 'no se intentó'}.`,
    `Anuladas (no cuentan en la respuesta ni como perdidas): ${r.cancelled.total}${r.cancelled.total ? ` (${Object.entries(r.cancelled.reasons).map(([k, n]) => `${k}: ${n}`).join(' · ')})` : ''}.`,
    '',
    '## Carga (el «dado»)',
    '',
    '| Criterio | Valor | Mínimo | |',
    '|---|---|---|---|',
    ...r.load.map(row),
    '',
    `Ritmos por bot y minuto: hundimientos PvP ${r.rates.pvpSinkingsPerBotMinute}, de NPC ${r.rates.npcSinkingsPerBotMinute}, compras ${r.rates.purchasesPerBotMinute}; órdenes por bot y segundo ${r.rates.ordersPerBotSecond} (el que más, ${r.rates.maxOrdersPerBotSecond}).`,
    '',
    '## Por minuto',
    '',
    '| Min | Ticks (perdidos) | step p99 | loop p99 / máx | ELU | CPU % | heap mín | RSS mín | heapTotal | externa mín | Órdenes | p95 / máx | Perdidas | Peor msg/s | Peor KB/s | Disparan | PvP | NPC | Compras | Carga |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
    ...r.perMinute.map(
      (m) =>
        `| ${m.minute} | ${m.server.ticks} (${m.server.perdidos}) | ${m.server.step_p99_ms} | ${m.server.eld_p99_ms} / ${m.server.eld_max_ms} | ${m.server.elu} | ${m.server.cpu_pct} | ${m.server.heap_min_mb} | ${m.server.rss_min_mb} | ${m.server.heap_total_mb} | ${m.server.external_min_mb} | ${m.bots.orders} | ${m.bots.latency ? `${m.bots.latency.p95} / ${m.bots.latency.max}` : '—'} | ${m.bots.lost} | ${m.bots.worstMsgs} | ${m.bots.worstKbps} | ${m.bots.firing} | ${m.bots.pvp} | ${m.bots.npc} | ${m.bots.purchases} | ${m.load1} |`
    ),
    '',
    '## Por bot',
    '',
    '| Bot | Rol final | msg/s | KB/s | Min. con disparos | Hundido por jugador | NPC hundidos | Compras | Excede cubeta | Desc. | Oro |',
    '|---|---|---|---|---|---|---|---|---|---|---|',
    ...r.bots.map((b) => `| ${b.bot} | ${b.finalRole} | ${b.messagesPerSecond} | ${b.kbPerSecond} | ${b.firingMinutes} | ${b.pvpDeaths} | ${b.npcKills} | ${b.purchases} | ${b.overBucket} | ${b.disconnects.length} | ${b.gold ?? '—'} |`)
  ];
  return lines.filter((l, idx) => l !== '' || lines[idx - 1] !== '').join('\n') + '\n';
}

main().then(
  (code) => process.exit(code),
  (err) => {
    console.error(err);
    process.exit(2);
  }
);
