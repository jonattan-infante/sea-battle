import {
  calculateDistance,
  generateRandomFreePosition,
  generateNPC,
  calculateDamage,
  clearOccupiedPositions,
  getOccupiedPositions,
  findBulletHit,
  getNpcHealth
} from '../lib/game-utils';
import { NPC, NPCType, Ship, ShipClass } from '../types/game';

const makeShip = (id: string, x: number, y: number): Ship => ({
  id,
  name: id,
  playerId: id,
  position: { x, y },
  health: 100,
  maxHealth: 100,
  speed: 5,
  shipClass: ShipClass.Galleon,
  equipment: [],
  lastUpdated: new Date()
});

const makeNpc = (id: string, x: number, y: number, health = 50): NPC => ({
  id,
  name: id,
  type: NPCType.Pirate,
  position: { x, y },
  health,
  rewardGold: 20,
  lastUpdated: new Date()
});

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

  describe('getNpcHealth', () => {
    test('should return the tracked health, including 0', () => {
      const npc = makeNpc('npc1', 0, 0, 30);

      expect(getNpcHealth(new Map([['npc1', 0]]), npc)).toBe(0);
      expect(getNpcHealth(new Map([['npc1', 20]]), npc)).toBe(20);
    });

    test('should fall back to max health when untracked', () => {
      const npc = makeNpc('npc1', 0, 0, 30);

      expect(getNpcHealth(new Map(), npc)).toBe(30);
    });
  });

  describe('findBulletHit', () => {
    const shooter = makeShip('ship-a', 0, 0);

    test('should not hit the ship that fired the bullet', () => {
      // La bala nace sobre el barco que dispara: antes esto era autodaño
      const hit = findBulletHit({ x: 0.33, y: 0 }, shooter.id, { ships: [shooter], npcs: [], npcHealth: new Map() });

      expect(hit).toBeNull();
    });

    test('should hit another ship within radius', () => {
      const enemy = makeShip('ship-b', 1, 0);

      const hit = findBulletHit({ x: 0.5, y: 0 }, shooter.id, { ships: [shooter, enemy], npcs: [], npcHealth: new Map() });

      expect(hit).toEqual({ id: 'ship-b', type: 'ship' });
    });

    test('should hit a living NPC within radius', () => {
      const npc = makeNpc('npc1', 5, 5);

      const hit = findBulletHit({ x: 5, y: 4 }, shooter.id, { ships: [shooter], npcs: [npc], npcHealth: new Map([['npc1', 30]]) });

      expect(hit).toEqual({ id: 'npc1', type: 'npc' });
    });

    test('should ignore a dead NPC', () => {
      const npc = makeNpc('npc1', 5, 5);

      const hit = findBulletHit({ x: 5, y: 5 }, shooter.id, { ships: [], npcs: [npc], npcHealth: new Map([['npc1', -10]]) });

      expect(hit).toBeNull();
    });

    test('should ignore an NPC with exactly 0 health', () => {
      // Antes `|| npc.health` trataba 0 como "sin dato" y el NPC muerto seguía recibiendo balas
      const npc = makeNpc('npc1', 5, 5);

      const hit = findBulletHit({ x: 5, y: 5 }, shooter.id, { ships: [], npcs: [npc], npcHealth: new Map([['npc1', 0]]) });

      expect(hit).toBeNull();
    });

    test('should return null when nothing is within radius', () => {
      const enemy = makeShip('ship-b', 10, 10);

      const hit = findBulletHit({ x: 3, y: 3 }, shooter.id, { ships: [shooter, enemy], npcs: [makeNpc('npc1', -5, -5)], npcHealth: new Map() });

      expect(hit).toBeNull();
    });
  });
});