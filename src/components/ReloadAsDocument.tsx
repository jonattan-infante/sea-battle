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

// O-21: con /game servido con sesión, la marca sobra. Si siguiera sus 30 s, un segundo desacuerdo en ese rato iría a
// /sign-in y volvería el bucle viejo (QA-15 §2). Se borra aquí porque un Server Component no puede escribir cookies, y
// la marca la escribe el cliente (no es HttpOnly)
export function ClearReloadMark() {
  useEffect(() => {
    const secure = window.location.protocol === 'https:' ? '; Secure' : '';
    document.cookie = `${RELOAD_COOKIE}=; Max-Age=0; Path=/; SameSite=Lax${secure}`;
  }, []);
  return null;
}
