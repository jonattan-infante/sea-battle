// Vista libre (E13, GDD §5): umbral de arrastre, flechas, minimapa, límite del mapa, vuelta al seguimiento y envíos de
// viewAt (≤ 2/s, ninguno en reposo y un null al volver)
import { MAP_HALF_SIZE } from '../../game/constants';
import { FREE_VIEW, FreeView, OwnWatch, returnTrigger } from '../free-view';

type Point = { x: number; z: number };
const ppm = 6.2; // escritorio a 1,0×
const toWorld = (dx: number, dy: number): Point => ({ x: dx / ppm, z: dy / ppm });

function setup(ship: Point = { x: 100, z: 50 }) {
  const sent: (Point | null)[] = [];
  const free: boolean[] = [];
  const view = new FreeView((c) => sent.push(c), (f) => free.push(f));
  let now = 0;
  view.focus(ship, now); // el runtime pide el foco antes de cualquier entrada
  return {
    view,
    sent,
    free,
    ship,
    at: (t: number) => (now = t),
    now: () => now,
    focus: () => view.focus(ship, now)
  };
}

describe('Vista libre: arrastre y clic (AC-116)', () => {
  test('soltar sin pasar de 12 px es un clic: la vista no se mueve y no se envía nada', () => {
    const s = setup();
    s.view.pointerDown(500, 400);
    expect(s.view.pointerMove(500 + FREE_VIEW.dragPx, 400, toWorld, 0)).toBe(false);
    expect(s.view.pointerUp()).toBe('click');
    expect({ mode: s.view.mode, focus: s.focus(), sent: s.sent }).toEqual({ mode: 'follow', focus: s.ship, sent: [] });
  });

  test('pasar de 12 px arrastra la vista con el puntero, entra en vista libre y al soltar no es un clic', () => {
    const s = setup();
    s.view.pointerDown(500, 400);
    expect(s.view.pointerMove(500 + 62, 400 - 31, toWorld, 0)).toBe(true); // 10 m a la derecha y 5 hacia arriba
    expect(s.view.mode).toBe('free');
    const f = s.focus()!;
    expect(f.x).toBeCloseTo(s.ship.x - 10, 6); // el mundo sigue al puntero: la vista va al lado contrario
    expect(f.z).toBeCloseTo(s.ship.z + 5, 6);
    expect(s.view.pointerUp()).toBe('drag');
    expect(s.free).toEqual([true]);
  });

  test('un segundo dedo cancela la pulsación: ni desplaza ni hace clic', () => {
    const s = setup();
    s.view.pointerDown(100, 100);
    s.view.cancelPress();
    expect(s.view.pointerMove(300, 300, toWorld, 0)).toBe(false);
    expect(s.view.pointerUp()).toBeNull();
    expect(s.view.mode).toBe('follow');
  });
});

describe('Vista libre: flechas, minimapa y límite del mapa (AC-117, AC-118, AC-120)', () => {
  test('AC-118: 2 s con una flecha desplazan la vista 300 m en esa dirección', () => {
    const s = setup();
    s.view.setArrow('up', true);
    for (let t = 1; t <= 120; t++) s.view.update((t * 1000) / 60, 1 / 60);
    const f = s.focus()!;
    expect(f.x).toBeCloseTo(s.ship.x, 6);
    expect(s.ship.z - f.z).toBeCloseTo(300, 6); // arriba en pantalla es −Z
  });

  test('AC-117: el minimapa centra la vista en el punto, sin navegar', () => {
    const s = setup();
    s.view.centerOn({ x: -250, z: 320 }, 0);
    expect({ mode: s.view.mode, focus: s.focus() }).toEqual({ mode: 'free', focus: { x: -250, z: 320 } });
  });

  test('AC-120: el centro de la vista no sale de ±MAP_HALF_SIZE aunque se siga arrastrando o pulsando', () => {
    const s = setup();
    s.view.centerOn({ x: 9000, z: -9000 }, 0);
    expect(s.focus()).toEqual({ x: MAP_HALF_SIZE, z: -MAP_HALF_SIZE });
    s.view.setArrow('right', true);
    for (let t = 1; t <= 60; t++) s.view.update(t * 16, 0.016);
    expect(s.focus()).toEqual({ x: MAP_HALF_SIZE, z: -MAP_HALF_SIZE });
  });
});

describe('Vista libre: vuelta al seguimiento (AC-119)', () => {
  test('vuelve al barco en 300 ms, con la vista entre medias, y luego sigue al barco', () => {
    const s = setup();
    s.view.centerOn({ x: 300, z: 300 }, 0);
    s.at(1000);
    expect(s.view.returnToFollow(1000)).toBe(true);
    expect(s.view.mode).toBe('returning');
    s.at(1150);
    const mid = s.focus()!;
    expect(mid.x).toBeGreaterThan(s.ship.x);
    expect(mid.x).toBeLessThan(300);
    s.at(1000 + FREE_VIEW.returnMs);
    expect(s.focus()).toEqual(s.ship);
    expect(s.view.mode).toBe('follow');
    expect(s.free).toEqual([true, false]);
  });

  test('en seguimiento, volver no hace nada', () => {
    const s = setup();
    expect(s.view.returnToFollow(0)).toBe(false);
    expect({ sent: s.sent, free: s.free }).toEqual({ sent: [], free: [] });
  });

  test('«daño» es una bajada de vida sin cambio de clase; morir y reaparecer también devuelven la cámara', () => {
    const alive = { hp: 100, classId: 'sloop', state: 'alive' as const };
    expect(returnTrigger(alive, { ...alive, hp: 90 })).toBe('damage');
    expect(returnTrigger(alive, { hp: 60, classId: 'brig', state: 'alive' })).toBeNull(); // cambio de barco en la tienda
    expect(returnTrigger(alive, { ...alive, hp: 100 })).toBeNull();
    expect(returnTrigger(alive, { ...alive, hp: 120 })).toBeNull(); // reparar
    expect(returnTrigger(alive, { ...alive, hp: 0, state: 'sinking' })).toBe('death');
    expect(returnTrigger({ ...alive, hp: 0, state: 'dead' }, alive)).toBe('respawn');
    expect(returnTrigger(null, alive)).toBeNull();
  });

  // El hundido del todo no viaja en los frames: entre el hundimiento y la reaparición no hay muestra del barco propio
  test('la reaparición devuelve la cámara aunque entre medias no haya muestra del barco propio', () => {
    const alive = { hp: 100, classId: 'sloop', state: 'alive' as const };
    const own = new OwnWatch();
    const seq = [alive, { ...alive, hp: 0, state: 'sinking' as const }, null, null, { ...alive, hp: 0, state: 'dead' as const }, null, alive, null, alive];
    expect(seq.map((s) => own.next(s))).toEqual([null, 'death', null, null, null, null, 'respawn', null, null]);
    expect(new OwnWatch().next(alive)).toBeNull(); // la primera muestra al entrar no es una reaparición
  });
});

describe('Vista libre: envíos de viewAt (AC-123)', () => {
  test('arrastrando, ≤ 2/s con el último centro; quieta, ninguno; al volver, un null', () => {
    const s = setup();
    s.view.pointerDown(500, 400);
    for (let t = 0; t <= 2000; t += 16) s.view.pointerMove(500 + 20 + t / 10, 400, toWorld, t); // 2 s arrastrando
    s.view.pointerUp();
    const whileDragging = s.sent.length;
    expect(whileDragging).toBeGreaterThanOrEqual(4);
    expect(whileDragging).toBeLessThanOrEqual(5); // 2/s durante 2 s, más el primero
    for (let t = 2016; t <= 12_000; t += 16) s.view.update(t, 0.016); // 10 s quieta
    expect(s.sent.length - whileDragging).toBeLessThanOrEqual(1); // como mucho, el último centro pendiente
    const atRest = s.sent.length;
    for (let t = 12_016; t <= 22_000; t += 16) s.view.update(t, 0.016);
    expect(s.sent.length).toBe(atRest);
    expect(s.sent[s.sent.length - 1]).toEqual(s.focus()); // el servidor tiene el centro final
    s.view.returnToFollow(22_000);
    expect(s.sent.slice(atRest)).toEqual([null]);
  });

  test('entre dos envíos pasan ≥ 500 ms', () => {
    const s = setup();
    const times: number[] = [];
    const view = new FreeView(() => times.push(t));
    let t = 0;
    view.focus(s.ship, 0);
    view.setArrow('left', true);
    for (t = 0; t <= 5000; t += 7) view.update(t, 0.007);
    expect(times.length).toBeGreaterThanOrEqual(9);
    for (let i = 1; i < times.length; i++) expect(times[i] - times[i - 1]).toBeGreaterThanOrEqual(FREE_VIEW.sendEveryMs);
  });

  test('sin haber enviado nunca un centro, volver no envía el null', () => {
    const s = setup();
    s.view.setArrow('up', true); // entra en vista libre, pero la vista aún no se movió
    s.view.setArrow('up', false);
    s.view.returnToFollow(10);
    expect(s.sent).toEqual([]);
  });
});

// E18 (H-1801): con la cámara «Centrada», la de la 1.0, la vista nunca se suelta del barco y no sale ningún viewAt
function centeredSetup() {
  const s = setup();
  s.view.setCentered(true, 0);
  return s;
}

describe('Cámara «Centrada» (AC-206)', () => {
  test('(a) arrastrar 200 px no mueve la vista: al soltar es un clic en el punto donde suelta', () => {
    const s = centeredSetup();
    s.view.pointerDown(500, 400);
    const moved: boolean[] = [];
    for (let dx = 4; dx <= 200; dx += 4) moved.push(s.view.pointerMove(500 + dx, 400, toWorld, dx));
    const up = s.view.pointerUp();
    expect({ moved: moved.some(Boolean), up, mode: s.view.mode, focus: s.focus(), sent: s.sent, free: s.free }).toEqual({
      moved: false,
      up: 'click',
      mode: 'follow',
      focus: s.ship,
      sent: [],
      free: []
    });
  });

  test('(b) mantener 2 s una tecla de la vista no mueve la cámara', () => {
    const s = centeredSetup();
    s.view.setArrow('up', true);
    for (let t = 0; t <= 2000; t += 16) s.view.update(t, 0.016);
    expect({ mode: s.view.mode, focus: s.focus(), sent: s.sent, free: s.free }).toEqual({ mode: 'follow', focus: s.ship, sent: [], free: [] });
  });

  test('(c) el minimapa no centra la vista', () => {
    const s = centeredSetup();
    s.view.centerOn({ x: 900, z: -700 }, 0);
    s.view.update(600, 0.016);
    expect({ mode: s.view.mode, focus: s.focus(), sent: s.sent, free: s.free }).toEqual({ mode: 'follow', focus: s.ship, sent: [], free: [] });
  });
});

describe('Cambiar de modo (AC-207)', () => {
  test('de «Libre» a «Centrada»: vuelve al barco en 300 ms con 1 viewAt(null), y desde ahí vale AC-206', () => {
    // La vista libre a 300 m del barco, con el centro ya en el servidor
    const s = setup();
    s.view.setArrow('right', true);
    let t = 0;
    for (; t <= 2000; t += 16) s.view.update(t, 0.016);
    s.view.setArrow('right', false);
    for (; t <= 3000; t += 16) s.view.update(t, 0.016); // sale el último centro pendiente
    s.at(t);
    const off = s.focus()!.x - s.ship.x;
    const before = s.sent.length;
    s.view.setCentered(true, t);
    const switched = { sent: s.sent.slice(before), mode: s.view.mode };
    s.at(t + FREE_VIEW.returnMs / 2);
    const mid = s.focus()!.x - s.ship.x;
    s.at(t + FREE_VIEW.returnMs);
    const back = { focus: s.focus(), mode: s.view.mode };
    s.view.pointerDown(500, 400); // AC-206 (a) desde ahí
    const dragged = s.view.pointerMove(700, 400, toWorld, t + 400);
    const up = s.view.pointerUp();
    s.view.setCentered(true, t + 500); // elegirla otra vez no manda otro null
    expect({
      at300: Math.abs(off - 300) <= 30 && before > 0,
      switched,
      midway: mid > 0 && mid < off,
      back,
      dragged,
      up,
      sentAfter: s.sent.slice(before)
    }).toEqual({ at300: true, switched: { sent: [null], mode: 'returning' }, midway: true, back: { focus: s.ship, mode: 'follow' }, dragged: false, up: 'click', sentAfter: [null] });
  });

  test('de «Libre» sin haber movido la vista a «Centrada»: 0 mensajes', () => {
    const s = setup();
    s.view.setCentered(true, 0);
    expect({ mode: s.view.mode, sent: s.sent }).toEqual({ mode: 'follow', sent: [] });
  });

  test('de «Centrada» a «Libre»: la cámara no se mueve hasta que el jugador la mueva, y entonces vale AC-116', () => {
    const s = centeredSetup();
    s.view.setArrow('up', true); // pulsada en «Centrada»: no cuenta al cambiar
    s.view.setCentered(false, 0);
    for (let t = 0; t <= 1000; t += 16) s.view.update(t, 0.016);
    const still = { mode: s.view.mode, focus: s.focus(), sent: [...s.sent] }; // copia: el arrastre de después añade
    s.view.pointerDown(500, 400);
    const dragged = s.view.pointerMove(562, 400, toWorld, 1100);
    expect({ still, dragged, mode: s.view.mode }).toEqual({ still: { mode: 'follow', focus: s.ship, sent: [] }, dragged: true, mode: 'free' });
  });
});
