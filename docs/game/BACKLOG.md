# Sea Battle — Backlog del vertical slice

> Autor: `game-product` · 2026-10-10 · Fuente de reglas y números: [`GDD.md`](./GDD.md) (§ = sección del GDD)

## Convenciones

| Prioridad | Significado |
|---|---|
| **P0** | Sin esto no hay un slice jugable: el bucle navegar → combatir → oro → mejorar |
| **P1** | Lo que hace el slice *excelente*: PvP, persistencia, botín, minimapa, pulido |
| **P2** | Mejora con valor claro, después del slice |
| **P3** | Futuro, sin compromiso |

- **Formato de los AC**: `AC-NN — Dado <estado>, cuando <acción>, entonces <resultado observable>. Verificación: <método>`.
- **Métodos**: `unitario` (Jest sobre la simulación pura) · `Jest+socket` (servidor con socket.io real) · `e2e` (Playwright, 2 contextos y modo invitado) · `perf` (`npm run test:perf`) · `captura` (`npm run qa:capture`, escritorio 1440×900 y móvil 390×844) · `manual` (QA en hardware real, con traza adjunta).
- **Definición de hecho**: `npm run verify` en verde, `game-qa` marca cada AC de la historia como APROBADO con evidencia y Jonattan lo acepta.
- **Regla de verificación** (desde QA-REPORT-2026-10-11, H-09): si un AC se verifica con `e2e` o `perf`, su test tiene que **asertar el observable** del AC (frames enviados, cajas del DOM, contadores). No basta con que la acción no falle, ni con llamar a una API interna (p. ej. `respawn()`) en lugar de hacer la interacción real.
- **Legibilidad visual**: los AC de E7 fijan *qué* se comunica. Los umbrales visuales (px, contraste, formas) los detalla `game-ux` en `ART-DIRECTION.md` y `VFX-SPEC.md`.

## Orden de ataque (Pareto)

| Hito | Épicas | Resultado jugable |
|---|---|---|
| H1 — Navegar y verse | E0, E1, E12, E9 (AC de red) | 2 jugadores navegan con clic en el mismo mar |
| H2 — Combate PvE | E2, E3, E4 (P0), E5 | Hundir piratas y mercantes, ganar oro, morir y reaparecer |
| H3 — Progresión y lectura | E6, E7, E8 | Mejorar en el puerto; HUD legible en escritorio y móvil |
| H4 — Excelencia | P1 de todas las épicas | PvP, persistencia, restos, minimapa, onboarding |

### Incremento I2: orden por impacto frente a Seafight (QA-3 §8, media 7,4)
Hay dos colas en paralelo; dentro de cada una, el orden es estricto para cada desarrollador. En la de lógica, desde Q11, `dev-npc` (2 → 4) y dev-tests (3) avanzan a la vez.

**Cola de lógica: lead, `dev-npc` y dev-tests (lógica, red y HUD)**
| # | Qué | Por qué en este puesto |
|---|---|---|
| 1 | AC-108, bloque 1 (dev-tests) | Blindar el bucle con tests **antes** de tocar combate e IA (lección de H-01) |
| 2 | H-305 Capitán pirata (IA, avisos y marcador: AC-54, AC-55, AC-111 y AC-112). **Lo hace `dev-npc`** | NPC 7/10: reto de grupo y de final de progresión. La lógica no necesita el arte: AC-54, AC-55 y AC-112 son unitarios. Al terminar se vuelve a medir AC-60 |
| 3 | E13 Vista libre + AC-124 (atacante fuera de pantalla; AC-116 a AC-124). **Lo hace dev-tests, después de AD-27 y DT-06** | Cámara 8/10. Los dos indicadores de borde comparten componente. Hay que volver a pasar AC-110: la pista también esquiva el Centrar y los chips |
| 4 | H-306 Cañonera pirata (IA: AC-113 y AC-114, más la población de I2 de AC-51). **Lo hace `dev-npc`, después del Capitán** | Segundo hostil, con un comportamiento distinto. Al terminar se vuelve a medir AC-60 con la población de I2 |
| 5 | AC-108: bloque 2, AC-12, AC-92 y **el harness de AC-91** (dev-tests); AC-110, AC-75, H-13, H-15 y O-3 (lead / dev-tests) | Calidad y pulido. AC-23 y AC-25 van en la cola de dev-render. **Aprobado en QA-6** (AC-108 y AC-91 en A; H-13, H-15, O-1 y O-3 cerrados). H-16 a H-18 se cierran en QA-7; DT-04 y DT-05, en el addendum de QA-6. Quedan H-19, H-20 y O-4 (implementados, para QA-8) y H-21 (nuevo en QA-7) |

**I2 aprobado (GDD Q11: «Sí», Jonattan, 2026-10-11).** Los puestos 2–4 arrancan con dos desarrolladores en paralelo: `dev-npc` hace el Capitán y después la Cañonera (2 → 4), y dev-tests hace la vista libre (3) cuando termine AD-27 y DT-06. dev-render ya tiene O-7 / O-8 en código (D40, `55b45c1`, para QA-8) y pasa al arte de los NPC de I2 (su puesto 4). **Dos puntos donde se cruzan, que hay que acordar antes de tocarlos:**
- **Área de interés del servidor:** el Capitán vivo se envía siempre (GDD §13) y la vista libre añade un área alrededor del centro de la vista. Es el mismo código, y AC-88 y AC-123 miden los dos presupuestos.
- **Minimapa:** el marcador del Capitán (AC-111) y el clic o arrastre que mueve la vista (AC-117), sobre el `Minimap.tsx` que acaba de cambiar O-4.

**Cola dev-render (render y VFX)**
| # | Qué | Por qué en este puesto |
|---|---|---|
| 1 | Cerrar Q20 / D22 → AC-104 | VFX 6/10, la nota más baja. **Aprobado** en 1440×900 (QA-5) y en 390×844 (QA-6 §8) |
| 2 | Encuadre U8 (R = max(alcance propio, 65 m)) + AC-24 revisado + tests de cámara AC-23 y AC-25 | Barcos 7/10: +51 % de área para la Balandra con un cambio de fórmula y sin coste de rendimiento. Los tests de cámara van justo después de tocar la cámara. **Aprobado** (QA-5 §3.1: AC-24 y AD-06; AC-23 y AC-25 con test que aserta el observable) |
| 3 | (c) Detalle de los cascos (AS-V18–V20, AD-26) | Barcos: "facetados". Va **antes** del arte de los NPC nuevos, para que el Capitán y la Cañonera nazcan con la misma técnica y no haya que rehacerlos. **`3327f5e`, en parte aprobado (QA-6 §9.2):** AS-V18 (0–1 escalones), AD-26 (1 965 px) y el presupuesto (1 draw call; 926–1 851 triángulos). **AS-V19 y AS-V20, aprobados con D36** (`1a3440e`, QA-6 §15.2): AS-V19 queda entre 55,6 y 70,7 % en 0° y 90° (rangos de QA en 4 corridas), con el Pirata a 90° a 0,6 puntos del umbral. **Confirmados con D37 y D38** (QA-7 §6): AS-V19 con un mínimo del 56,6 % y AS-V20 legible en 90 de 90 capturas. **Abiertos:** O-7 (la lona se lee como rayas) y O-8 (cubierta de LOD1), en el puesto 8. **El detalle en móvil queda decidido:** no se añade, porque en 390×844 los paños serían moiré (D36 b, D40), y QA-7 §6.6 deja de contar el móvil en la nota de Barcos, porque Seafight es de escritorio |
| 4 | Arte del Capitán y luego de la Cañonera (`npc_pirate_captain`, `npc_pirate_gunboat`; requisitos en GDD §9, AD-28 y AD-29), con H-708 / AC-115 | Lo necesitan los puntos 2 y 4 de la otra cola. **I2 aprobado (Q11). Va después de O-7 / O-8 (puesto 8)**, para que los dos NPC nazcan con la lona de D40 y no haya que rehacerlos, la misma lección que D23 c. **Ya puede empezar:** D40 está en código (`55b45c1`) y las recetas de game-ux están completas (`63a79a6`, `e6f186a`). Si QA-8 pide cambios en la lona, se aplican a todas las clases a la vez. Mientras tanto, la lógica de `dev-npc` puede usar un modelo provisional. Solo AC-115 espera al arte; AC-111 es aviso y marcador del minimapa, que es HUD (AD-29) |
| 5 | AD-27 Espuma natural | Océano 8/10. **Lo hace dev-tests**, porque dev-render está con los puntos 7 y 8. No se pisan: es el océano frente al HUD y los cascos |
| 6 | H-12: VFX-09b en 390×844 (código de D32) | Cerrar AC-104 en móvil. **Aprobado** (`3068eda`, QA-6 §8) |
| 7 | Código de O-4: las placas no entran en el HUD y el sector va dentro del minimapa (spec de game-ux en `8078c2a`) | HUD 9/10: lo último que le queda al HUD además de H-16 (QA-6 §13). **Implementado** con D39 + D41 (`a45251d`, `cea3ad7`), pendiente de QA-8 |
| 8 | O-7 / O-8: carácter de la lona y cubierta de LOD1, con la spec D40 (`8660390`, `af92d47`: lona de 3 tonos barajados, AS-V21 y LOD1 con la media en pantalla) | **O-7 es lo único que separa Barcos del 9** (QA-7 §6.5 y §9). O-8 es consistencia de color entre tamaños y no cuenta en la nota frente a Seafight (QA-7 §6.6), pero va en el mismo cambio. **Implementado en `55b45c1`** (fe de erratas en `e45beaa`), pendiente de QA-8 |

Los AC de rendimiento de E9 son una **puerta desde H1**: se mantienen en verde en cada hito, no se dejan para el final.

## Triaje de QA

Reportes (el último manda):
| Reporte | SHA | Veredicto | Resultado |
|---|---|---|---|
| [`QA-REPORT-2026-10-11.md`](./qa/QA-REPORT-2026-10-11.md) | `614ae0d` | RECHAZADO | P0 H-01 |
| [`QA-REPORT-2026-10-11-2.md`](./qa/QA-REPORT-2026-10-11-2.md) | `c631272` + `9b4bda3` | APROBADO CON OBSERVACIONES | 91 A · 1 R · 6 NV |
| [`QA-REPORT-2026-10-11-3.md`](./qa/QA-REPORT-2026-10-11-3.md) | `190d3cb` | **APROBADO CON OBSERVACIONES** | 98 A · 2 R (AC-97 conocido, AC-108) · 5 NV · AC-104 sin evaluar. No queda ningún P0 abierto |
| [`QA-REPORT-2026-10-11-4.md`](./qa/QA-REPORT-2026-10-11-4.md) | `3154045` + `b5dc2c1` | APROBADO CON OBSERVACIONES | 102 A · 2 R (AC-97, AC-108) · 4 NV |
| [`QA-REPORT-2026-10-11-5.md`](./qa/QA-REPORT-2026-10-11-5.md) | `474e437` | **APROBADO CON OBSERVACIONES** | 103 A · 2 R (AC-97 conocido, AC-108) · 3 NV (AC-72, AC-90, AC-91). U8 cumple; AC-104 aprobado en 1440×900 con N1 y N3. No queda ningún P0 abierto |
| [`QA-REPORT-2026-10-11-6.md`](./qa/QA-REPORT-2026-10-11-6.md) | `a422dd1` | **APROBADO CON OBSERVACIONES** | 108 A · 1 R (AC-97, conocido) · 2 NV (AC-72, AC-90). AC-108 y AC-91 aprobados (corrida de 10 min sin deriva); AC-104 también en 390×844. Seafight 8,1. No queda ningún P0 abierto. Addendum §15 sobre `1a3440e`: no cambia el recuento; aprueba D36 (AS-V19 y AS-V20), cierra DT-04 y aprueba DT-05, y abre O-7, O-8 y H-20 |
| [`QA-REPORT-2026-10-11-7.md`](./qa/QA-REPORT-2026-10-11-7.md) | `d8496e1` | **APROBADO CON OBSERVACIONES** | **109 A · 1 R (AC-97) · 2 NV (AC-72, AC-90) sobre 112 AC. AC-128 aprobado; H-16, H-17 y H-18 cerrados; AS-V19 y AS-V20 aprobados con D36–D38; DT-04 y DT-05 confirmados. Seafight 8,1. Sin P0 ni P1.** Abre H-21. Deja de contar el móvil (LOD1) en la nota de Barcos. **Extensión §11 sobre `4750267`:** no cambia el recuento. AC-91 aprobado también con la métrica ampliada (soak de 10 min) y H-19 cerrado. Abre H-22 y O-9, que es un duplicado de DT-06 |

### Hallazgos
| Hallazgo | Sev. | Qué pasa | AC | Responsable | Estado |
|---|---|---|---|---|---|
| H-01 | P0 | "Zarpar" no enviaba `respawn` | AC-63, AC-101 | lead | **Cerrado** (QA-2 y QA-3: clic, Enter y toque dan exactamente 1 `respawn`) |
| H-02 | P1 | El casco entraba en las islas | AC-20, AC-21 | — | **Cerrado** (QA-2) |
| H-03 | P1 | Velas invisibles de proa y de popa | AC-102 | game-ux → dev-render | **Cerrado** (QA-3: ratio mínimo 0,282 en la Balandra; `sail-visibility.spec.ts:18`) |
| H-04 | P2 | Decorado fuera del colisionador | AC-103 | dev-render | **Cerrado** (QA-3: 0 vértices fuera de r + 0,5 m) |
| H-05 | P2 | Humo y fuego de vida baja casi invisibles | AC-104 | game-ux (Q16, D20–D31) → dev-render | **Cerrado** en 1440×900 (QA-5: VFX-09b 15/15) y en 390×844 (QA-6 §8, con H-12) |
| H-06 / H-06b | P2 / P3 | La pista tapaba las placas propia y del objetivo en móvil | AC-105 | lead | **Cerrado** (QA-3: 0 px² en 10 posiciones; `gameplay.spec.ts:230`) |
| H-07 | P3 | Tarjeta de muerte en 3 líneas | AC-106 | lead | **Cerrado** |
| H-08 | P3 | La recarga pisaba placas vecinas | AC-107 | dev-render | **Cerrado** (QA-3: 20/20 muestras, 0 px²) |
| H-09 | P1 | Huecos del harness | AC-108 | lead / dev-render | **Cerrado en lo que listaba.** Lo que queda de cobertura está en el plan de AC-108 |
| H-10 | P2 | Carrera de relojes: el primer `respawn` al activarse Zarpar podía rechazarse (QA-2 §7) | **AC-109** (QA lo llamó AC-101b) | lead | **Cerrado** (QA-3: 20/20 con el reloj adelantado 50 ms; tolerancia de 2 ticks, `constants.ts:196`). El test completo de AC-109 (`273c376`: Jest+socket con reloj inyectable y e2e) queda aprobado en QA-6 §6. El margen del 2.º tick sigue sin test (H-18) |
| DT-01 (dev-tests) | P2 | Esc y Espacio dobles a ≤ 120 ms leen el `targetId` interpolado (150–200 ms de retraso): Esc ×2 → 2 `cancelAttack` y la selección sigue; Espacio ×2 → 2 `attack`. Origen: `GameApp.tsx` (`Escape` y `toggleAttack` leen `client.getShip(myShipId).targetId`). Con el RTT de producción la ventana crece | **AC-125** | lead (el cliente recuerda su última intención hasta que el servidor la confirma) | **Cerrado** (`887ac67`, QA-6 §3: AC-125 aprobado, 4 de 4 mutantes muertos). Los conmutadores cruzados siguen en H-17 |
| DT-02 (dev-tests) | P2 | En táctil, el botón Puerto desactivado no explica por qué: solo tiene un `title`, que no se ve, y el aviso solo sale con `P` | AC-66 (ampliado) | lead (HUD): pulsar el botón desactivado muestra el aviso existente | **Cerrado** (QA-5 §6) |
| DT-03 (dev-tests) | P3 | "Salir" con el servidor caído lleva a `net::ERR_CONNECTION_REFUSED`, porque la landing la sirve el mismo proceso | **AC-126** | lead | **Cerrado** (`d4bfa55`, QA-6 §4: AC-126 aprobado, 4 de 4 mutantes muertos). Los clics repetidos en "Salir" siguen en H-16 |
| H-11 | P3 | En móvil, los avisos tapan la pista en la ranura `is-alt`. En 844×390 además pisan ~22 px de los paneles del jugador y del objetivo (eso ya pasaba en `614ae0d`) | **AC-110** (QA lo llamó AC-105b) | lead | **Cerrado** (QA-5 §2: AC-110 en los 3 tamaños; QA-6 §7: O-1 cerrado) |
| H-12 (QA-4) | P3 | AC-104 exige 390×844, pero VFX-09b solo tenía umbrales para 1440×900 | AC-104 | game-ux (D32) → dev-render | **Cerrado** (`3068eda`, QA-6 §8: VFX-09b pasa en 390×844 con N1 y N3; la Balandra con N3 tapa el 14,9 % del casco, ≤ 20 %) |
| O-1 (QA-4) | P3 | Al aparecer un 2.º aviso, la pista lo pisa durante 0–150 ms (8 400 y 12 888 px² en móvil; 0 después) | AC-110 | lead | **Cerrado** (`aadcdd9`, QA-6 §7: 0 frames con la pista sobre un aviso de 1 489) |
| O-2 (QA-4) | P3 | En escritorio, la ranura alta de la pista rozaba 4 px el primer aviso | AC-110 | lead | **Cerrado** en `b5dc2c1` |
| H-13 (QA-5) | P3 | AC-75 (negativo) falla en la suite completa (46/47) y pasa aislado (3/3): depende del orden en el servidor compartido del showcase | AC-75 (verificación) | lead; lo ejecuta dev-tests | **Cerrado** (`0303c02`, QA-6 §7: AC-75 3/3 en la suite completa, también el negativo) |
| H-14 (QA-5) | P3 | `own-server` podía elegir el puerto 3659, que Chrome bloquea (`ERR_UNSAFE_PORT`), dentro del rango de dev-tests | — | lead | **Cerrado** en `3eccd41`: rango [PW_PORT_BASE+500, +599] y excluye los puertos inseguros de Chrome. Confirmado en QA-6 §2 |
| H-15 (QA-5) | P3 | El e2e de AC-41 no fija el umbral del 30 %: un mutante con 0,25 sobrevive, porque no hay muestras de vida entre 31,25 % y 23 % | AC-41 (verificación) | lead; lo ejecuta dev-tests | **Cerrado** (`6bd7df2`, QA-6 §7: los mutantes 0,25 y `<` → `≤` mueren con el unitario) |
| O-3 (QA-5) | P3 | 4 pulsaciones de Puerto fuera de la zona apilan 3 avisos idénticos (≈ 15 % de la altura en 390×844; `MAX_TOASTS` = 3, `hud-store.ts:73`) | **AC-127** | lead (HUD) | **Cerrado** (`71fc925`, QA-6 §5: AC-127 aprobado; el aviso caduca a 3 501 ms del 4.º toque) |
| DT-04 (dev-tests) | P3 | **Escenarios de prueba, no producción.** Un pirata "fijo" de un escenario (`ai.wait = 1e9`, `server/scenarios.ts:69, 91, 108, 119, 131`) que vuelve de un combate a su origen recibe `ai.wait = rand(PIRATE_PATROL_WAIT)` (`src/game/world.ts:943`), pierde el bloqueo y patrulla hasta 120 m (`PIRATE_PATROL_RADIUS`, `constants.ts:165`). Efectos: AC-75 rojo en la suite completa (H-13) y AC-110 rojo porque un pirata itinerante dañó el barco (756/800) | AC-75, AC-110 (verificación) | lead / dev-tests (lo investiga dev-tests) | **Cerrado** (`0634bcf` + `8ac32d4`, QA-6 §15.4): en el juego, el pirata del showcase quedó 85 s a 0,2 m de su puesto después del combate; producción no cambia. El test solo cubre el showcase, no `endurance`: eso queda en H-20. Confirmado en QA-7 §7 (AC-75 3/3 y AC-110 en verde en la suite completa). **Criterio de cierre:** en los 60 s siguientes a volver de un combate, un pirata fijo de cualquier escenario no toma ningún destino de patrulla (`destination` en `null` y `path` vacío) salvo que entre de nuevo en combate (Jest de escenarios); y los piratas de producción siguen patrullando al volver (GDD §9; AC-45 y AC-47 en verde) |
| DT-05 (verify del lead) | P3 | AC-03 sensible a la carga de la máquina: con otro Jest en paralelo, el p99 del tick dio 4,31 ms (límite 4); aislado, 0,33 ms en 3 corridas, sin cambios en `src/game` (datos del lead). El test toma un solo p99 de 2 000 ticks medidos con `performance.now()` (`src/game/__tests__/architecture.test.ts:70-96`), así que mide también la máquina | AC-03 | game-product (decidido) → lead / dev-tests (test) | **Decidido:** el umbral sigue en 4 ms y cambia la condición de medida: el menor de 3 p99 (ver AC-03). **Aprobado** (`a7c1a81`, QA-6 §15.5): 0,332 · 0,272 · 0,272 ms → menor 0,272. Los dos mutantes de simulación lenta mueren: el mínimo no esconde una lentitud que se repite en las 3 corridas. Confirmado en QA-7 §7: 0,626 · 0,480 · 0,503 → 0,480 ms. **Límite conocido** (QA-7 §11.2): con la máquina a carga 75, ni el menor de 3 salva la medida (AC-03 dio 22,0 ms y AC-22, 2,11 ms); con carga 11,8, 271/271. Regla en AC-03 y AC-22: un rojo de tiempo con carga media > ~12 no cuenta y se repite |
| H-16 (QA-6) | P3 | "Salir" sigue activo mientras sondea: 2 clics a 120 ms lanzan 20 peticiones y 3 clics, 30, porque cada clic arranca su propio sondeo. Quedan 0 pendientes y no navega; si el servidor vuelve, `router.push('/')` se repite (QA-6 §4.2 y §12) | **AC-126** (ampliado: caso e) | lead | **Cerrado** (`cfcfe69`, QA-7 §3: AC-126 e, con 10 peticiones para 3 clics y una sola navegación). Nota para que no se vuelva a reportar: el mutante H16b (sin la guarda de `Overlays.tsx:83`) vive porque `probeServerOnce` (`exit-probe.ts:46`) ya cumple el AC él solo. La guarda es una segunda defensa, y quitar las dos sí lo detecta el e2e. No es un hallazgo |
| H-17 (QA-6) | P3 | Conmutadores cruzados: con 100 ms por sentido, `R` y luego Espacio emiten `repair(true)` → `cancelAttack` y el barco acaba reparando y sin ataque. `repair(true)` no apunta en la cola de intenciones de ataque que cancela el ataque (`world.ts:387`), así que Espacio lee el objetivo del último snapshot. Al revés (Espacio y luego `R`) pasa lo mismo. Con 0 ms no ocurre (QA-6 §3.4 y §12) | **AC-128** (nuevo) | lead | **Cerrado** (`d8496e1`, QA-7 §4: AC-128 a, b y c en 6/6, 6/6 y 2/2, y los 4 mutantes muertos). La misma clase de fallo con la orden de navegación sigue en H-21 |
| H-18 (QA-6) | P3 | Ningún test fija el 2.º tick de margen de AC-109: el mutante con 1 tick (`RESPAWN_CLOCK_TOLERANCE = 1 / TICK_RATE`) sobrevive al Jest+socket (20/20) y al e2e (2/2). El Jest nunca construye el caso de un tick retrasado por el `setInterval` más 50 ms de adelanto (`constants.ts:193-196`) | AC-109 (verificación) | dev-tests | **Cerrado** (`3643b1b`, QA-7 §5): con el tick retrasado, 20/20 aceptados, y el mutante con 1 tick muere (0/20). Era el criterio de cierre |
| H-19 (QA-6) | P3 | La medida de memoria de AC-91 no ve la memoria externa: un `Float64Array` de 4 KB por frame (≈ 2,4 MB/min) sobrevive, porque `usedSize` no cuenta los ArrayBuffer (600 búferes de 4 KB suben `backingStorageSize` 2,35 MB y `usedSize` 0,09 MB). En three.js, geometrías, partículas e interpolación usan arrays tipados | AC-91 (métrica ampliada) | dev-tests (harness) | **Cerrado** (`160bc15`, QA-7 §11.4): el mutante del `Float64Array` muere con 2,48 MB/min; la memoria externa sube de 9,81 a 14,01 MB y el heap casi no cambia. AC-91 queda aprobado con la métrica ampliada (QA-7 §11.3). El veredicto según la carga quedó aparte, en H-22. **Criterio de cierre (cumplido):** el harness aserta sobre `usedSize + backingStorageSize` (AC-91) y el mutante de QA-6 (`AC-91-heap`) muere |
| O-4 (QA-6) | P3 | Una placa de barco justo debajo del minimapa queda tapada por el panel, pero el texto del sector ("Sector G4 · X 198 Z −164"), que no tiene fondo, se dibuja encima de ella y los dos se leen a medias (`explore/mcp-04-*.png`). No es una regresión | AC-107 (mismo principio: el HUD no se mezcla con las placas) | dev-render (código; cola dev-render, puesto 7); el cómo, game-ux | **Implementado, pendiente de QA-8:** D39 en `a45251d` (las placas no entran en el HUD y el sector va dentro del minimapa) y D41 en `cea3ad7` (los avisos también cuentan como bloques del HUD), sobre la spec de `8078c2a` y ART-DIRECTION D39 y D41. **Criterio de cierre:** ninguna placa visible cruza la caja del texto del sector ni la del panel del minimapa (e2e de cajas + captura). Vale con fondo de panel en el texto o con ocultar las placas bajo los paneles del HUD |
| O-5 (QA-6) | P3 | La portada no muestra los cascos de D23 c: `public/landing-hero*.webp` es de `3068eda`, anterior a `3327f5e` (QA-6 §8.3) | — (ART-DIRECTION §16.1) | dev-render | Pendiente. Se regenera con `npm run qa:hero` **cuando se cierren O-7 y O-8**, que todavía cambian velas y cubierta (AS-V19 y AS-V20 ya están aprobados con D36–D38, QA-7 §6), para no hacerlo dos veces. Después se repiten el peso (≤ 220 / 120 KB), VFX-21 y las líneas rectas de §16.1 |
| O-6 (QA-6) | P3 | Margen estrecho: el tope del Mercante con N3 en 390×844 es del 19,2 % de media (una captura da 20,4 %) frente a ≤ 20 % (QA-6 §8.2). Con D36 empeora un poco: media del 19,7 %, con una captura al 21,3 % (§15.3). D37 no lo cambia (QA-7) | AC-104 (VFX-09b) | game-qa (vigilancia) | En vigilancia, sin acción. Si se toca el fuego o el casco del Mercante, este caso se mide primero. **Ojo con D40 (4), O-8:** cambia la cubierta y la vela del Mercante en LOD1, que es lo que se dibuja en 390×844. Su código ya está en `55b45c1`, así que **QA-8 vuelve a medir este caso** |
| O-7 (QA-6 §15) | P3 | Los paños de vela se leen como rayas regulares, no como lona: el perfil de L\* es una onda de dos niveles con periodo de 7–8 px (el Pirata, L\* 4 frente a 17, se lee como un código de barras). Seafight sombrea con luz y pliegues, sin periodo. Además, las rayas eran la seña del Mercante (D9) y ahora las llevan todas las clases | AS-V19 (se cumple; falta un criterio de **carácter**, no de cantidad) | game-ux (D40) → dev-render (cola dev-render, puesto 8) | **Spec D40 hecha** (`8660390`, `af92d47`): lona de 3 tonos en orden barajado para el jugador y el pirata, y el Mercante conserva sus rayas regulares. **Implementado en `55b45c1`** (más la fe de erratas de D40 en `e45beaa`), **pendiente de QA-8**. **Qué debe comunicar:** la vela se lee como tela con luz y pliegues, y las rayas de color siguen siendo exclusivas del Mercante. **Criterio de cierre:** AS-V21 (η de Otsu por clase ≤ 0,80 y mediana de r ≤ 0,40, ASSET-SPEC) aprobado por QA, con AS-V19 ≥ 55 % todavía en verde. **Es lo único que separa Barcos del 9** (QA-7 §9) |
| O-8 (QA-6 §15) | P3 | En LOD1 (390×844 y zoom alejado), la cubierta usa la tabla clara de D36: ΔE76 al token 5,4–6,2 (+5–6 L\*), frente a 2,2–2,9 en `a422dd1`. Sale más clara y anaranjada en móvil | AD-25 (en LOD1, sin medir) | game-ux (D40) → dev-render (cola dev-render, puesto 8) | **Spec D40 hecha:** LOD1 pinta la media en pantalla de lo que quita. **Implementado en `55b45c1`, pendiente de QA-8.** Es consistencia de color entre tamaños y no cuenta en la nota frente a Seafight, que es de escritorio (QA-7 §6.6). **Criterio de cierre:** AD-25 se cumple también en LOD1 (≤ 4, medido en 390×844) y AD-33 limita el salto de LOD0 a LOD1, de modo que la cubierta no cambia de color al pasar de uno a otro |
| H-20 (QA-6 §15) | P3 | El Jest de DT-04 solo cubre el showcase: el mutante que devuelve al pirata de `endurance` a `ai.wait = 1e9` sobrevive (29/29 en verde) | DT-04 (criterio de cierre: "de cualquier escenario") | dev-tests | **Implementado en `ca02798`, pendiente de QA-8**: un caso por escenario (`server/__tests__/scenarios.test.ts:73`) y el pirata de `endurance` en su puesto (`:83`). **Criterio de cierre:** "todos los piratas del escenario llevan `holdPosition`" se comprueba en todos los escenarios con piratas (showcase y `endurance`), y el mutante DT-04c muere |
| H-21 (QA-7) | P3 | La orden de navegación cancela la reparación (GDD §8, `GDD.md:251`; `world.ts:344`), pero `moveTo()` (`game-client.ts:173`) no lo apunta en la cola de intenciones. Con 100 ms por sentido, `R` → clic en el agua → `R` emite `repair(true)`, `moveTo`, **`repair(false)`**, y el barco acaba sin reparar (6 de 6). Con 0 ms no pasa. Es la misma clase de fallo que H-17, en otro conmutador (QA-7 §8) | **AC-128** (ampliado: caso d) | lead | **Implementado en `3c8c614`, pendiente de QA-8** (`game-client.ts:174`, `GameApp.tsx:324`; `intents.test.ts:180-199`; `e2e/input-toggle.spec.ts:597-694`, caso d) |
| DT-06 (verify del lead) | P3 | AC-22 sensible a la carga de la máquina, como AC-03 antes de DT-05. En el verify previo al push (HEAD `3c8c614`, carga media de 14–18 por QA-8 y otros agentes), el p99 del cálculo de ruta dio **2,019 ms** frente a ≤ 2 ms (`navigation.test.ts:155`; ese archivo tardó 72 s). Aislado: 3/3 en 218 ms, y una sonda con el mismo protocolo da p99 de 0,151 / 0,111 / 0,109 ms, unas 13 veces por debajo del límite. Con la carga en 8–9, el verify completo dio 278/278 (datos del lead). El test toma un solo p99 de 1 000 rutas en tiempo de pared (`navigation.test.ts:143-156`) dentro de un Jest con workers en paralelo | AC-22 | game-product (decidido) → dev-tests (test, después de AD-27) | **Decidido** (texto de AC-22 en `97c1d91`): el umbral sigue en 2 ms y se mide como el menor de 3 p99, con 3 tandas de 1 000 rutas. Pendiente el cambio del test. QA-7 §11.2 lo reporta también como O-9 (2,11 ms con carga 75). **Criterio de cierre:** el test registra los 3 p99 y aserta el menor, y un mutante de ruta lenta (un coste que se repite en cada cálculo) sigue muriendo |
| H-22 (QA-7 §11) | P3 | Harness de AC-91 en `4750267`: con la carga incompleta, lanzaba NO VERIFICADO **antes** de evaluar la deriva. Un mutante con carga baja (4 ciclos frente a 8) y una fuga de 2,38 MB/min salía como NO VERIFICADO, cuando AC-91 (`b8fc8dc`) pide RECHAZADO (QA-7 §11.4) | AC-91 (veredicto según la carga) | dev-tests (harness) | **Implementado en `1282744`, pendiente de QA-8**: la deriva se evalúa antes del veredicto de carga (`e2e/endurance.spec.ts:270-293`). **Criterio de cierre:** el mutante de carga baja + fuga de QA-7 sale RECHAZADO, con la aserción de deriva en rojo |
| O-9 (QA-7 §11) | P3 | AC-22 mide un solo p99 y es sensible a la carga: 2,11 ms con la máquina a carga 75 | AC-22 | — | **Duplicado de DT-06** (texto de AC-22 en `97c1d91`). Se sigue allí |

### Plan de AC-108 (RECHAZADO en QA-3 §7: 15 AC P0 sin test y 7 parciales; **APROBADO en QA-6 §11**)
**Estado en QA-5:** queda **1 sin test (AC-91, sin harness)** y **1 parcial (AC-109)**. Lo demás tiene ya un test que aserta el observable.
**Estado en QA-6:** 0 sin test y 0 parciales. AC-109 y AC-91 asertan su observable y matan sus mutantes, salvo dos que quedan como P3 de verificación: el margen de 2 ticks (H-18) y la memoria externa (H-19).
**Reparto (lead):** `dev-tests` (agente game-developer, copia aislada con `PW_PORT_BASE=3500`, commit `618a633`) escribe los bloques 1 y 2 más AC-12 y AC-92; dev-render, AC-23 y AC-25; el lead, AC-75 y AC-110. **AC-91 pasa a dev-tests** (QA-5), porque dev-render se dedica a los cascos (D23 c).

**Criterio:**
- Ninguno pasa a "basta un Jest que ya existe": hoy no hay ningún test unitario de lógica de cliente (`hud-logic.ts`, `game-client.ts`), y todos estos AC tienen su observable en el cliente.
- Los AC de **entrada del jugador** se quedan en e2e por la lección de H-01: el fallo estaba en el cableado del cliente, no en el servidor.
- Solo cambian de método AC-92 y AC-91, cada uno con su justificación en el propio AC.

**Bloque 1: bucle principal (seleccionar → atacar → hundir → oro → mejorar → morir). Hacer primero.**
| AC | Estado en QA-3 | Qué tiene que asertar el test | Tipo | Responsable |
|---|---|---|---|---|
| AC-31 | Sin test | "Fuera de alcance" en el panel, 0 andanadas, y el disparo sin una entrada nueva al entrar en alcance | e2e | dev-tests |
| AC-37 | Sin test | Espacio con ataque activo → 1 `cancelAttack` y la selección sigue | e2e | dev-tests |
| AC-17 | Sin test | Clic en el agua mientras ataca → `moveTo`, 0 `cancelAttack`, y la selección y el ataque siguen activos | e2e | dev-tests |
| AC-27 | Sin test | Orden del ciclo de Tab (40 → 90 → 140 → 40) y 0 frames | e2e | dev-tests |
| AC-28 | Sin test | Esc 1 → `cancelAttack` y la selección sigue; Esc 2 → deselecciona; 0 frames en la 2.ª | e2e | dev-tests |
| AC-62 | Parcial | Añadir "por <nombre>" y "−N oro" exactos (10 % del oro) en la tarjeta | e2e | dev-tests |
| AC-58 | Parcial | Añadir el límite: DOM actualizado ≤ 200 ms después del evento `loot` | e2e | dev-tests |
| AC-67 | Sin test | Comprar Cañones N2 por la UI (escenario `shipyard`): oro −500 y alcance 70 / recarga 3,5. Botón desactivado con oro insuficiente, que es el patrón de `disabled` de H-01 | e2e | dev-tests |
| AC-66 | Parcial | Botón Puerto desactivado fuera de la zona, con su explicación | e2e | dev-tests |
| AC-85 | Sin test | ≤ 10 commits/s en 20 s de combate (contador `onRender`) | perf | dev-tests |

**Bloque 2: móvil y robustez**
| AC | Estado en QA-3 | Qué tiene que asertar el test | Tipo | Responsable |
|---|---|---|---|---|
| AC-29 | Sin test | En 390×844, un toque a ≤ 24 px de la silueta selecciona, sin red | e2e | dev-tests |
| AC-80 | Parcial | Añadir 844×390: tamaños de los botones y 0 solapes | e2e | dev-tests |
| AC-41 | Sin test | Clase de pulso del botón Reparar con vida < 30 % y sin ella con vida ≥ 30 %, más el unitario del umbral (H-15, `6bd7df2`) | e2e + unitario | dev-tests |
| AC-19 | Sin test | `S` → 1 `stop` y velocidad 0 (añadirlo al e2e de AC-14, que ya pulsa S sin asertarlo) | e2e | dev-tests |
| AC-65 | Parcial | Añadir que el aviso desaparece al salir de la zona | e2e | dev-tests |
| AC-99 | Sin test | Parar el servidor → overlay y 3 reintentos (1, 2 y 4 s) → reconexión sin recargar; sin servidor → "Reintentar" / "Salir" | e2e | dev-tests |
| AC-75 | Parcial | Una salpicadura por bala fallada (contadores de dev-render) y caso negativo: un tercer jugador que no es tirador ni objetivo no ve "Fallo" | e2e | lead (aprobado en QA-5; en servidor propio desde `0303c02`, H-13) |

**Bloque 3: cámara, render e infraestructura**
| AC | Estado en QA-3 | Qué tiene que asertar el test | Tipo | Responsable |
|---|---|---|---|---|
| AC-23 | Sin test | Proyección del barco propio en el 10 % central en 10 frames navegando | e2e | dev-render |
| AC-25 | Sin test | La rueda da exactamente {0,7; 1,0; 1,5} y `scrollY` sigue en 0 | e2e | dev-render |
| AC-92 | Sin test | **Cambia a unitario** (ver el AC): interpolador con frames sintéticos | unitario | dev-tests |
| AC-91 | Sin test | **Corrida larga de perf** de 10 min, fuera de `verify`, con el método escrito en el AC | perf (larga) | dev-tests (harness, hecho en `a422dd1`); game-qa la ejecuta |
| AC-12 | Parcial | Un 21.º jugador real (20 sockets de invitado + 1 navegador) → landing con "Servidor lleno" (`GameApp.tsx:209`) | e2e | dev-tests |

### AC sin veredicto final
| AC | Motivo | Responsable | Estado |
|---|---|---|---|
| AC-72 | Exige 5 evaluadores humanos | game-qa + Jonattan | Hay que organizar la prueba de 5 s |
| AC-115 (I2) | Exige 5 evaluadores humanos, como AC-72. Antes tienen que pasar las reglas medibles AD-28 y AD-29 | game-qa + Jonattan | Cuando exista el arte del Capitán y la Cañonera (cola dev-render, puesto 4). Conviene hacerla en la misma sesión que AC-72 |
| AC-90 | Manual en el portátil de referencia | game-qa | Bloqueado por GDD Q9 (Jonattan) |
| AC-128 (caso d) | Ampliación nueva (H-21); los casos a–c están aprobados (QA-7 §4) | lead → game-qa | Implementado en `3c8c614`; pendiente de QA-8 |
| AC-91 (veredicto según la carga) | La métrica ampliada está aprobada (QA-7 §11.3). El veredicto según la carga con la deriva evaluada siempre (`1282744`, H-22) no tiene corrida | dev-tests (harness) → game-qa | Pendiente de QA-8: el mutante de carga baja + fuga tiene que salir RECHAZADO |

**Re-verificados en QA-6** (eran de QA-5 con commits posteriores): AC-75 (3/3 en la suite completa), AC-110 (3 tamaños, 0 frames de solape), AC-109 (20/20; con H-18) y AC-41 (mutantes muertos con el unitario).
**Aprobados en QA-7:** AC-128 (a)–(c), AC-126 (e), la verificación de AC-109 (H-18), D36–D38 (AS-V19 y AS-V20), y DT-04 y DT-05 confirmados. **Extensión §11 (`4750267`):** AC-91 con la métrica ampliada, con un soak de 10 min: memoria +0,28 MB, pendiente 0,021 MB/min, memoria externa plana en 3,63 MB, commits por pares 1,48 → 1,38 y 73 ciclos. H-19 queda cerrado.
**Para QA-8 (sobre `e45beaa`):** H-20 (`ca02798`), O-4 con D39 + D41 (`a45251d`, `cea3ad7`), H-22 (`1282744`), H-21 / AC-128 (d) (`3c8c614`) y O-7 / O-8 con el código de D40 (`55b45c1`, con la fe de erratas en `e45beaa`; spec en `8660390` y `af92d47`). Con D40 hay que volver a medir O-6, porque cambia el Mercante en LOD1. Cuando existan: AD-27 y DT-06 / AC-22.

### Ya conocidos (fuera de este triaje)
- Persistencia (AC-97): RECHAZADO porque no está implementada. Depende de GDD Q2 (Jonattan).

### Decisiones de producto sobre observaciones de QA
- Pellizco largo (AC-82): saltar 2 niveles en un gesto es aceptable.
- Espacio o Enter estando hundido equivalen a "Zarpar", solo con la cuenta atrás terminada (GDD §5 y §12, AC-101).
- Tolerancia de reloj en Zarpar (H-10): se **acepta** que el servidor admita el `respawn` hasta 2 ticks (100 ms) antes de que termine la cuenta. El jugador no lo percibe y elimina el rechazo del primer clic (GDD §12, AC-109).
- Prioridad entre aviso y pista (H-11): manda el **aviso**, que es información del servidor y dura poco. La pista, que solo sale en la primera sesión, cede: se recoloca o se oculta.
- Método de AC-91 (interpretaciones de dev-tests sobre el harness de `a422dd1`, 2026-10-11): se **aceptan** las 5 y quedan escritas en el AC. (1) Calentamiento hasta la primera reparación completa, con la banda de 45–55 %: la línea base tiene que tener la misma mezcla de carga que el final. (2) Pendiente del heap por mínimos cuadrados sobre las muestras 5 a 10; las dos ventanas comparten la del minuto 5. (3) Commits/s por intervalo; ≤ 10 en los 10 intervalos, y el cociente final/inicial solo se aserta con ventanas de 60 s. (4) Las texturas se **mantienen** como centinela: valen 0 por diseño (no hay `Texture` ni `map:` en `src/`, y `GameCanvas.tsx:202` apaga las sombras). (5) El suelo de 40 ciclos se mantiene: la simulación da 70 en 10 min (`qa-artifacts/qa/a422dd1/logs/verify.log:45`) y la corrida real, ~58 extrapolados (dato de dev-tests, sin confirmar hasta la primera corrida de 10 min), un 45 % por encima. Si no se llega, el AC queda NO VERIFICADO, no RECHAZADO.
- Tick de la simulación (DT-05, AC-03): el presupuesto de 4 ms no cambia; se mide como el menor de 3 p99, porque la carga ajena solo suma tiempo.
- Cálculo de ruta (DT-06, AC-22): el mismo criterio. Los 2 ms no cambian y se mide el menor de 3 p99. **Regla general a partir de ahora:** todo AC unitario que aserte un percentil de tiempo de pared dentro de `verify` se mide como el menor de 3 repeticiones. **Límite conocido** (QA-7 §11.2, con carga 75: AC-03 22,0 ms y AC-22 2,11 ms): el mínimo no salva una carga extrema. La medida de tiempo vale con carga media ≤ ~12 (con 11,8 pasó 271/271). Por encima, un rojo de tiempo se repite con menos carga y no cuenta como RECHAZADO. Lo demás de `verify` (funcional) vale con cualquier carga.
- "Salir" repetido (H-16): se **acepta** la ampliación de QA como caso (e) de AC-126. El sondeo es uno solo por salida: un 2.º o 3.er clic no lo reinicia ni lanza otro, el aviso cuenta desde el primer clic y, si el servidor vuelve, se navega una sola vez. Si el botón se desactiva o el sondeo en curso se reutiliza, lo decide el lead.
- Conmutadores cruzados (H-17): **AC-128 nuevo**, sobre la propuesta de QA con tres cambios. (1) El caso inverso parte de "reparando, con el objetivo seleccionado y sin atacar", porque desde un objetivo atacado Espacio cancela en vez de atacar. (2) Exige el casco dañado (≤ 90 %, para que la reparación no termine durante la prueba). (3) Añade el caso del casco intacto, que el servidor rechaza (`world.ts:382`): ahí `R` no puede cancelar el ataque, ni siquiera durante un frame del HUD. La regla general queda en GDD §5.
- Memoria de AC-91 (H-19): se **suma** la memoria externa de los ArrayBuffer al heap, con los mismos umbrales, y no se crea una 7.ª métrica. El presupuesto de GDD §16 es el crecimiento de memoria del cliente, esté donde esté: a quien juega le da igual que los bytes vivan en el heap de V8 o en un `ArrayBuffer`, y así no hace falta inventar otro umbral. Los dos componentes se registran por separado para el diagnóstico. AC-91 sigue APROBADO con el texto con el que se evaluó.
- Cociente de commits de AC-91 (riesgo que QA-6 §10.2 dejó para product): se **acepta** su propuesta: media de los intervalos 9 y 10 frente a la de los intervalos 1 y 2, con el mismo × 1,2. Los commits/s por minuto variaron entre 1,29 y 1,68 sin tendencia: un minuto 10 de 1,68 habría dado rojo (> 1,57) sin ninguna fuga. Con los datos de QA-6, la variación por intervalo es ≈ 10 %. El cociente de dos intervalos sueltos tiene ≈ 14 % de ruido y el de dos medias de pares, ≈ 10 % (estimación propia), así que el falso rojo baja. El mutante de commits de QA-6 (31,7 → 61,1 commits/s) lo sigue detectando el "≤ 10", que no cambia.
- Carga insuficiente en AC-91 (consulta del lead sobre `182146d`): se **confirma** que 0 andanadas propias, 0 de daño recibido o 0 reparaciones dejan la carga incompleta, igual que < 40 ciclos: las cuatro forman parte del "dado". Se **corrige** una cosa: con la carga incompleta la deriva se evalúa igual. Si algún umbral falla, el AC es RECHAZADO, porque menos carga solo puede ocultar una fuga, no fabricarla. Si ninguno falla, es NO VERIFICADO. Así no se pierde una fuga ya medida ni se aprueba sin carga.
- Orden de la cola lead / dev-tests: lo que espera es el paquete I2 entero (GDD Q11), así que **E13 también espera**, con H-305 y H-306. Lo siguiente sin bloqueo que más sube la media: AD-27 (Océano 8), que hace dev-tests, y en dev-render, el código de O-4 (HUD) y después O-7 / O-8 (Barcos 8).
- Pareto tras QA-7: se **acepta** que QA retire el móvil (LOD1) como motivo de la nota de Barcos. Seafight es de escritorio, así que la comparación se hace en 1440×900; además, en 390×844 los paños serían moiré (D36 b, D40). **O-7 queda como lo único que separa Barcos del 9.** O-8 sigue abierto como consistencia de color entre tamaños (P3) y va en el mismo cambio de D40. Orden sin I2: O-7 (Barcos) y AD-27 (Océano) en paralelo, y después los P3.
- Navegación y reparación (H-21): **AC-128 se amplía con el caso (d)**, sobre la propuesta de QA, con los mismos Δ y retardos que (a) y (b). El punto de partida es "sin reparar" (en la propuesta de QA ponía "reparando", pero el primer `R` es el que activa la reparación). El HUD no debe mostrar «reparando» mientras el barco navega. La regla general de GDD §5 nombra ahora la orden de navegación de forma explícita.
- Q11 respondida, «Sí» (Jonattan, 2026-10-11): I2 arranca con el reparto del lead. Product añade cuatro cosas:
  - El arte de los NPC de I2 va **después de D40**, para que nazcan con la lona nueva.
  - AC-51 deja escrito que la población de I2 entra **con** la cañonera, no antes.
  - AC-60 se vuelve a medir tras H-305 y tras H-306.
  - AC-115 queda marcado como prueba con evaluadores humanos, como AC-72.

  Los cruces entre `dev-npc` y dev-tests (área de interés y minimapa) están anotados bajo la cola.

---

## E0 — Fundación técnica · P0

### H-001 Simulación pura y determinista (§13, §16) · P0
- **AC-01** — Dado el módulo de simulación, cuando se analizan sus imports, entonces no incluye `react`, `three` ni `@react-three/*`. Verificación: unitario.
- **AC-02** — Dada una semilla y una secuencia fija de intenciones, cuando se ejecutan 1 200 ticks dos veces, entonces el estado final serializado es idéntico. Verificación: unitario.
- **AC-03** — Dado un mundo con 20 jugadores con intenciones aleatorias, 20 NPC y el jefe (en cuanto exista, H-305), cuando se miden 2 000 ticks **3 veces seguidas**, entonces el **menor de los 3 p99** es ≤ 4 ms en Node 20. Verificación: unitario, dentro de `verify`, con los 3 p99 en el log. *Por qué el menor (DT-05):* la carga ajena de la máquina (p. ej. otro Jest en paralelo) solo puede sumar tiempo a un tick, nunca restarlo, así que el mínimo de varias repeticiones estima el coste de la simulación y un p99 suelto mide la máquina (4,31 ms con otro Jest al lado frente a 0,33 ms aislado, sin cambios en `src/game`). No se sube el umbral, porque eso aflojaría el presupuesto de GDD §16 sin motivo; tampoco se exige correrlo aislado, porque saldría de la puerta de `verify`. **Límite conocido (QA-7 §11.2):** con carga extrema ni el mínimo salva la medida. Con carga 75 dio 22,0 ms; con 11,8, el verify pasó 271/271. Por eso un rojo con carga media (`uptime`) > ~12 no cuenta: se repite con menos carga, y solo un rojo con carga ≤ ~12 es RECHAZADO. El ~12 es empírico, de esta máquina.
- **AC-04** — Dado el módulo de constantes, cuando se compara con las tablas del GDD (§4, §6, §7, §8, §9, §10, §11), entonces todos los valores coinciden. Verificación: unitario (tabla de constantes revisada por `game-product`).

### H-002 Protocolo de intenciones validado (§13) · P0
- **AC-05** — Dado un cliente conectado, cuando envía una intención inválida (tipo desconocido, `NaN`, `Infinity`, texto de más de 256 caracteres, campos extra), entonces el servidor la descarta, el estado no cambia y el proceso sigue vivo. Verificación: Jest+socket.
- **AC-06** — Dado un cliente, cuando envía 50 intenciones válidas en 1 s, entonces se procesan como máximo 20 en la ráfaga inicial y 10/s sostenidas. Verificación: Jest+socket.
- **AC-07** — Dado un cliente, cuando envía `attack` contra sí mismo, contra un id inexistente o contra un barco hundiéndose, entonces se rechaza y no cambia el estado de ataque. Verificación: Jest+socket.

### H-003 Autenticación y modo invitado (§3) · P0
- **AC-08** — Dado el servidor en modo producción, cuando un socket conecta sin un JWT de Clerk válido, entonces la conexión se rechaza antes de unirse al mundo. Verificación: Jest+socket.
- **AC-09** — Dado `AUTH_BYPASS=1` con una variable de entorno de Railway presente, cuando arranca el servidor, entonces termina con error y no abre el puerto. Verificación: unitario.
- **AC-10** — Dado `npm run dev:guest`, cuando se abre la landing, entonces aparece "Jugar como invitado". Sin `AUTH_BYPASS`, el botón no existe en el DOM. Verificación: e2e.

### H-004 Entrar al mundo y verse (§13) · P0
- **AC-11** — Dados 2 contextos de navegador, cuando ambos entran al juego, entonces cada uno ve el barco del otro con su nombre en ≤ 2 s. Verificación: e2e.
- **AC-12** — Dado un servidor con 20 jugadores, cuando conecta el 21.º, entonces recibe "Servidor lleno" y vuelve a la landing con ese mensaje. Verificación: Jest+socket + e2e.
- **AC-13** — Dado un jugador que cierra la pestaña, cuando pasan 11 s, entonces su barco ya no existe para los demás. Verificación: e2e.

### H-005 Harness que comprueba lo observable (QA H-09) · P1
- **AC-108** — Dado cualquier AC P0 cuya verificación incluya `e2e` o `perf`, cuando se ejecuta el harness, entonces existe un test que aserta el observable del AC (frames, cajas o contadores), no solo que la acción no falle. Verificación: matriz AC → test en cada QA-REPORT, revisada por game-qa.

## E1 — Navegación · P0

### H-101 Clic o toque para navegar (§5, §6) · P0
- **AC-14** — Dado el barco quieto, cuando el jugador hace clic en el agua, entonces se cumplen tres cotas:
  (a) el marcador aparece en ≤ 50 ms, sin esperar al servidor;
  (b) en el servidor, el primer snapshot que muestra el barco propio con velocidad > 0 sale ≤ 200 ms después de recibir el `moveTo` (150 ms teóricos: ≤ 1 tick + ≤ 1 intervalo de snapshot, más 1 tick de tolerancia);
  (c) en pantalla, la posición renderizada del barco cambia en ≤ 350 ms en 10 de 10 corridas con el servidor local.
  Verificación: Jest+socket para (b); e2e para (a) y (c), con marcas de tiempo del evento, del marcador y del primer cambio de la posición renderizada.
- **AC-15** — Dado un destino sin obstáculos, cuando el barco llega, entonces se detiene a ≤ 2 m del destino con velocidad 0 y no oscila (la distancia no crece después de la llegada). Verificación: unitario.
- **AC-16** — Dado un barco quieto, cuando navega en línea recta, entonces la Balandra alcanza 14 ±0,1 m/s en 3,5 ±0,1 s, el Bergantín 12 m/s en 4,0 s y la Fragata 10 m/s en 4,0 s. Los giros sostenidos miden 90/70/55 °/s ±1. Verificación: unitario.
- **AC-17** — Dado un barco navegando con un objetivo seleccionado y atacando, cuando el jugador hace clic en otro punto del agua, entonces el destino se reemplaza y la selección y el ataque siguen activos. Verificación: unitario + e2e.
- **AC-18** — Dado un clic fuera del límite navegable, cuando se procesa, entonces el destino queda ajustado a X y Z ∈ [−490, 490]. Verificación: unitario.
- **AC-19** — Dado un barco navegando, cuando el jugador pulsa `S`, entonces el destino se borra y el barco frena hasta 0 con su tasa de frenado. Verificación: unitario + e2e.
- **AC-100** — Dado un barco a velocidad máxima en mar abierto, a más de (margen de navegación + 8 m) de toda isla, cuando recibe un destino a 90° de su rumbo, entonces su velocidad durante el giro no baja de 0,6 × vel. máx. (±0,1 m/s), es decir, no gira casi en el sitio. Junto a una isla, con un giro de más de 45°, la velocidad sí baja a ≤ 1 m/s (GDD §6, 4b). Verificación: unitario.

### H-102 Rutas que esquivan islas (§4, §6) · P0
- **AC-20** — Dados 1 000 pares origen/destino aleatorios en agua, para cada clase de barco y cada tipo de NPC, cuando se calcula la ruta y se simula, entonces en ningún tick el segmento del casco (de proa a popa, longitud L, sin el bauprés) toca una isla, es decir, su distancia al centro de la isla es ≥ que el radio de la isla. El 100 % llega a ≤ 2 m del destino. Verificación: unitario.
- **AC-21** — Dado un clic dentro de una isla, cuando se procesa, entonces el destino es el punto navegable más cercano: a una distancia del borde de la isla de `L/2 + 2` m ±1 m según la clase. Al llegar de frente, la proa no toca la isla. Verificación: unitario.
- **AC-22** — Dados 1 000 cálculos de ruta aleatorios, cuando se miden **3 veces seguidas** (3 tandas de 1 000), entonces el **menor de los 3 p99** es ≤ 2 ms. Verificación: unitario, dentro de `verify`, con los 3 p99 en el log. *Por qué el menor (DT-06, el mismo caso que DT-05 en AC-03):* la carga ajena de la máquina solo puede sumar tiempo a una ruta, nunca restarlo. Un p99 suelto mide la máquina: dio 2,019 ms con carga media de 14–18, frente a 0,109–0,151 ms aislado. Una ruta lenta de verdad se repite en las 3 tandas y sigue fallando. No se sube el umbral ni se exige correrlo aislado. **Mismo límite conocido que AC-03:** con carga 75 dio 2,11 ms (QA-7 §11.2, O-9); un rojo con carga media > ~12 no cuenta y se repite.

### H-104 El decorado de las islas no sale del colisionador (QA H-04) · P2
- **AC-103** — Dado `buildIslands(ISLANDS)`, cuando se recorren los vértices con y > 0 de muelles, rocas y palmeras, entonces ninguno queda a más de r + 0,5 m del centro de su isla en XZ. Lo que parece sólido es sólido. Verificación: unitario (ampliar `assets.test.ts`).

### H-103 Cámara y zoom (§5) · P0
- **AC-23** — Dado el barco navegando **en modo seguimiento**, cuando se muestrean 10 frames, entonces la proyección en pantalla del pivote del barco propio (centro en la línea de flotación, ASSET-SPEC) está siempre dentro del **10 % central**, es decir, de la caja centrada de 10 % del ancho × 10 % del alto de la pantalla: |dx| ≤ 0,05·W y |dy| ≤ 0,05·H. Verificación: e2e.
- **AC-24** — Dado el zoom por defecto con cañones N1, N2 y N3, cuando se dibuja alrededor del barco el círculo de radio R = max(alcance del cañón propio, 65 m), es decir 65 / 70 / 80 m, entonces cabe entero en 1440×900 y en 390×844, y ppm₀ es el máximo que lo permite (±1 px, AD-06): ≈ 6,20 / 5,76 / 5,04 px/m en escritorio y 2,82 / 2,61 / 2,29 en móvil. Decisión U8 (GDD §5); antes eran 80 m fijos. Verificación: captura + e2e (ppm₀ por nivel de cañón).
- **AC-25** — Dado el juego en escritorio, cuando se gira la rueda del ratón, entonces el zoom pasa por exactamente 3 niveles (0,7×, 1,0× y 1,5×) y la página no hace scroll. Verificación: e2e.

## E2 — Combate · P0

### H-201 Seleccionar objetivo (§5) · P0
- **AC-26** — Dado un pirata en pantalla, cuando el jugador hace clic sobre él, entonces aparecen el anillo de selección y el panel con nombre, tipo, vida y distancia, y el cliente **no emite ningún mensaje** de red. Verificación: e2e (conteo de frames WebSocket).
- **AC-27** — Dados NPC atacables a 40, 90, 140 y 170 m, cuando se pulsa `Tab` 4 veces, entonces la selección recorre 40 → 90 → 140 → 40 m (el de 170 m queda fuera del radio de 150 m). Verificación: e2e.
- **AC-28** — Dado un objetivo seleccionado y atacado, cuando se pulsa `Esc` dos veces, entonces la 1.ª pulsación cancela el ataque (la selección sigue) y la 2.ª deselecciona. Verificación: e2e.
- **AC-29** — Dado el juego en 390×844, cuando el jugador toca a ≤ 24 px CSS de la silueta de un barco, entonces ese barco queda seleccionado. Verificación: e2e (emulación móvil). La distancia se mide contra la caja de selección `sb_pick`, que contiene la malla, así que la prueba es igual o más estricta que el AC.

### H-202 Ataque persistente con andanadas (§7) · P0
- **AC-30** — Dado un objetivo a tiro con el cañón cargado, cuando el jugador pulsa `Espacio`, entonces la primera andanada sale en el siguiente tick (≤ 50 ms de servidor) y las siguientes cada 4,0 s ±1 tick sin más entradas. Verificación: unitario.
- **AC-31** — Dado un objetivo fuera de alcance, cuando el jugador pulsa `Espacio`, entonces no hay disparos y el HUD muestra "Fuera de alcance". Cuando el objetivo entra en alcance, dispara sin una entrada nueva. Verificación: unitario + e2e.
- **AC-32** — Dadas 10 000 andanadas con semilla para cada combinación de clase y nivel de cañón, cuando se promedia el daño, entonces es igual a cañones × daño × precisión ±2 %. Verificación: unitario.
- **AC-33** — Dado un disparo a una distancia d, cuando se resuelve, entonces el daño se aplica a los d/120 s ±1 tick, y no se aplica si el objetivo se hundió antes. Verificación: unitario.
- **AC-34** — Dado un ataque activo, cuando ocurre cualquiera de estas condiciones: cancelar, objetivo hundido, objetivo a más de 200 m, muerte del atacante o inicio de una reparación, entonces el ataque termina en ese mismo tick. Verificación: unitario (un caso por condición).
- **AC-35** — Dados un atacante, un tercer barco entre ambos y el objetivo, alineados, cuando el atacante dispara 100 andanadas, entonces solo el objetivo pierde vida. Verificación: unitario.
- **AC-36** — Dado un ataque activo, cuando el jugador navega, entonces el ataque sigue activo y dispara siempre que el objetivo esté a tiro. Verificación: unitario.
- **AC-37** — Dado un ataque activo contra el objetivo seleccionado, cuando se pulsa `Espacio` otra vez, entonces el ataque se cancela. Verificación: e2e.

### H-205 Pulsaciones rápidas: cada una cuenta (hallazgo de dev-tests) · P2
- **AC-125** — Dados un objetivo seleccionado y atacado, y un retardo de red simulado de 0 ms y de 100 ms por sentido, cuando el jugador pulsa dos veces `Espacio` (o el botón Atacar en 390×844) separadas Δ ∈ {80, 120, 200, 300} ms, entonces el cliente emite exactamente `attack` → `cancelAttack` y el servidor termina sin ataque. Dos pulsaciones de `Esc` emiten exactamente 1 `cancelAttack` y la segunda deselecciona sin enviar nada (AC-28). El estado de acción del HUD refleja la última pulsación en ≤ 50 ms y **no se desdice**: no muestra estados intermedios ni vuelve al anterior (p. ej. "Cancelado" → "Armado") cuando llega con retraso la confirmación de una intención previa. Después solo puede cambiar por un hecho nuevo del servidor (objetivo hundido o fuera de alcance, muerte, protección). Mantener una tecla pulsada no repite la intención (se ignoran los eventos `repeat`). Verificación: e2e con pulsaciones reales y conteo de frames, en los 4 Δ × 2 retardos. El estado del HUD se muestrea en cada frame durante 500 ms tras la última pulsación, con un objetivo vivo y a tiro: 0 cambios después de los primeros 50 ms.
- **AC-128** — Dado un retardo de red simulado de 0 ms y de 100 ms por sentido y, salvo en (c), el casco por debajo del 90 % de su vida, cuando el jugador combina Reparar con Atacar o con una orden de navegación, con entradas separadas Δ ∈ {80, 120, 200} ms, entonces cada conmutador tiene en cuenta lo que cancelan las otras intenciones (reparar cancela el ataque; atacar y navegar cancelan la reparación; GDD §8 y AC-40):
  (a) con un objetivo atacado, `R` y luego `Espacio` emiten exactamente `repair(true)` → `attack`, y el servidor termina atacando y sin reparar;
  (b) reparando, con un objetivo seleccionado y sin atacar, `Espacio` y luego `R` emiten exactamente `attack` → `repair(true)`, y el servidor termina reparando y sin ataque;
  (c) con el casco intacto y un objetivo atacado, `R` no cancela el ataque: el servidor rechaza la reparación (`world.ts:382`) y el ataque sigue;
  (d) sin reparar, `R`, un clic en el agua y otra vez `R`, con Δ entre cada par de entradas, emiten exactamente `repair(true)` → `moveTo` → `repair(true)`. La orden de navegación ya canceló la reparación (GDD §8), así que el segundo `R` vuelve a reparar, y el servidor termina reparando y sin destino (el barco frena y repara, AC-38). Entre el clic y el segundo `R`, el HUD no muestra «reparando» (hallazgo H-21 de QA-7).
  En los cuatro casos, el estado de acción del HUD refleja la última entrada en ≤ 50 ms y no se desdice (AC-125); en (c) no pasa por ningún estado distinto de "atacando". Verificación: e2e con entradas reales (teclas y clic en el agua) y conteo de frames, en los 3 Δ × 2 retardos de (a), (b) y (d), y (c) con los 2 retardos. El HUD se muestrea como en AC-125 (hallazgos H-17 de QA-6 y H-21 de QA-7).

### H-203 Reparar (§8) · P0
- **AC-38** — Dada una Balandra al 50 % de vida navegando, cuando pulsa `R`, entonces frena, empieza a reparar al bajar de 1 m/s y sube +16 HP cada 0,5 s hasta 800, donde la reparación termina sola. Verificación: unitario.
- **AC-39** — Dado un barco reparando, cuando recibe daño, entonces durante los 3 s siguientes repara al 1,5 %/s y después vuelve al 4 %/s. Verificación: unitario.
- **AC-40** — Dado un barco reparando, cuando recibe `moveTo` o `attack`, entonces la reparación se cancela. Dado un barco atacando, cuando empieza a reparar, entonces el ataque se cancela. Verificación: unitario.
- **AC-41** — Dada una vida < 30 %, cuando se renderiza el HUD, entonces el botón Reparar pulsa. Con vida ≥ 30 %, no pulsa. Verificación: e2e (estado del botón) + captura + **unitario del umbral**: 239/800 (29,9 %) pulsa y 240/800 (30 %) no pulsa. El e2e solo no fija el umbral (QA-5 H-15).

### H-204 Doble clic para atacar (§5) · P1
- **AC-42** — Dado un pirata en pantalla, cuando el jugador hace doble clic sobre él, entonces queda seleccionado y atacado con una sola intención `attack`. Verificación: e2e.

## E3 — NPC · P0 (cañonera y jefe: P1, incremento I2)

### H-301 Pirata hostil (§9) · P0
- **AC-43** — Dado un pirata en patrulla, cuando un jugador atacable entra a ≤ 70 m, entonces el pirata pasa a Combate en ≤ 1 tick y dispara su primera andanada cuando la distancia es ≤ 55 m. Verificación: unitario.
- **AC-44** — Dado un jugador en la zona segura o con protección, cuando está a ≤ 70 m de un pirata, entonces el pirata no lo elige como objetivo. Verificación: unitario.
- **AC-45** — Dado un pirata en Combate, cuando el objetivo está a más de 110 m o el pirata a más de 200 m de su origen, entonces regresa sin disparar y al llegar tiene el 100 % de la vida. Verificación: unitario.
- **AC-46** — Dado un pirata en patrulla, cuando un jugador lo daña desde 80 m, entonces el pirata elige a ese jugador como objetivo (represalia). Verificación: unitario.
- **AC-47** — Dados 10 min simulados con 20 bots que entran y salen del puerto, cuando se registran las posiciones, entonces ningún pirata está nunca a menos de 130 m de (0, 0). Verificación: unitario.
- **AC-48** — Dado un pirata en Combate contra un objetivo quieto, cuando pasan 20 s, entonces la mediana de su distancia al objetivo es 45 ±5 m. Verificación: unitario.

### H-302 Mercante pasivo (§9) · P0
- **AC-49** — Dados 10 min simulados con jugadores atacando mercantes, cuando se cuentan sus disparos, entonces los mercantes hicieron 0 andanadas. Verificación: unitario.
- **AC-50** — Dado un mercante dañado por un atacante quieto, cuando pasan los 12 s siguientes, entonces su distancia al atacante crece de forma monótona a 9 ±0,2 m/s. Al terminar, vuelve a su ruta por el *waypoint* más cercano. Verificación: unitario.

### H-303 Población y reaparición (§9) · P0
- **AC-51** — Dado un servidor recién arrancado, cuando se inspecciona el mundo, entonces hay 8 piratas (2 por sector), 4 cañoneras (1 por sector, en el anillo de 400–470 m) y 8 mercantes en sus zonas. **Hasta que entre H-306 vale la población anterior a I2:** 12 piratas (3 por sector) y 8 mercantes. Es lo que hay hoy en el código y en el test (`constants.ts:136-137`; `npc.test.ts:176`; AC-04 en `architecture.test.ts:142`), y con lo que QA aprobó AC-51. El cambio de población entra **en el mismo commit que la cañonera**, nunca antes: quitar 4 piratas sin poner 4 cañoneras dejaría menos hostiles y movería la curva de AC-60. Verificación: unitario.
- **AC-52** — Dado un NPC hundido, cuando pasan 30 s (pirata), 45 s (cañonera) o 20 s (mercante) ±1 tick, entonces reaparece en su zona, a ≥ 100 m de cualquier jugador y fuera de las islas. Verificación: unitario.

### H-304 Balance de duelos (§9) · P0
- **AC-53** — Dados 1 000 duelos con semilla sin reparar, cuando una Balandra N1 se enfrenta a un pirata, entonces la mediana del tiempo hasta hundirlo está en 18–24 s y la vida perdida en 25–40 %. Contra un mercante, 10–14 s. Verificación: unitario. *Referencia: la simulación de `game-product` con las tablas del GDD da 20,5 s / 30 % y 12,5 s.*

### H-305 Capitán pirata: el jefe (§9) · P1 (I2; antes P2)
*Requisitos de arte para game-ux: GDD §9, "Requisitos de arte de los NPC de I2".*
- **AC-54** — Dados 10 piratas o cañoneras (no mercantes) hundidos desde la última muerte del capitán o desde el arranque, cuando se hunde el 10.º, entonces aparece 1 capitán en el punto exterior (440 m) del sector pirata con menos jugadores, a ≥ 150 m de cualquier jugador, y nunca hay 2 vivos. Verificación: unitario.
- **AC-55** — Dados 1 000 duelos con semilla, entonces se cumplen tres cotas: una Fragata con todo a N3 hunde al capitán con una mediana de 12–20 s y 10–25 % de vida perdida; 2 Bergantines (cañones y casco N2) lo hunden en 14–22 s sin muertes en ≥ 95 % de los duelos; y una Balandra N1 sola pierde en ≥ 95 %. Verificación: unitario. *Referencia (Monte Carlo de game-product): 15,5 s / 15 %; 18,0 s con 0,00 muertes; la Balandra pierde el 100 %.*
- **AC-111** — Dado un capitán que aparece, cuando llega el siguiente snapshot, entonces todos los jugadores reciben el aviso "¡El Capitán pirata ha aparecido en el sector <XX>!" y ven su marcador propio en el minimapa desde cualquier punto del mapa (fuera del área de interés). Al hundirse, el feed de todos muestra "El Capitán pirata ha caído: A, B y C" (hasta 3 nombres por daño y "y N más"). Verificación: Jest+socket (aviso y marcador fuera del área de interés) + e2e con 2 contextos.
- **AC-112** — Dado un capitán en combate, cuando el objetivo lo arrastra a más de 150 m de su guarida o se pierde, entonces el capitán vuelve sin disparar y al llegar tiene el 100 % de la vida. En 10 min simulados nunca está a menos de 130 m del puerto. Verificación: unitario.

### H-306 Cañonera pirata (§9) · P1 (I2)
*Requisitos de arte para game-ux: GDD §9, "Requisitos de arte de los NPC de I2".*
*Con H-306 entran también la población de I2 de AC-51 (con su constante en AC-04) y la cañonera en el contador del Capitán (AC-54). AC-60 se vuelve a medir con la población de I2; si sale de rango, la palanca es la recompensa de la cañonera (GDD §10).*
- **AC-113** — Dada una cañonera en combate contra un objetivo quieto a 40 m, cuando pasan 20 s, entonces se aleja hasta ≥ 55 m y la mediana de su distancia es 62 ±4 m. Dispara solo a ≤ 65 m. Contra un objetivo que se le acerca a ≥ 10 m/s, la distancia baja, es decir, se la puede alcanzar. Verificación: unitario.
- **AC-114** — Dados 1 000 duelos con semilla, cuando un Bergantín con cañones N2 se enfrenta a una cañonera, entonces la mediana está en 15–22 s con 10–25 % de vida perdida. Una Balandra N1 pierde entre el 55 y el 80 % de su vida (no es un objetivo para N1). Verificación: unitario. *Referencia (Monte Carlo de game-product): 18,0 s / 17 %; 68 %.*

## E4 — Botín y economía

### H-401 Recompensa en oro (§10) · P0
- **AC-56** — Dado un pirata dañado un 60 % por A y un 40 % por B, cuando se hunde, entonces A recibe 63 de oro y B 42 (suma 105), acreditados una sola vez. Verificación: unitario.
- **AC-57** — Dado un pirata (105 de oro) dañado a partes iguales por A y B, con A dañando primero, cuando se hunde, entonces A recibe 53 y B 52: el resto de 1 va a A por el desempate de quien dañó primero. Verificación: unitario.
- **AC-58** — Dado un hundimiento con recompensa, cuando llega el snapshot, entonces el HUD muestra "+N oro" y el contador actualizado en ≤ 200 ms. Verificación: e2e.

### H-402 Restos flotantes (§10) · P1
- **AC-59** — Dado un NPC hundido, cuando se hunde, entonces aparece una caja en su posición. El primer jugador a ≤ 8 m la recoge (+25 de un pirata, +15 de un mercante); si dos llegan en el mismo tick, la recoge el más cercano. A los 30 s desaparece. Verificación: unitario + captura.

### H-403 Curva económica (§10) · P1
- **AC-60** — Dado un bot con una Balandra N1 y 100 de oro que ataca al NPC más cercano, repara por debajo del 40 % de vida y sigue la estrategia **"barco primero"** (no compra nada hasta poder pagar el Bergantín; lo compra y, a partir de ahí, compra siempre el artículo más barato disponible, Fragata incluida), **no ataca al Capitán pirata, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto**, cuando juega en la simulación acelerada con las semillas fijas 1–5 y la población de I2, entonces la **mediana de las 5 semillas** cumple tres cosas: acumula ≥ 500 de oro en ≤ 4 min, compra el Bergantín en ≤ 20 min y lo tiene todo comprado (12 800 de oro) en 45–70 min simulados. Verificación: unitario. *Hasta H-306 se mide con la población vigente (AC-51). Se vuelve a medir al entrar H-305 (el bot tiene que esquivar a un Capitán real) y al entrar H-306 (población de I2).*

## E5 — Muerte y reaparición (§12) · P0

### H-501 Hundimiento y reaparición · P0
- **AC-61** — Dado un barco con vida ≤ 0, cuando pasa ese tick, entonces entra en Hundiéndose durante 3 s, no se puede seleccionar y todos los ataques contra él terminan. Verificación: unitario.
- **AC-62** — Dado un jugador con 455 de oro que es hundido, cuando ve la pantalla de muerte, entonces esta muestra quién lo hundió, "−45 oro" y una cuenta atrás de 8 s. El botón Zarpar está desactivado hasta que la cuenta llega a 0. Verificación: unitario (redondeo: 455 → −45) + e2e (la tarjeta muestra "por <nombre>" y exactamente el −N que envía el servidor; con invitados el oro es múltiplo de 10) + captura.
- **AC-63** — Dado un jugador muerto con la cuenta atrás terminada, cuando pulsa Zarpar, entonces reaparece en el anillo de 60–90 m del puerto, con el 100 % de la vida y la misma clase y mejoras. Verificación: unitario + e2e con **clic real** en Zarpar (llamar a `respawn()` directamente no cuenta; QA H-01).
- **AC-101** — Dado un jugador hundido con la cuenta atrás en 0, cuando hace clic en Zarpar, lo toca (móvil) o pulsa Enter o Espacio, entonces el cliente emite **exactamente 1** intención `respawn` y en ≤ 1 s el barco propio existe con el 100 % de la vida. Verificación: e2e con interacción real en 1440×900 y 390×844 (QA H-01).
- **AC-109** — Dado un jugador hundido, cuando el cliente envía `respawn` en el mismo frame en que Zarpar se activa, con su reloj adelantado hasta 50 ms respecto al servidor, entonces el servidor lo acepta en 20 de 20 corridas y no llega ningún aviso "Aún no puedes zarpar". Verificación: Jest+socket con reloj inyectable + e2e con el clic en la mutación que habilita el botón (QA H-10; QA lo llamó AC-101b). Además, un caso de Jest con el tick retrasado: el reloj real avanza hasta 1 tick sin que corra `tick()`, de modo que el servidor procesa el `respawn` con su `world.time` hasta 100 ms por detrás del instante en que el cliente habilitó el botón. Tiene que aceptarse, y con 1 tick de tolerancia ese caso falla. Es lo que fija el 2.º tick de margen (QA-6 H-18).
- **AC-64** — Dado un jugador recién reaparecido, cuando pasan 15 s o él ataca (lo que ocurra primero), entonces pierde la protección. Mientras la tiene, ningún pirata lo elige, los ataques de jugadores se rechazan y se ve el indicador. Verificación: unitario + captura.

### H-502 Tarjeta de muerte en una línea (QA H-07) · P3
- **AC-106** — Dada la tarjeta de muerte en 1440×900 y en 390×844, cuando se mide la línea "por <icono> <nombre>", entonces ocupa 1 sola línea (alto ≤ 24 px). Verificación: e2e (caja del DOM) + captura.

## E6 — Puerto y mejoras (§11)

### H-601 Zona segura · P0
- **AC-65** — Dado un barco que cruza el círculo de 110 m, cuando entra o sale, entonces el aviso "Zona segura" aparece o desaparece en el mismo snapshot, y el borde de la zona se ve en el mundo. Verificación: e2e + captura.

### H-602 Tienda de mejoras · P0
- **AC-66** — Dado el barco dentro de la zona segura, cuando se renderiza el HUD, entonces el botón Puerto está activo. Fuera de la zona se ve desactivado y explica por qué **en escritorio y en táctil**: al pulsarlo (clic o toque) o con `P` aparece el aviso "El puerto solo abre en la zona segura". Un `title` no basta, porque en táctil no se ve. Verificación: e2e en 1440×900 y 390×844 (hallazgo DT-02).
- **AC-67** — Dado un jugador con 600 de oro en el puerto, cuando compra Cañones N2, entonces le quedan 100 de oro y su cañón pasa a daño 38, alcance 70 m y recarga 3,5 s. Con 400 de oro, la compra se rechaza sin cambios. Verificación: unitario + e2e.
- **AC-68** — Dada una intención `buy` forjada fuera de la zona, de N3 sin N2 o de un artículo ya poseído, cuando llega al servidor, entonces se rechaza y ni el oro ni las mejoras cambian. Verificación: Jest+socket.
- **AC-69** — Dada una Balandra con 400/800 de vida, cuando compra Casco N2, entonces su vida máxima pasa a 960 y la actual a 480 (mismo porcentaje). Verificación: unitario.

### H-603 Comprar y cambiar de barco · P1
- **AC-70** — Dado un jugador con 2 000 de oro en el puerto, cuando compra el Bergantín, entonces su barco activo es un Bergantín con vida llena (1 400 × casco), la Balandra sigue en propiedad y cambiar entre ambas en el puerto es gratis. Fuera de la zona, el cambio se rechaza. Verificación: unitario + e2e.

## E7 — HUD y legibilidad (§14)

### H-701 HUD principal · P0
- **AC-71** — Dado el juego en 1440×900 y 390×844, cuando se captura una escena de combate, entonces se ven la vida, el oro, el panel de objetivo y el estado de acción, sin solaparse ni recortarse. Verificación: captura.
- **AC-72** — Dadas capturas de escritorio y móvil con el barco propio, otro jugador, un pirata, un mercante y un objetivo seleccionado, cuando 5 evaluadores las miran durante 5 s, entonces ≥ 4 de 5 identifican correctamente los 5 elementos, también con las capturas en escala de grises. Verificación: captura + prueba con evaluadores (umbrales en `ART-DIRECTION.md`).
- **AC-73** — Dado un ataque activo, cuando se capturan 5 frames en un ciclo de recarga, entonces el indicador junto al barco propio avanza de forma monótona y se ve lleno en el instante del disparo. Verificación: captura secuencial.
- **AC-74** — Dado un objetivo seleccionado, cuando se captura, entonces el anillo de selección se ve sobre el agua y junto a una isla, y el círculo de alcance propio distingue "en alcance" de "fuera de alcance". Verificación: captura.
- **AC-75** — Dada una andanada con k impactos, cuando llega la primera bala que acierta, entonces aparece **un único** número igual a k × daño, y cada bala fallada deja una salpicadura. Con k = 0 aparece "Fallo", pero solo si el tirador o el objetivo es el jugador propio. Todo debe leerse con el zoom por defecto. Verificación: captura + e2e (se cuenta un número por cada evento de andanada), en un **servidor propio** (`startOwnServer` con el escenario showcase), no en el compartido, para que no dependa del orden de los tests (QA-5 H-13).
- **AC-76** — Dados dos barcos separados por al menos el umbral que defina `game-ux`, cuando se captura, entonces sus etiquetas de nombre y vida no se solapan. Verificación: captura.

### H-705 Velas legibles con cualquier rumbo (QA H-03) · P1
- **AC-102** — Dada cada clase P0 (Balandra, Bergantín, Fragata, Pirata y Mercante), cuando `measureSails()` recorre los rumbos de 0 a 345° con zoom 0,7× en 1440×900, entonces cumple AS-V14 (ASSET-SPEC §8.3): ratio ≥ 0,25 en todos los rumbos. Verificación: perf automatizado (un harness nuevo que llama a `measureSails()`).

### H-706 Daño legible de un vistazo (QA H-05) · P2
- **AC-104** — Dado un barco con ≤ 25 % de vida, cuando se captura con zoom 1,0× en 1440×900 y en 390×844, entonces el humo y el fuego ocupan al menos el área mínima que fije `game-ux` en VFX-09 y se distinguen en la captura en escala de grises. Verificación: captura. *Depende de la cifra de VFX-09.*

### H-707 El indicador de recarga no tapa placas ajenas (QA H-08) · P3
- **AC-107** — Dados barcos vecinos en combate en la escena estándar, cuando se dibuja el indicador de recarga propio (18 px), entonces no se cruza con ninguna placa ajena: el *declutter* (AD-11) incluye el indicador en la caja de la placa propia. Verificación: e2e (cajas) + captura.

### H-708 Los NPC de I2 se distinguen de un vistazo · P1 (I2)
- **AC-115** — Dadas capturas de escritorio y móvil (1,0×) con un pirata, una cañonera, el capitán, un mercante y otro jugador, cuando 5 evaluadores las miran durante 5 s, entonces ≥ 4 de 5 identifican los 5 tipos, también en escala de grises. En el minimapa, los 6 tipos (propio, jugador, pirata, cañonera, mercante y capitán) tienen formas distintas, no solo color. Verificación: captura + prueba con evaluadores (umbrales en ART-DIRECTION). Antes de la prueba humana, deben pasar las reglas medibles AD-28 (firmas en grises por rumbo) y AD-29 (plantillas del minimapa) de game-ux (D25).

### H-709 Ver quién te dispara aunque no esté en pantalla · P1 (I2)
- **AC-124** — Dado un barco que dispara al jugador desde fuera de pantalla (p. ej. un jugador con cañón N3 a 80 m contra una Balandra N1, cuyo encuadre es de 65 m), cuando llega cada andanada, entonces un indicador en el borde apunta hacia el atacante (error de ángulo ≤ 10°) mientras dure el ataque y 3 s después. Si el atacante está en pantalla, no aparece. El indicador de atacante usa el código de la **relación** del atacante (hostil para los NPC, jugador para el PvP; diseño en ART-DIRECTION §12.8 y AD-31) y no se confunde con el chip de barco propio de la vista libre (AC-121), tampoco en escala de grises. Verificación: e2e (caja y ángulo del indicador) + captura.

### H-710 Los avisos no se duplican (QA-5 O-3) · P3
- **AC-127** — Dado un aviso visible, cuando se emite otro **con el mismo texto** (de cualquier tipo: sistema, compra u oro), entonces sigue habiendo uno solo, en la misma posición, y su tiempo de vida se reinicia desde la última emisión. Los avisos con textos distintos siguen apilándose hasta `MAX_TOASTS` (3). La información repetida no se pierde: el contador de oro y el feed ya la llevan. Verificación: unitario del store (emitir A, A, A y B → 2 avisos, con la caducidad de A contada desde la 3.ª emisión) + e2e en 390×844 (4 toques en Puerto fuera de la zona → 1 solo aviso visible, que desaparece a la duración de un aviso, ±100 ms, contada desde el último toque).

### H-702 Minimapa · P1
- **AC-77** — Dado el juego en marcha, cuando se captura el minimapa, entonces muestra las islas, el puerto, la zona segura y las entidades del área de interés con forma y color por tipo, y se re-renderiza a ≤ 2 Hz. Verificación: captura + perf.

### H-703 Feed de eventos · P1
- **AC-78** — Dado un hundimiento de un pirata por el jugador, cuando llega el snapshot, entonces el feed muestra "Hundiste a Pirata +105 oro". Muestra como máximo 4 líneas y cada una dura 5 s. Verificación: e2e.

### H-704 Pistas de primera sesión · P1
- **AC-79** — Dado un jugador en su primera sesión, cuando entra, entonces ve 3 pistas en orden (navegar → seleccionar → atacar). Cada una desaparece al hacer la acción, y no vuelven en la siguiente sesión. Verificación: e2e.

## E8 — Móvil (§5)

### H-801 Controles táctiles · P0
- **AC-80** — Dado el juego en 390×844 y en 844×390, cuando se juega con toques, entonces tocar el agua navega y tocar un barco lo selecciona. El botón Atacar mide ≥ 64×64 px y Objetivo, Reparar y Puerto ≥ 48×48 px, sin solaparse con el panel ni con el minimapa. Verificación: e2e (emulación) + captura.
- **AC-81** — Dado el juego en móvil, cuando el jugador desliza o pellizca sobre el canvas, entonces la página no hace scroll ni zoom. Verificación: e2e.

### H-803 Las pistas no tapan placas en móvil (QA H-06 y H-06b) · P3
- **AC-105** — Dado el juego en 844×390 y en 390×844 con una pista visible y un objetivo seleccionado, cuando se renderiza, entonces la caja de la pista **en ningún momento** se cruza con la placa propia ni con la del objetivo, esté donde esté el objetivo. Si fueran a cruzarse, la pista cambia de posición o se oculta mientras dure el cruce. Verificación: e2e (cajas del DOM) con el objetivo a 55–63 m al sur (el caso de H-06b) y a la misma distancia al norte.
- **AC-110** — Dados 390×844, 844×390 y 1440×900 con una pista y 1 o 2 avisos visibles a la vez, cuando se renderiza, entonces se cumplen tres cosas: la caja de la pista no se cruza con ningún aviso, ni (desde I2) con el botón Centrar o los indicadores de borde (si no hay ranura libre, la pista se oculta mientras duren esos elementos). En 390×844, el Centrar de D25 (322, 616, 52×52) cruza la ranura normal de la pista en 1 508 px²; los avisos no se cruzan con los paneles del jugador, del objetivo ni del oro, ni con el minimapa; y el texto de cada aviso se ve completo, sin recorte ni elipsis. Verificación: e2e (cajas del DOM y `scrollWidth ≤ clientWidth`) con la pista en las dos ranuras (QA H-11; QA lo llamó AC-105b).

### H-802 Zoom con pellizco · P1
- **AC-82** — Dado el juego en móvil, cuando el jugador pellizca, entonces el zoom pasa por los mismos 3 niveles que en escritorio. Verificación: e2e.

## E9 — Rendimiento y red (§13, §16) · P0, puerta desde H1

### H-901 React sin renders inútiles · P0
- **AC-83** — Dado un servidor de prueba sin NPC y un jugador quieto, cuando pasan 5 s sin entradas, entonces se cuentan **0 commits** de React. Verificación: perf (contador `onRender` del Profiler).
- **AC-84** — Dados NPC patrullando en pantalla y el jugador quieto, cuando pasan 10 s, entonces la media es ≤ 2 commits/s. Verificación: perf.
- **AC-85** — Dados 20 s de combate continuo, cuando se cuentan los commits, entonces la media es ≤ 10 commits/s. Verificación: perf.

### H-902 Cero tráfico en reposo · P0
- **AC-86** — Dado un cliente quieto, cuando pasan 10 s sin entradas, entonces emite **0 mensajes** de juego (el ping/pong de Engine.IO queda excluido). Verificación: perf (inspección de frames WebSocket).
- **AC-87** — Dado un servidor de prueba sin NPC con 2 jugadores quietos, cuando pasan 10 s, entonces cada cliente recibe **0 snapshots**. Verificación: perf.
- **AC-88** — Dado un servidor lleno (20 clientes sintéticos y 20 NPC) en combate, cuando se miden 30 s, entonces cada cliente recibe ≤ 10 mensajes/s y ≤ 12 KB/s de media. Verificación: Jest+socket.

### H-903 Presupuesto de render · P0
- **AC-89** — Dada la escena estándar (20 barcos, 20 NPC e islas en pantalla), cuando se lee `renderer.info`, entonces hay ≤ 100 draw calls y ≤ 250 000 triángulos. Verificación: perf.
- **AC-90** — Dado el portátil de referencia (GDD Q9) con Chrome a 1440×900, cuando se juegan 60 s de combate, entonces la media es ≥ 58 fps y el p95 del frame ≤ 20 ms. Verificación: manual (traza de Performance de Chrome adjunta).
- **AC-91** — Dada una sesión de 10 min **en régimen** en 1440×900 con carga continua, cuando se muestrea cada 60 s, entonces no hay deriva de recursos.
  - **Carga:** ≥ 40 ciclos de hundimiento y reaparición de NPC en pantalla **dentro de los 10 min medidos** (los del calentamiento no cuentan), con el barco propio atacando, recibiendo daño y reparando. Así se ejercitan VFX de daño, hundimientos, restos, placas y números. Política: repara al bajar del 45 % de vida y vuelve a atacar al pasar del 55 %. La banda cruza el 50 %, así que el humo propio entra y sale, y cada minuto tiene la misma mezcla de ataque y reparación.
  - **Veredicto según la carga:** la carga es el "dado" del AC. Está incompleta si en los 10 min medidos hay < 40 ciclos, 0 andanadas propias, 0 de daño recibido o 0 reparaciones. Los hundimientos propios no la invalidan: se registran. Con la carga incompleta, el AC **nunca es APROBADO**:
    - si todos los umbrales de deriva se cumplen, queda **NO VERIFICADO (carga insuficiente)**;
    - si alguno falla, es **RECHAZADO**, porque menos carga solo puede ocultar una fuga, no fabricarla. Por eso el harness evalúa siempre la deriva y avisa aparte de que falta carga;
    - si el calentamiento no termina en 5 min o falta `backingStorageSize`, no se llega a medir: **NO VERIFICADO**.
  - **Calentamiento:** antes del minuto 0, la carga corre hasta completar la primera reparación (≈ 2–2,5 min; si en 5 min no hay ninguna, la corrida no vale). Medido desde el 100 % de vida, el minuto 1 sería solo ataque y tendría menos commits que el último, que incluye reparación (la barra de vida cambia cada 0,5 s), y el cociente de commits fallaría en falso. Con el calentamiento, la corrida completa dura ~13 min.
  - **Muestreo:** 10 muestras, al final de cada minuto medido (1 a 10), tras forzar el GC por CDP (`HeapProfiler.collectGarbage`). La línea base es la muestra del minuto 1. "Minutos 1–5" son las muestras 1 a 5 y "minutos 5–10", las muestras 5 a 10: comparten la del minuto 5.

  | Métrica (fuente) | Umbral de deriva |
  |---|---|
  | **Memoria JS** = heap usado de V8 (`usedSize`) + memoria externa de los ArrayBuffer (`backingStorageSize`), los dos de `Runtime.getHeapUsage` | Sobre la suma: final − base ≤ 15 MB **y** pendiente ≤ 1 MB/min en los minutos 5–10, por **mínimos cuadrados** sobre sus 6 muestras (x = minuto real de cada muestra). Los dos componentes se registran por separado. Sin `backingStorageSize` la corrida no vale: los arrays tipados de geometría, partículas e interpolación viven fuera de `usedSize` (QA-6 H-19) |
  | Nodos DOM (`Performance.getMetrics` → `Nodes`) | Final ≤ base × 1,05 |
  | Escuchas de eventos JS (`JSEventListeners`) | Final ≤ base × 1,05 |
  | Geometrías y texturas (`renderer.info.memory`) | Máximo de los minutos 5–10 ≤ máximo de los minutos 1–5 + 2, cada una. Las texturas valen 0 por diseño (vertex colors sin mapas, ASSET-SPEC; sombras apagadas): se mantienen como **centinela** de la primera textura que se fugue, y QA las anota como "0 por construcción", no como prueba de que no hay fugas |
  | Commits de React por segundo (contador `onRender`) | Media de cada intervalo entre muestras: **≤ 10 en los 10 intervalos** (AC-85) **y** media de los intervalos 9 y 10 ≤ media de los intervalos 1 y 2 × 1,2. Con pares de intervalos, la mezcla de ataque y reparación de un minuto suelto no da un falso rojo (QA-6 §10.2) |

  Verificación: perf de **larga duración** (`npm run test:soak`, `e2e/endurance.spec.ts`), fuera de `npm run verify` porque dura ~13 min. Lo escribe dev-tests y game-qa lo ejecuta antes de cada aceptación, con las 10 muestras en el log. Solo vale la corrida de 10 min. El modo corto (`AC91_MINUTES=2`, ventanas de 12 s) sirve para validar el harness, y en él el cociente de commits solo se registra: el ruido de una ventana de 12 s (±25 %) es mayor que el 20 % que se mide.
- **AC-92** — Dado otro jugador navegando en línea recta sin pérdida de paquetes, cuando se muestrea su posición renderizada a 60 fps, entonces ningún salto entre frames consecutivos supera 1 m. Verificación: **unitario** sobre el interpolador de `src/client/game-client.ts`, con frames sintéticos a 10 Hz (llegada con *jitter* de ±20 ms) y muestreo cada 16,7 ms. *Justificación (plan de AC-108):* el salto por frame depende del interpolador y del ritmo de snapshots, no de la GPU. Con WebGL por software, un e2e mide la máquina (17,6 fps), no el código. Un e2e con GPU queda como comprobación opcional de QA.

## E13 — Vista libre (§5, §13) · P1 (I2)

### H-1301 Mover la vista sin romper "clic = navegar" · P1
- **AC-116** — Dado el juego en 1440×900 (ratón) y en 390×844 (un dedo), cuando el jugador pulsa en el agua y arrastra más de 12 px, entonces la vista se desplaza con el puntero y se envían **0** `moveTo`. Si suelta antes de 12 px, se envía exactamente 1 `moveTo` hacia ese punto, como hoy. Con dos dedos solo cambia el zoom (la vista no se desplaza) y la página no hace scroll (AC-81). Verificación: e2e (frames WebSocket y posición de la cámara), con toques reales por CDP en móvil.
- **AC-117** — Dado el minimapa, cuando el jugador hace clic o arrastra sobre él, entonces la vista se centra en el punto del mundo correspondiente (±5 m) y no se envía ningún `moveTo`. Verificación: e2e.
- **AC-118** — Dado el juego en escritorio, cuando el jugador mantiene una flecha pulsada durante 2 s, entonces la vista se desplaza 300 ±30 m en esa dirección. `S` sigue deteniendo el barco y no mueve la vista. Verificación: e2e.
- **AC-119** — Dada la vista libre, cuando ocurre cualquiera de estas cosas: `C` o el botón Centrar, daño al barco propio, muerte o reaparición, entonces la cámara vuelve al seguimiento en ≤ 300 ms y el barco queda en el 10 % central (AC-23). Verificación: e2e (un caso por disparador).
- **AC-120** — Dada la vista libre a 400 m del barco, cuando el jugador hace clic en el agua, entonces el barco navega hacia ese punto lejano (1 `moveTo` con esas coordenadas). Si hace clic en un barco visible, lo selecciona. El centro de la vista nunca sale de ±500 m, aunque se siga arrastrando. Verificación: e2e.
- **AC-121** — Dada la vista libre con el barco propio fuera de pantalla, cuando se renderiza, entonces un indicador en el borde apunta hacia el barco (error de ángulo ≤ 10°). Desaparece cuando el barco vuelve a verse. Verificación: e2e (caja y ángulo del indicador) + captura.
- **AC-122** — Dada la vista libre centrada sobre un sector pirata a más de 400 m del barco propio, cuando han pasado 500 ms desde que la vista se detuvo, entonces se dibujan todos los NPC que el servidor tiene dentro de la zona visible (mismo conjunto de ids). Nunca se ve mar vacío donde hay NPC. Verificación: e2e (ids dibujados frente a ids del servidor en esa zona).
- **AC-123** — Dada la vista libre quieta, cuando pasan 10 s sin entradas, entonces el cliente emite 0 mensajes. Mientras se arrastra, emite ≤ 2 `viewAt`/s, y al volver al seguimiento, 1 `viewAt(null)`. Con el servidor lleno y la vista libre en otra zona, cada cliente recibe ≤ 10 mensajes/s y ≤ 16 KB/s de media. Verificación: perf (frames) + Jest+socket (presupuesto con clientes sintéticos).

## E10 — Multijugador y PvP (§7, §13) · P1

### H-1001 PvP fuera de la zona segura · P1
- **AC-93** — Dados dos jugadores fuera de la zona segura y sin protección, cuando uno ataca al otro, entonces el ataque se acepta. Si cualquiera está en la zona o protegido, `attack` se rechaza, y si el objetivo entra en la zona, el ataque se cancela. Verificación: Jest+socket.
- **AC-94** — Dado un jugador con 500 de oro hundido por otro, cuando se hunde, entonces el atacante recibe 50 y la víctima queda con 450. Verificación: unitario.
- **AC-95** — Dados 2 contextos en combate PvP, cuando llega cada snapshot, entonces la vida del objetivo coincide en ambos HUD en ≤ 200 ms. Verificación: e2e.

### H-1002 Desconexión y reconexión · P1
- **AC-96** — Dado un jugador que pierde la conexión, cuando pasan ≤ 10 s, entonces su barco sigue en el mundo y se puede atacar. Si reconecta en ese tiempo, recupera el mismo barco con la misma vida. Verificación: Jest+socket.

## E11 — Persistencia (§13) · P1

### H-1101 Progreso por usuario de Clerk · P1
- **AC-97** — Dado un usuario de Clerk con 750 de oro, Cañones N2 y un Bergantín, cuando recarga la página, entonces recupera exactamente ese oro, mejoras y barcos. Un invitado vuelve a 100 de oro. Verificación: Jest+socket + e2e.

## E12 — Pantallas y flujo (§15) · P0

### H-1201 Entrada al juego · P0
- **AC-98** — Dado un usuario en la landing, cuando inicia sesión, entonces pasa por "Conectando" y está jugando en ≤ 5 s con el servidor local. Verificación: e2e.

### H-1202 Desconexión del servidor · P0
- **AC-99** — Dado un jugador en partida, cuando el servidor se cae, entonces aparece el overlay del estado "Desconectado" (título visible "Sin conexión", ART-DIRECTION §16.2) y se hacen 3 reintentos (1 s, 2 s y 4 s). Si el servidor vuelve, el jugador entra de nuevo sin recargar la página; si no, se muestran los botones "Reintentar" y "Salir". Verificación: e2e (parar y arrancar el servidor).
- **AC-126** — Dado el overlay "Sin conexión" tras los 3 reintentos, cuando el jugador pulsa "Salir", entonces **nunca** ve una página de error del navegador. El cliente **sondea** al servidor durante 2 s: lanza una petición nueva cada ≤ 250 ms **aunque las anteriores sigan sin respuesta**, cada una con el plazo que le quede hasta los 2 s, y ≤ 10 en total. Ni una conexión rechazada ni una colgada cortan el sondeo, y una respuesta lenta pero válida tampoco se corta. Se navega con la primera respuesta válida y al terminar no queda ninguna petición pendiente. Así cubre un redeploy de Railway, que tarda segundos. Si el servidor responde dentro de esos 2 s, navega a la landing; si no, se queda en el overlay con el mensaje "El servidor no responde. Vuelve a intentarlo en unos segundos" y "Reintentar" disponible. Verificación: e2e en dos casos (hallazgo DT-03). (a) Servidor parado todo el tiempo: el mensaje aparece a los 2,0 ±0,3 s del clic y no se navega. (b) Servidor que vuelve 1 s después del clic: navega a la landing en ≤ 2,5 s. (c) Servidor que acepta la conexión y no responde: ≥ 9 peticiones con huecos ≤ 250 ms entre inicios, el mensaje aparece a los 2,0 ±0,3 s y no queda ninguna petición pendiente. (d) Servidor colgado que vuelve a responder a los 800 ms del clic: navega en ≤ 1,5 s. (e) **Clics repetidos** (QA-6 H-16): pulsar "Salir" otra vez mientras sondea no lanza otro sondeo ni reinicia el que está en curso. Con 1, 2 o 3 clics separados 120 ms y el servidor parado: ≤ 10 peticiones en total y el mensaje a los 2,0 ±0,3 s del **primer** clic. Con el servidor que vuelve 1 s después del primer clic: una sola navegación a la landing.

---

## P2 / P3 (sin AC detallado todavía)

| Prioridad | Ítem | Nota |
|---|---|---|
| P2 | Munición especial "Cadena" | −30 % de la velocidad del objetivo durante 5 s; recarga +1 s |
| P2 | Sonido (cañón, impacto, salpicadura, hundimiento) | Efectos mínimos, con volumen y silencio |
| P2 | Navegar con un clic en el minimapa (piloto automático) | En I2 el minimapa solo mueve la vista (AC-117). Navegar desde él equivale al piloto automático de Seafight (REFERENCE §2) |
| P2 | Galeón del tesoro con escolta | Mercante raro y de alto valor escoltado por 2 piratas: momentos multijugador. Se decide después de medir I2 |
| P2 | Corsario rápido | Pirata frágil y más rápido que la Balandra, que ataca y huye. Se decide después de medir I2 |
| P2 | Varias salas y emparejamiento | Cuando 20 jugadores por sala no basten (GDD Q6) |
| P2 | Predicción del arranque del barco propio | Solo si las pruebas en Railway miden > 500 ms entre el clic y el movimiento visible (GDD §13) |
| P3 | Monstruos y arpones (GDD Q10) · abordaje · chat · ranking · XP, niveles y misiones · colisión entre barcos · viento | Fuera del slice (GDD §3) |
