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
- **Legibilidad visual**: los AC de E7 fijan *qué* se comunica. Los umbrales visuales (px, contraste, formas) los detalla `game-ux` en `ART-DIRECTION.md` y `VFX-SPEC.md`.

## Orden de ataque (Pareto)

| Hito | Épicas | Resultado jugable |
|---|---|---|
| H1 — Navegar y verse | E0, E1, E12, E9 (AC de red) | 2 jugadores navegan con clic en el mismo mar |
| H2 — Combate PvE | E2, E3, E4 (P0), E5 | Hundir piratas y mercantes, ganar oro, morir y reaparecer |
| H3 — Progresión y lectura | E6, E7, E8 | Mejorar en el puerto; HUD legible en escritorio y móvil |
| H4 — Excelencia | P1 de todas las épicas | PvP, persistencia, restos, minimapa, onboarding |

Los AC de rendimiento de E9 son una **puerta desde H1**: se mantienen en verde en cada hito, no se dejan para el final.

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

### H-103 Cámara y zoom (§5) · P0
- **AC-23** — Dado el barco navegando, cuando se muestrean 10 frames, entonces la proyección en pantalla del barco propio está siempre dentro del 10 % central. Verificación: e2e.
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

## E3 — NPC · P0 (jefe en P2)

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
- **AC-51** — Dado un servidor recién arrancado, cuando se inspecciona el mundo, entonces hay 12 piratas (3 por sector) y 8 mercantes en sus zonas. Verificación: unitario.
- **AC-52** — Dado un NPC hundido, cuando pasan 30 s (pirata) o 20 s (mercante) ±1 tick, entonces reaparece en su zona, a ≥ 100 m de cualquier jugador y fuera de las islas. Verificación: unitario.

### H-304 Balance de duelos (§9) · P0
- **AC-53** — Dados 1 000 duelos con semilla sin reparar, cuando una Balandra N1 se enfrenta a un pirata, entonces la mediana del tiempo hasta hundirlo está en 18–24 s y la vida perdida en 25–40 %. Contra un mercante, 10–14 s. Verificación: unitario. *Referencia: la simulación de `game-product` con las tablas del GDD da 20,5 s / 30 % y 12,5 s.*

### H-305 Capitán pirata (§9) · P2
- **AC-54** — Dados 10 piratas hundidos desde la última muerte del capitán, cuando se hunde el 10.º, entonces aparece 1 capitán en un sector pirata, y nunca hay 2 vivos. Verificación: unitario.
- **AC-55** — Dados 1 000 duelos, cuando una Fragata con todo a N3 se enfrenta al capitán, entonces la mediana está en 12–20 s con 10–25 % de vida perdida. Una Balandra N1 pierde en ≥ 95 % de los duelos. Verificación: unitario. *Referencia: 15,5 s / 15 %; la Balandra pierde el 100 %.*

## E4 — Botín y economía

### H-401 Recompensa en oro (§10) · P0
- **AC-56** — Dado un pirata dañado un 60 % por A y un 40 % por B, cuando se hunde, entonces A recibe 63 de oro y B 42 (suma 105), acreditados una sola vez. Verificación: unitario.
- **AC-57** — Dado un pirata (105 de oro) dañado a partes iguales por A y B, con A dañando primero, cuando se hunde, entonces A recibe 53 y B 52: el resto de 1 va a A por el desempate de quien dañó primero. Verificación: unitario.
- **AC-58** — Dado un hundimiento con recompensa, cuando llega el snapshot, entonces el HUD muestra "+N oro" y el contador actualizado en ≤ 200 ms. Verificación: e2e.

### H-402 Restos flotantes (§10) · P1
- **AC-59** — Dado un NPC hundido, cuando se hunde, entonces aparece una caja en su posición. El primer jugador a ≤ 8 m la recoge (+25 de un pirata, +15 de un mercante); si dos llegan en el mismo tick, la recoge el más cercano. A los 30 s desaparece. Verificación: unitario + captura.

### H-403 Curva económica (§10) · P1
- **AC-60** — Dado un bot con una Balandra N1 y 100 de oro que ataca al NPC más cercano, repara por debajo del 40 % de vida y sigue la estrategia **"barco primero"** (no compra nada hasta poder pagar el Bergantín; lo compra y, a partir de ahí, compra siempre el artículo más barato disponible, Fragata incluida), cuando juega en la simulación acelerada con las semillas fijas 1–5, entonces la **mediana de las 5 semillas** cumple tres cosas: acumula ≥ 500 de oro en ≤ 4 min, compra el Bergantín en ≤ 20 min y lo tiene todo comprado (12 800 de oro) en 45–70 min simulados. Verificación: unitario.

## E5 — Muerte y reaparición (§12) · P0

### H-501 Hundimiento y reaparición · P0
- **AC-61** — Dado un barco con vida ≤ 0, cuando pasa ese tick, entonces entra en Hundiéndose durante 3 s, no se puede seleccionar y todos los ataques contra él terminan. Verificación: unitario.
- **AC-62** — Dado un jugador con 455 de oro que es hundido, cuando ve la pantalla de muerte, entonces esta muestra quién lo hundió, "−45 oro" y una cuenta atrás de 8 s. El botón Zarpar está desactivado hasta que la cuenta llega a 0. Verificación: e2e + captura.
- **AC-63** — Dado un jugador muerto con la cuenta atrás terminada, cuando pulsa Zarpar, entonces reaparece en el anillo de 60–90 m del puerto, con el 100 % de la vida y la misma clase y mejoras. Verificación: unitario + e2e.
- **AC-64** — Dado un jugador recién reaparecido, cuando pasan 15 s o él ataca (lo que ocurra primero), entonces pierde la protección. Mientras la tiene, ningún pirata lo elige, los ataques de jugadores se rechazan y se ve el indicador. Verificación: unitario + captura.

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
- **AC-91** — Dados 10 min con ciclos de hundimiento y reaparición de NPC, cuando se mide al inicio y al final, entonces el heap del cliente crece ≤ 15 MB y `renderer.info.memory` (geometrías y texturas) no crece de forma monótona. Verificación: perf.
- **AC-92** — Dado otro jugador navegando en línea recta sin pérdida de paquetes, cuando se muestrea su posición renderizada a 60 fps, entonces ningún salto entre frames consecutivos supera 1 m. Verificación: e2e.

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
| P2 | Capitán pirata | Sus AC ya están definidos (AC-54, AC-55) |
| P2 | Munición especial "Cadena" | −30 % de la velocidad del objetivo durante 5 s; recarga +1 s |
| P2 | Sonido (cañón, impacto, salpicadura, hundimiento) | Efectos mínimos, con volumen y silencio |
| P2 | Clic en el minimapa para navegar | Equivale al piloto automático de Seafight (REFERENCE §2) |
| P2 | Varias salas y emparejamiento | Cuando 20 jugadores por sala no basten (GDD Q6) |
| P2 | Predicción del arranque del barco propio | Solo si las pruebas en Railway miden > 500 ms entre el clic y el movimiento visible (GDD §13) |
| P3 | Monstruos y arpones · abordaje · chat · ranking · XP, niveles y misiones · colisión entre barcos · viento | Fuera del slice (GDD §3) |
