import React, { useState, useEffect } from 'react';
import { Canvas } from '@react-three/fiber';
import { Edges, OrthographicCamera } from '@react-three/drei';
import * as THREE from 'three';
import { GameMap, Ship, NPC, Position, ShipClass } from '../types/game';
import ShipComponent from './Ship';
import Bullet from './Bullet';
import NPCComponent from './NPC';
import MuzzleFlash from './MuzzleFlash';
import useGameStore from '../stores/gameStore';
import Shop from './Shop';
import { useSocket } from '../hooks/useSocket';
import { useUser } from '@clerk/nextjs';
import { getNpcHealth } from '../lib/game-utils';

interface GameMapProps {
  gameMap: GameMap;
  ships: Ship[];
  npcs: NPC[];
  onShipPositionUpdate?: (shipId: string, newPosition: { x: number; y: number }) => void;
  onGoldEarned?: (gold: number) => void;
  onShipDamage?: (shipId: string, damage: number) => void;
  playerShip?: Ship;
}

const GameMapComponent: React.FC<GameMapProps> = ({ gameMap, ships, npcs, onShipPositionUpdate, onGoldEarned, onShipDamage, playerShip }) => {
  const { width, height } = gameMap;
  const [bullets, setBullets] = useState<Array<{id: string, ownerId: string, position: Position, direction: Position}>>([]);
  const [flashes, setFlashes] = useState<Array<{id: string, position: Position, direction?: Position}>>([]);
  const [npcHealth, setNpcHealth] = useState<Map<string, number>>(new Map());
  const [deadNpcIds, setDeadNpcIds] = useState<Set<string>>(new Set());
  const [showShop, setShowShop] = useState(false);
  const [selectedShipId, setSelectedShipId] = useState<string | null>(null);
  const [otherPlayers, setOtherPlayers] = useState<Map<string, Ship>>(new Map());

  // Socket.io integration
  const { user } = useUser();
  const {
    joinGame,
    updateShipPosition,
    fireBullet,
    damageShip,
    destroyNpc,
    onShipPositionUpdate: onSocketShipPositionUpdate,
    onBulletFired,
    onShipDamaged,
    onNpcDestroyed,
    onGameStateUpdate,
  } = useSocket();

  useEffect(() => {
    const newHealth = new Map();
    npcs.forEach(npc => newHealth.set(npc.id, npc.health));
    setNpcHealth(newHealth);
  }, [npcs]);

  // Configurar listeners de Socket.io
  useEffect(() => {
    if (playerShip) {
      // Unirse al juego con el barco del jugador
      joinGame(playerShip.playerId || 'anonymous', playerShip.id);

      // Configurar listeners para eventos entrantes
      onSocketShipPositionUpdate((data) => {
        // Actualizar posición de otros jugadores (no del jugador actual)
        if (data.socketId && data.shipId !== playerShip.id) {
          setOtherPlayers(prev => {
            const updated = new Map(prev);
            const ship = updated.get(data.shipId) || {
              id: data.shipId,
              name: `Jugador ${(data.socketId ?? '').substring(0, 6)}`,
              position: data.position,
              health: data.health ?? 100,
              maxHealth: 100,
              speed: 2,
              shipClass: ShipClass.Frigate,
              equipment: [],
              playerId: data.socketId,
              lastUpdated: new Date()
            };
            ship.position = data.position;
            if (data.rotation !== undefined) ship.rotation = data.rotation;
            if (data.health !== undefined) ship.health = data.health;
            updated.set(data.shipId, ship);
            return updated;
          });
        }
        onShipPositionUpdate?.(data.shipId, data.position);
      });

      onBulletFired((data) => {
        // Solo renderizar disparos de otros jugadores
        if (data.shipId !== playerShip.id) {
          handleShoot(data.position, data.shipId, data.direction);
        }
      });

      onShipDamaged((data) => {
        onShipDamage?.(data.shipId, data.damage);

        // Efecto de impacto cuando llega daño por red
        const target = ships.find(s => s.id === data.shipId) || otherPlayers.get(data.shipId);
        if (target) {
          const impactId = `impact-${Date.now()}-${Math.random()}`;
          setFlashes(prev => [...prev, { id: impactId, position: target.position }]);
        }
      });

      onNpcDestroyed((data) => {
        onGoldEarned?.(data.goldReward);
        setNpcHealth(prev => {
          const newHealth = new Map(prev);
          newHealth.delete(data.npcId);
          return newHealth;
        });
      });

      onGameStateUpdate((data) => {
        console.log('🎮 Actualización estado del juego:', data);
      });
    }
  }, [playerShip?.id]); // Usar playerShip.id para evitar bucles infinitos

  const handleShoot = (position: Position, ownerId: string, direction?: Position) => {
    let shootDirection = direction || { x: 0, y: 1 };

    // Si hay barco seleccionado, disparar hacia él
    if (selectedShipId && playerShip) {
      const targetShip = ships.find(s => s.id === selectedShipId) || npcs.find(n => n.id === selectedShipId);
      if (targetShip) {
        const dx = targetShip.position.x - position.x;
        const dy = targetShip.position.y - position.y;
        const length = Math.sqrt(dx * dx + dy * dy);
        if (length > 0) {
          shootDirection = { x: dx / length, y: dy / length };
        }
      }
    }

    const id = `bullet-${Date.now()}-${Math.random()}`;
    setBullets(prev => [...prev, {id, ownerId, position, direction: shootDirection}]);

    // Efecto de fogonazo (muzzle flash)
    const flashId = `flash-${Date.now()}-${Math.random()}`;
    setFlashes(prev => [...prev, { id: flashId, position, direction: shootDirection }]);

    // Enviar evento por Socket.io
    if (user) {
      const playerShip = ships.find(ship => ship.playerId === user.id);
      if (playerShip) {
        fireBullet(position, shootDirection, playerShip.id);
      }
    }
  };

  const handleBulletHit = (bulletId: string, targetId: string, targetType: 'ship' | 'npc', position: Position) => {
    if (targetType === 'ship') {
      const ship = ships.find(s => s.id === targetId);
      const damage = ship?.playerId ? useGameStore.getState().getCannonDamage() : 10;
      onShipDamage?.(targetId, damage);

      // Efecto de impacto en el objetivo (barco)
      const impactId = `impact-${Date.now()}-${Math.random()}`;
      setFlashes(prev => [...prev, { id: impactId, position }]);

      // Enviar evento de daño por Socket.io
      damageShip(targetId, damage);
    } else {
      // Efecto de impacto en el objetivo (NPC)
      const impactId = `impact-${Date.now()}-${Math.random()}`;
      setFlashes(prev => [...prev, { id: impactId, position }]);

      // La muerte (oro + evento al servidor) se procesa una sola vez en handleNpcDeath
      setNpcHealth(prev => {
        const newHealth = new Map(prev);
        const current = newHealth.get(targetId) ?? 0;
        newHealth.set(targetId, current - 10); // daño fijo
        return newHealth;
      });
    }
  };

  const handleBulletDestroy = (id: string) => {
    setBullets(prev => prev.filter(b => b.id !== id));
  };

  const handleFlashDone = (id: string) => {
    setFlashes(prev => prev.filter(f => f.id !== id));
  };

  const handleNpcDeath = (id: string, gold: number) => {
    if (deadNpcIds.has(id)) return;
    setDeadNpcIds(prev => new Set(prev).add(id));
    setSelectedShipId(prev => (prev === id ? null : prev));
    onGoldEarned?.(gold);
    if (user) {
      destroyNpc(id, gold, user.id);
    }
  };

  // Los NPC muertos salen de la escena y dejan de ser objetivo de las balas
  const liveNpcs = npcs.filter(npc => !deadNpcIds.has(npc.id));

  const handleRepair = () => {
    if (playerShip) {
      const success = repairShip(playerShip.health, playerShip.maxHealth);
      if (success) {
        // Reparar instantáneamente
        onShipDamage?.(playerShip.id, -(playerShip.maxHealth - playerShip.health));
      }
    }
  };

  const handleShipClick = (shipId: string) => {
    // Solo permitir seleccionar barcos que no sean del jugador
    const ship = ships.find(s => s.id === shipId);
    if (ship && !ship.playerId) {
      setSelectedShipId(shipId);
    }
  };

  // Selección de NPCs como objetivo
  const handleNpcClick = (npcId: string) => {
    setSelectedShipId(npcId);
    const npc = npcs.find(n => n.id === npcId);
    if (npc) {
      alert(`Objetivo NPC seleccionado: ${npc.name}`);
    } else {
      alert(`Objetivo NPC seleccionado: ${npcId}`);
    }
  };

  const { gold, getMaxAmmo, repairShip } = useGameStore();

  // Logs de depuración removidos - problema resuelto

  return (
    <div className="relative w-full h-full">
      {/* HUD */}
      <div className="absolute top-4 left-4 z-20 naval-ui text-white p-4 rounded-lg">
        <div className="mb-2">
          <div className="text-sm naval-text">Vida del Barco</div>
          <div className="w-32 h-4 bg-red-800 rounded border border-yellow-600">
            <div
              className="h-full bg-green-600 rounded"
              style={{ width: playerShip ? `${(playerShip.health / playerShip.maxHealth) * 100}%` : '100%' }}
            ></div>
          </div>
          <div className="text-xs mt-1 naval-text">{playerShip ? `${playerShip.health}/${playerShip.maxHealth}` : '100/100'}</div>
        </div>
        <div className="mb-2">
          <div className="text-sm naval-text">Oro: {gold}</div>
        </div>
        <div className="mb-2">
          <div className="text-sm naval-text">Munición: {getMaxAmmo()}</div>
        </div>
        <div className="mb-2">
          <div className="text-sm naval-text">Balas activas: {bullets.length}</div>
        </div>
        <div className="mb-2">
          <div className="text-sm naval-text">
            Objetivo: {selectedShipId
              ? (ships.find(s => s.id === selectedShipId)?.name
                || npcs.find(n => n.id === selectedShipId)?.name
                || selectedShipId)
              : 'Ninguno'}
          </div>
        </div>
        <div className="mb-2">
          <button
            onClick={handleRepair}
            disabled={!playerShip || playerShip.health >= playerShip.maxHealth}
            className={`px-3 py-1 text-xs rounded border ${
              playerShip && playerShip.health < playerShip.maxHealth
                ? 'bg-green-800 hover:bg-green-900 text-white border-green-600'
                : 'bg-gray-700 text-gray-400 cursor-not-allowed border-gray-600'
            }`}
          >
            Reparar ({playerShip ? Math.ceil((playerShip.maxHealth - playerShip.health) * 0.5) : 0} oro)
          </button>
        </div>
        <div className="text-xs naval-text">
          <div>Controles:</div>
          <div>WASD / Flechas: Navegar</div>
          <div>Espacio: Disparar</div>
        </div>
      </div>

      <Canvas
        onCreated={({ camera }) => {
          // Vista top-down sobre eje Z para juego 2D (plano XY)
          camera.lookAt(0, 0, 0);
        }}
      >
        {/* Cámara ortográfica para 2D: evita cambios de tamaño al mover */}
        <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={20} near={0.1} far={1000} />
        {/* Cámara ortográfica para evitar cambios de tamaño al mover (2D real) */}
        <OrthographicCamera makeDefault position={[0, 0, 100]} zoom={20} near={0.1} far={1000} />
        <ambientLight intensity={0.4} color="#87ceeb" /> {/* Luz ambiental azulada para atmósfera marina */}
        <directionalLight position={[10, 10, 5]} intensity={0.6} color="#fff8dc" /> {/* Luz solar cálida */}
        <pointLight position={[-10, -10, 10]} intensity={0.3} color="#4169e1" /> {/* Luz reflejada del agua */}

        {/* Plano del mapa - océano (plano XY, sin rotación) */}
        <mesh position={[0, 0, -0.1]} rotation={[0, 0, 0]}>
          <planeGeometry args={[width, height]} />
          <meshStandardMaterial color="#1e40af" side={2} /> {/* Azul más profundo para el océano */}
        </mesh>

        {/* Rejilla del mapa */}
        <gridHelper args={[width, height, 10, 10]} position={[0, 0, 0]} />

        {/* Bordes del mapa */}
        <lineSegments>
          <edgesGeometry args={[new THREE.PlaneGeometry(width, height)]} />
          <lineBasicMaterial color="#fbbf24" linewidth={2} />
        </lineSegments>

        {/* Renderizar solo el barco del jugador (con controles) */}
        {playerShip && (
          <ShipComponent
            key={playerShip.id}
            ship={playerShip}
            mapWidth={width}
            mapHeight={height}
            onPositionUpdate={(newPosition) => {
              onShipPositionUpdate?.(playerShip.id, newPosition);
              // Enviar actualización de posición por Socket.io
              updateShipPosition(playerShip.id, newPosition);
            }}
            onShoot={(position) => handleShoot(position, playerShip.id)}
            onClick={() => handleShipClick(playerShip.id)}
            isSelected={selectedShipId === playerShip.id}
          />
        )}

        {/* Renderizar otros jugadores (multijugador) */}
        {Array.from(otherPlayers.values()).map(ship => (
          <ShipComponent
            key={ship.id}
            ship={ship}
            mapWidth={width}
            mapHeight={height}
            onClick={() => handleShipClick(ship.id)}
            isSelected={selectedShipId === ship.id}
          />
        ))}

        {/* Renderizar NPCs */}
        {liveNpcs.map(npc => (
          <NPCComponent
            key={npc.id}
            npc={npc}
            currentHealth={getNpcHealth(npcHealth, npc)}
            onDeath={handleNpcDeath}
            mapWidth={width}
            mapHeight={height}
            onClick={() => handleNpcClick(npc.id)}
            isSelected={selectedShipId === npc.id}
          />
        ))}

        {/* Renderizar bullets */}
        {bullets.map(bullet => (
          <Bullet
            key={bullet.id}
            id={bullet.id}
            ownerId={bullet.ownerId}
            position={bullet.position}
            direction={bullet.direction}
            speed={20}
            mapWidth={width}
            mapHeight={height}
            targets={{ ships, npcs: liveNpcs, npcHealth }}
            onHit={handleBulletHit}
            onDestroy={handleBulletDestroy}
          />
        ))}

        {/* Efecto de fogonazo de cañón */}
        {flashes.map(flash => (
          <MuzzleFlash
            key={flash.id}
            id={flash.id}
            position={flash.position}
            direction={flash.direction}
            onDone={handleFlashDone}
          />
        ))}
      </Canvas>

      {/* Botón flotante para tienda */}
      <button
        onClick={() => setShowShop(true)}
        className="fixed bottom-4 right-4 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full shadow-lg z-30"
      >
        🛒 Tienda
      </button>

      {/* Modal de tienda */}
      {showShop && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-40">
          <div className="bg-white rounded-lg shadow-lg max-w-md w-full mx-4">
            <div className="flex justify-between items-center p-4 border-b">
              <h2 className="text-xl font-bold">Tienda</h2>
              <button
                onClick={() => setShowShop(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <div className="p-4">
              <Shop />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GameMapComponent;