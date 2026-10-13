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
 └───────────────────────────────┘           │ server/persistence.ts ──► Postgres (Railway)  │
                                             └──────────────────────────────────────────────┘
```

| Capa | Ruta | Regla |
|---|---|---|
| Simulación | `src/game/` | TypeScript puro: sin React, three.js, sockets, `Date` ni `Math.random` (AC-01). Todo el azar sale de `world.rng` con semilla (AC-02). Las constantes reproducen el GDD (AC-04) |
| Protocolo | `src/game/protocol.ts` | Parsers estrictos: tipos exactos, números finitos y ningún campo extra (AC-05) |
| Servidor | `server/` | Autoritativo. Autenticación con JWT de Clerk; el modo invitado solo funciona con `AUTH_BYPASS=1` y fuera de Railway (AC-09: el proceso termina si se combinan) |
| Puerta de `/game` | `src/app/game/page.tsx`, `src/lib/auth-gate.ts` | Sin `userId`, manda a `/sign-in`, salvo en una navegación del cliente (RSC) con un motivo de handshake de Clerk (`x-clerk-auth-reason`: token viejo, caducado o que falta con `__client_uat`): entonces recarga la página como documento, porque el middleware solo hace el handshake en documentos, y en prod la Frontend API pone `__client_uat` por su cuenta. Sin esto, `/sign-in` volvía a `/game` y se formaba un bucle (P0 de la 1.0.0; `e2e/auth-gate.spec.ts`). Una sola recarga: deja la cookie `sea-battle-auth-reload` 30 s y, con ella, `/game` manda a `/sign-in` como antes. Cuando `/game` se sirve con sesión, el cliente la borra al montar (`ClearReloadMark`; un Server Component no puede escribir cookies), para que un segundo desacuerdo en esos 30 s también se recupere (O-21) |
| Persistencia | `server/{persistence,progress,bootstrap}.ts`, `server/db/` | Progreso de los usuarios de Clerk en Postgres (§2.1). La simulación no toca la BD |
| Red cliente | `src/client/game-client.ts` | Sin React. Fusiona los deltas en muestras completas por entidad e interpola con un retraso fijo de 100 ms, sin extrapolar |
| Render | `src/client/{art,runtime,overlays}.ts`, `models/`, `vfx/`, `src/components/game/` | `useFrame` muta refs; prohibido `setState` por frame. Placas y números en DOM posicionados por ref |
| HUD | `src/client/hud-store.ts`, `hud-logic.ts`, `src/components/hud/` | El store solo cambia con los datos (≤ 10 Hz). Lo que avanza con el reloj (recarga, protección, cuenta atrás) se pinta por ref desde un único `requestAnimationFrame` (AC-83) |
| Runtime | `package.json` (`engines.node`), `.nvmrc`, `.github/workflows/ci.yml` | Node 24 en local, en la CI y en Railway (DT-14). Railpack toma la mayor de `engines.node` (`24.x` → la última 24); sin ella usaría su «lts», que pasa a Node 26 el 2026-10-28. La CI lee `.nvmrc`. El npm de Node 24.21 no ejecuta los scripts de instalación de las dependencias sin `allowScripts`; ninguno hace falta (son avisos o descargas de respaldo de binarios que ya llegan como dependencias opcionales) |

## 2. Red (GDD §13)

- **Un mensaje por envío**: `frame` (`ServerFrame` en `src/game/types.ts`) lleva los deltas de barcos (`s`), las salidas (`r`), los eventos visibles (`e`), la vista privada si cambió (`me`) y los avisos (`n`). Así se cumple ≤ 10 mensajes/s (AC-88).
- **Deltas**: al entrar en el área de interés (300 m) un barco se envía completo; después, solo los campos que cambiaron. Si no cambia nada, no se envía nada (AC-87).
- **Campos sin reloj**: la protección viaja como instante de fin (`pu`) y la muerte como `respawnAt`, ambos en tiempo de servidor. Así no hay deltas solo porque pasa el tiempo.
- **Eventos**: se filtran por distancia (300 m + 60). El botín (`loot`) solo lo recibe su dueño, y los restos van a todos.
- **Límite de intenciones**: cubeta de 20 fichas con recarga de 10/s por socket (AC-06). `join` no gasta fichas: solo se procesa una vez.
- **Desconexión**: el barco queda 10 s en el mundo y se puede atacar. Si el jugador reconecta, recupera el mismo barco (AC-96).
- **Servidor lleno**: cuentan los clientes conectados más los barcos en margen de reconexión. El jugador 21 recibe `serverFull` y vuelve a la landing con `?full=1` (AC-12).
- **Cliente**: Socket.IO hace 3 reintentos (1, 2 y 4 s, sin aleatorizar) y después ofrece "Reintentar" o "Salir" (AC-99).
- **Estados de progreso en el cliente** (D50): un solo `ConnectionOverlay` con la tabla de §16.2 de ART-DIRECTION.
  - `progressError` antes de `welcome` deja el cliente en `load-failed`: no se monta el mundo, el que quede de una sesión anterior se oculta y nada reintenta solo. «Reintentar» (`GameClient.retryLoad`) lanza un solo intento a la vez, que acaba en `welcome` o en el mismo fallo (plazo de 8 s si el servidor no contesta) (AC-131).
  - `kicked` se queda sin los reintentos de AC-99 (AC-133).
  - `PlayerView.unsaved` enciende el aviso persistente y bloquea Puerto y la tienda. El aviso se queda ≥ 3 s y sale con «Progreso guardado» (`syncUnsaved` en `hud-store.ts`, AC-132).
  - El e2e del cliente (`e2e/progress-states.spec.ts`) hace de BD caída con `page.routeWebSocket`: se traga el `join` y responde `progressError`, o añade `unsaved` a la vista privada.

Medido (Jest + socket real, `server/__tests__/game-server.test.ts`): con 20 clientes y 20 NPC en combate durante 30 s simulados, el peor cliente recibe 10,00 msg/s y 10,03 KB/s.

### 2.1 Progreso guardado (AC-97, AC-129 a AC-133)

Postgres de Railway (`DATABASE_URL`, GDD Q2) con `pg`, sin ORM. Se guarda el oro, las mejoras, los barcos en propiedad y el barco activo de cada usuario de Clerk; la vida y la posición no (AC-129).

| Pieza | Qué hace |
|---|---|
| `player_progress` | `user_id` (el `sub` del JWT verificado, AC-08), `state` jsonb, `revision` (+1 en cada escritura) y `updated_at` |
| `server/progress.ts` | Parser estricto del `state` (oro entero entre 0 y el tope, niveles 1–3, barco activo entre los que posee). Lo que no pasa no se usa ni se sobrescribe (AC-131) |
| `server/db/migrate.ts` | Migraciones al arrancar, antes de abrir el puerto, con `pg_advisory_lock`. Si fallan, el proceso termina y Railway mantiene el despliegue anterior |
| `server/persistence.ts` | Carga al entrar y cola de escrituras por usuario. Cada escritura lleva la revisión leída: si otro proceso escribió algo más nuevo, no se pisa y el jugador se recarga desde la BD |
| `server/bootstrap.ts` | Arranque compartido por `index.ts` y el proceso de los tests. En Railway sin `DATABASE_URL` el servidor no arranca; fuera de Railway, sin ella, todo vive en memoria (con aviso) |

Cuándo se escribe:

| Momento | Escritura |
|---|---|
| Entrar | Si el jugador sigue en memoria (reconexión en ≤ 10 s u otra pestaña), se usa la memoria, que es lo más fresco. Si no, se lee la fila (plazo de 3 s); sin fila, empieza con 100 de oro y la Balandra |
| Salir de la memoria | Al retirar el barco tras los 10 s de AC-96, el jugador sale de la memoria, pero solo cuando su estado ya está escrito (si la BD falla, sigue en memoria hasta que se escriba). Así, al volver, el progreso sale de la BD (AC-129). El invitado sale sin más y vuelve con 100 de oro |
| Compra o cambio de barco | El mundo valida (`planBuy`, `planSelectShip`), se escribe y solo entonces se aplica y se confirma (AC-130 a). Si falla, se rechaza y no cambia nada. Una a la vez por usuario («Compra en curso») |
| Oro | Cada 2 s, solo si cambió algo (huella): en reposo, cero consultas. Queda escrito en ≤ 5 s (AC-130 b) |
| Desconexión | En el acto, sin esperar los 10 s del barco (AC-130 c) |
| `SIGTERM` (redeploy) | `server/shutdown.ts`: no entra nadie más y se para la simulación, se escribe el progreso de todos y **solo después** se cierran las conexiones, para que el cliente que reconecta al despliegue nuevo cargue lo ya escrito (AC-129). Con la BD colgada, la escritura tiene un plazo de 10 s, por debajo de los 15 s de drenaje del servicio (ver «Despliegue»); después sale con 0 igualmente. Los sellos de los logs de Railway llegan en lote, así que cada paso se loguea con la hora del propio proceso (ISO con ms) y los ms desde la señal: `🛑 SIGTERM: guardando el progreso antes de cerrar <iso>`, `💾 Progreso guardado <iso> (+N ms)` (o el aviso de que no se pudo) y `🔌 Sockets cerrados <iso> (+N ms)`. Con ellas se mide N de H-25 en el servidor, del cambio de `/healthz` a 💾 |

Si la BD falla:

| Momento | Qué pasa |
|---|---|
| Al entrar (AC-131) | Plazos de 3 s al conectar y por consulta (`server/db/pool.ts`). BD caída, colgada o registro que no pasa el parser → `S2C.progressError` y no se entra al mundo; no se escribe nada, así que la fila queda igual byte a byte. Los reintentos de `join` en el mismo socket gastan fichas del límite de intenciones |
| En partida (AC-132) | La primera escritura que falla (el oro, una compra, un cambio de barco o una desconexión) pone la persistencia en «degradada». En reposo no hay consultas, así que si nadie cambia nada el corte no se ve hasta esa escritura (H-24, decisión de game-product; `persistence-failures.test.ts`, caso H-24). Degradada: `PlayerView.unsaved` para todos los jugadores con cuenta (nunca para el invitado), y la tienda y el cambio de barco se rechazan con «La tienda no está disponible: no podemos guardar». Mientras dura el corte no se reintenta ninguna escritura: el guardado periódico se para y solo hay un `SELECT 1` por segundo, sin solaparse (con la BD colgada, cada uno espera su plazo de 3 s). Cuando responde, se escribe todo lo pendiente y `unsaved` desaparece en el frame siguiente: ≤ 5 s desde que vuelve la BD, dure lo que dure el corte (opción B de game-product). Si alguien carga su progreso bien durante el corte, se escribe en el acto |

- El invitado no escribe nunca. El usuario de prueba de los e2e (`testUser`, guardado como `test-<id>`) solo existe con el modo invitado, fuera de Railway.
- **Una sesión por `userId` (AC-133):** la pestaña nueva toma el mismo barco desde la memoria, sin releer la BD, y la vieja recibe `kicked` («Has abierto el juego en otra pestaña») y se queda sin reintentos (cliente de D50). Dos pestañas que entran a la vez dejan una sola, con un solo barco.
- **Despliegue (DT-13): la configuración vive en el servicio de Railway de cada entorno, no en el repo.** Railway no aplica `railway.json` a este servicio, porque se creó después del 2026-08-28; y Config as Code deja de leerse el 2026-12-01. Por eso el archivo ya no existe. Staging tiene esta configuración desde el 2026-10-12. Prod la recibe en el paso de variables del corte (AC-139), junto con `DATABASE_URL`.

  | Valor | Dónde | Por qué |
  |---|---|---|
  | Arranque `node dist/server/index.js` | Ajuste Start Command | Sin `npm` en medio, el `SIGTERM` llega a `node`. No es el PID 1 (los logs dicen `(node:2)`): delante hay un proceso de la plataforma que le reenvía la señal, porque 🛑 y 💾 salen en los relevos de staging del 2026-10-12 |
  | Healthcheck `/healthz` | Ajuste Healthcheck Path (plazo por defecto, 300 s) | Sin un 2xx no se enruta al despliegue nuevo: si la BD o las migraciones fallan, sigue el anterior |
  | 1 réplica | Ajuste Replicas (us-west2) | Un solo mundo y un solo escritor por `userId` |
  | Solape 0 | Variable `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0` | El viejo recibe el `SIGTERM` al empezar el relevo |
  | Drenaje 15 s | Variable `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` | Más que los 10 s del apagado + 2 s, para que el `SIGKILL` no corte la escritura |

  Se comprueba con `python3 scripts/railway/check_deploy.py --env staging` (o `production`), en solo lectura: los 5 valores, el paso `HEALTHCHECK` del último despliegue, el arranque del plan de Railpack, cómo fue el último relevo y, solo por el nombre y nunca por el valor, dos cosas: que exista `DATABASE_URL` y que las redirecciones de Clerk sean `NEXT_PUBLIC_CLERK_SIGN_IN_FALLBACK_REDIRECT_URL` y `…_SIGN_UP_FALLBACK_REDIRECT_URL`, sin los obsoletos `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL` ni `…_AFTER_SIGN_UP_URL` (DT-11, punto 5). Sale con 1 si algo no coincide. En staging, el 2026-10-12, el `SIGTERM` llegó al viejo a los 0,7–0,9 s de empezar el relevo (`DRAIN_INSTANCES`), frente a 21,9–31,6 s con el solape por defecto, y `DRAIN_INSTANCES` pasó a durar 15,6–16,0 s. Que llegue un `SIGKILL` a los 15 s no se ha observado, porque el servidor sale en milisegundos. Si el build no trae el banner de Railpack en sus logs (el de prod de la 1.0.0), el plan de arranque sale «no comprobable» y no cuenta como fallo; un banner con otro plan sí (H-27, `start_check`).
- **Despliegue automático (DT-16, `.github/workflows/ci.yml`):** Railway no despliega solo (el servicio está conectado al repo, pero sin `deploymentTriggers`); despliega GitHub Actions, por la API de Railway (`serviceInstanceDeployV2` con el `commitSha`), con un token de proyecto por entorno: el secreto `RAILWAY_TOKEN` de los entornos `staging` y `production` de GitHub.
  | Cuándo | Job | Qué hace |
  |---|---|---|
  | PR hacia `main` desde una rama de este repo (no desde un fork), tras `verify` | `deploy-staging` (`concurrency: staging`, sin cancelar uno a medias) | Despliega la cabeza del PR en staging, espera `SUCCESS` (plazo de 20 min), espera a que `/healthz` dé ese commit (plazo de 3 min) y corre `check_deploy.py --env staging` |
  | Push a `main`, tras `verify` y el clic del revisor del entorno `production` (jonattan-infante) | `deploy-production` (`concurrency: production`; el único con `contents: write`) | Lo mismo en prod. Después, si el tag `v<versión de package.json>` no existe, crea el tag anotado sobre ese commit y la release de GitHub con la sección de esa versión del `CHANGELOG.md`; si existe, no toca nada |

  `scripts/railway/deploy.py` hace el despliegue y las esperas, y sale con 1 si el despliegue acaba en `FAILED`, `CRASHED`, `REMOVED`, `SKIPPED` o `NEEDS_APPROVAL`, si se pasa de plazo o si `/healthz` no da el commit: el job falla y se ve en el PR o en la pestaña Actions. Con un token de proyecto, `railway_api.resolve()` saca el entorno del propio token (`projectToken`) y para si no se llama como el pedido, así que un token de prod nunca despliega en staging. `scripts/release/release.py` da la versión, si el tag existe y las notas.
  **Si el despliegue nuevo no pasa el healthcheck, sigue el anterior:** Railway solo pasa el tráfico al nuevo cuando `/healthz` da un 2xx, y si no lo da en el plazo (300 s por defecto) lo marca como fallido (docs.railway.com/reference/healthchecks: «Railway will wait for this endpoint to serve a 2xx status code before switching traffic»).
  **Volver atrás a mano**, si lo desplegado arranca pero está mal:
  1. Railway → proyecto `sea-battle` → entorno → servicio `sea-battle` → *Deployments* → el despliegue bueno anterior → en su menú, *Rollback*. Usa el código de ese despliegue; solo aparece si sigue dentro de la retención del plan.
  2. Si ya no aparece: `RAILWAY_TOKEN=… python3 scripts/railway/deploy.py --env production --sha <commit bueno> --url https://seabattle.jonattan.dev`, con el token del entorno (o con `railway login` y sin `RAILWAY_TOKEN`).
  3. En los dos casos, después: `python3 scripts/railway/check_deploy.py --env production` con exit 0, y un `revert` en `main` para que el siguiente push no vuelva a desplegar lo malo.
- **`NODE_ENV` en Railway:** `server/railway-env.ts` fija `NODE_ENV=production` en el código, como primer import de `index.ts`, antes de que Next.js y React lo lean (`server/__tests__/railway-env.test.ts`).
- **Limitación conocida (P3):** entre validar una compra y aplicarla pasa la escritura (~20 ms). Si en ese rato el jugador pierde oro (muerte), el precio se descuenta con suelo 0 (`applyPurchase` en `src/game/world.ts`, con su test).
- El cliente de estos estados es el de D50 (`ConnectionOverlay`, `syncUnsaved`; ver arriba). `e2e/persistence-db.spec.ts` lo prueba de punta a punta con la BD real detrás de un proxy TCP (`server/__tests__/fixtures/pg-proxy.ts`: `cut` = parada, `hang` = colgada), que también usan los tests de Jest.
- Tests: Postgres real. El `globalSetup` de Jest usa `TEST_DATABASE_URL` (la CI la da con un service container `postgres:16`) o levanta un clúster temporal con `initdb` en un puerto libre, que un vigía para y borra aunque Jest muera. Cada archivo usa su propio schema (`search_path`). Los tests de `kill -9` y de `SIGTERM` lanzan el servidor en un proceso hijo (`server/__tests__/fixtures/game-process.ts`), con el mismo arranque y el mismo apagado que `index.ts`; el proxy de la BD puede retrasar lo que le llega (`delay`) para ver que se escribe antes de desconectar.

## 3. Harnesses

| Comando | Qué cubre |
|---|---|
| `npm test` | Simulación por AC (navegación, combate, NPC, economía, arquitectura), protocolo y servidor con sockets reales y reloj inyectable (`autoStart: false` + `tick()`). La persistencia, contra Postgres real (§2.1): sin `TEST_DATABASE_URL` ni Postgres instalado, esos tests fallan con instrucciones, no se saltan |
| `npm run build` | `next build` + `tsc -p tsconfig.server.json` → `dist/server/index.js` |
| `npm run test:e2e` | Playwright contra el build de producción, con 3 servidores: invitado (3100), invitado sin NPC (3101) y sin invitado (3102) |
| `npm run test:perf` | Commits de React (hook de DevTools inyectado), frames de WebSocket y `renderInfo` |
| `npm run test:soak` | AC-91: corrida larga de 10 min (`e2e/endurance.spec.ts`, escenario `endurance` en un servidor propio) con una muestra por minuto tras forzar el GC por CDP: heap, nodos DOM, escuchas JS, geometrías y texturas, y commits/s. Fuera de `verify` y de `test:e2e`; la ejecuta game-qa. `AC91_MINUTES=2` la acorta para validar el harness (10 muestras igualmente) |
| `npm run test:stress` | AC-142, fase A del estrés del servidor (`e2e/stress/`). Usa el build de producción en un servidor propio (rango de `PW_PORT_BASE`) con Postgres temporal y 20 bots por Socket.IO en tiempo real, con usuario de prueba (`testUser`, que guarda progreso). Sin navegador. Los bots (`bot.ts`) solo usan el protocolo. Hay 10 de PvP (atacan al jugador atacable más cercano) y 10 de PvE (al NPC vivo más cercano), e intercambian el rol a mitad. Mandan un `moveTo` cada 1 ± 0,5 s (contra un jugador, a un punto fuera de la zona segura: desde dentro no se puede atacar), reparan entre el 40 y el 80 % (el de PvP, nunca peleando contra un jugador), zarpan al acabar la cuenta atrás y con ≥ 300 de oro compran en el puerto lo más barato. Además hacen una parada medida por minuto, y a mitad entra el cliente 21. Cada orden medida (attack, repair, respawn, buy y el moveTo de la parada) va sola en vuelo y se cierra con el primer frame que la refleja, con un aviso (rechazada) o, pasado 1 s, como perdida. Un attack sin reflejo cuenta como anulado, con su motivo y aparte de la respuesta, solo si el primer frame tras el envío ya muestra una condición con la que una regla lo termina sin aviso: objetivo hundido o fuera del mundo, atacante hundido, objetivo jugador en la zona segura o protegido, atacante en la zona segura frente a un jugador, o más de 200 m (AC-142, O-26). Un `moveTo` o un `repair` también queda anulado si el barco propio se hunde antes de reflejarlo (caso b2, O-27); un `respawn` o un `buy`, nunca. Una cubeta local igual a la del servidor marca lo que la excedería. Las cotas del proceso salen de las líneas `📈 Métricas` del propio servidor (`server/metrics.ts`), las mismas que AC-143 lee del log de Railway, y la medida empieza en una de ellas, así que cada minuto medido es una ventana del servidor. Antes va el control de ruido: un solo bot quieto en el puerto durante una ventana entera, porque sin jugadores el servidor no registra métricas. El ruido de la máquina (carga > 6 al empezar o > 10 en un minuto, o control con p99 > 5 ms) da NO VERIFICADO; una cota roja, RECHAZADO; y todo en verde con la carga mínima incompleta, NO VERIFICADO (`thresholds.ts`). Al final, los bots vuelven al puerto y 5 s después de desconectarse se compara cada fila de la BD con su último frame. Deja `stress.json`, `resumen.md`, `orders.jsonl`, `server.log` y `run.log` (con una línea por minuto de cada métrica, la carga, el SHA y `node -v`) en `qa-artifacts/stress/<fecha>/`. Sale con 0 (APROBADO), 1 (RECHAZADO) o 2 (NO VERIFICADO). Para el humo: `STRESS_BOTS`, `STRESS_MINUTES`, `STRESS_WINDOW_S`, `STRESS_WARMUP_S` y `STRESS_NOISE=report`; con valores que no son los del AC nunca sale APROBADO. Fuera de `verify`; la corre game-qa (~14 min) |
| `npm run qa:capture` | Capturas estándar en `qa-artifacts/` (escritorio 1440×900 y móvil 390×844). Incluye AD-27 (`e2e/ocean-foam.spec.ts`, servidor propio sin NPC): la espuma se mide en las 12 vistas fijas de D42 con el pase de solo océano (`runtime.captureOceanPass`) y se asertan la mediana y las guardas, periodicidad (R23) incluida, y que el shader compile. Cada vista (PNG + JSON con la proyección y los uniforms) queda en `qa-artifacts/render/ad27/` |
| `npm run icons` | AC-141 (D54): genera el favicon y los iconos de la app (`src/app/favicon.ico`, `icon1–4.png`, `apple-icon.png` y `public/icons/`) desde `scripts/icons/*.svg` y el mapa de 16 px, en el Chromium de Playwright. Los resultados se versionan; solo hace falta si cambia el diseño. `e2e/app-icon.spec.ts` (AD-36) los compara con las referencias de ux en `e2e/fixtures/d54/` |
| `scripts/ad27/*.py` | Modelo del shader del océano en numpy (`oceanmodel.py`) que sintetiza cada captura de AD-27 solo con su JSON. `validate_full.py` lo compara con las capturas reales; `predict_full.py` y `sets12.py` predicen las cifras sobre vistas al azar. Necesita Python 3 con numpy y Pillow; no forma parte de `verify` |
| `scripts/railway/*.py` | Configuración de despliegue en Railway, en solo lectura (§2.1, DT-13; paso de variables de AC-139). `check_deploy.py --env staging\|production` compara los 5 valores del servicio y los nombres de `DATABASE_URL` y de las redirecciones de Clerk (DT-11, punto 5; nunca sus valores), y sale con 1 si algo no coincide. Mide además el último relevo y, con la hora propia de los logs del apagado, sus tramos: señal de la plataforma → 🛑, 🛑 → 💾 y 🛑 → 🔌. `query.py` hace consultas GraphQL sueltas (eventos, logs, manifest). `deploy.py` despliega un commit y espera a que quede activo (DT-16, la única escritura: `serviceInstanceDeployV2`). Usan `RAILWAY_TOKEN` (de proyecto), `RAILWAY_API_TOKEN` o el token de `railway login` (`railway_api.py`), que no imprimen; `gql()` rechaza mutaciones y la salida acorta los UUID. Python 3 sin dependencias; contra Railway solo desde la CI (DT-16) o a mano, porque necesitan credenciales |
| `npm run test:scripts` | Unitarios de Python, sin red, de `scripts/railway/` y `scripts/release/` (`test_*.py`, `unittest`): el arranque de `check_deploy` (H-27), los ids con un token de proyecto, la clasificación de estados de `deploy.py`, `/healthz`, el SHA, el tag y la sección del CHANGELOG |
| `npm run verify` | typecheck + test + test:scripts + build (lo mismo que el job `verify` de la CI) |
| `npm run test:remote` | Contra un despliegue real: `BASE_URL=https://… npm run test:remote` (`playwright.remote.config.ts`, specs en `e2e/remote/`). Sin servidores locales ni `AUTH_BYPASS`, y fuera de `verify` y de `test:e2e`. El global setup comprueba `/healthz` (registra el `commit`), entra con un usuario de prueba de Clerk (`@clerk/testing`) y guarda la sesión en `.auth/`. Specs: `session` (entra con identidad de Clerk), `smoke` (AC-135 / AC-139 a: recargar, volver tras ≥ 15 s y, fuera de prod, tras un redeploy; compara los 4 campos de AC-97) y `latency` (AC-136: 30 clics con el método de AC-14 más el RTT de `/healthz`). Cada corrida queda en `qa-artifacts/remote/`. Sin `BASE_URL`, sin respuesta, sin login o sin `window.__SEA_BATTLE__`, la corrida es **REMOTE NO VERIFICADO**, no un rojo del juego. Si el login falla, el motivo es la primera línea no vacía del error o, si el mensaje está vacío, su nombre con el código y el mensaje de su `errors[0]` de Clerk si los trae (O-13): sin red, `@clerk/backend` lanza un `ClerkAPIResponseError` con el mensaje vacío, y el motivo es «ClerkAPIResponseError (unexpected_error: fetch failed)». La guarda de prod falla cerrada (DT-08): sin `REMOTE_ALLOW_PROD=1` solo arranca contra localhost y los hosts de `REMOTE_STAGING_HOSTS`; cualquier otro host cuenta como prod, y cada corrida en prod la autoriza Jonattan. Trace siempre apagado |

Puente de depuración de solo lectura: `window.__SEA_BATTLE__` (`ready`, `serverTime`, `me`, `ships` con coordenadas de pantalla, `player`, `hud`, `renderInfo` y `runtime`).

**Cuidado con la CPU**: Playwright usa el Chrome del sistema con Metal (`--use-angle=metal`). Con SwiftShader, el WebGL por software satura unos 6 núcleos. Cierra siempre el navegador al terminar.

## 4. Variables de entorno

| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY` | Clerk (la CI usa una clave ficticia con formato válido, solo para compilar) |
| `AUTH_BYPASS=1` | Modo invitado, solo local o e2e. Prohibido con `RAILWAY_*` presentes |
| `SEA_BATTLE_NPCS=0` | Servidor de prueba sin NPC (AC-83, AC-87) |
| `SEA_BATTLE_METRICS=0`, `SEA_BATTLE_METRICS_MS` | AC-142 / AC-143 (`server/metrics.ts`). El proceso registra cada minuto con jugadores una línea `📈 Métricas <hora>` con: ticks ejecutados y perdidos, p99 de `step`, retraso del event loop (p99 y máximo, descontada la resolución de 10 ms del monitor), utilización del event loop, CPU, heap mínimo, RSS (mínimo y último), `heap_total_mb` (lo comprometido por V8) y `external_min_mb` (el mínimo de `process.memoryUsage().external` en cada muestra de 1 s, que incluye todos los Buffer: donde AC-142 pone la cota de memoria; el RSS entero salta +14 MB cuando V8 duplica su generación joven a los ~10 min y `rss − heapTotal` baja con una fuga externa, porque heapTotal es memoria comprometida). Sin jugadores no registra nada. Activas por defecto, también en prod (AC-142: su coste en el p99 del tick no pasa de 0,2 ms, con el menor de 3 p99, `server/__tests__/metrics.test.ts`); `SEA_BATTLE_METRICS=0` las apaga. La línea solo lleva números, nunca ids de usuario. `SEA_BATTLE_METRICS_MS` cambia la ventana (≥ 1000; solo para el humo del arnés) |
| `PORT` | Puerto HTTP y de Socket.IO |
| `PUBLIC_ORIGINS` | AC-134 (d): orígenes públicos separados por comas (en prod, `https://seabattle.jonattan.dev`), los únicos que reciben permiso de CORS en Socket.IO y cuyos JWT de Clerk se aceptan (`azp` contra `authorizedParties`; `server/origins.ts`). Sin la variable, `http://localhost:${PORT}` y `https://${RAILWAY_PUBLIC_DOMAIN}`, que Railway pone solo. Se normalizan como el `Origin` del navegador (minúsculas, sin barra final ni puerto por defecto), y un valor que no es un origen detiene el arranque. Con la variable, toda petición a un host que no está en la lista va con 301 al primer origen, con la misma ruta y query (AC-139, paso 3: el dominio de Railway de prod); `/healthz` nunca se redirige, porque Railway comprueba la salud con el host `healthcheck.railway.app` (`server/request-handler.ts`). Sin la variable no hay redirección. Para entrar con Clerk desde otra máquina de la red (p. ej., el móvil contra `npm run dev`), hay que listar los dos orígenes: `PUBLIC_ORIGINS=http://localhost:3000,http://192.168.1.10:3000` |
| `DATABASE_URL` | Postgres del progreso (§2.1). Obligatoria en Railway (prod y staging, cada uno con su BD); fuera de Railway es opcional |
| `TEST_DATABASE_URL`, `PG_BIN` | `npm test`: Postgres de los tests (la CI usa su service container). Sin ella, el clúster temporal busca `initdb` en `PG_BIN`, `pg_config` o Homebrew |
| `RAILWAY_GIT_COMMIT_SHA` | Lo pone Railway en los despliegues desde Git; `/healthz` lo devuelve como `commit` (`null` si falta) |
| `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS`, `RAILWAY_DEPLOYMENT_DRAINING_SECONDS` | Variables del servicio en Railway que lee la plataforma, no el código: `0` y `15` en cada entorno (§2.1, «Despliegue») |
| `RAILWAY_TOKEN` | `scripts/railway/`, DT-16: token de proyecto de Railway, atado a un entorno (cabecera `Project-Access-Token`). En GitHub es un secreto de los entornos `staging` y `production`; nunca se imprime |
| `RAILWAY_API_TOKEN` | Opcional, `scripts/railway/`: token de cuenta de la API de Railway. Sin ella ni `RAILWAY_TOKEN`, usa el de `railway login` |
| `BASE_URL` | `test:remote`: despliegue que se prueba |
| `E2E_CLERK_EXTERNAL_ID` + `CLERK_SECRET_KEY` | `test:remote`, inicio de sesión A (preferido): busca al usuario de prueba por su `externalId` (en dev, `sea-battle-qa`) y entra con un token de inicio de sesión del Backend API (estrategia ticket) y el Testing Token de la instancia del despliegue; sin contraseña, así que vale con cualquier identificador que active la instancia, pero el usuario necesita uno (email, teléfono o username): sin ninguno, Clerk rechaza el ticket |
| `E2E_REMOTE_USERNAME` + `E2E_CLERK_PASSWORD` | `test:remote`, inicio de sesión C (sin clave secreta): nombre de usuario y contraseña del usuario de prueba (con Q13 las cuentas no tienen correo; O-13). No es `E2E_CLERK_USERNAME`, la del e2e del login. Solo si la instancia tiene activado el inicio de sesión con contraseña |
| `E2E_CLERK_USERNAME` | `e2e/auth-pages.spec.ts` (AD-35 d): usuario dedicado con contraseña en la instancia de desarrollo (`sea-battle-login-e2e`, nunca el del arnés remoto) para el paso de la contraseña y el error de contraseña incorrecta, en un solo tamaño (Clerk bloquea la cuenta tras 100 fallos; `user_locked` sale NO VERIFICADO). Sin ella, NO VERIFICADO |
| `CLERK_SECRET_KEY` (en `e2e/auth-pages.spec.ts`) | Del entorno o de `.env.local`. Pide un Testing Token de `@clerk/testing` para que Turnstile deje enviar el registro con un usuario de 3 caracteres y otro solo numérico (D58). Solo `sk_test_` (el spec aborta con otra clave), solo usuarios que la instancia rechaza según `/v1/environment`, y el spec falla si un registro se completa o trae `created_user_id`. El archivo corre sin traza para que el token de las URL no quede en `test-results/`. Sin ella, NO VERIFICADO |
| `REMOTE_CONNECTION` | `test:remote`, AC-136: etiqueta de la conexión medida (p. ej., `jonattan-casa`) |
| `REMOTE_REDEPLOY_CMD` | `test:remote`, AC-135 (3): comando que redespliega staging; sin él, el spec espera hasta 15 min a que alguien lo haga y lo detecta por el `uptime` de `/healthz` |
| `REMOTE_STAGING_HOSTS`, `REMOTE_ALLOW_PROD=1` | `test:remote`: hosts de staging separados por comas (con localhost, los únicos que no cuentan como prod) y permiso explícito para correr contra cualquier otro |

Las variables de `test:remote` van en `.env.remote.local` (lo ignora `.env*` en `.gitignore`) o en el entorno, que manda sobre el archivo. Nunca se commitean ni se imprimen. La clave publicable y el Frontend API de Clerk se leen del propio despliegue, así no se mezcla otra instancia.

## 5. Pendiente y decisiones abiertas

- Persistencia por `userId` (AC-97 y AC-129 a AC-133): Postgres en Railway (GDD Q2, §2.1). Falta validarla en staging tras un redeploy (AC-135).
- El ping del HUD (solo si es > 200 ms) necesita medir la latencia sin enviar mensajes en reposo (AC-86); está pendiente de diseño.
- Capitán pirata y Cañonera (I2): fuera de la 1.0.0. La release lleva el modelo del Capitán (`264363e`) y el contador `world.killsSinceBoss`, pero ningún NPC de I2 entra en partida (AC-137). Lo vigila `server/__tests__/latent-i2.test.ts` dentro de `verify`: 10 min simulados con ≥ 10 piratas hundidos en combate y, contra listas de lo anterior a I2, las clases, los tipos y los eventos del mundo y de los frames, los avisos y la población de AC-51.
- Munición especial y sonido: P2.
