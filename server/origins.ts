import type { ServerOptions } from 'socket.io';

// Orígenes públicos del juego (AC-134 d): los únicos que abren el socket (CORS) y cuyos JWT de Clerk se aceptan (azp
// contra authorizedParties). PUBLIC_ORIGINS los lista separados por comas; sin la variable, localhost con el puerto y
// el dominio de Railway. Se normalizan como el navegador manda el Origin, y un valor que no es un origen falla al arrancar
export function publicOrigins(env: Record<string, string | undefined> = process.env): string[] {
  const listed = (env.PUBLIC_ORIGINS ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (listed.length === 0) return [`http://localhost:${env.PORT || '3000'}`, ...(env.RAILWAY_PUBLIC_DOMAIN ? [`https://${env.RAILWAY_PUBLIC_DOMAIN}`] : [])];
  return listed.map((o) => {
    const url = URL.canParse(o) ? new URL(o) : null;
    if (!url || !/^https?:$/.test(url.protocol)) throw new Error(`PUBLIC_ORIGINS: «${o}» no es un origen (https://dominio)`);
    return url.origin;
  });
}

// Opciones de Socket.IO del servidor: el CORS solo admite los orígenes públicos
export function socketServerOptions(origins: string[]): Partial<ServerOptions> {
  return { serveClient: false, cors: { origin: origins, methods: ['GET', 'POST'] } };
}

// AC-139 (paso 3): con PUBLIC_ORIGINS, una petición cuyo host no está en la lista (el dominio de Railway de prod) va con
// 301 al primer origen, con la misma ruta y la misma query. Sin la variable no hay redirección (staging y local)
export function canonicalRedirect(env: Record<string, string | undefined> = process.env): (host: string | undefined, url: string) => string | null {
  if (!(env.PUBLIC_ORIGINS ?? '').trim()) return () => null;
  const origins = publicOrigins(env);
  const hosts = origins.map((o) => new URL(o).host);
  // Una petición en forma absoluta (http://otro/…) va a la raíz: el destino siempre es el dominio propio
  return (host, url) => (host && hosts.includes(host.toLowerCase()) ? null : `${origins[0]}${url.startsWith('/') ? url : '/'}`);
}
