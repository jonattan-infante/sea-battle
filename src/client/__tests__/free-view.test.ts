// Vista libre (E13, GDD §5): umbral de arrastre, flechas, minimapa, límite del mapa, vuelta al seguimiento y envíos de
// viewAt (≤ 2/s, ninguno en reposo y un null al volver)
import { MAP_HALF_SIZE } from '../../game/constants';
import { FREE_VIEW, FreeView, returnTrigger } from '../free-view';

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
