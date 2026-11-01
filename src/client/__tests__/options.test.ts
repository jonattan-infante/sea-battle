// Opciones de cámara y teclas guardadas en el navegador (E18, AC-207): lo que no se entiende (roto o de otra versión) se
// descarta sin aviso ni error en la consola, y se usan las de por defecto
import { DEFAULT_BINDINGS } from '../key-bindings';
import { DEFAULT_OPTIONS, loadOptions, Options, OPTIONS_KEY, parseOptions, saveOptions, serializeOptions } from '../options';

const custom: Options = { camera: 'free', keys: { ...DEFAULT_BINDINGS, viewUp: 'KeyW', viewDown: 'KeyS', stop: 'ArrowDown' } };

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  return {
    data,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, String(v))
  };
}

// Lo que hizo una llamada: un fallo que lanza se ve como aserción, no como un test roto
const attempt = (fn: () => unknown) => {
  try {
    fn();
    return 'ok';
  } catch {
    return 'lanzó';
  }
};

const throwing = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  }
};

describe('Opciones por defecto (AC-206)', () => {
  test('cámara «Centrada» y las teclas por defecto', () => {
    expect(DEFAULT_OPTIONS).toEqual({ camera: 'centered', keys: DEFAULT_BINDINGS });
  });
});

describe('Leer y escribir el valor guardado (AC-207)', () => {
  test('lo escrito se lee igual', () => {
    expect([custom, DEFAULT_OPTIONS].map((o) => parseOptions(serializeOptions(o)))).toEqual([custom, DEFAULT_OPTIONS]);
  });

  test('el valor lleva su versión, para descartar el de otra', () => {
    expect(JSON.parse(serializeOptions(custom))).toEqual({ v: 1, camera: 'free', keys: custom.keys });
  });

  test('sin valor guardado, las de por defecto', () => {
    expect(parseOptions(null)).toEqual(DEFAULT_OPTIONS);
  });

  const good = { v: 1, camera: 'free', keys: custom.keys };
  test.each([
    ['JSON roto', '{"v":1,"camera":"fr'],
    ['texto suelto', 'free'],
    ['vacío', ''],
    ['null', 'null'],
    ['un número', '1'],
    ['un array', '[1]'],
    ['otra versión', JSON.stringify({ ...good, v: 2 })],
    ['sin versión', JSON.stringify({ camera: 'free', keys: custom.keys })],
    ['un modo que no existe', JSON.stringify({ ...good, camera: 'orbit' })],
    ['sin teclas', JSON.stringify({ v: 1, camera: 'free' })],
    ['teclas repetidas', JSON.stringify({ ...good, keys: { ...custom.keys, center: 'KeyW' } })],
    ['una tecla fija', JSON.stringify({ ...good, keys: { ...custom.keys, center: 'KeyR' } })],
    ['«Libre» con una tecla fuera de la lista de AC-208', JSON.stringify({ ...good, keys: { ...custom.keys, center: 'Numpad5' } })],
    ['un campo de más', JSON.stringify({ ...good, zoom: 2 })]
  ])('%s: se descarta y valen las de por defecto', (_, raw) => {
    expect(parseOptions(raw)).toEqual(DEFAULT_OPTIONS);
  });

  test('loadOptions lee la clave del juego y saveOptions la escribe', () => {
    const s = memoryStorage();
    saveOptions(custom, s);
    expect([...s.data.keys()]).toEqual([OPTIONS_KEY]);
    expect(loadOptions(s)).toEqual(custom);
  });
});

describe('Sin aviso ni error en la consola (AC-207)', () => {
  let spies: jest.SpyInstance[];
  beforeEach(() => {
    spies = (['error', 'warn', 'log', 'info', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => {}));
  });
  afterEach(() => spies.forEach((s) => s.mockRestore()));

  test('un valor roto se descarta en silencio', () => {
    const loaded = loadOptions(memoryStorage({ [OPTIONS_KEY]: '{roto' }));
    expect({ loaded, console: spies.map((s) => s.mock.calls.length) }).toEqual({ loaded: DEFAULT_OPTIONS, console: [0, 0, 0, 0, 0] });
  });

  test('un almacenamiento que lanza (bloqueado o lleno) no rompe ni avisa', () => {
    let loaded: unknown;
    const load = attempt(() => (loaded = loadOptions(throwing)));
    const save = attempt(() => saveOptions(custom, throwing));
    expect({ load, loaded, save, console: spies.map((s) => s.mock.calls.length) }).toEqual({ load: 'ok', loaded: DEFAULT_OPTIONS, save: 'ok', console: [0, 0, 0, 0, 0] });
  });

  test('sin almacenamiento (render del servidor), las de por defecto', () => {
    let loaded: unknown;
    const load = attempt(() => (loaded = loadOptions(undefined)));
    expect({ load, loaded, save: attempt(() => saveOptions(custom, undefined)) }).toEqual({ load: 'ok', loaded: DEFAULT_OPTIONS, save: 'ok' });
  });
});
