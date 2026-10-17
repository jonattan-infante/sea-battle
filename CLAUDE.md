# Sea Battle — guía del proyecto

Juego naval multijugador de navegador. **Referente visual y de mecánicas: [Seafight](http://seafight.com/)** (Bigpoint).
Objetivo: una versión visualmente agradable, funcional y optimizada, a la altura del referente.

## Equipo de agentes (`.claude/agents/`)

| Agente | Rol | Escribe | Nunca hace |
|---|---|---|---|
| `game-product` | Definiciones del juego y la experiencia | `docs/game/REFERENCE-SEAFIGHT.md`, `GDD.md`, `BACKLOG.md` | Escribir código, definir el arte |
| `game-ux` | Dirección de arte, barcos, NPC, VFX, HUD, formato de assets | `docs/game/ART-DIRECTION.md`, `ASSET-SPEC.md`, `VFX-SPEC.md` | Implementar lógica de juego |
| `game-developer` | Implementación, tests y deploy | `src/`, `server/`, `e2e/`, `docs/game/TECH-ARCHITECTURE.md` | Aprobar su propio trabajo |
| `game-qa` | Evaluación del juego (funcional, visual, rendimiento) | `docs/game/qa/QA-REPORT-*.md` | Arreglar código |

### Ciclo (maker → checker)

```
game-product (GDD + criterios AC-xx) ──► game-ux (arte + specs) ──► game-developer (implementa + verify)
        ▲                                                                      │
        └──────────── game-qa (reporte con evidencia, veredicto por AC) ◄──────┘
```

- Un ítem del backlog está **hecho** solo cuando `game-qa` lo marca APROBADO con evidencia y `game-product` lo acepta.
- **Qué entra y qué sale lo deciden `game-product` (alcance y mecánicas) y `game-ux` (arte)**, sin esperar la aprobación de Jonattan (delegación de Jonattan del 2026-10-17). Lo único que sigue siendo suyo es el deploy a prod (ver «Deploys a producción»).
- Cada hallazgo de QA vuelve al backlog con severidad (P0–P3) y criterio de aceptación.

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
