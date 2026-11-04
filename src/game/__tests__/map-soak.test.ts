// AC-173 (a) (BACKLOG :1616): el mapa de la 1.1 con la población del I2 y 20 bots que entran y salen del puerto durante
// 10 min simulados. Ningún NPC se atasca (> 10 s seguidos con destino y a < 0,5 m/s) ni orbita (O-70 ii: 2 o más ventanas
// seguidas de 16 s con ≥ 360° de giro y < 10 m de desplazamiento); el Capitán nace en su arco (AC-54) y las reapariciones
// caen en agua (AC-52). No pasa en verde sin medir: sin al menos 1 Capitán y 1 reaparición de pirata, de mercante y de
// cañonera, cae por «no medido». La distancia mínima de un pirata al puerto (AC-47) va al log, sin asertarla
import { CAPTAIN_LAIR_RADIUS, CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE, GUNBOAT_CLASS, MAP_1_1 } from '../constants';
import { runMapSoak, soakSummary, STUCK_LIMIT, windowLine } from './map-soak-harness';

describe('AC-173 (a) — 10 min con 20 bots en el mapa de la 1.1 con el I2', () => {
  test.each([5, 6, 7])('semilla %i: ningún NPC atascado ni en órbita, el Capitán en su arco y las reapariciones en agua', (seed) => {
    const r = runMapSoak(seed, MAP_1_1);
    console.log(soakSummary(r));
    if (r.orbitSingles.length > 0) console.log(`AC-173 (semilla ${seed}) ventanas de órbita sueltas: ${r.orbitSingles.map((w) => `${w.id} ${w.classId} (${w.pos.x.toFixed(1)}, ${w.pos.z.toFixed(1)}) ${windowLine(w.detail)}`).join(' · ')}`);

    // Medido: sin esto el test no prueba lo que dice
    const respawned = (c: string) => r.respawns.filter((x) => x.classId === c).length;
    expect({ captains: r.captains.length > 0, pirate: respawned('pirate') > 0, merchant: respawned('merchant') > 0, gunboat: respawned(GUNBOAT_CLASS) > 0 }).toEqual({
      captains: true,
      pirate: true,
      merchant: true,
      gunboat: true
    });

    // El atasco y las órbitas: la aserción da el id, la clase, el estado de IA, la posición y los segundos o ventanas
    expect(r.stuck.map((s) => `${s.id} ${s.classId} ${s.ai} (${s.pos.x.toFixed(1)}, ${s.pos.z.toFixed(1)}) ${s.seconds.toFixed(2)} s > ${STUCK_LIMIT} s`)).toEqual([]);
    expect(r.orbitRuns.map((o) => `${o.id} ${o.classId} (${o.pos.x.toFixed(1)}, ${o.pos.z.toFixed(1)}) ${o.windows} ventanas hasta t=${o.t.toFixed(0)}: ${o.detail.map(windowLine).join(' | ')}`)).toEqual([]);

    // AC-54: en su arco exterior, a ≥ 150 m de todos los jugadores y en agua
    for (const c of r.captains) {
      expect({ id: c.id, radius: Math.abs(c.radius - CAPTAIN_LAIR_RADIUS) <= 1e-6, players: c.nearestPlayer >= CAPTAIN_SPAWN_MIN_PLAYER_DISTANCE, navigable: c.navigable }).toEqual({ id: c.id, radius: true, players: true, navigable: true });
    }
    // AC-52: cada reaparición de un NPC, en agua con el margen de su casco
    expect(r.respawns.filter((x) => !x.navigable).map((x) => `${x.id} ${x.classId} t=${x.t.toFixed(0)} (${x.pos.x.toFixed(1)}, ${x.pos.z.toFixed(1)})`)).toEqual([]);
  });
});
