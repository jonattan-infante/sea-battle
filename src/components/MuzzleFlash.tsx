import React, { useEffect, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';
import { Position } from '../types/game';

interface MuzzleFlashProps {
  id: string;
  position: Position;
  direction?: Position; // Reservado por si queremos orientar el efecto
  duration?: number; // en segundos
  onDone: (id: string) => void;
}

/**
 * Efecto visual breve de fogonazo de cañón (muzzle flash).
 * - Se dibuja como un círculo aditivo y va desapareciendo en ~250ms.
 * - Está en el plano XY (top-down), con normal hacia +Z (cámara).
 */
const MuzzleFlash: React.FC<MuzzleFlashProps> = ({
  id,
  position,
  direction = { x: 0, y: 1 },
  duration = 0.25,
  onDone,
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (meshRef.current) {
      // Elevar un poco sobre el plano del agua
      meshRef.current.position.set(position.x, position.y, 0.5);
    }
  }, [position]);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const next = elapsed + delta;
    setElapsed(next);

    const t = Math.min(next / duration, 1);
    // Escala decreciente y desvanecimiento
    const scale = 1.2 + 1.5 * (1 - t);
    meshRef.current.scale.set(scale, scale, scale);

    const mat = meshRef.current.material as THREE.MeshBasicMaterial;
    if (mat) {
      mat.opacity = 1 - t;
    }

    if (next >= duration) {
      onDone(id);
    }
  });

  return (
    <mesh ref={meshRef}>
      {/* Círculo para fogonazo */}
      <circleGeometry args={[0.6, 24]} />
      <meshBasicMaterial
        color={'#ffd27f'}
        transparent
        opacity={1}
        blending={THREE.AdditiveBlending}
      />
    </mesh>
  );
};

export default MuzzleFlash;