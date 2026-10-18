// Interruptores del servidor (AC-187). Los decide el entorno del proceso, nunca el cliente: ninguna intención los lleva y
// los parsers del protocolo rechazan cualquier campo de más (AC-05)
type Env = Record<string, string | undefined>;

// I2 (hoy, el Capitán pirata): solo SEA_BATTLE_I2=1 lo enciende. Ausente, como en staging y prod, está apagado y el juego
// es el de la 1.0.3. Encenderlo allí lo decide Jonattan (TECH-ARCHITECTURE §5)
export function i2Enabled(env: Env = process.env): boolean {
  return env.SEA_BATTLE_I2 === '1';
}

// La Goleta y el Navío de línea (AC-201): solo SEA_BATTLE_NEW_SHIPS=1 los pone a la venta, aparte del I2 (son dos decisiones
// distintas). Apagado, el astillero es el de la 1.0.3 y quien ya los tiene los sigue usando. Encenderlo lo decide Jonattan
export function newShipsEnabled(env: Env = process.env): boolean {
  return env.SEA_BATTLE_NEW_SHIPS === '1';
}
