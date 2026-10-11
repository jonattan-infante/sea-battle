import React, { useRef, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html, useTexture } from '@react-three/drei';
import * as THREE from 'three';
import { Ship as ShipType, Position, ShipClass } from '../types/game';
import useGameStore from '../stores/gameStore';
import shipImg from '../assets/barco_modelo_1.png';

interface ShipProps {
  ship: ShipType;
  mapWidth: number;
  mapHeight: number;
  onPositionUpdate?: (newPosition: Position) => void;
  onShoot?: (position: Position) => void;
  onClick?: () => void;
  isSelected?: boolean;
}

const Ship: React.FC<ShipProps> = React.memo(({ ship, mapWidth, mapHeight, onPositionUpdate, onShoot, onClick, isSelected }) => {
  const meshRef = useRef<THREE.Group>(null);
  const [keys, setKeys] = useState<{ [key: string]: boolean }>({});
  // Solo es controlable si tiene los callbacks de control
  const isControllable = !!(onPositionUpdate && onShoot);
  const isPlayer = !!ship.playerId;
  const store = useGameStore();
  const maxAmmo = isPlayer ? store.getMaxAmmo() : 10;
  const speedBoost = isPlayer ? store.getSailSpeed() : 0;
  const [ammo, setAmmo] = useState(maxAmmo);
  const [reloadTime, setReloadTime] = useState(0);
  const reloadDuration = 2; // segundos
  const targetFPS = 60;
  const frameTime = 1 / targetFPS;
  const [timeAccumulator, setTimeAccumulator] = useState(0);

  // Variaciones basadas en shipClass
  const scale = ship.shipClass === ShipClass.Galleon ? 1.2 : ship.shipClass === ShipClass.Frigate ? 1 : 0.8;
  const hullLength = 2 * scale;
  const hullWidth = 1 * scale;
  const mastHeight = ship.shipClass === ShipClass.Galleon ? 2.5 : ship.shipClass === ShipClass.Frigate ? 2 : 1.5;
  const shipUrl = (typeof shipImg === 'string' ? shipImg : (shipImg as unknown as { src: string }).src) as string;
  const playerTexture = useTexture(shipUrl);

  // Daños visuales
  const isDamaged = ship.health < ship.maxHealth * 0.5;

  useEffect(() => {
    // Solo agregar listeners si el barco es controlable (tiene callbacks)
    if (!isControllable) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      event.preventDefault();
      setKeys(prev => ({ ...prev, [event.code]: true }));
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      event.preventDefault();
      setKeys(prev => ({ ...prev, [event.code]: false }));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [isControllable]);

  // Inicializar posición base una vez por barco (evita "saltos" y conflictos con props)
  useEffect(() => {
    if (meshRef.current) {
      meshRef.current.position.set(ship.position.x, ship.position.y, 0);
    }
  }, [ship.id]);

  useFrame((state, delta) => {
    if (!meshRef.current) return;

    // Animación de balanceo suave del barco
    const time = state.clock.getElapsedTime();
    meshRef.current.rotation.z = Math.sin(time * 0.5) * 0.02; // Balanceo lateral
    meshRef.current.rotation.x = Math.sin(time * 0.3) * 0.01; // Balanceo longitudinal

    // Limitar FPS acumulando tiempo
    setTimeAccumulator(prev => {
      const newAccumulator = prev + delta;
      if (newAccumulator >= frameTime) {
        const speed = (ship.speed + speedBoost) * frameTime;
        let newX = meshRef.current!.position.x;
        let newY = meshRef.current!.position.y;

        // Movimiento con WASD o flechas
        if (keys['KeyW'] || keys['ArrowUp']) {
          newY += speed;
        }
        if (keys['KeyS'] || keys['ArrowDown']) {
          newY -= speed;
        }
        if (keys['KeyA'] || keys['ArrowLeft']) {
          newX -= speed;
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
          newX += speed;
        }

        // Límites del mapa
        newX = Math.max(-mapWidth / 2 + 1, Math.min(mapWidth / 2 - 1, newX));
        newY = Math.max(-mapHeight / 2 + 1, Math.min(mapHeight / 2 - 1, newY));

        meshRef.current!.position.set(newX, newY, 0);

        // Actualizar posición en el estado si hay callback
        if (onPositionUpdate) {
          onPositionUpdate({ x: newX, y: newY });
        }

        // Recarga automática
        if (reloadTime > 0) {
          setReloadTime(prev => prev - frameTime);
        } else if (ammo < maxAmmo) {
          setAmmo(prev => prev + 1);
          setReloadTime(reloadDuration);
        }

        // Disparo
        if (keys['Space'] && ammo > 0 && onShoot) {
          const position = { x: meshRef.current!.position.x, y: meshRef.current!.position.y };
          onShoot(position);
          setAmmo(prev => prev - 1);
          setKeys(prev => ({ ...prev, ['Space']: false }));
        }

        return newAccumulator - frameTime;
      }
      return newAccumulator;
    });
  });

  return (
    <group ref={meshRef} scale={[scale, scale, scale]}>
      {/* Casco del barco */}
      <mesh
        position={[0, 0, 0]}
        onPointerDown={(e) => {
          e.stopPropagation();
          onClick?.();
        }}
      >
        <boxGeometry args={[hullLength, hullWidth, 0.5]} />
        <meshStandardMaterial
          color={isDamaged ? "#451a03" : "#92400e"}
          roughness={0.8}
          metalness={0.1}
        /> {/* Marrón madera naval, más oscuro si dañado */}
      </mesh>
      {/* Planchas de madera simuladas - líneas horizontales */}
      {Array.from({ length: 5 }, (_, i) => (
        <mesh key={`plank-${i}`} position={[0, 0, -0.2 + i * 0.1]}>
          <boxGeometry args={[2.1, 1.1, 0.02]} />
          <meshStandardMaterial color="#92400e" roughness={0.9} />
        </mesh>
      ))}
      {/* Portillas lado izquierdo */}
      <mesh position={[0.8, 0.3, 0.1]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[0.8, -0.3, 0.1]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Portillas lado derecho */}
      <mesh position={[-0.8, 0.3, 0.1]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-0.8, -0.3, 0.1]}>
        <cylinderGeometry args={[0.08, 0.08, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Ancla en la proa */}
      <mesh position={[1.5, 0, -0.3]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
        <meshStandardMaterial color="#2F4F4F" />
      </mesh>
      <mesh position={[1.5, -0.2, -0.4]}>
        <coneGeometry args={[0.05, 0.2]} />
        <meshStandardMaterial color="#2F4F4F" />
      </mesh>
      {/* Proa */}
      <mesh position={[1.2, 0, 0.3]}>
        <coneGeometry args={[0.3, 0.8, 8]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      {/* Popa */}
      <mesh position={[-1.2, 0, 0.3]}>
        <cylinderGeometry args={[0.4, 0.4, 0.6, 8]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      {/* Puente de mando */}
      <mesh position={[0, 0, 0.8]}>
        <boxGeometry args={[1.2, 0.8, 0.1]} />
        <meshStandardMaterial color="#92400e" roughness={0.7} />
      </mesh>
      {/* Barandillas del puente */}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={`railing-${i}`} position={[-0.5 + i * 0.2, 0.5, 0.9]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
      ))}
      {Array.from({ length: 6 }, (_, i) => (
        <mesh key={`railing-back-${i}`} position={[-0.5 + i * 0.2, -0.5, 0.9]}>
          <cylinderGeometry args={[0.02, 0.02, 0.2]} />
          <meshStandardMaterial color="#654321" />
        </mesh>
      ))}
      {/* Chimenea */}
      <mesh position={[-1, 0, 1]}>
        <cylinderGeometry args={[0.1, 0.1, 0.5]} />
        <meshStandardMaterial color="#2F4F4F" />
      </mesh>
      {/* Humo si dañado */}
      {isDamaged && (
        <mesh position={[-1, 0, 1.5]}>
          <sphereGeometry args={[0.2, 8, 8]} />
          <meshStandardMaterial color="gray" transparent opacity={0.5} />
        </mesh>
      )}
      {/* Escaleras de acceso */}
      <mesh position={[0.5, 0, 0.5]} rotation={[Math.PI / 6, 0, 0]}>
        <boxGeometry args={[0.1, 0.8, 0.05]} />
        <meshStandardMaterial color="#654321" />
      </mesh>
      <mesh position={[-0.5, 0, 0.5]} rotation={[-Math.PI / 6, 0, 0]}>
        <boxGeometry args={[0.1, 0.8, 0.05]} />
        <meshStandardMaterial color="#654321" />
      </mesh>
      {/* Mástil delantero */}
      <mesh position={[0.5, 0, mastHeight / 2]}>
        <cylinderGeometry args={[0.05, 0.05, mastHeight]} />
        <meshStandardMaterial color="#92400e" roughness={0.9} />
      </mesh>
      {/* Mástil trasero */}
      <mesh position={[-0.5, 0, mastHeight / 2]}>
        <cylinderGeometry args={[0.05, 0.05, mastHeight * 0.75]} />
        <meshStandardMaterial color="#92400e" roughness={0.9} />
      </mesh>
      {/* Vela delantera */}
      <mesh position={[0.5, 0.5, 1.5]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[1, 1]} />
        <meshStandardMaterial color="white" side={THREE.DoubleSide} />
      </mesh>
      {/* Vela trasera */}
      <mesh position={[-0.5, 0.3, 1.2]} rotation={[0, 0, Math.PI / 4]}>
        <planeGeometry args={[0.8, 0.8]} />
        <meshStandardMaterial color="white" side={THREE.DoubleSide} />
      </mesh>
      {/* Bandera pirata en mástil delantero */}
      <mesh position={[0.5, 0.8, 1.8]}>
        <planeGeometry args={[0.3, 0.2]} />
        <meshStandardMaterial color="black" side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0.5, 0.8, 1.8]} rotation={[0, 0, 0]}>
        <planeGeometry args={[0.15, 0.1]} />
        <meshStandardMaterial color="white" side={THREE.DoubleSide} />
      </mesh>
      {/* Cuerdas entre mástiles */}
      <mesh position={[0, 0, 1.5]} rotation={[0, 0, Math.PI / 4]}>
        <cylinderGeometry args={[0.01, 0.01, 1]} />
        <meshStandardMaterial color="#8B4513" />
      </mesh>
      {/* Palas de timón adicionales */}
      <mesh position={[-1.5, 0.2, 0]}>
        <boxGeometry args={[0.05, 0.2, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[-1.5, -0.2, 0]}>
        <boxGeometry args={[0.05, 0.2, 0.05]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Cañones lado izquierdo */}
      <mesh position={[0, 0.4, 0.2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[0.5, 0.4, 0.2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Cañones lado derecho */}
      <mesh position={[0, -0.4, 0.2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3]} />
        <meshStandardMaterial color="black" />
      </mesh>
      <mesh position={[0.5, -0.4, 0.2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.3]} />
        <meshStandardMaterial color="black" />
      </mesh>
      {/* Timón */}
      <mesh position={[-1.5, 0, 0]}>
        <boxGeometry args={[0.1, 0.3, 0.1]} />
        <meshStandardMaterial color="black" />
      </mesh>

      {/* Imagen del barco del jugador */}
      {isPlayer && (
        <mesh
          position={[0, 0, 0.6]}
          onPointerDown={(e) => {
            e.stopPropagation();
            onClick?.();
          }}
        >
          <planeGeometry args={[hullLength * 2.0, hullWidth * 2.0]} />
          <meshBasicMaterial map={playerTexture} transparent side={THREE.DoubleSide} />
        </mesh>
      )}
      {/* Círculo de selección */}
      {isSelected && (
        <mesh position={[0, 0, 0.1]} rotation={[0, 0, 0]}>
          <torusGeometry args={[hullLength * 0.8, 0.2, 8, 32]} />
          <meshStandardMaterial color="red" emissive="red" emissiveIntensity={0.5} />
        </mesh>
      )}
      {/* Luces de navegación */}
      <pointLight position={[1.2, 0.5, 0.5]} color="red" intensity={0.5} distance={5} />
      <pointLight position={[1.2, -0.5, 0.5]} color="green" intensity={0.5} distance={5} />
      {/* Sombras dinámicas - añadir castShadow a meshes principales */}
      {/* Nota: Para sombras reales, necesitaríamos configurar el renderer, pero por simplicidad, usamos luces */}
      <Html position={[0, 0, 2]} center>
        <div style={{ color: 'white', fontSize: '14px', textAlign: 'center', fontWeight: 'bold' }}>
          {ship.name}
        </div>
      </Html>
      <Html position={[0, 0, 1.5]} center>
        <div style={{ color: 'white', fontSize: '12px', textAlign: 'center' }}>
          <div>HP: {ship.health}/{ship.maxHealth}</div>
          <div style={{ width: '50px', height: '5px', background: 'red', margin: '2px auto' }}>
            <div style={{ width: `${(ship.health / ship.maxHealth) * 100}%`, height: '100%', background: 'green' }}></div>
          </div>
          <div>Ammo: {ammo}/{maxAmmo}</div>
        </div>
      </Html>
    </group>
  );
});

export default Ship;