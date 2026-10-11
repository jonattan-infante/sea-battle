# Sea Battle

Un juego de batalla naval en tiempo real construido con Next.js, Socket.io, Three.js y Clerk para autenticación.

## Características

- Juego multijugador en tiempo real con WebSockets
- Autenticación con Clerk
- Renderizado 3D con Three.js y React Three Fiber
- Persistencia opcional con Vercel KV
- UI moderna con Tailwind CSS

## Configuración del Entorno de Desarrollo

1. Clona el repositorio:
```bash
git clone <repository-url>
cd sea-battle
```

2. Instala las dependencias:
```bash
npm install
```

3. Copia el archivo de variables de entorno:
```bash
cp .env.example .env.local
```

4. Configura las variables de entorno en `.env.local`:
   - Obtén las claves de Clerk desde [Clerk Dashboard](https://dashboard.clerk.com/)
   - Configura Vercel KV si es necesario para desarrollo local

5. Ejecuta el servidor de desarrollo:
```bash
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000) en tu navegador.

## Deployment en Railway

> **Nota:** este proyecto usa un servidor Node personalizado (`server.js`) con Socket.IO, que requiere conexiones WebSocket persistentes. Por eso **no** se despliega en Vercel (serverless no soporta servidores persistentes). Railway sí los soporta.

### Prerrequisitos

- Cuenta en [Railway](https://railway.app)
- Cuenta en [Clerk](https://clerk.com)
- Proyecto en [Vercel KV](https://vercel.com/docs/storage/vercel-kv) (opcional, para persistencia)

### Pasos para Deployment

1. **Sube el código a GitHub** y crea un nuevo proyecto en Railway desde ese repositorio.

2. **Configura Railway:**
   - Railway detecta `npm run build` (build) y `npm start` (start: `NODE_ENV=production node server.js`) desde `package.json`
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
   NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/
   NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/
   NEXT_PUBLIC_APP_URL=https://tu-app.railway.app
   KV_URL=redis://...            # opcional
   KV_REST_API_URL=https://...   # opcional
   ```
   `PORT` la inyecta Railway automáticamente.

5. **Deploy:** Railway construye y arranca el servicio automáticamente en cada push.

### Notas sobre WebSockets

- Socket.IO corre en el mismo servidor que Next.js (`server.js`), en el `PORT` que inyecta Railway
- El cliente conecta a `window.location.origin`, así que no hace falta URL extra de socket

### Solución de Problemas

- Asegúrate de que todas las variables de entorno estén configuradas correctamente
- Verifica que las URLs de Clerk estén configuradas con el dominio correcto de Railway
- Revisa los logs del servicio en el dashboard de Railway (`Deployments` > `View Logs`)

## Scripts Disponibles

- `npm run dev` - Inicia el servidor de desarrollo
- `npm run build` - Construye la aplicación para producción
- `npm run start` - Inicia el servidor de producción
- `npm test` - Ejecuta los tests

## Tecnologías Utilizadas

- [Next.js](https://nextjs.org/) - Framework React
- [Socket.io](https://socket.io/) - WebSockets en tiempo real
- [Three.js](https://threejs.org/) - Renderizado 3D
- [Clerk](https://clerk.com/) - Autenticación
- [Vercel KV](https://vercel.com/docs/storage/vercel-kv) - Almacenamiento
- [Tailwind CSS](https://tailwindcss.com/) - Estilos
- [Zustand](https://zustand-demo.pmnd.rs/) - Gestión de estado
