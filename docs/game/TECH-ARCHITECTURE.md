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
- **Eventos**: se filtran por distancia (300 m + 60). El botín (`loot`) solo lo recibe su dueño, y los restos van a todos, igual que el aviso (`captain`) y el feed (`captainDown`) del Capitán pirata.
- **Área de interés** (`inInterest` en `server/game-server.ts`): 300 m alrededor de cada centro de una lista (hoy, el barco propio; la vista libre de E13 añade el centro de la vista sin cambiar la regla) más lo que se envía siempre: el barco propio y el Capitán pirata vivo o hundiéndose, para su marcador del minimapa (GDD §13, AC-111). Solo hay un capitán, así que suma como mucho una entidad por cliente. Medido con él (AC-88): 10,00 msg/s y 9,88 KB/s en el peor cliente.
- **Límite de intenciones**: cubeta de 20 fichas con recarga de 10/s por socket (AC-06). `join` no gasta fichas: solo se procesa una vez.
- **Desconexión**: el barco queda 10 s en el mundo y se puede atacar. Si el jugador reconecta, recupera el mismo barco (AC-96).
- **Servidor lleno**: cuentan los clientes conectados más los barcos en margen de reconexión. El jugador 21 recibe `serverFull` y vuelve a la landing con `?full=1` (AC-12).
- **Cliente**: Socket.IO hace 3 reintentos (1, 2 y 4 s, sin aleatorizar) y después ofrece "Reintentar" o "Salir" (AC-99).

Medido (Jest + socket real, `server/__tests__/game-server.test.ts`): con 20 clientes y 20 NPC en combate durante 30 s simulados, el peor cliente recibe 10,00 msg/s y 10,03 KB/s.

## 3. Capitán pirata (H-305, GDD §9)

| Pieza | Dónde | Regla |
|---|---|---|
| Identidad | `SHIP_CLASSES.captain`, `CAPTAIN_CLASS` (`constants.ts`) | `kind: 'pirate'` (facción hostil: misma regla de ataque, exclusión de 130 m del puerto y relación coral) y `classId: 'captain'` para todo lo propio del jefe. El render elige el modelo por `classId`: `SHIP_RECIPES.captain` es la receta `npc_pirate_captain` (dev-render, `264363e`) |
| IA | `HOSTILE_AI` (`constants.ts`), `updatePirate` (`world.ts`) | La misma máquina de estados del pirata con el perfil de su clase: detecta a 90 m, orbita a 50 m, correa de 150 m alrededor de su guarida. Objetivo perdido (110 m), velocidad de órbita (8 m/s) y patrulla (120 m) son "como el pirata" |
| Aparición | `updateCaptain` → `spawnCaptain` (`world.ts`) | Al final de `step`: con `killsSinceBoss ≥ 10` y ningún capitán en el mundo. Guarida = sector con menos jugadores (empate con `world.rng`), punto del arco de 440 m más cercano a su centro que esté a ≥ 150 m de todos los jugadores y fuera del margen de las islas; si no hay, el siguiente sector; si ninguno, se reintenta en el siguiente tick |
| Cuenta | `sinkShip` | Suman los `kind: 'pirate'` que no son el capitán (piratas y, con H-306, cañoneras). La muerte del capitán la pone a 0 y no suma |
| Muerte | `sinkShip`, `updateLifecycle` | Reparto y restos como cualquier NPC (600 + 150). Evento `captainDown` con hasta 3 nombres por daño (ventana de 60 s del reparto) y `more`. Al terminar de hundirse sale del mundo: no reaparece por tiempo |
| Cliente | `GameApp.tsx`, `hud-logic.ts`, `Minimap.tsx`, `overlays.ts` | Aviso (toast `warn`) y línea de feed con los textos de `captainSpawnText` / `captainDownText`. Minimapa (D43): ★ de radio 5,5 / 2,2 px en el canvas (≤ 2 Hz), encima de piratas y mercantes y debajo del ▲ propio, que desaparece en el redibujado del hundimiento; el halo es un `<svg>` sobre el canvas con animación CSS de 1 s y trazo de 1,5 px que no escala. Placa: calavera + corona (2 iconos de 12 px) y ancho máximo +14 px para que «Capitán pirata» no se trunque; panel del objetivo: corona sobre la calavera |
| Escenarios | `server/scenarios.ts` | `captain` (9 hundidos y un cebo con 1 de vida) y `captain-down` (capitán quieto con 1 de vida que no acierta), para `e2e/captain.spec.ts` |

## 4. Harnesses

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

Puente de depuración de solo lectura: `window.__SEA_BATTLE__` (`ready`, `serverTime`, `me`, `ships` con coordenadas de pantalla, `player`, `hud`, `renderInfo` y `runtime`).

**Cuidado con la CPU**: Playwright usa el Chrome del sistema con Metal (`--use-angle=metal`). Con SwiftShader, el WebGL por software satura unos 6 núcleos. Cierra siempre el navegador al terminar.

## 5. Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk (la CI usa una clave ficticia con formato válido, solo para compilar) |
| `AUTH_BYPASS=1` | Modo invitado, solo local o e2e. Prohibido con `RAILWAY_*` presentes |
| `SEA_BATTLE_NPCS=0` | Servidor de prueba sin NPC (AC-83, AC-87) |
| `PORT` | Puerto HTTP y de Socket.IO |

## 6. Pendiente y decisiones abiertas

- Persistencia por `userId` (P1, AC-97): falta elegir el almacén (GDD Q2), y el coste lo aprueba Jonattan.
- El ping del HUD (solo si es > 200 ms) necesita medir la latencia sin enviar mensajes en reposo (AC-86); está pendiente de diseño.
- Munición especial y sonido: P2.
