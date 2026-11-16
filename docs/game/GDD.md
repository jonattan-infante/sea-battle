# Sea Battle — Game Design Document (vertical slice)

> Autor: `game-product` · Versión 1.1 · 2026-10-17 (la 1.0 es del 2026-10-10) · Referente: [`REFERENCE-SEAFIGHT.md`](./REFERENCE-SEAFIGHT.md)
> Los números de este documento son la **fuente única de verdad** del juego. Deben vivir en un único módulo de constantes de la simulación, de modo que cambiar el balance no exija tocar la lógica.
> **«(1.1)»** marca lo que entra en la versión 1.1.0 (BACKLOG, «Release 1.1.0»). Lo que no lo lleva ya está en la 1.0.2, salvo lo marcado «I2», que también entra en la 1.1.0 (Q12).
> **Citas de código:** salvo que digan otra cosa, las `ruta:línea` de `src/` y `server/` son del código de la 1.0.2 (tag `v1.0.2`), y las de `sea-battle-i2/`, de la rama I2. El desarrollo de la 1.1 mueve esas líneas; donde importa, la cita dice también la línea en la 1.0.3.

## 0. Resumen

**Sea Battle es "Seafight en 10 minutos"**: navegas con un clic, marcas un barco, pulsas una tecla y tu barco dispara andanadas solo hasta hundirlo; recoges el oro y la experiencia, y en el puerto conviertes el oro en mejores cañones, casco, velas y barcos.
- **Un mundo de 1 000 × 1 000 m**, con un puerto de verdad en el centro (muelles y 12 amarres, 1.1), 12 islas y un campo de 3 escollos, de 4 arquetipos (1.1), 8 piratas y 4 cañoneras hostiles (I2), 8 mercantes pasivos, un Capitán pirata que aparece como jefe (I2) y un Galeón del tesoro pasivo que responde al fuego (1.1, P2), para **20 jugadores** por servidor.
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
**Regla de publicación (Jonattan, 2026-11-07):** «Todo lo que sale a prod debe salir visible o si no no tiene sentido, salvo una excepción justificada». Lo que entra en una versión sale encendido por defecto. Lo que un jugador no vea con los valores por defecto lleva una excepción escrita, que Jonattan ve antes del botón (BACKLOG AC-210). Por eso la 1.2 sale con el mapa de la 1.1, las 15 islas con su modelo y el I2 encendidos.
### Dentro (vertical slice)
| Área | Contenido |
|---|---|
| Mundo | 1 mapa, 1 puerto con zona segura, 6 islas, límites duros. **1.1:** el puerto pasa a tener muelles y 12 amarres, y el mapa, 12 islas y un campo de 3 escollos, de 4 arquetipos, más el puerto (§4) |
| Barcos del jugador | 3 clases: Balandra, Bergantín y Fragata. **1.1:** 5, con la Goleta y el Navío de línea (§6), y, si pasa el piloto, con más detalle y en 2 familias, española y británica, a elegir en el puerto (§6, Q31) |
| Combate | Selección, ataque persistente con andanadas, alcance, recarga, precisión, números de daño y reparación |
| Experiencia (1.1) | XP por hundir NPC y jugadores, con reparto por daño y reglas contra el abuso; 20 niveles y 5 insignias (§10b) |
| NPC | Pirata (hostil) y Mercante (pasivo). **Incremento I2, en la versión 1.1.0 y P0 en ella** (Q12; antes P1): Cañonera pirata (hostil, mantiene la distancia) y Capitán pirata (jefe). **1.1 (P2):** Galeón del tesoro, pasivo que responde al fuego, sin escolta (§9) |
| Cámara | Sigue al barco. **I2, en la 1.1.0 y P0 en ella (antes P1):** vista libre con arrastre, minimapa y flechas, y vuelta al barco (§5). **Desde la 1.1.1**, el jugador elige en Opciones entre «Centrada», la de partida, y «Libre», la vista libre (§5, «Cámara») |
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
| Aspectos del barco a elegir libremente (colores, emblemas) sin cambio de juego | Fuera de la 1.1 (Q28, decidida por producto). **Las familias de barcos sí entran** (§6, Q31), si pasa el piloto: son 2 estilos cerrados, no una personalización |
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
| Puerto | Isla puerto en (0, 0), radio 30 m. **1.1:** con muelles y 12 amarres (ver «El puerto», abajo). Jonattan pidió el 2026-10-18 que deje de ser un círculo: ver «El puerto con forma de isla», abajo. **Desde D92, aprobada el 2026-10-19,** es una unión de 7 círculos que llega a 54,32 m del centro (tabla de círculos, abajo) |
| Zona segura | Círculo de radio 110 m centrado en (0, 0) |
| Anillo de reaparición | Radio 60–90 m desde (0, 0), fuera de la isla, rumbo hacia afuera. **1.1:** se aparece en un amarre libre; el anillo solo se usa si los 12 están ocupados |
| Zona de mercantes | Rutas cerradas en el anillo de 150–330 m |
| Zona de piratas | 4 sectores (NE, NO, SO, SE) en el anillo de 300–460 m |

**Islas** (obstáculos; ni barcos ni NPC las atraviesan; disposición fija y determinista). Hasta la 1.0.2 son las 7 primeras filas; la 1.1 añade 9 formas y un arquetipo a cada una, sin mover ninguna de las 7. **Desde D83 (aprobada por Jonattan el 2026-10-18), la colisión de cada forma es la unión de sus círculos** (tabla de círculos, abajo). El radio de esta tabla queda como referencia: en el puerto y en I1–I6 es el círculo de la 1.0, que fija lo que queda exento (AC-199 b); en T1, T2 y los escollos coincide con su círculo principal; y en las calas es el de D67, que ya no se usa:

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

**Tabla de círculos (colisión B; D83)**, copiada por producto de ASSET-SPEC §9.7 el 2026-10-18, tras el visto bueno de Jonattan a D83. La genera `scripts/ux/mapa/circulos.py` (r11). Cada forma es la unión de sus círculos; el primero es el principal. **50 círculos: 43 de las islas y 7 del puerto.** Los del puerto los copió producto el 2026-10-19, tras el visto bueno de Jonattan a D92 (`docs/game/art/D92-puerto-isla.png`, r11 `56360cd`). Salen de `scripts/ux/mapa/puerto_isla.py`, variante v3 (`puerto-forma-v3.json` en el scratchpad, leído por producto). Antes iba un solo círculo provisional, (0, 0, 30). AC-04 y AC-170 comparan las constantes con esta tabla:

| Forma | Círculos (x, z, r), en m |
|---|---|
| PORT (D92) | ciudad este (14, 8, 22) · ciudad oeste (−12, 8, 22) · fuerte (0, −22, 15) · muelle este (31, −6, 17) · palmar (−31, −4, 17) · roca (−16, −30, 9) · islote (−39, −31, 4,5) |
| I1 | (260, 200, 45) · (212, 214, 30) · (305, 182, 28) · islotes (225, 150, 8) y (275, 255, 7) |
| I2 | (−305, 160, 28) · (−282, 188, 18) · (−318, 186, 13) · islote (−336, 138, 6) |
| I3 | (−220, −280, 55) · (−175, −250, 30) · islote (−158, −312, 9) |
| I4 | (250, −260, 40) · (212, −232, 24) · (262, −218, 18) · islote (205, −282, 8) |
| I5 | (20, 360, 30) · (−14, 340, 18) · islote (56, 338, 8) |
| I6 | (−413, −36, 21) · (−400, −18, 12) · islote (−368, −62, 9) |
| T1 | (150, −150, 22) · (128, −168, 14) · (170, −132, 12) |
| T2 | (−170, 150, 22) · (−190, 132, 14) · (−150, 168, 12) |
| E1a, E1b, E1c | (140, 260, 7) · (117,5, 299, 7) · (162,5, 299, 7), sin cambios |
| G1 | (373,66, −373,66, 13) · (355,27, −375,07, 9) · (375,07, −355,27, 9) |
| G2 | (−373,66, −373,66, 13) · (−375,07, −355,27, 9) · (−355,27, −375,07, 9) |
| G3 | (−373,66, 373,66, 13) · (−355,27, 375,07, 9) · (−375,07, 355,27, 9) |
| G4 | (373,66, 373,66, 13) · (375,07, 355,27, 9) · (355,27, 375,07, 9) |

Cada cala es un respaldo de r 13 a 8 m del centro, en el lado contrario al puerto, y 2 brazos de r 9 a 4 m hacia el puerto y a ±14 m de lado (`cala()`, `scripts/ux/mapa/circulos.py:28-32`). ASSET-SPEC solo escribe G1; producto sacó G2 a G4 con esa función, y salen simétricas de G1. Los canales entre isla e islote (de 2,1 a 22 m) son de la misma isla: no cuentan en los 46 m, y solo el de I6 (22 m) es navegable, y solo para la Balandra (ASSET-SPEC §9.7).

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
- Entre los bordes de dos islas cualesquiera hay **≥ 46 m** (2 × el margen del Navío, el barco más grande; §6), salvo entre los 3 escollos: así ninguna pareja de islas forma una pared por accidente. Con B se mide entre cualquier círculo de una isla y cualquiera de otra; con D83, el mínimo es **48,4 m** (I1–E1a; ASSET-SPEC §9.7), y dev-npc lo midió con el código real y pasa (BACKLOG AC-170).
- Ninguna forma toca la zona segura (salvo el puerto). **Las formas nuevas** no tocan ningún punto del arco de la guarida del Capitán (definido en §9: 440 m, de 7,5° a 82,5° de cada cuadrante, cada 2,5°) con su margen de 17 m, ni el anillo de la cañonera (400–470 m) con su margen de 16 m. Las islas de la 1.0 sí entran, y no pasa nada, porque los NPC solo nacen en puntos navegables (`navigableFor`, `src/game/world.ts:175-178`): en el anillo de la cañonera, contado con su margen (desde 384 m), entran I3, I4, I5 e I6 (bordes exteriores a 411, 401, 391 y 439 m), y del arco de la guarida, I6 deja sin navegar un punto, el de 7,5° del sector NO (a 10,0 m de su borde), que el código salta. **Con D83**, ese punto queda a 10,6 m de la unión de I6 y sigue siendo el único; lo que crece fuera de los círculos de la 1.0 queda a ≥ 57,0 m del arco, deja el anillo de la cañonera libre con 0,8 m de holgura (I1) y no tapa ningún punto del anillo que la 1.0 dejara libre (medidas de dev-npc, BACKLOG AC-170).
- **El agua ya no limita el número de círculos.** El sombreado de la 1.0 admite 16 (`src/client/models/ocean-material.ts:8`), y con la lista de círculos D83 dobla el coste de la pasada del océano. Por eso el agua pasa a la rejilla de candidatos (BACKLOG AC-198 e, salida 1): su coste no crece con el número de círculos, y el criterio es ≤ 3,35 ms de mediana en el M4 Pro con 44 y con 60. El mapa de D83 no se publica con el sombreado de la 1.0.

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
| Colisión | La de cualquier isla: un círculo sólido que ni barcos ni NPC atraviesan, con el margen de navegación de §6. Cada roca es un círculo de la tabla de círculos (arriba) |
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
| Entradas y salidas | **Sin diques ni bocanas sólidas**: se entra y se sale en cualquier rumbo. Desde un amarre hasta el centro de cualquier sector pirata, la ruta que traza el juego mide **≤ 1,16 × la línea recta**, y desde 300 m en 8 rumbos hasta el amarre más cercano, **≤ 1,15** (AC-177) | Dentro de la zona segura no hay combate (§7), así que un canal no tendría función táctica: solo alargaría cada viaje a la tienda y movería AC-60. *El 1,16 de la salida es del 2026-10-19, con D92:* el navegador del juego alarga unos 2 m una sola ruta, la del Navío del amarre 10 a la guarida NE (BACKLOG AC-177) |
| Tiempo para salir | Desde su amarre, la Balandra deja la zona en ~7 s (70 m) y el Navío en ~9 s (57 m), con la aceleración de §6 | La protección de 15 s (§12) cubre la salida |
| Tienda | Se abre en cualquier punto de la zona segura (§11, sin cambios). El **astillero** es el edificio que la señala. **1.3:** salvo bajo fuego (§11, «Zona segura bajo fuego (1.3)») | Cambiar la regla rompería AC-66 y AC-68 sin ganar nada. La excepción de la 1.3 impide curarse en mitad de un combate comprando un barco, que sale con la vida llena (BACKLOG AC-252) |
| Minimapa | Icono propio del puerto (un ancla, por ejemplo) dentro del círculo discontinuo de la zona segura. Entra si pasa la regla de plantillas del minimapa de `game-ux` (AD-29) junto con los marcadores del Capitán y la Cañonera; lo modela ux en su fase 2. Si no la pasa, el puerto se queda con el círculo de la zona segura, como en la 1.0 | Se encuentra el puerto desde cualquier punto, sin confundirlo con un barco |

**Qué debe comunicar el puerto (para `game-ux`):**
- «Esto es un puerto»: muelle de piedra en el borde de la isla, pantalanes, astillero, almacenes, grúa y faro, sin salir del círculo de 30 m.
- «Aquí estoy a salvo»: el borde de boyas de la zona segura (ya existe, ART-DIRECTION §8.2).
- «Aquí se compra»: el astillero se reconoce a 1,0× también en 390×844.
- «Este es mi sitio»: al aparecer, el barco propio se ve atracado de popa.
- «Por aquí salgo»: todo el contorno es salida; nada dibujado fuera del círculo de 30 m puede parecer un dique.

### Rediseño de islas y puerto (2026-10-18; Q32)
Jonattan pidió cambios a las láminas de islas y puerto (D67 y D68; cita en BACKLOG AC-192): «Las islas requieren de un rediseño junto con el puerto: 1. El puerto debe tener más diseño, detalle, colores. 2. Yo sería más arriesgado en el diseño». Sus referencias, fuera del repo por derechos, son un fuerte colonial caribeño sobre un acantilado, las murallas del Viejo San Juan con su garita y sus casas de colores, y una isla al estilo Seafight, de forma irregular y con selva densa.

**Qué debe comunicar (para `game-ux`; lo de arriba sigue valiendo):**
- **Islas:** formas irregulares, alargadas o con bahías, islotes satélite y selva densa en las tropicales. Cada arquetipo se sigue reconociendo, y el riesgo sigue creciendo con la distancia al puerto (arriba, «Lectura de diseño»).
- **Puerto:** una plaza fuerte colonial caribeña, con murallas, garita, baluarte y casas de colores, y más color y detalle que D68. Sigue diciendo lo mismo: «es un puerto, aquí estoy a salvo, aquí se compra y aquí aparezco», y todo su contorno sigue siendo salida (sin diques).

**La regla que no cambia: lo que se ve es lo que hay.** El barco choca donde se ve la costa, ni antes ni después. Un barco que se para en agua abierta, o que navega por encima de la tierra, rompe la confianza en el mapa (pilar P2). Cómo se cumple con formas irregulares lo decide producto con los datos de ux y de dev-npc (BACKLOG AC-199), entre estas opciones:

| Opción | Colisión | Qué cambia | Coste y riesgo |
|---|---|---|---|
| A · Círculo con costa irregular fina | El círculo de hoy | Solo el dibujo: la costa se mueve dentro de una banda de 3 m por dentro del círculo | El menor. Pero no da formas alargadas ni bahías, así que se queda lejos de la referencia de Jonattan |
| **B · Unión de círculos (elegida el 2026-10-18)** | Cada isla es la unión de 2 a 5 círculos, más sus islotes satélite | Las constantes del mapa, el grafo de rutas (más nodos), el sombreado del agua (más de 16 círculos) y las reglas de disposición contadas entre los círculos de islas distintas | Medio. Da formas alargadas, lóbulos, bahías entre lóbulos e islotes, y el código de colisión y de rutas sigue siendo de círculos |
| C · Polígonos | Contorno libre | La colisión, las rutas, la evasión de los NPC y la espuma del agua, todo de nuevo | **Descartada para la 1.1:** reescribe el sistema de movimiento con todos sus AC (AC-16 a AC-22, AC-171 a AC-177) |

**Por qué B** (decidido por producto el 2026-10-18, con la medida de dev-npc sobre el `Navigator` real; BACKLOG AC-199):
- **A no llega a la referencia por construcción:** con 3 m de banda, la isla sigue siendo redonda.
- **B cabe en el coste:** el grafo de rutas admite varios círculos por isla sin cambios. Con 41 círculos, AC-22 da 0,25 ms de p99, frente al límite de 2 ms, y preparar los 9 grafos al arrancar suma unos 0,1 s. dev-npc estima su trabajo en un 30–40 % más sobre el puesto 5 (ESTIMACIÓN). **Corregido el 2026-10-18 con D83 en el bucle real** (sonda de QA sobre `4afc607`; BACKLOG O-43): AC-22 da 5,565 ms con el margen 19, y el tick de AC-03, 12,014 ms, frente a sus cotas de 2 y 4 ms. Las formas sintéticas no predecían el coste de las rutas. B no se descarta, porque las rutas no tocan ninguna isla (AC-20) y el problema es de coste: lo perfila y optimiza dev-npc, y `MAP_1_1` no se activa hasta que AC-22 y AC-03 pasen con él.
- **Lo que hay que arreglar, se elija lo que se elija:** el punto navegable más cercano (`nearestNavigable`) falla ya hoy en los escollos con los márgenes de la Fragata y el Navío. Se corrige en el puesto 5 (BACKLOG AC-171).
- **El riesgo que queda sin medir es el agua.** Su sombreado admite 16 círculos (`src/client/models/ocean-material.ts:8`), y con B el mapa tiene de 41 a 60. El piloto lo mide con todos los círculos (BACKLOG AC-198 e). Si no cabe en AC-90, las salidas, en este orden, son: otra forma de pasarle las islas al agua; menos círculos; y la opción A. **Medido el 2026-10-18 con D83:** en el M4 Pro cabe, pero la pasada del océano pasa de 3,04 a 6,28 ms, el doble, así que producto toma ya la primera salida. Ahora el criterio es que el agua no cueste más que hoy con cualquier número de círculos (BACKLOG AC-198 e).
- **El cliente dibuja lo que simula el servidor:** las mismas formas, y el marcador de destino en el frame del clic, en el punto al que irá el barco (BACKLOG AC-199 e).

**Reglas de las formas con B:**
- **La tabla de círculos** (centro y radio de cada uno) la define `game-ux` como parte de su diseño, y producto la copia a este documento cuando Jonattan aprueba la lámina, para que AC-04 siga comparando las constantes con él. **Copiada el 2026-10-18 con D83** (arriba, «Tabla de círculos»), y la del puerto el 2026-10-19, con D92. **El centro de cada isla de la tabla de arriba no se mueve.** Es su punto de referencia, donde se coloca su modelo, y tiene que quedar dentro de la unión. Los círculos de la unión no tienen por qué estar centrados en él (decidido por producto el 2026-10-18, a pregunta de ux). En D83, el círculo principal de I2 está a 11,2 m del centro y el de I6 a 6,7 m, y los dos centros quedan dentro de su unión (cálculo de producto con la tabla de ux). Lo que importa del centro es que la isla no cambie de sitio. Las distancias que protegen la disposición (separación, zona segura, arco, anillo y guaridas) se miden sobre los círculos, no sobre el centro.
- **Las islas de la 1.0 que cambian de forma** (I1 a I6) siguen exentas en lo que ya ocupaba su círculo de la 1.0. **Lo que crezcan fuera de ese círculo cuenta como forma nueva**: respeta el arco de la guarida con 17 m de margen y el anillo de la cañonera con 16 m (reglas de disposición, arriba). Así, el cambio de forma no deja sin navegar ningún punto más del arco.
- **Las guaridas siguen navegables para el Navío:** en la 1.0 había 39,6 m del punto de la guarida NE a I4 y 41,3 m del de la NO a I3. Un lóbulo de I4 o de I3 no crece más de 16 m hacia su punto de guarida (dato de dev-npc), y AC-177 se comprueba con la tabla de ux antes de construir el arte. **Con D83** (medida de dev-npc, BACKLOG AC-177): NE, 39,7 m a I4; NO, 41,3 m a I3; SO, 68,7 m a la cala G3, que pasa a ser lo más cercano; y SE, 59,7 m al islote de I1 en (275, 255, 7). Todas ≥ 23.

~~**El puerto** conserva su círculo de colisión de 30 m y sus 12 amarres (arriba, «El puerto»): la plaza fuerte se dibuja dentro y el puerto **no** pasa a ser una unión de círculos.~~ *Sustituido el 2026-10-18* por «El puerto con forma de isla», abajo, tras el pedido de Jonattan.

### El puerto con forma de isla (pedido de Jonattan del 2026-10-18 sobre D82)
Jonattan pidió cambios a la lámina del puerto (cita en BACKLOG AC-192): «Quiero no sea un circulo, que sea mas irregular como una isla y que una parte sea palmeras y mas ver con plazas.»

**Decisión de producto (2026-10-18): el puerto pasa a ser una unión de círculos, como las islas (opción B).** Un círculo con costa fina (opción A) seguiría siendo redondo, que es justo lo que Jonattan no quiere, y la colisión y las rutas ya funcionan con uniones (BACKLOG AC-199).

**Qué debe comunicar además** (para `game-ux`; lectura de producto de la cita): una costa irregular, como la de una isla; una parte con palmeras, más verde; y plazas abiertas en el pueblo. Lo demás sigue igual: la plaza fuerte colonial (arriba), «es un puerto, aquí estoy a salvo, aquí se compra y aquí aparezco», y todo el contorno es salida, sin diques. Producto lee «mas ver» como «más verde»; si ux lo lee de otra forma, se lo pregunta a Jonattan con la lámina.

| Regla | Valor | Por qué |
|---|---|---|
| Colisión | Unión de **≤ 8 círculos**, que contiene el centro (0, 0), su punto de referencia. Con ellos, el mapa queda en ≤ 51 círculos | AC-22 ya se midió con 61 círculos (0,358 ms de p99, frente al límite de 2 ms; BACKLOG AC-199), y con la rejilla el agua no depende del número de círculos (AC-198 e). *Pero con D83 en el bucle real, AC-22 da 5,565 ms* (BACKLOG O-43): el tope de 8 se mantiene hasta ver el perfil de dev-npc |
| Tamaño | Ningún círculo pasa de **55 m** del centro, contando su borde (hoy, 30 m) | El puerto puede medir hasta 110 m de punta a punta, como una isla (I1 mide ~150 m de oeste a este con sus lóbulos; cálculo de producto con la tabla de círculos). Un Navío atracado queda entero dentro de la zona segura (55 + 2 + 42 = 99 < 110), y entre el puerto y las boyas quedan ≥ 55 m de agua |
| Zona segura | Sin cambios: círculo de 110 m centrado en (0, 0), con sus 24 boyas | AC-65 y AC-47 |
| Amarres | **12**, en una tabla de ux: para cada uno, un punto de muelle Q en el borde de la unión y un rumbo ψ hacia fuera. El barco atracado tiene el centro a L/2 + 2 m de Q en el rumbo ψ, con la popa hacia el muelle, a 2 m. Producto copia la tabla a este documento cuando Jonattan apruebe la lámina (AC-04) | Es la regla de hoy sin depender de un radio: hoy cada Q está a 30 m, en los rumbos 15°, 45°… 345° |
| Cada amarre, en las 5 clases | El centro del barco atracado está a su margen de navegación (§6) o más de **toda** la unión, no solo de su muelle, y su casco no se solapa con el de ningún barco de otro amarre (hoy el peor par, Navío–Navío, deja 5,75 m entre popas; `scripts/ux/puerto.py`, sección 4b) | Un muelle al fondo de una bahía estrecha dejaría la proa dentro de otro lóbulo |
| Amarre libre | La regla de hoy (ningún barco vivo con el centro a < 12 m del eje), con el eje desde el muelle: el segmento de Q a Q + 46 m en el rumbo ψ (hoy, de r 30 a r 76) | AC-176, sin cambios de fondo |
| Salida | Desde cada amarre y en cada clase, la recta en el rumbo ψ, del centro del barco atracado al borde de la zona segura, es navegable y mide **≤ 80 m**. Con la aceleración de §6, el Navío la recorre en ≈ 11,5 s desde parado (4,25 s acelerando, 18 m, y el resto a 8,5 m/s) | Cabe en los 15 s de protección (§12) con margen. Hoy son 57 m y ~9 s |
| Aparición de respaldo | Sin cambios: con los 12 ocupados, un punto navegable para la clase en el anillo de 60–90 m (`respawnPoint`, `src/game/world.ts:396-407` en `1e2022f`, con 50 intentos al azar; decía `:262-270`, QA-47). El puerto deja navegable para el Navío **≥ 50 % del área del anillo**, y el punto de último recurso del código, hoy (0, 75), es navegable para las 5 clases; si no lo es, dev lo cambia por uno que lo sea | Con la mitad navegable, agotar los 50 intentos tiene una probabilidad de 0,5⁵⁰, menos de 10⁻¹⁵. Un puerto que llegara a 55 m en todo el contorno dejaría el 45 % (cálculo de producto), así que la regla también pide que sea irregular |
| Rutas | AC-177: desde cada amarre hasta cada guarida, ≤ 1,16 × la recta, y desde 8 puntos a 300 m hasta el amarre más cercano, ≤ 1,15, las dos con la ruta que traza el juego. El 1,16 es del 2026-10-19, con D92 (antes, 1,15; BACKLOG AC-177) | Todo el contorno es salida, y obliga a repartir los amarres alrededor del puerto |
| Lo que se ve es lo que hay | AC-199 (a): la tierra visible queda dentro de la unión, y la costa, de 0 a 3 m por dentro de su borde | Como en las islas |
| Minimapa | El ancla del puerto (D87) y su costa círculo a círculo, como las islas (AC-199 e). Con D96 (aprobada por Jonattan el 2026-10-21 a las 02:57:06Z, sha256 `ca7a9caf53fb47068b89c88ca38481acba8d1f4a1276ed31a0629bcad30d3632`), la costa se pinta con los círculos de la tabla bajo un disco oscuro de 10 px de radio detrás del ancla, que la tapa (en la lámina asoma 1,0 px² en escritorio y 0 en móvil y apaisado): en el minimapa se ve el ancla, no la forma. Los barcos amarrados y el círculo de la zona segura van encima del disco | El puerto se encuentra desde cualquier punto |

~~**Mientras Jonattan no apruebe la lámina nueva**, valen el círculo provisional (0, 0, 30) de la tabla de círculos y las filas de «El puerto» (arriba), y los tests corren con ellos.~~ **Aprobada el 2026-10-19 (D92).** Los 7 círculos están en la tabla de círculos (arriba) y los 12 amarres, en la tabla de abajo. Estas reglas sustituyen ya a las filas «Colisión», «Amarres», «Aparición» (el eje del amarre) y «Tiempo para salir» de «El puerto».

**Amarres de D92** (copiados por producto el 2026-10-19 de `puerto-forma-v3.json`, la variante de la lámina aprobada, y puestos al día ese mismo día con los 2 cm de dev-npc; abajo). Q es el punto del muelle, a 14 mm o más por fuera del borde de la unión, y ψ el rumbo hacia fuera, en grados, con la convención de esta sección (0 = +Z, sur; 90 = +X, este). El centro de cada barco está a L/2 + 2 m de Q en el rumbo ψ, así que el del Navío está a 23 m y el de la Balandra a 10. La salida es la recta del centro del barco atracado al borde de la zona segura (≤ 80 m):

| Nº | Tramo | Q (x, z) | ψ | Centro del Navío | Salida del Navío | Salida de la Balandra |
|---|---|---|---|---|---|---|
| 1 | Ciudad este | (14,00, 30,02) | 0° | (14,0, 53,0) | 56,1 m | 69,1 m |
| 2 | Ciudad este | (25,67, 26,68) | 32° | (37,9, 46,2) | 50,5 m | 63,5 m |
| 3 | Ciudad este | (34,12, 16,96) | 66° | (55,1, 26,3) | 48,9 m | 61,9 m |
| 4 | Muelle este | (45,74, 2,51) | 60° | (65,7, 14,0) | 44,2 m | 57,2 m |
| 5 | Muelle este | (47,85, −8,37) | 98° | (70,6, −11,6) | 38,4 m | 51,4 m |
| 6 | Muelle este | (42,82, −18,24) | 136° | (58,8, −34,8) | 42,6 m | 55,6 m |
| 7 | Muelle este | (32,78, −22,93) | 174° | (35,2, −45,8) | 56,5 m | 69,5 m |
| 8 | Palmar | (−45,89, −12,25) | 241° | (−66,0, −23,4) | 40,3 m | 53,3 m |
| 9 | Palmar | (−47,58, −0,18) | 283° | (−70,0, 5,0) | 40,1 m | 53,1 m |
| 10 | Palmar | (−39,77, 10,59) | 329° | (−51,6, 30,3) | 53,6 m | 66,6 m |
| 11 | Ciudad oeste | (−24,94, 25,82) | 324° | (−38,5, 44,4) | 51,3 m | 64,3 m |
| 12 | Ciudad oeste | (−12,00, 30,02) | 0° | (−12,0, 53,0) | 56,3 m | 69,3 m |

Lo que miden con la tabla de la lámina, antes de los 2 cm, según ux (turno P3, dato de ux): los cascos más juntos quedan a 1,78 m (Navío–Navío, en los amarres 4–5, 5–6 y 6–7), y ningún centro está a menos de 12 m del eje de otro amarre. Además, el 86,5 % del anillo de 60–90 m es navegable para el Navío, y (0, 75) lo es para las 5 clases, con 23,1 m de sobra para el Navío. **Los barcos atracados y sus salidas quedan justo a su margen de toda la unión, con 0,00 m de sobra, por construcción.** La regla pide «a su margen o más», así que cumple. Si la prueba del juego (BACKLOG AC-199) saca un barco de su amarre por redondeo, dev-npc mueve Q unos centímetros hacia fuera, sin cambiar la regla ni lo que se ve, y producto copia la tabla nueva.

**Pasó el 2026-10-19** (dev-npc, `dev-npc-d92-diag2-7afca6d.log:6-11` y `:44-48`, leído por producto). En el juego, los barcos de los amarres 4, 5 y 9 quedaban de 2,11 a 5,12 mm dentro de su margen, así que 15 centros (3 amarres por 5 clases) y sus 15 salidas no eran navegables. Con cada Q movido 2 cm hacia fuera en su rumbo ψ, en los 12 amarres y con el OK del lead, la holgura más pequeña pasa a 14,37 mm, no falla ningún centro ni ninguna salida, la salida más larga mide 69,5 m y los cascos más juntos quedan a 1,79 m. La tabla de arriba ya es la nueva (`dev-npc-d92-tabla-7afca6d.log`, «δ 0.02 m en los 12»). Lo que se ve no cambia, así que no vuelve a Jonattan.

**Si el puerto nuevo no llega a la 1.1**, se aplica la regla de AC-198: la 1.1 sale con el mapa y el puerto de la 1.0. Si llegado ese momento las islas de D83 están listas y solo falta el puerto, sacarlas con el puerto de hoy cambiaría esa regla, y eso lo decide Jonattan (pregunta abierta; hoy no hace falta hacerla).

**Versión:** entra en la 1.1 si pasa un piloto, el puerto nuevo y una isla irregular en el juego (BACKLOG AC-198). Si no, la 1.1 sale con el mapa y el puerto de la 1.0, y el mapa nuevo, lógica y arte, pasa a la 1.2 (Q32).

## 5. Controles

### Escritorio
| Acción | Entrada | Regla |
|---|---|---|
| Navegar | Clic izquierdo en el agua | **Al soltar el botón**, si el puntero se movió ≤ 12 px; si se movió más, es un arrastre de la vista (abajo). Así funciona ya el toque (dato de dev). *Decidido por producto el 2026-10-18, a pregunta de dev para D89:* hasta la vista libre se navegaba al pulsar (`GameCanvas.tsx:85-89`, `pointerdown`, en `4a125e0`; dato de dev). Marcador inmediato en el punto. Un clic en una isla lleva al punto navegable más cercano (1.1: el más cercano que la clase pueda alcanzar, §6 punto 1b). Un clic nuevo reemplaza el destino. **No deselecciona ni cancela el ataque.** |
| Seleccionar | Clic izquierdo sobre un barco | También al soltar, con el mismo umbral de 12 px. Se acierta dentro de la silueta proyectada + 12 px. Si hay varios, gana el más cercano al cursor. **No genera tráfico de red.** |
| Ciclar objetivo | `Tab` / `Shift+Tab` | Recorre los barcos atacables a ≤150 m, del más cercano al más lejano |
| Atacar / cancelar | `Espacio` o botón **Atacar** | Alterna (*toggle*) sobre el objetivo seleccionado (§7) |
| Seleccionar + atacar (P1) | Doble clic sobre un barco atacable | Atajo |
| Cancelar / deseleccionar | `Esc` | La 1.ª pulsación cancela el ataque; la 2.ª deselecciona. Con la tienda o la pantalla de niveles abierta, la 1.ª la cierra. Con el panel de opciones abierto (1.1.1), una pulsación hace una sola cosa: cancela la espera de una tecla, si la hay; si no, cierra el panel (BACKLOG AC-205) |
| Zarpar (hundido) | `Espacio` / `Enter` o botón **Zarpar** | Solo cuando la cuenta atrás ha terminado; antes no hacen nada |
| Detener | `S` (por defecto; se cambia en Opciones desde la 1.1.1) | Borra el destino; el barco frena. Vale con las 2 cámaras |
| Reparar | `R` o botón **Reparar** | Alterna (§8) |
| Zoom | Rueda del ratón | 3 niveles de **extensión visible**: 0,7× (más cerca), 1,0× (por defecto) y 1,5× (más lejos). Con el panel de opciones abierto, la rueda no hace zoom (1.1.1, BACKLOG AC-205) |
| Puerto | `P` o botón **Puerto** | Solo dentro de la zona segura |
| Niveles e insignias (1.1) | `N` o clic en la insignia o el nivel del panel del jugador | Abre y cierra la pantalla de niveles (§14), en cualquier momento, también en combate. Un clic fuera la cierra y no hace nada más. No pausa el juego ni genera tráfico de red (BACKLOG AC-190). *2026-11-15 (producto):* **no está en la 1.2.0.** En `801c185`, `N` está reservada y no hace nada (`src/client/key-bindings.ts:21-22` y `:30`), y no hay pantalla de niveles; tampoco el toque de móvil de su fila. La lámina D78 está aprobada, y AC-190 pasa a la 1.2.x (BACKLOG, «AC-190 a la 1.2.x») |
| Mover la vista (I2; desde la 1.1.1, solo con la cámara «Libre») | Arrastrar en el agua (> 12 px), clic o arrastre en el minimapa, o las 4 teclas de la vista (por defecto, las flechas; se cambian en Opciones) | Con «Libre», entra en vista libre. Un clic sin arrastre sigue navegando. Con «Centrada», la de partida, la vista no se separa del barco: arrastrar es un clic al soltar (navega hasta donde se suelta), el minimapa solo se mira y las teclas de la vista no mueven nada (BACKLOG AC-206) |
| Centrar en mi barco (I2; solo con «Libre») | `C` (por defecto; se cambia en Opciones) o botón **Centrar** | Vuelve al seguimiento, y la cámara sigue en «Libre». Con «Centrada» no hace falta: no salen ni el botón ni el chip del barco propio (BACKLOG AC-206) |

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
| Niveles e insignias (1.1) | Toque en el bloque del icono del panel del jugador (52×52 px) | Igual que en escritorio. Se cierra con ✕ (≥48×48 px) o con un toque fuera, que no navega ni selecciona |
| Mover la vista (I2; desde la 1.1.1, solo con «Libre») | Arrastrar **un** dedo en el agua (> 12 px CSS), o tocar o arrastrar en el minimapa | Un toque sin arrastre sigue navegando; con dos dedos es zoom, nunca desplazamiento. Con «Centrada», arrastrar un dedo es un toque al soltarlo y el minimapa solo se mira (BACKLOG AC-206). La cámara se elige con el botón **Opciones**; en táctil no hay teclas que cambiar |
| Centrar (I2; solo con «Libre») | Botón **Centrar** | Vuelve al seguimiento; con «Centrada» no sale |

**Regla de entrada:** cada pulsación produce como mucho una intención. Los conmutadores (Atacar, Reparar, Esc) alternan sobre la **última intención del jugador**, no sobre el estado que llega del servidor, que va interpolado y con retraso (§13). Esa última intención incluye lo que cancela según §8: después de pulsar Reparar, el siguiente Atacar ataca, y después de Atacar o de una orden de navegación, el siguiente Reparar repara. Una intención que el servidor va a rechazar con seguridad (reparar con el casco intacto) no cancela nada (AC-128). Mantener una tecla pulsada no la repite.

Orientaciones soportadas: vertical (390×844) y horizontal (844×390). Mientras se juega, el navegador no hace scroll ni zoom.

### Cámara (qué debe comunicar; los valores exactos los define `game-ux`)
- Proyección "isométrica" (cenital oblicua).
- **Dos cámaras, a elegir en el botón Opciones del HUD** (1.1.1, E18; BACKLOG AC-205 a AC-209; ART-DIRECTION §20): **«Centrada»**, la de partida para todos (también el invitado) y la de la 1.0, y **«Libre»**, la vista libre de la 1.1.0 (abajo). La elección y las teclas se guardan en el navegador, no en el servidor, porque son del aparato. En escritorio, con un puntero fino, el mismo panel deja cambiar las teclas de 6 acciones: las 4 de mover la vista, Centrar y Detener; las demás son fijas. El panel no pausa el juego ni envía nada al servidor, salvo el `viewAt(null)` de volver a «Centrada» desde una vista movida. **Modo seguimiento** (el de «Centrada», y el de «Libre» mientras el jugador no mueve la vista): sigue al barco propio, que queda siempre en el **10 % central** de la pantalla: la caja centrada de 10 % del ancho × 10 % del alto (|dx| ≤ 0,05·W, |dy| ≤ 0,05·H), medida sobre el pivote del barco.
- **Encuadre (decisión U8, D23):** con el zoom por defecto cabe entero, a 1440×900 y a 390×844, el círculo de radio **R = max(alcance de tu cañón, 65 m)**. Es decir, 65 / 70 / 80 m con los cañones N1 / N2 / N3 (antes, 80 m fijos).
  - 65 m es el **mayor alcance de los NPC** (cañonera y capitán). Si en el futuro un NPC alcanza más, R sube con él.
  - **Por qué no el alcance propio a secas (60 m con N1):** la cañonera orbita a 62 m y el capitán dispara desde 65 m, así que dispararían desde fuera del encuadre precisamente al jugador novato, que es quien tiene que perseguir a la cañonera.
  - **Ganancia:** la Balandra inicial pasa de 1 310 a ≈1 984 px² en su peor rumbo (+51 %), frente a los ≈2 000 px² del barco del jugador en Seafight.
  - Al comprar cañones, R cambia (65 → 70 → 80 m) con una transición de 600 ms al cerrar la tienda.
  - Los jugadores con más alcance (PvP, hasta 80 m) pueden quedar fuera del encuadre. Para eso está el indicador de atacante fuera de pantalla (§14).
- **Vista libre** (I2; P0 en la 1.1.0, antes P1; desde la 1.1.1, solo con la cámara «Libre»). En Seafight el minimapa y unas teclas mueven la carta, y "To the Ship" la devuelve al barco (REFERENCE §2 y §12).
  - **Entrar:** arrastrar en el agua más de 12 px (botón izquierdo o un dedo); hacer clic o arrastrar en el minimapa (la vista se centra en ese punto); o usar las teclas de la vista (por defecto, las flechas; 150 m/s).
  - **Soltar antes de 12 px es un clic normal:** navega o selecciona. Dos dedos son zoom, nunca desplazamiento.
  - En vista libre, un clic en el agua navega hacia ese punto (aunque esté lejos del barco) y un clic en un barco lo selecciona. Nada más cambia.
  - El centro de la vista no sale del mapa (±500 m, es decir, ±`MAP_HALF_SIZE`, `src/game/constants.ts:17`: si el mapa cambia de tamaño, el límite cambia con él).
  - **Volver al seguimiento** (transición de 300 ms): con la tecla de Centrar (`C` por defecto) o el botón Centrar, cuando el barco propio recibe daño, al morir o al reaparecer. «Recibe daño» es cualquier bajada de su vida sin cambio de clase, que en la práctica es un impacto. Cambiar de barco en la tienda no cuenta (decidido por producto el 2026-10-18, a pregunta de dev). **También vuelve cuando llega una andanada contra el barco propio, aunque falle** (un evento `volley` con su `targetId`; *ampliado el mismo día*, a pregunta de dev). Por qué: el chip de atacante no sale en vista libre, porque los dos chips nunca coinciden (ART-DIRECTION §12.8, D89). Si la cámara solo volviera con el daño, una andanada fallida dejaría al jugador mirando a otra parte sin saber que le disparan. Que te disparen es justo cuando necesitas ver tu barco.
  - Si el barco propio no se ve, un indicador en el borde señala hacia él. «No se ve» quiere decir que está fuera de la pantalla o tapado por el HUD: fuera del marco útil (ART-DIRECTION §12.8, BACKLOG AC-121). Lo mismo vale para el atacante de §14.
  - **Lo que se ve está vivo:** los barcos que hay en la zona mirada se muestran; nunca se ve mar vacío donde hay NPC (§13).

## 6. Navegación y barcos

### Modelo de movimiento (simulación a 20 Hz)
1. Un clic fija un destino. El servidor calcula una ruta con *waypoints* que esquiva las islas (A\* sobre un grafo de visibilidad, con 16 nodos alrededor de cada isla inflada por el margen: `src/game/nav.ts:1-3` y `:7`. Antes este texto decía «rejilla de 5 m», que no es lo implementado). **Margen de navegación** = media eslora + 2 m (`L/2 + 2`), medido desde el borde de la isla: Balandra 10 m, Goleta 13 m (1.1), Bergantín 14 m, Fragata 19 m, Navío 23 m (1.1), Pirata 12 m, Mercante 13 m, Cañonera 16 m, Capitán 17 m y Galeón 20 m (1.1). Así el casco (sin el bauprés) nunca se mete en una isla: lo que parece sólido es sólido. El radio de colisión no cambia y sigue siendo el límite físico de último recurso.
1b. **Destino inalcanzable (1.1).** Si la clase no puede llegar al destino, el destino pasa al punto alcanzable más cercano y nunca se navega en línea recta contra una roca. Vale para los dos casos del recinto de los escollos (§4): un destino **no navegable** para la clase (una Fragata que hace clic dentro del triángulo) y uno **navegable pero no alcanzable** (la Cañonera o el Capitán que persiguen a una Balandra metida en él). El segundo no lo resuelve llevar el destino al punto navegable más cercano (`nearestNavigable`, `src/game/nav.ts:46` en `da4a8c6`; `:198` en `1e2022f`), porque el destino ya es navegable. En `da4a8c6`, sin ruta, `findPath` devuelve el destino en línea recta (`src/game/nav.ts:145`); con las islas de la 1.0 no había recintos y no pasaba. `f92e50d`, de la pila del mapa, lo cambia por el punto alcanzable más cercano. **Hasta ese punto se va por la ruta del navegador**, la misma que si ese punto fuera el destino, sin rodeos (AC-172 c, 2026-10-24; O-57).
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

Equilibrio: la Balandra es rápida y frágil; la Fragata es lenta y tiene la mayor potencia de fuego. Las mejoras (§11) multiplican sobre la clase activa; desde la 1.3, con los niveles de ese barco (§11, «Mejoras por barco (1.3)»). **1.1** (no salieron en la 1.1 ni en la 1.2; **salen en la 1.3**, ya en las 2 familias, BACKLOG «Release 1.3.0» y AC-226):
- **Goleta, la cazadora.** Es el barco más rápido del juego (18 m/s con velas N3) y con cañones N3 (80 m) supera el alcance de todos los NPC (65 m como mucho, §9) y su velocidad (11 m/s como mucho): puede hundirlos sin recibir daño si mantiene la distancia (pilar P3). Frente al Bergantín, que cuesta menos, cambia potencia de fuego (4 cañones frente a 6) por 3 m/s. Pasa por los escollos (§4).
- **Navío de línea, el final de la progresión.** La mayor potencia de fuego y la mayor vida, y el más lento y torpe de los barcos del jugador. No pasa por los escollos, así que un barco pequeño puede escaparle por ahí.
- **Nivel mínimo** (decidido, Q27): solo lo piden las dos clases nuevas; las de la 1.0 no cambian.

### Requisitos de arte de las clases nuevas (1.1; qué deben comunicar, el diseño es de `game-ux`)
| Clase | Debe leerse como | Requisito verificable |
|---|---|---|
| Goleta | Rápida y ligera | Silueta propia que la distinga de la Balandra y del Bergantín en escala de grises a 1,0× en 390×844 (la clase se lee por la silueta, ART-DIRECTION §9). Mismo código de jugador que las demás (§14) |
| Navío de línea | La más poderosa del jugador | El barco del jugador más grande (42 m), con la potencia de fuego a la vista. No se confunde con la Fragata, que es de su misma facción, por la regla de clases de ux (AD-37), ni con el Capitán pirata ni el Galeón, que son de otra, por la de facciones (AD-10); las dos, también en grises. **Frente a la Fragata, la eslora no basta** (42 / 34 = 1,235, por debajo del 1,25 que pide la gramática de siluetas de `game-ux`): el rasgo que la distingue son **dos filas de portas**, que añade ux. La eslora se queda en 42 m (decisión de producto, 2026-10-17): subirla a ≥ 42,5 m movería el margen de navegación (23 → 23,5 m), los amarres y la regla de 46 m entre islas (§4) para algo que el rasgo ya resuelve |

### Familias de barcos (1.3; Q31 y Q33)
**Una familia es un estilo de construcción que el jugador elige para sus barcos: cambia cómo se ven, nunca cómo se juegan.** Lo pidió Jonattan el 2026-10-18 (cita en BACKLOG, «Release 1.1.0»): «Quiero familias de barcos. Ejemplo: barcos españoles, galeón español. Imagina lo mismo pero con barcos HMS Victory», junto con más detalle en todos los barcos, que hoy le parecen muy simples.

*2026-11-15 (producto; Q33), la 1.3:* no salieron en la 1.1 ni en la 1.2, y Jonattan las pide para la 1.3 con la Goleta y el Navío: «Si son esas familia, no son gratis se deben comprar» (cita en BACKLOG, «Release 1.3.0»). Preguntado si la británica también, respondió el mismo día: «Las dos se pagan» (Q38). **Las dos familias se compran, 4 000 de oro cada una, y cada compra vale para todos los barcos del jugador. Sin familia, los barcos se ven con el modelo de hoy.** Cambian las filas «Cómo se elige» y «Dónde se guarda», y se añaden «Precio (1.3)» y «Sin familia (1.3)». Lo demás de la tabla sigue.

| Regla | Valor |
|---|---|
| Familias | 2: **española** (galeón: castillos altos, popa labrada y dorada) y **británica** (la del HMS Victory: casco oscuro con franjas de portas). Lo que debe comunicar cada una, abajo; el diseño es de `game-ux`. **Ids** (fijados por producto el 2026-10-20, a pregunta de dev-render): `gb` (británica) y `es` (española), los mismos de `sb_family` en ASSET-SPEC §4 (D80). Son los valores que usan el guardado en el navegador, la red y las claves de los modelos (clase × familia). Un valor desconocido entra con `gb`, la de por defecto (BACKLOG AC-196 b); desde la 1.3, con `none` (abajo). **Nombres en el código** (2026-10-20; producto, a petición del lead, para que dev-npc y dev-render lean la misma fuente). Ninguno existía: grep de `ShipFamily`, `selectFamily`, `sea-battle-family`, `fa` y `fm` en r11, dev-render y dev-npc. El tipo es `ShipFamily`, con los valores `'gb'` y `'es'`, y `'gb'` por defecto. En el snapshot va como `fa?: ShipFamily`, solo en barcos de jugador, como `lv?` (los NPC no tienen familia), y viaja al entrar en el área de interés y al cambiar. El nombre `fa` lo fijó el lead con los dos devs. **`fa` tiene que entrar en `SNAPSHOT_KEYS`** (`server/game-server.ts:105` en `80fe265`), con su test, o el cambio de familia no viaja en el delta (BACKLOG AC-195; dato de dev-render, vía el lead). La intención para cambiarla en el puerto es `selectFamily` con `{ family }`, como `selectShip` con `{ classId }`. En el navegador se guarda con la clave `sea-battle-family`, como `sea-battle-last-ship`. En las medidas del piloto, el cliente la toma del gancho de prueba (BACKLOG `:381`). *2026-11-15 (1.3; Q33):* los mismos ids van también en la fila (`families` y `family`, §13, «Formato de la fila (1.3)»), y la familia de cada jugador la da el servidor con su progreso. `sea-battle-family` queda solo como predicción de la descarga del modelo propio antes de la bienvenida, como `sea-battle-last-ship` (BACKLOG AC-193 c), nunca como la verdad. La intención `selectFamily` solo vale con una familia que el jugador tiene o con «sin familia», y la compra va por `buy` con `family:gb` o `family:es` (§13). **«Sin familia» es el valor `none`** (decidido el 2026-11-15, con Q39): en la fila (`family`), en `selectFamily` y en el snapshot (`fa`), que lo manda explícito al entrar y al cambiar, para que pasar de una familia a «sin familia» viaje en el delta como cualquier otro cambio. El tipo `ShipFamily` sigue siendo `'gb' | 'es'`, y el campo admite además `'none'`. ~~Un valor desconocido en el navegador cuenta como `none`, y en la predicción no se pide ningún modelo~~ *Precisado el 2026-11-16 (QA-78, O-1; BACKLOG AC-224 d):* un valor guardado en el navegador que no se entiende no se usa para predecir. No se pide ningún modelo antes de la bienvenida, y después manda la familia de la fila |
| Clases | Cada familia tiene las 5 clases de la tabla de arriba. Las estadísticas son las de la clase, iguales en las 2 familias. La eslora, el radio de colisión y la caja de selección también: la familia no cambia ni dónde se acierta ni por dónde se pasa |
| La clase se sigue leyendo | El número de palos, la eslora y los rasgos de clase de ux (AD-37: las dos filas de portas del Navío, por ejemplo) son los mismos en las 2 familias. La familia cambia el casco, los castillos, la popa, los colores, las velas y la bandera, no lo que dice qué clase es |
| Nombres | Los de la clase, sin cambios: el Navío español es «Navío de línea», no «Galeón». Así el panel del objetivo sigue diciendo la clase (§14) y no se confunde con el Galeón del tesoro (§9) |
| Cómo se elige | **Desde la 1.3 (Q33 y Q39; Jonattan, 2026-11-15, a Q38: «Las dos se pagan»):** en el puerto, dentro de la zona segura, en la pestaña «Familia» del Astillero, que enseña la imagen del barco activo con cada aspecto (BACKLOG AC-195 y AC-222 a AC-225). **Las dos familias se compran, 4 000 de oro cada una, sin pedir nivel**, y cada compra vale para todos los barcos del jugador: los que tiene y los que compre después. Comprar una la pone en uso. **Sin familia, que es como empieza todo jugador, los barcos se ven con el modelo de hoy**, el procedural de la 1.2 (Q39). Cambiar entre «sin familia» y las familias que tiene es gratis y se puede hacer cuando se quiera dentro de la zona segura. Una familia comprada no se devuelve, y hundirse no la quita. ~~La británica viene con cada barco y no se compra. La española se compra una sola vez, por 4 000 de oro~~ (la versión de producto del mismo día, antes de la respuesta a Q38). ~~En el puerto, dentro de la zona segura, gratis y cuando se quiera […] No pide nivel ni oro~~ (la regla de la 1.1, que no llegó a salir). ~~**La de por defecto es la británica** (decidido por producto el 2026-10-18, a propuesta de `game-ux` en D80).~~ *Desde la 1.3 no hay familia por defecto:* lo de por defecto es «sin familia». Lo que sigue, del 2026-10-18 y el 2026-10-19, explica por qué se eligió la británica, y sus datos de color siguen valiendo para AC-194 (d), porque las dos familias saldrán al mar junto a los NPC. ~~Es la más parecida a los barcos de hoy, con casco oscuro y franjas ocres, así que quien ya juega ve evolucionar su barco, no cambiar de bandera sin haberlo elegido.~~ *Razón cambiada el 2026-10-19 por producto:* con D91, que Jonattan aprobó con los Navíos, la británica es azul marino `#1E3557` con franjas blanco hueso `#E9E2CF` (ART-DIRECTION §9.3; dato de ux), y ya no se parece más que la española al casco marrón `#4A2F1C` con franja ocre `#D4A548` del jugador de hoy (ART-DIRECTION §4.2). **Sigue siendo la británica.** Cada familia se parece en algo a un NPC (datos de ux, ΔE76 en visión normal, protan, deutan y tritan, con `scripts/ux/pal.py`): el casco rojo `#9B2A1E` de la española, a la franja roja `#B3261E` del pirata (11,5 / 4,5 / 8,0 / 12,6), y la franja blanco hueso de la británica, a la marfil `#E8DCC0` del mercante (5,5 / 5,5 / 5,5 / 3,9). **En la británica el parecido está solo en la franja; en la española, en el casco entero**, que es lo que más se ve. El casco británico queda lejos del pirata, de casco negro `#2A2523` (26,4 / 25,5 / 27,8 / 22,2, más que el marrón de hoy, con 18,4 / 14,9 / 17,6 / 17,6). Del mercante la separan las velas (claras sin franjas frente a crema con 2 franjas azules), las portas y la caída de los palos (ART-DIRECTION §9.2). Como la mayoría de los barcos llevará la de por defecto (HIPÓTESIS: pocos jugadores la cambian), producto elige la de menos superficie parecida a un NPC. Lo mide BACKLOG AC-194 (d), con una británica junto a un mercante; si falla, cambia la librea británica y vuelve a Jonattan. *Completado el mismo día con las cifras de ux:* antes decía solo que era la que menos se acercaba al pirata, sin el parecido con el mercante. *2026-11-15 (1.3):* la HIPÓTESIS de «la mayoría llevará la de por defecto» pasa a valer para «sin familia», el modelo de hoy, que ya pasó AC-72 en prod. AC-194 (d) sigue con sus 2 pares de color, y suma «sin familia» a la mezcla (BACKLOG AC-194 d) |
| Quién la ve | Todos: el barco de cada jugador se ve con su familia en los demás clientes |
| Dónde se guarda | **En la cuenta, desde la 1.3** (Q33 y Q36): las familias que tiene el jugador y la que usa van en la fila (`families` y `family`, §13, «Formato de la fila (1.3)»), porque una compra no puede perderse al cambiar de navegador ni falsearse en él. La compra y el cambio se escriben antes de confirmarse, como los barcos. La 1.2.0 rechaza cualquier formato nuevo (`server/progress.ts:85-87` en `801c185`), así que antes de la 1.3 sale una 1.2.x puente (§13). El invitado la compra con el oro de su sesión y vuelve a «sin familia» al recargar, como su oro vuelve a 100. ~~**En el navegador**, no en la cuenta, en esta primera versión. La fila de la 1.1 tiene claves exactas […] Guardarla en la cuenta va con el próximo cambio del formato de la fila, con su lector puente (P2)~~ (la regla de la 1.1: ese cambio de formato es el de la 1.3) |
| Precio (1.3) | **4 000 de oro cada familia, la británica y la española; las dos, 8 000.** ~~4 000 de oro la española. La británica, incluida.~~ (antes de Q38). Son ≈ 11 min de juego con el Bergantín mejorado: entre el Bergantín y «todo comprado» se ganan ≥ 359 de oro por minuto de media (§10b, «Balance verificable»). Cuesta más que la Goleta (3 000) y menos que la Fragata (6 000): no compite con el primer barco, y deja de ser cara cuando el jugador ya tiene la progresión hecha. **El mismo precio para las dos,** porque la elección tiene que ser de gusto: con precios distintos, la cara parecería la buena. Es solo aspecto, así que no entra en la curva de AC-60: su bot no la compra (§10). Descartes y motivos, en Q33 |
| Sin familia (1.3; Q39) | **Lo que tiene todo jugador al empezar, y lo que reciben las partidas que ya existían.** Los barcos se ven con su modelo procedural, el de hoy. En las 3 clases de la 1.0 es el que ya está en prod y pasó AC-72. En la Goleta y el Navío es el modelo provisional de la 1.1, que nunca salió y al que Jonattan pidió cambios con D64 (BACKLOG `:358-359`), así que **lleva lámina y su visto bueno antes de salir** (BACKLOG AC-192; AC-227 e). Se puede volver a «sin familia» cuando se quiera, gratis, en la zona segura. Un jugador sin familia no espera a ningún modelo al entrar: su barco ya está en el juego (BACKLOG AC-193 c) |
| NPC | **No tienen familia.** El pirata, el mercante, la Cañonera y el Capitán conservan su propio aspecto, para que hostil y pasivo se sigan leyendo sin depender de la familia de nadie (§14, BACKLOG AC-72). Su rediseño con más detalle va en la 1.2 (P1). El Galeón del tesoro (P2) es de estilo español por naturaleza, y por eso **no puede confundirse con un Navío de la familia española** (regla de facciones de ux, AD-10, también en grises) |
| Juego | Ninguno. **Descartado: naciones con efectos** (más velocidad, más vida…). Multiplicaría por 2 cada balance medido (AC-53, AC-55, AC-60, AC-114, AC-163, AC-189) y lo que pidió Jonattan es aspecto y detalle. En Seafight, un «design» sí cambia las estadísticas (REFERENCE §17), pero aquí esa variedad ya la dan las 5 clases |

**Qué debe comunicar cada familia (para `game-ux`):**
- **Española:** el galeón de las Indias: castillo de popa alto, popa labrada y dorada, colores cálidos (rojo, ocre, oro) y la cruz en las velas o en la bandera.
- **Británica:** la Armada de Nelson: casco oscuro con franjas claras a la altura de las portas, muchas portas a la vista y un aspecto sobrio y ordenado.
- **Las dos:** se distinguen entre sí sin leer a 1,0× en 1440×900; la clase se lee igual en las dos; y ninguna se confunde con un pirata ni con un mercante, también en grises.
- **Más detalle que hoy** (lo que Jonattan echa en falta): a tamaño de juego, el casco tiene que leerse como madera trabajada, con portas, regalas y popa, y no como un bloque de color. Cuánto detalle cabe lo fija `game-ux` con los presupuestos de §16.

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

### Cañones (mejora; global hasta la 1.2 y de cada barco desde la 1.3; los precios son la base, la de la Fragata, §11)
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
- Un jugador puede atacar a otro solo si **ambos** están fuera de la zona segura y ninguno tiene protección. **1.3:** quien está dentro bajo fuego cuenta como fuera (§11, «Zona segura bajo fuego (1.3)»).
- Si el objetivo entra en la zona segura, el ataque contra él se cancela. **1.3:** solo si entra sin estar bajo fuego; si no, el ataque sigue hasta que caduque su marca (§11).

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
| **Galeón del tesoro** (pasivo que responde al fuego, de evento; 1.1, P2) | 2 400 | 5 / 7 m/s | 40 °/s | 8 | 24 | 60 % | 60 m | 5,0 s | 23,0 (solo contra quien lo ataca) | 600 oro | 150 oro | 10 min después del arranque o de que el anterior se hunda o escape; máximo 1 | 0–1, sin escolta |

Eslora y radio de colisión: Pirata 20 m / 6 m, Mercante 22 m / 7 m, Cañonera 28 m / 8 m, Capitán 30 m / 9 m y Galeón 36 m / 10 m (1.1).

Aceleración y frenado: Pirata 3 / 5 m/s², Mercante 2,5 / 4 m/s², Cañonera 2,5 / 4 m/s², Capitán 2,5 / 4 m/s² (los tres, como la Fragata, §6) y Galeón 2 / 3,5 m/s² (como el Navío, §6).

**Regla de recompensa** (para que añadir tipos no suba el oro por segundo de combate): hostiles ≈ 0,23 × vida (pirata 105/450; cañonera 210/900) y pasivos ≈ 0,20 × vida (mercante 60/300). El jefe lleva una prima de riesgo (0,33 × vida) porque es raro y exige grupo o una Fragata mejorada. El galeón (1.1) lleva una prima de evento (0,25 × vida): es raro, responde al fuego y se escapa. **La XP de cada NPC (1.1) sigue la misma lógica por vida (§10b).**

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
- **Atacable** = jugador vivo, fuera de la zona segura y sin protección. **1.3:** también dentro de la zona si está bajo fuego, y un hostil suelta al objetivo que está dentro de la zona y fuera de su alcance (§11, «Zona segura bajo fuego (1.3)»).

### IA del mercante
- **Ruta**: recorre en bucle una ruta cerrada de 4–6 *waypoints* a 7 m/s.
- **Huida**: al recibir daño, se aleja del atacante a 9 m/s durante 12 s desde el último daño, esquivando islas y bordes. Luego vuelve a su ruta por el *waypoint* más cercano.
- Nunca dispara.

### IA de la cañonera pirata (I2)
Comportamiento propio: **mantiene la distancia**. Su alcance (65 m) supera al cañón N1 del jugador (60 m), así que obliga a perseguirla o a mejorar los cañones. **No es presa para N1** (BACKLOG AC-114): la Balandra N1 pierde el 55–80 % de su vida contra ella. Por eso el bot de AC-60 no la ataca hasta tener Cañones N2 (§10). **Cómo se le comunica al jugador:** el panel de alcance no basta. Perseguida por una Balandra (14 m/s frente a 8), la cañonera no se asienta en su órbita de 62 m, y está a tiro del N1 el 99,2 % del combate (medido por dev-npc, BACKLOG AC-114). La Balandra no pierde por el alcance, sino por lo que tarda en hundirla: ≈ 43 s, en los que recibe ≈ 566 de daño. Por eso lo comunica una **marca de peligro** en el panel del objetivo (§14; BACKLOG AC-189), y sin ella la cañonera no se enciende.
- **Patrulla, represalia, regreso, correa (200 m) y zona prohibida del puerto (130 m):** igual que el pirata. También **pierde al objetivo a > 110 m**, patrulla a ≤ 120 m de su origen con esperas de 2–5 s y da por llegado el regreso a ≤ 10 m, como el pirata y el Capitán (confirmado por producto el 2026-10-17, a pregunta de dev-npc). Con detección a ≤ 80 m, quedan 30 m de margen antes de soltar al objetivo. Lo que esta sección no fije para la cañonera es lo del pirata.
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

### Galeón del tesoro (1.1, P2)
El tesoro que cruza el mar de los mercantes: rico, lento, **pasivo y armado**. No ataca a nadie, pero a quien lo ataca le responde con andanadas más fuertes que las del Capitán. Es el evento **cerca del puerto**, al alcance de un Bergantín con ayuda, frente al Capitán, que es el evento **lejos**. Es el primero que se recorta si la 1.1 no llega (BACKLOG, «Release 1.1.0»).

*Cambiado el 2026-10-18 a petición de Jonattan, sobre la lámina D88* (cita en BACKLOG AC-192): «El diseño esta bien pero no puede ir acompañador por un pirata, es contradictorio. Este barco es pasivo pero si lo atacan que responda con fuerza.» **Ya no lleva escolta:** lo defienden sus propios cañones. Antes llevaba 2 piratas de escolta, huía como el mercante y no disparaba. Los números de abajo son de producto.

- **Aparición:** 10 min después del arranque, o de que el anterior se hunda o escape; nunca hay 2. Nace en el anillo de 250 m alrededor del puerto, en el punto del anillo más alejado de los jugadores y a ≥ 150 m de todos.
- **Ruta:** una vuelta completa al anillo de 250 m (8 *waypoints*, ≈ 1 570 m, ≈ 5 min a 5 m/s), esquivando islas (T1 y T2 caen cerca). Si la completa sin hundirse, el galeón desaparece: «El Galeón del tesoro ha escapado».
- **Pasivo:** nunca dispara primero. Un jugador que no le ha hecho daño nunca recibe un disparo suyo, aunque pase a su lado.
- **Responde con fuerza** (sustituye a la huida del mercante):
  - **agresor** es el jugador que le ha hecho daño en los últimos 15 s;
  - **objetivo:** de los agresores atacables (como en el pirata: vivos, fuera de la zona segura y sin protección) a ≤ 60 m, el que más daño le hizo en los últimos 10 s; si ninguno se lo hizo en ese tiempo, el más cercano. Si ningún agresor está a tiro, no dispara. Empieza con la recarga lista, así que responde en el tick siguiente al primer daño;
  - **cañones:** 8 por banda, 24 de daño por bala, 60 % de precisión, 60 m de alcance y 5,0 s de recarga. Son **23,0 DPS** y 115 de daño esperado por andanada, más que la del Capitán (109) y más del doble que la del pirata (53). El alcance es el del cañón N1 del jugador, entre los 55 m del pirata y los 65 de la Cañonera y el Capitán, así que quien tenga cañones N2 (70 m) o N3 (80 m) y más velocidad que él lo hunde sin recibir daño si mantiene la distancia (pilar P3);
  - **movimiento:** ni persigue ni huye; sigue su ruta. Mientras tenga un agresor, navega a su velocidad máxima (7 m/s) en vez de a 5, y vuelve a 5 m/s a los 15 s sin recibir daño. Atacarlo acorta el tiempo que le queda para escapar: a 7 m/s, la vuelta entera dura ≈ 3,7 min.
- **Cómo lo sabe el jugador antes de atacar:** el panel del objetivo lo da como «pasivo» y le pone la marca de peligro (D77; BACKLOG AC-189) con la regla de siempre (§14, «Panel de objetivo»): DPS del NPC × (su vida / DPS propio) / vida máxima propia > 50 %. Con la Balandra N1 da 329 % y con un Bergantín de cañones y casco N2, 67 %, así que sale; con la Fragata con todo a N3 da 18 %, y no sale (cálculo de producto con las tablas de §6, §7 y §11). Antes, con 0 DPS, no salía nunca. Es justo lo que tiene que decir: «no te atacará, pero si lo atacas tú solo, te costará caro». ~~**El aspecto aprobado no cambia** («El diseño esta bien»): D88 lo dibuja sin cañones a la vista y sin portas. Si `game-ux` cree que hacen falta portas para que se lea armado, se lo propone a Jonattan como cambio de la lámina, sin acercarlo al Navío español (AC-194 d). La lámina vuelve a Jonattan de todos modos, sin la palabra «escolta» y con el pirata solo como comparación.~~ **Aspecto aprobado: D88 v2** (Jonattan, 2026-10-20; BACKLOG, registro de AC-192, fila «Galeón del tesoro»): el de D88 con la receta de los Navíos y 8 portas por banda en la franja de oro, con la batería a la vista. Las andanadas salen del costado que mira al objetivo, como en todos los barcos (§7). Del Navío español lo separan (AC-194 d) 1 fila de 8 portas en oro frente a sus 2 de 10 en rojo, el casco de madera sin rojo, las velas a franjas, 4 palos en vez de 3 y la carga en cubierta.
- **Aviso a todos:** al aparecer, «¡Galeón del tesoro en el <región>, sector <celda>!» (texto de `game-ux`, ART-DIRECTION §10.1, con la regla de D49 del aviso del Capitán: la región es el cuadrante de su punto de aparición, escrito entero, y la celda, la de la rejilla del minimapa; BACKLOG AC-166), con un marcador propio en el minimapa visible desde cualquier punto (como el Capitán, §13). Al hundirse, «El Galeón del tesoro ha caído: A, B y C».
- **Recompensa:** 600 de oro + 150 de restos y 160 XP (§10b), repartidos por daño (§10).
- **Fuera de la curva:** el bot de AC-60 no lo ataca ni se acerca a < 150 m de él, igual que con el Capitán (§10).
- **Entidades:** con el galeón, el mundo llega a 42 (§13): 20 jugadores, 20 NPC, el Capitán y el Galeón. Con escolta eran 44.

### Requisitos de arte de los NPC de I2 y de la 1.1 (qué deben comunicar; el diseño es de `game-ux`)
| NPC | Debe leerse como | Requisito verificable |
|---|---|---|
| Cañonera pirata | Hostil, pesada, de largo alcance | Código hostil (velas oscuras, como el pirata) más una **forma** propia (casco ancho y bajo, batería de cañones visible) que la distinga del pirata y del capitán **en escala de grises** a 1,0× en 390×844. Placa "Cañonera pirata" |
| Capitán pirata | El más peligroso del mar | Mayor que cualquier pirata (30 m) y con silueta propia. Un rasgo exclusivo (bandera u ornamento) visible a 1,0× en móvil y en grises. Marcador de minimapa distinto de todos los demás. Placa "Capitán pirata" |
| Galeón del tesoro (1.1, P2) | Pasivo, rico y pesado; que no ataca, pero responde | Código **pasivo** (nunca se confunde con un hostil) y distinto del mercante en grises a 1,0× en 390×844: mayor (36 m) y con un rasgo de riqueza propio. Placa "Galeón del tesoro". Marcador de minimapa distinto de los 6 de AC-115. Que responde se comunica con la marca de peligro del panel del objetivo y con sus andanadas, no con un código hostil. Sin escolta desde el 2026-10-18 |

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
| Balandra N1 vs Galeón del tesoro (1.1, P2) | El jugador pierde en ≥ 95 % de los casos | — |
| Bergantín (cañones y casco N2) solo vs Galeón (1.1, P2) | 44–55 s | 55–85 % (le sale la marca de peligro) |
| 2 Bergantines (cañones y casco N2) vs Galeón (1.1, P2) | 20–28 s, sin muertes en ≥ 95 % de los casos | 20–45 % (el objetivo del galeón) |
| Fragata con todo a N3 vs Galeón (1.1, P2) | 18–26 s | 12–25 % |
| Goleta (cañones N3) vs Galeón (1.1, P2), a 61–80 m | 40–55 s | 0 % (fuera de sus 60 m y dentro de sus 80) |

*Referencia de `game-product` (Monte Carlo, 1 000 duelos, ambos a tiro): 2 Bergantines contra el Capitán, 18,0 s, 32 % y 0,00 muertes; Bergantín contra Cañonera, 18,0 s y 17 %; Balandra contra Cañonera, 68 %. En el juego real, la cañonera mantiene la distancia y alarga los duelos. Medido con la IA real del Capitán (I2, H-305, dev-npc): con 2 Bergantines, el objetivo pierde el 25,0 %, dentro de la banda del 20–45 %.*
*Referencia de las filas 1.1 (valor esperado por andanadas, sin Monte Carlo; HIPÓTESIS hasta BACKLOG AC-163): Goleta contra Pirata, 20,5 s y 24 % (6 andanadas de 84 de daño; el pirata dispara 5 de 52,8 sobre 1 100); Goleta contra Cañonera, 25 s y 33 %; Navío contra Capitán, 12,5 s y 10 % (5 andanadas de 384; el capitán dispara 4 de 109,2 sobre 4 480); Navío contra Fragata, 24,5 s y 62 % (la Fragata necesitaría 15 andanadas y solo dispara 9).*
*Referencia de las filas del Galeón (valor esperado por andanadas, sin Monte Carlo; HIPÓTESIS hasta BACKLOG AC-202; producto, 2026-10-18). El Galeón responde en el tick siguiente al primer daño y dispara cada 5 s andanadas de 115,2 (8 × 0,6 × 24). La Balandra N1 lo hundiría en ≈ 114 s, y él la hunde con 7 andanadas, en ≈ 30 s. El Bergantín solo necesita 15 andanadas de 171 (≈ 49 s) y recibe 10, 1 152 sobre 1 680 (69 %). Los 2 Bergantines necesitan 7 u 8 rondas de 342 (21–24,5 s) y su objetivo recibe 5 andanadas, 576 (34 % de 1 680). La Fragata necesita 8 andanadas de 307 (≈ 21 s) y recibe 5, 576 sobre 3 080 (19 %). La Goleta, a 61–80 m, necesita 16 andanadas de 154 (≈ 45 s) y no recibe ninguna.*

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
| Todo comprado (12 800 oro) | 45–70 min (medido: 46,3; por semilla 46,3 · 45,4 · 45,9 · 54,7 · 51,7). **Hasta la 1.2** |
| **La Fragata con sus 6 mejoras (1.3; 16 400 oro)** | **45–70 min** (HIPÓTESIS de producto: 58–64; abajo, «Cómo encaja la 1.3»). Sustituye a «Todo comprado» desde la 1.3, porque con las mejoras por barco «todo» incluye mejorar barcos que el jugador ya no usa |

**Riesgo:** el margen sobre el mínimo es de 1,3 min. **Cómo encaja I2:**
- La cañonera sustituye a 4 piratas (la población total sigue en 20) y cumple la regla de recompensa de §9. Por eso no debería subir el oro por segundo de combate.
- El jefe queda fuera de la curva: el bot del AC-60 no lo ataca, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto. **Medido con H-305 en I2** (dev-npc): la semilla 3 compra todo en 44,3 min, por debajo de 45, y la mediana de las 5 semillas sigue dentro de 45–70 min. AC-60 pasa, porque se juzga por la mediana, pero el margen se estrecha. Se vigila al volver a medir con H-306.
- Si con I2 el AC-60 sale de rango, la palanca es la recompensa de la cañonera (y sus restos), en pasos de 10 oro. No se tocan pirata, mercante ni precios.
- **Medido con H-306** (dev-npc, 2026-10-17, Jest suelto): con la población de I2, el hito de los 500 de oro sale en **4,06 min** (> 4). La recompensa de la cañonera no lo mueve: de 220 a 270, el hito no cambia. Lo que cuesta es el tiempo, no la recompensa. En las semillas 2 y 3, el bot con la Balandra N1 pasa 100 s y 57 s persiguiéndola, la hunde, cobra sus 210 y con ese mismo hundimiento llega a los 500, sea cual sea la recompensa (en la semilla 3 tenía 330). *Corregido el 2026-10-17, con datos de dev-npc:* antes decía que no la hundía a tiempo. **Decidido por producto: el bot de AC-60 no ataca una cañonera mientras su cañón tenga menos alcance que ella (65 m)**, es decir, con N1 (60 m), hasta comprar Cañones N2 (70 m). Así lo diseña §9: la cañonera no es presa para N1 (BACKLOG AC-114). El bot modela el camino previsto, no al novato que se equivoca, y al novato se lo dice la marca de peligro (§9, cañonera; BACKLOG AC-189). **Medido con la cláusula** (dev-npc, Jest suelto, sin QA): con el I2 encendido, 2,7 / 14,2 / 47,7 min; con el I2 apagado, sin cambios. Pasa, con 2,7 min de margen en «todo comprado». **Descartado:** subir el umbral a 4,1 min, porque es mover el umbral después de ver el resultado; y tocar el pirata o el mercante, por la regla de arriba. La recompensa de la cañonera sigue siendo la palanca de los hitos del Bergantín y de «todo comprado».

**Cómo encaja la 1.1:**
- **AC-60 sigue midiendo el catálogo de la 1.0** (12 800 de oro). Su bot no compra la Goleta ni el Navío: si los comprara, la Goleta (3 000), más barata que la Fragata, retrasaría «todo comprado» y la cifra dejaría de ser comparable. El catálogo de la 1.1 (**27 800 de oro**, §11) lo mide aparte BACKLOG AC-164.
- El galeón queda fuera de la curva, como el Capitán (§9).
- El mapa nuevo (§4) alarga algunas rutas. AC-60 se vuelve a medir con él, con la población de I2 y con los amarres. Si sale de rango, las palancas son las de arriba: la recompensa de la cañonera para los hitos del Bergantín y de «todo comprado». Si falla el hito de los 500 de oro con el bot ya corregido, producto decide con los datos por semilla.
- La XP no cambia el oro: es una barra aparte (§10b).

**Cómo encaja la 1.3** (producto, 2026-11-15; mejoras por barco, §11, y familias, §6):
- **El hito final de AC-60 pasa a «la Fragata con sus 6 mejoras»: 16 400 de oro.** Es el camino del bot «barco primero»: el Bergantín (2 000), sus 6 mejoras (3 600, con el factor ×0,75 de §11), la Fragata (6 000) y sus 6 mejoras (4 800). La cota sigue en 45–70 min, la del macrobucle (§2). «Todo comprado» deja de ser un hito: con las mejoras por barco incluiría mejorar la Balandra y el Bergantín después de tener la Fragata, que nadie hace. Desde el Bergantín, el bot compra lo más barato entre las mejoras de su barco activo y los barcos de la 1.0 que no tiene. Al comprar la Fragata pasa a ella, como cualquier compra de barco (BACKLOG AC-70), y sigue sin atacar cañoneras con un cañón de menos alcance, así que la Fragata N1 (60 m) no las ataca hasta sus Cañones N2.
- **Estimación (HIPÓTESIS, sin medir):** con el I2, la última medida en el mapa de la 1.0 da 47,7 min hasta «todo comprado» (BACKLOG AC-60). Las mejoras del Bergantín cuestan 1 200 menos (3 600 frente a 4 800), así que la Fragata llega unos 3 min antes (1 200 / 359). Después faltan 4 800 de oro con una Fragata que empieza en N1 y gana menos que el Bergantín mejorado (42 de DPS frente a 76,8, §7, y sin cañoneras): entre 250 y 359 de oro por minuto, 13–19 min. Total: **58–64 min**, dentro de la cota y con 6–12 min de margen.
- **Palanca, decidida antes de medir:** si la mediana pasa de 70 min, la base de precios de las mejoras (la de la Fragata) baja un 10 % en todos los barcos, con el mismo factor por barco, y se vuelve a medir; si baja de 45 min, sube un 10 %. No se tocan los NPC, las recompensas ni los precios de los barcos: lo que mueve la curva en la 1.3 son las mejoras, y es lo que se ajusta. Mover la cota después de ver el resultado sigue descartado (BACKLOG `:1085`).
- **Se mide con el mapa y la población por defecto de la 1.2** (el mapa 1.1 y el I2) y **con E20 en el árbol**: el bot huye al puerto cuando el Capitán lo elige, y si la zona segura deja de proteger bajo fuego (E20), puede morir más.
- **Los 500 de oro y el Bergantín no cambian:** el bot no compra nada antes del Bergantín. Un jugador real puede mejorar antes la Balandra, que ahora cuesta la mitad (×0,5): la primera mejora (Velas N2, 150) llega antes que con la 1.2.
- **La ruta de «mejorar primero»** (§10, arriba) cambia de valor: lo que se invierte en la Balandra se queda en ella al pasar al Bergantín. Con el factor ×0,5 son 2 400 de oro como mucho, no 4 800. Es la consecuencia de lo que pidió Jonattan, y la tienda lo dice antes de comprar un barco (§11).
- **El bucle largo** (Goleta y Navío) lo mide BACKLOG AC-164, con el hito nuevo: el Navío con sus 6 mejoras (16 400 + 12 000 + 6 000 = **34 400** de oro en total).
- **Las familias (4 000 cada una) quedan fuera de la curva:** son solo aspecto y el bot no las compra. Que las dos se paguen (Q38) no mueve AC-60.
- **El regalo de la migración no mueve la curva:** cada barco que ya tenía un jugador recibe los niveles que tenía (§13; Q35). En la copia de prod del 2026-10-25 había 10 filas (BACKLOG AC-182 a), y ninguna partida nueva lo recibe.

## 10b. Experiencia, niveles e insignias (1.1)

**Una sola barra de experiencia (XP).** Hundir un NPC da XP según su vida y su peligro. Hundir a un jugador da 100, más que cualquier NPC común, con reglas que quitan el premio de cazar novatos y de intercambiar hundimientos. La XP nunca se pierde. Hay 20 niveles en 5 insignias: Marinero hacia el Bergantín (~17 min), Contramaestre hacia «todo comprado» (~45 min), Almirante hacia las 4 h y el nivel 20 hacia las 6–7 h, solo contra NPC (estimación; la mide BACKLOG AC-158). Se guarda con el resto del progreso (§13); el invitado no guarda nada. Los niveles, las insignias y lo que falta se consultan en la pantalla de niveles (§14). *2026-11-15 (producto):* en la 1.2.0 esa pantalla todavía no existe (`N` está reservada en `src/client/key-bindings.ts:21-22` y `:30` de `801c185`). Hoy se ven la insignia, el nivel y la barra del panel del jugador, y las cifras de la barra solo en su `title` (`src/components/hud/Hud.tsx:66-67`). Va a la 1.2.x con AC-190 (BACKLOG). Seafight separa la experiencia del PvE y un rango PvP aparte: aquí se unen porque lo pidió Jonattan y porque una barra se lee de un vistazo (REFERENCE §16 y §19).

### Reglas
| Regla | Valor |
|---|---|
| Fuente de XP | Solo hundir barcos, NPC o jugadores. Reparar, comprar o navegar no da XP |
| XP de un NPC | `vida / 15` si es hostil y `vida / 30` si es pasivo; ×2 si es de evento (Capitán, Galeón). Tabla abajo |
| Reparto | El del oro (§10; `splitReward`, `src/game/world.ts:763-776`, con el mismo filtro de `:796`): proporcional a todo el daño de cada jugador que haya impactado en los últimos 60 s (quien lleva más de 60 s sin impactar queda fuera) y redondeado hacia abajo; el resto, a quien más daño hizo (empate: quien dañó antes). Se acredita una sola vez. **Oro sin XP, solo en el mercante** (decidido por producto el 2026-10-17): como su XP es pequeña (10), quien hizo menos del 10 % del daño cobra oro y 0 XP. Es el mismo redondeo que el oro y se deja así. Un mínimo de 1 XP por participante rompería «la suma es la XP del NPC» y premiaría dar un solo disparo al NPC más fácil. Con un NPC, XP sin oro no hay nunca (BACKLOG AC-145). En PvP sí la hay, por diseño: el oro va entero a quien da el último golpe (fila «Oro en PvP») |
| XP por hundir a un jugador | Base **100**, repartida por daño como la de un NPC. A la parte de cada atacante se le aplican su factor de nivel y su factor de repetición, y se redondea hacia abajo. **El daño de los NPC no entra en el reparto**, igual que en el oro: el servidor solo anota el de los jugadores (`src/game/world.ts:735-745`). Si un pirata hizo el 90 % y un jugador el 10 %, ese jugador cobra los 100, con sus factores (decidido por producto, 2026-10-17, a pregunta de dev-npc). Motivo: es la regla del oro de los NPC, y otra regla solo para la XP pediría anotar el daño de los NPC sin otro uso. El oportunista no gana más que con un hundimiento en solitario, y la repetición y el nivel siguen frenándolo |
| Nivel que usan los factores | El de cada jugador **justo antes de acreditar** ese hundimiento: la XP de un hundimiento no cambia su propio factor. Es lo que dan las cifras de BACKLOG AC-148 y AC-149 (decidido por producto, 2026-10-17) |
| Factor de nivel (Δ = nivel de la víctima − nivel del atacante) | Δ ≥ 0: × (1 + 0,1 · min(Δ, 5)), hasta ×1,5. Δ < 0: × max(0, 1 − 0,25 · \|Δ\|): −1 → 0,75; −2 → 0,5; −3 → 0,25; −4 o menos → 0 |
| Factor de repetición (por pareja atacante → víctima) | En los 30 min que siguen al primer hundimiento con XP de esa pareja: el 1.º ×1, el 2.º ×0,5 y los siguientes ×0. Pasados los 30 min, la pareja vuelve a empezar. **«Con XP» quiere decir que el atacante cobró más de 0:** un hundimiento que no le da XP (p. ej., a 4 o más niveles por encima de la víctima, o con una parte del reparto que redondea a 0) no abre la ventana ni avanza en ella. Así, un veterano que hunde a un novato no le gasta la ventana para cuando el novato suba (decidido por producto, 2026-10-17, a pregunta de dev-npc). La pareja inversa (la víctima hundiendo al atacante) cuenta aparte. Vive en la memoria del servidor: un reinicio la borra. El cliente solo recibe sus parejas abiertas, para el panel del objetivo (§13, «Piezas de red de la 1.1») |
| Víctima protegida o en la zona segura | No se le puede atacar (`src/game/world.ts:141-154`), así que no da XP |
| Al hundirte | No pierdes XP ni nivel. Pierdes el 10 % del oro, como hasta ahora (§10) |
| Oro en PvP | Sin cambios: la penalización va entera a quien da el último golpe (`src/game/world.ts:818-821`). La XP, en cambio, se reparte por daño, así que quien solo ayudó cobra XP sin oro. Su línea del feed es la (d) de §14, «XP ganada» |
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
| Galeón del tesoro (1.1, P2) | 2 400 | Pasivo que responde al fuego, de evento | 160 | 1,4 (sin escolta desde el 2026-10-18) |
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
- **Se ven también en grande**, en la pantalla de niveles (§14): ahí se tienen que reconocer como las mismas de la placa (BACKLOG AC-190).

*Rediseño (2026-10-18):* Jonattan pidió rediseñarlas. `game-ux` le preparó 3 direcciones, y él eligió la de galones (B), rediseñada con inspiración en las insignias de la Armada de Colombia (BACKLOG AC-191 y AC-192). Estas reglas valen también para ella: en esa referencia hay anclas y estrellas, que aquí son iconos de relación.

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

- **Tienda**: se abre con el botón o `P` solo **dentro de la zona segura**. Abrirla no detiene el barco. El servidor valida todas las compras: dentro de la zona, oro suficiente, nivel anterior comprado y artículo no poseído. **1.1:** y, para la Goleta y el Navío, el nivel mínimo del jugador (§6; Q27). Un barco bloqueado se ve en la tienda con el nivel que pide («Requiere nivel 5 (Marinero)»), antes de intentar comprarlo, y la compra se rechaza con ese mismo texto. **1.3:** la tienda vende también las 2 familias, a 4 000 cada una (§6), y es **por barco**: la pestaña Mejoras desaparece, y cada mejora se compra para el barco que se elige en la lista de barcos, con su precio, se navegue o no (abajo, «Mejoras por barco (1.3)»; Jonattan, 2026-11-16).
- **Mejoras globales**: se conservan al cambiar de barco y al morir. *Hasta la 1.2.* **Desde la 1.3, las mejoras son de cada barco** (abajo; Q34).
- **Cambio de vida máxima** (comprar casco o cambiar de barco en el puerto): la vida actual conserva el mismo **porcentaje**, salvo al comprar un barco nuevo, que sale con la vida llena.

### Mejoras por barco (1.3; Q34 y Q35)
**Cada barco en propiedad tiene sus propios niveles de Cañones, Casco y Velas.** Lo pidió Jonattan el 2026-11-15: «las mejoras son solo para los barcos que compran» (cita en BACKLOG, «Release 1.3.0»). Hasta la 1.2, un juego de mejoras valía para todos los barcos del jugador (`src/game/types.ts:78`, `src/game/world.ts:170`, `:176` y `:621-625` en `801c185`).

| Regla | Valor |
|---|---|
| Para qué barco se compra | **Para cualquier barco que tenga el jugador, se navegue o no** (Jonattan, 2026-11-16; Q34). En la lista de barcos del Astillero, cada barco propio tiene un botón «Mejoras» que abre la vista de mejoras **de ese barco**, con sus niveles y sus precios. No hay pestaña Mejoras. ~~Para el barco activo, el que se navega. La pestaña Mejoras enseña los niveles y los precios de ese barco. Para mejorar otro, se cambia a él en la pestaña Barcos~~ (la regla del 2026-11-15, que Jonattan cambió al ver D99) |
| Mejorar el barco que no se navega | El barco activo no cambia: se sigue navegando el mismo, con su vida y su destino. El oro se descuenta igual. La mejora queda en el barco elegido y se nota al cambiar a él. Mejorar el Casco de otro barco no toca la vida del barco que se navega; si se mejora el barco activo, la vida conserva el porcentaje, como hasta ahora |
| La compra nombra el barco | La intención `buy` de una mejora lleva el barco (§13). El servidor la rechaza sin cambios si ese barco no es del jugador o si falta. ~~… si ese barco no es el activo~~ (2026-11-16) |
| Requisitos | Los de siempre: el barco del jugador, a flote y en el puerto; el oro; y el nivel anterior comprado **en el barco elegido**. «En el puerto» es la regla de la tienda, la de §11, con lo que añada E20 para la zona segura bajo fuego: las mejoras de cualquier barco siguen esa misma regla, sin una propia. Ninguna mejora pide nivel de jugador (Q27) |
| Qué da cada nivel | Lo de §7 y de la tabla de precios base, de abajo, igual en todos los barcos. Lo que cambia entre barcos es el precio |
| Al cambiar de barco | Cada barco conserva los suyos. Cañón, vida máxima y velocidad pasan a ser los del barco nuevo con sus niveles, y la vida actual conserva el porcentaje (regla de arriba) |
| Al hundirse | Se zarpa con el mismo barco y sus mismos niveles (§12) |
| Barco recién comprado | Llega con los 3 ejes a nivel 1 y la vida llena (BACKLOG AC-70 y AC-215). La tienda lo dice antes de comprarlo |
| Lo que se calcula con ellas | Todo lo que leía las mejoras del jugador lee ahora las del barco activo: cañón, alcance, recarga, vida máxima, velocidad, el círculo de alcance y la marca de peligro (§14) |
| Partidas que ya existían | Cada barco que ya tenía el jugador recibe los niveles que tenía al salir la 1.3. Nadie pierde nada (§13; Q35) |
| Invitado | Igual, durante la sesión |
| Fuera de la 1.3 | Mover o vender mejoras entre barcos (BACKLOG, «Release 1.3.0», «Fuera»). ~~Mejorar un barco que no es el activo sin cambiar a él~~: entra el 2026-11-16, a petición de Jonattan |

**Precio = precio base × factor del barco, y el factor son sus cañones por banda / 8.** La base es la tabla de abajo, la de hasta la 1.2, que desde la 1.3 paga la Fragata (8 por banda, ×1):

| Barco (cañones por banda) | Factor | Cañones N2 / N3 | Casco N2 / N3 | Velas N2 / N3 | Las 6 |
|---|---|---|---|---|---|
| Balandra (4) | ×0,5 | 250 / 750 | 200 / 600 | 150 / 450 | 2 400 |
| Goleta (4) | ×0,5 | 250 / 750 | 200 / 600 | 150 / 450 | 2 400 |
| Bergantín (6) | ×0,75 | 375 / 1 125 | 300 / 900 | 225 / 675 | 3 600 |
| Fragata (8) | ×1 | 500 / 1 500 | 400 / 1 200 | 300 / 900 | 4 800 |
| Navío de línea (10) | ×1,25 | 625 / 1 875 | 500 / 1 500 | 375 / 1 125 | 6 000 |

*Por qué este factor* (descartes en Q34): lo que vale una mejora crece con el barco. Los Cañones N1 → N3 suman 7,55 de DPS por cada cañón por banda (§7: 48 × 0,8 / 3 − 30 × 0,7 / 4), así que dan +30,2 a la Balandra y +75,5 al Navío. El Casco ×1,4 da +320 de vida a la Balandra y +1 280 al Navío. Con el precio en proporción a los cañones, el valor por oro queda parecido en los 5 barcos, y la regla se explica en una frase. Las cifras de la tabla son exactas: cada precio sale entero.

**Lectura de diseño: comprar un barco es una inversión con bajón.** Una Fragata recién comprada (N1: 42 de DPS, 60 m de alcance y 10 m/s) dispara menos y llega menos lejos que el Bergantín mejorado del que viene (N3: 76,8 de DPS, 80 m y 14,4 m/s); solo tiene más vida (2 200 frente a 1 960). Es lo que pide la regla: cada barco hay que mejorarlo. El jugador puede seguir navegando el Bergantín y mejorar la Fragata sin navegarla, desde su botón «Mejoras», hasta que le convenga cambiar. Lo que no puede pasar es que se entere después de pagar: la tienda lo dice antes (abajo).

**Total:** el camino de AC-60 (el Bergantín y la Fragata con sus mejoras) suma **16 400** de oro, y el del bucle largo (además, el Navío con las suyas), **34 400** (§10, «Cómo encaja la 1.3»). Sustituye, desde la 1.3, a la línea «Total de la progresión» de abajo. Con todo (los 5 barcos, sus 30 mejoras y las 2 familias), el catálogo suma 50 200, que no es un hito: nadie mejora los barcos que ya no usa.

### Qué debe comunicar la tienda (1.3; el diseño es del lead, con el visto bueno de Jonattan, BACKLOG AC-192)
- **La tienda es por barco** (Jonattan, 2026-11-16, al pedir cambios a D99: «Deberia seleccionarse cada barco y cada uno deberia tener un botón de mejoras y se abre la visual. Si lo dejas como "Mejoras" es confuso porque como selecciona a que barco mejorar. Ademas cada barco necesita que una imagen de su preview no un logo genérico de un barco»). Las pestañas son Barcos y Familia.
- **Barcos:** cada barco, con **la imagen de su vista previa** (su modelo, con la familia en uso o sin familia), no con el icono genérico. En los que tiene, sus 3 niveles, para comparar sin abrir nada; cuál navega; «Elegir» para navegarlo y **«Mejoras»** para mejorarlo. En los que no tiene, «Comprar» y, antes de pulsarlo, que un barco nuevo llega con las mejoras a nivel 1.
- **La vista de mejoras de un barco** (se abre con su botón «Mejoras»): de qué barco son, con su nombre y su imagen; sus 3 mejoras con su nivel y su precio; si no es el que navega, que la mejora se le aplica igual y que el barco que navega no cambia; y cómo se vuelve a la lista.
- **Familia:** las 3 opciones, «sin familia» y las 2 familias, cada una con el barco activo como se vería; cuánto cuesta cada familia antes de pulsar nada; que solo cambia el aspecto; que cada familia se compra una vez y vale para todos los barcos, también los que compre después; que «sin familia» es gratis y se puede volver a ella; y cuál está en uso. *Cambiado el 2026-11-15 con Q38:* decía que la británica venía incluida.
- **Todo**, en 1440×900, 390×844 y 844×390, con el panel de escritorio de 880 × 672 (D85) y sin recortar las líneas de nivel de la Goleta y el Navío (BACKLOG AC-162).
- **Las imágenes** son un solo juego por clase y aspecto (5 clases × «sin familia» y 2 familias = 15), el mismo que usa la pestaña Familia (BACKLOG AC-195): la misma vista, ≤ 40 KB cada una a 2×, con hash y caché larga. Se bajan al abrir el Astillero, solo las del aspecto en uso (5), y no cuentan en la primera visita.

### Precios base y barcos (la base es la de la Fragata desde la 1.3; hasta la 1.2, la de todos)

| Mejora | Nivel 1 | Nivel 2 | Nivel 3 |
|---|---|---|---|
| Cañones | §7 | 500 oro | 1 500 oro |
| Casco (vida máx.) | ×1,0 | ×1,2 — 400 oro | ×1,4 — 1 200 oro |
| Velas (vel. máx.) | ×1,0 | ×1,1 — 300 oro | ×1,2 — 900 oro |

- **Barcos**: comprar un barco te cambia a él con la vida llena. Los barcos comprados quedan en propiedad y se puede cambiar entre ellos gratis en el puerto.
- **Total de la progresión**: 2 000 + 6 000 + 500 + 1 500 + 400 + 1 200 + 300 + 900 = **12 800 oro**. **1.1:** con la Goleta (3 000) y el Navío (12 000), el catálogo completo suma **27 800 oro**. Los 12 800 siguen siendo la cifra de AC-60 (§10).

### Zona segura bajo fuego (1.3)

*Pedido de Jonattan del 2026-11-15:* «la zona segura solo sea valida si los jugadores no estan bajo fuego». La regla es de producto (delegación del 2026-10-17); cómo se comunica en el HUD, de `game-ux`. Criterios: BACKLOG E20 (AC-240 a AC-257). Las citas de código de esta subsección son de `a68836f`.

**La regla.** La zona segura protege a un jugador solo si está dentro de los 110 m **y no está bajo fuego**. Está bajo fuego durante **10 s** desde la última andanada que **dispara** o que **le disparan**, de un NPC o de un jugador. Mientras dura, dentro de la zona cuenta como fuera: le pueden atacar, puede atacar y el puerto (tienda y cambio de barco) está cerrado. Dentro y sin marca nadie puede dispararle, así que **nadie puede ponerle bajo fuego dentro de la zona si no lo estaba ya**: la zona deja de cortar un combate en curso, pero sigue sin dejar que empiece uno contra quien está en paz.

```
                andanada que disparas o que te disparan
                       (la marca pasa a t + 10 s)
  [Sin marca] ───────────────────────────────────────► [Bajo fuego] ◄──┐
       ▲                                                   │   │       │ otra andanada:
       │      10 s sin andanadas  ·  zarpar tras hundirse   │   └───────┘ vuelve a t + 10 s
       └───────────────────────────────────────────────────┘

  Protegido por la zona  =  dentro de los 110 m  Y  sin marca
```

| Lo que hace la zona | Dentro, sin marca | Dentro, bajo fuego | Fuera |
|---|---|---|---|
| Los NPC hostiles te eligen y te dañan | No | Sí, si te tienen a tiro (no entran a < 130 m; ver «Los NPC») | Sí |
| Otros jugadores te atacan | No | Sí | Sí |
| Atacas a otro jugador | No | Sí, si él es atacable | Sí, si él es atacable |
| Atacas a un NPC | Sí, y al disparar quedas bajo fuego | Sí | Sí |
| Tienda y cambio de barco | Sí | **No** | No |

La protección al reaparecer (§12) no cambia y va aparte: mientras dura, nadie te ataca, estés donde estés.

**Qué te pone bajo fuego.** Cada caso lleva la marca a `max(marca, t + 10 s)`; nunca la acorta ni la acumula:
1. Que se **lance** contra ti una andanada de un NPC o de un jugador, acierte o no. Cuenta el instante del disparo, no el del impacto: así una andanada en vuelo siempre llega (vuela ≤ 0,67 s: 80 m a 120 m/s, §7), aunque cruces los 110 m mientras vuela.
2. **Disparar tú** una andanada, contra un NPC o contra un jugador.

**Qué no:** seleccionar o armar un ataque sin disparar (p. ej., «Fuera de alcance»), que te persigan sin dispararte, reparar, recoger restos, que otros combatan a tu lado, ni la huida de un mercante.

*Por qué disparar también cuenta:* sin ello queda el abuso contrario. Desde dentro se puede atacar a un NPC (`canAttack`, `src/game/world.ts:209`), y el NPC nunca responde, porque quien está dentro no es atacable. Seafight usa la misma definición de combate para desconectarse: «without moving, shooting or being shot» (REFERENCE §10, S15).

**Cuánto dura: 10 s (`UNDER_FIRE_WINDOW`).** No se reutiliza la ventana de 3 s de la reparación (§8, `REPAIR_UNDER_FIRE_WINDOW`), que sigue igual y aparte:
- 3 s no supera ninguna recarga del juego (3,0 a 5,0 s; §7 y §9). Entre dos andanadas la marca caducaría, la zona volvería a proteger y el ataque se cancelaría (AC-34): la regla no haría nada contra quien sigue disparando.
- 10 s es el doble de la recarga más lenta (5,0 s, la cañonera y el galeón): un ataque sostenido no deja caducar la marca, aunque pierda una andanada por quedar un momento fuera de alcance.
- Es la tercera parte de los 30 s de Seafight para desconectarse (S15): tras un combate, volver a reparar y comprar cuesta 10 s, no 30. Seafight no dice cuánto dura su «involved in battle» (S33 solo dice «recently»): no hay fuente para la cifra, y los 10 s son de producto.
- Pasar la ventana de la reparación a 10 s cambiaría el balance de §8 sin que nadie lo pida.

**El daño recibido dentro renueva la marca, y es la intención.** Si un perseguidor te sigue dentro y sigue disparando, sigues bajo fuego hasta que deje de disparar 10 s, te hunda o lo hundas. No hay tope, porque no hace falta: (1) dentro y sin marca nadie puede empezar a dispararte, así que la marca solo alarga un combate que ya existía; (2) el perseguidor también está bajo fuego por sus propias andanadas, así que puedes responderle y otros pueden defenderte; (3) cada andanada hace daño, así que acaba en un hundimiento o con el atacante parado, nunca en un bucle. Lo que la regla quita es meterse en los 110 m para salir de un combate perdido, no la zona como lugar tranquilo.

**Los NPC.** Su navegación no cambia: siguen sin entrar en el círculo de 130 m (§9, AC-47), y el interior del puerto sigue siendo un refugio:
- **Solo el pirata llega a disparar dentro de la zona.** Desde 130 m y con 55 m de alcance, alcanza hasta **75 m del puerto**; los amarres (de 41,8 a 58,6 m del centro, BACKLOG AC-63) quedan fuera. No llegan la cañonera (≥ 200 m del puerto: su anillo empieza a 400 m y su correa es de 200 m), el Capitán (≥ 290 m: guarida a 440 m y correa de 150 m) ni el Galeón (anillo de 250 m y 60 m de alcance).
- **Regla nueva: un NPC hostil suelta al objetivo que está dentro de la zona y fuera de su alcance,** y pasa a Regreso en ese tick (§9; al llegar recupera la vida). Sin ella, la regla crearía una granja: un jugador bajo fuego a < 75 m del puerto, con más alcance (cañones N2 o N3, 70 u 80 m), dispararía a un pirata clavado en su borde de 130 m sin recibir nada. Con ella, lo que se le acierta mientras se aleja es lo mismo que en la 1.2 al meterse en la zona.
- Un hostil sí elige como objetivo a quien está dentro bajo fuego y a tiro, y no lo suelta mientras siga así.

**El puerto cierra bajo fuego.** Ni la tienda ni el cambio de barco funcionan bajo fuego, aunque estés dentro de la zona. *Por qué:* comprar un barco te lo da con la vida llena (más arriba), así que sería curarse en mitad de un combate, y comprar Cañones N3 en pleno duelo lo decide un menú. En Seafight se equipa en el refugio, y no se entra en él en pleno combate (S33). Si la tienda está abierta cuando caes bajo fuego, se cierra, como al salir de la zona. Una compra que el servidor ya validó y está escribiendo se entrega igualmente: es la limitación conocida de `applyBuy` (P3, `src/game/world.ts:618-620`), que esta regla no cambia. **Cómo se construye:** la condición va en un helper (`canUsePort(world, ship)`), y en `planBuy` y `planSelectShip` (`world.ts:607` y `:661`) solo cambia la línea de la condición. No se tocan `server/progress.ts`, la forma de `ShopItem` ni `applyPurchase` (BACKLOG AC-252).

**Qué necesita saber el jugador** (lo diseña `game-ux`, con imagen):
1. **Que está bajo fuego y cuántos segundos faltan,** en cualquier punto del mapa, para decidir si le compensa huir al puerto.
2. **Al entrar en la zona bajo fuego, que la zona aún no le protege,** en el momento en que cruza los 110 m y con los segundos que faltan. Es el caso que más sorprende: cree que ya está a salvo.
3. **Dentro, si la zona le protege o no:** el aviso «Zona segura» (§14) tiene 2 estados que se distinguen de un vistazo, también en escala de grises.
4. **Cuándo vuelve a estar protegido:** el aviso pasa al estado normal ~~en el snapshot en que caduca la marca~~ en ≤ 200 ms desde que caduca la marca. *Corregido el 2026-11-16 (O-150):* cuando caduca no llega ningún snapshot, así que el cliente cambia el aviso con su reloj.
5. **Por qué no abre el puerto:** el botón Puerto, desactivado, dice que es por estar bajo fuego (no por estar fuera de la zona) y cuántos segundos faltan.
6. **Si otro jugador dentro de la zona es atacable:** su panel de objetivo dice «En alcance» o «Fuera de alcance» si está bajo fuego, y «✕ No atacable» si no (§14).

La palabra para el jugador es **«bajo fuego»**, la de Jonattan. No se pide un efecto nuevo sobre el barco; si `game-ux` cree que hace falta, lo propone.

**Red.** La marca de cada jugador viaja en su barco como el campo `uf` (el instante en que caduca, en el reloj del servidor, como `pu`), **solo cuando cambia**: como mucho una vez por andanada que lo afecta (los deltas son por campo, `server/game-server.ts:110` y `:333-354`). El cliente cuenta los segundos con su reloj, sin más mensajes. No hay intención nueva, así que el tráfico en reposo sigue en 0 (§13). Con `uf`, el cliente aplica la misma regla de atacable que el servidor (`canAttackClient`, `src/client/hud-logic.ts:239-250`).

**Constantes y nombres.** Son propuesta de producto; dev puede cambiar los nombres si lo dice en el PR, no los valores:

| Nombre | Valor o forma | Qué es |
|---|---|---|
| `UNDER_FIRE_WINDOW` | 10 s | Lo que dura la marca desde la última andanada propia o en contra |
| `Ship.underFireUntil` | Reloj del mundo; −∞ al crear el barco y al zarpar | Instante en que caduca la marca. Solo tiene efecto en jugadores |
| `isUnderFire(world, ship)` | `ship.underFireUntil > world.time` | Está bajo fuego |
| `isZoneProtected(world, ship)` | `isInSafeZone(ship.pos) && !isUnderFire(world, ship)` | Sustituye a `isInSafeZone` en las 3 comprobaciones de combate: `world.ts:198`, `:207` y `:896` |
| `canUsePort(world, ship)` | `isZoneProtected(world, ship)` | Condición del astillero y del cambio de barco (`world.ts:607` y `:661`) |
| `uf` | Campo del barco en el snapshot | `underFireUntil` hacia el cliente, solo al cambiar |
| Motivo del rechazo bajo fuego | «Bajo fuego: el puerto abre tras 10 s sin disparos» (provisional; el texto final es de `game-ux`) | Respuesta a `buy` y `selectShip` bajo fuego. Fuera de la zona, los motivos de hoy no cambian |

No cambian `SAFE_ZONE_RADIUS` (110 m), `PIRATE_PORT_EXCLUSION` (130 m), `REPAIR_UNDER_FIRE_WINDOW` (3 s), `SPAWN_PROTECTION` (15 s) ni `DISCONNECT_GRACE` (10 s). El `underFire` del HUD (`src/client/hud-store.ts:24`) es el de la reparación, a 3 s: el estado nuevo no lo reutiliza.

**Casos límite** (los comprueba E20):

| Caso | Qué pasa |
|---|---|
| Entrar perseguido | La zona no protege hasta 10 s después de la última andanada. Las andanadas en vuelo llegan. Un pirata te sigue disparando mientras te tenga a tiro (≥ 75 m del puerto); más adentro te suelta |
| La marca caduca dentro | En ese tick quedas protegido: los ataques contra ti terminan (AC-34) y los NPC te sueltan |
| Recibes daño dentro | Renueva la marca. Solo puede pasar si ya estabas bajo fuego |
| PvP, el que huye | El atacante sigue atacando dentro, desde fuera o siguiéndote, y mientras dispara también está bajo fuego |
| PvP, desde dentro | Sin marca no puedes atacar a un jugador; bajo fuego, sí, si él es atacable. Un tercero sin marca dentro no puede meterse en un combate PvP que ocurre en la zona: tiene que salir o estar bajo fuego. Así ningún combate PvP empieza desde la protección |
| Morir dentro | Igual que fuera (§10, §10b, §12). Zarpas sin marca y con los 15 s de protección |
| Desconectarse bajo fuego | La marca sigue corriendo: el barco, que se queda 10 s (§13), es atacable dentro hasta que caduque |

**Contraste con Seafight:**

| Seafight | Fila de REFERENCE | Sea Battle 1.3 |
|---|---|---|
| «You will not be allowed access to the Safe Haven if you are currently involved in battle.» | §18, S33 (cita comprobada de nuevo por producto el 2026-11-15) | **Se adopta, en un solo mapa:** se puede entrar, pero la zona no protege mientras dura el combate |
| «you can not take damage while situated there.» | §18, S33 | Igual, sin marca |
| «and equip your boat to the best it can be!» | §18, S33 | El puerto cierra bajo fuego: se equipa entre combates |
| «Click this bar when you want to leave the Safe Haven» | §11, S15 | No se adopta: la zona es un círculo del mismo mapa y se sale navegando (§4) |
| «The default logout time is 30 seconds without moving, shooting or being shot» | §10, S15 | Se adopta qué es combate (disparar o que te disparen), no los 30 s |
| «you will simply not repair as much» | §7, S9 | Sin cambios y aparte: la reparación rinde menos durante 3 s desde el último daño (§8) |
| Cuánto dura «involved in battle» | — | **HIPÓTESIS:** S33 solo dice «recently». Los 10 s son de producto |

**Decisión Q40 (de producto, 2026-11-15, por la delegación de Jonattan).** Va aquí y no en la tabla de §17 para no tocar sus filas. Descartadas:
1. **Impedir entrar en la zona bajo fuego**, como el refugio de Seafight. En un solo mapa la zona es un círculo en el agua: un muro invisible rompe la navegación por clic (pilar P1) y deja fuera del puerto a quien huye.
2. **Que solo cuente el daño recibido.** Deja sin respuesta los disparos a NPC desde dentro, y una andanada sin aciertos dejaría caducar la marca por azar.
3. **Reutilizar la ventana de 3 s de la reparación.** No supera ninguna recarga (ver «Cuánto dura»).
4. **Que los NPC entren en la zona a perseguir.** Los amarres dejarían de ser un refugio, los NPC caerían sobre quien acaba de aparecer y cambiarían AC-47 y el balance medido (§9). Basta con que suelten al objetivo que no alcanzan.
5. **Un tope a la renovación dentro de la zona.** Pasado el tope, la zona volvería a cortar el combate: premiaría al que huye frente al que gana, que es lo que el pedido quiere quitar.

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
| Entidades máximas | 20 jugadores + 20 NPC + 1 jefe = 41. **1.1 (P2):** 42 con el Galeón del tesoro, que ya no lleva escolta (§9; eran 44 con sus 2 escoltas); AC-03, AC-88 y AC-89 se miden con 42 |
| Simulación | 20 Hz, autoritativa en el servidor |
| Snapshots | 10 Hz, **solo deltas** de las entidades que cambiaron dentro del área de interés (radio de 300 m alrededor del barco y, en vista libre (I2), también alrededor del centro de la vista). Snapshot completo al entrar. **Si no cambia nada, no se envía nada.** El Capitán pirata vivo se envía siempre, para el marcador del minimapa, y el Galeón vivo también (1.1, P2). **1.1:** la XP propia y el nivel de cada jugador viajan solo cuando cambian (al hundir algo o al subir de nivel), nunca en cada frame. También solo al cambiar viajan el **evento de ascenso** y las **parejas abiertas** («Piezas de red de la 1.1», debajo de esta tabla) |
| Interpolación en el cliente | Búfer de 100 ms. Sin predicción, también para el barco propio. El marcador de clic es inmediato y local. |
| Latencia del clic al movimiento visible | Entre 0 y 50 ms hasta el tick, entre 0 y 100 ms hasta el snapshot y 100 ms de búfer, más la red y el render. Medido en local: 263–309 ms. En producción hay que sumar el RTT. Es aceptable para un control por clic: "For RTS games, 250 milliseconds of command latency was not even noticed… between 250 and 500 msec was very playable" ([Bettner y Terrano, GDC 2001](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)). La respuesta inmediata la da el marcador (≤ 50 ms). Por encima de 500 ms con el RTT real, se evalúa la predicción del barco propio (P2). **Umbral en Railway: p95 ≤ 500 ms**, medido con AC-136 desde conexiones domésticas reales. Si no se cumple, bloquea la 1.0.0. |
| Presupuesto de bajada | ≤ 10 mensajes/s y ≤ 12 KB/s de media por cliente con el servidor lleno. En vista libre (I2): ≤ 10 mensajes/s y ≤ 16 KB/s |
| Subida en reposo | **0 mensajes** de juego si el jugador no actúa (el latido de Engine.IO queda excluido) |
| Límite de intenciones | 10/s por cliente (ráfaga de 20). El exceso se descarta. |
| Desconexión (P1) | El barco se queda 10 s en el mundo y se le puede atacar. Si el jugador reconecta en ese tiempo, recupera el mismo barco. |
| Persistencia (P0 para la 1.0.0) | Oro, mejoras, barcos en propiedad y barco activo, por el `userId` del JWT verificado de Clerk, en **Postgres en Railway** (Q2). El invitado no persiste. La vida y la posición no se guardan. Las compras y el cambio de barco se escriben antes de confirmarse; el oro, en ≤ 5 s. Un redeploy no pierde nada, y una sola sesión por `userId`. Si la BD falla al entrar, no se juega con un estado por defecto; si falla durante la partida, todos los jugadores con cuenta siguen jugando sin tienda y con aviso, y el invitado no nota nada (BACKLOG AC-129 a AC-133). Los límites aceptados (compra al morir, corte en cada deploy) están en BACKLOG, «Conocidos de la 1.0.0». **1.1:** también la **XP**, con las mismas reglas que el oro (escrita en ≤ 5 s y al desconectarse). El nivel se calcula de la XP y no se guarda aparte. El invitado sigue sin guardar nada. **1.3:** también **las mejoras de cada barco, las familias que tiene el jugador y la que usa** (§6 y §11). Comprar una mejora, un barco o la familia, y cambiar de barco o de familia, se escriben antes de confirmarse. Con la BD caída, la tienda entera queda cerrada, también la pestaña Familia (AC-132) |
| Formato de la fila (1.1, P0; fijado antes de la 1.0.3) | La columna `state` (jsonb) de `player_progress` pasa a `{ v: 2, gold, upgrades, ownedShips, activeShip, xp }`, con claves exactas como en la 1.0.2 (`server/progress.ts:45` en `v1.0.2`). `xp`: entero de 0 a 9 999 999. Ids de clase en `ownedShips` y `activeShip`: los 5 de la tabla «Ids de clase de la fila», debajo de esta tabla, con el detalle de lectura y escritura |
| Lectura de las filas de la 1.0 y vuelta atrás (1.1, P0) | Las filas `v: 1` de la 1.0 se leen con **0 de XP** (nivel 1) y el resto intacto, y pasan a `v: 2` cuando su jugador escribe: **no hay migración SQL** ni reescritura en bloque. Un registro mal formado se rechaza como cualquier registro corrupto (AC-131; los casos nuevos, en BACKLOG AC-156). Antes del deploy en prod se hace una copia de seguridad de la tabla y se prueba a restaurarla en un Postgres aparte. **Volver a la versión anterior no puede dejar fuera a nadie:** la 1.0.2 rechaza cualquier fila con XP o con un barco nuevo, porque valida las claves exactas y la lista cerrada de barcos (`server/progress.ts:45-52` en `v1.0.2`). Por eso la 1.0.3, que sale antes que la 1.1, trae solo un lector que acepta este formato y lo conserva al escribir (Q29, decidida; BACKLOG AC-157 y AC-179) |
| Formato de la fila (1.3, P0; fijado el 2026-11-15, antes de construir el puente) | La columna `state` pasa a `{ v: 3, gold, xp, ships, activeShip, families, family }`, con claves exactas. `gold` y `xp`, como en la `v: 2`. **`ships`**: un objeto con una clave por barco que tiene el jugador (los ids de la tabla «Ids de clase de la fila», debajo), y en cada una, exactamente `{ cannons, hull, sails }`, enteros de 1 a 3; al menos un barco. **`activeShip`**: una clave de `ships`. **`families`**: la lista, sin repetidos, de las familias que ha comprado (`gb` y `es`, los ids de §6), que puede estar vacía. **`family`**: la que usa, que es `"none"` («sin familia», Q39) o una de `families`. *Fijado el 2026-11-15 con la respuesta de Jonattan a Q38 («Las dos se pagan»), antes de empezar el puente:* la versión anterior del mismo día daba la británica por tenida. `ships` sustituye a `upgrades` y a `ownedShips`: tener un barco es tener su clave, así que no hay dos listas que puedan contradecirse. Lectura, escritura y rechazos, debajo de la tabla. **El formato no cambia una vez que empiece el puente** (BACKLOG AC-220): si cambiara, habría que rehacerlo, y con el puente ya en prod, publicar otro |
| Lectura de las filas anteriores y vuelta atrás (1.3, P0; Q35 y Q36) | La 1.3 lee `v: 1`, `v: 2` y `v: 3`, y siempre escribe `v: 3`. **Una `v: 1` o `v: 2` entra con los niveles de su `upgrades` en cada barco de `ownedShips`**, sin familia (`families: []` y `family: "none"`, como un jugador nuevo; Q39); la `v: 1`, además, con 0 de XP. Pasa a `v: 3` cuando su jugador escribe: sin migración SQL ni reescritura en bloque, como la `v: 1` → `v: 2` de la 1.1. **La vuelta atrás:** la 1.2.0 solo acepta `v: 1` y `v: 2` con sus claves exactas (`server/progress.ts:85-87` en `801c185`) y, si no, lanza `InvalidProgressError` (`server/persistence.ts:33-34`), que el jugador ve como «No podemos cargar tu progreso ahora mismo» (`server/game-server.ts:92`). Volver de la 1.3 a la 1.2.0 dejaría fuera a todo el que hubiera jugado la 1.3. Por eso una **1.2.x puente**, con un lector que acepta este formato y lo conserva al escribir, tiene que estar en prod antes que la 1.3 (Q36; BACKLOG AC-220 y AC-221), como la 1.0.3 antes de la 1.1. Antes del deploy, copia de seguridad de la tabla, restaurada a prueba (BACKLOG AC-230) |

**Piezas de red de la 1.1** (solo viajan al cambiar; no son intenciones):
- **Evento de ascenso** (barco e insignia nueva). Forma exacta: `{ type: 'rankUp'; shipId: string; rank: 2 | 3 | 4 | 5 }`, un `GameEvent` más de la lista `e` del frame (`src/game/types.ts:98-105` y `:165`). `rank` es el orden de la insignia en §10b: 1 Grumete, 2 Marinero, 3 Contramaestre, 4 Teniente y 5 Almirante; nunca vale 1, porque nadie asciende a Grumete. No lleva posición: el cliente usa la del barco. Sale en el frame del tick en que un jugador cambia de insignia, como mucho uno por jugador y tick. Lo reciben el dueño del barco y cada cliente que tiene ese barco en su área de interés en ese frame, con **la regla de visibilidad de los barcos**: centro a ≤ 300 m (`INTEREST_RADIUS`, `server/game-server.ts:312`; en vista libre, I2, también alrededor del centro de la vista). **No** usa los 300 + 60 m de los demás eventos (`EVENT_MARGIN`, `server/game-server.ts:93` y `:343`): entre 300 y 360 m el cliente no tiene el barco y no podría dibujar el efecto (decidido el 2026-10-17, R-29 de QA). En un frame completo no viaja ningún evento (`server/game-server.ts:372`), así que un ascenso que coincide con uno no da efecto, igual que un barco que entra en el área. Es distinto de la subida de nivel, que solo recibe el propio. Un hundimiento que cruza 2 insignias da 1 evento, con la final. **El cliente nunca deduce un ascenso de un nivel distinto:** un barco que entra en el área con otra insignia no dispara efecto ni feed. Es el disparador del efecto de ascenso (VFX-SPEC §16, fila «Disparador»; BACKLOG AC-159).
- **Parejas abiertas**, con el estado propio, al entrar y al cambiar: por cada víctima con hundimientos con XP en su ventana de 30 min (§10b), cuántos lleva (1 o 2) y cuándo vence. El cliente expira la pareja con esa hora, sin otro frame. Sirven para el panel del objetivo (BACKLOG AC-160); el historial sigue viviendo en el servidor.
- **Familia de cada jugador** (1.1 si pasa el piloto; §6, «Familias de barcos»). Viaja con el barco al entrar en el área de interés y al cambiar. El cliente la manda al entrar, con lo que guardó el navegador, y al elegirla en el puerto. Elegirla sí es una intención: el servidor la valida como las demás (en la zona segura, valor de la lista y con el límite de intenciones). Un valor que no conoce no rechaza la entrada, sino que entra con la de por defecto, para que un navegador con un valor viejo no deje a nadie fuera. **No va en la fila** (§6, fila «Dónde se guarda»). *Cambiado el 2026-11-15 para la 1.3 (Q33):* **va en la fila**, y la da el servidor con el progreso. El cliente ya no la manda al entrar, y un valor guardado en el navegador solo sirve para predecir la descarga del modelo propio (BACKLOG AC-193 c). `selectFamily` solo vale con una familia que el jugador tiene o con `none`, y comprar una familia va por `buy` (tabla de intenciones, abajo). Sigue viajando con cada barco al entrar en el área de interés y al cambiar, también cuando es `none` (§6, fila «Familias»).
- **Mejoras de cada barco y familias propias (1.3)**, con el estado propio, al entrar y al cambiar (al comprar una mejora, un barco o la familia). Las de los demás no viajan. Nunca en reposo: AC-86 y AC-87 siguen en 0.

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

**Lectura y escritura de la fila en la 1.3 y en la 1.2.x puente** (decidido por producto el 2026-11-15; Q35 y Q36):
- **La 1.3** lee `v: 1`, `v: 2` y `v: 3`, y siempre escribe `v: 3`. Con las 5 clases jugables, ningún barco de la fila queda aparte (`RowCarry`, `server/progress.ts:35-39` en `801c185`).
- **Migración de una `v: 1` o `v: 2`:** cada barco de `ownedShips` recibe los 3 niveles de `upgrades`. Ejemplo: `upgrades { cannons: 3, hull: 2, sails: 1 }` con `ownedShips ["sloop", "brig", "frigate"]` da los 3 barcos a (3, 2, 1). `activeShip` se conserva, `families` es `[]` y `family` es `"none"`: nadie recibe una familia de regalo (Q39).
- **Orden al escribir:** `families` en el orden de §6 (`gb`, `es`), y los tests lo asertan. Las claves de `ships` no tienen orden que asertar: Postgres guarda el jsonb con las claves de un objeto en su propio orden, y solo las listas conservan el suyo. Ninguna versión depende del orden al leer.
- ~~**La británica:** el juego siempre la da, y la 1.3 la escribe siempre en `families`. El parser no la exige […]~~ *Quitado el 2026-11-15 con Q38:* ninguna familia viene dada. `families` lista solo las compradas, y `"none"` no va nunca en ella.
- **Se rechazan como registro corrupto** (AC-131; sin tocar la fila), además de los casos de la `v: 2`: una `v: 3` con `upgrades` u `ownedShips`, o sin alguna de sus 7 claves, o con una de más; `ships` vacío, con una clave fuera de los 5 ids o con un barco sin alguno de los 3 ejes, con uno de más o con un nivel que no sea entero de 1 a 3; `activeShip` que no sea clave de `ships`; `families` que no sea una lista, con un id fuera de `gb` y `es` (también `"none"`) o con repetidos; `family` que no sea `"none"` ni esté en `families`; y una `v: 1` o `v: 2` con `ships`, `families` o `family`.
- **La 1.2.x puente** acepta exactamente `v: 1`, `v: 2` y `v: 3` de este formato, y rechaza lo demás como la 1.3. Con una `v: 3`:
  - **juega** con el oro, la XP y los barcos que sabe jugar (`sloop`, `brig` y `frigate`; `schooner` y `line` quedan aparte, como hoy). El barco activo sigue la regla de la `v: 2`: si es uno que no juega, el mejor de los que juega. Sus mejoras, que en la 1.2 son globales, son las del barco con el que juega. No enseña familias: los barcos se ven como en la 1.2.0;
  - **escribe la misma `v` que leyó.** En una `v: 3` conserva cada entrada de `ships` ~~tal como la leyó~~ **tal como está en la fila, es decir, como la dejó la última escritura**, salvo la del barco con el que juega al escribir, que toma en cada eje el mayor entre lo guardado y sus mejoras globales. Un barco comprado en la 1.2.x entra igual, desde el nivel 1. Conserva `families` y `family`, y guarda como activo el barco con el que juega. *Precisado el 2026-11-16 por producto, a propuesta de dev-puente (rama `feat/progress-v3-reader`):* «tal como la leyó», al pie de la letra, hacía que en una sesión con varias escrituras la segunda le quitara a un barco la mejora comprada en la primera (su test en rojo: los Cañones de la Fragata, de 3 a 2), y eso rompe «no se pierde nada de lo pagado». **Dos casos de borde, solo posibles editando la fila a mano o por un fallo, validados el mismo día:** (a) una `v: 3` sin ningún barco de la 1.2 juega con la Balandra a nivel 1 y, al escribir, la añade a `ships`, como la regla de la `v: 2` (BACKLOG AC-157 b); (b) un barco que el jugador tiene pero que no está en la fila, y con el que no juega, entra a nivel 1: no se jugó, así que no hay nada pagado que darle, y es la misma regla que un barco recién comprado. ~~Una `v: 2` sigue en `v: 2` y una `v: 1` en `v: 1`, así que la 1.2.0 las puede leer si hubiera que volver de la 1.2.x a la 1.2.0 antes de la 1.3.~~ *Corregido el 2026-11-16 por producto, a propuesta de dev-puente:* **una `v: 1` se escribe como `v: 2`, como ya hace la 1.2.0; una `v: 2` sigue en `v: 2`; y una `v: 3` sigue en `v: 3`**, que es la regla que importa. Motivos: (1) la 1.2.0 escribe siempre `v: 2` (`server/progress.ts:69-75` en `801c185`), y el puente no tiene por qué apartarse; (2) una `v: 1` no tiene `xp`, así que escribirla como `v: 1` perdería, en la lectura siguiente, la XP ganada en la 1.2.x; (3) la 1.2.0 lee `v: 2`, así que volver de la 1.2.x a la 1.2.0 antes de la 1.3 sigue sin dejar fuera a nadie. La frase venía de la 1.0.3, cuando la 1.0.2 no leía `v: 2`. «Escribe la misma `v` que leyó» vale para la `v: 3` y para la `v: 2`.
- **Por qué «el mayor» y en el barco con el que juega:** en la 1.2.x las mejoras son globales, y cada compra se escribe en el momento (§13, «Persistencia»), con el barco para el que se compró como activo. Así no se pierde nada de lo pagado. **El coste, aceptado:** un barco al que el jugador cambia durante la 1.2.x se queda, al escribir, con los niveles del barco del que venía. Solo pasa en una vuelta atrás de emergencia, y el jugador gana niveles que ya tenía en otro barco. **Descartados:** que la 1.2.x lleve las mejoras por barco, porque es media E19 en una versión cuyo único trabajo es no dejar a nadie fuera; y que cierre la tienda con una `v: 3`, porque es un caso especial y deja a un jugador sin poder gastar.
- **Descartados para el formato:** (a) **una columna o una tabla aparte** con las mejoras por barco y las familias, que la 1.2.0 ignoraría y ahorraría el puente. Pide la migración 2, reparte una escritura en dos campos (el motivo de no poner la XP en una columna, arriba) y, tras una vuelta atrás, la 1.2.0 escribiría `upgrades` sin tocar la otra columna, que habría que reconciliar al volver; (b) **conservar `upgrades` y `ownedShips` y añadir los niveles por barco**: dos sitios que dicen qué barcos tiene el jugador, que pueden contradecirse; (c) **aceptar ya ids de familia desconocidos**, para que una familia futura no pida su propio puente: «más familias» es P3 y sin fecha. Queda la regla: **toda versión que cambie el formato de la fila sale después de su puente en prod.**
- **Las mejoras y las familias van en el jsonb**, como la XP: misma fila, misma guarda de `revision` (AC-130) y sin migración SQL.

**Intenciones (cliente → servidor)**. La selección es local y no viaja por la red.

| Intención | Datos | El servidor valida |
|---|---|---|
| `moveTo` | `{x, z}` | Números finitos (se ajustan al límite); jugador vivo |
| `stop` | — | Jugador vivo |
| `attack` | `{targetId}` | El objetivo existe, está vivo, no es uno mismo y es atacable según §7 |
| `cancelAttack` | — | — |
| `repair` | `{on: boolean}` | Jugador vivo |
| `buy` | `{itemId}` | §11; desde la 1.1, también el nivel mínimo de la Goleta y del Navío (§6). La 1.1 no añade intenciones: la XP la da el servidor. **1.3:** una mejora lleva el barco, `{ itemId: "cannons:2", ship: "brig" }`, que puede ser cualquier barco del jugador, el activo o no (2026-11-16), y se rechaza si `ship` no es suyo o falta; un barco (`ship:<id>`) y la familia (`family:es`) van sin `ship`. Una familia (`family:gb` o `family:es`): no la tiene, está en la zona segura y tiene 4 000 de oro. *Cambiado el 2026-11-15 con Q38:* `family:gb` se vende |
| `selectShip` | `{classId}` | Lo posee y está en la zona segura. **1.3:** y no está bajo fuego (§11) |
| `selectFamily` (1.3) | `{family}` | `"none"` siempre vale; `"gb"` o `"es"`, solo si la tiene. Está en la zona segura y no está bajo fuego (§11), como `selectShip`. Elegir la que ya usa no lo envía el cliente |
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
| XP ganada (1.1) | «+N XP» con la parte propia del reparto, junto al «+N oro». En el feed de escritorio, una línea por hundimiento; en móvil, en el aviso. **Cada tramo sale solo si es > 0**: con 0 XP no sale ni el «+N XP» flotante ni el tramo «· +0 XP». Las líneas (decidido por producto el 2026-10-17, a pregunta de dev-render): (a) NPC, quien lo hunde: «Hundiste a Pirata +105 oro · +30 XP». (b) NPC, quien ayudó: «Botín +5 oro · +3 XP», y en el mercante, «Botín +5 oro» (AC-145). (c) Jugador, quien da el último golpe, que se lleva el oro de la penalización y su parte de la XP: «Hundiste a Barbarroja +50 oro · +100 XP». Si la víctima no tenía oro, «Hundiste a Barbarroja +100 XP», y sin oro ni XP, «Hundiste a Barbarroja»: es la única línea sin tramos, porque hundir a un jugador siempre se cuenta. (d) Jugador, quien ayudó, que cobra XP sin oro (fila «Oro en PvP»): «Ayudaste en un hundimiento +40 XP», sin nombre, porque quien ayudó puede estar ya fuera del área y no conocer el barco. Con 0 XP no tiene línea. La (c) sustituye a «Botín de combate +50 oro» de la 1.0 (`src/components/GameApp.tsx:151` en `v1.0.2`): nombrar al hundido es lo más importante de un hundimiento PvP, y es la misma forma que con un NPC. Si una línea no cabe con un nombre de 16 caracteres, se recorta el nombre y nunca las cifras | Al cambiar |
| Subida de nivel (1.1) | Aviso «¡Nivel N!» y, si cambia de insignia, «Ahora eres <insignia>». Con varios niveles de golpe (el Capitán), un solo aviso con el nivel final. No es un modal: no interrumpe el combate | Al cambiar |
| Pantalla de niveles e insignias (1.1) | Pedida por Jonattan el 2026-10-18 (BACKLOG AC-190). Se abre desde el panel del jugador o con `N` (§5). Muestra la insignia, el nivel, la XP total y la barra del nivel propios, y lo que falta para el siguiente nivel y para la siguiente insignia («Te faltan 460 XP para el nivel 8», «Te faltan 1160 XP para Contramaestre (nivel 9)»); los 20 niveles en 5 grupos, uno por insignia, con la XP total de cada nivel, el actual marcado («Estás aquí») y lo que desbloquean el 5 y el 9; y las 5 insignias dibujadas, más grandes que en el panel, con su nombre y sus niveles. No dice cómo se gana la XP: eso lo enseña el feed en cada hundimiento («+30 XP»). Comunica «dónde estoy, cuánto me falta y qué me espera». Las cifras salen de la tabla de §10b, no de una copia. No pausa el juego ni usa la red | Al abrirla y al cambiar la XP |
| Panel de objetivo | Nombre, tipo (hostil / pasivo / jugador), vida, distancia, "En alcance" o "Fuera de alcance". **1.1, si es un jugador** (decidido por producto el 2026-10-17, a pregunta de dev-render): la línea de tipo dice clase, nivel e insignia, «Balandra · Nivel 13 · Teniente», con la insignia delante. La clase va en su forma corta: «Navío» para el Navío de línea. Sale la palabra «jugador», porque la insignia ya lo marca (los NPC no llevan), y sale «PvP». Si no se le puede atacar (protegido o en la zona segura), la fila de la distancia dice «✕ No atacable» en lugar de «En alcance» o «Fuera de alcance», que con él no significan nada. Así se conservan las dos cosas que daba la 1.0 («Balandra · jugador · PvP» o «… · no atacable»): la clase, que dice lo fuerte que es, y si se le puede atacar. **1.1, si es un NPC: marca de peligro** (I2; decidido por producto el 2026-10-17; BACKLOG AC-189). Sale cuando hundirlo en solitario costaría más de la mitad de la vida máxima propia, calculado con las tablas: DPS del NPC × (su vida / DPS propio) / vida máxima propia. Comunica «este barco es demasiado fuerte para ti ahora». Por ejemplo, con la Balandra N1 sale con la cañonera (71 %) y con el Capitán, y no con el pirata (31 %). Se apaga con Cañones N2 (46 %). La forma es de game-ux | ≤ 10 Hz |
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
| Zona segura | Borde visible en el mundo + aviso "Zona segura" en el HUD. **1.3:** el aviso dice si la zona protege o no, y un indicador de «bajo fuego» con los segundos que faltan se ve en cualquier punto del mapa (§11, «Zona segura bajo fuego (1.3)») | Al cambiar; la cuenta atrás, ≤ 1 Hz |
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
            │                  ├──► Niveles e insignias (panel, 1.1; en cualquier momento, sin pausar)
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
| Tick de simulación con servidor lleno | p99 ≤ 4 ms (Node 24, la de Railway; BACKLOG DT-14), el menor de 3 repeticiones de 2 000 ticks (AC-03). Con las islas de D83 da 12,014 ms en la sonda de QA (BACKLOG O-43), y por eso `MAP_1_1` espera |
| Crecimiento de la memoria JS del cliente (heap de V8 + ArrayBuffer) en 10 min de combate en régimen, tras el calentamiento (AC-91) | ≤ 15 MB |
| Del clic al movimiento visible, en Railway con el RTT real (AC-136) | p95 ≤ 500 ms |
| Servidor lleno en tiempo real: 20 jugadores con PvP y NPC durante 10 min (AC-142 en local, AC-143 en staging; 1.1) | Respuesta a una orden p95 ≤ 150 ms; retraso del event loop p99 ≤ 20 ms y máximo ≤ 100 ms; 0 ticks perdidos, 0 desconexiones y 0 órdenes perdidas; red y tick con los mismos presupuestos de esta tabla y de §13 |
| Barcos con familias (1.1 si pasa el piloto; §6) | Los mismos ≤ 250 000 triángulos y ≤ 100 draw calls de arriba, y AC-90 en verde, con el peor caso: los 20 jugadores en Navío, mitad de cada familia, más los 20 NPC y las islas. El presupuesto por clase lo reparte `game-ux` (ASSET-SPEC §5). **Descarga, PROVISIONAL hasta medir el piloto en el juego** (BACKLOG AC-193 c; fijada el 2026-10-18 con los bytes de ux): ≤ 1,0 MB de modelos y texturas de barcos en la primera visita, y 0 B en las siguientes, con caché. La cadena de carga (el código del cargador y el transcodificador de texturas), compartida con el puerto y las islas, lleva su propia cota: ≤ 350 KB en la primera visita. La entrada espera al modelo del barco propio (≤ 120 KB), con un tope de 0,5 s más que hoy: si no llega a tiempo, o falla, entra con el modelo de hoy y lo cambia al llegar. Así el jugador no ve cambiar su propio barco nada más entrar en la primera visita. Los demás se descargan en segundo plano en cuanto se entra, y en ≤ 10 s están todos. Hoy los barcos son procedurales y no se descargan. *2026-11-16 (1.3; producto, con la medida de la cadena reconstruida):* **los barcos, ≤ 1 020 000 B en archivo** (GLB sin la KTX2 más la KTX2), con la bandera de D104 dentro, mientras la entrada siga en verde con las 10 combinaciones reales (BACKLOG `:361`, AC-193 c y AC-227 c). Un jugador sin familia no espera a ningún modelo propio (Q39) |
| Islas y puerto con el rediseño (1.1 si pasa el piloto; §4, Q32) | **Techo provisional:** el escenario (islas, puerto y vegetación) ≤ 60 000 triángulos y ≤ 10 draw calls en la vista peor, la que más triángulos de escenario pinta a 1,5× en 1440×900, buscada con un barrido de cámara. Con D83 es la cámara en (−35, −65): 48 427 triángulos y 7 llamadas (datos de ux). Además, el total de arriba (≤ 250 000 y ≤ 100) con el peor caso de los barcos de §6, «Familias». Producto lo fija con la medida del piloto (BACKLOG AC-198 y AC-200). El agua sigue la fila «Islas en el sombreado del agua», abajo: con la rejilla, su coste no crece con los círculos. **Descarga, PROVISIONAL:** el puerto se ve al entrar, así que la entrada lo espera junto con el barco propio, con el mismo tope de 0,5 s más que hoy (fila «Barcos con familias»; BACKLOG AC-200 e). Si se agota el tope, el puerto entra con la versión sencilla de su misma unión de círculos, como las islas, y nunca con el círculo de la 1.0. Las islas se descargan en segundo plano y están todas en ≤ 20 s, primero la más cercana. Mientras tanto, cada una se dibuja con su misma unión en versión sencilla, nunca con su forma de la 1.0. El escenario pesa ≤ 0,8 MB en la primera visita, contados en bytes transferidos con la compresión que sirva el servidor, como los barcos, y no hay viajes de red en las siguientes. Con el puerto de D82 eran 781 KB en archivo según ux (599 KB de islas y 182 KB del puerto). Con el de D92, aprobado el 2026-10-19, son 536 KB con gzip (BACKLOG AC-193 c, «escenario»). Sustituye a la fila siguiente si entra el rediseño |
| Islas y puerto (1.1) | ≤ 16 000 triángulos en **1 draw call** estático (hoy, 3 090 medidos en la 1.0.2; con los presupuestos por forma de `game-ux`, ≤ 14 850; ASSET-SPEC §5). Lo reparte `game-ux` por arquetipo |
| Islas en el sombreado del agua (1.1) | ≤ 16 formas (`src/client/models/ocean-material.ts:8`); la 1.1 usa 16. Una más exige medir AC-90 antes. **Con el rediseño (D83, 44 círculos):** la pasada del océano no puede crecer con el número de círculos. En el M4 Pro a DPR 2, su mediana es ≤ 3,35 ms (hoy, 3,04 + 10 %) con 44 y con 60 círculos. Con la lista de círculos, D83 la dobla, a 6,28 ms (medida de dev-render; BACKLOG AC-198 e). Por eso se toma la salida 1 sin esperar a que falle en un equipo modesto |
| Cálculo de ruta con el mapa nuevo (1.1) | AC-22 sin cambios (el menor de 3 p99 ≤ 2 ms), ahora con 16 formas (256 nodos frente a 112; `src/game/nav.ts:7`). **Los grafos de navegación se preparan al arrancar el servidor, nunca dentro de un tick**: hoy se construyen la primera vez que se pide cada margen (`src/game/nav.ts:66-93`), y con 16 formas y 9 márgenes distintos (§6) ese primer cálculo podría dar un pico en el event loop. *Medido el 2026-10-18 por dev-npc:* un grafo cuesta hasta 4 ms con 16 círculos y hasta 18 ms con 41, y preparar los 9 al arrancar suma unos 0,1 s. Al crear el mundo se preparan también los conjuntos de cruces de cada margen y de cada radio de colisión, para que ni el primer clic dentro de una isla ni el primer contacto con la costa los construyan en un tick. Se comprueba con un contador de construcciones, no con un tiempo (BACKLOG AC-171). **Con D83, en rojo** (sonda de QA, 2026-10-18; BACKLOG O-43): de 5,178 a 6,294 ms según el margen, frente a ~0,43 con la 1.0; `MAP_1_1` no se activa hasta que pase |
| Red con XP y niveles (1.1) | En AC-88, con el candidato entero, ≤ 12 KB/s por cliente con el servidor lleno (el tope de §13), y los campos de la XP (XP propia, niveles, evento de ascenso y parejas abiertas) ≤ 5 % de los bytes de bajada. La diferencia con la 1.0.2 se registra sin asertarla, porque el candidato lleva también I2 y los barcos nuevos (BACKLOG AC-154) |
| Entidades (1.1, P2) | Con el galeón, 42 (sin escolta desde el 2026-10-18; eran 44): AC-03, AC-88 y AC-89 se miden con 42. El peor caso de abajo se calculó con 44 y sigue valiendo como cota. Peor caso con todo en LOD0 y los presupuestos por clase de ASSET-SPEC §5 (los 20 jugadores en Navío, 3 200 cada uno; el Galeón, 2 800): **≈ 140 300 triángulos (56 % de 250 000) y 56 draw calls (≤ 60 con el tope de VFX) de 100**. Es una cota, no una predicción: QA-12 midió en la 1.0.2 51 draw calls y 72 526 triángulos (AC-89). *2026-10-20, con los diseños aprobados:* con los Navíos de D91 (tope de 5 500) y el Galeón de D88 v2 (3 898 en lugar de 2 800), la cota de ux es ≈ 183 400 triángulos (73 %), y hasta ≈ 215 400 (86 %) con las sombras en el agua, HIPÓTESIS sin medir (ASSET-SPEC §13, «Escena del peor caso»). La deciden AC-89, AC-90 y AC-197 con la medida. **No se añaden islas ni NPC por encima de esto sin avisar a ux y al lead** |

## 17. Preguntas para Jonattan y decisiones de producto

> **Desde el 2026-10-17, en la 1.1.0, el alcance lo deciden producto y UX** (delegación de Jonattan: «No necesitas de mi aprobación, es producto y ux quien determina que sal[e]»; cita que trajo el lead). Por eso Q27 a Q30 ya no son preguntas, sino decisiones de producto registradas con la alternativa descartada y su motivo. Lo visual lo decide `game-ux`, y **desde el 2026-10-18 Jonattan aprueba cada diseño antes de construirlo** («A partir de ahora siempre debe aprobar los diseños»; `CLAUDE.md`; BACKLOG AC-192). Ninguno de los 5 hallazgos de ux del 2026-10-17 (§4, §6 y §10b) cambia estas cuatro decisiones. **Sigue siendo de Jonattan** aprobar cada deploy a prod con el botón del environment `production` de GitHub (`CLAUDE.md`, «Deploys a producción»): es un paso del flujo de publicación, no una pregunta.

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
| Q31 | Jonattan (2026-10-18): «Quiero reinvertir tiempo en el rediseño de los barcos, me parecen muy simples y quiero más detalle. Quiero familias de barcos. Ejemplo: barcos españoles, galeón español. Imagina lo mismo pero con barcos HMS Victory». ¿Qué es una familia y en qué versión entra? | **Decidida por producto (2026-10-18), a petición de Jonattan.** Una familia es un **estilo de construcción, sin efecto en el juego**: 2 familias (española y británica), cada una con las 5 clases y sus mismas estadísticas, elegida gratis en el puerto, que ven todos y que se guarda en el navegador. Los NPC no tienen familia (§6). **Versión:** entra en la 1.1 como P0 **si pasa el barco piloto** (BACKLOG AC-193: el Navío en las 2 familias, en el juego, con los presupuestos de §16 y el visto bueno de Jonattan a las láminas). Si no ha pasado cuando lo demás de la 1.1 esté hecho (puestos 1 a 7 y 9 del orden), la 1.1 sale sin la Goleta ni el Navío, latentes como el I2, y las familias y esas dos clases pasan a la 1.2. El rediseño con detalle de los NPC va en la 1.2 (P1). **Sustituye a Q28 en lo que toca a los aspectos:** las familias son 2 estilos cerrados que se prueban una vez contra la lectura de relación (AC-72), no una personalización libre, que sigue fuera. **Descartadas:** (1) naciones con efectos, porque multiplicarían por 2 cada balance medido sin que nadie lo haya pedido; (2) todo en la 1.1 sin piloto, porque el arte por modelos con textura es una cadena nueva (herramientas, descarga, draw calls) y se pondría a prueba con los 10 modelos ya hechos; (3) la Goleta y el Navío con el arte de hoy, porque es justo lo que Jonattan vio en la lámina y le pareció simple |
| Q32 | Jonattan (2026-10-18), sobre las láminas de islas y puerto: «Las islas requieren de un rediseño junto con el puerto: 1. El puerto debe tener más diseño, detalle, colores. 2. Yo sería más arriesgado en el diseño». ¿Cómo encaja una costa irregular con la colisión, y en qué versión entra? | **Decidida por producto (2026-10-18), a petición de Jonattan.** (1) **Lo que se ve es lo que hay**, también con formas irregulares (BACKLOG AC-199). Entre las 3 opciones de §4, «Rediseño de islas y puerto», **se eligió B, uniones de círculos**, el mismo día y con la medida de dev-npc: con 41 círculos, AC-22 da 0,25 ms de p99 frente a 2, y el coste es un 30–40 % más sobre el puesto 5 (ESTIMACIÓN). A no da formas alargadas ni bahías, y C, polígonos, queda descartada en la 1.1. La forma de cada isla, su tabla de círculos, es de ux. (2) **Versión:** como las familias (Q31), con un piloto (BACKLOG AC-198: el puerto nuevo y una isla irregular, en el juego, con los presupuestos y el visto bueno de Jonattan a las láminas nuevas). Si no ha pasado cuando lo demás de la 1.1 esté hecho, la 1.1 sale con el mapa y el puerto de la 1.0, y el mapa nuevo, lógica y arte, pasa a la 1.2. (3) **Presupuesto del escenario:** techo provisional de 60 000 triángulos y 10 draw calls, que se fija con la medida del piloto (§16). **Descartadas:** (a) publicar D67 y D68 tal cual, porque Jonattan pidió cambios; (b) el mapa nuevo con el arte de la 1.0, porque las 9 formas nuevas saldrían con un arte que nadie ha aprobado (BACKLOG AC-192); (c) los polígonos, por el motivo de §4 |
| Q33 | Jonattan (2026-11-15), sobre las familias de E17: «Si son esas familia, no son gratis se deben comprar». ¿Qué se compra, por cuánto y qué pasa con la británica? | **Decidida por producto (2026-11-15, delegación de Jonattan del 2026-10-17), y rehecha el mismo día con su respuesta a Q38, «Las dos se pagan».** **Las dos familias se compran, 4 000 de oro cada una, sin pedir nivel, y cada compra vale para todos los barcos del jugador**, también los que compre después. Comprar una la pone en uso; después, cambiar entre las que tiene y «sin familia» es gratis en la zona segura. Sin familia, los barcos se ven con el modelo de hoy (Q39). Se guarda en la cuenta (§6, §13; BACKLOG AC-222 a AC-225). El precio son ≈ 11 min con el Bergantín mejorado (§6, «Precio (1.3)»). Con el oro del juego: el dinero real sigue fuera (Q5). ~~La británica viene con cada barco y no se compra. La española se compra una sola vez, por 4 000 de oro~~ (antes de Q38). **Descartadas con las 2 de pago:** (a) **un precio distinto para cada familia**: la cara parecería la buena, y la elección tiene que ser de gusto; (b) **la segunda más barata** (un descuento por tener ya una): una regla más para un caso que es solo aspecto; (c) **las dos juntas en un lote**: lo mismo. **Descartadas antes de Q38, que siguen valiendo:** (1) **cada barco en cada familia** (5 compras): cada barco nuevo llegaría con la otra familia hasta pagarla otra vez, así que la flota del jugador se vería a medias, y la pestaña Familia necesitaría un estado por barco que D94 no dibuja; además, cobra el aspecto en cada paso de la progresión, que es donde el oro tiene que ir a mejorar; (2) **pedir nivel**: el nivel solo desbloquea barcos (Q27), y una regla más no aporta nada a un artículo que solo cambia el aspecto; ~~(3) **las 2 de pago** […]~~ (lo eligió Jonattan en Q38: es su intención, y producto la sigue); (4) **más barata (≤ 2 000)**: competiría con el Bergantín, la compra que más cambia el juego del novato; (5) **más cara (≥ 6 000)**: igual que la Fragata, la vería poca gente en el mar, y el arte de E17 está para verse. Ahora pesa más, porque sin una familia nadie ve ese arte en su barco |
| Q34 | Jonattan (2026-11-15): «las mejoras son solo para los barcos que compran». ¿Cómo funcionan y cuánto cuestan? | **Decidida por producto (2026-11-15) y cambiada el 2026-11-16 a petición de Jonattan.** Al pedir cambios a la lámina D99, la de la pestaña Mejoras, escribió: «Deberia seleccionarse cada barco y cada uno deberia tener un botón de mejoras y se abre la visual. Si lo dejas como "Mejoras" es confuso porque como selecciona a que barco mejorar. Ademas cada barco necesita que una imagen de su preview no un logo genérico de un barco» (dato del lead). **Desde entonces, la tienda es por barco:** no hay pestaña Mejoras; en la lista de barcos, cada barco propio, con la imagen de su vista previa, tiene un botón «Mejoras» que abre las de ese barco, y **se puede mejorar cualquier barco propio sin navegarlo**. El barco activo no cambia, el oro se descuenta igual, y la compra pide lo mismo que todas: el barco del jugador a flote y en el puerto (con la regla de E20) (§11). **Descartadas el 2026-11-16:** (i) **solo el barco activo, con una pestaña Mejoras** (lo de antes): Jonattan la encontró confusa, porque no se ve a qué barco se aplica; (ii) **una pestaña Mejoras con un selector de barco**: deja dos sitios donde elegir barco, la lista y el selector; (iii) **que pulsar el barco lo ponga a navegar para mejorarlo**: junta mejorar con cambiar de barco, y para mejorar la Fragata habría que dejar de navegar el Bergantín; «Elegir» y «Mejoras» son 2 botones. *Lo de abajo es del 2026-11-15:* cada barco tiene sus niveles de Cañones, Casco y Velas, ~~que se compran para el barco activo~~, con la intención que nombra el barco. Un barco nuevo llega a nivel 1. **Precio = la base de hoy × cañones por banda / 8:** Balandra y Goleta ×0,5, Bergantín ×0,75, Fragata ×1 (la base) y Navío ×1,25 (§11, «Mejoras por barco (1.3)»). El hito de AC-60 pasa a «la Fragata con sus 6 mejoras», 16 400 de oro, con la misma cota de 45–70 min, y su palanca es la base de precios en pasos del 10 % (§10). **Descartadas:** (1) **el mismo precio en todos**: mejorar la Balandra costaría 4 800, que el novato pierde al pasar al Bergantín, y las mejoras del Navío serían las más baratas por lo que dan; (2) **una tabla libre por barco**: 30 cifras sin una regla que las explique; (3) **en proporción al precio del barco**: la Balandra es gratis, así que sus mejoras también lo serían; ~~(4) **mejorar cualquier barco desde la tienda sin cambiar a él** […] (P3)~~ (entra el 2026-11-16, arriba); (5) **que el barco nuevo herede los niveles del anterior**: es justo lo contrario de lo que pidió Jonattan |
| Q35 | ¿Qué mejoras recibe cada barco que ya tiene un jugador al pasar a la 1.3? | **Decidida por producto (2026-11-15), a propuesta del lead: cada barco en propiedad recibe los niveles que tenía el jugador.** Nadie pierde nada, y quien tenía varios barcos recibe un regalo: los niveles que ya había pagado, también en los barcos que no usaba. En la copia de prod del 2026-10-25 había 10 filas (BACKLOG AC-182 a), así que la economía no lo nota. Va en la lectura de la fila, sin migración SQL (§13). **Descartadas:** (1) **solo el barco activo con los niveles, y los demás a nivel 1**: quien mejoró sus cañones navegando la Fragata y entró con la Balandra activa perdería lo pagado; (2) **devolver el oro de las mejoras en los barcos que no son el activo**: más casos, y el tope de 999 999 recortaría la devolución de alguien |
| Q36 | ¿Hace falta una versión puente antes de la 1.3? | **Decidida por producto (2026-11-15): sí, una 1.2.x con el lector de la `v: 3`, en prod antes que la 1.3.** La hipótesis del lead, validada con el código de la 1.2.0: `parseProgress` solo acepta `v: 1` y `v: 2` con sus claves exactas (`server/progress.ts:85-87`), el almacén lanza `InvalidProgressError` con cualquier otra cosa (`server/persistence.ts:33-34`) y el jugador ve «No podemos cargar tu progreso ahora mismo» (`server/game-server.ts:92`). Así que volver de la 1.3 a la 1.2.0 dejaría fuera a todo el que hubiera jugado la 1.3. Es el mismo caso que la 1.0.3 (Q29). El puente puede salir solo o con otras piezas de la 1.2.x, sin esperarlas (BACKLOG AC-220 y AC-221). No necesita una excepción de la regla de publicación: es un formato reservado, sin función que se vea ni se use, como los ids `schooner` y `line` (BACKLOG `:1958`); va como una línea en el inventario, y Jonattan lo ve en llano con la petición del deploy. **Descartadas:** (1) **publicar sin puente** y volver restaurando la copia: pierde lo jugado desde el deploy (Q29); (2) **guardar lo nuevo en una columna aparte** que la 1.2.0 ignore: §13, «Lectura y escritura de la fila en la 1.3», descarte (a) |
| Q37 | ¿Qué entra de E17, de la Goleta y del Navío en la 1.3, y cómo se aprovecha lo hecho? | **Decidida por producto (2026-11-15).** **E17 entra entera**, con las 5 clases en las 2 familias, **y la Goleta y el Navío salen con ella, sin interruptor** (BACKLOG AC-226 y AC-227). Jonattan dijo que sí a la pregunta del lead, que los incluía. Lo hecho se aprovecha: en `main` ya están el cargador de GLB, el respaldo de la textura (D90) y la predicción del barco propio (`src/client/models/ship-glb.ts:17`, `:247` y `:302`), y el código de la Goleta y el Navío está en ramas de la 1.1 (BACKLOG `:491`). Cambian AC-193, que deja de ser una puerta de «entra o pasa a la siguiente», AC-195, AC-196 y AC-201, con fecha. Los presupuestos de AC-89, AC-90 y AC-197 siguen. **Si una lámina se atasca** cuando lo demás esté hecho, el lead le pregunta a Jonattan si se espera o si la 1.3 sale con las mejoras por barco y la zona segura, y las familias, con la Goleta y el Navío, pasan a la siguiente (la regla de E17, BACKLOG `:1838`). **Descartadas:** (1) **las familias sin la Goleta ni el Navío**: la pregunta del lead los incluía, y E17 se diseñó para las 5 clases; (2) **la Goleta y el Navío sin familias, con el arte de hoy**: es lo que Jonattan vio y le pareció simple (Q31); (3) **mantener el interruptor de AC-201** como palanca de emergencia: sería una excepción más que Jonattan tendría que aprobar, y la vuelta atrás ya la da el puente, que conserva esos barcos en la fila. *2026-11-15, con Q38 y Q39:* la Goleta y el Navío siguen saliendo con sus 2 familias, pero un jugador sin familia los ve con su modelo procedural, el que Jonattan vio en D64. Ese aspecto lleva su lámina y su visto bueno antes de salir (BACKLOG AC-227 e) |
| Q38 | **Para Jonattan.** Leímos «no son gratis, se deben comprar» como: la familia española se compra con el oro del juego, y la británica viene con cada barco. ¿Es lo que querías? | **Respondida (Jonattan, 2026-11-15, dato del lead): «Las dos se pagan».** La británica también se compra. Producto rehízo Q33 y decidió en Q39 el aspecto sin familia, y el formato de la fila quedó fijado con «sin familia» antes de empezar el puente (§13). ~~Abierta. Propuesta por defecto: sí~~ |
| Q39 | Con las 2 familias de pago (Q38): ¿con qué aspecto sale un barco sin familia, qué tiene un jugador nuevo, qué reciben las partidas que ya existían y se puede volver a «sin familia»? | **Decidida por producto (2026-11-15).** (1) **Un barco sin familia se ve con su modelo procedural, el de hoy.** En la Balandra, el Bergantín y la Fragata es el que ya está en prod y pasó AC-72. En la Goleta y el Navío es su modelo provisional de la 1.1, que nunca salió, así que lleva lámina y el visto bueno de Jonattan antes de salir (BACKLOG AC-227 e). (2) **Un jugador nuevo empieza sin familia** (`families: []`, `family: "none"`). (3) **Las partidas que ya existían, igual: sin familia y sin regalo.** Nadie pierde nada, porque nadie tenía familia. (4) **Se puede volver a «sin familia» cuando se quiera**, gratis, en la zona segura, como entre las familias que se tienen. Además, un jugador sin familia entra sin esperar a ningún modelo propio: la espera de §16, fila «Barcos con familias», solo vale con una familia en uso (BACKLOG AC-193 c y AC-224 d). **Descartadas:** (a) **un modelo con detalle «sin librea»** para todos (la geometría de una familia con colores neutros): es una tercera familia que diseñar, descargar y probar contra AC-72, y regala el detalle que Jonattan quiere que se pague; (b) **una familia de regalo al empezar**, a elegir: deja una de las dos sin pagar, contra Q38; (c) **la británica de regalo a quien ya jugaba**: en la copia de prod del 2026-10-25 había 10 filas (BACKLOG AC-182 a), muchas de prueba, y no hay pérdida que compensar; sería un caso más en la migración; (d) **no poder volver a «sin familia»**: no protege nada, y es el aspecto más ligero de dibujar, que puede preferir quien juega en un equipo lento (BACKLOG AC-211); (e) **que la Goleta y el Navío pidan una familia** para comprarlos: ataría un barco a una compra de aspecto |

