import { create } from 'zustand';
import { EquipmentType, UPGRADE_COSTS, EQUIPMENT_BENEFITS } from '../types/game';
import { savePlayerData, loadPlayerData } from '../lib/storage';

interface GameStore {
  playerId: string | null;
  gold: number;
  cannonLevel: number;
  sailLevel: number;
  addGold: (amount: number) => void;
  upgradeCannon: () => boolean;
  upgradeSail: () => boolean;
  getCannonDamage: () => number;
  getSailSpeed: () => number;
  getMaxAmmo: () => number;
  // Métodos para sincronización con WebSockets
  syncGold: (newGold: number) => void;
  syncCannonLevel: (newLevel: number) => void;
  syncSailLevel: (newLevel: number) => void;
  // Métodos para reparación
  repairShip: (currentHealth: number, maxHealth: number) => boolean;
  // Métodos para persistencia
  setPlayerId: (id: string) => void;
  loadData: () => Promise<void>;
  saveData: () => Promise<void>;
}

const useGameStore = create<GameStore>((set, get) => ({
  playerId: null,
  gold: 100, // Oro inicial
  cannonLevel: 1,
  sailLevel: 1,

  addGold: (amount) => {
    set((state) => ({ gold: state.gold + amount }));
    get().saveData(); // Guardar cambios en tiempo real
  },

  upgradeCannon: () => {
    const { gold, cannonLevel } = get();
    const cost = UPGRADE_COSTS[EquipmentType.Cannon][cannonLevel - 1];
    if (gold >= cost && cannonLevel < 5) {
      set((state) => ({ gold: state.gold - cost, cannonLevel: state.cannonLevel + 1 }));
      get().saveData(); // Guardar cambios en tiempo real
      return true;
    }
    return false;
  },

  upgradeSail: () => {
    const { gold, sailLevel } = get();
    const cost = UPGRADE_COSTS[EquipmentType.Sail][sailLevel - 1];
    if (gold >= cost && sailLevel < 5) {
      set((state) => ({ gold: state.gold - cost, sailLevel: state.sailLevel + 1 }));
      get().saveData(); // Guardar cambios en tiempo real
      return true;
    }
    return false;
  },

  getCannonDamage: () => {
    const { cannonLevel } = get();
    return EQUIPMENT_BENEFITS[EquipmentType.Cannon][cannonLevel - 1]?.damage || 10;
  },

  getSailSpeed: () => {
    const { sailLevel } = get();
    return EQUIPMENT_BENEFITS[EquipmentType.Sail][sailLevel - 1]?.speed || 5;
  },

  getMaxAmmo: () => {
    const { cannonLevel } = get();
    return EQUIPMENT_BENEFITS[EquipmentType.Cannon][cannonLevel - 1]?.ammo || 10;
  },

  repairShip: (currentHealth: number, maxHealth: number) => {
    const { gold } = get();
    const damage = maxHealth - currentHealth;
    const repairCost = Math.ceil(damage * 0.5); // Costo basado en daño (0.5 oro por punto de vida perdido)
    if (gold >= repairCost && damage > 0) {
      set((state) => ({ gold: state.gold - repairCost }));
      get().saveData();
      return true;
    }
    return false;
  },

  // Métodos para sincronización con WebSockets
  syncGold: (newGold: number) => set({ gold: newGold }),

  syncCannonLevel: (newLevel: number) => set({ cannonLevel: newLevel }),

  syncSailLevel: (newLevel: number) => set({ sailLevel: newLevel }),

  // Métodos para persistencia
  setPlayerId: (id: string) => set({ playerId: id }),

  loadData: async () => {
    const { playerId } = get();
    if (!playerId) return;
    const data = await loadPlayerData(playerId);
    if (data) {
      set({
        gold: data.gold,
        cannonLevel: data.cannonLevel,
        sailLevel: data.sailLevel
      });
    }
  },

  saveData: async () => {
    const { playerId, gold, cannonLevel, sailLevel } = get();
    if (!playerId) return;
    await savePlayerData(playerId, { gold, cannonLevel, sailLevel });
  }
}));

export default useGameStore;