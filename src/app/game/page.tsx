import { auth } from '@clerk/nextjs/server';
import GameApp from '../../components/GameApp';
import { isAuthBypassAllowed } from '../../lib/auth-bypass';

export const dynamic = 'force-dynamic';

// La puerta de autenticación vive aquí (runtime Node) y no en el middleware (Edge), porque Edge fija
// process.env al compilar y el modo invitado se decide en tiempo de ejecución.
export default async function GamePage() {
  const guest = isAuthBypassAllowed();
  if (!guest) {
    const { userId, redirectToSignIn } = await auth();
    if (!userId) return redirectToSignIn();
  }
  return <GameApp guest={guest} />;
}
