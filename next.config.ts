import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Los e2e construyen en su propia carpeta para no chocar con `next dev`, que reescribe .next
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
