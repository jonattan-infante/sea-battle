Transcodificador de Basis Universal para `KTX2Loader` (ASSET-SPEC §13), copiado sin cambios de
`node_modules/three/examples/jsm/libs/basis/` (three 0.180.0). Licencia Apache-2.0 (BinomialLLC/basis_universal).
Va en una carpeta con los 8 primeros hex del SHA-256 del js y el wasm (`BASIS_PATH` en `src/client/models/ship-glb.ts`),
porque se sirve con caché de un año (`next.config.ts`). `src/client/models/__tests__/ship-glb.test.ts` comprueba que sigue
igual que el de three instalado y que la carpeta lleva su hash.
