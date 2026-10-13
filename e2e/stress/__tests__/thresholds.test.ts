// AC-142: cotas, ruido de la máquina y carga mínima. Reglas del veredicto:
// - ruido (carga > 6 al empezar o > 10 en un minuto, o control con event loop p99 > 5 ms): NO VERIFICADO, nunca RECHAZADO;
// - con el ruido dentro, una cota roja es RECHAZADO aunque falte carga (menos carga solo puede esconder un fallo);
// - todo en verde con la carga incompleta: NO VERIFICADO; todo en verde con la carga completa: APROBADO
import { AC142, evaluate, Measured, ServerMinute } from '../thresholds';

const minute = (o: Partial<ServerMinute> = {}): ServerMinute => ({
  lostTicks: 0,
  eldP99: 2,
  eldMax: 15,
  stepP99: 0.6,
  elu: 0.12,
  heapMinMb: 60,
  rssMinMb: 150,
  heapTotalMb: 90,
  externalMinMb: 4.5,
  cpuPct: 12,
  ...o
});

const ok = (): Measured => ({
  noise: { startLoad: 3, minuteLoads: Array(10).fill(5), controlEldP99: 1.2 },
  response: { n: 400, p95: 95, max: 140 },
  lostOrders: 0,
  disconnects: 0,
  client21: { tried: true, full: true },
  minutes: Array.from({ length: 10 }, () => minute()),
  messagesPerSecond: 10,
  kbPerSecond: 6,
  errorLines: 0,
  unsavedFrames: 0,
  progress: { matched: 20, total: 20 },
  load: { pvpSinkings: 25, npcSinkings: 60, purchases: 14, minFiringMinutes: 9, roleSwap: true }
});

const failed = (r: ReturnType<typeof evaluate>) => [...r.noise, ...r.checks, ...r.load].filter((c) => !c.pass).map((c) => c.id);

describe('veredicto de AC-142', () => {
  test('todo dentro y la carga completa: APROBADO', () => {
    const r = evaluate(ok(), AC142);
    expect(failed(r)).toEqual([]);
    expect(r.verdict).toBe('APROBADO');
  });

  test.each([
    ['respuesta-p95', (m: Measured) => (m.response = { n: 400, p95: 151, max: 200 })],
    ['respuesta-max', (m: Measured) => (m.response = { n: 400, p95: 100, max: 301 })],
    ['ordenes-perdidas', (m: Measured) => (m.lostOrders = 1)],
    ['desconexiones', (m: Measured) => (m.disconnects = 1)],
    ['cliente-21', (m: Measured) => (m.client21 = { tried: true, full: false })],
    ['ticks-perdidos', (m: Measured) => (m.minutes[3] = minute({ lostTicks: 2 }))],
    ['event-loop-p99', (m: Measured) => (m.minutes[7] = minute({ eldP99: 21 }))],
    ['event-loop-max', (m: Measured) => (m.minutes[0] = minute({ eldMax: 101 }))],
    ['tick-p99', (m: Measured) => (m.minutes[9] = minute({ stepP99: 4.2 }))],
    ['utilizacion', (m: Measured) => (m.minutes[5] = minute({ elu: 0.51 }))],
    ['mensajes-por-segundo', (m: Measured) => (m.messagesPerSecond = 10.01)],
    ['kb-por-segundo', (m: Measured) => (m.kbPerSecond = 12.1)],
    ['heap-crecimiento', (m: Measured) => (m.minutes[0] = minute({ heapMinMb: 39 }))], // 60 − 39 = 21 MB, sin tocar la pendiente 5–10
    ['errores', (m: Measured) => (m.errorLines = 1)],
    ['unsaved', (m: Measured) => (m.unsavedFrames = 3)],
    ['progreso', (m: Measured) => (m.progress = { matched: 19, total: 20 })]
  ])('una cota roja (%s) con la carga dentro de los límites: RECHAZADO', (id, breakIt) => {
    const m = ok();
    breakIt(m);
    const r = evaluate(m, AC142);
    expect(r.verdict).toBe('RECHAZADO');
    expect(failed(r)).toEqual([id]);
  });

  test('pendiente del heap en los minutos 5–10 > 1 MB/min: RECHAZADO', () => {
    const m = ok();
    m.minutes = Array.from({ length: 10 }, (_, i) => minute({ heapMinMb: i < 4 ? 60 : 60 + (i - 3) * 1.5 }));
    const r = evaluate(m, AC142);
    expect(failed(r)).toEqual(['heap-pendiente']);
    expect(r.verdict).toBe('RECHAZADO');
  });

  test('memoria externa que crece más de 10 MB de los minutos 3–5 a los 8–10: RECHAZADO', () => {
    const m = ok();
    m.minutes = Array.from({ length: 10 }, (_, i) => minute({ externalMinMb: 4.5 + Math.max(0, i - 2) * 2.5 })); // 4,5 → 17
    const r = evaluate(m, AC142);
    expect(failed(r)).toEqual(['memoria-externa']);
    expect(r.checks.find((c) => c.id === 'memoria-externa')!.value).toBe(12.5);
  });

  test('crecer justo 10 MB de memoria externa no es rojo (≤)', () => {
    const m = ok();
    m.minutes = Array.from({ length: 10 }, (_, i) => minute({ externalMinMb: i >= 7 ? 14.5 : 4.5 }));
    expect(failed(evaluate(m, AC142))).toEqual([]);
  });

  test('el escalón de V8 (heapTotal y RSS +14 MB en el minuto 8) con la memoria externa plana no es rojo: el RSS no tiene cota', () => {
    const m = ok();
    m.minutes = Array.from({ length: 10 }, (_, i) => minute({ rssMinMb: i >= 7 ? 164 : 150, heapTotalMb: i >= 7 ? 104 : 90 }));
    expect(failed(evaluate(m, AC142))).toEqual([]);
  });

  test('un pico de ~2 min (minutos 8 y 9) no es rojo: el mínimo de la ventana de 3 min lo salta', () => {
    const m = ok();
    m.minutes = Array.from({ length: 10 }, (_, i) => minute({ externalMinMb: i === 7 || i === 8 ? 30 : 4.5 }));
    expect(failed(evaluate(m, AC142))).toEqual([]);
  });

  test('CPU de los minutos 9–10 por encima de 1,2 × la de los minutos 1–2: RECHAZADO', () => {
    const m = ok();
    m.minutes[8] = minute({ cpuPct: 15 });
    m.minutes[9] = minute({ cpuPct: 15 }); // 15 > 12 × 1,2 = 14,4
    expect(failed(evaluate(m, AC142))).toEqual(['cpu-deriva']);
  });

  test('cota roja con la carga incompleta: RECHAZADO igualmente', () => {
    const m = ok();
    m.lostOrders = 2;
    m.load.purchases = 3;
    expect(evaluate(m, AC142).verdict).toBe('RECHAZADO');
  });

  test.each([
    ['carga-pvp', (m: Measured) => (m.load.pvpSinkings = 19)],
    ['carga-npc', (m: Measured) => (m.load.npcSinkings = 39)],
    ['carga-compras', (m: Measured) => (m.load.purchases = 9)],
    ['carga-disparos', (m: Measured) => (m.load.minFiringMinutes = 7)],
    ['carga-roles', (m: Measured) => (m.load.roleSwap = false)],
    ['carga-cliente-21', (m: Measured) => (m.client21 = { tried: false, full: false })]
  ])('todo en verde con la carga incompleta (%s): NO VERIFICADO', (id, breakIt) => {
    const m = ok();
    breakIt(m);
    const r = evaluate(m, AC142);
    expect(r.verdict).toBe('NO VERIFICADO');
    expect(failed(r)).toEqual([id]);
    expect(r.reason).toMatch(/carga insuficiente/);
  });

  test.each([
    ['ruido-arranque', (m: Measured) => (m.noise.startLoad = 6.5)],
    ['ruido-minuto', (m: Measured) => (m.noise.minuteLoads[6] = 10.4)],
    ['ruido-control', (m: Measured) => (m.noise.controlEldP99 = 5.2)]
  ])('ruido de la máquina (%s): NO VERIFICADO aunque haya rojos', (id, breakIt) => {
    const m = ok();
    breakIt(m);
    m.minutes[2] = minute({ eldMax: 250 });
    const r = evaluate(m, AC142);
    expect(r.verdict).toBe('NO VERIFICADO');
    expect(r.reason).toMatch(/ruido/);
    expect(failed(r)).toContain(id);
  });

  test('sin los 10 minutos del servidor: NO VERIFICADO en verde, RECHAZADO con un rojo de lo que sí se mide', () => {
    const short = ok();
    short.minutes = short.minutes.slice(0, 5);
    const r = evaluate(short, AC142);
    expect(r.verdict).toBe('NO VERIFICADO');
    expect(r.reason).toMatch(/5 de 10 minutos/);
    expect(r.checks.map((c) => c.id)).not.toContain('heap-pendiente'); // necesita los minutos 5–10
    short.minutes[2] = minute({ eldMax: 130 });
    expect(evaluate(short, AC142).verdict).toBe('RECHAZADO');
  });

  test('sin órdenes medidas o sin minutos del servidor no hay veredicto', () => {
    const none = ok();
    none.response = null;
    expect(evaluate(none, AC142).verdict).toBe('NO VERIFICADO');
    const empty = ok();
    empty.minutes = [];
    expect(evaluate(empty, AC142).verdict).toBe('NO VERIFICADO');
  });
});
