// La fila de la 1.3 frente a la 1.2.1, la versión a la que se vuelve si la 1.3 falla (GDD §13, «Lectura y escritura de la
// fila en la 1.3 y en la 1.2.x puente», y Q36; BACKLOG AC-220, y la base del ensayo de vuelta atrás de AC-229 y AC-230).
// El escritor y el lector de la 1.3 son los de verdad (server/progress.ts). La 1.2.1 es su lector y escritor congelados
// (fixtures/progress-1.2.1.ts, 6b9d8f8, el tag v1.2.1), con su persistencia hecha aquí igual que en 6b9d8f8: escribe solo
// si cambió lo que juega (progressKey), con el `carry` vigente, y tras cada escritura el `carry` pasa a ser el de la fila
// escrita (carryAfterWrite). Sus compras usan los precios de la 1.2.1, que son globales.
// persistence-rollback.test.ts prueba lo mismo con Postgres y el servidor de la 1.3
import { FAMILY_PRICE, FamilyChoice, GOLD_CAP, PLAYER_SHIP_ORDER, PlayerShipClass, SHIP_FAMILIES, XP_CAP } from '../../src/game/constants';
import { parseProgress, progressKey, SavedProgress, serializeProgress } from '../progress';
import {
  carryAfterWrite,
  parseProgress as parse121,
  progressKey as key121,
  RowCarry,
  SavedProgress as Saved121,
  serializeProgress as serialize121
} from './fixtures/progress-1.2.1';

type Levels = { cannons: number; hull: number; sails: number };
type Row = Record<string, unknown> & { v?: unknown; ships?: Record<string, Levels> };
const lv = (cannons: number, hull: number, sails: number): Levels => ({ cannons, hull, sails });
const N1 = lv(1, 1, 1);
const AXES = ['cannons', 'hull', 'sails'] as const;
const roundTrip = (x: unknown): Row => JSON.parse(JSON.stringify(x));

// Lo que juega la 1.2.1 y sus precios (src/game/constants.ts en 6b9d8f8): las mejoras son globales
const SHIPS_121 = ['sloop', 'brig', 'frigate'] as const;
type Ship121 = (typeof SHIPS_121)[number];
const UPGRADE_PRICES_121: Record<(typeof AXES)[number], number[]> = { cannons: [0, 500, 1500], hull: [0, 400, 1200], sails: [0, 300, 900] };
const SHIP_PRICES_121: Record<Ship121, number> = { sloop: 0, brig: 2000, frigate: 6000 };

// Un jugador en la 1.2.1 con una fila: lo que juega (`live`), lo que conserva aparte (`carry`) y lo que escribe
function in121(row: unknown) {
  const read = parse121(roundTrip(row));
  if (!read) throw new Error(`la 1.2.1 rechaza ${JSON.stringify(row)}`);
  const live: Saved121 = read.progress;
  let carry: RowCarry = read.carry;
  let savedKey = key121(live);
  let written: Row | null = null;
  const save = () => {
    if (key121(live) === savedKey) return; // cero escrituras en reposo
    written = roundTrip(serialize121(live, carry));
    carry = carryAfterWrite(live, carry);
    savedKey = key121(live);
  };
  return {
    live,
    row: () => written, // null: no escribió nada, y la fila queda como estaba
    buyUpgrade(axis: (typeof AXES)[number]): boolean {
      const level = live.upgrades[axis] + 1;
      const price = UPGRADE_PRICES_121[axis][level - 1];
      if (level > 3 || live.gold < price) return false;
      live.gold -= price;
      live.upgrades[axis] = level;
      save();
      return true;
    },
    buyShip(classId: Ship121): boolean {
      if (live.ownedShips.includes(classId) || live.gold < SHIP_PRICES_121[classId]) return false;
      live.gold -= SHIP_PRICES_121[classId];
      live.ownedShips = SHIPS_121.filter((c) => c === classId || live.ownedShips.includes(c));
      live.activeShip = classId;
      save();
      return true;
    },
    select(classId: Ship121): boolean {
      if (!live.ownedShips.includes(classId) || live.activeShip === classId) return false;
      live.activeShip = classId;
      save();
      return true;
    },
    gain(gold: number, xp: number): void {
      live.gold = Math.min(GOLD_CAP, live.gold + gold);
      live.xp = Math.min(XP_CAP, live.xp + xp);
      save();
    }
  };
}

// La partida de AC-220 (c): la Balandra a N1, la Fragata a (2, 2, 2) y el Navío a (2, 1, 1), activo, con la española
const AC220: SavedProgress = { gold: 5000, xp: 1500, ships: { sloop: N1, frigate: lv(2, 2, 2), line: lv(2, 1, 1) }, activeShip: 'line', families: ['es'], family: 'es' };
// La de AC-218: la Balandra a (3, 1, 2), el Bergantín a N1 y activo, y las 2 familias con la española en uso
const AC218: SavedProgress = { gold: 1234, xp: 2500, ships: { sloop: lv(3, 1, 2), brig: N1 }, activeShip: 'brig', families: ['gb', 'es'], family: 'es' };
// Los 5 barcos con niveles distintos, el Navío activo y las 2 familias
const FULL: SavedProgress = {
  gold: 4321,
  xp: 2500,
  ships: { sloop: lv(3, 1, 2), brig: lv(2, 3, 1), schooner: lv(1, 2, 3), frigate: lv(2, 2, 1), line: lv(3, 3, 2) },
  activeShip: 'line',
  families: ['gb', 'es'],
  family: 'es'
};
const NEW_PLAYER: SavedProgress = { gold: 100, xp: 0, ships: { sloop: N1 }, activeShip: 'sloop', families: [], family: 'none' };

describe('la 1.2.1 lee lo que escribe la 1.3 y juega con lo que sabe jugar (AC-220 a y b)', () => {
  test.each([
    ['AC-218: con el Bergantín activo juega con él y sus niveles, aunque la Balandra tenga más', AC218, { gold: 1234, upgrades: N1, ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 2500 }],
    ['AC-220: con el Navío activo juega con la Fragata a (2, 2, 2)', AC220, { gold: 5000, upgrades: lv(2, 2, 2), ownedShips: ['sloop', 'frigate'], activeShip: 'frigate', xp: 1500 }],
    ['los 5 barcos con el Navío activo: juega con la Fragata', FULL, { gold: 4321, upgrades: lv(2, 2, 1), ownedShips: ['sloop', 'brig', 'frigate'], activeShip: 'frigate', xp: 2500 }],
    ['un jugador nuevo de la 1.3, sin familia', NEW_PLAYER, { gold: 100, upgrades: N1, ownedShips: ['sloop'], activeShip: 'sloop', xp: 0 }]
  ])('%s', (_label, progress13, played) => {
    const row = roundTrip(serializeProgress(progress13));
    expect(row.v).toBe(3);
    expect(in121(row).live).toEqual(played);
  });

  test('sin cambios en la 1.2.1, no escribe nada: la fila de la 1.3 queda como estaba, también con el Navío activo', () => {
    const b = in121(serializeProgress(FULL));
    expect(b.row()).toBeNull();
  });
});

describe('una partida de la 1.3 va a la 1.2.1 y vuelve sin perder familias, compras ni niveles por barco (AC-220 c)', () => {
  test('el ejemplo de AC-220: Cañones N3 en la Fragata y después la Balandra; la 1.3 lee la Fragata y la Balandra a (3, 2, 2), el Navío igual y la española', () => {
    const b = in121(serializeProgress(AC220));
    expect(b.buyUpgrade('cannons')).toBe(true);
    expect(b.select('sloop')).toBe(true);
    const back = parseProgress(b.row());
    expect(back).toEqual({ ...AC220, gold: 3500, ships: { sloop: lv(3, 2, 2), frigate: lv(3, 2, 2), line: lv(2, 1, 1) }, activeShip: 'sloop' });
  });

  test('con oro y XP ganados en la 1.2.1, la 1.3 lee los 5 barcos y las 2 familias como los dejó, y como activo la Fragata con la que se jugó', () => {
    const b = in121(serializeProgress(FULL));
    b.gain(40, 66);
    expect(parseProgress(b.row())).toEqual({ ...FULL, gold: 4361, xp: 2566, activeShip: 'frigate' });
  });

  test('un Bergantín comprado en la 1.2.1 llega a la 1.3 con las mejoras globales con las que se compró, y activo', () => {
    const b = in121(serializeProgress(AC220));
    expect(b.buyShip('brig')).toBe(true);
    expect(parseProgress(b.row())).toEqual({ ...AC220, gold: 3000, ships: { ...AC220.ships, brig: lv(2, 2, 2) }, activeShip: 'brig' });
  });

  test('la 1.3 vuelve a escribir en v: 3 la fila que escribió la 1.2.1 tal como la leyó, y la 1.2.1 la vuelve a aceptar', () => {
    const b = in121(serializeProgress(FULL));
    b.buyUpgrade('sails');
    const row = b.row()!;
    const back = parseProgress(row)!;
    expect(roundTrip(serializeProgress(back))).toEqual(row);
    expect(parse121(roundTrip(serializeProgress(back)))).not.toBeNull();
  });

  test('ida y vuelta dos veces: lo que compra la 1.3 entre medias (una familia, una mejora de un barco que no navega, la Goleta) sobrevive a la segunda 1.2.1', () => {
    const first = in121(serializeProgress(AC220));
    first.buyUpgrade('cannons');
    const by13 = parseProgress(first.row())!;
    const after13: SavedProgress = { ...by13, ships: { ...by13.ships, line: lv(3, 1, 1), schooner: N1 }, activeShip: 'schooner', families: ['gb', 'es'], family: 'gb' };
    const second = in121(serializeProgress(after13));
    expect(second.live).toMatchObject({ activeShip: 'frigate', upgrades: lv(3, 2, 2) });
    second.gain(10, 10);
    expect(parseProgress(second.row())).toEqual({ ...after13, gold: after13.gold + 10, xp: after13.xp + 10, activeShip: 'frigate' });
  });

  test('una v: 1 que pasó por la 1.2.1 (escrita en v: 2, con la XP que ganó allí) entra en la 1.3 con esa XP y sus niveles en cada barco', () => {
    const b = in121({ v: 1, gold: 750, upgrades: lv(2, 1, 1), ownedShips: ['sloop', 'brig'], activeShip: 'brig' });
    b.gain(0, 66);
    expect(b.row()).toEqual({ v: 2, gold: 750, upgrades: lv(2, 1, 1), ownedShips: ['sloop', 'brig'], activeShip: 'brig', xp: 66 });
    expect(parseProgress(b.row())).toEqual({ gold: 750, xp: 66, ships: { sloop: lv(2, 1, 1), brig: lv(2, 1, 1) }, activeShip: 'brig', families: [], family: 'none' });
  });
});

// PRNG determinista (mulberry32): cada fallo se reproduce con su semilla
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const SESSIONS = 2000;

// Propiedades, con QA-77 §2 como modelo pero al revés: aquí la 1.3 es la de verdad. Cada partida va 1.3 → 1.2.1 → 1.3 →
// 1.2.1 → 1.3, con compras, cambios de barco y de familia, y oro y XP en cada tramo
describe(`propiedades: ${SESSIONS} partidas 1.3 → 1.2.1 → 1.3, dos veces`, () => {
  test('tras cada escritura de la 1.2.1: v: 3, la 1.3 la lee, familias iguales, ningún nivel baja, un barco que no fue el activo en ninguna escritura queda idéntico, la Goleta y el Navío idénticos y cada compra se conserva; y la huella de la 1.3 es la de la fila que escribe (O-42 b)', () => {
    const failures: string[] = [];
    const count = { writes: 0, upgrades: 0, ships: 0, legsWithWrites: 0, legsWithout: 0 };
    for (let seed = 1; seed <= SESSIONS && failures.length < 5; seed++) {
      const r = rng(seed);
      const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
      const level = () => 1 + Math.floor(r() * 3);
      try {
        // Una partida de la 1.3: barcos al azar (al menos 1), el activo entre ellos, familias y la que usa
        const ships: SavedProgress['ships'] = {};
        for (const c of PLAYER_SHIP_ORDER) if (r() < 0.6) ships[c] = lv(level(), level(), level());
        if (Object.keys(ships).length === 0) ships[pick(PLAYER_SHIP_ORDER)] = lv(level(), level(), level());
        const families = SHIP_FAMILIES.filter(() => r() < 0.5);
        let g13: SavedProgress = {
          gold: Math.floor(r() * 20_000),
          xp: Math.floor(r() * 50_000),
          ships,
          activeShip: pick(Object.keys(ships) as PlayerShipClass[]),
          families,
          family: families.length === 0 || r() < 0.3 ? 'none' : pick(families)
        };
        for (let round = 0; round < 2; round++) {
          // La 1.3 escribe; su huella es la de la fila que relee (O-42 b): por eso no le hace falta la huella de la fila del puente
          const row13 = roundTrip(serializeProgress(g13));
          const orig = parseProgress(row13);
          if (!orig) throw new Error(`la 1.3 no relee su fila ${JSON.stringify(row13)}`);
          if (progressKey(orig) !== progressKey(g13)) throw new Error('la huella de la fila releída no es la de la memoria');

          // La 1.2.1 juega un rato
          const b = in121(row13);
          const activeAtWrite = new Set<string>();
          const paid: Record<string, Levels> = {};
          let row: Row | null = null;
          const steps = 1 + Math.floor(r() * 10);
          for (let i = 0; i < steps; i++) {
            const act = r();
            const before = b.row();
            if (act < 0.45) {
              const axis = pick(AXES);
              b.live.gold = Math.max(b.live.gold, 5000);
              if (b.buyUpgrade(axis)) {
                count.upgrades++;
                const ship = b.live.activeShip;
                paid[ship] = paid[ship] ?? lv(0, 0, 0);
                paid[ship][axis] = Math.max(paid[ship][axis], b.live.upgrades[axis]);
              }
            } else if (act < 0.6) {
              b.live.gold = Math.max(b.live.gold, 20_000);
              if (b.buyShip(pick(SHIPS_121))) count.ships++;
            } else if (act < 0.8) {
              b.select(pick(b.live.ownedShips));
            } else {
              b.gain(Math.floor(r() * 300), Math.floor(r() * 500));
            }
            row = b.row();
            if (!row || row === before) continue;
            count.writes++;
            activeAtWrite.add(row.activeShip as string);
            if (row.v !== 3) throw new Error(`la 1.2.1 escribió v: ${String(row.v)}`);
            const back = parseProgress(row);
            if (!back) throw new Error(`la 1.3 rechaza ${JSON.stringify(row)}`);
            expect([back.families, back.family]).toEqual([orig.families, orig.family]);
            expect([back.gold, back.xp, back.activeShip]).toEqual([b.live.gold, b.live.xp, b.live.activeShip]);
            for (const [c, levels] of Object.entries(orig.ships) as [PlayerShipClass, Levels][]) {
              const now = back.ships[c];
              if (!now) throw new Error(`perdió el barco ${c}`);
              for (const a of AXES) if (now[a] < levels[a]) throw new Error(`${c}.${a} bajó de ${levels[a]} a ${now[a]}`);
              if (!activeAtWrite.has(c)) expect([c, now]).toEqual([c, levels]);
            }
            for (const c of ['schooner', 'line'] as const) if (orig.ships[c]) expect([c, back.ships[c]]).toEqual([c, orig.ships[c]]);
            for (const [c, levels] of Object.entries(paid)) for (const a of AXES) if ((back.ships[c as PlayerShipClass]?.[a] ?? 0) < levels[a]) throw new Error(`perdió la compra ${c}.${a} N${levels[a]}`);
            for (const c of b.live.ownedShips) if (!back.ships[c]) throw new Error(`falta ${c}, en propiedad`);
          }

          // Vuelve la 1.3 (con la fila de la 1.2.1, o con la suya si la 1.2.1 no escribió) y juega otro rato
          count[row ? 'legsWithWrites' : 'legsWithout']++;
          const back = parseProgress(row ?? row13)!;
          expect(roundTrip(serializeProgress(back))).toEqual(row ?? row13); // la 1.3 la reescribe tal cual
          g13 = back;
          for (let i = 0; i < 1 + Math.floor(r() * 4); i++) {
            const act = r();
            const owned = Object.keys(g13.ships) as PlayerShipClass[];
            if (act < 0.25) {
              const f = pick(SHIP_FAMILIES);
              if (!g13.families.includes(f) && g13.gold >= FAMILY_PRICE) g13 = { ...g13, gold: g13.gold - FAMILY_PRICE, families: SHIP_FAMILIES.filter((x) => x === f || g13.families.includes(x)), family: f };
            } else if (act < 0.4) {
              g13 = { ...g13, family: pick<FamilyChoice>(['none', ...g13.families]) };
            } else if (act < 0.65) {
              const c = pick(owned);
              const a = pick(AXES);
              const cur = g13.ships[c]!;
              if (cur[a] < 3) g13 = { ...g13, ships: { ...g13.ships, [c]: { ...cur, [a]: cur[a] + 1 } } };
            } else if (act < 0.8) {
              const c = pick(PLAYER_SHIP_ORDER);
              if (!g13.ships[c]) g13 = { ...g13, ships: { ...g13.ships, [c]: { ...N1 } }, activeShip: c };
            } else if (act < 0.9) {
              g13 = { ...g13, activeShip: pick(owned) };
            } else {
              g13 = { ...g13, gold: Math.min(GOLD_CAP, g13.gold + Math.floor(r() * 300)), xp: Math.min(XP_CAP, g13.xp + Math.floor(r() * 500)) };
            }
          }
        }
      } catch (err) {
        failures.push(`semilla ${seed}: ${(err as Error).message.slice(0, 500)}`);
      }
    }
    console.log(
      `${SESSIONS} partidas, ${2 * SESSIONS} tramos en la 1.2.1 (${count.legsWithWrites} con escrituras, ${count.legsWithout} sin ninguna): ` +
        `${count.writes} escrituras, ${count.upgrades} mejoras y ${count.ships} barcos comprados`
    );
    expect(failures).toEqual([]);
    expect(count.legsWithWrites).toBeGreaterThan(SESSIONS); // la mayoría de los tramos escriben: la prueba no es vacía
  });

  test('3 000 filas v: 3 de la 1.3 alteradas al azar: la 1.2.1 acepta exactamente las que acepta la 1.3', () => {
    const r = rng(777);
    const pick = <T>(xs: readonly T[]): T => xs[Math.floor(r() * xs.length)];
    const base = roundTrip(serializeProgress(FULL));
    const weird: unknown[] = [0, 1, 2, 3, 4, -1, 1.5, '1', null, true, [], {}, 'none', 'gb', 'es', 'fr', 'line', 'galleon', 'toString', '__proto__', 999_999, 1_000_000, 9_999_999, 10_000_000];
    const mismatches: string[] = [];
    for (let i = 0; i < 3000; i++) {
      const row = roundTrip(base) as Record<string, any>;
      const k = Math.floor(r() * 9);
      if (k === 0) row[pick(['v', 'gold', 'xp', 'ships', 'activeShip', 'families', 'family'])] = pick(weird);
      else if (k === 1) delete row[pick(Object.keys(row))];
      else if (k === 2) row[pick(['upgrades', 'ownedShips', 'hp', 'extra'])] = pick(weird);
      else if (k === 3) {
        const ship = pick([...PLAYER_SHIP_ORDER, 'galleon', 'brigantine']);
        row.ships[ship] = { ...(row.ships[ship] ?? N1) };
        row.ships[ship][pick([...AXES, 'mast'])] = pick(weird);
      } else if (k === 4) delete row.ships[pick(PLAYER_SHIP_ORDER)];
      else if (k === 5) row.families = pick([[], ['gb'], ['es'], ['es', 'es'], ['none'], ['fr'], 'gb', null, ['gb', 'es', 'gb']]);
      else if (k === 6) row.family = pick(['none', 'gb', 'es', 'fr', null, '', ['es']]);
      else if (k === 7) row.activeShip = pick([...PLAYER_SHIP_ORDER, 'galleon', 3, null]);
      else row.ships = pick([{}, [], null, { sloop: N1 }, { line: N1 }]);
      const a13 = parseProgress(roundTrip(row)) !== null;
      const a121 = parse121(roundTrip(row)) !== null;
      if (a13 !== a121 && mismatches.length < 3) mismatches.push(`1.3=${a13} 1.2.1=${a121}: ${JSON.stringify(row)}`);
    }
    expect(mismatches).toEqual([]);
  });
});
