import React, { useRef, useMemo } from 'react';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import { NPC } from '../types/game';

interface NPCManagerProps {
  npcs: NPC[];
  currentHealth: Map<string, number>;
  onDeath: (id: string, gold: number) => void;
}

const NPCManager: React.FC<NPCManagerProps> = ({ npcs, currentHealth, onDeath }) => {
  const meshRef = useRef<THREE.InstancedMesh>(null);

  // Crear geometría y material una sola vez
  const geometry = useMemo(() => new THREE.BoxGeometry(1.5, 0.8, 0.4), []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ color: '#666666' }), []);

  // Matriz temporal para transformaciones
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);

  // Actualizar instancias cuando cambien los NPCs
  React.useEffect(() => {
    if (meshRef.current) {
      meshRef.current.count = npcs.length;

      npcs.forEach((npc, index) => {
        tempMatrix.setPosition(npc.position.x, npc.position.y, 0.1);
        meshRef.current!.setMatrixAt(index, tempMatrix);
      });

      meshRef.current.instanceMatrix.needsUpdate = true;
    }
  }, [npcs, tempMatrix]);

  return (
    <group>
      <instancedMesh
        ref={meshRef}
        args={[geometry, material, Math.max(npcs.length, 1)]}
      />
      {/* Renderizar HTML para cada NPC individualmente (no se puede instanciar) */}
      {npcs.map((npc, index) => {
        const health = currentHealth.get(npc.id) || npc.health;
        return (
          <Html
            key={npc.id}
            position={[npc.position.x, npc.position.y + 1.2, 0]}
            center
          >
            <div style={{ color: 'white', fontSize: '10px', textAlign: 'center' }}>
              <div>HP: {health}/{npc.health}</div>
              <div style={{ width: '40px', height: '4px', background: 'red', margin: '2px auto' }}>
                <div style={{ width: `${(health / npc.health) * 100}%`, height: '100%', background: 'green' }}></div>
              </div>
            </div>
          </Html>
        );
      })}
    </group>
  );
};

export default NPCManager;