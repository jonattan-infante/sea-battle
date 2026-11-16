// AD-37 (a) (ART-DIRECTION, fila AD-37; §9.2, «Rasgos de silueta»; BACKLOG, «3. O-D106-5», parte de AC-165): dos clases del mismo
// `look` (jugador, pirata o pasivo) se distinguen por ≥ 2 rasgos de silueta de S1–S6, y al menos uno es S2, S3, S4 o S6, los que
// sobreviven en LOD1. Además, la caída de los palos es la del canal de facción: 0° en jugador y pasivos, de 4 a 8° en pirata.
// Sin WebGL, sobre las recetas reales de SHIP_RECIPES (las del procedural, que son las de cada clase sin familia; los GLB de las
// familias llevan los palos y la arboladura de su clase, AC-194 b). Los rasgos se leen de la receta, no se copian:
// - S1, eslora: `L`; cuenta si el cociente entre las 2 es ≥ 1,25.
// - S2, palos: el número de `masts`.
// - S3, aparejo: de proa (z mayor) a popa, la vela baja de cada palo, la que tiene el punto más bajo: cangreja G (el menor y de
//   A y D), latina T (el menor y de A y B) o cuadra Q (la `yb` menor). Así, el trinquete de la Goleta, con cangreja y gavia
//   encima, es G, y la mesana del Navío, con latina y una cuadra arriba, T.
// - S4, castillos: las cajas `castle` a popa (z < 0) y a proa (z > 0): ninguna; 1 a popa, camareta de popa; 1 a popa y 1 a proa,
//   alcázar y castillo de proa; 2 apiladas a popa y 1 a proa, popa alta (alcázar de 2 pisos) y castillo de proa. El mascarón
//   (`figurehead`) y los faroles (`lantern`) no son castillos.
// - S5, perfil del casco: `profile` (estándar, fino, lleno o chato; ASSET-SPEC §8.1).
// - S6, franjas de portas: las que pinta loftHull, `bands.length` o 1 sin `bands` (también sin portas en el costado: la franja va
//   entre 0,30·F y 0,55·F bajo el canto).
// La tabla de pares de §9.2 va escrita aquí, como AC-04: cada rasgo que da para un par tiene que diferir en las recetas, con su
// cociente de esloras. La tabla no es exhaustiva (la Balandra y la Goleta difieren también en S4: camareta frente a ninguno), así
// que la regla de AD-37 (a) se comprueba con los rasgos medidos, en todos los pares del mismo `look`, no solo en los de la tabla
import { SHIP_RECIPES, ShipRecipe } from '../ship-geometry';

type Trait = 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6';
const LOD1_TRAITS: Trait[] = ['S2', 'S3', 'S4', 'S6'];

interface Silhouette {
  L: number;
  masts: number;
  rig: string; // S3, como «Q·Q·G»
  castles: string; // S4
  profile: string;
  bands: number;
  rakeDeg: number;
}

const lowerSail = (m: ShipRecipe['masts'][number]): string => {
  const sails: [string, number][] = [];
  if (m.gaff) sails.push(['G', Math.min(m.gaff.A[1], m.gaff.D[1])]);
  if (m.lateen) sails.push(['T', Math.min(m.lateen.A[1], m.lateen.B[1])]);
  if (m.squares?.length) sails.push(['Q', Math.min(...m.squares.map((s) => s.yb))]);
  if (!sails.length) throw new Error('un palo sin velas');
  return sails.sort((a, b) => a[1] - b[1])[0][0];
};

const CASTLES: Record<string, string> = {
  '0-0': 'ninguno',
  '1-0': 'camareta de popa',
  '1-1': 'alcázar y castillo de proa',
  '2-1': 'popa alta y castillo de proa'
};

function silhouette(r: ShipRecipe): Silhouette {
  const castles = r.boxes.filter((b) => b.kind === 'castle');
  const key = `${castles.filter((b) => b.pos[2] < 0).length}-${castles.filter((b) => b.pos[2] > 0).length}`;
  return {
    L: r.L,
    masts: r.masts.length,
    rig: [...r.masts].sort((a, b) => b.z - a.z).map(lowerSail).join('·'),
    castles: CASTLES[key] ?? `otro (${key})`,
    profile: r.profile,
    bands: r.bands ? r.bands.length : 1,
    rakeDeg: (r.rake * 180) / Math.PI
  };
}

function differing(a: Silhouette, b: Silhouette): Trait[] {
  const out: Trait[] = [];
  if (Math.max(a.L, b.L) / Math.min(a.L, b.L) >= 1.25) out.push('S1');
  if (a.masts !== b.masts) out.push('S2');
  if (a.rig !== b.rig) out.push('S3');
  if (a.castles !== b.castles) out.push('S4');
  if (a.profile !== b.profile) out.push('S5');
  if (a.bands !== b.bands) out.push('S6');
  return out;
}

const ids = Object.keys(SHIP_RECIPES);
const sil = Object.fromEntries(ids.map((id) => [id, silhouette(SHIP_RECIPES[id])])) as Record<string, Silhouette>;
const pairs = ids.flatMap((a, i) => ids.slice(i + 1).filter((b) => SHIP_RECIPES[a].look === SHIP_RECIPES[b].look).map((b) => [a, b] as const));

// §9.2, «Rasgos de silueta»: [clase, clase, rasgos que difieren, cociente de esloras tal como lo escribe la tabla]
const TABLE_9_2: [string, string, Trait[], number][] = [
  ['sloop', 'schooner', ['S1', 'S2', 'S3'], 1.38],
  ['schooner', 'brig', ['S3', 'S4'], 1.09], // S1 no cuenta
  ['sloop', 'brig', ['S1', 'S2', 'S3'], 1.5],
  ['brig', 'frigate', ['S1', 'S2', 'S4'], 1.42],
  ['schooner', 'frigate', ['S1', 'S2', 'S3', 'S4'], 1.55],
  ['frigate', 'line', ['S3', 'S4', 'S6'], 1.235], // S1 no cuenta (GDD §6)
  ['merchant', 'galleon', ['S1', 'S2', 'S3'], 1.64],
  ['pirate', 'captain', ['S1', 'S2', 'S4'], 1.5],
  ['pirate', 'gunboat', ['S1', 'S2', 'S5'], 1.4]
];
// Los valores de cada clase que la tabla nombra: palos (S2), aparejo (S3), castillos (S4) y franjas (S6)
const VALUES_9_2: Record<string, Partial<Pick<Silhouette, 'masts' | 'rig' | 'castles' | 'bands'>>> = {
  sloop: { masts: 1, rig: 'G' },
  schooner: { masts: 2, rig: 'G·G', castles: 'ninguno' },
  brig: { masts: 2, rig: 'Q·G', castles: 'camareta de popa' },
  frigate: { masts: 3, rig: 'Q·Q·G', castles: 'alcázar y castillo de proa', bands: 1 },
  line: { masts: 3, rig: 'Q·Q·T', castles: 'popa alta y castillo de proa', bands: 2 },
  merchant: { masts: 3, rig: 'Q·Q·T' }
};
// Las clases de la tabla que aún no tienen receta: el Galeón del tesoro (pasivo, §10.1) no existe todavía como entidad
const NOT_YET = ['galleon'];

describe('AD-37 (a): las clases del mismo look se distinguen por la silueta (§9.2)', () => {
  test('los valores de §9.2 de cada clase (palos, aparejo, castillos y franjas) son los de su receta', () => {
    for (const [id, want] of Object.entries(VALUES_9_2)) expect([id, Object.fromEntries(Object.keys(want).map((k) => [k, sil[id][k as keyof Silhouette]]))]).toEqual([id, want]);
  });

  test('cada rasgo que la tabla de §9.2 da a un par difiere en las recetas, con el cociente de esloras de la tabla', () => {
    for (const [a, b, traits, ratio] of TABLE_9_2) {
      if (!SHIP_RECIPES[a] || !SHIP_RECIPES[b]) {
        expect([a, b].filter((id) => !SHIP_RECIPES[id])).toEqual(expect.arrayContaining([expect.stringMatching(new RegExp(`^(${NOT_YET.join('|')})$`))]));
        continue;
      }
      const L = Math.max(sil[a].L, sil[b].L) / Math.min(sil[a].L, sil[b].L);
      const decimals = String(ratio).split('.')[1]?.length ?? 0;
      expect([a, b, Number(L.toFixed(decimals))]).toEqual([a, b, ratio]);
      expect([a, b, differing(sil[a], sil[b])]).toEqual([a, b, expect.arrayContaining(traits)]);
    }
  });

  test.each(pairs)('%s – %s: ≥ 2 rasgos distintos, con al menos uno de S2, S3, S4 o S6', (a, b) => {
    const d = differing(sil[a], sil[b]);
    console.log(`AD-37 (a) ${SHIP_RECIPES[a].look}: ${a} – ${b} · ${d.join(', ') || 'ninguno'} (S1 ${(Math.max(sil[a].L, sil[b].L) / Math.min(sil[a].L, sil[b].L)).toFixed(3)}; S3 ${sil[a].rig} / ${sil[b].rig}; S4 ${sil[a].castles} / ${sil[b].castles})`);
    expect(d.length).toBeGreaterThanOrEqual(2);
    expect(d.filter((t) => LOD1_TRAITS.includes(t)).length).toBeGreaterThanOrEqual(1);
  });

  test('la caída de los palos: 0° en jugador y pasivos, de 4 a 8° en pirata', () => {
    for (const id of ids) {
      const { look } = SHIP_RECIPES[id];
      const rake = sil[id].rakeDeg;
      if (look === 'pirate') expect([id, rake >= 4 - 1e-9 && rake <= 8 + 1e-9]).toEqual([id, true]);
      else expect([id, rake]).toEqual([id, 0]);
    }
  });

  test('los pares del mismo look son los 10 del jugador y los 3 del pirata; el pasivo (el mercante) aún no tiene pareja', () => {
    expect(pairs.map(([a, b]) => `${a}-${b}`).sort()).toEqual(
      ['sloop-brig', 'sloop-schooner', 'sloop-frigate', 'sloop-line', 'brig-schooner', 'brig-frigate', 'brig-line', 'schooner-frigate', 'schooner-line', 'frigate-line', 'pirate-captain', 'pirate-gunboat', 'captain-gunboat'].sort()
    );
  });
});
