import React, { useRef, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Position } from '../types/game';
import { BulletTargets, findBulletHit } from '../lib/game-utils';

interface BulletProps {
  id: string;
  ownerId: string; // Barco que disparó: la bala nunca lo impacta
  position: Position;
  direction: Position;
  speed: number;
  mapWidth: number;
  mapHeight: number;
  targets: BulletTargets;
  onHit: (bulletId: string, targetId: string, targetType: 'ship' | 'npc', position: Position) => void;
  onDestroy: (id: string) => void;
}

const Bullet: React.FC<BulletProps> = ({ id, ownerId, position, direction, speed, mapWidth, mapHeight, targets, onHit, onDestroy }) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const targetFPS = 60;
  const frameTime = 1 / targetFPS;
  const [timeAccumulator, setTimeAccumulator] = React.useState(0);

  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(position.x, position.y, 0.2);
    }
  }, [position]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Limitar FPS acumulando tiempo
    setTimeAccumulator(prev => {
      const newAccumulator = prev + delta;
      if (newAccumulator >= frameTime) {
        const moveSpeed = speed * frameTime;
        meshRef.current!.position.x += direction.x * moveSpeed;
        meshRef.current!.position.y += direction.y * moveSpeed;

        const currentPos = { x: meshRef.current!.position.x, y: meshRef.current!.position.y };

        // Verificar colisiones con ships y NPCs (excluye al barco que disparó)
        const hit = findBulletHit(currentPos, ownerId, targets);
        if (hit) {
          onHit(id, hit.id, hit.type, currentPos);
          onDestroy(id);
          return newAccumulator - frameTime;
        }

        // Verificar si sale del mapa
        if (Math.abs(meshRef.current!.position.x) > mapWidth / 2 || Math.abs(meshRef.current!.position.y) > mapHeight / 2) {
          onDestroy(id);
        }

        return newAccumulator - frameTime;
      }
      return newAccumulator;
    });
  });

  return (
    <mesh ref={meshRef}>
      <sphereGeometry args={[0.1]} />
      <meshStandardMaterial color="red" />
    </mesh>
  );
};

export default Bullet;