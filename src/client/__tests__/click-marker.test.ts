// H-1 de QA-71 (P1 de la 1.2, condición para activar MAP_1_1; BACKLOG :1720): el marcador de clic del cliente cae donde para
// el barco. Con los mismos puntos, markerDestination (click-marker.ts, lo que pinta el cliente) frente a ship.destination
// tras moveTo del servidor (setDestination), en las clases de jugador y en los 2 mapas: clics en agua abierta, a 0–5 m de
// cada costa, dentro de cada círculo y en las escotaduras entre círculos de una misma isla (I1 y las demás de la 1.1)
import { IslandDef, MAP_1_0, MAP_1_1, MapDef, NAV_LIMIT, navClearance, PLAYER_SHIP_ORDER } from '../../game/constants';
import { Navigator } from '../../game/nav';
import { createRng, distance, Vec2 } from '../../game/vec';
import { addPlayer, createWorld, moveTo, shipOfPlayer } from '../../game/world';
import { markerDestination } from '../click-marker';

const TOLERANCE_M = 0.5; // producto, BACKLOG :1720

// Los puntos de clic de un mapa, con su tipo para el informe
function clicks(map: MapDef): { kind: string; p: Vec2 }[] {
  const out: { kind: string; p: Vec2 }[] = [];
  const rng = createRng(1720);
  for (let i = 0; i < 24; i++) out.push({ kind: 'agua', p: { x: (rng() * 2 - 1) * NAV_LIMIT * 0.9, z: (rng() * 2 - 1) * NAV_LIMIT * 0.9 } });
  for (const c of map.islands) {
    out.push({ kind: `dentro ${c.id}`, p: { x: c.x, z: c.z } });
    for (let k = 0; k < 8; k++) {
      const a = (k / 8) * 2 * Math.PI + 0.3;
      out.push({ kind: `dentro ${c.id}`, p: { x: c.x + Math.sin(a) * c.radius * 0.6, z: c.z + Math.cos(a) * c.radius * 0.6 } });
      for (const d of [0.5, 2.5, 5]) out.push({ kind: `costa ${c.id} +${d}`, p: { x: c.x + Math.sin(a) * (c.radius + d), z: c.z + Math.cos(a) * (c.radius + d) } });
    }
  }
  // Escotaduras: los 2 cruces de cada par de círculos de la misma forma que se solapan, y 1, 3 y 5 m hacia fuera desde el
  // punto medio de sus centros (el rincón cóncavo de la unión)
  const byShape = new Map<string, IslandDef[]>();
  for (const c of map.islands) byShape.set(c.id.split('.')[0], [...(byShape.get(c.id.split('.')[0]) ?? []), c]);
  for (const [shape, cs] of byShape)
    for (let i = 0; i < cs.length; i++)
      for (let j = i + 1; j < cs.length; j++) {
        const [a, b] = [cs[i], cs[j]];
        const d = Math.hypot(b.x - a.x, b.z - a.z);
        if (d >= a.radius + b.radius || d <= Math.abs(a.radius - b.radius)) continue;
        const l = (a.radius ** 2 - b.radius ** 2 + d ** 2) / (2 * d);
        const h = Math.sqrt(a.radius ** 2 - l ** 2);
        const mx = a.x + ((b.x - a.x) * l) / d;
        const mz = a.z + ((b.z - a.z) * l) / d;
        const mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
        for (const s of [1, -1]) {
          const q = { x: mx + (s * h * -(b.z - a.z)) / d, z: mz + (s * h * (b.x - a.x)) / d };
          const out1 = Math.hypot(q.x - mid.x, q.z - mid.z) || 1;
          for (const e of [0, 1, 3, 5]) out.push({ kind: `escotadura ${shape} ${a.id}/${b.id} +${e}`, p: { x: q.x + ((q.x - mid.x) / out1) * e, z: q.z + ((q.z - mid.z) / out1) * e } });
        }
      }
  return out;
}

describe('H-1: el marcador de clic del cliente cae donde el servidor fija el destino (≤ 0,5 m)', () => {
  for (const map of [MAP_1_0, MAP_1_1])
    for (const classId of PLAYER_SHIP_ORDER)
      test(`mapa ${map.id}, ${classId}`, () => {
        const world = createWorld({ seed: 1720, spawnNpcs: false, map });
        addPlayer(world, 'p', 'p', { gold: 0, upgrades: { cannons: 1, hull: 1, sails: 1 }, ownedShips: [classId], activeShip: classId });
        const ship = shipOfPlayer(world, 'p')!;
        expect(ship.classId).toBe(classId);
        // El navegador del cliente: otra instancia, con los círculos de la bienvenida (los del mundo, game-server.ts)
        const client = new Navigator([...world.islands]);
        const t0 = performance.now();
        client.prepare([navClearance(classId)]);
        const prepareMs = performance.now() - t0;
        const pts = clicks(map);
        const fails: string[] = [];
        let worst = 0;
        for (const { kind, p } of pts) {
          moveTo(world, 'p', p);
          const server = ship.destination!;
          const marker = markerDestination(client, { x: ship.pos.x, z: ship.pos.z, classId }, p.x, p.z);
          const gap = distance(marker, server);
          worst = Math.max(worst, gap);
          if (gap > TOLERANCE_M) fails.push(`${kind} (${p.x.toFixed(1)}, ${p.z.toFixed(1)}): marcador (${marker.x.toFixed(2)}, ${marker.z.toFixed(2)}), servidor (${server.x.toFixed(2)}, ${server.z.toFixed(2)}), ${gap.toFixed(2)} m`);
        }
        console.log(`H-1 · mapa ${map.id} · ${classId} · ${pts.length} clics · peor ${worst.toFixed(3)} m · prepare del margen ${navClearance(classId)} en el cliente ${prepareMs.toFixed(1)} ms (en Jest, sin cota)`);
        expect(fails.slice(0, 10)).toEqual([]);
      });
});
