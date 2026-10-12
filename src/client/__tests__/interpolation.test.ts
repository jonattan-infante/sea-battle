// AC-92: el interpolador de GameClient con frames sintéticos a 10 Hz que llegan con jitter de ±20 ms, muestreado a
// 60 fps. El salto por frame depende del interpolador y del ritmo de snapshots, no de la GPU (plan de AC-108).
import { PLAYER_SHIP_ORDER, SHIP_CLASSES, SNAPSHOT_RATE, UPGRADE_LEVELS } from '../../game/constants';
import { S2C } from '../../game/protocol';
import { ServerFrame, ShipSnapshot } from '../../game/types';
import { GameClient } from '../game-client';

const FRAME_MS = 1000 / 60;
const LATENCY_MS = 40;
const JITTER_MS = 20;
const DURATION_S = 30;

// PRNG con semilla (mulberry32): la llegada de los frames es reproducible
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Run {
  maxJump: number;
  travelled: number;
  expected: number;
}

// Otro jugador en línea recta a velocidad constante; devuelve el mayor salto entre frames renderizados consecutivos
function run(speed: number, seed: number): Run {
  let clock = 0;
  const now = jest.spyOn(performance, 'now').mockImplementation(() => clock);
  const client = new GameClient({ url: 'http://localhost:1', auth: async () => ({}) });
  try {
    const deliver = (f: ServerFrame) => client.socket.listeners(S2C.frame).forEach((l) => l(f));
    const heading = 0.6;
    const pos = (t: number) => ({ x: -200 + Math.sin(heading) * speed * t, z: -150 + Math.cos(heading) * speed * t });
    const random = rng(seed);
    const interval = 1 / SNAPSHOT_RATE;
    const t0 = 500; // tiempo de servidor del primer frame (s)
    const frames: { arrival: number; frame: ServerFrame }[] = [];
    for (let k = 0; k * interval <= DURATION_S; k++) {
      const t = t0 + k * interval;
      const { x, z } = pos(k * interval);
      const snap: Partial<ShipSnapshot> & { id: string } =
        k === 0
          ? { id: 'other', k: 'player', c: 'sloop', n: 'Otro', o: 'u2', x, z, h: heading, s: speed, hp: 800, mhp: 800, st: 'alive', t: null, r: false, pu: 0 }
          : { id: 'other', x, z };
      frames.push({ arrival: t * 1000 + LATENCY_MS + (random() * 2 - 1) * JITTER_MS, frame: { t, ...(k === 0 ? { full: true as const } : {}), s: [snap] } });
    }

    let next = 0;
    let prev: { x: number; z: number } | null = null;
    let first: { x: number; z: number } | null = null;
    let maxJump = 0;
    const end = frames[frames.length - 1].arrival + 500;
    for (clock = frames[0].arrival; clock <= end; clock += FRAME_MS) {
      while (next < frames.length && frames[next].arrival <= clock) deliver(frames[next++].frame);
      client.update(clock);
      const ship = client.getShip('other')!;
      if (prev) maxJump = Math.max(maxJump, Math.hypot(ship.x - prev.x, ship.z - prev.z));
      prev = { x: ship.x, z: ship.z };
      first ??= { ...prev };
    }
    const last = pos((frames.length - 1) * interval);
    return { maxJump, travelled: Math.hypot(prev!.x - first!.x, prev!.z - first!.z), expected: Math.hypot(last.x - first!.x, last.z - first!.z) };
  } finally {
    client.dispose();
    now.mockRestore();
  }
}

describe('AC-92: interpolación de otro jugador navegando en línea recta', () => {
  // Velocidad máxima posible de cada clase: velas al nivel 3
  const sails = Math.max(...UPGRADE_LEVELS.sails.multipliers);
  test.each(PLAYER_SHIP_ORDER.map((c) => [SHIP_CLASSES[c].label, (SHIP_CLASSES[c].maxSpeed * sails).toFixed(1), SHIP_CLASSES[c].maxSpeed * sails] as const))(
    '%s a su velocidad máxima (%s m/s con velas N3): ningún salto entre frames de 60 fps supera 1 m (frames a 10 Hz con jitter de ±20 ms)',
    (label, _shown, speed) => {
      const runs = [1, 2, 3, 4, 5].map((seed) => run(speed, seed));
      console.log(`AC-92 ${label} a ${speed.toFixed(1)} m/s: salto máximo ${Math.max(...runs.map((r) => r.maxJump)).toFixed(3)} m en 5 semillas`);
      for (const r of runs) {
        // Sin congelarse: el barco renderizado recorre todo el trayecto hasta la última muestra (sin extrapolar)
        expect(r.travelled).toBeCloseTo(r.expected, 1);
        expect(r.maxJump).toBeLessThanOrEqual(1);
      }
    }
  );
});
