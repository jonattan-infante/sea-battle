// e2e/own-server.ts elige el puerto del servidor propio de los e2e: dentro del rango que deriva de PW_PORT_BASE (cada
// corrida del harness tiene el suyo) y nunca uno que Chrome bloquee con net::ERR_UNSAFE_PORT (el 3659 tumbó AC-99)
import net from 'net';
import { candidatePorts, CHROME_UNSAFE_PORTS, freePort, ownPortRange } from '../../e2e/own-server';

describe('servidor propio de los e2e: rango de puertos', () => {
  test('deriva de PW_PORT_BASE: [base + 500, base + 599]; 3600–3699 con la base por defecto', () => {
    expect(ownPortRange({})).toEqual({ from: 3600, to: 3699 });
    expect(ownPortRange({ PW_PORT_BASE: '3100' })).toEqual({ from: 3600, to: 3699 });
    expect(ownPortRange({ PW_PORT_BASE: '3300' })).toEqual({ from: 3800, to: 3899 });
    expect(ownPortRange({ PW_PORT_BASE: '3500' })).toEqual({ from: 4000, to: 4099 });
  });

  test('PW_OWN_PORT_BASE lo fija directamente, con o sin PW_PORT_BASE', () => {
    expect(ownPortRange({ PW_OWN_PORT_BASE: '5000' })).toEqual({ from: 5000, to: 5099 });
    expect(ownPortRange({ PW_PORT_BASE: '3500', PW_OWN_PORT_BASE: '5000' })).toEqual({ from: 5000, to: 5099 });
  });

  test('un rango no válido falla al momento', () => {
    expect(() => ownPortRange({ PW_PORT_BASE: 'abc' })).toThrow('Rango de puertos propio no válido');
    expect(() => ownPortRange({ PW_OWN_PORT_BASE: '65500' })).toThrow('Rango de puertos propio no válido');
    expect(() => ownPortRange({ PW_OWN_PORT_BASE: '80' })).toThrow('Rango de puertos propio no válido');
  });
});

describe('servidor propio de los e2e: puertos que bloquea Chrome', () => {
  test('los candidatos de cada rango derivado no incluyen ninguno: el 3659 con la base 3100 y el 4045 con la 3500', () => {
    const qa = candidatePorts(3600, 3699);
    expect(qa).not.toContain(3659);
    expect(qa).toHaveLength(99);
    const mine = candidatePorts(4000, 4099);
    expect(mine).not.toContain(4045);
    expect(mine).toHaveLength(99);
  });

  test('en 1–65535, ningún candidato está en la lista', () => {
    const all = candidatePorts(1, 65535);
    expect(all.filter((p) => CHROME_UNSAFE_PORTS.has(p))).toEqual([]);
    expect(all).toHaveLength(65535 - CHROME_UNSAFE_PORTS.size);
  });
});

describe('servidor propio de los e2e: freePort', () => {
  const env = { ...process.env };
  afterEach(() => {
    jest.restoreAllMocks();
    process.env = { ...env };
  });

  test('sin argumentos usa el rango derivado y, desde cualquier punto de partida, nunca devuelve un puerto bloqueado', async () => {
    // Base 9580 → 10080–10179: empieza en un puerto bloqueado (10080) y no lo usa ninguna corrida del harness
    process.env.PW_PORT_BASE = '9580';
    delete process.env.PW_OWN_PORT_BASE;
    const seen = new Set<number>();
    // Cada valor de Math.random arranca el recorrido en un candidato distinto
    for (let i = 0; i < 99; i++) {
      jest.spyOn(Math, 'random').mockReturnValue(i / 99);
      const port = await freePort();
      expect(port).toBeGreaterThanOrEqual(10080);
      expect(port).toBeLessThanOrEqual(10179);
      expect(CHROME_UNSAFE_PORTS.has(port)).toBe(false);
      seen.add(port);
      jest.restoreAllMocks();
    }
    expect(seen.size).toBeGreaterThan(90); // de verdad recorrió el rango
  });

  test('falla al momento si no queda ningún puerto libre que Chrome abra', async () => {
    // 10080 está bloqueado por Chrome y 10081 lo ocupa el propio test
    const squatter = net.createServer();
    await new Promise<void>((resolve) => squatter.listen(10081, resolve));
    try {
      const t0 = Date.now();
      await expect(freePort(10080, 10081)).rejects.toThrow('No hay puertos libres en 10080–10081');
      expect(Date.now() - t0).toBeLessThan(1000);
    } finally {
      await new Promise<void>((resolve) => squatter.close(() => resolve()));
    }
  });
});
