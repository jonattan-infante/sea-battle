// Interruptores del servidor (AC-187, AC-210). Los decide el entorno del proceso, nunca el cliente: ninguna intención los
// lleva y los parsers del protocolo rechazan cualquier campo de más (AC-05). Desde la 1.2, sin ninguna variable, como en
// staging y prod, el servidor corre lo que sale: el mapa de la 1.1 y el I2 encendidos (AC-210 a). Apagarlos es solo la
// palanca de emergencia de E-1 (BACKLOG, AC-210 d), y en prod solo con una orden del dueño
import { GAME_MAP, MAP_1_0, MAP_1_1, MapDef } from '../src/game/constants';

type Env = Record<string, string | undefined>;

// I2 (hoy, el Capitán pirata y las cañoneras): encendido por defecto. Solo SEA_BATTLE_I2=0 lo apaga; con 1, ausente o vacía
// sigue encendido, y con cualquier otro valor también, y el arranque lo avisa (unrecognizedSwitches)
export function i2Enabled(env: Env = process.env): boolean {
  return env.SEA_BATTLE_I2 !== '0';
}

// Mapa del mundo: por defecto, el del juego (constants.ts, GAME_MAP, que es MAP_1_1). Solo SEA_BATTLE_MAP=1.0 vuelve al de la
// 1.0; con 1.1, ausente o vacía queda el de la 1.1, y con cualquier otro valor también, y el arranque lo avisa
// (unrecognizedSwitches)
export type MapId = '1.0' | '1.1';
const DEFAULT_MAP: MapId = GAME_MAP === MAP_1_0 ? '1.0' : '1.1';

export function mapId(env: Env = process.env): MapId {
  return env.SEA_BATTLE_MAP === '1.0' ? '1.0' : DEFAULT_MAP;
}

export function mapOfId(id: MapId): MapDef {
  return id === '1.1' ? MAP_1_1 : MAP_1_0;
}

// Los valores que se reconocen: el que apaga (la palanca) y el que deja lo de por defecto dicho en voz alta. Vacía cuenta
// como ausente
const KNOWN: Record<'SEA_BATTLE_I2' | 'SEA_BATTLE_MAP', readonly string[]> = { SEA_BATTLE_I2: ['0', '1'], SEA_BATTLE_MAP: ['1.0', '1.1'] };

// Los avisos del arranque (bootstrap.ts): un interruptor con un valor que no se reconoce se queda con lo de por defecto
export function unrecognizedSwitches(env: Env = process.env): string[] {
  const out: string[] = [];
  const i2 = env.SEA_BATTLE_I2;
  if (i2 && !KNOWN.SEA_BATTLE_I2.includes(i2)) out.push(`Aviso: SEA_BATTLE_I2=«${i2}» no se reconoce (solo 0 lo apaga): I2 encendido`);
  const map = env.SEA_BATTLE_MAP;
  if (map && !KNOWN.SEA_BATTLE_MAP.includes(map)) out.push(`Aviso: SEA_BATTLE_MAP=«${map}» no se reconoce (solo 1.0 lo cambia): mapa 1.1`);
  return out;
}
