import { auth } from '@clerk/nextjs/server';
import { headers } from 'next/headers';
import GameApp from '../../components/GameApp';
import ReloadAsDocument, { ClearReloadMark } from '../../components/ReloadAsDocument';
import { shouldReloadAsDocument } from '../../lib/auth-gate';
import { isAuthBypassAllowed } from '../../lib/auth-bypass';

export const dynamic = 'force-dynamic';

// La puerta de autenticación vive aquí (runtime Node) y no en el middleware (Edge), porque Edge fija
// process.env al compilar y el modo invitado se decide en tiempo de ejecución.
export default async function GamePage() {
  const guest = isAuthBypassAllowed();
  if (!guest) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) {
      // Con un token que solo el handshake refresca, ir a /sign-in sería un bucle: <SignIn> vuelve aquí (auth-gate.ts)
      const requestHeaders = await headers();
      if (shouldReloadAsDocument(requestHeaders.get('x-clerk-auth-reason'), requestHeaders))
        return (
          <div data-testid="auth-reload">
            <ReloadAsDocument />
          </div>
        );
      return redirectToSignIn();
    }
  }
  return (
    <>
      {!guest && <ClearReloadMark />}
      <GameApp guest={guest} />
    </>
  );
}
