# Despliegue

Sea Battle corre en [Railway](https://railway.app) con un servidor Node propio (Next.js y Socket.IO en el mismo proceso).

## Cómo se despliega este proyecto

Los despliegues los hace la CI de GitHub (`.github/workflows/ci.yml`), nunca a mano:

| Entorno | Cuándo | Quién lo aprueba |
|---|---|---|
| Staging (`sea-battle-staging.up.railway.app`) | Un PR a `main` desde una rama de este repositorio (no de un fork), cuando se le pone la etiqueta `staging`, y en cada push nuevo a ese PR | Nadie: se despliega solo tras `verify` |
| Producción (`seabattle.jonattan.dev`) | Cada push a `main`, tras `verify` | El dueño del proyecto, con «Review deployments» en el environment `production` |

Después del despliegue a producción, la CI comprueba la configuración (`scripts/railway/check_deploy.py`) y crea el tag y la release de GitHub. `/healthz` responde con el commit, el mapa y si el I2 está encendido.

## Montar tu propio despliegue

> **Nota:** este proyecto usa un servidor Node personalizado (`server/index.ts`, compilado a `dist/server/index.js`) con Socket.IO, que requiere conexiones WebSocket persistentes. Por eso **no** se despliega en Vercel (serverless no soporta servidores persistentes). Railway sí los soporta.

### Prerrequisitos

- Cuenta en [Railway](https://railway.app)
- Cuenta en [Clerk](https://clerk.com)

### Pasos para Deployment

1. **Sube el código a GitHub** y crea un nuevo proyecto en Railway desde ese repositorio.

2. **Configura Railway:**
   - Railway (Railpack) toma la versión de Node de `engines.node` en `package.json` (24.x)
   - Railway detecta `npm run build` (build: `next build` + `tsc -p tsconfig.server.json`) desde `package.json`
   - En «Settings», pon el Start Command `node dist/server/index.js` (sin `npm` en medio, para que el `SIGTERM` llegue a `node` y se guarde el progreso al apagar), el Healthcheck Path `/healthz` y 1 réplica
   - Añade un Postgres al proyecto: el progreso de los jugadores se guarda ahí, y en Railway el servidor no arranca sin `DATABASE_URL`
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
   DATABASE_URL=${{Postgres.DATABASE_URL}}
   RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0
   RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15
   ```
   `PORT` la inyecta Railway automáticamente. Las dos últimas hacen que el servidor viejo reciba el `SIGTERM` en cuanto empieza el relevo, sin convivir con el nuevo, y tenga 15 s para guardar el progreso antes de que Railway lo mate (`docs/game/TECH-ARCHITECTURE.md`, §2.1).

5. **Deploy:** Railway construye y arranca el servicio automáticamente en cada push.

### Notas sobre WebSockets

- Socket.IO corre en el mismo servidor que Next.js (`server/index.ts`), en el `PORT` que inyecta Railway. `/healthz` devuelve el estado y los jugadores en línea
- El cliente conecta a `window.location.origin`, así que no hace falta URL extra de socket

### Solución de Problemas

- Asegúrate de que todas las variables de entorno estén configuradas correctamente
- Verifica que las URLs de Clerk estén configuradas con el dominio correcto de Railway
- Revisa los logs del servicio en el dashboard de Railway (`Deployments` > `View Logs`)
