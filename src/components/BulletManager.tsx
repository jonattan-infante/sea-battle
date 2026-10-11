import React, { useRef, useMemo } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Position, Ship, NPC } from '../types/game';

interface BulletData {
  id: string;
  position: Position;
  direction: Position;
  speed: number;
}

interface BulletManagerProps {
  bullets: BulletData[];
  mapWidth: number;
  mapHeight: number;
  targets: { ships: Ship[], npcs: NPC[], npcHealth: Map<string, number> };
  onHit: (bulletId: string, targetId: string, targetType: 'ship' | 'npc', position: Position) => void;
  onDestroy: (id: string) => void;
}

const BulletManager: React.FC<BulletManagerProps> = ({
  bullets,
  mapWidth,
  mapHeight,
  targets,
  onHit,
  onDestroy
}) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const targetFPS = 60;
  const frameTime = 1 / targetFPS;
  const timeAccumulator = useRef(0);

  // Crear geometría y material una sola vez
  const geometry = useMemo(() => new THREE.SphereGeometry(0.1), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: 'red' }), []);

  // Matriz temporal para transformaciones
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Limitar FPS
    timeAccumulator.current += delta;
    if (timeAccumulator.current < frameTime) return;
    timeAccumulator.current -= frameTime;

    const moveSpeed = 0.5 * frameTime; // velocidad fija para simplificar

    bullets.forEach((bullet, index) => {
      if (index >= meshRef.current!.count) return;

      // Obtener posición actual
      meshRef.current!.getMatrixAt(index, tempMatrix);
      tempPosition.setFromMatrixPosition(tempMatrix);

      // Mover bullet
      tempPosition.x += bullet.direction.x * moveSpeed;
      tempPosition.y += bullet.direction.y * moveSpeed;

      // Verificar colisiones con ships
      for (const ship of targets.ships) {
        const dist = Math.sqrt((tempPosition.x - ship.position.x) ** 2 + (tempPosition.y - ship.position.y) ** 2);
        if (dist < 1.5) {
          onHit(bullet.id, ship.id, 'ship', { x: tempPosition.x, y: tempPosition.y });
          onDestroy(bullet.id);
          return;
        }
      }

      // Verificar colisiones con NPCs
      for (const npc of targets.npcs) {
        const health = targets.npcHealth.get(npc.id) || npc.health;
        if (health > 0) {
          const dist = Math.sqrt((tempPosition.x - npc.position.x) ** 2 + (tempPosition.y - npc.position.y) ** 2);
          if (dist < 1.5) {
            onHit(bullet.id, npc.id, 'npc', { x: tempPosition.x, y: tempPosition.y });
            onDestroy(bullet.id);
            return;
          }
        }
      }

      // Verificar límites del mapa
      if (Math.abs(tempPosition.x) > mapWidth / 2 || Math.abs(tempPosition.y) > mapHeight / 2) {
        onDestroy(bullet.id);
        return;
      }

      // Actualizar matriz
      tempMatrix.setPosition(tempPosition);
      meshRef.current!.setMatrixAt(index, tempMatrix);
    });

    meshRef.current.instanceMatrix.needsUpdate = true;
  });

  // Actualizar instancias cuando cambie el número de bullets
  React.useEffect(() => {
    if (meshRef.current) {
      meshRef.current.count = bullets.length;

      bullets.forEach((bullet, index) => {
        tempMatrix.setPosition(bullet.position.x, bullet.position.y, 0.2);
        meshRef.current!.setMatrixAt(index, tempMatrix);
      });

      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [bullets, tempMatrix]);

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, Math.max(bullets.length, 1)]}
    />
  );
};

export default BulletManager;