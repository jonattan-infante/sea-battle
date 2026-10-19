// Interruptores del servidor (AC-187). Los decide el entorno del proceso, nunca el cliente: ninguna intención los lleva y
// los parsers del protocolo rechazan cualquier campo de más (AC-05)
type Env = Record<string, string | undefined>;

// I2 (hoy, el Capitán pirata): solo SEA_BATTLE_I2=1 lo enciende. Ausente, como en staging y prod, está apagado y el juego
// es el de la 1.0.3. Encenderlo allí lo decide Jonattan (TECH-ARCHITECTURE §5)
export function i2Enabled(env: Env = process.env): boolean {
  return env.SEA_BATTLE_I2 === '1';
}
