import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { NPC as NPCType, ShipClass, Position } from '../types/game';

interface NPCProps {
  npc: NPCType;
  currentHealth: number;
  onDeath: (id: string, gold: number) => void;
  mapWidth: number;
  mapHeight: number;
  onPositionUpdate?: (newPosition: Position) => void;
  onClick?: () => void;
  isSelected?: boolean;
}

const NPCComponent: React.FC<NPCProps> = React.memo(({ npc, currentHealth, onDeath, mapWidth, mapHeight, onPositionUpdate, onClick, isSelected }) => {
  const meshRef = useRef<THREE.Group>(null);
  const [direction, setDirection] = useState({ x: Math.random() * 2 - 1, y: Math.random() * 2 - 1 });
  const [changeDirectionTimer, setChangeDirectionTimer] = useState(Math.random() * 2 + 3); // 3-5 segundos

  useEffect(() => {
    if (currentHealth <= 0) {
      onDeath(npc.id, npc.rewardGold);
    }
  }, [currentHealth, npc.id, npc.rewardGold, onDeath]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Cambiar dirección cada 3-5 segundos
    setChangeDirectionTimer(prev => {
      const newTimer = prev - delta;
      if (newTimer <= 0) {
        setDirection({
          x: Math.random() * 2 - 1,
          y: Math.random() * 2 - 1
        });
        return Math.random() * 2 + 3; // Nuevo timer 3-5 segundos
      }
      return newTimer;
    });

    // Mover el barco
    const speed = 2; // Velocidad de NPCs
    let newX = meshRef.current.position.x + direction.x * speed * delta;
    let newY = meshRef.current.position.y + direction.y * speed * delta;

    // Límites del mapa
    newX = Math.max(-mapWidth / 2 + 1, Math.min(mapWidth / 2 - 1, newX));
    newY = Math.max(-mapHeight / 2 + 1, Math.min(mapHeight / 2 - 1, newY));

    meshRef.current.position.set(newX, newY, 0);

    // Actualizar posición si hay callback
    if (onPositionUpdate) {
      onPositionUpdate({ x: newX, y: newY });
    }
  });

  // Daños visuales
  const isDamaged = currentHealth < npc.health * 0.5;

  return (
    <group
      ref={meshRef}
      position={[npc.position.x, npc.position.y, 0]}
      onClick={(e) => {
        e.stopPropagation();
        alert(`Objetivo NPC seleccionado: ${npc.name}`);
        onClick?.();
      }}
      onPointerDown={(e) => {
        e.stopPropagation();
        alert(`Objetivo NPC seleccionado: ${npc.name}`);
        onClick?.();
      }}
      onPointerOver={() => (document.body.style.cursor = 'pointer')}
      onPointerOut={() => (document.body.style.cursor = 'default')}
    >
      {/* Casco del barco */}
      <mesh
        position={[0, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          alert(`Objetivo NPC seleccionado: ${npc.name}`);
          onClick?.();
        }}
      >
        <boxGeometry args={[1.5, 0.8, 0.4]} />
        <meshStandardMaterial color={isDamaged ? "#654321" : "#8B4513"} /> {/* Marrón madera */}
      </mesh>
      {/* Planchas simuladas */}
      {Array.from({ length: 3 }, (_, i) => (
        <mesh key={`plank-npc-${i}`} position={[0, 0, -0.1 + i * 0.05]}>
          <boxGeometry args={[1.6, 0.9, 0.02]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
      ))}
      {/* Portillas */}
      <mesh position={[0.6, 0.2, 0.1]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-0.6, 0.2, 0.1]}>
        <cylinderGeometry args={[0.05, 0.05, 0.03]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Ancla pequeña */}
      <mesh position={[1, 0, -0.2]}>
        <boxGeometry args={[0.08, 0.2, 0.08]} />
        <meshStandardMaterial color="#2F4F4F" />
      </mesh>
      {/* Proa */}
      <mesh position={[0.9, 0, 0.3]}>
        <coneGeometry args={[0.2, 0.6, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Popa */}
      <mesh position={[-0.9, 0, 0.3]}>
        <cylinderGeometry args={[0.3, 0.3, 0.5, 8]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Puente pequeño */}
      <mesh position={[0, 0, 0.6]}>
        <boxGeometry args={[0.8, 0.6, 0.05]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Chimenea pequeña */}
      <mesh position={[-0.7, 0, 0.8]}>
        <cylinderGeometry args={[0.06, 0.06, 0.3]} />
        <meshStandardMaterial color="#2F4F4F" />
      </mesh>
      {/* Humo si dañado */}
      {isDamaged && (
        <mesh position={[-0.7, 0, 1]}>
          <sphereGeometry args={[0.1, 6, 6]} />
          <meshStandardMaterial color="gray" transparent opacity={0.5} />
        </mesh>
      )}
      {/* Mástil delantero */}
      <mesh position={[0.4, 0, 0.8]}>
        <cylinderGeometry args={[0.04, 0.04, 1.5]} />
        <meshStandardMaterial color="#654321" />
      </mesh>
      {/* Mástil trasero */}
      <mesh position={[-0.4, 0, 0.8]}>
        <cylinderGeometry args={[0.04, 0.04, 1.2]} />
        <meshStandardMaterial color="#654321" />
      </mesh>
      {/* Vela delantera */}
      <mesh position={[0.4, 0.4, 1]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshStandardMaterial color="white" side={THREE.DoubleSide} />
      </mesh>
      {/* Vela trasera */}
      <mesh position={[-0.4, 0.25, 0.9]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.6, 0.6]} />
        <meshStandardMaterial color="white" side={THREE.DoubleSide} />
      </mesh>
      {/* Cañones lado izquierdo */}
      <mesh position={[0, 0.3, 0.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.2]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Cañones lado derecho */}
      <mesh position={[0, -0.3, 0.2]}>
        <cylinderGeometry args={[0.08, 0.08, 0.2]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Timón */}
      <mesh position={[-1.1, 0, 0]}>
        <boxGeometry args={[0.08, 0.25, 0.08]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Luces de navegación pequeñas */}
      <pointLight position={[0.9, 0.3, 0.4]} color="red" intensity={0.3} distance={3} />
      <pointLight position={[0.9, -0.3, 0.4]} color="green" intensity={0.3} distance={3} />
      <Html position={[0, 0, 2]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: 'white', fontSize: '12px', textAlign: 'center', fontWeight: 'bold' }}>
          {npc.name}
        </div>
      </Html>
      <Html position={[0, 0, 1.5]} center style={{ pointerEvents: 'none' }}>
        <div style={{ color: 'white', fontSize: '10px', textAlign: 'center' }}>
          <div>HP: {currentHealth}/{npc.health}</div>
          <div style={{ width: '40px', height: '4px', background: 'red', margin: '2px auto' }}>
            <div style={{ width: `${(currentHealth / npc.health) * 100}%`, height: '100%', background: 'green' }}></div>
          </div>
        </div>
      </Html>
      {isSelected && (
        <mesh position={[0, 0, 0.1]} rotation={[0, 0, 0]}>
          <torusGeometry args={[1.2, 0.15, 8, 32]} />
          <meshStandardMaterial color="red" emissive="red" emissiveIntensity={0.5} />
        </mesh>
      )}
    </group>
  );
});

export default NPCComponent;