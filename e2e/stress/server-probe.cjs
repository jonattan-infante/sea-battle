// Sonda del arnés de estrés (fase A): se precarga en el proceso del servidor (`--require`, vía NODE_OPTIONS) y solo
// existe en el arnés. Las cotas de AC-142 salen de las líneas «📈 Métricas» que escribe el propio servidor
// (server/metrics.ts), pero el servidor no registra nada sin jugadores; esta sonda cubre lo que esas líneas no ven:
// - el control de 60 s sin jugadores (AC-142: event loop p99 ≤ 5 ms antes de empezar);
// - el detalle por segundo para diagnosticar un minuto rojo: CPU del proceso (% de un núcleo), memoria y retraso del
//   event loop, en esa ventana y acumulado desde el último cambio de fase.
// El histograma de Node registra el intervalo entero entre muestras (en reposo ≈ resolución + 1 ms), así que se resta la
// resolución, como en server/metrics.ts. Fases: el arnés escribe en STRESS_PROBE_MARK «control», «run» o «end», y cada
// línea lleva la fase en la que se tomó. Una línea por segundo en STRESS_PROBE_OUT con un writeSync (microsegundos).
'use strict';
const fs = require('fs');
const { monitorEventLoopDelay, performance } = require('perf_hooks');

const out = process.env.STRESS_PROBE_OUT;
if (out) {
  const RESOLUTION_MS = 10;
  const fd = fs.openSync(out, 'a');
  const windowEld = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  const phaseEld = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
  windowEld.enable();
  phaseEld.enable();
  const ms = (ns) => Math.max(0, ns / 1e6 - RESOLUTION_MS);
  const mark = process.env.STRESS_PROBE_MARK;
  let phase = 'boot';
  const readPhase = () => {
    let next = phase;
    try {
      next = fs.readFileSync(mark, 'utf8').trim() || phase;
    } catch {
      return; // todavía no existe
    }
    if (next !== phase) phaseEld.reset();
    phase = next;
  };

  let lastCpu = process.cpuUsage();
  let lastAt = performance.now();
  const sample = () => {
    const now = performance.now();
    const cpu = process.cpuUsage(lastCpu);
    const mem = process.memoryUsage();
    const line = {
      t: Date.now(),
      phase,
      cpuPct: ((cpu.user + cpu.system) / 1000 / (now - lastAt)) * 100,
      rssMb: mem.rss / 2 ** 20,
      heapUsedMb: mem.heapUsed / 2 ** 20,
      eld: { p50: ms(windowEld.percentile(50)), p99: ms(windowEld.percentile(99)), max: ms(windowEld.max) },
      eldPhase: { p99: ms(phaseEld.percentile(99)), max: ms(phaseEld.max), n: phaseEld.count }
    };
    lastCpu = process.cpuUsage();
    lastAt = now;
    windowEld.reset();
    fs.writeSync(fd, JSON.stringify(line) + '\n');
    if (mark) readPhase(); // la línea siguiente ya va con la fase nueva
  };
  setInterval(sample, 1000).unref();
}
