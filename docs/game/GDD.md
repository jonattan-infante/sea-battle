# Sea Battle — Game Design Document (vertical slice)

> Autor: `game-product` · Versión 1.0 · 2026-10-10 · Referente: [`REFERENCE-SEAFIGHT.md`](./REFERENCE-SEAFIGHT.md)
> Los números de este documento son la **fuente única de verdad** del juego. Deben vivir en un único módulo de constantes de la simulación, de modo que cambiar el balance no exija tocar la lógica.

## 0. Resumen

**Sea Battle es "Seafight en 10 minutos"**: navegas con un clic, marcas un barco, pulsas una tecla y tu barco dispara andanadas solo hasta hundirlo; recoges el oro y en el puerto lo conviertes en mejores cañones, casco, velas y barcos.
- **Un mundo de 1 000 × 1 000 m**, con un puerto seguro en el centro, 6 islas, 8 piratas y 4 cañoneras hostiles (desde I2), 8 mercantes pasivos y un Capitán pirata que aparece como jefe, para **20 jugadores** por servidor.
- **Progresión completa en unos 45–70 min**: 3 clases de barco y 3 ejes de mejora con 3 niveles cada uno, todo pagado con oro.
- **Calidad antes que cantidad**: una sola munición y dos arquetipos de NPC. No hay XP, perlas, monstruos ni abordaje.

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
                           └──────────────► [Oro (+restos P1)] ─► [Puerto: mejorar] ─┘
```

- **Microbucle (≈20 s)**: seleccionar → atacar → ajustar la posición → hundir.
- **Bucle medio (≈3 min)**: 3–4 hundimientos → reparar → primera mejora.
- **Macrobucle (≈45–70 min)**: Balandra → Bergantín → Fragata, con todas las mejoras.

## 3. Alcance

### Dentro (vertical slice)
| Área | Contenido |
|---|---|
| Mundo | 1 mapa, 1 puerto con zona segura, 6 islas, límites duros |
| Barcos del jugador | 3 clases: Balandra, Bergantín y Fragata |
| Combate | Selección, ataque persistente con andanadas, alcance, recarga, precisión, números de daño y reparación |
| NPC | Pirata (hostil) y Mercante (pasivo). **Incremento I2 (P1):** Cañonera pirata (hostil, mantiene la distancia) y Capitán pirata (jefe) |
| Cámara | Sigue al barco. **I2 (P1):** vista libre con arrastre, minimapa y flechas, y vuelta al barco (§5) |
| Economía | Oro: recompensas por hundir, restos flotantes (P1), tienda de mejoras y barcos |
| Muerte | Hundimiento, pantalla de muerte, reaparición en el puerto y protección |
| Multijugador | 20 jugadores por servidor. PvE cooperativo (P0) y PvP fuera de la zona segura (P1) |
| Plataformas | Escritorio (ratón + teclado) y móvil (táctil), Chrome/Safari/Firefox actuales |
| Autenticación | Clerk. Modo invitado solo en local (`AUTH_BYPASS=1`) |

### Fuera (y por qué)
| Fuera | Motivo |
|---|---|
| Perlas, moneda premium y pagos | Sin monetización en el slice (pregunta abierta Q5) |
| Monstruos y arpones | En Seafight exigen un segundo sistema de armas (REFERENCE §6). También fuera de I2: P3, pregunta Q10 |
| Más tipos de NPC (galeón del tesoro con escolta, corsario rápido) | P2: se decide después de medir I2 |
| Abordaje, tripulación, gemas, castillos, habilidades | Profundidad que no aporta al bucle principal |
| XP, niveles, misiones, mapas por nivel | La progresión del slice es solo con oro y equipo |
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
| Puerto | Isla puerto en (0, 0), radio 30 m |
| Zona segura | Círculo de radio 110 m centrado en (0, 0) |
| Anillo de reaparición | Radio 60–90 m desde (0, 0), fuera de la isla, rumbo hacia afuera |
| Zona de mercantes | Rutas cerradas en el anillo de 150–330 m |
| Zona de piratas | 4 sectores (NE, NO, SO, SE) en el anillo de 300–460 m |

**Islas** (obstáculos circulares; ni barcos ni NPC las atraviesan; disposición fija y determinista):

| Id | Centro (x, z) | Radio (m) |
|---|---|---|
| PORT | (0, 0) | 30 |
| I1 | (260, 200) | 45 |
| I2 | (−300, 170) | 35 |
| I3 | (−220, −280) | 55 |
| I4 | (250, −260) | 40 |
| I5 | (20, 360) | 30 |
| I6 | (−410, −30) | 28 |

```
 z−500 (Norte) ┌───────────────────────────────────────┐
               │  ☠ NO                          ☠ NE   │
               │   I3 ·  ·  ·  ·  ·  ·  ·  ·  I4       │
               │ I6   ·    ┌─ zona segura ─┐     ·     │
               │      ·    │   ⚓ PORT      │     ·     │   ☠ = sector pirata
               │      ·    └───────────────┘     ·     │   · = ruta mercante
               │   I2 ·  ·  · mercantes ·  ·  ·  I1    │
               │  ☠ SO            I5            ☠ SE   │
 z+500 (Sur)   └───────────────────────────────────────┘
              x−500 (Oeste)                     x+500 (Este)
```
Vista tal como sale en pantalla. Sectores: NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+).

Lectura de diseño: el **riesgo crece con la distancia al puerto**. Los mercantes (fáciles) están cerca y los piratas (peligrosos), lejos.

## 5. Controles

### Escritorio
| Acción | Entrada | Regla |
|---|---|---|
| Navegar | Clic izquierdo en el agua | Marcador inmediato en el punto. Un clic en una isla lleva al punto navegable más cercano. Un clic nuevo reemplaza el destino. **No deselecciona ni cancela el ataque.** |
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

Orientaciones soportadas: vertical (390×844) y horizontal (844×390). Mientras se juega, el navegador no hace scroll ni zoom.

### Cámara (qué debe comunicar; los valores exactos los define `game-ux`)
- Proyección "isométrica" (cenital oblicua).
- **Modo seguimiento** (por defecto): sigue al barco propio, que queda siempre en el **10 % central** de la pantalla. Con el zoom por defecto, el **círculo de alcance máximo (80 m)** cabe entero a 1440×900 y a 390×844.
- **Vista libre** (I2, P1). En Seafight el minimapa y unas teclas mueven la carta, y "To the Ship" la devuelve al barco (REFERENCE §2 y §12).
  - **Entrar:** arrastrar en el agua más de 12 px (botón izquierdo o un dedo); hacer clic o arrastrar en el minimapa (la vista se centra en ese punto); o usar las flechas (150 m/s).
  - **Soltar antes de 12 px es un clic normal:** navega o selecciona. Dos dedos son zoom, nunca desplazamiento.
  - En vista libre, un clic en el agua navega hacia ese punto (aunque esté lejos del barco) y un clic en un barco lo selecciona. Nada más cambia.
  - El centro de la vista no sale del mapa (±500 m).
  - **Volver al seguimiento** (transición de 300 ms): con `C` o el botón Centrar, cuando el barco propio recibe daño, al morir o al reaparecer.
  - Si el barco propio queda fuera de pantalla, un indicador en el borde señala hacia él.
  - **Lo que se ve está vivo:** los barcos que hay en la zona mirada se muestran; nunca se ve mar vacío donde hay NPC (§13).

## 6. Navegación y barcos

### Modelo de movimiento (simulación a 20 Hz)
1. Un clic fija un destino. El servidor calcula una ruta con *waypoints* que esquiva las islas (A\* sobre una rejilla de 5 m). **Margen de navegación** = media eslora + 2 m (`L/2 + 2`), medido desde el borde de la isla: Balandra 10 m, Bergantín 14 m, Fragata 19 m, Pirata 12 m, Mercante 13 m y Capitán 17 m. Así el casco (sin el bauprés) nunca se mete en una isla: lo que parece sólido es sólido. El radio de colisión no cambia y sigue siendo el límite físico de último recurso.
2. Cada tick, el barco gira hacia el siguiente *waypoint* a su **velocidad de giro máxima**.
3. Velocidad objetivo = máxima × factor de giro (1,0 si el error de rumbo es ≤ 45°, 0,6 si es ≤ 90° y 0,4 si es mayor).
4. Acelera y frena con su aceleración y frenado. Empieza a frenar cuando la **distancia que le queda de ruta hasta el destino final** cumple `d ≤ v² / (2·frenado)`. No basta con medir hasta el *waypoint* actual: si no, el barco se pasa del destino.
4b. **Giro casi en el sitio junto a islas.** Si el error de rumbo es > 45° y el centro del barco está a menos de (margen de navegación + 8 m) de una isla, o si el siguiente *waypoint* es una esquina de más de 45°, la velocidad objetivo es ≤ 1 m/s hasta que el error baje de 45°. En mar abierto rigen solo los factores del punto 3.
5. **Llegada**: se detiene a ≤2 m del destino con velocidad 0.
6. No hay colisión entre barcos (se atraviesan; ver §3). Las islas y el borde son sólidos.

### Clases de barco del jugador
La eslora es la del casco, sin el bauprés.

| Clase | Eslora | Radio de colisión | Vida | Vel. máx. | Acel. | Frenado | Giro | Cañones por banda | Precio |
|---|---|---|---|---|---|---|---|---|---|
| **Balandra** | 16 m | 5 m | 800 | 14 m/s | 4 m/s² | 6 m/s² | 90 °/s | 4 | Inicial |
| **Bergantín** | 24 m | 7 m | 1 400 | 12 m/s | 3 m/s² | 5 m/s² | 70 °/s | 6 | 2 000 oro |
| **Fragata** | 34 m | 9 m | 2 200 | 10 m/s | 2,5 m/s² | 4 m/s² | 55 °/s | 8 | 6 000 oro |

Equilibrio: la Balandra es rápida y frágil; la Fragata es lenta y tiene la mayor potencia de fuego. Las mejoras (§11) multiplican sobre la clase activa.

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
| Bergantín (6) | 31,5 | 76,8 |
| Fragata (8) | 42,0 | 102,4 |

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

Eslora y radio de colisión: Pirata 20 m / 6 m, Mercante 22 m / 7 m, Cañonera 28 m / 8 m, Capitán 30 m / 9 m.

**Regla de recompensa** (para que añadir tipos no suba el oro por segundo de combate): hostiles ≈ 0,23 × vida (pirata 105/450; cañonera 210/900) y pasivos ≈ 0,20 × vida (mercante 60/300). El jefe lleva una prima de riesgo (0,33 × vida) porque es raro y exige grupo o una Fragata mejorada.

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
- **Combate:** detecta a ≤ 90 m, orbita a 50 m y dispara a ≤ 65 m. Elige objetivo y hace represalia como el pirata.
- **Correa:** 150 m alrededor de la guarida. Si se aleja más o pierde al objetivo, vuelve y recupera el 100 % de la vida, como el pirata. Para hundirlo hay que comprometerse.
- **Aviso a todos:** al aparecer, "¡El Capitán pirata ha aparecido en el sector NE!" y un marcador propio en el minimapa, visible desde cualquier punto del mapa. Al hundirse, el feed dice "El Capitán pirata ha caído: A, B y C" (hasta 3 nombres, por daño, y "y N más").
- **Reparto:** proporcional al daño (§10), así que premia ir en grupo.

### Requisitos de arte de los NPC de I2 (qué deben comunicar; el diseño es de `game-ux`)
| NPC | Debe leerse como | Requisito verificable |
|---|---|---|
| Cañonera pirata | Hostil, pesada, de largo alcance | Código hostil (velas oscuras, como el pirata) más una **forma** propia (casco ancho y bajo, batería de cañones visible) que la distinga del pirata y del capitán **en escala de grises** a 1,0× en 390×844. Placa "Cañonera pirata" |
| Capitán pirata | El más peligroso del mar | Mayor que cualquier pirata (30 m) y con silueta propia. Un rasgo exclusivo (bandera u ornamento) visible a 1,0× en móvil y en grises. Marcador de minimapa distinto de todos los demás. Placa "Capitán pirata" |

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

*Referencia de `game-product` (Monte Carlo, 1 000 duelos, ambos a tiro): 2 Bergantines contra el Capitán, 18,0 s, 32 % y 0,00 muertes; Bergantín contra Cañonera, 18,0 s y 17 %; Balandra contra Cañonera, 68 %. En el juego real, la cañonera mantiene la distancia y alarga los duelos.*

## 10. Botín y economía

| Regla | Valor |
|---|---|
| Oro inicial | 100 |
| Reparto de la recompensa de un NPC | Proporcional al daño infligido por cada jugador en los últimos 60 s, redondeado hacia abajo. El resto va a quien más daño hizo; si hay empate, a quien dañó primero. **La suma es exactamente la recompensa y se acredita una sola vez.** |
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
- El jefe queda fuera de la curva: el bot del AC-60 no lo ataca, no entra a menos de 200 m de su guarida y, si el capitán lo elige, navega al puerto.
- Si con I2 el AC-60 sale de rango, la palanca es la recompensa de la cañonera (y sus restos), en pasos de 10 oro. No se tocan pirata, mercante ni precios.

## 11. Puerto, mejoras y barcos

- **Tienda**: se abre con el botón o `P` solo **dentro de la zona segura**. Abrirla no detiene el barco. El servidor valida todas las compras: dentro de la zona, oro suficiente, nivel anterior comprado y artículo no poseído.
- **Mejoras globales**: se conservan al cambiar de barco y al morir.
- **Cambio de vida máxima** (comprar casco o cambiar de barco en el puerto): la vida actual conserva el mismo **porcentaje**, salvo al comprar un barco nuevo, que sale con la vida llena.

| Mejora | Nivel 1 | Nivel 2 | Nivel 3 |
|---|---|---|---|
| Cañones | §7 | 500 oro | 1 500 oro |
| Casco (vida máx.) | ×1,0 | ×1,2 — 400 oro | ×1,4 — 1 200 oro |
| Velas (vel. máx.) | ×1,0 | ×1,1 — 300 oro | ×1,2 — 900 oro |

- **Barcos**: comprar un barco te cambia a él con la vida llena. Los barcos comprados quedan en propiedad y se puede cambiar entre ellos gratis en el puerto.
- **Total de la progresión**: 2 000 + 6 000 + 500 + 1 500 + 400 + 1 200 + 300 + 900 = **12 800 oro**.

## 12. Muerte y reaparición

| Paso | Regla |
|---|---|
| Vida ≤ 0 | Estado **Hundiéndose** durante 3 s. No se puede seleccionar ni atacar. Los ataques contra él terminan. |
| Pantalla de muerte | Muestra quién te hundió, el oro perdido y una cuenta atrás de 8 s desde la muerte. El botón **Zarpar** se activa al llegar a 0 (no hay reaparición automática, para evitar barcos AFK). También zarpa con `Espacio` o `Enter`, y nunca antes de que termine la cuenta. El servidor admite el `respawn` con una tolerancia de reloj de 2 ticks (100 ms) antes del final, para que el primer clic no se rechace por desfase cliente-servidor. |
| Reaparición | En el anillo del puerto, con la vida al 100 %, la misma clase y las mismas mejoras |
| Protección | 15 s o hasta que el jugador ataque, lo que ocurra primero. Mientras dura, ningún pirata lo elige como objetivo y ningún jugador puede dañarlo. Tiene indicador visual. (Inspirado en Seafight, REFERENCE §10.) |

## 13. Multijugador y red

| Parámetro | Valor |
|---|---|
| Jugadores por servidor | 20 (el jugador 21 recibe "Servidor lleno") |
| Entidades máximas | 20 jugadores + 20 NPC + 1 jefe = 41 |
| Simulación | 20 Hz, autoritativa en el servidor |
| Snapshots | 10 Hz, **solo deltas** de las entidades que cambiaron dentro del área de interés (radio de 300 m alrededor del barco y, en vista libre (I2), también alrededor del centro de la vista). Snapshot completo al entrar. **Si no cambia nada, no se envía nada.** El Capitán pirata vivo se envía siempre, para el marcador del minimapa |
| Interpolación en el cliente | Búfer de 100 ms. Sin predicción, también para el barco propio. El marcador de clic es inmediato y local. |
| Latencia del clic al movimiento visible | Entre 0 y 50 ms hasta el tick, entre 0 y 100 ms hasta el snapshot y 100 ms de búfer, más la red y el render. Medido en local: 263–309 ms. En producción hay que sumar el RTT. Es aceptable para un control por clic: "For RTS games, 250 milliseconds of command latency was not even noticed… between 250 and 500 msec was very playable" ([Bettner y Terrano, GDC 2001](https://www.gamedeveloper.com/programming/1500-archers-on-a-28-8-network-programming-in-age-of-empires-and-beyond)). La respuesta inmediata la da el marcador (≤ 50 ms). Por encima de 500 ms con el RTT real, se evalúa la predicción del barco propio (P2). |
| Presupuesto de bajada | ≤ 10 mensajes/s y ≤ 12 KB/s de media por cliente con el servidor lleno. En vista libre (I2): ≤ 10 mensajes/s y ≤ 16 KB/s |
| Subida en reposo | **0 mensajes** de juego si el jugador no actúa (el latido de Engine.IO queda excluido) |
| Límite de intenciones | 10/s por cliente (ráfaga de 20). El exceso se descarta. |
| Desconexión (P1) | El barco se queda 10 s en el mundo y se le puede atacar. Si el jugador reconecta en ese tiempo, recupera el mismo barco. |
| Persistencia (P1) | Oro, mejoras, barcos en propiedad y barco activo, por `userId` de Clerk. El invitado no persiste. |

**Intenciones (cliente → servidor)**. La selección es local y no viaja por la red.

| Intención | Datos | El servidor valida |
|---|---|---|
| `moveTo` | `{x, z}` | Números finitos (se ajustan al límite); jugador vivo |
| `stop` | — | Jugador vivo |
| `attack` | `{targetId}` | El objetivo existe, está vivo, no es uno mismo y es atacable según §7 |
| `cancelAttack` | — | — |
| `repair` | `{on: boolean}` | Jugador vivo |
| `buy` | `{itemId}` | §11 |
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
| Panel de objetivo | Nombre, tipo (hostil / pasivo / jugador), vida, distancia, "En alcance" o "Fuera de alcance" | ≤ 10 Hz |
| Recarga | Progreso de la recarga **junto al barco propio** (como en Seafight, REFERENCE §3) | Fuera de React |
| Estado de acción | Inactivo / Armado / Disparando / Reparando | Al cambiar |
| Anillo de selección y círculo de alcance | Objetivo marcado; alcance propio visible mientras haya objetivo | Fuera de React |
| Números de daño y salpicaduras | **Un número por andanada** = suma de sus impactos (`impactos × daño`), no uno por bala. Si la andanada no acierta ninguna bala: "Fallo", solo cuando el tirador o el objetivo es el jugador propio. Cada bala fallada deja una salpicadura | Fuera de React |
| Etiquetas de barcos | Nombre + barra de vida; tipo distinguible **sin depender solo del color** | Fuera de React |
| Minimapa (P1) | Mapa completo (islas, puerto, zona segura) + entidades dentro del área de interés; propio, jugadores, piratas, cañoneras, mercantes y capitán con **color y forma**. Clic o arrastre mueve la vista (I2) | ≤ 2 Hz |
| Aviso del jefe (I2) | Aviso a todos al aparecer el capitán, con su sector; marcador visible en el minimapa desde cualquier punto; feed al hundirlo | Al cambiar |
| Vista libre (I2) | Botón **Centrar** visible solo en vista libre e indicador en el borde de la pantalla hacia el barco propio | Fuera de React (el indicador) |
| Zona segura | Borde visible en el mundo + aviso "Zona segura" en el HUD | Al cambiar |
| Protección | Indicador sobre el barco + tiempo restante | Al cambiar |
| Feed de eventos (P1) | "Hundiste a Pirata +105 oro", "X te hundió" (máx. 4 líneas, 5 s cada una) | Al cambiar |
| Conexión | Estado + ping si es > 200 ms | Al cambiar |

**Requisito de legibilidad (pilar P2)**: en una captura, sin leer texto, el jugador distingue su barco, otros jugadores, piratas hostiles, mercantes pasivos, su objetivo, si está a tiro y su vida baja, también en escala de grises.

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
- **Primera sesión (P1)**: 3 pistas contextuales, que se descartan solas al hacer la acción: "Haz clic/toca el agua para navegar" → "Selecciona un barco" → "Pulsa Espacio/Atacar".

## 16. Presupuestos técnicos (contrato con `game-developer` y `game-qa`)

| Métrica | Presupuesto |
|---|---|
| FPS en el portátil de referencia (Q9), Chrome, 1440×900 | Media ≥ 58 fps, p95 del frame ≤ 20 ms en 60 s de combate |
| Draw calls, escena estándar (20 barcos + 20 NPC + islas en pantalla) | ≤ 100 |
| Triángulos en pantalla | ≤ 250 000 |
| Commits de React en reposo (sin input ni cambios de datos del HUD) | 0/s |
| Commits de React en reposo con NPC visibles patrullando | ≤ 2/s (minimapa) |
| Commits de React en combate | ≤ 10/s |
| Mensajes cliente → servidor en reposo | 0 en 10 s |
| Tick de simulación con servidor lleno | p99 ≤ 4 ms (Node 20) |
| Crecimiento del heap del cliente en 10 min | ≤ 15 MB |

## 17. Preguntas abiertas para Jonattan

| # | Pregunta | Propuesta por defecto |
|---|---|---|
| Q1 | ¿PvP en el slice? | P1: libre fuera de la zona segura, con protección al reaparecer |
| Q2 | ¿Persistir el progreso por usuario de Clerk? ¿Dónde: el `@vercel/kv` actual o algo en Railway? | P1, sí. El almacén lo decide `game-developer` según el coste que apruebes |
| Q3 | ¿La reparación es gratis o es un sumidero de oro? | Gratis (la condición es detenerse y no disparar) |
| Q4 | ¿Una penalización por muerte del 10 % del oro es aceptable? | Sí |
| Q5 | ¿Sin monetización ni moneda premium en el slice? | Confirmar que queda fuera |
| Q6 | ¿Bastan 20 jugadores y 1 sala para el lanzamiento? | Sí; varias salas en P2 |
| Q7 | ¿El nombre visible es el usuario de Clerk o un nombre de barco que elige el jugador? | El usuario de Clerk |
| Q8 | ¿Interfaz solo en español o con i18n? | Solo español |
| Q9 | ¿Cuál es el portátil de referencia para el AC de 60 fps? | MacBook Air M1 o un portátil con Intel Iris Xe |
| Q10 | ¿Habrá un monstruo marino en un incremento futuro? En Seafight solo se dañan con arpones (REFERENCE §6). Hay dos caminos: añadir arpones como segunda arma (fiel al referente, más trabajo) o un monstruo que se dañe con cañones (adaptación) | P3. Decidir después de medir I2 |
