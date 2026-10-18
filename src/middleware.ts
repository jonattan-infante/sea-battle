import { clerkMiddleware } from '@clerk/nextjs/server';

// Clerk necesita su middleware para que auth() funcione en el servidor. La protección de /game está en
// src/app/game/page.tsx: el runtime Edge fija process.env al compilar y no vería el modo invitado.
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params. También los modelos (.glb), sus
    // texturas (.ktx2) y el transcodificador de KTX2 (.wasm) de public/ (ASSET-SPEC §13): son estáticos, sin sesión
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|glb|ktx2|wasm)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};
