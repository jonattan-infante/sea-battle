# Sea Battle — Game Design Document (vertical slice)

> Autor: `game-product` · Versión 1.1 · 2026-10-17 (la 1.0 es del 2026-10-10) · Referente: [`REFERENCE-SEAFIGHT.md`](./REFERENCE-SEAFIGHT.md)
> Los números de este documento son la **fuente única de verdad** del juego. Deben vivir en un único módulo de constantes de la simulación, de modo que cambiar el balance no exija tocar la lógica.
> **«(1.1)»** marca lo que entra en la versión 1.1.0 (BACKLOG, «Release 1.1.0»). Lo que no lo lleva ya está en la 1.0.2, salvo lo marcado «I2», que también entra en la 1.1.0 (Q12).
> **Citas de código:** salvo que digan otra cosa, las `ruta:línea` de `src/` y `server/` son del código de la 1.0.2 (tag `v1.0.2`), y las de `sea-battle-i2/`, de la rama I2. El desarrollo de la 1.1 mueve esas líneas; donde importa, la cita dice también la línea en la 1.0.3.

## 0. Resumen

**Sea Battle es "Seafight en 10 minutos"**: navegas con un clic, marcas un barco, pulsas una tecla y tu barco dispara andanadas solo hasta hundirlo; recoges el oro y la experiencia, y en el puerto conviertes el oro en mejores cañones, casco, velas y barcos.
- **Un mundo de 1 000 × 1 000 m**, con un puerto de verdad en el centro (muelles y 12 amarres, 1.1), 12 islas y un campo de 3 escollos, de 4 arquetipos (1.1), 8 piratas y 4 cañoneras hostiles (I2), 8 mercantes pasivos, un Capitán pirata que aparece como jefe (I2) y un Galeón del tesoro con escolta (1.1, P2), para **20 jugadores** por servidor.
- **Progresión con oro en unos 45–70 min**: 3 clases de barco y 3 ejes de mejora con 3 niveles cada uno. La 1.1 añade 2 clases (Goleta y Navío de línea) para después de esa progresión.
- **Experiencia (1.1)**: hundir NPC y jugadores da XP; 20 niveles en 5 insignias, unas 6–7 h hasta el máximo contra NPC (§10b).
- **Calidad antes que cantidad**: una sola munición. No hay perlas, monstruos ni abordaje.

---

## 1. Visión y pilares

| Pilar | Qué significa | Cómo se mide |
|---|---|---|
| **P1. Un clic, una intención** | Cada acción del jugador es un clic, un toque o una tecla. El barco ejecuta la intención solo: navega, persiste en el ataque, repara. | El bucle se juega solo con clic + Espacio + R (escritorio) o con toques + 2 botones (móvil) |
| **P2. Legible de un vistazo** | En menos de 1 s sabes cuál es tu barco, quién es hostil, a quién apuntas, si está a tu alcance y cuánta vida te queda. | Prueba de 5 s con capturas (BACKLOG E7) |
| **P3. Combate de posición** | Se gana por distancia, alcance, tiempo de recarga y cuándo reparar, no por reflejos. | El jugador con mejor alcance gana sin recibir daño si mantiene la distancia (*kiting*) |
| **P4. Fluido y barato** | 60 fps en un portátil común y ningún tráfico de red ni render de React cuando no pasa nada. | AC de rendimiento (BACKLOG E9) |

## 2. Bucle principal

```
        ┌────────────────────────────────────────────────────────────┐
        ▼                                                            │
  [Zarpar del puerto] ─► [Navegar: clic] ─► [Encontrar objetivo]     │
                                                │                    │
                                     clic/Tab   ▼                    │
                                       [Seleccionar] ─► [Atacar: Espacio]
                                                              │      │
                       vida baja ◄────────── andanadas c/ recarga    │
                           │                                  │      │
                    [Reparar: R]                         [Hundir]    │
                           │                                  ▼      │
                           └──────────► [Oro (+restos P1) + XP (1.1)] ─► [Puerto: mejorar] ─┘
```

- **Microbucle (≈20 s)**: seleccionar → atacar → ajustar la posición → hundir.
- **Bucle medio (≈3 min)**: 3–4 hundimientos → reparar → primera mejora (y el nivel 2, 1.1).
- **Macrobucle (≈45–70 min)**: Balandra → Bergantín → Fragata, con todas las mejoras.
- **Bucle largo (1.1, ≈1–7 h)**: Goleta y Navío de línea (§6) e insignias de Teniente y Almirante (§10b).

## 3. Alcance

### Dentro (vertical slice)
| Área | Contenido |
|---|---|
| Mundo | 1 mapa, 1 puerto con zona segura, 6 islas, límites duros. **1.1:** el puerto pasa a tener muelles y 12 amarres, y el mapa, 12 islas y un campo de 3 escollos, de 4 arquetipos, más el puerto (§4) |
| Barcos del jugador | 3 clases: Balandra, Bergantín y Fragata. **1.1:** 5, con la Goleta y el Navío de línea (§6) |
| Combate | Selección, ataque persistente con andanadas, alcance, recarga, precisión, números de daño y reparación |
| Experiencia (1.1) | XP por hundir NPC y jugadores, con reparto por daño y reglas contra el abuso; 20 niveles y 5 insignias (§10b) |
| NPC | Pirata (hostil) y Mercante (pasivo). **Incremento I2, en la versión 1.1.0 y P0 en ella** (Q12; antes P1): Cañonera pirata (hostil, mantiene la distancia) y Capitán pirata (jefe). **1.1 (P2):** Galeón del tesoro con escolta (§9) |
| Cámara | Sigue al barco. **I2, en la 1.1.0 y P0 en ella (antes P1):** vista libre con arrastre, minimapa y flechas, y vuelta al barco (§5) |
| Economía | Oro: recompensas por hundir, restos flotantes (P1), tienda de mejoras y barcos |
| Muerte | Hundimiento, pantalla de muerte, reaparición en el puerto y protección |
| Multijugador | 20 jugadores por servidor. PvE cooperativo (P0) y PvP fuera de la zona segura (P1) |
| Plataformas | Escritorio (ratón + teclado) y móvil (táctil), Chrome/Safari/Firefox actuales |
| Autenticación | Clerk, **solo con usuario y contraseña** (sin Google, GitHub ni correo), en prod y en dev. Desde la 1.0.0, el juego está en **https://seabattle.jonattan.dev**, con la instancia de producción de Clerk en `jonattan.dev` (Q13). Modo invitado solo en local (`AUTH_BYPASS=1`) |

### Fuera (y por qué)
| Fuera | Motivo |
|---|---|
| Perlas, moneda premium y pagos | Sin monetización en el slice (pregunta abierta Q5) |
| Monstruos y arpones | En Seafight exigen un segundo sistema de armas (REFERENCE §6). También fuera de I2: P3, pregunta Q10 |
| Corsario rápido | P2: se decide después de medir la 1.1. El galeón del tesoro entra en la 1.1 como P2 (§9) |
| Abordaje, tripulación, gemas, castillos, habilidades | Profundidad que no aporta al bucle principal |
| Misiones, tests de nivel, mapas por nivel y un rango PvP aparte | La 1.1 trae XP y niveles (§10b). Lo demás de Seafight es otro sistema (REFERENCE §16 y §19) |
| Aspectos del barco (colores, emblemas) sin cambio de juego | Fuera de la 1.1 (Q28, decidida por producto) |
| Islas que bloquean disparos o la vista (coberturas) | Las islas solo cortan el paso (§4). Los disparos no chocan con nada (§7) |
| Varios tipos de munición (élite, DoT) | P2: un único tipo especial; el resto, fuera |
| Chat, gremios, grupos, ranking | P3 |
| Varias salas o servidores y emparejamiento | P2 |
| Colisión barco-barco, viento, clima, día/noche | P3 |
| Sonido | P2 (efectos mínimos) |
| Predicción del lado del cliente | Con navegación por clic al estilo RTS se tolera la latencia (§13) |

---

## 4. Mundo

| Parámetro | Valor |
|---|---|
| Sistema | Plano XZ, +Y arriba (dextrógiro), 1 u = 1 m |
| Pantalla | +X a la derecha (Este), **−Z hacia arriba (Norte)**. No se puede tener +X a la derecha y +Z arriba con +Y arriba. |
| Rumbo ψ | Radianes. 0 = proa hacia +Z; crece hacia +X; `forward = (sin ψ, 0, cos ψ)`. Equivale a `rotation.y` de three.js con la proa del modelo hacia +Z (ver `ASSET-SPEC.md`). En pantalla, un rumbo creciente gira en sentido antihorario. Es la convención ya implementada en `src/game/vec.ts:13`. |
| Tamaño | 1 000 × 1 000 m, X y Z ∈ [−500, 500] |
| Límite navegable | X y Z ∈ [−490, 490]. Los destinos fuera de ese rango se ajustan al borde |
| Fuera del mapa | La cámara **no** se limita al borde (el barco sigue en el centro, AC-23). Más allá de ±500 se ve mar oscuro con una línea de borde clara, para que el jugador entienda que no puede pasar. |
| Puerto | Isla puerto en (0, 0), radio 30 m. **1.1:** con muelles y 12 amarres (ver «El puerto», abajo) |
| Zona segura | Círculo de radio 110 m centrado en (0, 0) |
| Anillo de reaparición | Radio 60–90 m desde (0, 0), fuera de la isla, rumbo hacia afuera. **1.1:** se aparece en un amarre libre; el anillo solo se usa si los 12 están ocupados |
| Zona de mercantes | Rutas cerradas en el anillo de 150–330 m |
| Zona de piratas | 4 sectores (NE, NO, SO, SE) en el anillo de 300–460 m |

**Islas** (obstáculos circulares; ni barcos ni NPC las atraviesan; disposición fija y determinista). Hasta la 1.0.2 son las 7 primeras filas; la 1.1 añade 9 formas y un arquetipo a cada una, sin mover ninguna de las 7:

| Id | Arquetipo (1.1) | Centro (x, z) | Radio (m) | Dónde |
|---|---|---|---|---|
| PORT | Puerto | (0, 0) | 30 | Centro |
| I1 | Tropical | (260, 200) | 45 | Sector SE |
| I2 | Rocosa | (−300, 170) | 35 | Sector SO |
| I3 | Rocosa (volcán) | (−220, −280) | 55 | Sector NO; la referencia más alta del mapa |
| I4 | Rocosa (acantilado) | (250, −260) | 40 | Sector NE |
| I5 | Tropical | (20, 360) | 30 | Sur |
| I6 | Tropical | (−410, −30) | 28 | Oeste |
| T1 (1.1) | Tropical (islote habitado) | (150, −150) | 22 | Anillo mercante, NE |
| T2 (1.1) | Tropical (islote habitado) | (−170, 150) | 22 | Anillo mercante, SO |
| E1a (1.1) | Escollo | (140, 260) | 7 | Campo E1, a 318 m del puerto, entre el anillo mercante y el sector SE |
| E1b (1.1) | Escollo | (117,5, 299) | 7 | Campo E1 |
| E1c (1.1) | Escollo | (162,5, 299) | 7 | Campo E1 |
| G1 (1.1) | Cala pirata | (368, −368) | 20 | NE, detrás de la guarida del Capitán (§9) |
| G2 (1.1) | Cala pirata | (−368, −368) | 20 | NO, ídem |
| G3 (1.1) | Cala pirata | (−368, 368) | 20 | SO, ídem |
| G4 (1.1) | Cala pirata | (368, 368) | 20 | SE, ídem |

```
 z−500 (Norte) ┌─────────────────────────────────────────────┐
               │ ☠G2                                    ☠G1  │
               │        R·I3 (volcán)             R·I4        │
               │                         T·T1                 │
               │ T·I6           ┌ zona segura ┐               │   T = tropical · R = rocosa
               │                │  ⚓ PUERTO   │               │   ∴ = escollos · ☠ = cala pirata
               │                └─────────────┘               │   · = ruta mercante (anillo 150–330 m)
               │    R·I2    T·T2   ·  ·  ·  ·  ·    T·I1      │
               │                             ∴E1              │
               │ ☠G3               T·I5                  ☠G4  │
 z+500 (Sur)   └─────────────────────────────────────────────┘
              x−500 (Oeste)                          x+500 (Este)
```
Vista tal como sale en pantalla, sin escala. Sectores: NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+).

Lectura de diseño: el **riesgo crece con la distancia al puerto**. Los mercantes (fáciles) están cerca y los piratas (peligrosos), lejos. Desde la 1.1, **el paisaje también lo dice**: islotes habitados cerca, roca oscura y calas piratas lejos, y cada sector pirata tiene una composición propia (NE acantilado, NO volcán, SO roca, SE escollos y selva) para orientarse sin leer el sector.

**Reglas de la disposición (1.1)** (las comprueba BACKLOG AC-170):
- Entre los bordes de dos islas cualesquiera hay **≥ 46 m** (2 × el margen del Navío, el barco más grande; §6), salvo entre los 3 escollos: así ninguna pareja de islas forma una pared por accidente.
- Ninguna forma toca la zona segura (salvo el puerto). **Las formas nuevas** no tocan ningún punto del arco de la guarida del Capitán (definido en §9: 440 m, de 7,5° a 82,5° de cada cuadrante, cada 2,5°) con su margen de 17 m, ni el anillo de la cañonera (400–470 m) con su margen de 16 m. Las islas de la 1.0 sí entran, y no pasa nada, porque los NPC solo nacen en puntos navegables (`navigableFor`, `src/game/world.ts:175-178`): en el anillo de la cañonera, contado con su margen (desde 384 m), entran I3, I4, I5 e I6 (bordes exteriores a 411, 401, 391 y 439 m), y del arco de la guarida, I6 deja sin navegar un punto, el de 7,5° del sector NO (a 10,0 m de su borde), que el código salta.
- El sombreado del agua admite **16 islas** (`src/client/models/ocean-material.ts:8`): la 1.1 usa exactamente 16 formas. Una forma más exige que dev amplíe el sombreado y vuelva a medir AC-90 antes.

### Arquetipos de isla (1.1)
Las islas **solo cortan el paso**: no bloquean disparos ni la vista (los disparos no chocan con nada, §7). Su efecto táctico es de movimiento: cuellos de botella, el paso de los escollos y el borde contra el que se acorrala a la cañonera (§9). *Por qué no coberturas:* con la cámara cenital oblicua una línea de tiro tapada se lee mal, y cambiaría la IA y el balance de duelos (REFERENCE §19).

| Arquetipo | Qué debe comunicar (para `game-ux`) | Efecto en el juego | Cuántas y dónde |
|---|---|---|---|
| **Puerto** | Que es un puerto de verdad, que es seguro, que ahí se compra y que ahí se aparece (ver «El puerto») | Zona segura, tienda (§11) y amarres de aparición (§12) | 1, en el centro |
| **Tropical** | Aguas tranquilas: playa, palmeras. Los islotes T1 y T2 llevan además un poblado de pescadores, para que se lean «cerca de casa» | Obstáculo de navegación y de las órbitas de los NPC | 5: I1, I5, I6, T1 y T2 |
| **Rocosa** | Lejos y peligroso: roca oscura, acantilado, poca playa. I3 es un volcán y se reconoce desde lejos | Igual que la tropical. I3 es la mayor (55 m): rodearla cuesta, y es la referencia del noroeste | 3: I2, I3 e I4, una por sector pirata salvo el SE |
| **Escollos** | Paso estrecho: rocas a flor de agua con espuma. Entre ellas se lee que hay paso, y que es estrecho | Entre roca y roca hay **31 m de borde a borde**. Pasan la Balandra, la Goleta, el Bergantín, el pirata y el mercante; no pasan la Cañonera, el Capitán, la Fragata ni el Navío (§6). Un barco pequeño perseguido por uno grande escapa por ahí | 1 campo de 3 rocas en triángulo (E1, SE) |
| **Cala pirata** | Aquí vive el Capitán pirata: campamento, banderas negras, restos de naufragios. Se lee como hostil sin confundirse con un barco | Marca la guarida del Capitán (§9) y el fondo de cada sector pirata. Obstáculo | 4, una por sector, en la diagonal a 520 m del puerto (80 m por detrás del punto de la guarida) |

### Receta de los escollos (1.1; qué son en el juego)
| Aspecto | Valor |
|---|---|
| Cuántos | 1 campo (E1) de **3 rocas**, en triángulo equilátero: 45 m entre centros y **31 m entre bordes** (tabla de islas, arriba) |
| Tamaño | Radio de colisión de **7 m** cada roca (14 m de diámetro) |
| Colisión | La de cualquier isla: un círculo sólido que ni barcos ni NPC atraviesan, con el margen de navegación de §6. Cada roca es una de las 16 formas del sombreado del agua |
| Daño | **Ninguno.** Tocar una roca no hace daño, como tocar una isla: el margen de §6 impide llegar a tocarla, y el radio de colisión es el tope de último recurso |
| Paso | Pasa quien tenga un margen ≤ 15,5 m (31 / 2): Balandra (10), pirata (12), Goleta (13), mercante (13) y Bergantín (14). No pasan la Cañonera (16), el Capitán (17), la Fragata (19), el Galeón (20) ni el Navío (23). El jugador no tiene que calcularlo: hace clic al otro lado y la ruta (§6) cruza el paso o lo rodea según su clase |
| Recinto | El centro del triángulo está a 25,99 m del centro de cada roca, así que es agua navegable para márgenes **< 18,99 m** (25,99 − 7), pero solo se llega por los pasos (margen ≤ 15,5 m). Hay dos casos para quien no cabe: con margen de 15,5 a 18,99 m (la Cañonera, 16, y el Capitán, 17) el centro es navegable y no alcanzable; con 18,99 m o más (la Fragata, el Galeón y el Navío), ni siquiera es navegable. Los dos siguen la regla del destino inalcanzable (§6, punto 1b; BACKLOG AC-172 a y b) |
| Disparos | No los paran, como ninguna isla (§7) |
| Altura y aspecto | **A flor de agua**: más bajas que cualquier isla, sin playa ni vegetación, con espuma alrededor. La altura exacta es de `game-ux` |
| Lo que se ve es lo que hay | En la flotación, el borde visible de cada roca está entre 0,94 r y r (como la playa de las islas, ART-DIRECTION §8.1). Así el hueco que se ve mide entre 31 y 31,8 m: el jugador ve el paso real, no uno más ancho ni más estrecho |

**Umbrales de los escollos en AC-174** (lo de juego lo fija producto; las cifras visuales, `game-ux`):
- **(a) Geometría:** en la flotación, el radio visible de cada roca está en [0,94 r, r], así que el hueco visible mide 31–31,8 m (unitario, sobre la geometría, como AS-V16).
- **(b) No son barcos:** en una captura a 1,0× en 1440×900 y en 390×844 con el campo E1 y un barco al lado, una roca nunca se señala como barco: 0 de 5 evaluadores-agente, con el protocolo de AC-72.
- **(c) No son otra isla:** los escollos se distinguen de los otros 4 arquetipos en escala de grises con la regla medible que fije `game-ux`.

**Requisitos comunes de arte del mapa (qué deben comunicar; el diseño es de `game-ux`):**
- Lo que parece sólido es sólido (AC-103, D7): ningún decorado sale del círculo de su forma, en ningún arquetipo ni en el puerto.
- Los 5 arquetipos se distinguen entre sí en una captura a 1,0× en 1440×900, también en escala de grises (BACKLOG AC-174; el umbral lo fija `game-ux`).
- Islas y puerto siguen en **1 draw call** estático (`src/client/models/island-geometry.ts:1-2`), dentro del presupuesto de §16.
- Si una bala cruza por encima de una isla alta (el volcán), su dibujo no debe sugerir que la isla la para: los disparos no chocan con nada (§7).

### El puerto (1.1)
Un puerto de verdad, no una isla con un pueblo: **muelles, amarres donde se aparece atracado, un astillero que señala la tienda y un faro**. Las reglas de juego de la zona segura no cambian.

| Requisito | Valor | Por qué |
|---|---|---|
| Zona segura | Círculo de 110 m (sin cambios), con sus 24 boyas | Reglas y tests de la 1.0 (AC-65, AC-47) |
| Colisión | Círculo de 30 m (sin cambios). Muelles, astillero, almacenes, grúa y faro van dentro (AC-103) | Lo que parece sólido es sólido. Si `game-ux` necesita más radio, lo pide a `game-product`, porque cambia AC-04 y los amarres |
| Amarres | **12**, uno cada 30° de rumbo empezando en 15° (15°, 45°… 345°; rumbo ψ de §4). El barco amarrado tiene el centro a **30 + L/2 + 2 m** del centro del puerto, con la popa hacia el muelle (a 2 m) y la proa hacia fuera: Balandra a 40 m, Goleta 43, Bergantín 44, Fragata 49 y Navío 53 | Se ve atracado de popa, como en un puerto real, y el casco nunca toca la isla (es el margen de navegación de §6) |
| Aparición | Al entrar al mundo y al zarpar tras hundirse: en un amarre **libre**, elegido al azar con la semilla entre los libres. Un amarre está libre si ningún barco vivo, de cualquier clase, tiene el centro a < 12 m de su **eje**: el segmento de r 30 a r 76 en su rumbo (76 = 30 + 42 + 4, el Navío entero con 2 m de holgura a cada lado). Medir solo hasta el punto de la clase que aparece no basta, porque cada clase atraca a un radio distinto: un Navío atracado (centro a 53 m) dejaría «libre» su amarre para una Balandra (40 m) y los cascos se solaparían (R-04 de QA). Con los 12 ocupados, en el anillo de 60–90 m de la 1.0 | 12 amarres para 20 jugadores: aparecer a la vez más de 12 es raro |
| Entradas y salidas | **Sin diques ni bocanas sólidas**: se entra y se sale en cualquier rumbo. Desde un amarre hasta el centro de cualquier sector pirata, y desde 300 m en 8 rumbos hasta el amarre más cercano, la ruta mide **≤ 1,15 × la línea recta** (AC-177) | Dentro de la zona segura no hay combate (§7), así que un canal no tendría función táctica: solo alargaría cada viaje a la tienda y movería AC-60 |
| Tiempo para salir | Desde su amarre, la Balandra deja la zona en ~7 s (70 m) y el Navío en ~9 s (57 m), con la aceleración de §6 | La protección de 15 s (§12) cubre la salida |
| Tienda | Se abre en cualquier punto de la zona segura (§11, sin cambios). El **astillero** es el edificio que la señala | Cambiar la regla rompería AC-66 y AC-68 sin ganar nada |
| Minimapa | Icono propio del puerto (un ancla, por ejemplo) dentro del círculo discontinuo de la zona segura. Entra si pasa la regla de plantillas del minimapa de `game-ux` (AD-29) junto con los marcadores del Capitán y la Cañonera; lo modela ux en su fase 2. Si no la pasa, el puerto se queda con el círculo de la zona segura, como en la 1.0 | Se encuentra el puerto desde cualquier punto, sin confundirlo con un barco |

**Qué debe comunicar el puerto (para `game-ux`):**
- «Esto es un puerto»: muelle de piedra en el borde de la isla, pantalanes, astillero, almacenes, grúa y faro, sin salir del círculo de 30 m.
- «Aquí estoy a salvo»: el borde de boyas de la zona segura (ya existe, ART-DIRECTION §8.2).
- «Aquí se compra»: el astillero se reconoce a 1,0× también en 390×844.
- «Este es mi sitio»: al aparecer, el barco propio se ve atracado de popa.
- «Por aquí salgo»: todo el contorno es salida; nada dibujado fuera del círculo de 30 m puede parecer un dique.

## 5. Controles

### Escritorio
| Acción | Entrada | Regla |
|---|---|---|
| Navegar | Clic izquierdo en el agua | Marcador inmediato en el punto. Un clic en una isla lleva al punto navegable más cercano (1.1: el más cercano que la clase pueda alcanzar, §6 punto 1b). Un clic nuevo reemplaza el destino. **No deselecciona ni cancela el ataque.** |
| Seleccionar | Clic izquierdo sobre un barco | Se acierta dentro de la silueta proyectada + 12 px. Si hay varios, gana el más cercano al cursor. **No genera tráfico de red.** |
| Ciclar objetivo | `Tab` / `Shift+Tab` | Recorre los barcos atacables a ≤150 m, del más cercano al más lejano |
| Atacar / cancelar | `Espacio` o botón **Atacar** | Alterna (*toggle*) sobre el objetivo seleccionado (§7) |
| Seleccionar + atacar (P1) | Doble clic sobre un barco atacable | Atajo |
| Cancelar / deseleccionar | `Esc` | La 1.ª pulsación cancela el ataque; la 2.ª deselecciona |
| Zarpar (hundido) | `Espacio` / `Enter` o botón **Zarpar** | Solo cuando la cuenta atrás ha terminado; antes no hacen nada |
| Detener | `S` | Borra el destino; el barco frena |
| Reparar | `R` o botón **Reparar** | Alterna (§8) |
| Zoom | Rueda del ratón | 3 niveles de **extensión visible**: 0,7× (más cerca), 1,0× (por defecto) y 1,5× (más lejos) |
| Puerto | `P` o botón **Puerto** | Solo dentro de la zona segura |
| Mover la vista (I2) | Arrastrar en el agua (> 12 px), clic o arrastre en el minimapa, flechas | Entra en vista libre. Un clic sin arrastre sigue navegando |
| Centrar en mi barco (I2) | `C` o botón **Centrar** | Vuelve al seguimiento |

### Móvil (táctil)
| Acción | Entrada | Regla |
|---|---|---|
| Navegar | Toque en el agua | Igual que en escritorio |
| Seleccionar | Toque sobre un barco | Tolerancia de silueta + 24 px CSS |
| Atacar / cancelar | Botón **Atacar** (≥64×64 px) | Alterna |
| Ciclar objetivo | Botón **Objetivo** (≥48×48 px) | Igual que `Tab` |
| Reparar | Botón **Reparar** (≥48×48 px) | Alterna |
| Zoom (P1) | Pellizco | Mismos 3 niveles |
| Puerto | Botón **Puerto** | Solo en la zona segura |
| Mover la vista (I2) | Arrastrar **un** dedo en el agua (> 12 px CSS), o tocar o arrastrar en el minimapa | Un toque sin arrastre sigue navegando; con dos dedos es zoom, nunca desplazamiento |
| Centrar (I2) | Botón **Centrar** | Vuelve al seguimiento |

**Regla de entrada:** cada pulsación produce como mucho una intención. Los conmutadores (Atacar, Reparar, Esc) alternan sobre la **última intención del jugador**, no sobre el estado que llega del servidor, que va interpolado y con retraso (§13). Esa última intención incluye lo que cancela según §8: después de pulsar Reparar, el siguiente Atacar ataca, y después de Atacar o de una orden de navegación, el siguiente Reparar repara. Una intención que el servidor va a rechazar con seguridad (reparar con el casco intacto) no cancela nada (AC-128). Mantener una tecla pulsada no la repite.

Orientaciones soportadas: vertical (390×844) y horizontal (844×390). Mientras se juega, el navegador no hace scroll ni zoom.

### Cámara (qué debe comunicar; los valores exactos los define `game-ux`)
- Proyección "isométrica" (cenital oblicua).
- **Modo seguimiento** (por defecto): sigue al barco propio, que queda siempre en el **10 % central** de la pantalla: la caja centrada de 10 % del ancho × 10 % del alto (|dx| ≤ 0,05·W, |dy| ≤ 0,05·H), medida sobre el pivote del barco.
- **Encuadre (decisión U8, D23):** con el zoom por defecto cabe entero, a 1440×900 y a 390×844, el círculo de radio **R = max(alcance de tu cañón, 65 m)**. Es decir, 65 / 70 / 80 m con los cañones N1 / N2 / N3 (antes, 80 m fijos).
  - 65 m es el **mayor alcance de los NPC** (cañonera y capitán). Si en el futuro un NPC alcanza más, R sube con él.
  - **Por qué no el alcance propio a secas (60 m con N1):** la cañonera orbita a 62 m y el capitán dispara desde 65 m, así que dispararían desde fuera del encuadre precisamente al jugador novato, que es quien tiene que perseguir a la cañonera.
  - **Ganancia:** la Balandra inicial pasa de 1 310 a ≈1 984 px² en su peor rumbo (+51 %), frente a los ≈2 000 px² del barco del jugador en Seafight.
  - Al comprar cañones, R cambia (65 → 70 → 80 m) con una transición de 600 ms al cerrar la tienda.
  - Los jugadores con más alcance (PvP, hasta 80 m) pueden quedar fuera del encuadre. Para eso está el indicador de atacante fuera de pantalla (§14).
- **Vista libre** (I2; P0 en la 1.1.0, antes P1). En Seafight el minimapa y unas teclas mueven la carta, y "To the Ship" la devuelve al barco (REFERENCE §2 y §12).
  - **Entrar:** arrastrar en el agua más de 12 px (botón izquierdo o un dedo); hacer clic o arrastrar en el minimapa (la vista se centra en ese punto); o usar las flechas (150 m/s).
  - **Soltar antes de 12 px es un clic normal:** navega o selecciona. Dos dedos son zoom, nunca desplazamiento.
  - En vista libre, un clic en el agua navega hacia ese punto (aunque esté lejos del barco) y un clic en un barco lo selecciona. Nada más cambia.
  - El centro de la vista no sale del mapa (±500 m).
  - **Volver al seguimiento** (transición de 300 ms): con `C` o el botón Centrar, cuando el barco propio recibe daño, al morir o al reaparecer.
  - Si el barco propio queda fuera de pantalla, un indicador en el borde señala hacia él.
  - **Lo que se ve está vivo:** los barcos que hay en la zona mirada se muestran; nunca se ve mar vacío donde hay NPC (§13).

## 6. Navegación y barcos

### Modelo de movimiento (simulación a 20 Hz)
1. Un clic fija un destino. El servidor calcula una ruta con *waypoints* que esquiva las islas (A\* sobre un grafo de visibilidad, con 16 nodos alrededor de cada isla inflada por el margen: `src/game/nav.ts:1-3` y `:7`. Antes este texto decía «rejilla de 5 m», que no es lo implementado). **Margen de navegación** = media eslora + 2 m (`L/2 + 2`), medido desde el borde de la isla: Balandra 10 m, Goleta 13 m (1.1), Bergantín 14 m, Fragata 19 m, Navío 23 m (1.1), Pirata 12 m, Mercante 13 m, Cañonera 16 m, Capitán 17 m y Galeón 20 m (1.1). Así el casco (sin el bauprés) nunca se mete en una isla: lo que parece sólido es sólido. El radio de colisión no cambia y sigue siendo el límite físico de último recurso.
1b. **Destino inalcanzable (1.1).** Si la clase no puede llegar al destino, el destino pasa al punto alcanzable más cercano y nunca se navega en línea recta contra una roca. Vale para los dos casos del recinto de los escollos (§4): un destino **no navegable** para la clase (una Fragata que hace clic dentro del triángulo) y uno **navegable pero no alcanzable** (la Cañonera o el Capitán que persiguen a una Balandra metida en él). El segundo no lo resuelve llevar el destino al punto navegable más cercano (`nearestNavigable`, `src/game/nav.ts:46`), porque el destino ya es navegable. Hoy, sin ruta, `findPath` devuelve el destino en línea recta (`src/game/nav.ts:145`); con las islas de la 1.0 no había recintos y no pasaba.
2. Cada tick, el barco gira hacia el siguiente *waypoint* a su **velocidad de giro máxima**.
3. Velocidad objetivo = máxima × factor de giro (1,0 si el error de rumbo es ≤ 45°, 0,6 si es ≤ 90° y 0,4 si es mayor).
4. Acelera y frena con su aceleración y frenado. Empieza a frenar cuando la **distancia que le queda de ruta hasta el destino final** cumple `d ≤ v² / (2·frenado)`. No basta con medir hasta el *waypoint* actual: si no, el barco se pasa del destino.
4b. **Giro casi en el sitio junto a islas.** Si el error de rumbo es > 45° y el centro del barco está a menos de (margen de navegación + 8 m) de una isla, o si el siguiente *waypoint* es una esquina de más de 45°, la velocidad objetivo es ≤ 1 m/s hasta que el error baje de 45°. En mar abierto rigen solo los factores del punto 3.
5. **Llegada**: se detiene a ≤2 m del destino con velocidad 0.
6. No hay colisión entre barcos (se atraviesan; ver §3). Las islas y el borde son sólidos.

### Clases de barco del jugador
La eslora es la del casco, sin el bauprés.

| Clase | Eslora | Radio de colisión | Vida | Vel. máx. | Acel. | Frenado | Giro | Cañones por banda | Precio | Nivel mínimo (1.1; Q27) |
|---|---|---|---|---|---|---|---|---|---|---|
| **Balandra** | 16 m | 5 m | 800 | 14 m/s | 4 m/s² | 6 m/s² | 90 °/s | 4 | Inicial | — |
| **Bergantín** | 24 m | 7 m | 1 400 | 12 m/s | 3 m/s² | 5 m/s² | 70 °/s | 6 | 2 000 oro | — |
| **Goleta** (1.1) | 22 m | 6 m | 1 100 | 15 m/s | 4,5 m/s² | 6 m/s² | 80 °/s | 4 | 3 000 oro | 5 (Marinero) |
| **Fragata** | 34 m | 9 m | 2 200 | 10 m/s | 2,5 m/s² | 4 m/s² | 55 °/s | 8 | 6 000 oro | — |
| **Navío de línea** (1.1) | 42 m | 11 m | 3 200 | 8,5 m/s | 2 m/s² | 3,5 m/s² | 45 °/s | 10 | 12 000 oro | 9 (Contramaestre) |

Equilibrio: la Balandra es rápida y frágil; la Fragata es lenta y tiene la mayor potencia de fuego. Las mejoras (§11) multiplican sobre la clase activa. **1.1:**
- **Goleta, la cazadora.** Es el barco más rápido del juego (18 m/s con velas N3) y con cañones N3 (80 m) supera el alcance de todos los NPC (65 m como mucho, §9) y su velocidad (11 m/s como mucho): puede hundirlos sin recibir daño si mantiene la distancia (pilar P3). Frente al Bergantín, que cuesta menos, cambia potencia de fuego (4 cañones frente a 6) por 3 m/s. Pasa por los escollos (§4).
- **Navío de línea, el final de la progresión.** La mayor potencia de fuego y la mayor vida, y el más lento y torpe de los barcos del jugador. No pasa por los escollos, así que un barco pequeño puede escaparle por ahí.
- **Nivel mínimo** (decidido, Q27): solo lo piden las dos clases nuevas; las de la 1.0 no cambian.

### Requisitos de arte de las clases nuevas (1.1; qué deben comunicar, el diseño es de `game-ux`)
| Clase | Debe leerse como | Requisito verificable |
|---|---|---|
| Goleta | Rápida y ligera | Silueta propia que la distinga de la Balandra y del Bergantín en escala de grises a 1,0× en 390×844 (la clase se lee por la silueta, ART-DIRECTION §9). Mismo código de jugador que las demás (§14) |
| Navío de línea | La más poderosa del jugador | El barco del jugador más grande (42 m), con la potencia de fuego a la vista. No se confunde con la Fragata, que es de su misma facción, por la regla de clases de ux (AD-37), ni con el Capitán pirata ni el Galeón, que son de otra, por la de facciones (AD-10); las dos, también en grises. **Frente a la Fragata, la eslora no basta** (42 / 34 = 1,235, por debajo del 1,25 que pide la gramática de siluetas de `game-ux`): el rasgo que la distingue son **dos filas de portas**, que añade ux. La eslora se queda en 42 m (decisión de producto, 2026-10-17): subirla a ≥ 42,5 m movería el margen de navegación (23 → 23,5 m), los amarres y la regla de 46 m entre islas (§4) para algo que el rasgo ya resuelve |

## 7. Combate

### Estado de ataque
```
            Espacio/Atacar (con objetivo)
  [Inactivo] ───────────────────────────► [Armado]
      ▲                                   │   ▲
      │ cancelar · objetivo hundido ·     │dist ≤ alcance│ dist > alcance
      │ objetivo > 200 m · muerte ·       ▼   │
      │ empezar a reparar ·          [Disparando] ── andanada cada recarga
      └── objetivo protegido/en zona segura (PvP)
```
- **El ataque persiste** (como en Seafight, REFERENCE §3): con una sola entrada se dispara automáticamente cada vez que el cañón está cargado y el objetivo está a tiro.
- **Fuera de alcance** sigue "armado": no dispara, el HUD muestra "Fuera de alcance" y dispara solo en cuanto el objetivo vuelve a tiro. **No persigue al objetivo**: posicionarse es tarea del jugador (pilar P3).
- **Moverse no cancela el ataque**, así que se puede disparar mientras se mantiene la distancia (*kiting*).
- Se dispara en **360°**. Visualmente, la andanada sale del costado que mira al objetivo. *Decisión:* un arco obligatorio choca con la navegación por clic y con el ataque persistente (REFERENCE §3, HIPÓTESIS).

### Cañones (mejora global; se aplica a cualquier clase)
| Nivel | Nombre | Daño por bala | Precisión | Alcance | Recarga | Precio |
|---|---|---|---|---|---|---|
| 1 | Cañón de 8 libras | 30 | 70 % | 60 m | 4,0 s | Inicial |
| 2 | Cañón de 12 libras | 38 | 75 % | 70 m | 3,5 s | 500 oro |
| 3 | Cañón de 18 libras | 48 | 80 % | 80 m | 3,0 s | 1 500 oro |

### Resolución de una andanada (en el servidor)
- **Condición**: ataque armado + recarga lista + objetivo vivo + `distancia(centro, centro) ≤ alcance`.
- **Impactos**: por cada cañón de la banda, impacto si `rng() < precisión`. El RNG es determinista y con semilla.
- **Daño**: `impactos × daño_por_bala`. No hay armadura en el MVP.
- **Tiempo de vuelo**: `distancia / 120 m/s` (≈0,5 s a 60 m). El daño se aplica en el tick de impacto. Si el objetivo ya se hundió, el resto se ignora.
- **Fallos**: el cliente dibuja salpicaduras cerca del objetivo. El servidor informa de los impactos y fallos de cada andanada.
- **Recarga**: empieza en el instante del disparo.
- **Sin colisión física de proyectiles**. Las balas solo pueden afectar al objetivo declarado, así que un barco no puede dañarse a sí mismo ni dañar a terceros (elimina el bug de `dc6181c` por diseño).

**Daño esperado por segundo (DPS)** = `cañones × daño × precisión / recarga`

| | Cañón N1 | Cañón N3 |
|---|---|---|
| Balandra (4) | 21,0 | 51,2 |
| Goleta (4, 1.1) | 21,0 | 51,2 |
| Bergantín (6) | 31,5 | 76,8 |
| Fragata (8) | 42,0 | 102,4 |
| Navío de línea (10, 1.1) | 52,5 | 128,0 |

### Reglas PvP (P1)
- Un jugador puede atacar a otro solo si **ambos** están fuera de la zona segura y ninguno tiene protección.
- Si el objetivo entra en la zona segura, el ataque contra él se cancela.

## 8. Reparación

| Parámetro | Valor |
|---|---|
| Entrada | `R` o botón (alterna) |
| Al activar | Borra el destino y el barco frena. **Empieza a reparar con velocidad ≤ 1 m/s.** |
| Ritmo | +4 % de la vida máxima por segundo (ticks de +2 % cada 0,5 s) |
| Bajo fuego | Si recibió daño en los últimos 3 s: +1,5 %/s |
| Se cancela con | Una orden de navegación, Atacar, la vida al 100 % o la muerte |
| Exclusión | Reparar cancela el ataque y atacar cancela la reparación |
| Coste | **0 oro** (decisión, pregunta abierta Q3) |
| Aviso | Con vida < 30 %, el botón **Reparar** pulsa (como en Seafight, REFERENCE §7) |

Lectura de diseño: la Balandra repara 32 HP/s y, bajo fuego, 12 HP/s. Contra un pirata (11,7 DPS) apenas aguanta, y contra dos pierde. Reparar en combate solo da tiempo; no sirve para tanquear.

## 9. NPC

### Estadísticas
| Tipo | Vida | Vel. patrulla / máx. | Giro | Cañones | Daño por bala | Precisión | Alcance | Recarga | DPS | Recompensa | Restos (P1) | Reaparición | Población |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| **Pirata** (hostil) | 450 | 6 / 11 m/s | 70 °/s | 4 | 22 | 60 % | 55 m | 4,5 s | 11,7 | 105 oro | 25 oro | 30 s | 8 (2 por sector). Eran 12 antes de I2 |
| **Cañonera pirata** (hostil, I2) | 900 | 5 / 8 m/s | 50 °/s | 6 | 20 | 55 % | 65 m | 5,0 s | 13,2 | 210 oro | 50 oro | 45 s | 4 (1 por sector, anillo de 400–470 m) |
| **Mercante** (pasivo) | 300 | 7 / 9 m/s | 50 °/s | 0 | — | — | — | — | 0 | 60 oro | 15 oro | 20 s | 8 |
| **Capitán pirata** (jefe, I2 P1) | 1 800 | 6 / 10 m/s | 60 °/s | 6 | 28 | 65 % | 65 m | 4,0 s | 27,3 | 600 oro | 150 oro | Tras 10 piratas o cañoneras hundidos en el servidor desde su última muerte; máximo 1 vivo | 0–1 |
| **Galeón del tesoro** (pasivo, de evento; 1.1, P2) | 2 400 | 5 / 7 m/s | 40 °/s | 0 | — | — | — | — | 0 | 600 oro | 150 oro | 10 min después del arranque o de que el anterior se hunda o escape; máximo 1 | 0–1, con 2 escoltas |

Eslora y radio de colisión: Pirata 20 m / 6 m, Mercante 22 m / 7 m, Cañonera 28 m / 8 m, Capitán 30 m / 9 m y Galeón 36 m / 10 m (1.1).

Aceleración y frenado: Pirata 3 / 5 m/s², Mercante 2,5 / 4 m/s², Cañonera 2,5 / 4 m/s², Capitán 2,5 / 4 m/s² (los tres, como la Fragata, §6) y Galeón 2 / 3,5 m/s² (como el Navío, §6).

**Regla de recompensa** (para que añadir tipos no suba el oro por segundo de combate): hostiles ≈ 0,23 × vida (pirata 105/450; cañonera 210/900) y pasivos ≈ 0,20 × vida (mercante 60/300). El jefe lleva una prima de riesgo (0,33 × vida) porque es raro y exige grupo o una Fragata mejorada. El galeón (1.1) lleva una prima de evento (0,25 × vida): es raro, va escoltado y se escapa. **La XP de cada NPC (1.1) sigue la misma lógica por vida (§10b).**

### IA del pirata
```
 [Patrulla] ── jugador atacable a ≤ 70 m ──► [Combate] ── objetivo > 110 m, o pirata > 200 m de su
     ▲            o recibe daño de cualquier                  origen, o objetivo en zona segura,
     │            jugador (represalia)                        protegido o muerto ──► [Regreso]
     └──────────── llega a ≤ 10 m de su origen; vida al 100 % ◄───────────────────────┘
```
- **Patrulla**: elige un punto aleatorio a ≤120 m de su origen, va a 6 m/s y espera 2–5 s.
- **Combate**: elige como objetivo al jugador que más daño le hizo en los últimos 10 s; si no hay ninguno, al más cercano. Se acerca hasta 45 m y luego **orbita a 45 m** a 8 m/s. Dispara cuando la distancia es ≤55 m.
- **Regreso**: vuelve a velocidad máxima sin disparar. Al llegar recupera el 100 % de la vida (evita que se "farmee" su vida a medias).
- **Nunca entra** en el círculo de 130 m alrededor del puerto (zona segura + 20 m).
- **Toda navegación de NPC** (patrulla, órbita, huida, regreso) respeta el mismo margen de navegación `L/2 + 2` contra las islas (§6).
- **Órbita real = nominal** (decidido en I2, H-305; la decisión entra en los docs de `main` el 2026-10-17, pero el código **no viene en el port** del I2: llega con la Cañonera, BACKLOG AC-188). La órbita compartida de los NPC se queda un 9,6 % por dentro del radio nominal: el capitán orbita a 45,2–45,4 m para 50 m, y el pirata tiene el mismo sesgo (~40,7 m para 45; datos de dev-npc). **Se corrige el controlador compartido, no las constantes**, para que la mediana real caiga dentro del ±5 % del radio nominal en todas las clases. Por qué:
  - con el sesgo, el capitán orbitaría a la misma distancia real que el pirata nominal (45 m);
  - la mediana del pirata queda a 0,7 m del límite de BACKLOG AC-48;
  - la cañonera (62 m) caería a ~56 m, fuera de los 62 ±4 m de AC-113 y pegada a su umbral de huida de 55 m.

  Como la precisión no depende de la distancia (§7), el daño por segundo no cambia mientras el NPC está a tiro. Aun así, AC-48, AC-53 y AC-60 se vuelven a medir con la corrección.
- **Atacable** = jugador vivo, fuera de la zona segura y sin protección.

### IA del mercante
- **Ruta**: recorre en bucle una ruta cerrada de 4–6 *waypoints* a 7 m/s.
- **Huida**: al recibir daño, se aleja del atacante a 9 m/s durante 12 s desde el último daño, esquivando islas y bordes. Luego vuelve a su ruta por el *waypoint* más cercano.
- Nunca dispara.

### IA de la cañonera pirata (I2)
Comportamiento propio: **mantiene la distancia**. Su alcance (65 m) supera al cañón N1 del jugador (60 m), así que obliga a perseguirla o a mejorar los cañones.
- **Patrulla, represalia, regreso, correa (200 m) y zona prohibida del puerto (130 m):** igual que el pirata.
- **Combate** (detecta a ≤ 80 m):
  - si la distancia al objetivo es > 64 m, se acerca a velocidad máxima;
  - entre 55 y 64 m, orbita a **62 m** a 6 m/s;
  - por debajo de 55 m, **se aleja** del objetivo a velocidad máxima sin dejar de disparar.
  - Dispara cuando la distancia es ≤ 65 m.
- Es más lenta (8 m/s) que cualquier barco del jugador, así que se la puede alcanzar. Si queda acorralada contra una isla o el borde, orbita.

### Capitán pirata: el jefe (I2)
En Seafight aparece un "almirante" tras hundir 10 NPC de un tipo, y los almirantes son agresivos (REFERENCE §8: S12, S13).
- **Aparición:** cuando se hunden 10 piratas o cañoneras (no mercantes) desde su última muerte o desde el arranque. Nace en el sector pirata con menos jugadores, en su punto exterior (radio de 440 m), a ≥ 150 m de cualquier jugador. Ese punto es su **guarida**. Nunca hay 2 vivos.
- **Sector con menos jugadores** (precisión de I2, H-305): se cuentan los jugadores vivos de cada cuadrante por el signo de sus coordenadas (§4), y los empates se deciden al azar con la semilla. Si no queda ningún punto libre en ningún sector, se reintenta en el tick siguiente.
- **Arco de la guarida** (definido el 2026-10-17, R-01 de QA; es lo que hace I2, `sea-battle-i2/src/game/world.ts:244-266`): los puntos a 440 m del puerto con un ángulo de **7,5° a 82,5°** respecto del eje X dentro de cada cuadrante, **cada 2,5°** (31 por sector; 45° es la diagonal). Se prueba primero el de 45° y después hacia los lados. Se salta el punto que no es navegable para el Capitán (margen de 17 m) o que está a < 150 m de un jugador; si no queda ninguno en ese sector, se pasa al siguiente sector con menos jugadores. Con el mapa de la 1.1, el único punto no navegable de los 124 es el de 7,5° del NO, por I6 (§4).
- **Combate:** detecta a ≤ 90 m, orbita a 50 m y dispara a ≤ 65 m. Elige objetivo y hace represalia como el pirata. Los demás parámetros son también los del pirata (precisión de I2, H-305): pierde al objetivo a > 110 m, orbita a 8 m/s, patrulla a ≤ 120 m de su guarida con esperas de 2–5 s y da por llegado el regreso a ≤ 10 m. Acelera a 2,5 m/s² y frena a 4 m/s², como la Fragata, que tiene su misma velocidad máxima. Su órbita real es la nominal (ver «Órbita real = nominal», en la IA del pirata).
- **Correa:** 150 m alrededor de la guarida. Si se aleja más o pierde al objetivo, vuelve y recupera el 100 % de la vida, como el pirata. **Al recuperarla se borra su registro de daño**, así que el combate siguiente reparte el oro y la XP de cero (§10, §10b). Para hundirlo hay que comprometerse.
- **Aviso a todos** (texto de ART-DIRECTION D49): al aparecer, «¡Capitán pirata en el <región>, sector <celda>!», p. ej., «¡Capitán pirata en el noroeste, sector B2!». La región es el cuadrante de su guarida, escrito entero (noreste, noroeste, suroeste o sureste), y la celda es la de la rejilla del minimapa en la que está la guarida. En pantalla, «sector» solo nombra la celda de la rejilla; los cuadrantes nunca se muestran como «sector NE». Además, el capitán tiene un marcador propio en el minimapa, visible desde cualquier punto del mapa. **Quien entra con el capitán ya vivo no recibe el aviso**, pero ve el marcador desde el snapshot completo de entrada. Al hundirse, el feed dice "El Capitán pirata ha caído: A, B y C" (hasta 3 nombres, por daño, y "y N más"). **Los nombres son los de quienes cobran del reparto** (§10).
- **Reparto:** proporcional al daño (§10), así que premia ir en grupo.

### Galeón del tesoro con escolta (1.1, P2)
El tesoro que cruza el mar de los mercantes: rico, lento, pasivo y defendido. Es el evento **cerca del puerto**, al alcance de un Bergantín con ayuda, frente al Capitán, que es el evento **lejos**. Es el primero que se recorta si la 1.1 no llega (BACKLOG, «Release 1.1.0»).
- **Aparición:** 10 min después del arranque, o de que el anterior se hunda o escape; nunca hay 2. Nace en el anillo de 250 m alrededor del puerto, en el punto del anillo más alejado de los jugadores y a ≥ 150 m de todos, con 2 escoltas (piratas de la tabla) a 30 m.
- **Ruta:** una vuelta completa al anillo de 250 m (8 *waypoints*, ≈ 1 570 m, ≈ 5 min a 5 m/s), esquivando islas (T1 y T2 caen cerca). Si la completa sin hundirse, el galeón desaparece (su escolta, según la regla de «Escolta», abajo): «El Galeón del tesoro ha escapado».
- **Huida:** como el mercante. Al recibir daño se aleja del atacante a 7 m/s durante 12 s y vuelve a la ruta por el *waypoint* más cercano. No dispara.
- **Escolta:** las 2 escoltas se quedan a ≤ 60 m del galeón (su correa se mueve con él), atacan a quien dañe al galeón y a cualquier jugador atacable a ≤ 70 m de ellas (como el pirata), y nunca entran a < 130 m del puerto. Cuentan como piratas para la aparición del Capitán. Cuando el galeón se hunde o escapa, terminan su combate y desaparecen en cuanto no hay ningún jugador a ≤ 110 m de ellas. No reaparecen.
- **Aviso a todos:** al aparecer, «¡Galeón del tesoro en el <región>, sector <celda>!» (texto de `game-ux`, ART-DIRECTION §10.1, con la regla de D49 del aviso del Capitán: la región es el cuadrante de su punto de aparición, escrito entero, y la celda, la de la rejilla del minimapa; BACKLOG AC-166), con un marcador propio en el minimapa visible desde cualquier punto (como el Capitán, §13). Al hundirse, «El Galeón del tesoro ha caído: A, B y C».
- **Recompensa:** 600 de oro + 150 de restos y 160 XP (§10b), repartidos por daño (§10).
- **Fuera de la curva:** el bot de AC-60 no lo ataca ni se acerca a < 150 m de él, igual que con el Capitán (§10).
- **Entidades:** con el galeón y su escolta, el mundo llega a 44 (§13).

### Requisitos de arte de los NPC de I2 y de la 1.1 (qué deben comunicar; el diseño es de `game-ux`)
| NPC | Debe leerse como | Requisito verificable |
|---|---|---|
| Cañonera pirata | Hostil, pesada, de largo alcance | Código hostil (velas oscuras, como el pirata) más una **forma** propia (casco ancho y bajo, batería de cañones visible) que la distinga del pirata y del capitán **en escala de grises** a 1,0× en 390×844. Placa "Cañonera pirata" |
| Capitán pirata | El más peligroso del mar | Mayor que cualquier pirata (30 m) y con silueta propia. Un rasgo exclusivo (bandera u ornamento) visible a 1,0× en móvil y en grises. Marcador de minimapa distinto de todos los demás. Placa "Capitán pirata" |
| Galeón del tesoro (1.1, P2) | Pasivo, rico y pesado | Código **pasivo** (nunca se confunde con un hostil) y distinto del mercante en grises a 1,0× en 390×844: mayor (36 m) y con un rasgo de riqueza propio. Placa "Galeón del tesoro". Marcador de minimapa distinto de los 6 de AC-115. Sus escoltas son piratas normales |

### Reaparición de NPC
- La reaparición es en su zona (sector pirata o ruta mercante), a **≥100 m de cualquier jugador** y fuera de islas.
- El temporizador cuenta desde el hundimiento.

### Balance verificable (simulación sin reparar, 1 000 duelos con semillas)
| Duelo | Tiempo hasta hundir (mediana) | Vida perdida por el jugador |
|---|---|---|
| Balandra N1 vs Pirata | 18–24 s | 25–40 % |
| Balandra N1 vs Mercante | 10–14 s | 0 % |
| Fragata con todo a N3 vs Capitán pirata | 12–20 s | 10–25 % |
| Balandra N1 vs Capitán pirata | El jugador pierde en ≥ 95 % de los casos | — |
| 2 Bergantines (cañones y casco N2) vs Capitán pirata | 14–22 s, sin muertes en ≥ 95 % de los casos | 20–45 % (el objetivo del capitán) |
| Bergantín (cañones N2) vs Cañonera | 15–22 s | 10–25 % |
| Balandra N1 vs Cañonera | — | 55–80 % (no es un objetivo para N1) |
| Goleta N1 vs Pirata (1.1) | 18–24 s | 18–30 % |
| Goleta (cañones N2) vs Cañonera (1.1), ambos a tiro | 20–30 s | 20–45 %. Manteniéndose a 66–70 m (fuera de los 65 m de la cañonera y dentro de sus 70), 0 % |
| Navío con todo a N3 vs Capitán pirata (1.1) | 9–16 s | 5–15 % |
| Navío con todo a N3 vs Fragata con todo a N3, PvP (1.1) | Gana el Navío en ≥ 95 % | 45–75 % |

*Referencia de `game-product` (Monte Carlo, 1 000 duelos, ambos a tiro): 2 Bergantines contra el Capitán, 18,0 s, 32 % y 0,00 muertes; Bergantín contra Cañonera, 18,0 s y 17 %; Balandra contra Cañonera, 68 %. En el juego real, la cañonera mantiene la distancia y alarga los duelos. Medido con la IA real del Capitán (I2, H-305, dev-npc): con 2 Bergantines, el objetivo pierde el 25,0 %, dentro de la banda del 20–45 %.*
*Referencia de las filas 1.1 (valor esperado por andanadas, sin Monte Carlo; HIPÓTESIS hasta BACKLOG AC-163): Goleta contra Pirata, 20,5 s y 24 % (6 andanadas de 84 de daño; el pirata dispara 5 de 52,8 sobre 1 100); Goleta contra Cañonera, 25 s y 33 %; Navío contra Capitán, 12,5 s y 10 % (5 andanadas de 384; el capitán dispara 4 de 109,2 sobre 4 480); Navío contra Fragata, 24,5 s y 62 % (la Fragata necesitaría 15 andanadas y solo dispara 9).*

## 10. Botín y economía

| Regla | Valor |
|---|---|
| Oro inicial | 100 |
| Reparto de la recompensa de un NPC | Proporcional al daño infligido por cada jugador que haya impactado en los últimos 60 s, redondeado hacia abajo. Cuenta todo su daño, también el anterior a esos 60 s, y queda fuera quien lleva más de 60 s sin impactar (`src/game/world.ts:737-741` y `:796`; texto corregido el 2026-10-17 para que diga lo que hace el código, R-14 de QA). El resto va a quien más daño hizo; si hay empate, a quien dañó primero. **La suma es exactamente la recompensa y se acredita una sola vez.** |
| Restos flotantes (P1) | Al hundirse un NPC aparece una caja en su posición con el valor "Restos" de §9. La recoge el primer jugador que pase a ≤8 m. Desaparece a los 30 s. |
| Penalización por muerte | −10 % del oro actual (redondeado hacia abajo). En PvE se pierde; en PvP (P1) lo recibe quien te hundió. |
| Munición | Infinita (no se compra) |
| Tope de oro | 999 999 |

**Curva objetivo**: se verifica con el bot "barco primero" de AC-60 (mediana de 5 semillas). Es una cota de **factibilidad**: un jugador que priorice las mejoras llegará al Bergantín hacia el minuto ~28–32, pero con un barco más fuerte desde antes. Las dos rutas son válidas. Con "lo más barato primero" no se pueden cumplir a la vez "Bergantín ≤ 20 min" y "todo ≥ 45 min": exigiría 6 800 de oro en 20 min (340 oro/min) frente a un máximo de 284 oro/min de media.

| Hito | Objetivo |
|---|---|
| Ingreso medio con Balandra N1 | **Mediana 130 oro/min** (125–167). Medido con el bot del AC-60, semillas 1–5, en `182a3d1` (`npx jest economy -t AC-60`): oro ganado hasta comprar el Bergantín entre los minutos jugados, contando viajes, reparaciones y 1–4 muertes por corrida |
| Primera mejora (≤500 oro) | ≤ 4 min (medido: 3,3) |
| Bergantín | ≤ 20 min (medido: 16,2) |
| Todo comprado (12 800 oro) | 45–70 min (medido: 46,3; por semilla 46,3 · 45,4 · 45,9 · 54,7 · 51,7) |

**Riesgo:** el margen sobre el mínimo es de 1,3 min. **Cómo encaja I2:**
- La cañonera sustituye a 4 piratas (la población total sigue en 20) y cumple la regla de recompensa de §9. Por eso no debería subir el oro por segundo de combate.
- El jefe queda fuera de la curva: el bot del AC-60 no lo ataca, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto. **Medido con H-305 en I2** (dev-npc): la semilla 3 compra todo en 44,3 min, por debajo de 45, y la mediana de las 5 semillas sigue dentro de 45–70 min. AC-60 pasa, porque se juzga por la mediana, pero el margen se estrecha. Se vigila al volver a medir con H-306.
- Si con I2 el AC-60 sale de rango, la palanca es la recompensa de la cañonera (y sus restos), en pasos de 10 oro. No se tocan pirata, mercante ni precios.

**Cómo encaja la 1.1:**
- **AC-60 sigue midiendo el catálogo de la 1.0** (12 800 de oro). Su bot no compra la Goleta ni el Navío: si los comprara, la Goleta (3 000), más barata que la Fragata, retrasaría «todo comprado» y la cifra dejaría de ser comparable. El catálogo de la 1.1 (**27 800 de oro**, §11) lo mide aparte BACKLOG AC-164.
- El galeón queda fuera de la curva, como el Capitán (§9).
- El mapa nuevo (§4) alarga algunas rutas. AC-60 se vuelve a medir con él, con la población de I2 y con los amarres. Si sale de rango, la palanca es la misma de arriba.
- La XP no cambia el oro: es una barra aparte (§10b).

## 10b. Experiencia, niveles e insignias (1.1)

**Una sola barra de experiencia (XP).** Hundir un NPC da XP según su vida y su peligro. Hundir a un jugador da 100, más que cualquier NPC común, con reglas que quitan el premio de cazar novatos y de intercambiar hundimientos. La XP nunca se pierde. Hay 20 niveles en 5 insignias: Marinero hacia el Bergantín (~17 min), Contramaestre hacia «todo comprado» (~45 min), Almirante hacia las 4 h y el nivel 20 hacia las 6–7 h, solo contra NPC (estimación; la mide BACKLOG AC-158). Se guarda con el resto del progreso (§13); el invitado no guarda nada. Seafight separa la experiencia del PvE y un rango PvP aparte: aquí se unen porque lo pidió Jonattan y porque una barra se lee de un vistazo (REFERENCE §16 y §19).

### Reglas
| Regla | Valor |
|---|---|
| Fuente de XP | Solo hundir barcos, NPC o jugadores. Reparar, comprar o navegar no da XP |
| XP de un NPC | `vida / 15` si es hostil y `vida / 30` si es pasivo; ×2 si es de evento (Capitán, Galeón). Tabla abajo |
| Reparto | El del oro (§10; `splitReward`, `src/game/world.ts:763-776`, con el mismo filtro de `:796`): proporcional a todo el daño de cada jugador que haya impactado en los últimos 60 s (quien lleva más de 60 s sin impactar queda fuera) y redondeado hacia abajo; el resto, a quien más daño hizo (empate: quien dañó antes). Se acredita una sola vez. **Oro sin XP, solo en el mercante** (decidido por producto el 2026-10-17): como su XP es pequeña (10), quien hizo menos del 10 % del daño cobra oro y 0 XP. Es el mismo redondeo que el oro y se deja así. Un mínimo de 1 XP por participante rompería «la suma es la XP del NPC» y premiaría dar un solo disparo al NPC más fácil. XP sin oro no hay nunca (BACKLOG AC-145) |
| XP por hundir a un jugador | Base **100**, repartida por daño como la de un NPC. A la parte de cada atacante se le aplican su factor de nivel y su factor de repetición, y se redondea hacia abajo. **El daño de los NPC no entra en el reparto**, igual que en el oro: el servidor solo anota el de los jugadores (`src/game/world.ts:735-745`). Si un pirata hizo el 90 % y un jugador el 10 %, ese jugador cobra los 100, con sus factores (decidido por producto, 2026-10-17, a pregunta de dev-npc). Motivo: es la regla del oro de los NPC, y otra regla solo para la XP pediría anotar el daño de los NPC sin otro uso. El oportunista no gana más que con un hundimiento en solitario, y la repetición y el nivel siguen frenándolo |
| Nivel que usan los factores | El de cada jugador **justo antes de acreditar** ese hundimiento: la XP de un hundimiento no cambia su propio factor. Es lo que dan las cifras de BACKLOG AC-148 y AC-149 (decidido por producto, 2026-10-17) |
| Factor de nivel (Δ = nivel de la víctima − nivel del atacante) | Δ ≥ 0: × (1 + 0,1 · min(Δ, 5)), hasta ×1,5. Δ < 0: × max(0, 1 − 0,25 · \|Δ\|): −1 → 0,75; −2 → 0,5; −3 → 0,25; −4 o menos → 0 |
| Factor de repetición (por pareja atacante → víctima) | En los 30 min que siguen al primer hundimiento con XP de esa pareja: el 1.º ×1, el 2.º ×0,5 y los siguientes ×0. Pasados los 30 min, la pareja vuelve a empezar. **«Con XP» quiere decir que el atacante cobró más de 0:** un hundimiento que no le da XP (p. ej., a 4 o más niveles por encima de la víctima, o con una parte del reparto que redondea a 0) no abre la ventana ni avanza en ella. Así, un veterano que hunde a un novato no le gasta la ventana para cuando el novato suba (decidido por producto, 2026-10-17, a pregunta de dev-npc). La pareja inversa (la víctima hundiendo al atacante) cuenta aparte. Vive en la memoria del servidor: un reinicio la borra. El cliente solo recibe sus parejas abiertas, para el panel del objetivo (§13, «Piezas de red de la 1.1») |
| Víctima protegida o en la zona segura | No se le puede atacar (`src/game/world.ts:141-154`), así que no da XP |
| Al hundirte | No pierdes XP ni nivel. Pierdes el 10 % del oro, como hasta ahora (§10) |
| Oro en PvP | Sin cambios: la penalización va entera a quien da el último golpe (`src/game/world.ts:818-821`). La XP, en cambio, se reparte por daño |
| Nivel | Se calcula con la XP total y la tabla de abajo; nunca se guarda aparte. Máximo 20 |
| Tope de XP | 9 999 999. Por encima del nivel 20 se sigue sumando, sin efecto |
| Invitado | Gana XP y sube de nivel durante la sesión, pero no se guarda: vuelve a 0, igual que su oro vuelve a 100 (AC-97) |
| La tabla no se endurece | Publicada la tabla, solo puede abaratarse: así nadie baja de nivel ni pierde un barco que ya desbloqueó. El balance se corrige con la XP que se gane después |
| ¿Desbloquea algo? | **Sí, los dos barcos nuevos** (decidido, Q27): la Goleta pide nivel 5 y el Navío, nivel 9 (§6). Lo de la 1.0 no pide nivel |

### XP por NPC
| NPC | Vida | Tipo | XP | XP por segundo de combate de una Balandra N1 (DPS 21,0, §7) |
|---|---|---|---|---|
| Mercante | 300 | Pasivo | 10 | 0,7 |
| Pirata | 450 | Hostil | 30 | 1,4 |
| Cañonera pirata (I2) | 900 | Hostil | 60 | 1,4 |
| Capitán pirata (I2) | 1 800 | Hostil, de evento | 240 | 2,8, repartida en el grupo |
| Galeón del tesoro (1.1, P2) | 2 400 | Pasivo, de evento | 160 | 1,4 (sus escoltas dan 30 cada una) |
| Jugador del mismo nivel, la 1.ª vez | — | — | 100 | — |

*Por qué estos números:*
- **El hostil paga el doble que el pasivo por punto de vida**, porque el riesgo se paga. En Seafight la diferencia es de ~×10 (REFERENCE §16), pero aquí el mercante tiene que seguir valiendo para quien aún no puede con un pirata.
- **Jugador = 100**, lo que pidió Jonattan: más que cualquier NPC común. Equivale a un hostil de 1 500 de vida, del orden de un Bergantín con casco N2 (1 680). Solo los NPC de evento dan más, y se reparten en grupo.
- **La misma lógica por vida que el oro** (§9): añadir tipos de NPC no sube la XP por segundo de combate.

| Δ de nivel | −4 o menos | −3 | −2 | −1 | 0 | +1 | +2 | +3 | +4 | +5 o más |
|---|---|---|---|---|---|---|---|---|---|---|
| Factor | 0 | 0,25 | 0,5 | 0,75 | 1 | 1,1 | 1,2 | 1,3 | 1,4 | 1,5 |
| XP de un hundimiento en solitario, la 1.ª vez | 0 | 25 | 50 | 75 | 100 | 110 | 120 | 130 | 140 | 150 |

### Niveles e insignias
| Nivel | XP total | XP del nivel | Insignia | Hito estimado (bot PvE de AC-60; HIPÓTESIS hasta AC-158) |
|---|---|---|---|---|
| 1 | 0 | — | Grumete | Inicio |
| 2 | 60 | 60 | Grumete | 2,3 min |
| 3 | 150 | 90 | Grumete | 5,8 min |
| 4 | 300 | 150 | Grumete | 11,5 min |
| 5 | 500 | 200 | **Marinero** | 17,3 min (Bergantín a los 16,2) |
| 6 | 800 | 300 | Marinero | 21,4 min |
| 7 | 1 200 | 400 | Marinero | 26,9 min |
| 8 | 1 700 | 500 | Marinero | 33,7 min |
| 9 | 2 400 | 700 | **Contramaestre** | 43,3 min («todo comprado» a los 46,3) |
| 10 | 3 300 | 900 | Contramaestre | 53,5 min |
| 11 | 4 500 | 1 200 | Contramaestre | 66 min |
| 12 | 6 000 | 1 500 | Contramaestre | 82 min |
| 13 | 8 000 | 2 000 | **Teniente** | 1 h 43 min |
| 14 | 10 500 | 2 500 | Teniente | 2 h 09 min |
| 15 | 13 500 | 3 000 | Teniente | 2 h 41 min |
| 16 | 17 000 | 3 500 | Teniente | 3 h 18 min |
| 17 | 21 000 | 4 000 | **Almirante** | 4 h 00 min |
| 18 | 25 500 | 4 500 | Almirante | 4 h 47 min |
| 19 | 30 500 | 5 000 | Almirante | 5 h 40 min |
| 20 | 36 000 | 5 500 | Almirante | 6 h 38 min |

| Insignia | Niveles | Llega hacia | Qué debe comunicar (para `game-ux`) |
|---|---|---|---|
| Grumete | 1–4 | El inicio | Recién llegado: la más sencilla de las 5 |
| Marinero | 5–8 | El Bergantín | Ya sabe combatir |
| Contramaestre | 9–12 | Todo el catálogo de la 1.0 | Veterano |
| Teniente | 13–16 | ~1 h 45 min | Peligroso en PvP |
| Almirante | 17–20 | ~4 h | El máximo: la más vistosa de las 5 |

*«Capitán» no se usa como rango, para no confundirlo con el Capitán pirata (§9) en el feed ni en los avisos.*

**Qué deben comunicar las insignias (el diseño es de `game-ux`):**
- **El orden se ve sin leer:** de Grumete a Almirante se nota cuál es mayor.
- **Se leen a tamaño de icono de placa** (12–16 px, ART-DIRECTION §11.1) y en escala de grises, en 1440×900 y en 390×844.
- **No se confunden** con los iconos de relación (estrella, ancla, calavera, moneda, corona, bomba) ni con los de estado (escudo, espadas): la insignia dice rango, no si el barco es amigo o enemigo, y la propia y la ajena se ven iguales.
- **En la placa va solo la insignia: 5 dibujos, sin marcas del grado dentro de cada una.** El nivel exacto se lee en el panel del jugador y en el del objetivo (§14). *Por qué (medido por `game-ux`, 2026-10-17):* con 0–3 marcas de grado, su regla de legibilidad AD-40 falla (0 px de diferencia entre dos variantes a tamaño de placa). En combate basta con saber el tramo: una víctima dos insignias por debajo está como mínimo 5 niveles por debajo y ya no da XP (§10b, «Reglas»). El número exacto se consulta al seleccionar.

### Abuso: casos y cotas
| Caso | Regla que lo frena | Cota medible |
|---|---|---|
| Dos amigos que se hunden por turnos | Factor de repetición | Si no cambian de nivel (p. ej., los dos en el nivel 10): **≤ 300 XP por hora cada uno** (2 ventanas de 30 min × 150; 5 XP/min), frente a ~73 XP/min del PvE con Bergantín (abajo). En los primeros niveles, donde uno sube antes y el otro cobra Δ = +1 o +2: **≤ 450 por hora** (2 × 150 × 1,5, el factor máximo; 320–330 en la práctica, con el máximo de 330 en el orden ABABAABB, que QA halló por fuerza bruta; BACKLOG AC-149 b), frente a ~26 XP/min del PvE con Balandra: menos de un tercio, y solo mientras duran esos niveles (Grumete: ~17 min de PvE hasta el nivel 5). BACKLOG AC-149, casos (a) y (b) |
| Veterano que caza novatos | Factor de nivel: 0 XP a 4 o más niveles por debajo | 0 XP. El oro de la penalización sí lo gana (§10). No se le prohíbe atacar en la 1.1 (Q30, decidida): se revisa con el log de AC-148 |
| Víctima protegida o en la zona segura | No se le puede atacar | 0 XP |
| Cuentas alternas (crearlas es gratis: solo usuario y contraseña, Q13) | Repetición por pareja y factor de nivel: una cuenta nueva (nivel 1) no da nada a partir del nivel 5 | Peor caso: 19 cuentas del mismo nivel que el atacante, turnándose, dan 19 × 150 XP cada 30 min ≈ 95 XP/min, el ritmo del PvE con la Fragata a N3: nunca rinde más que jugar. **Se acepta.** No se puede saber si dos cuentas son de la misma persona con los datos que hoy se guardan |
| Robar el último golpe | La XP se reparte por daño | Dar el último golpe no da más XP |
| Rematar a un jugador al que hundía un pirata | El daño de los NPC no entra en el reparto (arriba, «XP por hundir a un jugador») | Como mucho, lo de un hundimiento en solitario, con los factores de nivel y de repetición. **Se acepta**, como en el oro |
| Hundirse a propósito | La XP no se pierde | No hay nada que ganar |
| Desconectarse para no morir | El barco sigue 10 s en el mundo y se le puede atacar (AC-96) | Igual que hoy |

### Balance verificable
**Modelo de `game-product` (HIPÓTESIS hasta BACKLOG AC-158).** El ritmo de XP sale del oro medido, porque la XP de cada NPC va en proporción a su oro:
- **XP por oro de recompensa:** 10/60 = 0,17 en el mercante y 30/105 = 0,29 en el pirata y la cañonera.
- **Contando los restos** (§9), 10/75 = 0,13 y 30/130 = 0,23.
- **El modelo toma el punto medio, 0,20 XP por cada oro ganado**, y el rango, de 0,13 a 0,29.

| Fase (bot de AC-60) | Oro/min (fuente) | XP/min estimada (rango) |
|---|---|---|
| Balandra N1, del inicio al Bergantín (0–16,2 min) | 130, medido en `182a3d1` (§10, fila «Ingreso medio con Balandra N1») | 26 (17–37) |
| Del Bergantín a «todo comprado» (16,2–46,3 min) | ≥ 359: 10 800 de oro gastados en 30,1 min (§10, filas «Bergantín» y «Todo comprado») | 73 (48–103) |
| Fragata con todo a N3 (desde los 46,3 min) | Sin medir | 95 (HIPÓTESIS: +30 % sobre la fase anterior) |

Con esas tasas salen los tiempos de la tabla de niveles: XP acumulada de 421 a los 16,2 min y de 2 618 a los 46,3 min. **Cotas que se asertan (AC-158):** nivel 2 en ≤ 4 min, nivel 5 en 12–25 min y nivel 9 en 35–60 min, con la mediana de 5 semillas. Los niveles 17 y 20 se proyectan con la XP/min medida en los 20 min siguientes a tenerlo todo: 3–6 h y 5–10 h. **Si sale de rango, la palanca es la tabla de niveles** (multiplicar todos los umbrales por un mismo factor, antes de publicar), no la XP de los NPC.

**El PvP frente al PvE:** un hundimiento de un jugador del mismo nivel (100 XP) vale ~1,4 min de PvE con Bergantín. Un duelo de dos Bergantines con cañones y casco N2 dura ~34 s sin reparar (1 680 de vida frente a 48,9 de DPS, §7), más lo que cueste encontrarse. Así, el PvP rinde del orden del PvE (50–100 XP/min, HIPÓTESIS), con más riesgo. Es la intención: más XP por hundimiento, no un atajo.

## 11. Puerto, mejoras y barcos

- **Tienda**: se abre con el botón o `P` solo **dentro de la zona segura**. Abrirla no detiene el barco. El servidor valida todas las compras: dentro de la zona, oro suficiente, nivel anterior comprado y artículo no poseído. **1.1:** y, para la Goleta y el Navío, el nivel mínimo del jugador (§6; Q27). Un barco bloqueado se ve en la tienda con el nivel que pide («Requiere nivel 5 (Marinero)»), antes de intentar comprarlo, y la compra se rechaza con ese mismo texto.
- **Mejoras globales**: se conservan al cambiar de barco y al morir.
- **Cambio de vida máxima** (comprar casco o cambiar de barco en el puerto): la vida actual conserva el mismo **porcentaje**, salvo al comprar un barco nuevo, que sale con la vida llena.

| Mejora | Nivel 1 | Nivel 2 | Nivel 3 |
|---|---|---|---|
| Cañones | §7 | 500 oro | 1 500 oro |
| Casco (vida máx.) | ×1,0 | ×1,2 — 400 oro | ×1,4 — 1 200 oro |
| Velas (vel. máx.) | ×1,0 | ×1,1 — 300 oro | ×1,2 — 900 oro |

- **Barcos**: comprar un barco te cambia a él con la vida llena. Los barcos comprados quedan en propiedad y se puede cambiar entre ellos gratis en el puerto.
- **Total de la progresión**: 2 000 + 6 000 + 500 + 1 500 + 400 + 1 200 + 300 + 900 = **12 800 oro**. **1.1:** con la Goleta (3 000) y el Navío (12 000), el catálogo completo suma **27 800 oro**. Los 12 800 siguen siendo la cifra de AC-60 (§10).

## 12. Muerte y reaparición

| Paso | Regla |
|---|---|
| Vida ≤ 0 | Estado **Hundiéndose** durante 3 s. No se puede seleccionar ni atacar. Los ataques contra él terminan. |
| Pantalla de muerte | Muestra quién te hundió, el oro perdido y una cuenta atrás de 8 s desde la muerte. El botón **Zarpar** se activa al llegar a 0 (no hay reaparición automática, para evitar barcos AFK). También zarpa con `Espacio` o `Enter`, y nunca antes de que termine la cuenta. El servidor admite el `respawn` con una tolerancia de reloj de 2 ticks (100 ms) antes del final, para que el primer clic no se rechace por desfase cliente-servidor. |
| Reaparición | En el anillo del puerto, con la vida al 100 %, la misma clase y las mismas mejoras. **1.1:** en un amarre libre del puerto, atracado de popa (§4, «El puerto»); el anillo solo si los 12 están ocupados |
| Protección | 15 s o hasta que el jugador ataque, lo que ocurra primero. Mientras dura, ningún pirata lo elige como objetivo y ningún jugador puede dañarlo. Tiene indicador visual. (Inspirado en Seafight, REFERENCE §10.) |
| Experiencia (1.1) | No se pierde XP ni nivel al hundirse (§10b). Quien te hunde gana XP según §10b. **La pantalla de muerte no cambia** (decidido por producto, 2026-10-17, R-12 de QA; ux ya lo recoge en ART-DIRECTION §12.9). Motivo: la insignia de quien te hunde ya se ve en su placa antes del combate, y su nivel exacto, al seleccionarlo (§14); añadirla a la tarjeta toca la línea única de AC-106 sin dar una decisión nueva al jugador, porque cuando la lee ya está hundido. Queda en P3 (BACKLOG) |

## 13. Multijugador y red

| Parámetro | Valor |
|---|---|
| Jugadores por servidor | 20 (el jugador 21 recibe "Servidor lleno") |
| Entidades máximas | 20 jugadores + 20 NPC + 1 jefe = 41. **1.1 (P2):** 44 con el Galeón del tesoro y sus 2 escoltas (§9); AC-03, AC-88 y AC-89 se miden con 44 |
| Simulación | 20 Hz, autoritativa en el servidor |
| Snapshots | 10 Hz, **solo deltas** de las entidades que cambiaron dentro del área de interés (radio de 300 m alrededor del barco y, en vista libre (I2), también alrededor del centro de la vista). Snapshot completo al entrar. **Si no cambia nada, no se envía nada.** El Capitán pirata vivo se envía siempre, para el marcador del minimapa, y el Galeón vivo también (1.1, P2). **1.1:** la XP propia y el nivel de cada jugador viajan solo cuando cambian (al hundir algo o al subir de nivel), nunca en cada frame. También solo al cambiar viajan el **evento de ascenso** y las **parejas abiertas** («Piezas de red de la 1.1», debajo de esta tabla) |
| Interpolación en el cliente | Búfer de 100 ms. Sin predicción, también para el barco propio. El marcador de clic es inmediato y local. |
| Latencia del clic al movimiento visible | Entre 0 y 50 ms hasta el tick, entre 0 y 100 ms hasta el snapshot y 100 ms de búfer, más la red y el render. Medido en local: 263–309 ms. En producción hay que sumar el RTT. Es aceptable para un control por clic: "For RTS games, 250 milliseconds of command latency was not even noticed… between 250 and 500 msec was very playable" ([Bettner y Terrano, GDC 2001](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)). La respuesta inmediata la da el marcador (≤ 50 ms). Por encima de 500 ms con el RTT real, se evalúa la predicción del barco propio (P2). **Umbral en Railway: p95 ≤ 500 ms**, medido con AC-136 desde conexiones domésticas reales. Si no se cumple, bloquea la 1.0.0. |
| Presupuesto de bajada | ≤ 10 mensajes/s y ≤ 12 KB/s de media por cliente con el servidor lleno. En vista libre (I2): ≤ 10 mensajes/s y ≤ 16 KB/s |
| Subida en reposo | **0 mensajes** de juego si el jugador no actúa (el latido de Engine.IO queda excluido) |
| Límite de intenciones | 10/s por cliente (ráfaga de 20). El exceso se descarta. |
| Desconexión (P1) | El barco se queda 10 s en el mundo y se le puede atacar. Si el jugador reconecta en ese tiempo, recupera el mismo barco. |
| Persistencia (P0 para la 1.0.0) | Oro, mejoras, barcos en propiedad y barco activo, por el `userId` del JWT verificado de Clerk, en **Postgres en Railway** (Q2). El invitado no persiste. La vida y la posición no se guardan. Las compras y el cambio de barco se escriben antes de confirmarse; el oro, en ≤ 5 s. Un redeploy no pierde nada, y una sola sesión por `userId`. Si la BD falla al entrar, no se juega con un estado por defecto; si falla durante la partida, todos los jugadores con cuenta siguen jugando sin tienda y con aviso, y el invitado no nota nada (BACKLOG AC-129 a AC-133). Los límites aceptados (compra al morir, corte en cada deploy) están en BACKLOG, «Conocidos de la 1.0.0». **1.1:** también la **XP**, con las mismas reglas que el oro (escrita en ≤ 5 s y al desconectarse). El nivel se calcula de la XP y no se guarda aparte. El invitado sigue sin guardar nada |
| Formato de la fila (1.1, P0; fijado antes de la 1.0.3) | La columna `state` (jsonb) de `player_progress` pasa a `{ v: 2, gold, upgrades, ownedShips, activeShip, xp }`, con claves exactas como en la 1.0.2 (`server/progress.ts:45` en `v1.0.2`). `xp`: entero de 0 a 9 999 999. Ids de clase en `ownedShips` y `activeShip`: los 5 de la tabla «Ids de clase de la fila», debajo de esta tabla, con el detalle de lectura y escritura |
| Lectura de las filas de la 1.0 y vuelta atrás (1.1, P0) | Las filas `v: 1` de la 1.0 se leen con **0 de XP** (nivel 1) y el resto intacto, y pasan a `v: 2` cuando su jugador escribe: **no hay migración SQL** ni reescritura en bloque. Un registro mal formado se rechaza como cualquier registro corrupto (AC-131; los casos nuevos, en BACKLOG AC-156). Antes del deploy en prod se hace una copia de seguridad de la tabla y se prueba a restaurarla en un Postgres aparte. **Volver a la versión anterior no puede dejar fuera a nadie:** la 1.0.2 rechaza cualquier fila con XP o con un barco nuevo, porque valida las claves exactas y la lista cerrada de barcos (`server/progress.ts:45-52` en `v1.0.2`). Por eso la 1.0.3, que sale antes que la 1.1, trae solo un lector que acepta este formato y lo conserva al escribir (Q29, decidida; BACKLOG AC-157 y AC-179) |

**Piezas de red de la 1.1** (solo viajan al cambiar; no son intenciones):
- **Evento de ascenso** (barco e insignia nueva). Forma exacta: `{ type: 'rankUp'; shipId: string; rank: 2 | 3 | 4 | 5 }`, un `GameEvent` más de la lista `e` del frame (`src/game/types.ts:98-105` y `:165`). `rank` es el orden de la insignia en §10b: 1 Grumete, 2 Marinero, 3 Contramaestre, 4 Teniente y 5 Almirante; nunca vale 1, porque nadie asciende a Grumete. No lleva posición: el cliente usa la del barco. Sale en el frame del tick en que un jugador cambia de insignia, como mucho uno por jugador y tick. Lo reciben el dueño del barco y cada cliente que tiene ese barco en su área de interés en ese frame, con **la regla de visibilidad de los barcos**: centro a ≤ 300 m (`INTEREST_RADIUS`, `server/game-server.ts:312`; en vista libre, I2, también alrededor del centro de la vista). **No** usa los 300 + 60 m de los demás eventos (`EVENT_MARGIN`, `server/game-server.ts:93` y `:343`): entre 300 y 360 m el cliente no tiene el barco y no podría dibujar el efecto (decidido el 2026-10-17, R-29 de QA). En un frame completo no viaja ningún evento (`server/game-server.ts:372`), así que un ascenso que coincide con uno no da efecto, igual que un barco que entra en el área. Es distinto de la subida de nivel, que solo recibe el propio. Un hundimiento que cruza 2 insignias da 1 evento, con la final. **El cliente nunca deduce un ascenso de un nivel distinto:** un barco que entra en el área con otra insignia no dispara efecto ni feed. Es el disparador del efecto de ascenso (`VFX-SPEC.md:285`; BACKLOG AC-159).
- **Parejas abiertas**, con el estado propio, al entrar y al cambiar: por cada víctima con hundimientos con XP en su ventana de 30 min (§10b), cuántos lleva (1 o 2) y cuándo vence. El cliente expira la pareja con esa hora, sin otro frame. Sirven para el panel del objetivo (BACKLOG AC-160); el historial sigue viviendo en el servidor.

**Ids de clase de la fila (1.1)** (fijados el 2026-10-17; R-06 y R-31 de QA). Son los ids de la simulación (`src/game/constants.ts:132` para los de la 1.0) y **no** se derivan de los roles de ux ni de los `assetId`: el Bergantín es `brig` en la fila y `brigantine` / `ship_brigantine` en ux (ART-DIRECTION §18.2, ASSET-SPEC §8.4).
| Clase | Id en la fila | Desde |
|---|---|---|
| Balandra | `sloop` | 1.0 |
| Bergantín | `brig` | 1.0 |
| Goleta | `schooner` | 1.1 |
| Fragata | `frigate` | 1.0 |
| Navío de línea | `line` | 1.1 |

**Lectura y escritura de la fila en la 1.1 y en la 1.0.3** (decidido por producto el 2026-10-17; R-06, R-07 y R-19 de QA):
- **La 1.1** lee `v: 1` (con XP 0) y `v: 2`, y siempre escribe `v: 2`.
- **La 1.0.3** acepta exactamente `v: 1` y `v: 2` de este formato y juega con lo que sabe mostrar. Si el barco activo es nuevo, juega con el mejor de la 1.0 que posea.
- **Una `v: 2` sin ningún barco de la 1.0** (p. ej., `ownedShips: ["line"]`) **se acepta**: la 1.0.3 juega con la Balandra y, si escribe, la añade a `ownedShips` (queda `["sloop", "line"]`, con `sloop` como activo y la misma `xp`). El juego siempre deja la Balandra en la fila, pero el parser no lo exige (`server/progress.ts:50-52` en `v1.0.2`; `:81-83` en la 1.0.3): la 1.0.2 ya acepta filas sin ella, como `["brig"]`, y una así solo sale de una edición a mano. **Descartado: rechazarla como registro corrupto**, porque dejaría fuera a un jugador («No podemos cargar tu progreso») para proteger una regla que el juego no tiene; la Balandra es el barco inicial y no cuesta nada. *Corregido el 2026-10-17 (pregunta de dev):* antes este punto decía «la Balandra la tiene siempre», que vale para lo que escribe el juego, no para lo que acepta el parser.
- **Orden de `ownedShips`:** la 1.1 y la 1.0.3 lo escriben en el orden de la tabla de ids (`sloop`, `brig`, `schooner`, `frigate`, `line`), así que la misma propiedad da la misma fila en las dos. Ninguna depende del orden al leer: el parser lo normaliza (`server/progress.ts:56` en `v1.0.2`; `:87` en la 1.0.3). Al escribir, los tests asertan el orden exacto de la tabla, que es más estricto (`server/__tests__/progress.test.ts:109` y `server/__tests__/persistence-rollback.test.ts:160`). *Corregido el 2026-10-17 (dato de dev):* antes decía que los tests comparan los barcos como conjunto.
- **Al escribir, la 1.0.3 deja la misma `v` que leyó.** En una `v: 2` conserva `xp`, `schooner` y `line`, y guarda como activo el barco con el que juega. Al volver a la 1.1, el jugador aparece con ese barco y elige el Navío en el puerto. Una `v: 1` sigue en `v: 1`, así que la 1.0.2 la puede leer si hubiera que volver de la 1.0.3 a la 1.0.2 antes de publicar la 1.1.
- **La XP va en el jsonb, no en una columna.** Motivos: se escribe con el resto del progreso en la misma fila y con la misma guarda de `revision` (AC-130); no hace falta migración SQL, así que el deploy no cambia el esquema; y la 1.0.3 hace falta igualmente por los barcos nuevos, que van en `ownedShips`. **Descartada: una columna `xp`.** Necesitaría la migración 2 y repartiría una escritura en dos campos sin ahorrar la 1.0.3.
- **Descartado: que la 1.0.3 conserve el barco activo de la 1.1.** Añade un caso especial a una versión cuyo único trabajo es no dejar a nadie fuera, y al jugador le cuesta un clic en el puerto.

**Intenciones (cliente → servidor)**. La selección es local y no viaja por la red.

| Intención | Datos | El servidor valida |
|---|---|---|
| `moveTo` | `{x, z}` | Números finitos (se ajustan al límite); jugador vivo |
| `stop` | — | Jugador vivo |
| `attack` | `{targetId}` | El objetivo existe, está vivo, no es uno mismo y es atacable según §7 |
| `cancelAttack` | — | — |
| `repair` | `{on: boolean}` | Jugador vivo |
| `buy` | `{itemId}` | §11; desde la 1.1, también el nivel mínimo de la Goleta y del Navío (§6). La 1.1 no añade intenciones: la XP la da el servidor |
| `selectShip` | `{classId}` | Lo posee y está en la zona segura |
| `respawn` | — | Está muerto y la cuenta atrás terminó |
| `viewAt` (I2) | `{x, z}` o `null` | Solo mientras la vista libre se desplaza, como máximo 2/s; `null` al volver al seguimiento. Números finitos, ajustados al mapa |

**Identidad visible**: nombre de usuario de Clerk, hasta 16 caracteres. Invitado: `Invitado-XXXX`.

## 14. HUD: qué debe comunicar

El layout, la paleta y la forma los define `game-ux`. Aquí solo se fija qué debe entender el jugador. "Fuera de React" = se dibuja en el canvas de three.js o en una capa DOM superpuesta que se mueve por refs, sin pasar por el ciclo de render de React.

| Elemento | Comunica | Frecuencia máx. de render |
|---|---|---|
| Vida propia | Número + barra; alerta por debajo del 30 % | Al cambiar (≤ 10 Hz) |
| Oro | Total + animación "+N" al ganar | Al cambiar |
| Nivel, insignia y XP propios (1.1) | Insignia, nivel y cuánto falta para el siguiente (barra de XP); «Nivel máximo» en el 20 | Al cambiar |
| XP ganada (1.1) | «+N XP» con la parte propia del reparto, junto al «+N oro». En el feed de escritorio, en la misma línea: «Hundiste a Pirata +105 oro · +30 XP»; en móvil, en el aviso. Con 0 XP no sale nada de XP: ni el «+N XP» flotante ni el tramo «· +0 XP» del feed (p. ej., «Botín +5 oro» en el mercante, AC-145) | Al cambiar |
| Subida de nivel (1.1) | Aviso «¡Nivel N!» y, si cambia de insignia, «Ahora eres <insignia>». Con varios niveles de golpe (el Capitán), un solo aviso con el nivel final. No es un modal: no interrumpe el combate | Al cambiar |
| Panel de objetivo | Nombre, tipo (hostil / pasivo / jugador), vida, distancia, "En alcance" o "Fuera de alcance". **1.1:** si es un jugador, también su nivel y su insignia («Jugador · Nivel 13 · Teniente») | ≤ 10 Hz |
| Recarga | Progreso de la recarga **junto al barco propio** (como en Seafight, REFERENCE §3) | Fuera de React |
| Estado de acción | Inactivo / Armado / Disparando / Reparando | Al cambiar |
| Anillo de selección y círculo de alcance | Objetivo marcado; alcance propio visible mientras haya objetivo | Fuera de React |
| Números de daño y salpicaduras | **Un número por andanada** = suma de sus impactos (`impactos × daño`), no uno por bala. Si la andanada no acierta ninguna bala: "Fallo", solo cuando el tirador o el objetivo es el jugador propio. Cada bala fallada deja una salpicadura | Fuera de React |
| Etiquetas de barcos | Nombre + barra de vida; tipo distinguible **sin depender solo del color**. **1.1:** la placa de cada jugador (propio y ajenos) lleva su insignia, **solo la insignia y sin el número de nivel** (§10b); los NPC no. Sin perder la distinción propio / otro jugador (AC-72) ni pasar del ancho máximo de la placa (ART-DIRECTION §11.1) | Fuera de React |
| Minimapa (P1) | Mapa completo (islas, puerto, zona segura) + entidades dentro del área de interés; propio, jugadores, piratas, cañoneras, mercantes y capitán con **color y forma**. Clic o arrastre mueve la vista (I2) | ≤ 2 Hz |
| Aviso del jefe (I2) | Aviso a todos al aparecer el capitán, con su sector; marcador visible en el minimapa desde cualquier punto; feed al hundirlo | Al cambiar |
| Aviso del galeón (1.1, P2) | Lo mismo para el Galeón del tesoro: aviso al aparecer, marcador propio en el minimapa, feed al hundirse o al escapar (§9) | Al cambiar |
| Tienda (1.1) | Los barcos que piden nivel muestran cuál, y se ven bloqueados hasta tenerlo (§11) | Al abrirla |
| Puerto en el minimapa (1.1) | Icono propio del puerto dentro de la zona segura (§4) | ≤ 2 Hz, con el minimapa |
| Vista libre (I2) | Botón **Centrar** visible solo en vista libre e indicador en el borde de la pantalla hacia el barco propio | Fuera de React (el indicador) |
| Atacante fuera de pantalla (I2) | Si un barco que te está disparando no se ve, un indicador en el borde apunta hacia él mientras dure el ataque y 3 s después. Comparte componente con el indicador de vista libre | Fuera de React |
| Zona segura | Borde visible en el mundo + aviso "Zona segura" en el HUD | Al cambiar |
| Protección | Indicador sobre el barco + tiempo restante | Al cambiar |
| Feed de eventos (P1) | "Hundiste a Pirata +105 oro", "X te hundió" (máx. 4 líneas, 5 s cada una) | Al cambiar |
| Conexión | Estado + ping si es > 200 ms | Al cambiar |

**Requisito de legibilidad (pilar P2)**: en una captura, sin leer texto, el jugador distingue su barco, otros jugadores, piratas hostiles, mercantes pasivos, su objetivo, si está a tiro y su vida baja, también en escala de grises. **1.1:** y, en la placa de otro jugador, su insignia, para saber si es un veterano antes de atacarlo o de dejarse atacar.

## 15. Flujo de pantallas

```
 Landing (/) ──► Iniciar sesión (Clerk) ──────────────┐
      └──► Jugar como invitado (solo AUTH_BYPASS=1) ──┤
                                                      ▼
                          /game: Conectando ──► Servidor lleno ──► Landing (mensaje)
                                  │
                                  ▼
            ┌──────────────► Juego ◄────────► Puerto (panel; solo en zona segura)
            │                  │
            │                  ├──► Hundido (overlay, 8 s) ──► Zarpar ──► Juego
            │                  │
            └── reintento ◄── Desconectado (overlay; reintento automático 3×: 1 s, 2 s, 4 s;
                                luego botón "Reintentar" o "Salir")
```
- **Iniciar sesión y registrarse** (`/sign-in`, `/sign-up`): la tarjeta de Clerk centrada, toda en español (Q8), sin scroll horizontal y con un enlace de vuelta a la landing. El registro avisa: «Guarda tu contraseña: no se puede recuperar» (Q25; BACKLOG AC-140).
- **Primera sesión (P1)**: 3 pistas contextuales, que se descartan solas al hacer la acción: "Haz clic/toca el agua para navegar" → "Selecciona un barco" → "Pulsa Espacio/Atacar".

## 16. Presupuestos técnicos (contrato con `game-developer` y `game-qa`)

| Métrica | Presupuesto |
|---|---|
| FPS en el equipo de referencia (Q9: M4 Pro), Chrome con GPU, 1440×900 CSS a DPR nativo, en reposo (AC-90) | Media ≥ 58 fps y p95 del trabajo por frame ≤ 7 ms en 60 s de combate. En un portátil común (M1 o Iris Xe), el criterio original: p95 ≤ 20 ms |
| Draw calls, escena estándar (20 barcos + 20 NPC + islas en pantalla) | ≤ 100 |
| Triángulos en pantalla | ≤ 250 000 |
| Commits de React en reposo (sin input ni cambios de datos del HUD) | 0/s |
| Commits de React en reposo con NPC visibles patrullando | ≤ 2/s (minimapa) |
| Commits de React en combate | ≤ 10/s |
| Mensajes cliente → servidor en reposo | 0 en 10 s |
| Tick de simulación con servidor lleno | p99 ≤ 4 ms (Node 24, la de Railway; BACKLOG DT-14), el menor de 3 repeticiones de 2 000 ticks (AC-03) |
| Crecimiento de la memoria JS del cliente (heap de V8 + ArrayBuffer) en 10 min de combate en régimen, tras el calentamiento (AC-91) | ≤ 15 MB |
| Del clic al movimiento visible, en Railway con el RTT real (AC-136) | p95 ≤ 500 ms |
| Servidor lleno en tiempo real: 20 jugadores con PvP y NPC durante 10 min (AC-142 en local, AC-143 en staging; 1.1) | Respuesta a una orden p95 ≤ 150 ms; retraso del event loop p99 ≤ 20 ms y máximo ≤ 100 ms; 0 ticks perdidos, 0 desconexiones y 0 órdenes perdidas; red y tick con los mismos presupuestos de esta tabla y de §13 |
| Islas y puerto (1.1) | ≤ 16 000 triángulos en **1 draw call** estático (hoy, 3 090 medidos en la 1.0.2; con los presupuestos por forma de `game-ux`, ≤ 14 850; ASSET-SPEC §5). Lo reparte `game-ux` por arquetipo |
| Islas en el sombreado del agua (1.1) | ≤ 16 formas (`src/client/models/ocean-material.ts:8`); la 1.1 usa 16. Una más exige medir AC-90 antes |
| Cálculo de ruta con el mapa nuevo (1.1) | AC-22 sin cambios (el menor de 3 p99 ≤ 2 ms), ahora con 16 formas (256 nodos frente a 112; `src/game/nav.ts:7`). **Los grafos de navegación se preparan al arrancar el servidor, nunca dentro de un tick**: hoy se construyen la primera vez que se pide cada margen (`src/game/nav.ts:66-93`), y con 16 formas y 9 márgenes distintos (§6) ese primer cálculo podría dar un pico en el event loop (HIPÓTESIS sin medir; la cota de AC-142 es un máximo de 100 ms) |
| Red con XP y niveles (1.1) | En AC-88, con el candidato entero, ≤ 12 KB/s por cliente con el servidor lleno (el tope de §13), y los campos de la XP (XP propia, niveles, evento de ascenso y parejas abiertas) ≤ 5 % de los bytes de bajada. La diferencia con la 1.0.2 se registra sin asertarla, porque el candidato lleva también I2 y los barcos nuevos (BACKLOG AC-154) |
| Entidades (1.1, P2) | Con el galeón y su escolta, 44: AC-03, AC-88 y AC-89 se miden con 44. Peor caso con todo en LOD0 y los presupuestos por clase de ASSET-SPEC §5 (los 20 jugadores en Navío, 3 200 cada uno; el Galeón, 2 800): **≈ 140 300 triángulos (56 % de 250 000) y 56 draw calls (≤ 60 con el tope de VFX) de 100**. Es una cota, no una predicción: QA-12 midió en la 1.0.2 51 draw calls y 72 526 triángulos (AC-89). **No se añaden islas ni NPC por encima de esto sin avisar a ux y al lead** |

## 17. Preguntas para Jonattan y decisiones de producto

> **Desde el 2026-10-17, en la 1.1.0, el alcance lo deciden producto y UX** (delegación de Jonattan: «No necesitas de mi aprobación, es producto y ux quien determina que sal[e]»; cita que trajo el lead). Por eso Q27 a Q30 ya no son preguntas, sino decisiones de producto registradas con la alternativa descartada y su motivo. Lo visual lo decide `game-ux`. Ninguno de los 5 hallazgos de ux del 2026-10-17 (§4, §6 y §10b) cambia estas cuatro decisiones. **Sigue siendo de Jonattan** aprobar cada deploy a prod con el botón del environment `production` de GitHub (`CLAUDE.md`, «Deploys a producción»): es un paso del flujo de publicación, no una pregunta.

| # | Pregunta | Propuesta por defecto |
|---|---|---|
| Q1 | ¿PvP en el slice? | P1: libre fuera de la zona segura, con protección al reaparecer |
| Q2 | ¿Persistir el progreso por usuario de Clerk? ¿Dónde: el `@vercel/kv` actual o algo en Railway? | **Respondida: Postgres en Railway (Jonattan, 2026-10-11).** Entra en la 1.0.0. Qué se guarda y cómo está en §13; el criterio es AC-97 + AC-129 a AC-133 |
| Q3 | ¿La reparación es gratis o es un sumidero de oro? | Gratis (la condición es detenerse y no disparar) |
| Q4 | ¿Una penalización por muerte del 10 % del oro es aceptable? | Sí |
| Q5 | ¿Sin monetización ni moneda premium en el slice? | Confirmar que queda fuera |
| Q6 | ¿Bastan 20 jugadores y 1 sala para el lanzamiento? | Sí; varias salas en P2 |
| Q7 | ¿El nombre visible es el usuario de Clerk o un nombre de barco que elige el jugador? | El usuario de Clerk |
| Q8 | ¿Interfaz solo en español o con i18n? | Solo español |
| Q9 | ¿Cuál es el portátil de referencia para el AC de 60 fps? | **Respondida (Jonattan, 2026-10-12): no hay otro equipo** («por ahora no tengo otro»), y elige la **opción A, «M4 Pro con margen»**. Para la 1.0.0, AC-90 se mide en su Mac16,8 (M4 Pro, 12 CPU / 16 GPU) con un umbral más estricto: p95 del trabajo por frame ≤ 7 ms en lugar de 20 (20 / ~2,8, por la diferencia de GPU con un M1; HIPÓTESIS sin medir). La medida en un portátil común (MacBook Air M1 o Intel Iris Xe) queda para cuando haya uno; el pilar P4 sigue apuntando a ese equipo. Va al CHANGELOG como conocido (f) (BACKLOG) |
| Q10 | ¿Habrá un monstruo marino en un incremento futuro? En Seafight solo se dañan con arpones (REFERENCE §6). Hay dos caminos: añadir arpones como segunda arma (fiel al referente, más trabajo) o un monstruo que se dañe con cañones (adaptación) | P3. Decidir después de medir I2 |
| Q11 | ¿Se aprueba el incremento I2 (H-305 Capitán pirata, H-306 Cañonera pirata, y E13 vista libre + AC-124)? El lead lo presentó tras `eb579e5` | **Respondida: Sí (Jonattan, 2026-10-11).** Se hace en el orden de la cola: Capitán → vista libre → Cañonera. El reparto está en BACKLOG, "Incremento I2". Es lo único que desbloquea **NPC (7)** y **Cámara (8)**, las dos dimensiones frente a Seafight que solo suben con I2 (QA-6 §13). Lo demás ya está definido: reglas en §5 y §9, AC-54, AC-55 y AC-111 a AC-124, y arte en ART-DIRECTION §12.8 y AD-28 a AD-31. **Q12 lo mueve a la 1.1.0** |
| Q12 | ¿Qué entra en la 1.0.0? | **Respondida: alcance A (Jonattan, 2026-10-11).** Entra el juego aprobado por QA más los bloqueos de publicación (persistencia, Clerk de producción, staging, latencia en Railway y el cierre de QA). **I2 completo pasa a 1.1.0**: H-305, H-306, E13 + AC-124 y AC-115. El arte del Capitán (`264363e`) entra latente, sin aparecer en partida. Rama `chore/release-1-0-0` desde `434b160`. Criterios: BACKLOG, «Release 1.0.0» |
| Q13 | ¿Clerk de producción? ¿En qué dominio? | **Respondida (Jonattan, 2026-10-11): el juego queda en https://seabattle.jonattan.dev.** Clerk no admite dominios de hosting como `*.up.railway.app` (`provider_domain_operation_not_allowed`). Lo verificó el lead: el dominio está en Railway prod con el certificado válido, y la instancia de producción de Clerk está en la raíz `jonattan.dev` (FAPI `clerk.jonattan.dev`). **La sesión vale para todos los subdominios de jonattan.dev**, así que el servidor solo acepta tokens emitidos para el origen del juego (AC-134). **Inicio de sesión solo con usuario y contraseña**, en prod y en dev: Google y GitHub no sirven para entrar. **Sin correo no hay recuperación de contraseña:** quien la olvide pierde la cuenta y su progreso. Jonattan lo eligió sabiéndolo, y va como conocido de la 1.0.0 (BACKLOG). **HIBP solo en el registro** (Jonattan, 2026-10-12, opción A): Clerk comprueba si una contraseña está filtrada (Have I Been Pwned) al registrarse, pero no al iniciar sesión. Con la comprobación al entrar, a quien le saliera una filtración Clerk le pediría restablecer la contraseña, y sin correo no podría: perdería la cuenta (ART-DIRECTION D58, punto 2, y D61). Jonattan lo cambia en el panel de Clerk prod y dev; lo verifica AC-139, paso 5. **Actualizado (O-19, QA-13): Jonattan decidió apagarlo también en el registro** (2026-10-12, dato del lead), en prod y en dev. Así, el registro acepta contraseñas que salen en filtraciones. Si algún día se enciende, el error en español ya existe (ART-DIRECTION D58) |
| Q14 | ¿Un entorno de staging antes de prod? | **Respondida: sí, en Railway (Jonattan, 2026-10-11)**, con su propia BD. El candidato pasa por staging (AC-135 y AC-136) antes de prod. **Configurado:** entorno `staging` de Railway en https://sea-battle-staging.up.railway.app, desplegado desde `chore/release-1-0-0`, en la misma región que prod (us-west2) y con las claves de Clerk de desarrollo, porque Clerk desaconseja las de producción fuera de prod. `/healthz` devuelve el commit desplegado. Su BD: Jonattan aprobó el 2026-10-12 un Postgres propio en el entorno `staging` y el push de la release; lo pone el lead. **La latencia (AC-136) se mide por dos redes** (Jonattan, 2026-10-11): la conexión de casa de Jonattan y los datos móviles de su teléfono por hotspot. QA hace la corrida final por la segunda |
| Q25 | Sin correo no hay recuperación de contraseña (Q13). ¿Se avisa al jugador al registrarse? | **Respondida: sí (Jonattan, 2026-10-11).** Una línea en el registro: «Guarda tu contraseña: no se puede recuperar». Quien pierde una Fragata sin saber que podía pasar lo vive como un fallo del juego, no como una regla. Lo verifica AC-140 (e). Si Clerk permite cambiar el texto de su formulario es HIPÓTESIS, sin verificar, y lo resuelven ux (dónde va) y dev-render (cómo). Q15–Q24 ya los usa ART-DIRECTION |
| Q26 | La prueba de estrés comprueba que un servidor aguanta los 20 jugadores que admite, combatiendo entre ellos y contra los barcos del juego. ¿Quieres saber además hasta cuántos jugadores aguantaría, aunque el juego no deje entrar a más de 20? | **No por ahora.** El límite de 20 es una decisión de diseño (Q6: 20 jugadores y una sala; más salas, después), no un límite de la máquina. La prueba ya mide qué parte del servidor queda libre con los 20, y eso da una estimación del margen sin forzarlo hasta que falle. Si algún día quieres más de 20 por sala, se mide entonces |
| Q27 | ¿El nivel sirve para algo dentro del juego o solo para lucirlo? | **Decidida por producto (2026-10-17, delegación de Jonattan): el nivel desbloquea los dos barcos nuevos.** La Goleta pide nivel 5 (Marinero) y el Navío de línea, nivel 9 (Contramaestre), además de su precio en oro. Los tres barcos de la 1.0 y las mejoras no piden nivel, así que la progresión con oro de AC-60 no cambia (§6, §10b, §11). **Descartada: solo para lucirlo.** Motivo: la XP no tendría efecto en el juego, y quien no mira las insignias no tendría razón para subir de nivel; además, los barcos nuevos son para después de la progresión con oro (§2, bucle largo), y el nivel es lo que marca ese «después» |
| Q28 | ¿«Más diseños de barcos» son barcos nuevos que se juegan distinto o también aspectos para el barco que ya se tiene? | **Decidida por producto (2026-10-17, delegación de Jonattan).** Son barcos nuevos con su propio juego: la Goleta y el Navío para los jugadores, y el Capitán, la Cañonera y el Galeón para los NPC (§6, §9; en Seafight, un «design» es un tipo de barco con estadísticas, REFERENCE §17). **Aspectos sin cambio de juego (colores, emblemas): fuera de la 1.1.** Motivo: cada aspecto nuevo hay que probarlo contra la lectura de relación (propio, jugador, hostil; AC-72), y la insignia ya da una marca personal visible. **Descartada: incluirlos ya.** Que un aspecto concreto se lea bien es de `game-ux` si se retoma (P3, BACKLOG). El Galeón es lo primero que se recorta si la 1.1 no llega (§9) |
| Q29 | ¿Se publica antes una versión pequeña que prepare la vuelta atrás? | **Decidida por producto (2026-10-17, delegación de Jonattan): sí, la 1.0.3 sale antes que la 1.1.** Solo trae el lector que acepta los datos de la 1.1 (la XP y los barcos nuevos) y no cambia nada de lo que se ve (BACKLOG AC-157 y AC-179). Así, si la 1.1 falla, se vuelve a la 1.0.3 sin dejar a nadie fuera ni perder lo ganado. Su deploy a prod, como todos, lo aprueba Jonattan con el botón de `production`: es un paso del flujo. **Descartada: publicar la 1.1 sin ella**, con la vuelta atrás a la 1.0.2 restaurando la copia de la BD. Motivo: perdería todo lo jugado desde el deploy, y la 1.0.2 rechaza cualquier fila con XP o con un barco nuevo (`server/progress.ts:45-52` en `v1.0.2`). **Estado: publicada.** La 1.0.3 está en prod con `d6c60a5` y su tag `v1.0.3`. La prueba rápida en prod pasó el 2026-10-18 a las 02:45Z (QA-24 §3), y producto aceptó BACKLOG AC-179 |
| Q30 | ¿Se impide que un veterano ataque a los jugadores de la primera insignia? | **Decidida por producto (2026-10-17, delegación de Jonattan): no en la 1.1.** El PvP sigue libre fuera de la zona segura (Q1). La regla de la XP ya quita el premio de cazar novatos (0 XP a 4 o más niveles por debajo, §10b), y la protección de 15 s al reaparecer sigue (§12). El servidor anota cada hundimiento entre jugadores con sus niveles (BACKLOG AC-148), y producto revisa la decisión con ese dato tras publicar. **Descartada: prohibir el ataque a los niveles 1 a 4 desde 4 niveles más.** Motivo: cambia la regla de combate de Q1 sin un dato que diga que hace falta, y añade un caso más de «no puedes atacar» que el jugador tendría que entender (O-26) |
