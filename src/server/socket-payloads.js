// Validación de payloads de Socket.IO: el servidor nunca confía en la forma de los datos del cliente.
// Cada parse* devuelve un objeto saneado (solo campos conocidos) o null si el payload es inválido.

const MAX_ID_LENGTH = 128;
const MAX_DAMAGE = 100; // vida máxima de un barco

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isId(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_ID_LENGTH;
}

function isFiniteNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function parsePosition(value) {
  if (!isPlainObject(value) || !isFiniteNumber(value.x) || !isFiniteNumber(value.y)) return null;
  return { x: value.x, y: value.y };
}

function parsePlayerJoin(data) {
  if (!isPlainObject(data) || !isId(data.playerId) || !isId(data.shipId)) return null;
  return { playerId: data.playerId, shipId: data.shipId };
}

function parseShipPositionUpdate(data) {
  if (!isPlainObject(data) || !isId(data.shipId)) return null;
  const position = parsePosition(data.position);
  if (!position) return null;
  if (data.rotation !== undefined && !isFiniteNumber(data.rotation)) return null;
  if (data.health !== undefined && !isFiniteNumber(data.health)) return null;

  const update = { shipId: data.shipId, position };
  if (data.rotation !== undefined) update.rotation = data.rotation;
  if (data.health !== undefined) update.health = data.health;
  return update;
}

function parseFireBullet(data) {
  if (!isPlainObject(data) || !isId(data.shipId)) return null;
  const position = parsePosition(data.position);
  const direction = parsePosition(data.direction);
  if (!position || !direction) return null;
  return { shipId: data.shipId, position, direction };
}

function parseShipDamage(data) {
  if (!isPlainObject(data) || !isId(data.shipId)) return null;
  // Daño ≤ 0 sería curación remota; el límite evita destrucciones instantáneas arbitrarias
  if (!isFiniteNumber(data.damage) || data.damage <= 0 || data.damage > MAX_DAMAGE) return null;
  return { shipId: data.shipId, damage: data.damage };
}

function parseNpcDestroyed(data) {
  if (!isPlainObject(data) || !isId(data.npcId) || !isId(data.playerId)) return null;
  if (!isFiniteNumber(data.goldReward) || data.goldReward < 0) return null;
  return { npcId: data.npcId, goldReward: data.goldReward, playerId: data.playerId };
}

// Registra un handler que solo recibe payloads válidos y cuyos errores no tumban el proceso
function onValidated(socket, event, parse, handler) {
  socket.on(event, (raw) => {
    const data = parse(raw);
    if (!data) {
      console.warn(`⚠️ Payload inválido en '${event}' desde ${socket.id}`);
      return;
    }
    try {
      handler(data);
    } catch (err) {
      console.error(`❌ Error en handler '${event}' (${socket.id}):`, err);
    }
  });
}

module.exports = {
  onValidated,
  parsePlayerJoin,
  parseShipPositionUpdate,
  parseFireBullet,
  parseShipDamage,
  parseNpcDestroyed
};
