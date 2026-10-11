import { verifyToken } from '@clerk/backend';
import { isAuthBypassAllowed } from '../src/lib/auth-bypass';

export interface Identity {
  userId: string;
  guest: boolean;
}

const GUEST_ID = /^[a-z0-9-]{8,40}$/;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// Identidad de quien abre el socket: JWT de Clerk o, solo con el modo invitado permitido, un id de invitado
export async function authenticateHandshake(auth: unknown, env: Record<string, string | undefined> = process.env): Promise<Identity> {
  const data = isPlainObject(auth) ? auth : {};

  if (isAuthBypassAllowed(env) && data.guest === true) {
    const guestId = typeof data.guestId === 'string' && GUEST_ID.test(data.guestId)
      ? data.guestId
      : Math.random().toString(36).slice(2, 12);
    return { userId: `guest-${guestId}`, guest: true };
  }

  const secretKey = env.CLERK_SECRET_KEY;
  if (!secretKey) throw new Error('server misconfigured');
  if (typeof data.token !== 'string' || data.token.length === 0) throw new Error('unauthorized');
  const session = await verifyToken(data.token, { secretKey });
  return { userId: session.sub, guest: false };
}
