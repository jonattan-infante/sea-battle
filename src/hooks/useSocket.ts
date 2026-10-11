import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAuth } from '@clerk/nextjs';
import { Position } from '../types/game';

export interface ShipPositionUpdateEvent {
  shipId: string;
  position: Position;
  rotation?: number;
  health?: number;
  socketId?: string;
}

export interface BulletFiredEvent {
  position: Position;
  direction: Position;
  shipId: string;
  socketId?: string;
}

export interface ShipDamagedEvent {
  shipId: string;
  damage: number;
  newHealth?: number;
}

interface UseSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  joinGame: (playerId: string, shipId: string) => void;
  updateShipPosition: (shipId: string, position: Position) => void;
  fireBullet: (position: Position, direction: Position, shipId: string) => void;
  damageShip: (shipId: string, damage: number) => void;
  destroyNpc: (npcId: string, goldReward: number, playerId: string) => void;
  onShipPositionUpdate: (callback: (data: ShipPositionUpdateEvent) => void) => void;
  onBulletFired: (callback: (data: BulletFiredEvent) => void) => void;
  onShipDamaged: (callback: (data: ShipDamagedEvent) => void) => void;
  onNpcDestroyed: (callback: (data: { npcId: string; goldReward: number; playerId: string }) => void) => void;
  onGameStateUpdate: (callback: (data: { type: string; data: any }) => void) => void;
}

export const useSocket = (): UseSocketReturn => {
  const { getToken, isLoaded, userId } = useAuth();
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Crear el socket una vez (sin conectar): auth con JWT fresco de Clerk en cada intento
  useEffect(() => {
    const socketUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
    const socket = io(socketUrl, {
      autoConnect: false,
      transports: ['websocket', 'polling'],
      auth: (cb) => {
        getToken()
          .then((token) => cb({ token: token ?? undefined }))
          .catch(() => cb({}));
      }
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
    });

    socket.on('connect_error', (error) => {
      console.error('Error de conexión Socket.io:', error.message);
      setIsConnected(false);
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, []); // getToken se captura a propósito: se invoca en cada intento de conexión

  // Conectar solo con usuario autenticado
  useEffect(() => {
    const socket = socketRef.current;
    if (!socket) return;
    if (isLoaded && userId) {
      socket.connect();
    } else if (socket.connected) {
      socket.disconnect();
    }
  }, [isLoaded, userId]);

  const joinGame = (playerId: string, shipId: string) => {
    socketRef.current?.emit('player_join', { playerId, shipId });
  };

  const updateShipPosition = (shipId: string, position: Position) => {
    socketRef.current?.emit('ship_position_update', { shipId, position });
  };

  const fireBullet = (position: Position, direction: Position, shipId: string) => {
    socketRef.current?.emit('fire_bullet', { position, direction, shipId });
  };

  const damageShip = (shipId: string, damage: number) => {
    socketRef.current?.emit('ship_damage', { shipId, damage });
  };

  const destroyNpc = (npcId: string, goldReward: number, playerId: string) => {
    socketRef.current?.emit('npc_destroyed', { npcId, goldReward, playerId });
  };

  const onShipPositionUpdate = (callback: (data: ShipPositionUpdateEvent) => void) => {
    socketRef.current?.on('ship_position_updated', callback);
  };

  const onBulletFired = (callback: (data: BulletFiredEvent) => void) => {
    socketRef.current?.on('bullet_fired', callback);
  };

  const onShipDamaged = (callback: (data: ShipDamagedEvent) => void) => {
    socketRef.current?.on('ship_damaged', callback);
  };

  const onNpcDestroyed = (callback: (data: { npcId: string; goldReward: number; playerId: string }) => void) => {
    socketRef.current?.on('npc_destroyed', callback);
  };

  const onGameStateUpdate = (callback: (data: { type: string; data: any }) => void) => {
    socketRef.current?.on('game_state_update', callback);
  };

  return {
    socket: socketRef.current,
    isConnected,
    joinGame,
    updateShipPosition,
    fireBullet,
    damageShip,
    destroyNpc,
    onShipPositionUpdate,
    onBulletFired,
    onShipDamaged,
    onNpcDestroyed,
    onGameStateUpdate,
  };
};