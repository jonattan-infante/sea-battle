// Fixtures de GLB armados en memoria que build:e2e copia a public/models (stage-e2e-models.ts) y que los e2e piden por su
// nombre: los dos lados los arman aquí, con los mismos bytes. Van fuera de git (.gitignore, prefijo e2e_)
import { contentHash, E2E_PREFIX } from './content-hash';
import { addFallback, externalizeKtx2, solidPng } from './glb-fallback';

// Paso 4c de ASSET-SPEC §13: el fixture con un respaldo verde de 16² en el BIN y su KTX2 en un .ktx2 aparte, enlazado por
// `uri`. Con el respaldo el barco se ve verde y con la KTX2, magenta
export function externalKtx2Fixture(fixture: Uint8Array) {
  const { glb, ktx2, name } = externalizeKtx2(addFallback(fixture, solidPng([0, 255, 0], 16)), `${E2E_PREFIX}ship_ext`);
  return { glb, ktx2, glbFile: `${E2E_PREFIX}ship_ext.${contentHash(glb)}.glb`, ktx2File: name };
}
