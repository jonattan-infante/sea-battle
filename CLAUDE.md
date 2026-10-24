# Sea Battle — guía del proyecto

Juego naval multijugador de navegador. **Referente visual y de mecánicas: [Seafight](http://seafight.com/)** (Bigpoint).
Objetivo: una versión visualmente agradable, funcional y optimizada, a la altura del referente.

## Equipo de agentes (`.claude/agents/`)

| Agente | Rol | Escribe | Nunca hace |
|---|---|---|---|
| `game-product` | Definiciones del juego y la experiencia | `docs/game/REFERENCE-SEAFIGHT.md`, `GDD.md`, `BACKLOG.md` | Escribir código, definir el arte |
| `game-ux` | Dirección de arte, barcos, NPC, VFX, HUD, formato de assets | `docs/game/ART-DIRECTION.md`, `ASSET-SPEC.md`, `VFX-SPEC.md` y las imágenes de cada diseño en `docs/game/art/` | Implementar lógica de juego |
| `game-developer` | Implementación, tests y deploy | `src/`, `server/`, `e2e/`, `docs/game/TECH-ARCHITECTURE.md` | Aprobar su propio trabajo |
| `game-qa` | Evaluación del juego (funcional, visual, rendimiento) | `docs/game/qa/QA-REPORT-*.md` | Arreglar código |

### Ciclo (maker → checker)

```
game-product (GDD + criterios AC-xx) ──► game-ux (imágenes + specs) ──► game-developer (implementa + verify)
        ▲                                                                      │
        └──────────── game-qa (reporte con evidencia, veredicto por AC) ◄──────┘
```

- **Todo diseño pasa por el «Flujo de láminas»** (abajo): sale con su imagen y Jonattan lo aprueba antes de construirlo.
- Un ítem del backlog está **hecho** solo cuando `game-qa` lo marca APROBADO con evidencia y `game-product` lo acepta.
- **Qué entra y qué sale lo deciden `game-product` (alcance y mecánicas) y `game-ux` (arte)**, sin esperar la aprobación de Jonattan (delegación de Jonattan del 2026-10-17). Siguen siendo suyos el deploy a prod (ver «Deploys a producción») y, desde el 2026-10-18, el visto bueno a cada lámina de diseño (ver «Flujo de láminas»).
- Cada hallazgo de QA vuelve al backlog con severidad (P0–P3) y criterio de aceptación.

## Flujo de láminas (diseño → aprobación → construcción)

Todo lo que se ve en el juego (barcos, NPC, islas, puerto, HUD, pantallas y VFX) sigue este flujo. Lo fijó Jonattan el 2026-10-20, a partir de las reglas del 2026-10-18 («A partir de ahora siempre debe aprobar los diseños»).

1. **Pedido.** Jonattan pide o comenta algo. `game-product` fija el alcance y el criterio, y `game-ux` diseña. La frase literal de Jonattan acompaña a la lámina.
2. **Lámina.** `game-ux` entrega una PNG en `docs/game/art/`, citada desde su spec. Un diseño sin imagen no está listo para desarrollo. La lámina enseña:
   - el diseño como en el juego, a tamaño real, en escritorio y en móvil;
   - las vistas que hagan falta (de cerca, de lado, desde arriba) y en grises;
   - el antes y el después frente a lo de hoy;
   - lo que cuesta (triángulos, KB, rendimiento) y lo que tiene en contra.

   Las cifras salen de un script, y las frases se cotejan antes de mandarla: glifos, fila o columna, «N veces». Los renders pesados piden turno de máquina al lead.
3. **Entrega al lead:** la ruta, el sha256 y el texto de la página, en cuatro partes: qué es, júzgalo por, en contra y lo que te pido. Si producto puso condiciones, van medidas antes de enseñarla.
4. **Publicación.** El lead mira la lámina entera y la publica en la página «Diseños de Sea Battle» (https://claude.ai/artifact/Bq7w2iRU2AxB19NwwHqiuh), con la cita de Jonattan. Si sustituye una lámina ya publicada, la sube con otro nombre de archivo, para que el navegador no enseñe la vieja.
5. **Decisión de Jonattan,** en la página: «Aprobar» o «Pedir cambios» con un comentario.
   - La decisión se guarda con la huella sha256 de la lámina. Si la lámina cambia, la pieza vuelve como «Lámina nueva» y se pide otra vez.
   - Ni `game-product`, ni `game-ux`, ni el lead aprueban en su lugar.
6. **Cambios.** `game-ux` hace otra vuelta que responde al comentario, y vuelve al paso 3.
7. **Errores después de publicar.** Si una cifra o una frase está mal, el lead corrige el texto de la página en el acto y `game-ux` rehace la lámina, que vuelve a pedir aprobación.
8. **Construcción,** solo con la lámina aprobada:
   - `game-product` la anota en el registro de AC-192 y ordena su construcción;
   - el lead commitea la PNG, sus fuentes y las filas de la spec;
   - `game-developer` construye contra la lámina y sus números;
   - `game-qa` compara su captura con ella.

## Harnesses (comandos)

| Comando | Qué verifica |
|---|---|
| `npm run typecheck` | TypeScript estricto (cliente, servidor y tests) |
| `npm test` | Jest: simulación, protocolo y servidor de juego con socket.io real |
| `npm run test:e2e` | Playwright: jugabilidad y multijugador con 2 contextos (modo invitado) |
| `npm run test:perf` | Playwright: presupuesto de rendimiento (commits de React, mensajes de red, draw calls) |
| `npm run test:soak` | Playwright: corrida de 10 min (AC-91) sin fugas de memoria, DOM, escuchas, geometrías ni commits (`AC91_MINUTES=2` para el modo corto; la ejecuta QA) |
| `npm run qa:capture` | Capturas de escritorio y móvil en `qa-artifacts/` para revisión visual |
| `npm run verify` | typecheck + test + build (puerta antes de cualquier commit de feature) |
| `npm run dev:guest` | Servidor local con `AUTH_BYPASS=1` (sin Clerk; solo fuera de Railway) |

## Reglas de arquitectura (no negociables)

1. **Servidor autoritativo.** El servidor simula el mundo (movimiento, IA, combate, economía). El cliente solo envía *intenciones* validadas (`src/game/protocol.ts`).
2. **Simulación en TypeScript puro** (`src/game/`), sin React ni three.js: testeable con Jest y compartida por cliente y servidor.
3. **Nada de `setState` por frame.** `useFrame` muta refs; el HUD lee un store que cambia a ≤ 10 Hz y solo cuando cambian los datos ([R3F pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls)).
4. **Cero tráfico en reposo**: el cliente no envía nada si el jugador no actúa.
5. Los assets siguen `docs/game/ASSET-SPEC.md` (ejes, escala, pivote, presupuesto de polígonos) para poder cambiar modelos procedurales por GLB sin tocar código.

## Deploys a producción

**Solo Jonattan aprueba un deploy a prod**, con el botón «Review deployments» del environment `production` en GitHub. Ningún agente, incluido el *lead*:
- aprueba, rechaza ni cancela un deploy pendiente (`pending_deployments`);
- cambia los revisores, las ramas permitidas o el salto de administradores del environment `production`, ni el ruleset de `main`;
- despliega en prod por fuera de GitHub (CLI o GraphQL de Railway, `scripts/railway/deploy.py --env production`) sin una orden explícita de Jonattan para ese deploy.

El environment no deja que los administradores se salten la revisión (`can_admins_bypass: false`), y `.claude/settings.json` deniega esas llamadas. Son una red de seguridad, no la garantía: la garantía es esta regla.

## Cuenta de GitHub

Proyecto **personal**: solo la cuenta `jonattan-infante`, **nunca** la de Habi (`jonattanvargas-habi`), ni para leer.
- La cuenta activa global de `gh` en esta máquina es la de Habi, y no se cambia (otras sesiones la usan). Por eso cada comando `gh` lleva su token: `GH_TOKEN=$(gh auth token --user jonattan-infante) gh …`. Antes de la primera escritura de la sesión (PR, merge, comentario), `gh api user --jq .login` debe dar `jonattan-infante`.
- Git va por el alias SSH `github-personal` (`git@github-personal:jonattan-infante/sea-battle.git`), nunca por `git@github.com:`.

## Evidencia
Toda afirmación lleva su evidencia (comando + salida, ruta:línea, captura). Las hipótesis se declaran como tales. Al terminar una prueba en navegador, **cerrar la pestaña de Playwright** (WebGL por software consume ~6 núcleos).
