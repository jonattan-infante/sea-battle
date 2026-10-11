import { Position, NPC, NPCType } from '../types/game';

// Estado del mapa (temporal, en producción usar Redis/DB)
let occupiedPositions: Position[] = [];
const MAP_WIDTH = 1000;
const MAP_HEIGHT = 1000;

// Función para calcular distancia entre dos posiciones
export function calculateDistance(pos1: Position, pos2: Position): number {
  return Math.sqrt(Math.pow(pos1.x - pos2.x, 2) + Math.pow(pos1.y - pos2.y, 2));
}

// Función para generar posición aleatoria libre
export function generateRandomFreePosition(): Position {
  const maxAttempts = 100;
  for (let i = 0; i < maxAttempts; i++) {
    const x = Math.floor(Math.random() * MAP_WIDTH);
    const y = Math.floor(Math.random() * MAP_HEIGHT);
    const position = { x, y };

    // Verificar si la posición está ocupada
    const isOccupied = occupiedPositions.some(pos =>
      calculateDistance(pos, position) < 20 // Margen de seguridad
    );

    if (!isOccupied) {
      occupiedPositions.push(position);
      return position;
    }
  }
  // Si no encuentra posición libre, devolver posición aleatoria
  return { x: Math.floor(Math.random() * MAP_WIDTH), y: Math.floor(Math.random() * MAP_HEIGHT) };
}

// Función para generar NPC
export function generateNPC(): NPC {
  const position = generateRandomFreePosition();
  const types = [NPCType.Pirate, NPCType.Merchant];
  const type = types[Math.floor(Math.random() * types.length)];
  const rewardGold = type === NPCType.Pirate ? Math.floor(Math.random() * 50) + 10 : Math.floor(Math.random() * 30) + 5;
  const pirateNames = ['Black Pearl', 'Flying Dutchman', 'Queen Anne\'s Revenge', 'Calico Jack', 'Barbarossa', 'Captain Kidd'];

  return {
    id: `npc_${Date.now()}_${Math.random()}`,
    name: pirateNames[Math.floor(Math.random() * pirateNames.length)],
    type,
    position,
    health: 100,
    rewardGold,
    lastUpdated: new Date()
  };
}

// Función para calcular daño (simplificada)
export function calculateDamage(baseDamage: number, armor: number = 0): number {
  return Math.max(1, baseDamage - armor);
}

// Función para limpiar posiciones ocupadas
export function clearOccupiedPositions(): void {
  occupiedPositions = [];
}

// Función para obtener posiciones ocupadas (para testing)
export function getOccupiedPositions(): Position[] {
  return [...occupiedPositions];
}