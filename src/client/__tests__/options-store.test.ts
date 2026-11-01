// Panel de opciones (E18): el estado que lee el panel y el teclado. Guarda en el navegador solo lo que el jugador elige
// (AC-207) y responde a cada tecla de la espera: asignar, intercambiar, rechazar o cancelar (AC-208, AC-209)
import { DEFAULT_BINDINGS, keyLabel } from '../key-bindings';
import { useHud } from '../hud-store';
import { DEFAULT_OPTIONS, OPTIONS_KEY, parseOptions, serializeOptions } from '../options';
import { closeOnOtherWindows, useOptions } from '../options-store';
import type { PlayerView } from '../../game/types';

function memoryStorage(init: Record<string, string> = {}) {
  const data = new Map(Object.entries(init));
  let writes = 0;
  return {
    data,
    writes: () => writes,
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => {
      writes++;
      data.set(k, String(v));
    }
  };
}

const initial = useOptions.getState();
const initialHud = useHud.getState();
let storage: ReturnType<typeof memoryStorage>;
const st = () => useOptions.getState();
const saved = () => parseOptions(storage.data.get(OPTIONS_KEY) ?? null);

beforeEach(() => {
  useOptions.setState(initial, true);
  useHud.setState({ ...initialHud, connection: 'connected' }, true);
  storage = memoryStorage();
  st().hydrate(storage);
});

describe('Lo guardado (AC-207)', () => {
  test('sin nada guardado: «Centrada» y las teclas por defecto, sin escribir nada', () => {
    expect({ camera: st().camera, keys: st().keys, writes: storage.writes() }).toEqual({ ...DEFAULT_OPTIONS, writes: 0 });
  });

  test('lee lo guardado al hidratar', () => {
    const s = memoryStorage({ [OPTIONS_KEY]: serializeOptions({ camera: 'free', keys: { ...DEFAULT_BINDINGS, stop: 'KeyX' } }) });
    st().hydrate(s);
    expect({ camera: st().camera, keys: st().keys }).toEqual({ camera: 'free', keys: { ...DEFAULT_BINDINGS, stop: 'KeyX' } });
  });

  test('un valor roto: las de por defecto', () => {
    st().setCamera('free');
    st().hydrate(memoryStorage({ [OPTIONS_KEY]: '{"v":1,' }));
    expect({ camera: st().camera, keys: st().keys }).toEqual(DEFAULT_OPTIONS);
  });

  test('cambiar de modo lo guarda; elegir el que ya está no escribe', () => {
    st().setCamera('free');
    expect(saved()).toEqual({ camera: 'free', keys: DEFAULT_BINDINGS });
    const writes = storage.writes();
    st().setCamera('free');
    expect(storage.writes()).toBe(writes);
  });
});

describe('Esperar una tecla (AC-208, AC-209)', () => {
  test('una tecla libre se asigna, se guarda y acaba la espera', () => {
    st().startWait('viewUp');
    const waiting = st().waiting;
    st().press('KeyW', {}, 'w');
    expect(waiting).toBe('viewUp');
    expect({ waiting: st().waiting, keys: st().keys, notice: st().notice }).toEqual({ waiting: null, keys: { ...DEFAULT_BINDINGS, viewUp: 'KeyW' }, notice: null });
    expect(saved().keys).toEqual({ ...DEFAULT_BINDINGS, viewUp: 'KeyW' });
  });

  test('la tecla de otra acción se intercambia, y el aviso dice cuál cambió y a qué tecla', () => {
    st().startWait('viewDown');
    st().press('KeyS', {}, 's');
    expect(st().keys).toEqual({ ...DEFAULT_BINDINGS, viewDown: 'KeyS', stop: 'ArrowDown' });
    expect(st().notice).toEqual({ kind: 'swap', action: 'viewDown', code: 'KeyS', other: 'stop', otherCode: 'ArrowDown' });
    expect(saved().keys).toEqual(st().keys);
  });

  test('Mayús con una fija es «no vale», con «Mayús» en la caja (§20.4, estado d)', () => {
    st().startWait('stop');
    st().press('KeyR', { shift: true }, 'R');
    expect(st().notice).toEqual({ kind: 'invalid', action: 'stop', code: 'KeyR', label: 'Mayús' });
  });

  test('una tecla fija no se asigna: el aviso dice de qué acción es y no se escribe nada', () => {
    st().startWait('viewDown');
    st().press('KeyR', {}, 'r');
    expect({ keys: st().keys, notice: st().notice }).toEqual({ keys: DEFAULT_BINDINGS, notice: { kind: 'fixed', action: 'viewDown', code: 'KeyR', fixed: 'repair', label: 'R' } });
    expect(storage.writes()).toBe(0);
  });

  test('una tecla fuera de la lista, o con un modificador, no vale', () => {
    st().startWait('viewDown');
    st().press('F5', {}, 'F5');
    const notices = [st().notice];
    st().startWait('viewUp');
    st().press('KeyW', { shift: true }, 'W');
    notices.push(st().notice);
    expect({ keys: st().keys, notices, writes: storage.writes() }).toEqual({
      keys: DEFAULT_BINDINGS,
      notices: [
        { kind: 'invalid', action: 'viewDown', code: 'F5', label: 'F5' },
        { kind: 'invalid', action: 'viewUp', code: 'KeyW', label: 'Mayús' }
      ],
      writes: 0
    });
  });

  test('Esc cancela la espera sin cambiar nada', () => {
    st().startWait('stop');
    st().press('Escape', {}, 'Escape');
    expect({ waiting: st().waiting, keys: st().keys, notice: st().notice, open: st().open, writes: storage.writes() }).toEqual({ waiting: null, keys: DEFAULT_BINDINGS, notice: null, open: false, writes: 0 });
  });

  test('sin espera, una pulsación no toca la tabla', () => {
    st().press('KeyW', {}, 'w');
    expect({ keys: st().keys, notice: st().notice }).toEqual({ keys: DEFAULT_BINDINGS, notice: null });
  });

  test('la etiqueta sale de la tecla tal como la pulsó el jugador: en un AZERTY, KeyW dice «Z»', () => {
    st().startWait('viewUp');
    st().press('KeyW', {}, 'z');
    expect(keyLabel(st().keys.viewUp, st().layout)).toBe('Z');
  });

  test('«Restablecer» vuelve a las teclas por defecto, lo guarda y no toca la cámara', () => {
    st().setCamera('free');
    st().startWait('stop');
    st().press('KeyX', {}, 'x');
    st().reset();
    expect({ camera: st().camera, keys: st().keys }).toEqual({ camera: 'free', keys: DEFAULT_BINDINGS });
    expect(saved()).toEqual({ camera: 'free', keys: DEFAULT_BINDINGS });
  });
});

describe('Abrir y cerrar el panel (AC-205)', () => {
  test('cerrarlo cancela la espera y quita el aviso', () => {
    st().setOpen(true);
    st().startWait('viewUp');
    st().press('F5', {}, 'F5');
    st().startWait('viewDown');
    st().setOpen(false);
    expect({ open: st().open, waiting: st().waiting, notice: st().notice }).toEqual({ open: false, waiting: null, notice: null });
  });

  test('abrirlo y cerrarlo no escribe nada', () => {
    st().setOpen(true);
    st().setOpen(false);
    expect(storage.writes()).toBe(0);
  });
});

describe('Cuánto dura un aviso (AC-209, precisado el 2026-11-01)', () => {
  afterEach(() => jest.useRealTimers());

  test('un rechazo acaba la espera: la siguiente tecla de la lista no asigna nada; el aviso sigue a los 60 s y se va con otro clic en una tecla', () => {
    jest.useFakeTimers();
    st().setOpen(true);
    st().startWait('stop');
    st().press('KeyR', {}, 'r');
    st().press('KeyW', {}, 'w'); // ya no hay espera
    jest.advanceTimersByTime(60_000);
    const after60s = { keys: st().keys, waiting: st().waiting, notice: st().notice };
    st().startWait('viewUp');
    expect({ after60s, notice: st().notice }).toEqual({
      after60s: { keys: DEFAULT_BINDINGS, waiting: null, notice: { kind: 'fixed', action: 'stop', code: 'KeyR', fixed: 'repair', label: 'R' } },
      notice: null
    });
  });

  test('cambiar de cámara o «Restablecer» también quitan el aviso', () => {
    st().startWait('stop');
    st().press('F5', {}, 'F5');
    st().setCamera('free');
    const afterCamera = st().notice;
    st().startWait('stop');
    st().press('F5', {}, 'F5');
    st().reset();
    expect({ afterCamera, afterReset: st().notice }).toEqual({ afterCamera: null, afterReset: null });
  });

  test('pulsar la tecla que la acción ya tiene acaba la espera sin aviso ni escritura', () => {
    st().startWait('stop');
    st().press('KeyS', {}, 's');
    expect({ waiting: st().waiting, notice: st().notice, writes: storage.writes() }).toEqual({ waiting: null, notice: null, writes: 0 });
  });
});

describe('Nunca 2 ventanas a la vez (AC-205, precisado el 2026-11-01)', () => {
  let stop: () => void;
  beforeEach(() => (stop = closeOnOtherWindows()));
  afterEach(() => stop());

  const death = { death: { by: 'Pirata', respawnAt: 0 } } as unknown as PlayerView;
  test.each([
    ['la tarjeta de muerte', () => useHud.setState({ player: death })],
    ['el aviso de desconexión', () => useHud.setState({ connection: 'reconnecting' })],
    ['la tienda', () => useHud.setState({ shopOpen: true })]
  ])('al abrirse %s, el panel se cierra y la espera se cancela sin cambiar nada', (_, show) => {
    st().setOpen(true);
    st().startWait('viewUp');
    show();
    expect({ open: st().open, waiting: st().waiting, keys: st().keys, writes: storage.writes() }).toEqual({ open: false, waiting: null, keys: DEFAULT_BINDINGS, writes: 0 });
  });

  test.each([
    ['la tarjeta de muerte', () => useHud.setState({ player: death })],
    ['el aviso de desconexión', () => useHud.setState({ connection: 'failed' })],
    ['la tienda', () => useHud.setState({ shopOpen: true })]
  ])('con %s en pantalla, el panel no se abre', (_, show) => {
    show();
    st().setOpen(true);
    expect(st().open).toBe(false);
  });

  test('sin ninguna, se abre; y al cerrarse la que había, también', () => {
    st().setOpen(true);
    const plain = st().open;
    st().setOpen(false);
    useHud.setState({ shopOpen: true });
    useHud.setState({ shopOpen: false });
    st().setOpen(true);
    expect({ plain, afterShop: st().open }).toEqual({ plain: true, afterShop: true });
  });
});
