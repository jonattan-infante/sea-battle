# Sea Battle — Arquitectura técnica

Dueño: `game-developer`. Fuentes de verdad: `GDD.md` y `BACKLOG.md` (qué se construye) y `ART-DIRECTION.md`, `ASSET-SPEC.md` y `VFX-SPEC.md` (cómo se ve).

## 1. Vista general

```
 Navegador                                   Servidor Node (un proceso, un puerto; Railway inyecta PORT)
 ┌───────────────────────────────┐           ┌──────────────────────────────────────────────┐
 │ GameApp (React, HUD ≤ 10 Hz)  │  intents  │ server/index.ts   Next.js + /healthz          │
 │  ├─ GameClient (sin React) ───┼──────────►│ server/game-server.ts                         │
 │  │   frames → muestras →      │◄──────────┼─  valida (protocol.ts) · 10/s ráfaga 20        │
 │  │   interpolación 100 ms     │  frames   │   step() a 20 Hz · frames a 10 Hz              │
 │  ├─ runtime + R3F (useFrame)  │  10 Hz    │   deltas por cliente en 300 m                  │
 │  └─ HUD (zustand) / overlays  │           │ src/game/ (simulación pura y determinista)    │
 └───────────────────────────────┘           └──────────────────────────────────────────────┘
```

| Capa | Ruta | Regla |
|---|---|---|
| Simulación | `src/game/` | TypeScript puro: sin React, three.js, sockets, `Date` ni `Math.random` (AC-01). Todo el azar sale de `world.rng` con semilla (AC-02). Las constantes reproducen el GDD (AC-04) |
| Protocolo | `src/game/protocol.ts` | Parsers estrictos: tipos exactos, números finitos y ningún campo extra (AC-05) |
| Servidor | `server/` | Autoritativo. Autenticación con JWT de Clerk; el modo invitado solo funciona con `AUTH_BYPASS=1` y fuera de Railway (AC-09: el proceso termina si se combinan) |
| Red cliente | `src/client/game-client.ts` | Sin React. Fusiona los deltas en muestras completas por entidad e interpola con un retraso fijo de 100 ms, sin extrapolar |
| Render | `src/client/{art,runtime,overlays}.ts`, `models/`, `vfx/`, `src/components/game/` | `useFrame` muta refs; prohibido `setState` por frame. Placas y números en DOM posicionados por ref |
| HUD | `src/client/hud-store.ts`, `hud-logic.ts`, `src/components/hud/` | El store solo cambia con los datos (≤ 10 Hz). Lo que avanza con el reloj (recarga, protección, cuenta atrás) se pinta por ref desde un único `requestAnimationFrame` (AC-83) |

## 2. Red (GDD §13)

- **Un mensaje por envío**: `frame` (`ServerFrame` en `src/game/types.ts`) lleva los deltas de barcos (`s`), las salidas (`r`), los eventos visibles (`e`), la vista privada si cambió (`me`) y los avisos (`n`). Así se cumple ≤ 10 mensajes/s (AC-88).
- **Deltas**: al entrar en el área de interés (300 m) un barco se envía completo; después, solo los campos que cambiaron. Si no cambia nada, no se envía nada (AC-87).
- **Campos sin reloj**: la protección viaja como instante de fin (`pu`) y la muerte como `respawnAt`, ambos en tiempo de servidor. Así no hay deltas solo porque pasa el tiempo.
- **Eventos**: se filtran por distancia (300 m + 60). El botín (`loot`) solo lo recibe su dueño, y los restos van a todos.
- **Límite de intenciones**: cubeta de 20 fichas con recarga de 10/s por socket (AC-06). `join` no gasta fichas: solo se procesa una vez.
- **Desconexión**: el barco queda 10 s en el mundo y se puede atacar. Si el jugador reconecta, recupera el mismo barco (AC-96).
- **Servidor lleno**: cuentan los clientes conectados más los barcos en margen de reconexión. El jugador 21 recibe `serverFull` y vuelve a la landing con `?full=1` (AC-12).
- **Cliente**: Socket.IO hace 3 reintentos (1, 2 y 4 s, sin aleatorizar) y después ofrece "Reintentar" o "Salir" (AC-99).

Medido (Jest + socket real, `server/__tests__/game-server.test.ts`): con 20 clientes y 20 NPC en combate durante 30 s simulados, el peor cliente recibe 10,00 msg/s y 10,03 KB/s.

## 3. Harnesses

| Comando | Qué cubre |
|---|---|
| `npm test` | Simulación por AC (navegación, combate, NPC, economía, arquitectura), protocolo y servidor con sockets reales y reloj inyectable (`autoStart: false` + `tick()`) |
| `npm run build` | `next build` + `tsc -p tsconfig.server.json` → `dist/server/index.js` |
| `npm run test:e2e` | Playwright contra el build de producción, con 3 servidores: invitado (3100), invitado sin NPC (3101) y sin invitado (3102) |
| `npm run test:perf` | Commits de React (hook de DevTools inyectado), frames de WebSocket y `renderInfo` |
| `npm run test:soak` | AC-91: corrida larga de 10 min (`e2e/endurance.spec.ts`, escenario `endurance` en un servidor propio) con una muestra por minuto tras forzar el GC por CDP: heap, nodos DOM, escuchas JS, geometrías y texturas, y commits/s. Fuera de `verify` y de `test:e2e`; la ejecuta game-qa. `AC91_MINUTES=2` la acorta para validar el harness (10 muestras igualmente) |
| `npm run qa:capture` | Capturas estándar en `qa-artifacts/` (escritorio 1440×900 y móvil 390×844). Incluye AD-27 (`e2e/ocean-foam.spec.ts`, servidor propio sin NPC): la espuma se mide en las 12 vistas fijas de D42 con el pase de solo océano (`runtime.captureOceanPass`) y se asertan la mediana y las guardas, periodicidad (R23) incluida, y que el shader compile. Cada vista (PNG + JSON con la proyección y los uniforms) queda en `qa-artifacts/render/ad27/` |
| `scripts/ad27/*.py` | Modelo del shader del océano en numpy (`oceanmodel.py`) que sintetiza cada captura de AD-27 solo con su JSON. `validate_full.py` lo compara con las capturas reales; `predict_full.py` y `sets12.py` predicen las cifras sobre vistas al azar. Necesita Python 3 con numpy y Pillow; no forma parte de `verify` |
| `npm run verify` | typecheck + test + build (lo mismo que la CI) |
| `npm run test:remote` | Contra un despliegue real: `BASE_URL=https://… npm run test:remote` (`playwright.remote.config.ts`, specs en `e2e/remote/`). Sin servidores locales ni `AUTH_BYPASS`, y fuera de `verify` y de `test:e2e`. El global setup comprueba `/healthz` (registra el `commit`), entra con un usuario de prueba de Clerk (`@clerk/testing`) y guarda la sesión en `.auth/`. Specs: `session` (entra con identidad de Clerk), `smoke` (AC-135 / AC-139 a: recargar, volver tras ≥ 15 s y, fuera de prod, tras un redeploy; compara los 4 campos de AC-97) y `latency` (AC-136: 30 clics con el método de AC-14 más el RTT de `/healthz`). Cada corrida queda en `qa-artifacts/remote/`. Sin `BASE_URL`, sin respuesta, sin login o sin `window.__SEA_BATTLE__`, la corrida es **REMOTE NO VERIFICADO**, no un rojo del juego. La guarda de prod falla cerrada (DT-08): sin `REMOTE_ALLOW_PROD=1` solo arranca contra localhost y los hosts de `REMOTE_STAGING_HOSTS`; cualquier otro host cuenta como prod, y cada corrida en prod la autoriza Jonattan. Trace siempre apagado |

Puente de depuración de solo lectura: `window.__SEA_BATTLE__` (`ready`, `serverTime`, `me`, `ships` con coordenadas de pantalla, `player`, `hud`, `renderInfo` y `runtime`).

**Cuidado con la CPU**: Playwright usa el Chrome del sistema con Metal (`--use-angle=metal`). Con SwiftShader, el WebGL por software satura unos 6 núcleos. Cierra siempre el navegador al terminar.

## 4. Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk (la CI usa una clave ficticia con formato válido, solo para compilar) |
| `AUTH_BYPASS=1` | Modo invitado, solo local o e2e. Prohibido con `RAILWAY_*` presentes |
| `SEA_BATTLE_NPCS=0` | Servidor de prueba sin NPC (AC-83, AC-87) |
| `PORT` | Puerto HTTP y de Socket.IO |
| `RAILWAY_GIT_COMMIT_SHA` | Lo pone Railway en los despliegues desde Git; `/healthz` lo devuelve como `commit` (`null` si falta) |
| `BASE_URL` | `test:remote`: despliegue que se prueba |
| `E2E_CLERK_EMAIL` + `CLERK_SECRET_KEY` | `test:remote`, inicio de sesión A (preferido): token de inicio de sesión del Backend API y Testing Token de la instancia del despliegue; sin contraseña |
| `E2E_CLERK_EMAIL` + `E2E_CLERK_PASSWORD` | `test:remote`, inicio de sesión C (sin clave secreta): solo si la instancia tiene activado el inicio de sesión con contraseña |
| `REMOTE_CONNECTION` | `test:remote`, AC-136: etiqueta de la conexión medida (p. ej., `jonattan-casa`) |
| `REMOTE_REDEPLOY_CMD` | `test:remote`, AC-135 (3): comando que redespliega staging; sin él, el spec espera hasta 15 min a que alguien lo haga y lo detecta por el `uptime` de `/healthz` |
| `REMOTE_STAGING_HOSTS`, `REMOTE_ALLOW_PROD=1` | `test:remote`: hosts de staging separados por comas (con localhost, los únicos que no cuentan como prod) y permiso explícito para correr contra cualquier otro |

Las variables de `test:remote` van en `.env.remote.local` (lo ignora `.env*` en `.gitignore`) o en el entorno, que manda sobre el archivo. Nunca se commitean ni se imprimen. La clave publicable y el Frontend API de Clerk se leen del propio despliegue, así no se mezcla otra instancia.

## 5. Pendiente y decisiones abiertas

- Persistencia por `userId` (P1, AC-97): falta elegir el almacén (GDD Q2), y el coste lo aprueba Jonattan.
- El ping del HUD (solo si es > 200 ms) necesita medir la latencia sin enviar mensajes en reposo (AC-86); está pendiente de diseño.
- Capitán pirata, munición especial y sonido: P2.
