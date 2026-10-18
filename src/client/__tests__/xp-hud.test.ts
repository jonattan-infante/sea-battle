// HUD de la experiencia (1.1; GDD §10b y §14, ART-DIRECTION §12.9): lo que el panel, el aviso de nivel, el feed y el
// panel del objetivo calculan de la XP. El servidor acredita; el cliente solo lo muestra, con las funciones de xp.ts
import {
  RewardDraft,
  levelUpOf,
  levelUpText,
  mobileLevelText,
  pushGoldReward,
  pushXpReward,
  rewardText,
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

describe('XP en el feed (AC-152; GDD §14: con 0 XP no sale nada de XP)', () => {
  const at = { x: 12.5, z: -40 };
  const lines = (batch: RewardDraft[]) => batch.map(rewardText);

  test('hundir un pirata: «Hundiste a Pirata +105 oro · +30 XP», una sola línea con el oro y la XP', () => {
    const batch: RewardDraft[] = [];
    pushGoldReward(batch, 'kill', 105, at, 'Pirata');
    pushXpReward(batch, 'kill', 30, at, 'Pirata');
    expect(lines(batch)).toEqual(['Hundiste a Pirata +105 oro · +30 XP']);
    expect(batch[0]).toMatchObject({ lead: 'Hundiste a', name: 'Pirata', gold: 105, xp: 30 });
  });

  test('sin XP, la línea de la 1.0 tal cual: ni «· +0 XP» ni tramo de XP', () => {
    const batch: RewardDraft[] = [];
    pushGoldReward(batch, 'kill', 60, at, 'Mercante');
    expect(lines(batch)).toEqual(['Hundiste a Mercante +60 oro']);
    pushGoldReward(batch, 'kill', 5, { x: 0, z: 0 }, null); // mercante con < 10 % del daño: oro y 0 XP (AC-145)
    pushGoldReward(batch, 'wreck', 30, { x: 1, z: 1 }, null);
    expect(lines(batch)).toEqual(['Hundiste a Mercante +60 oro', 'Botín +5 oro', 'Restos +30 oro']);
  });

  test('la XP va con el oro de su mismo hundimiento: dos hundimientos en el mismo frame no se cruzan', () => {
    const other = { x: 80, z: 15 };
    const batch: RewardDraft[] = [];
    pushGoldReward(batch, 'kill', 105, at, 'Pirata');
    pushXpReward(batch, 'kill', 30, at, 'Pirata');
    pushGoldReward(batch, 'kill', 12, other, 'Pirata');
    pushXpReward(batch, 'kill', 4, other, 'Pirata');
    expect(lines(batch)).toEqual(['Hundiste a Pirata +105 oro · +30 XP', 'Hundiste a Pirata +12 oro · +4 XP']);
  });

  test('en PvP: el oro de quien da el último golpe con su XP, y la XP sin oro de quien ayudó (propuesta, pendiente de producto)', () => {
    const killer: RewardDraft[] = [];
    pushGoldReward(killer, 'pvp', 50, at, 'Barbarroja');
    pushXpReward(killer, 'pvp', 100, at, 'Barbarroja');
    expect(lines(killer)).toEqual(['Botín de combate +50 oro · +100 XP']);
    const helper: RewardDraft[] = [];
    pushXpReward(helper, 'pvp', 40, at, null);
    expect(lines(helper)).toEqual(['Botín de combate +40 XP']);
  });
});

describe('Panel del objetivo jugador (AC-153)', () => {
  test('«Jugador · Nivel 13 · Teniente», y el rango más largo, «Jugador · Nivel 12 · Contramaestre»', () => {
    expect(targetTypeLine(13)).toBe('Jugador · Nivel 13 · Teniente');
    expect(targetTypeLine(12)).toBe('Jugador · Nivel 12 · Contramaestre');
    expect(targetTypeLine(1)).toBe('Jugador · Nivel 1 · Grumete');
    expect(targetTypeLine(20)).toBe('Jugador · Nivel 20 · Almirante');
  });
});
