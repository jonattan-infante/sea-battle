// Medida del propio proceso (AC-142, AC-143): cada 60 s, si hubo jugadores en ese minuto, una línea con su hora (como los
// logs del apagado) que el arnés de estrés lee del log local o del de Railway. Sin jugadores no se registra nada.
//   📈 Métricas <iso> s=60.0 jugadores=20 ticks=1200 perdidos=0 step_p99_ms=0.41 eld_p99_ms=2.10 eld_max_ms=8.30
//      elu=0.081 cpu_pct=9.5 heap_min_mb=62.1 rss_min_mb=150.2 rss_mb=151.0 heap_total_mb=99.0 external_min_mb=4.3
// - ticks: pasos ejecutados; perdidos: el tiempo que descarta el tope de 5 ticks del bucle (game-server.ts), en ticks.
// - step_p99_ms: p99 de lo que dura step() (el presupuesto de 4 ms de AC-03, ahora en tiempo real).
// - eld_*: retraso del event loop (monitorEventLoopDelay, resolución de 10 ms). Cada muestra incluye la resolución («every
//   sample includes the `resolution`», nodejs.org/api/perf_hooks.html; en reposo ≈ 11 ms en Node 24.21.0), así que el
//   retraso es la muestra − 10 ms (AC-142).
// - elu: utilización del event loop (performance.eventLoopUtilization) en la ventana; cpu_pct: % de un núcleo.
// - heap_min_mb y rss_min_mb: el mínimo de las muestras de cada segundo (tras cada GC se acerca a lo vivo); rss_mb: la última.
// - heap_total_mb: lo que V8 tiene comprometido para su heap, en la última muestra. external_min_mb: el mínimo de la memoria
//   externa (process.memoryUsage().external, que incluye todos los Buffer), donde vive una fuga de buffers: AC-142 pone la
//   cota de memoria aquí. El RSS y heapTotal van sin cota: V8 duplica su generación joven a los ~10 min (heapTotal +14 MB
//   de una vez, sin fuga) y heapTotal es memoria comprometida, no residente (rss − heapTotal baja con una fuga externa).
// La línea solo lleva números: nunca ids ni nombres de jugadores. Coste: un temporizador de libuv a 100 Hz (el monitor, 0,19 %
// de un núcleo), dos performance.now() por tick (~17 ns cada uno) y una muestra de memoria por segundo; AC-142 fija que el
// p99 del tick no suba más de 0,2 ms (server/__tests__/metrics.test.ts).
import { EventLoopUtilization, monitorEventLoopDelay, performance } from 'perf_hooks';

export const ELD_RESOLUTION_MS = 10;
export const METRICS_INTERVAL_MS = 60_000;
const MEMORY_SAMPLE_MS = 1000;
const MB = 2 ** 20;

export interface MetricsSources {
  now: () => number; // ms de pared, para la hora de la línea y la duración de la ventana
  eld: { enable(): boolean; disable(): boolean; reset(): void; percentile(p: number): number; readonly max: number }; // ns
  elu: (prev?: EventLoopUtilization) => EventLoopUtilization;
  cpu: (prev?: NodeJS.CpuUsage) => NodeJS.CpuUsage;
  memory: () => { heapUsed: number; heapTotal: number; rss: number; external: number };
}

export interface ServerMetrics {
  loop(executed: number, droppedSeconds: number): void; // una pasada del bucle: ticks ejecutados y tiempo descartado
  step(ms: number): void; // lo que duró un step()
  sampleMemory(): void;
  flush(): string | null; // cierra la ventana: la línea registrada, o null si no hubo jugadores
  stop(): void;
}

export interface MetricsOptions {
  players: () => number;
  tickRate: number;
  log: (msg: string) => void;
  intervalMs?: number;
  sources?: MetricsSources;
  autoStart?: boolean; // false: los tests llaman a sampleMemory() y flush()
}

function defaultSources(): MetricsSources {
  return {
    now: Date.now,
    eld: monitorEventLoopDelay({ resolution: ELD_RESOLUTION_MS }),
    elu: (prev) => performance.eventLoopUtilization(prev),
    cpu: (prev) => process.cpuUsage(prev),
    memory: () => process.memoryUsage()
  };
}

// Rango más cercano, como el arnés: cada cifra es una medida real
function p99(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length, Math.max(1, Math.ceil(0.99 * sorted.length))) - 1];
}

export function createServerMetrics(options: MetricsOptions): ServerMetrics {
  const src = options.sources ?? defaultSources();
  const delay = (ns: number) => Math.max(0, ns / 1e6 - ELD_RESOLUTION_MS);
  src.eld.enable();

  let start = src.now();
  let prevElu = src.elu();
  let prevCpu = src.cpu();
  let executed = 0;
  let dropped = 0;
  let steps: number[] = [];
  let maxPlayers = 0;
  let heapMin = Infinity;
  let rssMin = Infinity;
  let rssLast = 0;
  let heapTotalLast = 0;
  let externalMin = Infinity;

  const metrics: ServerMetrics = {
    loop(n, droppedSeconds) {
      executed += n;
      dropped += droppedSeconds;
    },
    step(ms) {
      steps.push(ms);
    },
    sampleMemory() {
      maxPlayers = Math.max(maxPlayers, options.players());
      const mem = src.memory();
      heapMin = Math.min(heapMin, mem.heapUsed);
      rssMin = Math.min(rssMin, mem.rss);
      rssLast = mem.rss;
      heapTotalLast = mem.heapTotal;
      externalMin = Math.min(externalMin, mem.external);
    },
    flush() {
      metrics.sampleMemory();
      const now = src.now();
      const elu = src.elu(prevElu);
      const cpu = src.cpu(prevCpu);
      const seconds = (now - start) / 1000;
      const line =
        maxPlayers === 0
          ? null
          : [
              `📈 Métricas ${new Date(now).toISOString()}`,
              `s=${seconds.toFixed(1)}`,
              `jugadores=${maxPlayers}`,
              `ticks=${executed}`,
              `perdidos=${Math.round(dropped * options.tickRate * 100) / 100}`,
              `step_p99_ms=${p99(steps).toFixed(2)}`,
              `eld_p99_ms=${delay(src.eld.percentile(99)).toFixed(2)}`,
              `eld_max_ms=${delay(src.eld.max).toFixed(2)}`,
              `elu=${elu.utilization.toFixed(3)}`,
              `cpu_pct=${seconds > 0 ? (((cpu.user + cpu.system) / 1000 / (seconds * 1000)) * 100).toFixed(1) : '0.0'}`,
              `heap_min_mb=${(heapMin / MB).toFixed(1)}`,
              `rss_min_mb=${(rssMin / MB).toFixed(1)}`,
              `rss_mb=${(rssLast / MB).toFixed(1)}`,
              `heap_total_mb=${(heapTotalLast / MB).toFixed(1)}`,
              `external_min_mb=${(externalMin / MB).toFixed(1)}`
            ].join(' ');
      if (line) options.log(line);
      start = now;
      prevElu = src.elu();
      prevCpu = src.cpu();
      src.eld.reset();
      executed = 0;
      dropped = 0;
      steps = [];
      maxPlayers = 0;
      heapMin = Infinity;
      rssMin = Infinity;
      externalMin = Infinity;
      return line;
    },
    stop() {
      clearInterval(flushTimer);
      clearInterval(memoryTimer);
      src.eld.disable();
    }
  };

  let flushTimer: ReturnType<typeof setInterval> | undefined;
  let memoryTimer: ReturnType<typeof setInterval> | undefined;
  if (options.autoStart !== false) {
    flushTimer = setInterval(() => metrics.flush(), options.intervalMs ?? METRICS_INTERVAL_MS);
    memoryTimer = setInterval(() => metrics.sampleMemory(), Math.min(MEMORY_SAMPLE_MS, options.intervalMs ?? METRICS_INTERVAL_MS));
    flushTimer.unref?.();
    memoryTimer.unref?.();
  }
  return metrics;
}

export type MetricsLine = { at: string } & Record<
  | 's'
  | 'jugadores'
  | 'ticks'
  | 'perdidos'
  | 'step_p99_ms'
  | 'eld_p99_ms'
  | 'eld_max_ms'
  | 'elu'
  | 'cpu_pct'
  | 'heap_min_mb'
  | 'rss_min_mb'
  | 'rss_mb'
  | 'heap_total_mb'
  | 'external_min_mb',
  number
>;

// Lee una línea de métricas de cualquier log (local o de Railway, con o sin prefijo); null si la línea es otra cosa. Lee
// cualquier campo `clave=número`, así que una línea anterior a heap_total_mb y external_min_mb sigue leyéndose sin ellos
export function parseMetricsLine(line: string): MetricsLine | null {
  const m = /📈 Métricas (\S+)((?: [a-z_0-9]+=[-\d.]+)*)/.exec(line);
  if (!m) return null;
  const out: Record<string, number | string> = { at: m[1] };
  for (const pair of m[2].trim().split(' ').filter(Boolean)) {
    const [k, v] = pair.split('=');
    out[k] = Number(v);
  }
  return out as MetricsLine;
}
