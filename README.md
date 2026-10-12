# Sea Battle

Batallas navales multijugador en el navegador, inspiradas en Seafight: navega con un clic, hunde piratas y mercantes con ataques persistentes y mejora tu barco con el botín.

## Características

- Servidor autoritativo (Socket.IO) con simulación pura y determinista en `src/game/` a 20 Hz
- Red por deltas a 10 Hz dentro de un área de interés de 300 m; sin tráfico cuando no pasa nada
- Render con React Three Fiber sin re-renders por frame; HUD en React a ≤ 10 Hz
- Autenticación con Clerk; modo invitado solo en local (`AUTH_BYPASS=1`)

Documentación del juego en `docs/game/`: `GDD.md` y `BACKLOG.md` (producto), `ART-DIRECTION.md`, `ASSET-SPEC.md` y `VFX-SPEC.md` (UX) y `TECH-ARCHITECTURE.md` (desarrollo). El equipo de agentes (producto, UX, desarrollo y QA) está definido en `CLAUDE.md` y `.claude/agents/`.

## Configuración del Entorno de Desarrollo

1. Clona el repositorio:
```bash
git clone <repository-url>
cd sea-battle
```

2. Usa Node 24 (el de Railway; lo fijan `.nvmrc` y `engines` en `package.json`) e instala las dependencias:
```bash
nvm use
npm install
```

3. Copia el archivo de variables de entorno:
```bash
cp .env.example .env.local
```

4. Configura las variables de entorno en `.env.local`:
   - Obtén las claves de Clerk desde [Clerk Dashboard](https://dashboard.clerk.com/)

5. Ejecuta el servidor de desarrollo:
```bash
npm run dev          # con Clerk
npm run dev:guest    # modo invitado local (AUTH_BYPASS=1), sin cuenta
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Deployment en Railway

> **Nota:** este proyecto usa un servidor Node personalizado (`server/index.ts`, compilado a `dist/server/index.js`) con Socket.IO, que requiere conexiones WebSocket persistentes. Por eso **no** se despliega en Vercel (serverless no soporta servidores persistentes). Railway sí los soporta.

### Prerrequisitos

- Cuenta en [Railway](https://railway.app)
- Cuenta en [Clerk](https://clerk.com)

### Pasos para Deployment

1. **Sube el código a GitHub** y crea un nuevo proyecto en Railway desde ese repositorio.

2. **Configura Railway:**
   - Railway (Railpack) toma la versión de Node de `engines.node` en `package.json` (24.x)
   - Railway detecta `npm run build` (build: `next build` + `tsc -p tsconfig.server.json`) y `npm start` (start: `NODE_ENV=production node dist/server/index.js`) desde `package.json`
   - **Nunca** definas `AUTH_BYPASS` en Railway: el servidor se niega a arrancar si lo detecta junto a las variables `RAILWAY_*`
   - Genera un dominio público en la pestaña "Settings" > "Networking"

3. **Configura Clerk:**
   - Ve a [Clerk Dashboard](https://dashboard.clerk.com/)
   - Copia las claves de producción:
     - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
     - `CLERK_SECRET_KEY`
   - Configura las URLs de redirección con el dominio de Railway:
     - Sign-in URL: `https://tu-app.railway.app/sign-in`
     - Sign-up URL: `https://tu-app.railway.app/sign-up`
     - After sign-in URL: `https://tu-app.railway.app/`
     - After sign-up URL: `https://tu-app.railway.app/`

4. **Configura Variables de Entorno en Railway:**
   ```
   NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_live_...
   CLERK_SECRET_KEY=sk_live_...
   NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
   NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
   NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL=/
   NEXT_PUBLIC_CLERK_SIGN_UP_FALLBACK_REDIRECT_URL=/
   NEXT_PUBLIC_APP_URL=https://tu-app.railway.app
   ```
   `PORT` la inyecta Railway automáticamente.

5. **Deploy:** Railway construye y arranca el servicio automáticamente en cada push.

### Notas sobre WebSockets

- Socket.IO corre en el mismo servidor que Next.js (`server/index.ts`), en el `PORT` que inyecta Railway. `/healthz` devuelve el estado y los jugadores en línea
- El cliente conecta a `window.location.origin`, así que no hace falta URL extra de socket

### Solución de Problemas

- Asegúrate de que todas las variables de entorno estén configuradas correctamente
- Verifica que las URLs de Clerk estén configuradas con el dominio correcto de Railway
- Revisa los logs del servicio en el dashboard de Railway (`Deployments` > `View Logs`)

## Scripts Disponibles

| Script | Qué hace |
|---|---|
| `npm run dev` / `npm run dev:guest` | Servidor de desarrollo (con Clerk / en modo invitado local) |
| `npm run build` | Build de producción: Next.js + servidor en `dist/` |
| `npm start` | Servidor de producción |
| `npm test` | Jest: simulación por criterio de aceptación, protocolo y servidor con sockets reales |
| `npm run test:e2e` | Playwright contra el build de producción (requiere `npm run build`) |
| `npm run test:perf` | Rendimiento: commits de React, frames de WebSocket y draw calls |
| `npm run qa:capture` | Capturas estándar en `qa-artifacts/` |
| `npm run verify` | typecheck + test + build (lo mismo que la CI) |

## Tecnologías Utilizadas

- [Next.js](https://nextjs.org/) - Framework React
- [Socket.io](https://socket.io/) - WebSockets en tiempo real
- [Three.js](https://threejs.org/) - Renderizado 3D
- [Clerk](https://clerk.com/) - Autenticación
- [Tailwind CSS](https://tailwindcss.com/) - Estilos
- [Zustand](https://zustand-demo.pmnd.rs/) - Gestión de estado
