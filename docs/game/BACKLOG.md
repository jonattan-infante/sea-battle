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
| # | Qué | Por qué en este puesto | Responsable |
|---|---|---|---|
| **1** | AC-104, lectura del daño | VFX 6/10, la nota más baja; ya está en curso | game-ux (Q16) → dev-render |
| **1** (en paralelo) | AC-108, bloque 1 (bucle principal) | Blindar el bucle con tests **antes** de tocar combate e IA (lección de H-01) | lead |
| 2 | H-305 Capitán pirata | NPC 7/10: reto de grupo y de final de progresión. Reutiliza la IA del pirata y `killsSinceBoss` | lead (IA, avisos) + game-ux → dev-render (arte) |
| 3 | E13 Vista libre | Cámara 8/10: Seafight deja mover la carta | lead (entrada y red) + dev-render (cámara) |
| 4 | H-306 Cañonera pirata | NPC: segundo hostil, con un comportamiento distinto (mantener la distancia) | lead + game-ux → dev-render |
| 5 | Escala y detalle de los barcos | Barcos 7/10. Depende de la propuesta de game-ux y choca con AC-24 (decide game-product) | game-ux → game-product |
| 6 | AC-108 bloques 2 y 3, H-11 (AC-110), portada | Calidad y pulido | lead / dev-render |

Los AC de rendimiento de E9 son una **puerta desde H1**: se mantienen en verde en cada hito, no se dejan para el final.

## Triaje de QA

Reportes (el último manda):
| Reporte | SHA | Veredicto | Resultado |
|---|---|---|---|
| [`QA-REPORT-2026-10-11.md`](./qa/QA-REPORT-2026-10-11.md) | `614ae0d` | RECHAZADO | P0 H-01 |
| [`QA-REPORT-2026-10-11-2.md`](./qa/QA-REPORT-2026-10-11-2.md) | `c631272` + `9b4bda3` | APROBADO CON OBSERVACIONES | 91 A · 1 R · 6 NV |
| [`QA-REPORT-2026-10-11-3.md`](./qa/QA-REPORT-2026-10-11-3.md) | `190d3cb` | **APROBADO CON OBSERVACIONES** | **98 A · 2 R (AC-97 conocido, AC-108) · 5 NV · AC-104 sin evaluar. No queda ningún P0 abierto** |

### Hallazgos
| Hallazgo | Sev. | Qué pasa | AC | Responsable | Estado |
|---|---|---|---|---|---|
| H-01 | P0 | "Zarpar" no enviaba `respawn` | AC-63, AC-101 | lead | **Cerrado** (QA-2 y QA-3: clic, Enter y toque dan exactamente 1 `respawn`) |
| H-02 | P1 | El casco entraba en las islas | AC-20, AC-21 | — | **Cerrado** (QA-2) |
| H-03 | P1 | Velas invisibles de proa y de popa | AC-102 | game-ux → dev-render | **Cerrado** (QA-3: ratio mínimo 0,282 en la Balandra; `sail-visibility.spec.ts:18`) |
| H-04 | P2 | Decorado fuera del colisionador | AC-103 | dev-render | **Cerrado** (QA-3: 0 vértices fuera de r + 0,5 m) |
| H-05 | P2 | Humo y fuego de vida baja casi invisibles | AC-104 | game-ux (Q16, D20 + D21) → dev-render | **Sin evaluar.** VFX-09b falla por un orden de magnitud |
| H-06 / H-06b | P2 / P3 | La pista tapaba las placas propia y del objetivo en móvil | AC-105 | lead | **Cerrado** (QA-3: 0 px² en 10 posiciones; `gameplay.spec.ts:230`) |
| H-07 | P3 | Tarjeta de muerte en 3 líneas | AC-106 | lead | **Cerrado** |
| H-08 | P3 | La recarga pisaba placas vecinas | AC-107 | dev-render | **Cerrado** (QA-3: 20/20 muestras, 0 px²) |
| H-09 | P1 | Huecos del harness | AC-108 | lead / dev-render | **Cerrado en lo que listaba.** Lo que queda de cobertura está en el plan de AC-108 |
| H-10 | P2 | Carrera de relojes: el primer `respawn` al activarse Zarpar podía rechazarse (QA-2 §7) | **AC-109** (QA lo llamó AC-101b) | lead | **Cerrado** (QA-3: 20/20 con el reloj adelantado 50 ms; tolerancia de 2 ticks, `constants.ts:196`) |
| H-11 | P3 | En móvil, los avisos tapan la pista en la ranura `is-alt`. En 844×390 además pisan ~22 px de los paneles del jugador y del objetivo (eso ya pasaba en `614ae0d`) | **AC-110** (QA lo llamó AC-105b) | lead | Pendiente. El arreglo: la pista trata los avisos visibles como obstáculo y se oculta si no hay ninguna ranura libre; en horizontal, los avisos se estrechan para caber entre las dos columnas del HUD |

### Plan de AC-108 (RECHAZADO en QA-3 §7: 15 AC P0 sin test y 7 parciales)
**Criterio:**
- Ninguno pasa a "basta un Jest que ya existe": hoy no hay ningún test unitario de lógica de cliente (`hud-logic.ts`, `game-client.ts`), y todos estos AC tienen su observable en el cliente.
- Los AC de **entrada del jugador** se quedan en e2e por la lección de H-01: el fallo estaba en el cableado del cliente, no en el servidor.
- Solo cambian de método AC-92 y AC-91, cada uno con su justificación en el propio AC.

**Bloque 1: bucle principal (seleccionar → atacar → hundir → oro → mejorar → morir). Hacer primero.**
| AC | Estado en QA-3 | Qué tiene que asertar el test | Tipo | Responsable |
|---|---|---|---|---|
| AC-31 | Sin test | "Fuera de alcance" en el panel, 0 andanadas, y el disparo sin una entrada nueva al entrar en alcance | e2e | lead |
| AC-37 | Sin test | Espacio con ataque activo → 1 `cancelAttack` y la selección sigue | e2e | lead |
| AC-17 | Sin test | Clic en el agua mientras ataca → `moveTo`, 0 `cancelAttack`, y la selección y el ataque siguen activos | e2e | lead |
| AC-27 | Sin test | Orden del ciclo de Tab (40 → 90 → 140 → 40) y 0 frames | e2e | lead |
| AC-28 | Sin test | Esc 1 → `cancelAttack` y la selección sigue; Esc 2 → deselecciona; 0 frames en la 2.ª | e2e | lead |
| AC-62 | Parcial | Añadir "por <nombre>" y "−N oro" exactos (10 % del oro) en la tarjeta | e2e | lead |
| AC-58 | Parcial | Añadir el límite: DOM actualizado ≤ 200 ms después del evento `loot` | e2e | lead |
| AC-67 | Sin test | Comprar Cañones N2 por la UI (escenario `shipyard`): oro −500 y alcance 70 / recarga 3,5. Botón desactivado con oro insuficiente, que es el patrón de `disabled` de H-01 | e2e | lead |
| AC-66 | Parcial | Botón Puerto desactivado fuera de la zona, con su explicación | e2e | lead |
| AC-85 | Sin test | ≤ 10 commits/s en 20 s de combate (contador `onRender`) | perf | lead |

**Bloque 2: móvil y robustez**
| AC | Estado en QA-3 | Qué tiene que asertar el test | Tipo | Responsable |
|---|---|---|---|---|
| AC-29 | Sin test | En 390×844, un toque a ≤ 24 px de la silueta selecciona, sin red | e2e | lead |
| AC-80 | Parcial | Añadir 844×390: tamaños de los botones y 0 solapes | e2e | lead |
| AC-41 | Sin test | Clase de pulso del botón Reparar con vida < 30 % y sin ella con vida ≥ 30 % | e2e | lead |
| AC-19 | Sin test | `S` → 1 `stop` y velocidad 0 (añadirlo al e2e de AC-14, que ya pulsa S sin asertarlo) | e2e | lead |
| AC-65 | Parcial | Añadir que el aviso desaparece al salir de la zona | e2e | lead |
| AC-99 | Sin test | Parar el servidor → overlay y 3 reintentos (1, 2 y 4 s) → reconexión sin recargar; sin servidor → "Reintentar" / "Salir" | e2e | lead |
| AC-75 | Parcial | Una salpicadura por bala fallada (contadores de dev-render) y caso negativo: un tercer jugador que no es tirador ni objetivo no ve "Fallo" | e2e | lead + dev-render (en curso) |

**Bloque 3: cámara, render e infraestructura**
| AC | Estado en QA-3 | Qué tiene que asertar el test | Tipo | Responsable |
|---|---|---|---|---|
| AC-23 | Sin test | Proyección del barco propio en el 10 % central en 10 frames navegando | e2e | dev-render |
| AC-25 | Sin test | La rueda da exactamente {0,7; 1,0; 1,5} y `scrollY` sigue en 0 | e2e | dev-render |
| AC-92 | Sin test | **Cambia a unitario** (ver el AC): interpolador con frames sintéticos | unitario | lead |
| AC-91 | Sin test | **Corrida larga de perf** de 10 min, fuera de `verify` (ver el AC) | perf (larga) | dev-render (harness); game-qa la ejecuta |
| AC-12 | Parcial | Un 21.º jugador real (20 sockets de invitado + 1 navegador) → landing con "Servidor lleno" (`GameApp.tsx:209`) | e2e | lead |

### AC sin veredicto final
| AC | Motivo | Responsable | Estado |
|---|---|---|---|
| AC-72 | Exige 5 evaluadores humanos | game-qa + Jonattan | Hay que organizar la prueba de 5 s |
| AC-75 | Parcial | lead + dev-render | En curso (plan de AC-108, bloque 2) |
| AC-90 | Manual en el portátil de referencia | game-qa | Bloqueado por GDD Q9 (Jonattan) |
| AC-91, AC-92 | Cambian de método | dev-render / lead | Plan de AC-108, bloque 3 |
| AC-104 | Depende de D20 + D21 | game-ux (Q16) → dev-render | Sin evaluar |
| AC-110 | Nuevo (H-11) | lead | Pendiente |

### Ya conocidos (fuera de este triaje)
- Persistencia (AC-97): RECHAZADO porque no está implementada. Depende de GDD Q2 (Jonattan).

### Decisiones de producto sobre observaciones de QA
- Pellizco largo (AC-82): saltar 2 niveles en un gesto es aceptable.
- Espacio o Enter estando hundido equivalen a "Zarpar", solo con la cuenta atrás terminada (GDD §5 y §12, AC-101).
- Tolerancia de reloj en Zarpar (H-10): se **acepta** que el servidor admita el `respawn` hasta 2 ticks (100 ms) antes de que termine la cuenta. El jugador no lo percibe y elimina el rechazo del primer clic (GDD §12, AC-109).
- Prioridad entre aviso y pista (H-11): manda el **aviso**, que es información del servidor y dura poco. La pista, que solo sale en la primera sesión, cede: se recoloca o se oculta.

---

## E0 — Fundación técnica · P0

### H-001 Simulación pura y determinista (§13, §16) · P0
- **AC-01** — Dado el módulo de simulación, cuando se analizan sus imports, entonces no incluye `react`, `three` ni `@react-three/*`. Verificación: unitario.
- **AC-02** — Dada una semilla y una secuencia fija de intenciones, cuando se ejecutan 1 200 ticks dos veces, entonces el estado final serializado es idéntico. Verificación: unitario.
- **AC-03** — Dado un mundo con 20 jugadores con intenciones aleatorias, 20 NPC y el jefe, cuando se miden 2 000 ticks, entonces el p99 del tick es ≤ 4 ms en Node 20. Verificación: unitario.
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
- **AC-22** — Dados 1 000 cálculos de ruta aleatorios, cuando se miden, entonces el p99 es ≤ 2 ms. Verificación: unitario.

### H-104 El decorado de las islas no sale del colisionador (QA H-04) · P2
- **AC-103** — Dado `buildIslands(ISLANDS)`, cuando se recorren los vértices con y > 0 de muelles, rocas y palmeras, entonces ninguno queda a más de r + 0,5 m del centro de su isla en XZ. Lo que parece sólido es sólido. Verificación: unitario (ampliar `assets.test.ts`).

### H-103 Cámara y zoom (§5) · P0
- **AC-23** — Dado el barco navegando **en modo seguimiento**, cuando se muestrean 10 frames, entonces la proyección en pantalla del barco propio está siempre dentro del 10 % central. Verificación: e2e.
- **AC-24** — Dado el zoom por defecto, cuando se dibuja el círculo de 80 m alrededor del barco, entonces cabe entero en 1440×900 y en 390×844. Verificación: captura.
- **AC-25** — Dado el juego en escritorio, cuando se gira la rueda del ratón, entonces el zoom pasa por exactamente 3 niveles (0,7×, 1,0× y 1,5×) y la página no hace scroll. Verificación: e2e.

## E2 — Combate · P0

### H-201 Seleccionar objetivo (§5) · P0
- **AC-26** — Dado un pirata en pantalla, cuando el jugador hace clic sobre él, entonces aparecen el anillo de selección y el panel con nombre, tipo, vida y distancia, y el cliente **no emite ningún mensaje** de red. Verificación: e2e (conteo de frames WebSocket).
- **AC-27** — Dados NPC atacables a 40, 90, 140 y 170 m, cuando se pulsa `Tab` 4 veces, entonces la selección recorre 40 → 90 → 140 → 40 m (el de 170 m queda fuera del radio de 150 m). Verificación: e2e.
- **AC-28** — Dado un objetivo seleccionado y atacado, cuando se pulsa `Esc` dos veces, entonces la 1.ª pulsación cancela el ataque (la selección sigue) y la 2.ª deselecciona. Verificación: e2e.
- **AC-29** — Dado el juego en 390×844, cuando el jugador toca a ≤ 24 px CSS de la silueta de un barco, entonces ese barco queda seleccionado. Verificación: e2e (emulación móvil).

### H-202 Ataque persistente con andanadas (§7) · P0
- **AC-30** — Dado un objetivo a tiro con el cañón cargado, cuando el jugador pulsa `Espacio`, entonces la primera andanada sale en el siguiente tick (≤ 50 ms de servidor) y las siguientes cada 4,0 s ±1 tick sin más entradas. Verificación: unitario.
- **AC-31** — Dado un objetivo fuera de alcance, cuando el jugador pulsa `Espacio`, entonces no hay disparos y el HUD muestra "Fuera de alcance". Cuando el objetivo entra en alcance, dispara sin una entrada nueva. Verificación: unitario + e2e.
- **AC-32** — Dadas 10 000 andanadas con semilla para cada combinación de clase y nivel de cañón, cuando se promedia el daño, entonces es igual a cañones × daño × precisión ±2 %. Verificación: unitario.
- **AC-33** — Dado un disparo a una distancia d, cuando se resuelve, entonces el daño se aplica a los d/120 s ±1 tick, y no se aplica si el objetivo se hundió antes. Verificación: unitario.
- **AC-34** — Dado un ataque activo, cuando ocurre cualquiera de estas condiciones: cancelar, objetivo hundido, objetivo a más de 200 m, muerte del atacante o inicio de una reparación, entonces el ataque termina en ese mismo tick. Verificación: unitario (un caso por condición).
- **AC-35** — Dados un atacante, un tercer barco entre ambos y el objetivo, alineados, cuando el atacante dispara 100 andanadas, entonces solo el objetivo pierde vida. Verificación: unitario.
- **AC-36** — Dado un ataque activo, cuando el jugador navega, entonces el ataque sigue activo y dispara siempre que el objetivo esté a tiro. Verificación: unitario.
- **AC-37** — Dado un ataque activo contra el objetivo seleccionado, cuando se pulsa `Espacio` otra vez, entonces el ataque se cancela. Verificación: e2e.

### H-203 Reparar (§8) · P0
- **AC-38** — Dada una Balandra al 50 % de vida navegando, cuando pulsa `R`, entonces frena, empieza a reparar al bajar de 1 m/s y sube +16 HP cada 0,5 s hasta 800, donde la reparación termina sola. Verificación: unitario.
- **AC-39** — Dado un barco reparando, cuando recibe daño, entonces durante los 3 s siguientes repara al 1,5 %/s y después vuelve al 4 %/s. Verificación: unitario.
- **AC-40** — Dado un barco reparando, cuando recibe `moveTo` o `attack`, entonces la reparación se cancela. Dado un barco atacando, cuando empieza a reparar, entonces el ataque se cancela. Verificación: unitario.
- **AC-41** — Dada una vida < 30 %, cuando se renderiza el HUD, entonces el botón Reparar pulsa. Con vida ≥ 30 %, no pulsa. Verificación: e2e (estado del botón) + captura.

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
- **AC-51** — Dado un servidor recién arrancado, cuando se inspecciona el mundo, entonces hay 8 piratas (2 por sector), 4 cañoneras (1 por sector, en el anillo de 400–470 m) y 8 mercantes en sus zonas. Antes de I2 eran 12 piratas (3 por sector). Verificación: unitario.
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
- **AC-60** — Dado un bot con una Balandra N1 y 100 de oro que ataca al NPC más cercano, repara por debajo del 40 % de vida y sigue la estrategia **"barco primero"** (no compra nada hasta poder pagar el Bergantín; lo compra y, a partir de ahí, compra siempre el artículo más barato disponible, Fragata incluida), **no ataca al Capitán pirata, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto**, cuando juega en la simulación acelerada con las semillas fijas 1–5 y la población de I2, entonces la **mediana de las 5 semillas** cumple tres cosas: acumula ≥ 500 de oro en ≤ 4 min, compra el Bergantín en ≤ 20 min y lo tiene todo comprado (12 800 de oro) en 45–70 min simulados. Verificación: unitario.

## E5 — Muerte y reaparición (§12) · P0

### H-501 Hundimiento y reaparición · P0
- **AC-61** — Dado un barco con vida ≤ 0, cuando pasa ese tick, entonces entra en Hundiéndose durante 3 s, no se puede seleccionar y todos los ataques contra él terminan. Verificación: unitario.
- **AC-62** — Dado un jugador con 455 de oro que es hundido, cuando ve la pantalla de muerte, entonces esta muestra quién lo hundió, "−45 oro" y una cuenta atrás de 8 s. El botón Zarpar está desactivado hasta que la cuenta llega a 0. Verificación: e2e + captura.
- **AC-63** — Dado un jugador muerto con la cuenta atrás terminada, cuando pulsa Zarpar, entonces reaparece en el anillo de 60–90 m del puerto, con el 100 % de la vida y la misma clase y mejoras. Verificación: unitario + e2e con **clic real** en Zarpar (llamar a `respawn()` directamente no cuenta; QA H-01).
- **AC-101** — Dado un jugador hundido con la cuenta atrás en 0, cuando hace clic en Zarpar, lo toca (móvil) o pulsa Enter o Espacio, entonces el cliente emite **exactamente 1** intención `respawn` y en ≤ 1 s el barco propio existe con el 100 % de la vida. Verificación: e2e con interacción real en 1440×900 y 390×844 (QA H-01).
- **AC-109** — Dado un jugador hundido, cuando el cliente envía `respawn` en el mismo frame en que Zarpar se activa, con su reloj adelantado hasta 50 ms respecto al servidor, entonces el servidor lo acepta en 20 de 20 corridas y no llega ningún aviso "Aún no puedes zarpar". Verificación: Jest+socket con reloj inyectable + e2e con el clic en la mutación que habilita el botón (QA H-10; QA lo llamó AC-101b).
- **AC-64** — Dado un jugador recién reaparecido, cuando pasan 15 s o él ataca (lo que ocurra primero), entonces pierde la protección. Mientras la tiene, ningún pirata lo elige, los ataques de jugadores se rechazan y se ve el indicador. Verificación: unitario + captura.

### H-502 Tarjeta de muerte en una línea (QA H-07) · P3
- **AC-106** — Dada la tarjeta de muerte en 1440×900 y en 390×844, cuando se mide la línea "por <icono> <nombre>", entonces ocupa 1 sola línea (alto ≤ 24 px). Verificación: e2e (caja del DOM) + captura.

## E6 — Puerto y mejoras (§11)

### H-601 Zona segura · P0
- **AC-65** — Dado un barco que cruza el círculo de 110 m, cuando entra o sale, entonces el aviso "Zona segura" aparece o desaparece en el mismo snapshot, y el borde de la zona se ve en el mundo. Verificación: e2e + captura.

### H-602 Tienda de mejoras · P0
- **AC-66** — Dado el barco dentro de la zona segura, cuando se renderiza el HUD, entonces el botón Puerto está activo. Fuera de la zona está desactivado y explica por qué. Verificación: e2e.
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
- **AC-75** — Dada una andanada con k impactos, cuando llega la primera bala que acierta, entonces aparece **un único** número igual a k × daño, y cada bala fallada deja una salpicadura. Con k = 0 aparece "Fallo", pero solo si el tirador o el objetivo es el jugador propio. Todo debe leerse con el zoom por defecto. Verificación: captura + e2e (se cuenta un número por cada evento de andanada).
- **AC-76** — Dados dos barcos separados por al menos el umbral que defina `game-ux`, cuando se captura, entonces sus etiquetas de nombre y vida no se solapan. Verificación: captura.

### H-705 Velas legibles con cualquier rumbo (QA H-03) · P1
- **AC-102** — Dada cada clase P0 (Balandra, Bergantín, Fragata, Pirata y Mercante), cuando `measureSails()` recorre los rumbos de 0 a 345° con zoom 0,7× en 1440×900, entonces cumple AS-V14 (ASSET-SPEC §8.3): ratio ≥ 0,25 en todos los rumbos. Verificación: perf automatizado (un harness nuevo que llama a `measureSails()`).

### H-706 Daño legible de un vistazo (QA H-05) · P2
- **AC-104** — Dado un barco con ≤ 25 % de vida, cuando se captura con zoom 1,0× en 1440×900 y en 390×844, entonces el humo y el fuego ocupan al menos el área mínima que fije `game-ux` en VFX-09 y se distinguen en la captura en escala de grises. Verificación: captura. *Depende de la cifra de VFX-09.*

### H-707 El indicador de recarga no tapa placas ajenas (QA H-08) · P3
- **AC-107** — Dados barcos vecinos en combate en la escena estándar, cuando se dibuja el indicador de recarga propio (18 px), entonces no se cruza con ninguna placa ajena: el *declutter* (AD-11) incluye el indicador en la caja de la placa propia. Verificación: e2e (cajas) + captura.

### H-708 Los NPC de I2 se distinguen de un vistazo · P1 (I2)
- **AC-115** — Dadas capturas de escritorio y móvil (1,0×) con un pirata, una cañonera, el capitán, un mercante y otro jugador, cuando 5 evaluadores las miran durante 5 s, entonces ≥ 4 de 5 identifican los 5 tipos, también en escala de grises. En el minimapa, los 6 tipos (propio, jugador, pirata, cañonera, mercante y capitán) tienen formas distintas, no solo color. Verificación: captura + prueba con evaluadores (umbrales en ART-DIRECTION).

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
- **AC-110** — Dados 390×844, 844×390 y 1440×900 con una pista y 1 o 2 avisos visibles a la vez, cuando se renderiza, entonces se cumplen tres cosas: la caja de la pista no se cruza con ningún aviso (si no hay ranura libre, la pista se oculta mientras duren los avisos); los avisos no se cruzan con los paneles del jugador, del objetivo ni del oro, ni con el minimapa; y el texto de cada aviso se ve completo, sin recorte ni elipsis. Verificación: e2e (cajas del DOM y `scrollWidth ≤ clientWidth`) con la pista en las dos ranuras (QA H-11; QA lo llamó AC-105b).

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
- **AC-91** — Dados 10 min con ciclos de hundimiento y reaparición de NPC, cuando se mide al inicio y al final, entonces el heap del cliente crece ≤ 15 MB y `renderer.info.memory` (geometrías y texturas) no crece de forma monótona. Verificación: perf de **larga duración**, en un harness aparte fuera de `npm run verify` porque dura 10 min, que game-qa ejecuta antes de cada aceptación (plan de AC-108).
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
- **AC-99** — Dado un jugador en partida, cuando el servidor se cae, entonces aparece el overlay "Desconectado" y se hacen 3 reintentos (1 s, 2 s y 4 s). Si el servidor vuelve, el jugador entra de nuevo sin recargar la página; si no, se muestran los botones "Reintentar" y "Salir". Verificación: e2e (parar y arrancar el servidor).

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
