// Cotas de AC-142 (docs/game/BACKLOG.md, H-904) y reglas del veredicto:
// 1. Ruido de la máquina (carga de 1 min > 6 al empezar o > 10 en algún minuto medido, o el control de 60 s con un bot
//    quieto en el puerto con el event loop en p99 > 5 ms): NO VERIFICADO, nunca RECHAZADO; la corrida se repite.
// 2. Con el ruido dentro, cualquier cota roja es RECHAZADO, aunque falte carga: menos carga solo puede esconder un fallo.
// 3. Todo en verde pero la carga incompleta (los mínimos del «dado»): NO VERIFICADO por carga insuficiente.
// 4. Todo en verde y la carga completa: APROBADO.
import { slope } from './stats';

export const AC142 = {
  startLoadMax: 6,
  minuteLoadMax: 10,
  controlEldP99Ms: 5,
  responseP95Ms: 150,
  responseMaxMs: 300,
  eldP99Ms: 20,
  eldMaxMs: 100,
  stepP99Ms: 4,
  eluMax: 0.5,
  messagesPerSecond: 10,
  kbPerSecond: 12,
  heapGrowthMb: 20,
  heapSlopeMbPerMin: 1,
  externalGrowthMb: 10, // memoria externa: mínimo de los minutos 8–10 − mínimo de los minutos 3–5 (la tasa de 2 MB/min)
  cpuDriftFactor: 1.2,
  minPvpSinkings: 20,
  minNpcSinkings: 40,
  minPurchases: 10,
  minFiringMinutes: 8,
  minutes: 10
};
export type Bounds = typeof AC142;

// Una línea «📈 Métricas» del servidor (server/metrics.ts) por minuto medido
export interface ServerMinute {
  lostTicks: number;
  eldP99: number;
  eldMax: number;
  stepP99: number;
  elu: number;
  heapMinMb: number;
  rssMinMb: number; // se registra sin cota (AC-142)
  heapTotalMb: number; // ídem
  externalMinMb: number; // process.memoryUsage().external (incluye todos los Buffer), el mínimo del minuto
  cpuPct: number;
}

export interface Measured {
  noise: { startLoad: number; minuteLoads: number[]; controlEldP99: number };
  response: { n: number; p95: number; max: number } | null; // órdenes medidas de los 20 bots
  lostOrders: number;
  disconnects: number;
  client21: { tried: boolean; full: boolean };
  minutes: ServerMinute[];
  messagesPerSecond: number; // el peor bot, de media en los 10 min
  kbPerSecond: number;
  errorLines: number; // líneas ❌ del servidor
  unsavedFrames: number; // frames con unsaved (guardado degradado, AC-132)
  progress: { matched: number; total: number };
  load: { pvpSinkings: number; npcSinkings: number; purchases: number; minFiringMinutes: number; roleSwap: boolean };
}

export interface Check {
  id: string;
  label: string;
  value: number;
  limit: number;
  op: '≤' | '≥' | '=';
  pass: boolean;
}

export type Verdict = 'APROBADO' | 'RECHAZADO' | 'NO VERIFICADO';

const round = (v: number) => Math.round(v * 1000) / 1000;
const le = (id: string, label: string, value: number, limit: number): Check => ({ id, label, value: round(value), limit, op: '≤', pass: value <= limit });
const ge = (id: string, label: string, value: number, limit: number): Check => ({ id, label, value: round(value), limit, op: '≥', pass: value >= limit });
const eq = (id: string, label: string, value: number, limit: number): Check => ({ id, label, value: round(value), limit, op: '=', pass: value === limit });
const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;

export function evaluate(m: Measured, b: Bounds): { verdict: Verdict; reason: string; noise: Check[]; checks: Check[]; load: Check[] } {
  const noise = [
    le('ruido-arranque', 'Carga de 1 min al empezar', m.noise.startLoad, b.startLoadMax),
    le('ruido-minuto', 'Carga de 1 min, peor minuto medido', Math.max(0, ...m.noise.minuteLoads), b.minuteLoadMax),
    le('ruido-control', 'Control con un bot quieto en el puerto: event loop p99 (ms)', m.noise.controlEldP99, b.controlEldP99Ms)
  ];
  const noisy = noise.filter((c) => !c.pass);
  const noisyReason = `ruido de la máquina (${noisy.map((c) => c.id).join(', ')}): la corrida no cuenta y se repite`;
  if (!m.response || m.minutes.length === 0) {
    if (noisy.length) return { verdict: 'NO VERIFICADO', reason: noisyReason, noise, checks: [], load: [] };
    const why = !m.response ? 'sin órdenes medidas' : 'sin minutos del servidor';
    return { verdict: 'NO VERIFICADO', reason: `${why}: no hay con qué evaluar`, noise, checks: [], load: [] };
  }
  // Con menos minutos (corrida corta o cortada) se evalúa lo que se puede: un rojo sigue siendo RECHAZADO
  const ms = m.minutes.slice(0, b.minutes);
  const complete = ms.length === b.minutes;
  const late = ms.slice(4, 10); // minutos 5–10
  // Ventanas de 3 min: su mínimo salta por encima de un pico nativo de ~2 min tras un GC mayor; una fuga no baja
  const external = (from: number, to: number) => Math.min(...ms.slice(from - 1, to).map((x) => x.externalMinMb));
  const checks = [
    le('respuesta-p95', 'Respuesta a una orden, p95 (ms)', m.response.p95, b.responseP95Ms),
    le('respuesta-max', 'Respuesta a una orden, máximo (ms)', m.response.max, b.responseMaxMs),
    eq('ordenes-perdidas', 'Órdenes perdidas (sin reflejo en ≤ 1 s y sin anular)', m.lostOrders, 0),
    eq('desconexiones', 'Desconexiones de los 20 (disconnect, kicked o lleno)', m.disconnects, 0),
    eq('cliente-21', 'El cliente 21 recibe «Servidor lleno» (1 = sí)', m.client21.tried && !m.client21.full ? 0 : 1, 1),
    eq('ticks-perdidos', 'Ticks perdidos en los 10 min', ms.reduce((a, x) => a + x.lostTicks, 0), 0),
    le('event-loop-p99', 'Event loop p99, peor minuto (ms)', Math.max(...ms.map((x) => x.eldP99)), b.eldP99Ms),
    le('event-loop-max', 'Event loop máximo, peor minuto (ms)', Math.max(...ms.map((x) => x.eldMax)), b.eldMaxMs),
    le('tick-p99', 'step() p99, peor minuto (ms)', Math.max(...ms.map((x) => x.stepP99)), b.stepP99Ms),
    le('utilizacion', 'Utilización del event loop, peor minuto', Math.max(...ms.map((x) => x.elu)), b.eluMax),
    le('mensajes-por-segundo', 'Mensajes/s, media del peor bot', m.messagesPerSecond, b.messagesPerSecond),
    le('kb-por-segundo', 'KB/s, media del peor bot', m.kbPerSecond, b.kbPerSecond),
    le('heap-crecimiento', 'Heap mínimo: final − minuto 1 (MB)', ms[ms.length - 1].heapMinMb - ms[0].heapMinMb, b.heapGrowthMb),
    ...(complete
      ? [
          le('heap-pendiente', 'Heap mínimo: pendiente minutos 5–10 (MB/min)', slope(late.map((x) => x.heapMinMb)), b.heapSlopeMbPerMin),
          le('memoria-externa', 'Memoria externa: mínimo de los minutos 8–10 − mínimo de los minutos 3–5 (MB)', external(8, 10) - external(3, 5), b.externalGrowthMb),
          le('cpu-deriva', 'CPU media minutos 9–10 ÷ minutos 1–2', mean([ms[8].cpuPct, ms[9].cpuPct]) / Math.max(1e-9, mean([ms[0].cpuPct, ms[1].cpuPct])), b.cpuDriftFactor)
        ]
      : []),
    eq('errores', 'Líneas ❌ del servidor', m.errorLines, 0),
    eq('unsaved', 'Frames con unsaved (guardado degradado)', m.unsavedFrames, 0),
    eq('progreso', 'Filas de la BD iguales al último frame (faltan)', m.progress.total - m.progress.matched, 0)
  ];
  const load = [
    ge('carga-pvp', 'Hundimientos de jugadores a manos de jugadores', m.load.pvpSinkings, b.minPvpSinkings),
    ge('carga-npc', 'Hundimientos de NPC', m.load.npcSinkings, b.minNpcSinkings),
    ge('carga-compras', 'Compras', m.load.purchases, b.minPurchases),
    ge('carga-disparos', 'Minutos con disparos, el peor bot', m.load.minFiringMinutes, b.minFiringMinutes),
    eq('carga-roles', 'Intercambio de roles a los 5 min (1 = hecho)', m.load.roleSwap ? 1 : 0, 1),
    eq('carga-cliente-21', 'Intento del cliente 21 a los 5 min (1 = hecho)', m.client21.tried ? 1 : 0, 1)
  ];
  const red = checks.filter((c) => !c.pass);
  // Con ruido, las cotas se calculan igual (para diagnosticar), pero la corrida no cuenta
  if (noisy.length) return { verdict: 'NO VERIFICADO', reason: `${noisyReason}${red.length ? `; rojos sin valor: ${red.map((c) => c.id).join(', ')}` : ''}`, noise, checks, load };
  if (red.length) return { verdict: 'RECHAZADO', reason: red.map((c) => c.id).join(', '), noise, checks, load };
  if (!complete) return { verdict: 'NO VERIFICADO', reason: `solo ${ms.length} de ${b.minutes} minutos del servidor, todos en verde`, noise, checks, load };
  const short = load.filter((c) => !c.pass);
  if (short.length) return { verdict: 'NO VERIFICADO', reason: `carga insuficiente (${short.map((c) => c.id).join(', ')}) con todas las cotas en verde`, noise, checks, load };
  return { verdict: 'APROBADO', reason: '', noise, checks, load };
}
