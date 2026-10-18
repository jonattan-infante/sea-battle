import type { NextConfig } from "next";
import { HASH, HASHED_GLB_NAME } from "./scripts/glb/content-hash";

// AC-193 c: lo que lleva el hash de su contenido en la URL se guarda un año sin revalidar (0 viajes de red en la visita
// siguiente): el transcodificador de KTX2 en /basis/<hash>/ y los GLB en /models/<nombre>.<hash>.glb, con los patrones
// de scripts/glb/content-hash.ts. Sin esta regla, Next sirve public/ con max-age=0. Un 404 no se guarda: Next le pone
// no-store (lo comprueba e2e/glb-cache.spec.ts)
const IMMUTABLE = [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }];

const nextConfig: NextConfig = {
  // Los e2e construyen en su propia carpeta para no chocar con `next dev`, que reescribe .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
  async headers() {
    return [
      { source: `/basis/:hash(${HASH})/:file`, headers: IMMUTABLE },
      { source: `/models/:file(${HASHED_GLB_NAME})`, headers: IMMUTABLE },
    ];
  },
};

export default nextConfig;
