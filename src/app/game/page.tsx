'use client';

import React, { useState, useEffect } from 'react';
import GameMapComponent from '../../components/GameMap';
import { GameMap, Ship, NPC, Position, NPCType, ShipClass } from '../../types/game';
import useGameStore from '../../stores/gameStore';
import { useUser } from '@clerk/nextjs';

const GamePage: React.FC = () => {
  const { user } = useUser();
  const { gold, addGold } = useGameStore();

  // Datos mock para el juego
  const [gameMap] = useState<GameMap>({
    id: 'map1',
    width: 50,
    height: 50,
    occupiedPositions: [],
    lastUpdated: new Date()
  });

  const pirateNames = ['Black Pearl', 'Flying Dutchman', 'Queen Anne\'s Revenge', 'Calico Jack', 'Barbarossa', 'Captain Kidd', 'Caos', 'Venganza', 'Neptune', 'Kraken'];

  // Generar ID único por sesión de navegador si no hay user ID
  const [sessionId] = useState(() => user?.id || `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);

  // Generar posición inicial aleatoria
  const getRandomPosition = () => ({
    x: (Math.random() - 0.5) * 40, // Entre -20 y 20
    y: (Math.random() - 0.5) * 40
  });

  const [ships, setShips] = useState<Ship[]>(() => {
    // Crear barco único para este jugador
    const playerShipName = pirateNames[Math.floor(Math.random() * pirateNames.length)];
    return [
      {
        id: `ship-${sessionId}`,
        name: playerShipName,
        playerId: sessionId,
        position: getRandomPosition(),
        health: 100,
        maxHealth: 100,
        speed: 5,
        shipClass: ShipClass.Galleon,
        equipment: [],
        lastUpdated: new Date()
      }
    ];
  });

  const [npcs, setNpcs] = useState<NPC[]>([
    {
      id: 'npc1',
      name: pirateNames[Math.floor(Math.random() * pirateNames.length)],
      type: NPCType.Pirate,
      position: { x: 5, y: 5 },
      health: 50,
      rewardGold: 20,
      lastUpdated: new Date()
    },
    {
      id: 'npc2',
      name: pirateNames[Math.floor(Math.random() * pirateNames.length)],
      type: NPCType.Merchant,
      position: { x: -5, y: -5 },
      health: 30,
      rewardGold: 15,
      lastUpdated: new Date()
    }
  ]);

  const handleShipPositionUpdate = (shipId: string, newPosition: Position) => {
    setShips(prev => prev.map(ship =>
      ship.id === shipId ? { ...ship, position: newPosition } : ship
    ));
  };

  const handleGoldEarned = (amount: number) => {
    addGold(amount);
  };

  const handleShipDamage = (shipId: string, damage: number) => {
    setShips(prev =>
      prev.map((ship) => {
        if (ship.id !== shipId) return ship;
        const next = ship.health - damage; // daño negativo repara
        const clamped = Math.min(ship.maxHealth, Math.max(0, next));
        return { ...ship, health: clamped };
      })
    );
  };

  const playerShip = ships.find(ship => ship.playerId === sessionId);

  return (
    <div className="w-full h-screen ocean-bg">
      <GameMapComponent
        gameMap={gameMap}
        ships={ships}
        npcs={npcs}
        onShipPositionUpdate={handleShipPositionUpdate}
        onGoldEarned={handleGoldEarned}
        onShipDamage={handleShipDamage}
        playerShip={playerShip}
      />
    </div>
  );
};

export default GamePage;