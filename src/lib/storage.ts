import { kv } from '@vercel/kv';
import { NPC, Position } from '../types/game';

// Interfaces para datos persistentes
interface PlayerData {
  gold: number;
  cannonLevel: number;
  sailLevel: number;
}

interface MapData {
  npcs: NPC[];
  occupiedPositions: Position[];
}

// Funciones para persistencia de datos de jugador
export async function savePlayerData(playerId: string, data: PlayerData): Promise<void> {
  try {
    await kv.set(`player:${playerId}`, JSON.stringify(data));
  } catch (error) {
    console.error('Error saving player data:', error);
  }
}

export async function loadPlayerData(playerId: string): Promise<PlayerData | null> {
  try {
    const data = await kv.get(`player:${playerId}`);
    return data ? JSON.parse(data as string) : null;
  } catch (error) {
    console.error('Error loading player data:', error);
    return null;
  }
}

// Funciones para persistencia de datos de mapa
export async function saveMapData(data: MapData): Promise<void> {
  try {
    await kv.set('game-map', JSON.stringify(data));
  } catch (error) {
    console.error('Error saving map data:', error);
  }
}

export async function loadMapData(): Promise<MapData | null> {
  try {
    const data = await kv.get('game-map');
    return data ? JSON.parse(data as string) : null;
  } catch (error) {
    console.error('Error loading map data:', error);
    return null;
  }
}