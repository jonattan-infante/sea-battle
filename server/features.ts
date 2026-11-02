// Interruptores del servidor (AC-187). Los decide el entorno del proceso, nunca el cliente: ninguna intención los lleva y
// los parsers del protocolo rechazan cualquier campo de más (AC-05)
import { MAP_1_0, MAP_1_1, MapDef } from '../src/game/constants';

type Env = Record<string, string | undefined>;

// I2 (hoy, el Capitán pirata): solo SEA_BATTLE_I2=1 lo enciende. Ausente, como en staging y prod, está apagado y el juego
// es el de la 1.0.3. Encenderlo allí lo decide Jonattan (TECH-ARCHITECTURE §5)
export function i2Enabled(env: Env = process.env): boolean {
  return env.SEA_BATTLE_I2 === '1';
}

// Mapa del mundo (1.2, piloto del mapa): solo SEA_BATTLE_MAP=1.1 pone el de la 1.1 (constants.ts, MAP_1_1). Ausente, como
// en staging y prod, o con cualquier otro valor, el de la 1.0; el arranque avisa si el valor no se reconoce (bootstrap.ts)
export type MapId = '1.0' | '1.1';

export function mapId(env: Env = process.env): MapId {
  return env.SEA_BATTLE_MAP === '1.1' ? '1.1' : '1.0';
}

export function mapOfId(id: MapId): MapDef {
  return id === '1.1' ? MAP_1_1 : MAP_1_0;
}
