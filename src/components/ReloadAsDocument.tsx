'use client';

import { useEffect } from 'react';
import { RELOAD_COOKIE, RELOAD_COOKIE_MAX_AGE_S } from '../lib/auth-gate';

// P0 (src/lib/auth-gate.ts): /game llegó por una navegación del cliente con un token de sesión que solo el handshake
// del middleware puede refrescar; la misma URL como documento lo permite. La marca impide una segunda recarga seguida
export default function ReloadAsDocument() {
  useEffect(() => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${RELOAD_COOKIE}=1; Max-Age=${RELOAD_COOKIE_MAX_AGE_S}; Path=/; SameSite=Lax${secure}`;
    window.location.replace(window.location.href);
  }, []);
  return null;
}
