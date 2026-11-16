// Las vistas previas de los barcos en la tienda de la 1.3 (D103 y D101; ART-DIRECTION §14; ASSET-SPEC §13, «Retratos»): una
// por clase y aspecto, 760 × 480 (2× de la caja más grande), WebP de calidad 85 en ≤ 40 000 B, con el hash de su contenido en
// el nombre y caché de un año (next.config.ts). Salen de scripts/ux/barcos/retrato13.py y las pone aquí
// scripts/previews/stage-previews.ts, que imprime esta tabla. «none» es el modelo procedural de hoy; gb y es, los GLB de la
// cadena de arte (D91). Lo comprueba src/client/__tests__/ship-previews.test.ts
import { FamilyChoice, NO_FAMILY, PlayerShipClass, SHIP_CLASSES } from '../game/constants';

export const SHIP_PREVIEW_SIZE = { width: 760, height: 480 } as const;

export const SHIP_PREVIEWS: Record<PlayerShipClass, Record<FamilyChoice, string>> = {
  sloop: { none: '/previews/ship_sloop_side.14971433.webp', gb: '/previews/ship_sloop_gb_side.d719b293.webp', es: '/previews/ship_sloop_es_side.c9a8de05.webp' },
  brig: { none: '/previews/ship_brigantine_side.b06dd12f.webp', gb: '/previews/ship_brigantine_gb_side.c8f8b908.webp', es: '/previews/ship_brigantine_es_side.7b58b4b8.webp' },
  schooner: { none: '/previews/ship_schooner_side.cf4e8ef7.webp', gb: '/previews/ship_schooner_gb_side.079de7b9.webp', es: '/previews/ship_schooner_es_side.e73ad25e.webp' },
  frigate: { none: '/previews/ship_frigate_side.30ac8311.webp', gb: '/previews/ship_frigate_gb_side.beaea9f9.webp', es: '/previews/ship_frigate_es_side.56d615a6.webp' },
  line: { none: '/previews/ship_line_side.3cf82bfd.webp', gb: '/previews/ship_line_gb_side.ec4e2114.webp', es: '/previews/ship_line_es_side.e27a0b32.webp' }
};

// «Navío de línea de la familia británica» (D94), y «… sin familia»
export function previewAlt(classId: PlayerShipClass, family: FamilyChoice): string {
  const label = SHIP_CLASSES[classId].label;
  return family === NO_FAMILY ? `${label} sin familia` : `${label} de la familia ${family === 'gb' ? 'británica' : 'española'}`;
}
