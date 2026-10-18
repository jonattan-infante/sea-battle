// HUD de la experiencia (1.1; GDD §10b y §14, ART-DIRECTION §12.9): lo que el panel, el aviso de nivel, el feed y el
// panel del objetivo calculan de la XP. El servidor acredita; el cliente solo lo muestra, con las funciones de xp.ts
import {
  RewardDraft,
  levelUpOf,
  levelUpText,
  mobileLevelText,
  pushGoldReward,
  pushKillReward,
  pushXpReward,
  rewardLines,
  rewardText,
  shortClassLabel,
  targetTypeLine,
  xpFill,
  xpNumbers,
  xpProgress
} from '../hud-logic';

describe('Panel del jugador: nivel, insignia y barra de XP (AC-152, §12.9)', () => {
  // El ejemplo de §12.9, «Balandra · Nivel 12» con «1 240 / 2 000 XP»: 7 240 de XP, 1 240 dentro del 12 y 2 000 hasta el 13
  test('la barra cuenta la XP dentro del nivel sobre la que falta hasta el siguiente: 7 240 de XP, nivel 12, «1240 / 2000 XP»', () => {
    expect(xpProgress(7240)).toEqual({ level: 12, rank: 3, into: 1240, span: 2000 });
    expect(xpNumbers(xpProgress(7240))).toBe('1240 / 2000 XP');
    expect(xpFill(xpProgress(7240))).toBeCloseTo(0.62, 6);
    expect(mobileLevelText(xpProgress(7240))).toBe('Nivel 12');
  });

  test('al entrar, con 0 de XP, nivel 1 de Grumete y la barra vacía', () => {
    expect(xpProgress(0)).toEqual({ level: 1, rank: 1, into: 0, span: 60 });
    expect(xpFill(xpProgress(0))).toBe(0);
    expect(mobileLevelText(xpProgress(0))).toBe('Nivel 1');
  });

  test('en los umbrales el nivel nuevo empieza con la barra vacía, y un punto antes casi llena', () => {
    expect(xpProgress(499)).toEqual({ level: 4, rank: 1, into: 199, span: 200 });
    expect(xpProgress(500)).toEqual({ level: 5, rank: 2, into: 0, span: 300 });
    expect(xpProgress(35_999)).toEqual({ level: 19, rank: 5, into: 5499, span: 5500 });
  });

  test('números con el formato del resto del HUD (es-ES, como la vida y el oro)', () => {
    expect(xpNumbers(xpProgress(31_000))).toBe('500 / 5500 XP');
    expect(xpNumbers(xpProgress(35_999))).toBe('5499 / 5500 XP');
  });

  test('en el nivel 20, la barra llena y «Nivel máximo» en lugar de los números y de «Nivel 20» en móvil', () => {
    for (const xp of [36_000, 40_000, 9_999_999]) {
      const p = xpProgress(xp);
      expect(p).toEqual({ level: 20, rank: 5, into: xp - 36_000, span: null });
      expect(xpFill(p)).toBe(1);
      expect(xpNumbers(p)).toBe('Nivel máximo');
      expect(mobileLevelText(p)).toBe('Nivel máximo');
    }
  });
});

describe('Aviso de subida de nivel (AC-151)', () => {
  test('el primer estado al entrar no es una subida, aunque traiga XP', () => {
    expect(levelUpOf(undefined, 0)).toBeNull();
    expect(levelUpOf(undefined, 8000)).toBeNull();
  });

  test('sin cambio de nivel, o con menos XP (un invitado tras un reinicio del servidor), no hay aviso', () => {
    expect(levelUpOf(500, 520)).toBeNull();
    expect(levelUpOf(520, 0)).toBeNull();
    expect(levelUpOf(8000, 8000)).toBeNull();
  });

  test('a 10 XP de subir, un pirata (30) da «¡Nivel 4!» sin cambio de insignia', () => {
    const up = levelUpOf(290, 320);
    expect(up).toEqual({ level: 4, rank: 1, rankChanged: false });
    expect(levelUpText(up!)).toBe('¡Nivel 4!');
  });

  test('con cambio de insignia, «Ahora eres <insignia>»', () => {
    expect(levelUpText(levelUpOf(490, 520)!)).toBe('¡Nivel 5! Ahora eres Marinero');
    expect(levelUpText(levelUpOf(7990, 8020)!)).toBe('¡Nivel 13! Ahora eres Teniente');
    // El caso más largo de §12.9, con el que se mide el ancho del aviso
    expect(levelUpText(levelUpOf(2390, 2420)!)).toBe('¡Nivel 9! Ahora eres Contramaestre');
  });

  test('varios niveles de golpe dan un solo aviso con el nivel final (el Capitán, 240 XP, o un jugador, 100)', () => {
    expect(levelUpOf(0, 240)).toEqual({ level: 3, rank: 1, rankChanged: false });
    expect(levelUpOf(59, 159)).toEqual({ level: 3, rank: 1, rankChanged: false });
    expect(levelUpText(levelUpOf(440, 820)!)).toBe('¡Nivel 6! Ahora eres Marinero');
  });

  test('el nivel 20 no cambia de insignia: «¡Nivel 20!»', () => {
    expect(levelUpText(levelUpOf(35_990, 36_020)!)).toBe('¡Nivel 20!');
  });
});

describe('XP en el feed (AC-152; GDD §14, «XP ganada»: cada tramo solo si es > 0)', () => {
  const at = { x: 12.5, z: -40 };
  const lines = (batch: RewardDraft[]) => rewardLines(batch).map(rewardText);

  // En el mismo frame llegan, por este orden, el hundimiento, el oro y la XP (world.ts, sinkShip)
  test('(a) NPC, quien lo hunde: «Hundiste a Pirata +105 oro · +30 XP», una sola línea', () => {
    const batch: RewardDraft[] = [];
    pushKillReward(batch, 'kill', 'Pirata', at);
    pushGoldReward(batch, 'kill', 105, at);
    pushXpReward(batch, 'kill', 30, at);
    expect(lines(batch)).toEqual(['Hundiste a Pirata +105 oro · +30 XP']);
    expect(rewardLines(batch)).toEqual([{ lead: 'Hundiste a', name: 'Pirata', gold: 105, xp: 30 }]);
  });

  test('(b) NPC, quien ayudó: «Botín +5 oro · +3 XP», y en el mercante, «Botín +5 oro» (AC-145)', () => {
    const batch: RewardDraft[] = [];
    pushGoldReward(batch, 'kill', 5, at);
    pushXpReward(batch, 'kill', 3, at);
    pushGoldReward(batch, 'kill', 5, { x: 0, z: 0 });
    expect(lines(batch)).toEqual(['Botín +5 oro · +3 XP', 'Botín +5 oro']);
  });

  test('sin XP, la línea de la 1.0: ni «· +0 XP» ni tramo de XP; restos, «Restos +30 oro»', () => {
    const batch: RewardDraft[] = [];
    pushKillReward(batch, 'kill', 'Mercante', at);
    pushGoldReward(batch, 'kill', 60, at);
    pushGoldReward(batch, 'wreck', 30, { x: 1, z: 1 });
    expect(lines(batch)).toEqual(['Hundiste a Mercante +60 oro', 'Restos +30 oro']);
  });

  test('un NPC hundido sin botín para ti no tiene línea, como en la 1.0', () => {
    const batch: RewardDraft[] = [];
    pushKillReward(batch, 'kill', 'Pirata', at);
    expect(lines(batch)).toEqual([]);
  });

  test('el oro y la XP van con su mismo hundimiento: dos hundimientos en el mismo frame no se cruzan', () => {
    const other = { x: 80, z: 15 };
    const batch: RewardDraft[] = [];
    pushKillReward(batch, 'kill', 'Pirata', at);
    pushGoldReward(batch, 'kill', 105, at);
    pushXpReward(batch, 'kill', 30, at);
    pushKillReward(batch, 'kill', 'Mercante', other);
    pushGoldReward(batch, 'kill', 60, other);
    pushXpReward(batch, 'kill', 10, other);
    expect(lines(batch)).toEqual(['Hundiste a Pirata +105 oro · +30 XP', 'Hundiste a Mercante +60 oro · +10 XP']);
  });

  test('(c) PvP, quien da el último golpe: «Hundiste a Barbarroja» con el oro y la XP que haya, también sin ninguno', () => {
    const both: RewardDraft[] = [];
    pushKillReward(both, 'pvp', 'Barbarroja', at);
    pushGoldReward(both, 'pvp', 50, at);
    pushXpReward(both, 'pvp', 100, at);
    expect(lines(both)).toEqual(['Hundiste a Barbarroja +50 oro · +100 XP']);
    const noGold: RewardDraft[] = [];
    pushKillReward(noGold, 'pvp', 'Barbarroja', at);
    pushXpReward(noGold, 'pvp', 100, at);
    expect(lines(noGold)).toEqual(['Hundiste a Barbarroja +100 XP']);
    const nothing: RewardDraft[] = [];
    pushKillReward(nothing, 'pvp', 'Barbarroja', at);
    expect(lines(nothing)).toEqual(['Hundiste a Barbarroja']);
  });

  test('(d) PvP, quien ayudó: «Ayudaste en un hundimiento +40 XP», sin nombre; con 0 XP no hay evento ni línea', () => {
    const helper: RewardDraft[] = [];
    pushXpReward(helper, 'pvp', 40, at);
    expect(lines(helper)).toEqual(['Ayudaste en un hundimiento +40 XP']);
    expect(lines([])).toEqual([]);
  });
});

describe('Panel del objetivo jugador (AC-153; GDD §14, «Panel de objetivo»)', () => {
  test('clase corta, nivel e insignia: «Balandra · Nivel 13 · Teniente»; el caso más largo, «Bergantín · Nivel 12 · Contramaestre»', () => {
    expect(targetTypeLine('sloop', 13)).toBe('Balandra · Nivel 13 · Teniente');
    expect(targetTypeLine('brig', 12)).toBe('Bergantín · Nivel 12 · Contramaestre');
    expect(targetTypeLine('frigate', 1)).toBe('Fragata · Nivel 1 · Grumete');
    expect(targetTypeLine('sloop', 20)).toBe('Balandra · Nivel 20 · Almirante');
  });

  test('el Navío de línea va en su forma corta, «Navío»', () => {
    expect(shortClassLabel('line')).toBe('Navío');
    expect(targetTypeLine('line', 17)).toBe('Navío · Nivel 17 · Almirante');
    expect(shortClassLabel('sloop')).toBe('Balandra');
  });
});
