import { verifyToken } from '@clerk/backend';
import { isAuthBypassAllowed } from '../src/lib/auth-bypass';
import { publicOrigins } from './origins';

export interface Identity {
  userId: string;
  guest: boolean;
}

const GUEST_ID = /^[a-z0-9-]{8,40}$/;
const TEST_USER = /^[a-z0-9-]{3,40}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Identidad de quien abre el socket: JWT de Clerk o, solo con el modo invitado permitido, un invitado o un usuario de prueba
export async function authenticateHandshake(auth: unknown, env: Record<string, string | undefined> = process.env, verify = verifyToken): Promise<Identity> {
  const data = isPlainObject(auth) ? auth : {};

  if (isAuthBypassAllowed(env) && data.guest === true) {
    const guestId = typeof data.guestId === 'string' && GUEST_ID.test(data.guestId)
      ? data.guestId
      : Math.random().toString(36).slice(2, 12);
    return { userId: `guest-${guestId}`, guest: true };
  }

  // Usuario de prueba de los e2e de persistencia (AC-97): se guarda como un usuario de Clerk, pero solo existe con el modo
  // invitado permitido (nunca en Railway). El prefijo test- impide pisar la fila de un jugador real
  if (isAuthBypassAllowed(env) && data.testUser !== undefined) {
    if (typeof data.testUser !== 'string' || !TEST_USER.test(data.testUser)) throw new Error('unauthorized');
    return { userId: `test-${data.testUser}`, guest: false };
  }

  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('server misconfigured');
  if (typeof data.token !== 'string' || data.token.length === 0) throw new Error('unauthorized');
  const session = await verify(data.token, { secretKey, authorizedParties: publicOrigins(env) });
  return { userId: session.sub, guest: false };
}
