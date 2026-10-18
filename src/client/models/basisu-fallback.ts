// KHR_texture_basisu con respaldo (D90; ASSET-SPEC §1 y §13, paso 4b), en lugar del plugin de three del mismo nombre:
// GLTFLoader guarda los plugins por nombre y gana el registrado después (GLTFLoader.js:483 de r180). Si la textura trae
// respaldo en `source`, el GLB se lee con él, sin esperar al transcodificador, y la KTX2 se pide ya para cambiarla cuando
// llegue (salida 1 de AC-193 c). Sin respaldo, como el de three: la KTX2 en el parse. Un plugin por parse.
// Va en su propio módulo para que createGlbLoader lo importe con GLTFLoader y viaje en el trozo del cargador: en la
// página del juego, la primera visita sin manifiesto bajaría código del cargador (glb-cache.spec.ts, AC-193 c)
import type * as THREE from 'three';
import type { GLTFLoaderPlugin, GLTFParser } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { TextureUpgrade } from './ship-glb';

export function basisuWithFallback(ktx2: THREE.Loader, images?: THREE.Loader): { register: (parser: GLTFParser) => GLTFLoaderPlugin; upgrades: () => Promise<TextureUpgrade[]> } {
  const pending: Promise<TextureUpgrade>[] = [];
  return {
    register: (parser) => ({
      name: 'KHR_texture_basisu',
      loadTexture: (index) => {
        const def = parser.json.textures[index] as { source?: number; extensions?: { KHR_texture_basisu?: { source: number } } };
        const ext = def.extensions?.KHR_texture_basisu;
        if (!ext) return null;
        if (def.source === undefined) return parser.loadTextureImage(index, ext.source, ktx2);
        const fallback = parser.loadTextureImage(index, def.source, images ?? parser.textureLoader);
        const later = parser.loadTextureImage(index, ext.source, ktx2);
        pending.push(Promise.all([fallback, later]));
        return fallback;
      }
    }),
    upgrades: () => Promise.all(pending)
  };
}
