// AC-126 (DT-03): sondeo de "Salir" con fetch simulado y reloj falso. Los casos (a)–(d) del AC más la respuesta lenta
// pero válida; en todos, al terminar no queda ninguna petición pendiente.
import { EXIT_PROBE_EVERY_MS, EXIT_PROBE_MAX, EXIT_PROBE_MS, probeServer, probeServerOnce } from '../exit-probe';

type Mode = (at: number) => 'refused' | 'hung' | { okAfter: number };

interface Call {
  at: number;
  signal: AbortSignal;
  settled: boolean; // respondida o rechazada (también al abortarse)
}

// Servidor simulado: según el instante de cada petición la rechaza, la deja colgada (hasta que se aborte) o responde
// ok tras okAfter ms
function fakeServer(mode: Mode) {
  const calls: Call[] = [];
  const fetchFn = ((_url: string, init: RequestInit) => {
    const at = Date.now();
    const signal = init.signal!;
    const call: Call = { at, signal, settled: false };
    calls.push(call);
    const m = mode(at);
    return new Promise<Response>((resolve, reject) => {
      const settle = (fn: () => void) => {
        if (call.settled) return;
        call.settled = true;
        fn();
      };
      signal.addEventListener('abort', () => settle(() => reject(new DOMException('aborted', 'AbortError'))));
      if (m === 'refused') settle(() => reject(new TypeError('Failed to fetch')));
      else if (m !== 'hung') setTimeout(() => settle(() => resolve({ ok: true } as Response)), m.okAfter);
    });
  }) as unknown as typeof fetch;
  const pending = () => calls.filter((c) => !c.settled).length;
  return { fetchFn, calls, pending };
}

async function run(mode: Mode) {
  const server = fakeServer(mode);
  const t0 = Date.now();
  let result: boolean | undefined;
  let at = -1;
  void probeServer('/healthz', server.fetchFn).then((ok) => {
    result = ok;
    at = Date.now() - t0;
  });
  await jest.advanceTimersByTimeAsync(EXIT_PROBE_MS + 500);
  const starts = server.calls.map((c) => c.at - t0);
  const gaps = starts.slice(1).map((s, i) => s - starts[i]);
  return { result, at, starts, gaps, calls: server.calls, pending: server.pending };
}

beforeEach(() => jest.useFakeTimers({ now: 1_000_000 }));
afterEach(() => jest.useRealTimers());

describe('AC-126: sondeo al pulsar Salir', () => {
  test('(a) servidor parado: 10 peticiones rechazadas cada 200 ms y false a los 2 s, sin nada pendiente', async () => {
    const r = await run(() => 'refused');
    expect(r.result).toBe(false);
    expect(r.at).toBe(EXIT_PROBE_MS);
    expect(r.calls).toHaveLength(EXIT_PROBE_MAX);
    expect(Math.max(...r.gaps)).toBeLessThanOrEqual(EXIT_PROBE_EVERY_MS);
    expect(r.pending()).toBe(0);
  });

  test('(b) servidor que vuelve 1 s después del clic: true con la primera petición posterior', async () => {
    const r = await run((at) => (at - 1_000_000 < 1000 ? 'refused' : { okAfter: 5 }));
    expect(r.result).toBe(true);
    expect(r.at).toBeLessThanOrEqual(1000 + EXIT_PROBE_EVERY_MS + 5);
    expect(r.calls.length).toBeLessThanOrEqual(EXIT_PROBE_MAX);
    expect(r.pending()).toBe(0);
  });

  test('(c) acepta y no responde: ≥ 9 peticiones con huecos ≤ 250 ms aunque ninguna conteste, false a los 2 s y 0 pendientes', async () => {
    const r = await run(() => 'hung');
    expect(r.result).toBe(false);
    expect(r.at).toBe(EXIT_PROBE_MS);
    expect(r.calls.length).toBeGreaterThanOrEqual(9);
    expect(r.calls.length).toBeLessThanOrEqual(EXIT_PROBE_MAX);
    expect(Math.max(...r.gaps)).toBeLessThanOrEqual(250);
    expect(r.pending()).toBe(0);
  });

  test('(d) colgado que vuelve a responder a los 800 ms: true en ≤ 1,5 s y las colgadas se abortan', async () => {
    const r = await run((at) => (at - 1_000_000 < 800 ? 'hung' : { okAfter: 20 }));
    expect(r.result).toBe(true);
    expect(r.at).toBeLessThanOrEqual(1500);
    expect(r.pending()).toBe(0);
  });

  test('una respuesta lenta pero válida no se corta: la 1.ª petición contesta a los 1,7 s y gana', async () => {
    const r = await run((at) => (at === 1_000_000 ? { okAfter: 1700 } : 'hung'));
    expect(r.result).toBe(true);
    expect(r.at).toBe(1700);
    expect(r.pending()).toBe(0);
  });

  test('H-16: 3 clics seguidos en Salir reutilizan el sondeo en curso (≤ 10 peticiones); terminado, otro clic vuelve a sondear', async () => {
    const server = fakeServer(() => 'refused');
    const t0 = Date.now();
    const first = probeServerOnce('/healthz', server.fetchFn);
    await jest.advanceTimersByTimeAsync(120);
    const second = probeServerOnce('/healthz', server.fetchFn);
    await jest.advanceTimersByTimeAsync(120);
    const third = probeServerOnce('/healthz', server.fetchFn);
    expect(second).toBe(first);
    expect(third).toBe(first);
    await jest.advanceTimersByTimeAsync(EXIT_PROBE_MS);
    expect(await first).toBe(false);
    expect(server.calls.filter((c) => c.at - t0 <= EXIT_PROBE_MS).length).toBeLessThanOrEqual(EXIT_PROBE_MAX);
    const before = server.calls.length;
    void probeServerOnce('/healthz', server.fetchFn);
    await jest.advanceTimersByTimeAsync(EXIT_PROBE_MS + 100);
    expect(server.calls.length).toBe(before + EXIT_PROBE_MAX);
  });
});
