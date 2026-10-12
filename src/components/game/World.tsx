import React from 'react';
import { LIGHTING } from '../../client/art';
import { GameRuntime } from '../../client/runtime';

// ART-DIRECTION §5: 1 luz hemisférica + 1 direccional, sin luces puntuales ni sombras (AD-19).
// La escena (océano, islas, barcos y VFX) es imperativa y vive en el runtime.
export default function World({ runtime }: { runtime: GameRuntime }) {
  const [x, y, z] = LIGHTING.sunDir;
  return (
    <>
      <hemisphereLight args={[LIGHTING.hemiSky, LIGHTING.hemiGround, LIGHTING.hemiIntensity]} />
      <directionalLight color={LIGHTING.sunColor} intensity={LIGHTING.sunIntensity} position={[x * 100, y * 100, z * 100]} />
      <primitive object={runtime.scene} />
    </>
  );
}
