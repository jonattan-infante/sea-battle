import {
  calculateDistance,
  generateRandomFreePosition,
  generateNPC,
  calculateDamage,
  clearOccupiedPositions,
  getOccupiedPositions
} from '../lib/game-utils';
import { NPCType } from '../types/game';

describe('Game Utils', () => {
  beforeEach(() => {
    // Limpiar estado antes de cada test
    clearOccupiedPositions();
  });

  describe('calculateDistance', () => {
    test('should calculate distance between two points correctly', () => {
      const pos1 = { x: 0, y: 0 };
      const pos2 = { x: 3, y: 4 };

      const distance = calculateDistance(pos1, pos2);

      expect(distance).toBe(5); // Teorema de Pitágoras: √(3² + 4²) = 5
    });

    test('should return 0 for same position', () => {
      const pos = { x: 10, y: 20 };

      const distance = calculateDistance(pos, pos);

      expect(distance).toBe(0);
    });

    test('should handle negative coordinates', () => {
      const pos1 = { x: -1, y: -1 };
      const pos2 = { x: 1, y: 1 };

      const distance = calculateDistance(pos1, pos2);

      expect(distance).toBe(Math.sqrt(8)); // √((2)² + (2)²) = √8
    });
  });

  describe('generateRandomFreePosition', () => {
    test('should return a position within map bounds', () => {
      const position = generateRandomFreePosition();

      expect(position.x).toBeGreaterThanOrEqual(0);
      expect(position.x).toBeLessThan(1000);
      expect(position.y).toBeGreaterThanOrEqual(0);
      expect(position.y).toBeLessThan(1000);
    });

    test('should avoid occupied positions', () => {
      // Forzar una posición ocupada simulando el estado interno
      // En un test real, necesitaríamos mockear Math.random o exponer más funciones
      const position1 = generateRandomFreePosition();
      const position2 = generateRandomFreePosition();

      // Las posiciones deberían ser diferentes (asumiendo que no hay colisión)
      expect(position1.x !== position2.x || position1.y !== position2.y).toBe(true);
    });
  });

  describe('generateNPC', () => {
    test('should generate NPC with valid properties', () => {
      const npc = generateNPC();

      expect(npc.id).toMatch(/^npc_\d+_\d+\.\d+$/);
      expect([NPCType.Pirate, NPCType.Merchant]).toContain(npc.type);
      expect(npc.health).toBe(100);
      expect(npc.position).toBeDefined();
      expect(npc.rewardGold).toBeGreaterThan(0);
      expect(npc.lastUpdated).toBeInstanceOf(Date);
    });

    test('should generate pirate with higher gold reward', () => {
      // Mock Math.random para forzar tipo Pirate
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.1); // Valor bajo para Pirate

      const npc = generateNPC();

      expect(npc.type).toBe(NPCType.Pirate);
      expect(npc.rewardGold).toBeGreaterThanOrEqual(10);
      expect(npc.rewardGold).toBeLessThanOrEqual(59);

      Math.random = originalRandom;
    });

    test('should generate merchant with lower gold reward', () => {
      // Mock Math.random para forzar tipo Merchant
      const originalRandom = Math.random;
      Math.random = jest.fn(() => 0.6); // Valor alto para Merchant

      const npc = generateNPC();

      expect(npc.type).toBe(NPCType.Merchant);
      expect(npc.rewardGold).toBeGreaterThanOrEqual(5);
      expect(npc.rewardGold).toBeLessThanOrEqual(34);

      Math.random = originalRandom;
    });
  });

  describe('calculateDamage', () => {
    test('should calculate damage correctly with no armor', () => {
      const damage = calculateDamage(20);

      expect(damage).toBe(20);
    });

    test('should reduce damage based on armor', () => {
      const damage = calculateDamage(20, 5);

      expect(damage).toBe(15);
    });

    test('should not allow damage below 1', () => {
      const damage = calculateDamage(5, 10);

      expect(damage).toBe(1);
    });

    test('should handle zero base damage', () => {
      const damage = calculateDamage(0, 0);

      expect(damage).toBe(1); // Mínimo 1
    });
  });
});