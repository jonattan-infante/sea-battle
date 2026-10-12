# Sea Battle — Dirección de arte (vertical slice)

> Autor: `game-ux` · v1.0 · 2026-10-10 · Consumidores: `game-developer`, `game-qa`
> Fuentes de reglas y números: [`GDD.md`](./GDD.md), [`BACKLOG.md`](./BACKLOG.md), [`REFERENCE-SEAFIGHT.md`](./REFERENCE-SEAFIGHT.md). Contratos hermanos: [`ASSET-SPEC.md`](./ASSET-SPEC.md), [`VFX-SPEC.md`](./VFX-SPEC.md).
> Las reglas verificables llevan id `AD-NN` (§18). Medidas en px CSS a 1440×900 (escritorio) y 390×844 (móvil vertical); en el mundo, 1 u = 1 m.

## 0. Decisiones clave

1. **Cámara ortográfica a 55° de elevación, con el norte (−Z) arriba y sin rotación isométrica a 45°.** Sigue al barco propio de forma rígida y no se limita al borde del mapa (AC-23).
2. **Zoom por defecto calculado** para que el círculo de alcance de radio R = máx(alcance del cañón propio, 65 m) quepa en el área libre de HUD (U8): con el cañón inicial, **6,20 px/m** en escritorio y **2,82 px/m** en móvil (con N3, 5,04 y 2,29). Tiene 3 niveles de extensión visible: 0,7× (más cerca), 1,0× y 1,5× (más lejos) (AC-24, AC-25).
3. **Océano de valor medio (#1A5F86, L\* 38).** No es el azul marino casi negro de Seafight (#03243D): las velas negras del pirata y los cascos oscuros necesitan contraste de valor.
4. **Se identifica por 3 canales redundantes**, nunca solo por el color: la **silueta** da la clase, el **valor de las velas** la facción (negras = pirata, claras = resto) y un **icono + color en la etiqueta**. El par de colores hostil/pasivo es coral #FF7A7A / cielo #6CC3F5, que se distingue con las 3 formas de daltonismo (§4.4).
5. **Etiquetas debajo del casco** (como en Seafight), sobre una placa oscura al 85 %. El contraste es ≥ 4,5:1 sobre agua, arena o espuma, y un *declutter* garantiza que no se solapen nunca.
6. **Un solo material para todo** (`MeshStandardMaterial`, vertex colors; *flat shading* en islas y normales suavizadas con pliegue de 40° en barcos, D23), **sin tone mapping** (`NoToneMapping`) y solo 2 luces calibradas (hemisférica + direccional), así la paleta llega 1:1 a la pantalla. Cero luces puntuales (decisión D2/D8, §19).
7. **La tienda es pergamino y madera** sobre un velo translúcido (≤ 60 %). Nunca un negro al 100 %. Las alertas se sustituyen por *toasts* no bloqueantes.
8. **La landing usa una captura del propio motor**, no fotos de stock.

---

## 1. Referente: qué hace que Seafight se vea como se ve

### 1.1 Verificado con capturas
Las fuentes son 6 capturas del cliente Flash (nombre de archivo con marca de tiempo de febrero de 2011, publicadas en [jeux-mmorpg.com/seafight.html](https://www.jeux-mmorpg.com/seafight.html)) y el fondo oficial de la landing ([seafight.com](https://www.seafight.com/), recurso `seafight_defaultpage_bg_201407.jpg`). Los colores se muestrearon con un script de Pillow sobre las capturas; la columna "Valor medido" da las salidas.

| # | Observación | Valor medido | Qué tomamos |
|---|---|---|---|
| R1 | **Cámara cenital oblicua (¾)**: los barcos se ven desde arriba con los mástiles y las velas visibles. La carta está **alineada con los ejes de la pantalla**, con columnas numéricas (16–19) arriba y filas con letras (AI–AM) a la izquierda; sector "1/4 - 18AK". | — | Vista oblicua sin rotación a 45° y rejilla de sectores |
| R2 | Barco ≈ 10 % del ancho del área de juego | ~78 px en un área de ~780 px | Barco de 80–175 px en escritorio (§6) |
| R3 | Océano azul marino oscuro con textura de olas suave | Media #03243D (L\* 13); rango #001D35–#042E46 | **Lo cambiamos** a valor medio (§7) |
| R4 | Nombre **centrado debajo** de cada entidad, con una **línea fina de vida** debajo del nombre | Jugador #F1FEFF; NPC "Blackbeards Pirates" #74A4C0 | Etiqueta debajo del casco con barra de vida |
| R5 | **Anillo discontinuo verde** bajo el barco propio y **amarillo** bajo el objetivo | Verde #187852; amarillo #C3EC0A | Anillo propio fijo y anillo de objetivo discontinuo y giratorio |
| R6 | **Número de daño rojo** encima del objetivo ("25") | #DE0232 | Números de daño encima (VFX-SPEC §9) |
| R7 | Panel de objetivo arriba a la izquierda: retrato, nombre y "177 / 402" | — | Panel de objetivo arriba al centro (§12) |
| R8 | Minimapa arriba a la derecha (carta cuadrada en un marco redondo) con islas como puntos amarillos | — | Minimapa arriba a la derecha (P1) |
| R9 | Abajo al centro: barra "HP : 4500 / 4500" (relleno #007B05), barra de experiencia y **2 barras de 10 ranuras** numeradas con contadores de munición (6000, 439→430 entre disparos) | — | Barra de acciones abajo al centro |
| R10 | Chat abajo a la derecha con pestañas | — | Fuera del slice (GDD §3) |
| R11 | Marco ornamentado de madera y cuero oscuro con filete dorado. Rótulo "Carte maritime" con calaveras y textos dorados #F1E8A1 | — | Filete dorado y madera en la tienda, no en el HUD |
| R12 | Páginas fuera del mar (Marchand, Chantier naval, Quêtes): **paneles de madera**, títulos dorados en letra gótica, **detalle sobre pergamino**, tarjetas con precio ("5 Or", "10 Perles") y botón "ACHETER". Ilustraciones 3D de barcos con luz de atardecer | — | Tienda de pergamino (§14) |
| R13 | Landing oficial: tablones de madera oscura, logo barroco dorado con calavera, ilustración pintada de una batalla en mar de tormenta y estandarte negro rasgado | — | Landing con una escena propia (§16) |

Otras fuentes de texto: el cliente actual está hecho en Unity ([de.wikipedia](https://de.wikipedia.org/wiki/Seafight): "Der Seafight-Client basiert auf Unity"); hay regiones de hielo, tropicales y de lava ([Chrome Web Store](https://chromewebstore.google.com/detail/seafight/jaacngikalnfppfainpgfknbdeolghdi)); las reseñas critican la interfaz anticuada ([clubic](https://www.clubic.com/telecharger-fiche610747-seafight.html): "Interface vieillissante").

### 1.2 Hipótesis (no verificadas)
- **HIPÓTESIS H1**: el cliente Unity actual conserva la cámara y el layout del cliente Flash. Solo verifiqué capturas de 2011.
- **HIPÓTESIS H2**: la línea bajo el nombre es la barra de vida. Es coherente con la etiqueta de "Trankus", que tiene la línea roja y su panel marca 177/402, pero no se confirma en ninguna fuente de texto.

### 1.3 Qué cambiamos y por qué
| Seafight | Sea Battle | Motivo (first principles) |
|---|---|---|
| Océano #03243D | #1A5F86 | Sus sprites son claros sobre un fondo oscuro. Nuestro pirata tiene velas negras (L\* 17) y no se vería: hace falta un fondo de valor medio |
| Marco ornamentado que ocupa ~20 % de la pantalla | HUD flotante translúcido | En móvil, 390 px no admiten marco |
| Rojo/verde para hostil/vida | Coral/cielo + icono + valor | Daltonismo (GDD §14) |
| Sprites 2D prerenderizados | 3D low-poly con vertex colors | Restricción de motor; mismo aspecto con 1 draw call por barco |

---

## 2. Problemas actuales → solución

El estado analizado es el commit `f3f1345`, antes de la reescritura en curso.

| Problema | Causa raíz | Solución | Regla |
|---|---|---|---|
| Océano casi negro | `meshStandardMaterial #1e40af` + luces débiles (0,4 ambiente) + ACES oscurece | Shader de océano propio con color base #1A5F86 e iluminación calculada en el shader | AD-01, AD-02 |
| Nombre y vida encimados e ilegibles | Dos `<Html>` de drei con offsets en Z que colapsan con una cámara cenital y sin fondo | Una placa DOM debajo del casco, movida por ref, con fondo al 85 % y *declutter* | AD-11, AD-12 |
| Textura del barco con fondo blanco opaco | PNG sin alfa aplicado sobre un plano | Eliminar el plano y la textura: barco procedural (ASSET-SPEC) | AS-V09 |
| Cámara cenital fija que corta el mapa y no muestra los modelos | Ortográfica a 90° en (0, 0, 100) que no sigue al barco | Ortográfica a 55° con seguimiento rígido (§6) | AD-05…AD-08 |
| Tienda con fondo 100 % negro | Panel `bg-gray-800` sobre un velo | Panel de pergamino y velo ≤ 60 % (§14) | AD-15 |
| Alerts bloqueantes al seleccionar un NPC | `alert()` en `handleNpcClick` | Seleccionar solo actualiza el anillo y el panel; los avisos son *toasts* (§12.5) | AD-14 |
| Landing con una foto de montañas | Imagen de Unsplash sin relación con el juego | Captura del motor (§16) | AD-17 |

---

## 3. Pilares visuales

| Pilar | Regla operativa |
|---|---|
| **V1. Legible antes que bonito** | Cada entidad se identifica en escala de grises por silueta y valor. El color solo refuerza |
| **V2. Mar vivo, luz de mañana** | Agua turquesa y azul con olas animadas, espuma en la costa y en las crestas y destellos de sol. Sin día/noche (GDD §3) |
| **V3. Low-poly náutico cálido** | Facetas planas, maderas cálidas, velas de lona marfil y oro como acento de interfaz. Sin texturas en el MVP |
| **V4. Barato por diseño** | 1 draw call por barco, 1 por el océano, 1 por las islas y ≤ 11 de VFX. Sin luces puntuales ni sombras dinámicas |

---

## 4. Paleta

### 4.1 Mundo
| Token | Hex | Uso |
|---|---|---|
| `ocean.deep` | `#1A5F86` | Color base del mar abierto (L\* 38) |
| `ocean.trough` | `#154F72` | Valle de ola |
| `ocean.crest` | `#2F7AA3` | Cresta de ola |
| `ocean.shallow` | `#2C93A8` | Aguas someras (≤ 18 m de la costa) |
| `ocean.shore` | `#49B9BE` | Franja de orilla (≤ 4 m) |
| `ocean.foam` | `#EAF6FA` | Espuma |
| `ocean.spec` | `#FFF4D6` | Destello especular |
| `ocean.sky` | `#9CCBE6` | Reflejo Fresnel |
| `ocean.edge` | `#0F3F5C` | Mar fuera del mapa |
| `sand` / `sand.wet` | `#E6CF9A` / `#C9AE78` | Playa (tapa superior / cara lateral) |
| `grass` / `grass.dark` | `#5E9E48` / `#3F7A35` | Meseta / arbustos y base de la colina |
| `rock` / `rock.dark` | `#8A8378` / `#625C53` | Rocas y cima de la colina |
| `palm.trunk` / `palm.leaf` | `#8A5A3B` / `#4E9A3E` | Palmeras |
| `town.wall` / `town.roof` | `#E8DCC0` / `#B5523B` | Casas del puerto |
| `buoy.a` / `buoy.b` | `#F2C14E` / `#F5F1E6` | Boyas de la zona segura |

### 4.2 Barcos
| Token | Hex | Jugador | Pirata | Mercante |
|---|---|---|---|---|
| `hull` | — | `#4A2F1C` | `#2A2523` | `#6E4A2C` |
| `hull.band` (franja de portas) | — | `#D4A548` ocre | `#B3261E` rojo | `#E8DCC0` marfil |
| `hull.bottom` (bajo la flotación) | `#3A2416` | ✓ | `#1C1817` | ✓ |
| `deck` (tabla clara, D36) | — | `#DDA970` | `#805C40` | `#DDA970` |
| `deck.alt` (tabla oscura, D36) | — | `#B5844D` | `#5C3B21` | `#B5844D` |
| Cubierta en pantalla (media de las tablas: `deck` y `deck.alt` quedan a ±7 de L\* de este valor; AD-25). Es también el color de la cubierta y las tapas lisas de LOD1 (D40) | — | `#C9965E` | `#6E4B30` | `#C9965E` |
| `rail` / `mast` | — | `#6B4426` | `#3A2A20` | `#6B4426` |
| `sail` (lona clara; D40) | — | `#FBF3E3` (L\* 96,1) | `#4A494D` (L\* 31,2) | `#EADFC6` + franjas `#2F7FB8` |
| `sail.mid` (lona media; D40) | — | `#DED7C8` (86,2) | `#303033` (20,0) | — (2 tonos) |
| `sail.alt` (jugador y pirata: lona en sombra, D40; mercante: paños alternos, D36) | — | `#C2BBAC` (76,1) | `#171619` (7,5) | `#D9CEB6` (−6; solo en las franjas crema. No sube a −12: la lona crema bajaría a L\* 79,9 < 80 de AD-10, y las franjas azules ya dan la textura) |
| `sail.lod1` (vela lisa de LOD1 = media lineal de los tonos de LOD0; D40) | — | `#E0D9C9` (86,8) | `#353438` (21,9) | `#E2D7BE` (86,2; las franjas siguen en `#2F7FB8`) |
| `cannon` / `gunport` | `#26282B` / `#1A1410` | ✓ | ✓ | (sin cañones) |
| `flag` | — | `#F2C14E` gallardete | `#111111` + `#F5F1E6` | `#2F7FB8` + `#F5F1E6` |
| `trim` (Fragata) | `#D9A93F` | ✓ | — | — |
| `lantern` | `#FFE9A8` | ✓ | — | — |
| `cargo` / `barrel` | `#B07A3E` / `#8A5A33` | — | — | ✓ |

### 4.2.1 Albedo de las caras horizontales (D17)
Los hex de §4.1–4.2 son el **color que se ve en pantalla** en la cara dominante. Con la iluminación de §5, una cara horizontal recibe ×(1,153, 1,149, 1,118) en lineal, así que la arena sale `#F5DCA2` en lugar de `#E6CF9A` (modelo de §5; desarrollo midió `#F5DDA3`, lo que valida el modelo). Los materiales que se ven sobre todo desde arriba usan un **albedo compensado** (objetivo lineal ÷ multiplicador). El resto, incluidas las velas y los cascos (verticales), usa el hex tal cual.

| Token | En pantalla (objetivo) | Albedo (vertex color) |
|---|---|---|
| `sand` (tapa de la playa) | `#E6CF9A` | `#D8C392` |
| `grass` (meseta) | `#5E9E48` | `#589444` |
| `deck`, tabla clara (jugador y mercante; D36) | `#DDA970` | `#CF9F6A` |
| `deck`, tabla clara (pirata; D36) | `#805C40` | `#78563C` |
| `deck.alt`, tabla oscura (jugador y mercante; D36) | `#B5844D` | `#AA7C49` |
| `deck.alt`, tabla oscura (pirata) | `#5C3B21` | `#56371F` |
| Cubierta, media de las tablas (referencia de AD-25) y cubierta lisa de LOD1 (D40) | `#C9965E` / pirata `#6E4B30` | `#BD8D59` / pirata `#67462D`, solo en LOD1. LOD0 no lo usa: allí la media sale de las tablas |
| `cargo` | `#B07A3E` | `#A5723B` |

### 4.3 Relación (etiquetas, minimapa, barras)
| Relación | Texto/acento | Barra de vida | Icono | Forma en el minimapa |
|---|---|---|---|---|
| **Propio** | `#FFD166` | `#3DDC97` | estrella | ▲ 10 px orientado según el rumbo |
| **Otro jugador** | `#F5F1E6` | `#F5F1E6` | ancla | ● 5 px |
| **Pirata (hostil)** | `#FF7A7A` | `#FF7A7A` | calavera | ◆ 7 px |
| **Mercante (pasivo)** | `#6CC3F5` | `#6CC3F5` | moneda | ■ 6 px |
| **Cañonera pirata (I2)** | `#FF7A7A` | `#FF7A7A` | calavera + bomba (Lucide `skull` + `bomb`) | ▬ 11 × 5 px, siempre horizontal, sin girar con el rumbo (ancha y baja, como su casco) |
| **Capitán pirata (I2, jefe)** | `#FF7A7A` | `#FF7A7A` | calavera + corona (Lucide `skull` + `crown`) | ★ 11 px con halo que late (anillo coral de 1,5 px, r 7 → 12 px, α 0,6 → 0, 1 Hz; detalle abajo). **Siempre visible**, también fuera del área de interés (GDD §9) |

**Detalle de los marcadores del minimapa (D43).** Tamaños en px CSS, iguales en escritorio (mapa de 184 px) y en móvil (88 px; el modal de 300 px los escala ×2). Todos se rellenan con el color de su relación y llevan un contorno de 1 px `#07121B`, como los de hoy (`Minimap.tsx`).
- **Geometría.** ● = círculo de 5 px de diámetro. ◆ = cuadrado girado 45° de 7 px de diagonal. ■ = cuadrado de 6 px de lado. ▬ = rectángulo de 11 × 5 px. ★ = estrella de 5 puntas, punta arriba, de radio exterior 5,5 px e interior 2,2 px. ▲ = triángulo de 10 px.
- **Orientación.** Solo gira el ▲ propio, con el rumbo. Los demás van alineados con la pantalla, para que las plantillas de AD-29 valgan en cualquier rumbo.
- **Orden de dibujo, de abajo arriba**: islas, zona segura, área de interés, mercantes y jugadores, piratas y cañoneras, capitán y, encima de todo, el ▲ propio.
- **Halo del capitán.** El canvas se redibuja a ≤ 2 Hz (AC-77), y un halo de 1 Hz dibujado en él daría 2 fotogramas por latido. Por eso el halo es un elemento DOM sobre el canvas (`pointer-events: none`), con una animación CSS de 1 s (escala del anillo de r 7 a 12 px y opacidad de 0,6 a 0, `ease-out`, infinita). Su posición se actualiza a la vez que el redibujado del canvas, sin commits de React. Con `prefers-reduced-motion: reduce`, el anillo queda fijo en r 9 px con α 0,4. AD-29 se mide sobre los píxeles del canvas, sin el halo.
- **Visibilidad.** El marcador del capitán se dibuja desde que llega el aviso de aparición (AC-111) hasta su hundimiento, esté o no en el área de interés. Desaparece en el mismo redibujado en que llega el hundimiento. El resto de entidades sigue limitado al área de interés (AC-77).

### 4.4 Interfaz (tokens CSS en `:root`)
| Token | Valor | Uso |
|---|---|---|
| `--ui-panel` | `rgba(11, 26, 36, 0.85)` | Fondo de los paneles del HUD |
| `--ui-plate` | `rgba(6, 17, 26, 0.85)` | Placa de las etiquetas en el mundo |
| `--ui-line` | `rgba(242, 193, 78, 0.35)` | Borde de 1 px de los paneles |
| `--ui-text` | `#F5F1E6` | Texto principal |
| `--ui-text-dim` | `#A9B8C2` | Texto secundario |
| `--ui-gold` / `--ui-gold-hi` / `--ui-gold-lo` | `#F2C14E` / `#FFD166` / `#B8862B` | Oro, acento y CTA |
| `--ui-ok` | `#3DDC97` | Vida propia, curación, "En alcance" |
| `--ui-danger` | `#FF7A7A` | Daño recibido, vida baja (siempre con icono ⚠) |
| `--ui-info` | `#6CC3F5` | Información |
| `--ui-scrim` | `rgba(6, 17, 26, 0.55)` | Velo tras un modal |
| `--paper` / `--paper-card` / `--paper-line` | `#F2E6C8` / `#FBF4E2` / `#D8C59A` | Tienda |
| `--ink` / `--ink-soft` / `--ink-title` | `#2B1D0E` / `#5C4A33` / `#6B3A1A` | Texto sobre pergamino |
| `--wood` / `--wood-dark` | `#6B4426` / `#2A1A10` | Marco de la tienda y franja de la landing |
| `--btn-primary` | `#1F6F8B` (texto `#FFFFFF`) | Botón "Mejorar" o "Comprar" |
| `--btn-disabled` | `#D9CDB0` (texto `#7A6E57`) | Botón desactivado (siempre con un texto que explique por qué) |

### 4.5 Validación de la paleta (ejecutada)
Script propio (Python, simulación de daltonismo de Machado 2009 con severidad 1,0, contraste WCAG 2.x y ΔE76 en CIELAB). Salida resumida:

| Comprobación | Resultado | Umbral |
|---|---|---|
| ΔE entre colores de relación, peor caso (protan / deutan / tritan) | Pirata–Propio 51/33/44 · Pirata–Jugador 35/34/68 · Pirata–Mercante 47/66/106 · Propio–Mercante 89/95/67 · Propio–Jugador 55/53/24 · Jugador–Mercante 39/47/50 | ≥ 20 ✓ |
| Texto de etiqueta sobre la placa al 85 % (fondo océano / arena / espuma) | Propio 12,0/9,6/8,9 · Jugador 15,3/12,3/11,4 · Mercante 8,8/7,1/6,6 · Pirata 6,8/5,5/5,1 | ≥ 4,5 ✓ |
| Velas contra el océano | Marfil 5,81:1 · Pirata 2,05:1 (L\* 17 contra 38) · Mercante 5,25:1 | Diferencia de L\* ≥ 15 ✓ |
| Casco del jugador contra el océano | `#4A2F1C` 1,76:1 (L\* 22 contra 38); franja ocre 3,07:1 | La franja lleva el contraste |
| Números de daño con contorno `#07121B` | Infligido 13,1 · Recibido 7,5 · Curación 10,7 · Fallo 12,5 | ≥ 4,5 ✓ |
| Texto del HUD sobre `--ui-panel` (peor fondo: espuma) | Texto 10,2 · Secundario 5,7 · Oro 6,9 · Vida 6,5 · Peligro 4,6 · Info 5,9 · Escudo 9,1 | ≥ 4,5 ✓ |
| Anillos y marcador con contorno `#07121B` | Objetivo frente al contorno 13,1:1 · contorno frente a la arena 12,4:1 (sin contorno, el marcador sobre arena daría 1,39:1) | ≥ 3 ✓ |
| Tinta sobre pergamino | Texto 13,2 · Secundario 6,8 · Título 7,5 · Botón 5,7 · Precio 9,7 | ≥ 4,5 ✓ (el desactivado da 3,2: lleva texto explicativo) |
| Hallazgo que corrigió la paleta | Un coral #FF6B3D frente al oro propio solo daba ΔE 19,6 en deuteranopia, y una placa al 62 % sobre arena 2,5:1. Se cambió a #FF7A7A y a una placa al 85 % | — |

---

## 5. Iluminación y render

| Parámetro | Valor |
|---|---|
| `renderer.toneMapping` | **`THREE.NoToneMapping`** (en R3F: `<Canvas flat>`), sin compensaciones por material. Motivo (D2): el *toe* de `NeutralToneMapping` resta casi todo el canal mínimo de los colores oscuros (`x − 6,25x²` si x < 0,08), un ajuste pensado para el 4 % de reflexión especular del entorno PBR, que aquí no existe (sin `envMap`). La escena no tiene fuentes HDR |
| `outputColorSpace` | `SRGBColorSpace` (por defecto) |
| Luz hemisférica | Cielo `#F2F6FA`, suelo `#B8C9D1`, **intensidad 3,0** |
| Luz direccional (sol) | `#FFF1D6`, **intensidad 1,2**, dirección hacia la luz `normalize(−0.45, 0.80, 0.40)`: arriba a la izquierda y ligeramente hacia la cámara. El océano usa el mismo vector como uniform |
| Sombras | Desactivadas (`shadowMap.enabled = false`). La lectura de altura de las balas la da la sombra falsa en el agua (VFX-SPEC §3) |
| Luces puntuales | **0**. Se eliminan las 2 luces de navegación de cada barco del código actual: cada luz encarece todos los materiales iluminados |
| `dpr` | `[1, 2]` en escritorio y `[1, 1.5]` en móvil |
| Antialias | `antialias: true` en escritorio; en móvil solo si el DPR efectivo es < 2 |
| Calidad adaptativa | Si la media del frame supera 20 ms durante 3 s: DPR × 0,75 y topes de partículas × 0,5 (VFX-SPEC §0). Se revierte tras 10 s por debajo de 14 ms |

El criterio que se valida es AD-01 (color del océano) y AD-10 (valor de las velas).

**Evidencia de la calibración (D2/D8).** Script que reproduce el Lambert de three r180 con luces físicas: `albedo/π · (I_h·mix(suelo, cielo, ½n.y+½) + I_s·max(n·L, 0))`.

| Material y cara | Antes (Neutral, hemi ×1,2 oscura, sol ×2,4) | Ahora (sin TM, hemi ×3,0 clara, sol ×1,2) |
|---|---|---|
| Vela del jugador, cara a la cámara (rumbo N, braza 20°) | `#81837C` L\* 54 | `#D3D3C8` L\* 84 |
| Vela del jugador, de espaldas al sol | `#4B5B61` L\* 38 | `#C8CAC2` L\* 81 |
| Vela del jugador, de cara al sol | `#B8B09D` L\* 72 | `#E5E2D3` L\* 90 (canal máx. 229, sin recorte) |
| Vela del pirata (todas las caras) | L\* 1 (negro puro) | L\* 14–16 |
| Casco del jugador (vertical) | L\* 3–12 (casi negro) | L\* 18–21 |
| Cubierta (cara superior) | `#B4813E` L\* 58 | `#D6A063` L\* 70 |
| Toe de Neutral sobre colores planos | `#1A5F86` → `#025B83` (lo que vio desarrollo) · `#4A2F1C` → `#442403` · `#2B2A2E` → `#0E0B15` | — |

---

## 6. Cámara

### 6.1 Proyección y ángulo
| Parámetro | Valor |
|---|---|
| Tipo | `OrthographicCamera`. En R3F y drei, el frustum se mide en px CSS (`left = −width/2`…), así que **`camera.zoom` = px por metro (ppm)** |
| Elevación θ | **55°** sobre el horizonte |
| Guiñada | **0°**. La cámara está al sur (+Z) del objetivo y mira al norte (−Z). En pantalla: **arriba = −Z, derecha = +X** |
| Posición | `target + 300 · (0, sin θ, cos θ)` = `target + (0, 245.75, 172.07)` |
| `near` / `far` | 50 / 650 |
| Rotación por el usuario | No en el MVP |

**¿Por qué 55° y sin 45°?** Alternativas evaluadas:

| Opción | A favor | En contra | |
|---|---|---|---|
| Cenital a 90° (la actual) | Simple | Esconde los modelos: velas y mástiles se ven de canto. Es el problema reportado | ✗ |
| **Oblicua a 55°, guiñada 0°** | Muestra la cubierta, el costado y las velas. La carta queda alineada con la pantalla, como en Seafight (R1). Clic → mundo trivial | Las velas cuadras se ven de canto con rumbo E/O (se mitiga en ASSET-SPEC §8.3) | **✓ Recomendada** |
| Isométrica real (35,26° + guiñada 45°) | Más dramática | Los ejes del mapa salen en diagonal, hay más oclusión (velas tapan barcos) y más solape de etiquetas | ✗ |

### 6.2 Zoom
**Zoom por defecto** (se recalcula al cambiar el tamaño del viewport):
```
ppm₀ = clamp( min( (W/2 − 12) / R ,  (H/2 − max(top, bottom)) / (R · sin θ) ),  1.5, 12 )
R = máx(alcance del cañón propio, 65 m) → 65 / 70 / 80 m con N1 / N2 / N3 (GDD §5, AC-24; U8 cerrado, D26)
    65 m = el mayor alcance de disparo de un NPC (cañonera y capitán). Si un NPC alcanza más, R sube con él
top/bottom = reserva de HUD del layout (§12): escritorio 120/108 · móvil vertical 116/104 · móvil horizontal 12/12
```

| Viewport | Cañón | ppm₀ | Suelo visible | Balandra (16 m) | Bergantín (24 m) | Fragata (34 m) | Pirata (20 m) | Mercante (22 m) | Cañonera (28 m) | Capitán (30 m) |
|---|---|---|---|---|---|---|---|---|---|---|
| 1440×900 | **N1 (sesión nueva)** | **6,20** | 232 × 177 m | 99 px | 149 px | 211 px | 124 px | 136 px | 174 px | 186 px |
| 1440×900 | N2 | 5,76 | 250 × 191 m | 92 | 138 | 196 | 115 | 127 | 161 | 173 |
| 1440×900 | N3 | 5,04 | 286 × 218 m | 81 | 121 | 171 | 101 | 111 | 141 | 151 |
| 390×844 | **N1** | **2,82** | 139 × 366 m | 45 | 68 | 96 | 56 | 62 | 79 | 84 |
| 390×844 | N2 | 2,61 | 149 × 394 m | 42 | 63 | 89 | 52 | 58 | 73 | 78 |
| 390×844 | N3 | 2,29 | 170 × 450 m | 37 | 55 | 78 | 46 | 50 | 64 | 69 |
| 844×390 | **N1** | **3,44** | 246 × 139 m | 55 | 82 | 117 | 69 | 76 | 96 | 103 |
| 844×390 | N3 | 2,79 | 302 × 170 m | 45 | 67 | 95 | 56 | 61 | 78 | 84 |

(px = eslora del casco de lado. El suelo visible mide `W/ppm` × `H/(ppm·sin θ)`.)

**Encuadre por alcance (D23 → D25 → decidido por `game-product` en U8, D26).** `R = máx(alcance del cañón propio, 65 m)`. 65 m es el mayor alcance de disparo hostil (cañonera y capitán, GDD §9). Así se cumplen dos garantías: **tu círculo de alcance cabe entero** y **todo lo que te puede disparar está en pantalla**. Con R = 60 m no se cumpliría la segunda, porque la cañonera orbita a 62 m y dispara a 65. Al cambiar de cañón (solo en la tienda del puerto), ppm₀ pasa al valor nuevo con una transición *ease-in-out* de 600 ms al cerrar la tienda, que además comunica la mejora. Esto sustituye el motivo de «R fijo» (que el zoom no cambie al mejorar), porque el cambio ocurre una sola vez y en un momento tranquilo.

**Intercambio con el que decidió producto** (cálculo con la fórmula de arriba; eslora en px de lado; «vertical × horizontal» = alcance en pantalla hacia arriba y abajo × hacia los lados, dentro de las reservas del HUD):

| R | 1440×900: ppm₀ · alcance en pantalla | Eslora en px (Balandra / Pirata / Cañonera / Capitán / Fragata) | Balandra, peor rumbo (`measureShipValues`) | 390×844: ppm₀ · alcance en pantalla · Balandra / Cañonera / Capitán en px | Hostiles que te pueden disparar, en pantalla |
|---|---|---|---|---|---|
| **80 (hoy)** | 5,04 · 80 × 141 m | 81 / 101 / 141 / 151 / 171 | 1 310 px | 2,29 · 163 × 80 m · 37 / 64 / 69 | Todos |
| 75 | 5,37 · 75 × 132 m | 86 / 107 / 150 / 161 / 183 | 1 490 px | 2,44 · 153 × 75 m · 39 / 68 / 73 | Todos |
| 70 | 5,76 · 70 × 123 m | 92 / 115 / 161 / 173 / 196 | 1 710 px | 2,61 · 143 × 70 m · 42 / 73 / 78 | Todos |
| **65 (propuesta con N1)** | **6,20** · 65 × 114 m | 99 / 124 / 174 / 186 / 211 | **1 980 px** (+51 %) | 2,82 · 133 × 65 m · 45 / 79 / 84 | Todos (pirata 55, cañonera y capitán 65) |
| 60 | 6,71 · 60 × 105 m | 107 / 134 / 188 / 201 / 228 | 2 330 px | 3,05 · 122 × 60 m · 49 / 85 / 92 | ✗ Cañonera y capitán disparan desde fuera |

Con la decisión: cañón N1 → R 65 (+23 % de eslora en px frente a hoy); N2 → R 70 (+14 %); N3 → R 80 (igual que hoy). Lo que se pierde con N1 es ver entre 65 y 80 m hacia arriba y abajo. A los lados se siguen viendo 114 m en escritorio. La cañonera detecta a 80 m y se acerca: se ve a los lados desde 114 m y arriba o abajo desde 65 m, que es cuando ya puede disparar.

**No hay que codificar 5,04 ni 2,29.** ppm₀ se calcula en tiempo de ejecución con la fórmula, a partir de θ y de las reservas `top`/`bottom` definidas como constantes del layout del HUD. En escritorio, el eje vertical del círculo queda exactamente en el borde del área útil (660 px frente a 660 px). Por eso cambiar θ o la altura del HUD solo exige actualizar esas constantes, y AD-06 lo verifica.

**Niveles** (GDD §5) de **extensión visible** `f` ∈ {0,7 (más cerca), 1,0, 1,5 (más lejos)}: `ppm = ppm₀ / f`. La rueda o el pellizco salta de nivel en nivel, sin zoom continuo, con una transición *ease-out* de 180 ms. Escritorio con N1: 8,85 / 6,20 / 4,13 px/m (con N3: 7,19 / 5,04 / 3,36). Móvil vertical con N1: 4,02 / 2,82 / 1,88 px/m (con N3: 3,27 / 2,29 / 1,53). **Con qué ppm se mide cada regla de QA (D28; corrige lo que escribí en D26):**
- Las reglas de **lectura en px absolutos a «1,0×»** (VFX-07, AS-V20, AD-28, tamaños mínimos de efectos…) se miden en el **peor caso, N3**: 5,04 px/m en escritorio y 2,29 en 390×844. Es el encuadre más alejado de los tres, y coincide con las cifras escritas antes de U8. Con N1 se ve más cerca, así que si pasan con N3 pasan con todos.
- **AD-26** es la excepción porque mide justo la sesión nueva: N1, 6,20.
- Los **cocientes de geometría** (AS-V14, AS-V19) y los contrastes (VFX-20) no dependen del nivel. AS-V14 conserva su ppm fijo de calibración (7,2).
- **VFX-09b se mide con N1 y con N3, y tiene que pasar en los dos** (D29). Sus fracciones sí dependen un poco del nivel, porque los mínimos en px (10 px del cuerpo de la llama, 5 del núcleo, 6 del humo) inflan las partículas pequeñas cuando el ppm es bajo. Por eso N3 da fracciones algo mayores y N1 es el caso difícil del fuego.
- En D26 había escrito que todas usaban «el ppm₀ de la sesión». Eso habría permitido medir los tamaños mínimos con N1, que es el caso fácil. `preventDefault` en `wheel` y `touchmove` sobre el canvas (AC-25, AC-81).

### 6.3 Seguimiento
- **Rígido**: `target = posición interpolada del barco propio` en cada frame, sin *lookahead* ni amortiguación. La interpolación de 100 ms (GDD §13) ya suaviza el movimiento, y el barco queda en el centro exacto, lo que garantiza AC-23.
- **Salto** (reaparición): corte directo, sin transición.
- **Sacudida** al recibir impacto el barco propio: desplazamiento aleatorio de 4 px de amplitud (`4/ppm` m), 160 ms, con decaimiento lineal. Se desactiva con `prefers-reduced-motion: reduce`.
- **Sin límite en el borde del mapa.** Un límite movería el barco fuera del 10 % central (AC-23). Fuera de [−500, 500] el océano pasa a `ocean.edge` y hay una línea de borde (§7.4).

---

## 7. Océano

**Técnica:** un `PlaneGeometry(1, 1)` rotado −90° en X, escalado al suelo visible + 40 m y recentrado en cada frame en el objetivo de la cámara (redondeado a 1 m). Lleva un `ShaderMaterial` con coordenadas de mundo, así que el patrón no "viaja" con la cámara. Solo normales en el fragment shader (sin desplazar vértices: con 55° no se apreciaría). Es **1 draw call y 2 triángulos**. El shader debe terminar con `#include <tonemapping_fragment>` y `#include <colorspace_fragment>`.

### 7.1 Olas (normal procedural)
Suma de 4 ondas direccionales con fase `k·(d·p) − ω·t`, `k = 2π/λ` y velocidad `c = √(9,81·λ/2π) × 0,35` (ralentizada para que se lea):

| Onda | λ (m) | Dirección (desde el viento NE, `(0.707, −0.707)` en XZ) | Pendiente `k·A` | c (m/s) |
|---|---|---|---|---|
| 1 | 23 | 0° | 0,10 | 2,1 |
| 2 | 13 | +28° | 0,08 | 1,6 |
| 3 | 7,5 | −35° | 0,06 | 1,2 |
| 4 | 3,8 | +62° | 0,04 | 0,9 |

Encima, ruido de valor de 2 octavas (escala 1,6 m y 0,7 m, desplazamiento a 0,3 m/s) que añade ±0,05 a la normal en XZ. La altura normalizada `h ∈ [−1, 1]` (suma de senos) solo sirve para colorear.

### 7.2 Color
```
h_c = 0.6·h + 0.4·n                                                    // n = ruido de 2 octavas en [−1, 1]: rompe las bandas
n   = (vnoise(p/9 + 0.6·drift) + 0.5·vnoise(p/4.5 − 0.4·drift)) / 1.5 · 2 − 1   // longitudes 9 m y 4,5 m (D20); drift el de §7.1
c = mix(ocean.deep, mix(ocean.trough, ocean.crest, smoothstep(−0.6, 0.8, h_c)), 0.55)   // contraste de ola al 55 %
s  = 1 − smoothstep(0, 18, d_isla)   → c = mix(c, ocean.shallow, 0.85·s)
s2 = 1 − smoothstep(0, 4,  d_isla)   → c = mix(c, ocean.shore, s2)
Fresnel F = 0.02 + 0.98·(1 − n·v)^5  → c = mix(c, ocean.sky, 0.6·F)
```
- `d_isla` = distancia con signo a la costa más cercana: `min_i(|p − cᵢ| − rᵢ)`. Las islas llegan como uniform `vec3 uIslands[16]` (x, z, r) con los radios del GDD §4 (7 islas con PORT). Si alguna vez hay más de 16 islas, se sustituye por una textura de campo de distancia de 512² (2 m/texel).
- `v` (ortográfica) = constante `(0, sin 55°, cos 55°)` = `(0, 0.819, 0.574)`.

### 7.3 Espuma y especular
| Elemento | Regla |
|---|---|
| Espuma de cresta (D23, D42) | `crest = smoothstep(0.55, 0.95, h_w) · smoothstep(0.45, 0.65, n_v) · racha · 0.30`. **`h_w` = la altura de §7.1 evaluada en un punto desplazado** (D42): `q = p + 18·(2·vnoise(p/40 + (3.1, 3.1) + 0.1·drift) − 1, 2·vnoise(p/40 + (11.7, 11.7) + 0.1·drift) − 1)` m, y `h_w = Σ aᵢ·sin(kᵢ·(dᵢ·q) − ωᵢ·t) / Σ aᵢ`, **con el mismo factor de zona segura que `h`** (× 0,6 dentro de 110 m del puerto, §7.2; D48): con `h_w` ≤ 0,6, la espuma de cresta no pasa de 0,043 · 0,30 ≈ 0,013, y el agua mansa sigue limpia. Las 12 vistas de AD-27 están a ≥ 220 m del puerto, así que no les afecta. Así las crestas donde rompe la espuma serpentean y dejan de formar diagonales rectas cada 23 m; el color del agua sigue usando `h` sin desplazar (§7.2). Cuesta 2 `vnoise` y 4 `sin` más por píxel de océano, sin draw calls. `n_v = vnoise(rot_viento(p) · (1/6, 1/2) + 0.5·drift)`: ruido **estirado 3:1 a lo largo del viento**, que da vetas en lugar de manchas redondas. `racha = smoothstep(0.60, 0.80, vnoise(p/35 + 0.15·drift))`: la espuma sale en grupos y el resto del mar queda limpio (en las 12 vistas de AD-27, la mediana de celdas de 240×110 px sin espuma es 58 % con k1 y 64 % con el desplazamiento). D42 cambia tres cifras de D23, que tal cual daba 0,00–0,42 % de cobertura y pasaba 1 de 12 capturas: el umbral de h baja de 0,75 a 0,55, la racha pasa de 70 m y 0,55 a 35 m y 0,60, y la fuerza sube de 0,25 a 0,30. Las vetas no cambian. Antes de D23 era `smoothstep(0.72, 0.95, h) · 0.35 · step(0.5, vnoise(p·0.45))`: medias lunas de borde duro, repartidas por igual en todo el mar (QA-REPORT-2026-10-11-3: «repetidas y procedurales»). Lo verifica AD-27, con la periodicidad (R23) incluida |
| Espuma de orilla | Banda `d_isla ∈ [0, 2.5]` m modulada por `sin(d·2.4 − t·1.6)` (ondas que avanzan hacia la costa), intensidad 0,8 |
| Especular | Blinn-Phong con `H = normalize(L + v)`, brillo 90, intensidad 0,8, color `ocean.spec`. Con agua plana, `n·H` = 0,834 → 0 tras la potencia: solo brillan facetas de ola, como destellos dispersos |
| Zona segura | Dentro de 110 m del puerto, amplitud de olas × 0,6 y tinte un 8 % hacia `#2A7FA0` (agua mansa) |

### 7.4 Líneas en el agua (en el mismo shader)
| Línea | Geometría | Estilo |
|---|---|---|
| Borde del mapa | \|x\| o \|z\| = 500 | Discontinua `#F2C14E` al 50 %, ancho 2 px constante (`fwidth`), trazo de 4 m. Fuera: `mix(c, ocean.edge, smoothstep(0, 30, e))` con `e` = metros fuera del mapa |
| Borde de la zona segura | Círculo r = 110 m en (0, 0) | Discontinua `#F5F1E6` al 55 %, 2 px, trazo de 6 m + boyas (§8.2) |
| Rejilla de sectores | Cada 100 m | Blanca al 5 %, 1 px. Sectores A–J (X) × 1–10 (Z, de norte a sur) para las coordenadas del minimapa, como en Seafight (R1) |

---

## 8. Islas

### 8.1 Islas genéricas
Se generan proceduralmente con semilla (`hash(id)`) a partir del radio del GDD §4. La receta exacta está en ASSET-SPEC §9.

| Rasgo | Regla |
|---|---|
| Silueta | Playa circular irregular (jitter radial solo hacia dentro, ≤ 6 %, para que la visual nunca supere el colisionador) → meseta de hierba desplazada → colina rocosa si r ≥ 35 m |
| Alturas | Playa hasta +0,8 m, meseta hasta +1,8 m, colina hasta `1,8 + 0,22·r` m (I3 = 13,9 m) |
| Vegetación | Palmeras `round(r/6)` y arbustos `round(r/5)` |
| Costa | Rocas `round(r/9)` mitad sumergidas. Las aguas someras y la espuma las pinta el shader (§7.2–7.3) |
| Lectura | La playa (L\* 84) contra el agua somera (L\* 56) da contraste de valor, así que se lee en grises |

### 8.2 Puerto (PORT, r = 30 m)
Es una isla genérica con el "pueblo refugio": 5 casas (muros `town.wall`, tejado a 4 aguas `town.roof`), un faro blanco con 2 franjas `town.roof` y linterna `lantern` en el lado norte, 2 muelles de madera (este y sur) que cruzan la playa **sin salir del colisionador** (D7) y un mástil con bandera dorada. Lleva **24 boyas** iguales y bicolores (cuerpo `buoy.a` + cono `buoy.b`; D5) cada 15° en el círculo de 110 m. Debe leerse como "lugar seguro" (AC-65).

---

## 9. Barcos del jugador

Las clases y la eslora vienen del GDD §6. Eslora = casco, sin bauprés. **La clase se lee por la silueta** (nº de mástiles, tipo de vela, castillos); el color es el mismo para todos los jugadores.

| | **Balandra** (inicial) | **Bergantín** | **Fragata** |
|---|---|---|---|
| Eslora L × manga B | 16 × 4,4 m | 24 × 6,2 m | 34 × 8,6 m |
| Francobordo F / calado modelado D | 1,5 / 0,8 m | 2,0 / 1,1 m | 2,8 / 1,5 m |
| Bauprés | 4,5 m | 6,0 m | 8,0 m |
| Mástiles (altura sobre la flotación) | **1**: 14,5 m | **2**: trinquete 18, mayor 19,5 m | **3**: trinquete 24, mayor 27, mesana 21 m |
| Aparejo | Cangreja grande + gavia cuadra + foque | Trinquete con 3 cuadras + mayor de cangreja + foque | 3 palos con cuadras + cangreja de mesana + 2 foques |
| Castillos | — | Camareta de popa baja | Alcázar (popa) + castillo de proa |
| Cañones por banda | 4 | 6 | 8 |
| Acentos | Franja ocre | Franja ocre | Franja ocre + filete dorado `#D9A93F` + 2 faroles en la popa |
| Radio del anillo (`sb_radius` × 1,1) | 9,9 m | 14,3 m | 19,8 m |
| Radio de colisión (GDD) | 5 m | 7 m | 9 m |

```
Perfil (babor, proa a la derecha; escala relativa)
Balandra            Bergantín                  Fragata
     |\                 #   |\                   #    #   |\
     | \                ##  | \                  ##   ##  | \
     |  \               ### |  \                 ###  ### |  \
  ___|___\__        ____###_|___\___      __[]___###__###_|___\__[]
  \________/==      \______________/==    \_______________________/==
 1 palo, cangreja   cuadras proa + cangreja   3 palos cuadras + alcázar
```

### 9.1 Detalle interno (D36): paños, tablas y franja de portas
**AS-V19 se queda en ≥ 55 % en las 5 clases, el pirata incluido, sin excepción de clase.** Se llega con 5 palancas, todas en geometría con vertex colors, con el material único y sin draw calls nuevas. Recetas exactas en ASSET-SPEC §8.1–8.2.

**Por qué 55 % y no el 70 % de Seafight.** Las capturas de Seafight son JPEG, y su ruido de bloque cuenta como textura. Mismo método de AS-V19 sobre `qa-artifacts/render/escala/ref-seafight-1297031307.jpg` (script `qa-artifacts/render/d36-modelo/seafight.py`):

| AS-V19 (\|∇L\*\| ≥ 4) | Seafight, jugador | Seafight, Rackham (velas oscuras) | Nuestra Balandra 90° (D23) |
|---|---|---|---|
| Imagen tal cual | 70,2 % | 80,1 % | 42,0 % |
| Gauss σ 0,6 (quita el ruido JPEG) | 58,7 % | 69,4 % | 35,6 % |
| Mediana 3×3 | 48,1 % | 59,1 % | 33,2 % |

Sin el ruido de compresión, el barco del jugador de Seafight queda en 48–59 %, y 55 % es paridad con él. Nuestro render no tiene ruido: los filtros solo le quitan bordes reales de 1 px. **Pirata**: la referencia de velas oscuras es Rackham (**HIPÓTESIS**: NPC pirata, por el nombre y por el color de NPC de su etiqueta, R4). Su lona (croma < 15, L\* 16–46) da 69 % tal cual y 54 % con σ 0,6, así que el pirata no necesita un umbral propio.

**Palancas** (modelo, mínimo de 0° y 90° por clase, acumulado; `out/S2–S5.log` y `FIN.log`):

| Paso | Balandra | Bergantín | Fragata | Pirata | Mercante |
|---|---|---|---|---|---|
| D23 (hoy) | 42,4 | 45,1 | 33,8 | 19,2 | 52,2 |
| 1. Paleta: tablas a ±7 de L\* del token, `sail.alt` del jugador −12 y del pirata −13,6 | 44,8 | 50,6 | 37,1 | 38,5 | 56,5 |
| 2. Tablas en las tapas de castillos y camaretas | 47,3 | 50,8 | 43,9 | 38,5 | 59,8 |
| 3. Paños de ≈ 0,7 m en las cuadras | 47,2 | 51,1 | 50,8 | 38,9 | 59,8 |
| 4. Paños en cangrejas, latinas y foques | **66,0** | **63,6** | **58,2** | **57,2** | 60,4 |
| 5. Franja de portas de 1,0 m (la pide AS-V20, D36 a) | 65,8 | 63,6 | 58,1 | 59,2 | 60,4 |

La palanca grande es la 4: a 90° la vela visible es sobre todo la de cuchillo, que no tenía paños (37–58 % del interior y 5–35 % de textura, causa 2 de dev-render). Las tablas pasan de −10 a ±7 alrededor del token porque, con diferencia central, ΔL\* ≥ 8 solo basta si el borde cae entre dos píxeles. Cuando el antialias lo parte, hace falta más contraste: con ΔL\* 14, en el desglose del modelo la cubierta (tapas incluidas) pasa del 22–58 % al 63–76 % de píxeles con textura. Con el token como media, AD-25 se mantiene.

**Medido en `1a3440e`** (dev-render, `qa-artifacts/render/d36/despues/d36.json`, N1, media de 3 capturas); entre paréntesis, la previsión del modelo:

| Clase | 0° | 90° | 180° | 270° | Tris LOD0 (presupuesto §5) | AD-10, L\* de vela a 0,7× y rumbo N (modelo) |
|---|---|---|---|---|---|---|
| Balandra | 70,1 (67,0) | 65,9 (65,8) | 64,8 (66,2) | 69,3 (68,6) | 985 (2 500) | 83,4 |
| Bergantín | 65,3 (63,6) | 63,6 (64,3) | 63,6 (61,9) | 68,2 (67,6) | 1 473 (2 500) | 82,8 |
| Fragata | 56,7 (58,1) | 59,7 (59,9) | 56,9 (57,5) | 64,9 (63,2) | 2 370 (2 500) | 82,6 |
| Pirata | 56,9 (59,5) | 56,2 (59,2) | 56,2 (60,8) | 61,8 (62,9) | 1 077 (2 000) | 9,8 |
| Mercante | 69,7 (69,5) | 61,6 (60,4) | 58,2 (57,2) | 65,3 (66,5) | 1 645 (2 000) | 82,8 (lona crema) |

**El modelo** (`qa-artifacts/render/d36-modelo/`) es un rasterizador por software con la geometría real exportada con `tsx`, la iluminación de §5 (Lambert de three, sin tone mapping), supermuestreo 4×4 y el fondo y la alineación de las capturas de `d23c/`. Antes del render lo validé con 40 medidas de dev-render (`despues` y `experimento-dL10`): sesgo −0,08 puntos, \|e\| medio 0,89 y máximo 2,67. **Corrección (D37)**: fuera de esa muestra, sobre `1a3440e`, el error máximo fue 4,7 puntos, en el Pirata y siempre optimista (+1,1 a +4,7). Afirmé que el margen de la Fragata superaba el error máximo, y eso no valía para la lona casi negra. La causa principal era el especular GGX, que el modelo no tenía (hipótesis de dev-render, ya comprobada): suma la misma luz a `#2B2A2E` y a `#0D0D0F` y comprime su ΔL\*. Con el GGX (rugosidad 0,85, F0 0,04), que ya viene activado por defecto, el error del Pirata baja a −0,1 / +1,4 / +3,0 / 0,0, el máximo de las 20 medidas a 3,0 y el resto de clases cambia ≤ 0,5. El +3,0 que queda a 180° es **HIPÓTESIS**: el balanceo de ±3°, que el modelo no tiene. AS-V14 en el modelo no empeora (mín./máx. 0,294 → 0,303, 0,510 → 0,513, 0,492 → 0,496, 0,349 → 0,364 y 0,385 → 0,387). AD-26 no cambia, porque la silueta es la misma. VFX-09b tampoco: el humo claro se separa de la cubierta por croma, con ΔE76 ≈ 36 sobre cualquiera de las dos tablas, igual que hoy sobre `#C9965E`.

**Descartadas**: damero de paños (+3 a +5 puntos a 90°, pero se lee como un mantel: `out/B.log` frente a `A.log`), paños de 0,6 m (Fragata con 2 533 tris > 2 500), paños de 1,0 m (Fragata a 0° con 52–54 %), `sail.alt` del jugador a −14/−16 (AD-10 con < 2 puntos de margen) y texturas (V3: sin texturas en el MVP).

**Vigilancia (HIPÓTESIS)**: en 390×844 con N1, la Fragata va en LOD0 (96 px) y muestra tablas de 1,4 px CSS y paños de 2,0 px CSS, que son 2,1 y 3,0 px físicos con DPR 1,5. Con MSAA no debería verse moiré. Si QA lo ve al girar en `qa:capture`, la palanca es exigir además ppm ≥ 4 para LOD0 (ASSET-SPEC §7).

#### Carácter de la lona (D40; O-7 de QA-6)
**La lona del jugador y del pirata deja de ser una onda de dos niveles: lleva 3 tonos en orden barajado, paños más finos y paños radiales en foques y latinas. El Mercante conserva sus rayas regulares, que vuelven a ser solo suyas (D9).** Lo mide AS-V21 con los descriptores que ya calcula dev-render (η de Otsu para los dos niveles y r de autocorrelación para el periodo), y AS-V19 sube en todas las clases. Modelo, scripts y hojas: `qa-artifacts/render/d40-modelo/`.

**Qué hace periódica la lona** (modelo 1D, `toy/explore2.py` y `explore4.py`: perfil a 6,20 px/m con supermuestreo 8× en luz lineal; 400–500 perfiles por variante). Mediana del pico de autocorrelación (aquí, el máximo tras el primer cruce por cero, `character.py: periodic_peak`; AS-V21 usa el r de dev-render, que da el mismo orden entre hoy y D40):
- 2 tonos alternos de ancho fijo: 0,95.
- 2 tonos con anchos de ±30 %: 0,74–0,84; de ±50 %: 0,56–0,65.
- 3 tonos sin repetir el del vecino: 0,40–0,45.

Lo que rompe el periodo es el **orden de los tonos**, no el ancho del paño. En el modelo completo, con el mismo orden de tonos, el pico da 0,28–0,48 con las costuras desplazadas y 0,36–0,47 sin desplazar (7 semillas).

El límite lo pone AS-V19: hace falta un borde con ΔL\* ≥ 8–10 cada ≈ 4 px, y con 3 tonos el salto medio entre vecinos es menor que con 2. Por eso hay dos cambios más:
- Los paños bajan a 0,55 m.
- El rango de la lona se abre a 20 L\*. El tono claro sube a L\* 96 para que AD-10 no baje.

**Receta** (ASSET-SPEC §8.2):

| | Jugador | Paleta pirata | Mercante |
|---|---|---|---|
| Tonos (`sail` · `sail.mid` · `sail.alt`) | `#FBF3E3` · `#DED7C8` · `#C2BBAC` | `#4A494D` · `#303033` · `#171619` | Sin cambio (D36): `#EADFC6` y `#D9CEB6` alternos, con franjas `#2F7FB8` |
| Orden | **Bolsas barajadas**: cada grupo de 3 paños seguidos es una permutación de los 3 tonos, elegida por hash. El primer paño de un grupo no repite el tono del último paño del grupo anterior. Así, dos paños vecinos nunca comparten tono, y de n paños cada tono cubre ⌊n/3⌋ o ⌈n/3⌉ | Igual | Alternos |
| Paño en cuadras y cangrejas | 0,55 m | 0,5 m (columnas en múltiplo de 4, por las muescas) | 0,7 m |
| Foques y latinas | **Paños radiales**, que convergen en el puño de driza (foque) o en el pico (latina): `max(2, round(pujamen / paño))` columnas × 3 filas | Igual | Filas de 0,9 m paralelas al pujamen (D36) |

**Previsión (HIPÓTESIS)**. Modelo de D36 con GGX y 7 semillas del hash (`out/N0–N6.log`). El AS-V19 de hoy sale del mismo modelo (`out/cur-sp.log`):

| Clase | AS-V19 a 0° | AS-V19 a 90° | Hoy (0° / 90°) | AD-10 | Tris LOD0 (presupuesto) |
|---|---|---|---|---|---|
| Balandra | 69,8–73,0 | 71,1–73,2 | 67,0 / 65,7 | 82,2–83,3 | 978 (2 500) |
| Bergantín | 67,9–69,4 | 68,7–69,4 | 63,7 / 64,1 | 81,7–82,6 | 1 524 (2 500) |
| Fragata | 63,4–64,4 | 63,1–63,9 | 58,2 / 60,0 | 81,9–82,2 | 2 440 (2 500) |
| Pirata | 61,2–63,8 | 65,5–66,4 | 59,9 / 61,0 | 19,0–19,5 | 1 122 (2 000) |
| Mercante | 69,5 | 60,2 | Sin cambio | 82,9 | 1 645 (2 000) |

La Fragata cabe con paños de 0,55 m porque los foques radiales, de 3 filas, ahorran triángulos. Con paños de 0,7 m y foques radiales da 2 229 (`out/X3.log`). En D36, los paños de 0,6 m con foques por filas daban 2 533.

**Calibración de AS-V21.** Con los descriptores de dev-render (`qa-artifacts/render/o7-base/scripts/sail-profile.py`), por vela y sobre las velas de las 4 clases a 0° y 90°. Mismo cálculo en el juego y en el modelo (`d40-modelo/dev/evaluate_dev.py`):

| Fuente | η (mediana · % de velas ≥ 0,85 · rango por clase) | r (mediana · % de velas ≥ 0,70) | Rango p5–p95 de L\* | Velas |
|---|---|---|---|---|
| Seafight (3 perfiles de QA; `o7-base/sail-profiles-base.log`) | 0,63–0,79 | Sin máximo: 0 | 20–40 | — |
| Juego actual (`ca02798`, corridas `base-r1` y `base-r2` de dev-render) | 0,88 · 77–90 % · 0,83–0,89 | 0,54–0,55 · 35–42 % | 14,0–14,1 | 31 |
| Código actual en el modelo | 0,90 · 83 % · 0,88–0,91 | 0,53 · 40 % | 14,6 | 30 |
| D40 en el modelo (7 semillas) | 0,72–0,75 · 0 % · 0,72–0,76 | 0,19–0,26 · 0–3 % | 21,0–21,4 | 31 |

El modelo reproduce el juego actual (η 0,90 frente a 0,88, r 0,53 frente a 0,54–0,55 y rango 14,6 frente a 14,0–14,1), así que la previsión de D40 tiene una base medida.

**Umbrales:**
- **η por clase ≤ 0,80**, y ≤ 15 % de velas con η ≥ 0,85. η mide lo que QA vio, los dos niveles: hoy todas las clases quedan por encima (0,83–0,89) y con D40 todas por debajo (0,72–0,76). Es estable por clase, así que se aserta por clase.
- **r: mediana ≤ 0,40**, y ≤ 15 % de velas con r ≥ 0,70, sobre las 4 clases juntas. Por clase es ruidoso con 4–12 velas: el Bergantín de hoy, que es de rayas, da 0,26–0,35 en el juego y 0,00 en el modelo, porque muchas líneas no tienen máximo local.
- El rango se registra sin asertar: hoy 14, D40 ≈ 21 y Seafight 20–40.
- La muestra de Seafight es pequeña (3 perfiles): marca la dirección, pero no sirve de umbral.
- Además, la parte de geometría de AS-V21 (a) comprueba cada vela.

**LOD1 pinta la media (D40; O-8).** LOD1 quita tablas y paños. Lo liso que queda debe tener el color medio en pantalla de lo que quitó, no el de una de sus piezas. Hoy pinta `deck` (la tabla clara) y `sail` (el tono claro). Medido en el modelo, a la misma pose, frente a LOD0 (`o8.py` y `sailmean_cur.py`):
- **Cubierta:** ΔE76 6,0–7,4, con +7,3 de L\* sobre el token. QA midió +4,9 y +6,0 en 390×844.
- **Vela:** +4,5 a +6,2 de L\*.

La cubierta de LOD1 pasa al albedo del token medio (`#BD8D59`; pirata `#67462D`), y la vela, a `sail.lod1`. Con eso, el salto baja a ΔE76 0,5–1,2 en la cubierta y a −0,8…+2,0 de L\* en la vela (`o8.py` y `sailmean.py`). Lo verifican AD-25 en 390×844 y AD-33.

**Descartadas** (todas con el modelo):
- **Degradado dentro de cada paño**, oscuro en la costura y claro en el centro (propuesta de QA). Reparte el contraste, y AS-V19 cae a 34–36 % en el Pirata a 0° y a 46–52 % en la Fragata (`out/L1–L3.log`).
- **Pliegues suaves superpuestos** (dos senos de 2,6 y 1,55 m). No bajan el pico (0,42–0,44 con pliegues, 0,42–0,45 sin ellos) y quitan 9–18 puntos de gradiente en el modelo 1D.
- **Damero 2D en las cuadras** (`W2`). Da AS-V19 ≥ 57 %, pero se lee como una colcha (`hojas/sheet-0-W2.png`), igual que el damero que ya descartó D36.
- **Costuras desplazadas** (paños de 0,4 a 1,6 veces el ancho). No bajan el pico (0,28–0,48, frente a 0,36–0,47 sin desplazar), restan 0,1–3,6 puntos de AS-V19 (mediana 0,9) y dejan paños de solo 0,22 m (1,4 px).
- **Concentración espectral como métrica.** Un orden aleatorio de paños de ≈ 4 px da 0,60–0,70 en el modelo 1D, porque mide cuánta varianza cae en ondas largas, no el periodo. Hoy, la Balandra a 0° ya da 0,53.
- **Textura de ruido en la lona.** Las texturas están prohibidas en el MVP (ASSET-SPEC §6 y AS-V09). Además, en el modelo 1D, con celdas de 0,15–0,5 m y un rango de 20–26 L\* da 12–38 % de gradiente, frente al 41–53 % de los paños de 0,55 m con 18–22 L\*.
- **Lona irregular también en el Mercante.** Le quitaría su seña (D9), así que se queda como está.

**Vigilancia (HIPÓTESIS)**:
- En 390×844 con N1, la Fragata va en LOD0 con paños de 1,55 px CSS (2,3 px físicos con DPR 1,5), frente a los 2,0 px CSS de D36. Si QA ve moiré, la palanca es la misma de arriba: ppm ≥ 4 para LOD0.
- AD-28 (I2) contaba como oscuros los píxeles con L\* ≤ 25, y el tono claro del pirata (L\* 31), ≈ ⅓ de su lona, dejaba de contar. **Resuelto en D43**: AD-28 pasa a usar el L\* medio de la máscara, que no depende del corte ni del LOD, y la paleta no cambia.
- **Cubiertas (D44).** Las tablas de 2 tonos alternos (D23, D36) siguen siendo la onda periódica de dos niveles que D40 quitó de las velas. Con los descriptores de AS-V21, en el modelo con la cubierta a 90°: r 0,88–0,97, η 0,80–0,91 y periodo de 4–9 px (`d40-modelo/dev/deck_dev.py`). Las velas daban, antes de D40, η 0,88. En la comparativa ×3 de dev-render (`qa-artifacts/render/d40/antes-despues-3x.png`), junto a Seafight, es lo que más «procedural» se ve. No se cambia ahora. Si QA lo señala, la palanca es la misma de D40: 3 tonos de tabla en bolsas barajadas cuya media siga siendo el token (AD-25 y AD-33 no cambian), comprobando que la cubierta no pierda AS-V19, que hoy aporta el 63–76 % de sus píxeles con textura (§9.1).

---

## 10. NPC

| | **Pirata** (hostil) | **Mercante** (pasivo) | **Capitán pirata** (I2, jefe) | **Cañonera pirata** (I2, hostil) |
|---|---|---|---|---|
| Eslora × manga | 20 × 5,0 m (fino, L/B 4,0) | 22 × 7,6 m (panzudo, L/B 2,9) | 30 × 8,0 m | 28 × 10,0 m (**ancha y baja**, L/B 2,8; perfil chato) |
| Francobordo / bauprés | 1,6 / 6,0 m | 2,4 / 4,0 m | 2,8 / 8,0 m | **1,5** / 3,0 m |
| Mástiles | 2, **inclinados 8° a popa**: 16 y 17,5 m | 3 verticales: 16, 17,5 y mesana latina 12 m | 3, inclinados 6°: 21, 24 y 18 m | **1**, inclinado 4°: 16 m |
| Velas | **Negras**, con 3 tonos de lona (`#4A494D` / `#303033` / `#171619`, D40): trinquete cuadro con muescas + mayor de cangreja + foque | **Crema con 2 franjas azules** (`#EADFC6` / `#2F7FB8`) + mesana latina | Negras (3 tonos de D40) con franja inferior roja `#B3261E`; **sin foques** | Negras, con los 3 tonos de la paleta pirata (D40): **una sola cuadra grande** (11 × 5,6 m) + gavia pequeña + foque. Es la hostil con menos vela |
| Casco | Negro `#2A2523`, franja roja | Marrón claro `#6E4A2C`, franja marfil, popa alta y redondeada | Negro, franja roja, **regala dorada** `#D9A93F` y mascarón dorado | Negro, franja roja, proa y popa romas |
| Cubierta | Despejada | **Carga**: 6 cajas + 3 barriles | Despejada | **Clara** `#9A8466` (L\* 56), con tablas. **Batería de 6 cañones por banda sobre cubierta**, oscuros (L\* 16) sobre claro, y un **mortero** central (disco oscuro de 2,6 m) |
| Bandera | Negra con un cuadro blanco (calavera a esta escala) | Azul con un cuadro blanco | **Estandarte blanco de 6 × 4 m** `#F5F1E6` con un cuadro negro de 2 m, que sustituye a la bandera (D45): es el **rasgo exclusivo** (≈ 17 × 6 px a 1,0× en 390×844, L\* 95 sobre velas de L\* ≈ 19) | Negra con un cuadro blanco |
| Cañones por banda (GDD §9) | 4 | 0 | 6 | 6 |
| Etiqueta | Calavera + coral | Moneda + cielo | Calavera y corona (2 iconos, §11.1) + coral: "Capitán pirata", sin truncar | Calavera y bomba (2 iconos) + coral: "Cañonera pirata", sin truncar |
| `sb_radius` / colisión (GDD) | 11 m / 6 m | 12 m / 7 m | 16 m / 9 m | 14 m / 8 m |

**Matriz de distinción.** Cada par se distingue por ≥ 2 canales que no son el tono:

| Par | Valor | Silueta | Icono | Tono |
|---|---|---|---|---|
| Pirata vs jugador | Velas L\* ≈ 19 contra ≈ 82 (AD-10 con D40) | Mástiles inclinados, casco fino | Calavera / estrella o ancla | Coral / oro o blanco |
| Mercante vs jugador | Franjas azules en las velas | Casco panzudo, carga en cubierta, 3 palos con latina | Moneda / estrella o ancla | Cielo / oro o blanco |
| Pirata vs mercante | Velas L\* ≈ 19 contra ≈ 83 (AD-10 con D40) | Fino frente a panzudo | Calavera / moneda | Coral / cielo |
| Propio vs otro jugador | — | — | Estrella / ancla + **anillo propio fijo** | Oro / blanco |

**Monstruos**: fuera del slice (GDD §3). Si entran, serán siluetas orgánicas con un tono propio (morado `#B48CFF` + icono de tentáculo).

---

## 11. Etiquetas y barras de vida (en el mundo)

**Técnica:** una capa DOM superpuesta al canvas (`pointer-events: none`) con un *pool* de 48 placas. Cada placa se coloca con `style.transform = translate3d(x, y, 0)` desde `useFrame`, por ref, **sin estado de React** (CLAUDE.md, regla 3). El contenido (nombre, color, icono) solo cambia cuando cambian los datos (≤ 10 Hz). Esto cumple la intención de GDD §14 ("fuera del ciclo de React").

### 11.1 Anatomía de la placa
```
            ┌──────────────────────────┐   fondo --ui-plate · radio 4 px · padding 2 px 6 px
   (◔)18px  │ ☠ Barbarroja             │   icono 12 px + nombre 12/16 px Barlow Semi Condensed 600
  recarga   │ ████████████░░░░░        │   barra 64×5 px (móvil 52×4) · pista #0B1A24 · borde 1 px rgba(0,0,0,.6)
 (solo el   └──────────────────────────┘   ancho = max(texto, 64) + 12 · máx. 128 px (móvil 116)
  propio)        ▲ ancla: borde inferior proyectado del casco + 6 px
```
- **Ancla** = posición del barco + `(0, 0, e_z + 1.5)` en el mundo, con `e_z = |L/2·cos ψ| + |B/2·sin ψ|`: el extremo de la caja del casco a lo largo de +Z, que en pantalla es abajo. La placa abraza el casco con cualquier rumbo y se mueve de forma continua al girar.
- **Nombre**: hasta 16 caracteres (GDD §13); el resto se trunca con "…". Color e icono según §4.3. La cañonera y el capitán llevan **dos iconos** de 12 px separados 2 px (calavera + bomba y calavera + corona). Sus nombres fijos, «Cañonera pirata» y «Capitán pirata», nunca se truncan: para ellos, el ancho máximo sube 14 px, a 142 px en escritorio y 130 en móvil (D43).
- **Barra de vida**: el ancho del relleno es `round(64 · hp/max)`. Tras un daño, el tramo perdido queda como "estela" `#FFF2B3` que se encoge en 400 ms. Con vida < 30 % la barra pulsa (opacidad 1 ↔ 0,55 a 1 Hz) y aparece el icono ⚠.
- **Placa propia**: además del indicador de **recarga** (18 × 18 px, a la izquierda de la placa; ver §11.3) y el icono de estado (§12.4).
- **Protección** (GDD §12): escudo + segundos restantes ("🛡 12") en la placa del barco protegido, propio o ajeno.
- **Iconos de estado** (protección, espadas): van en la **2.ª fila, a la derecha de la barra**. No restan espacio al nombre: con 16 caracteres el nombre nunca se trunca por un icono de estado.
- **Ataque en PvP (P1)**: si otro jugador te está atacando, su placa añade el icono de espadas cruzadas y un borde de 1 px `#FF7A7A`.

### 11.2 *Declutter* (a 10 Hz, fuera de React)
1. Se ordenan las placas por prioridad: propio (0) > objetivo (1) > los que te atacan (2) > hostiles a ≤ 80 m (3) > resto por distancia (4).
2. Se coloca cada placa en su posición natural. Si se cruza con una ya colocada, se prueba a desplazarla +18 px y luego +36 px hacia abajo.
3. Si sigue cruzándose y su prioridad es ≥ 2: se compacta a solo la barra (64 × 5 px). Si aún se cruza, se oculta.
4. **Nunca** se ocultan ni se compactan las placas propia y del objetivo, salvo bajo un bloque del HUD (§11.4).
5. Las placas fuera del viewport se ocultan (`display: none`, y solo se escribe cuando cambia).

**Umbral de AC-76:** con los centros de dos barcos separados ≥ **26 m** (escritorio, 1,0×) o ≥ **52 m** (390×844, 1,0×), ambas placas se ven **completas y sin solape**. Por debajo, el área de solape sigue siendo 0, aunque una se desplace o se compacte. Derivación: placa máxima de 128 px / 5,04 ppm = 25,4 m; 116 px / 2,29 ppm = 50,7 m.

### 11.3 Recarga junto al barco (AC-73)
Es un círculo de 18 px a la izquierda de la placa propia: pista `rgba(255,255,255,.15)` y relleno cónico `#F2C14E` que avanza en sentido horario desde las 12. Se actualiza por frame con `style.setProperty('--p', progreso)` desde `useFrame`. Estados: lleno y cargado → borde de 1 px `#FFD166` con un pulso lento (1,2 Hz); al disparar, destello blanco de 120 ms y vuelta a 0. Solo es visible con el ataque armado o durante la recarga. Avanza de forma monótona.

### 11.4 Placas bajo el HUD (O-4; D39)
**Regla: una placa nunca se dibuja a menos de 8 px de un bloque del HUD.** Si su caja entra en esa franja, se oculta en el mismo frame, y vuelve con un fundido cuando queda a ≥ 16 px. Es el equivalente del marco de Seafight, que recorta las etiquetas en el borde del área de juego (R11): el HUD flota sobre el mar y no se mezcla con las placas (el principio de AC-107).

| Parámetro | Valor |
|---|---|
| Bloques del HUD | Los elementos marcados con `data-hud-block`. **Escritorio**: panel del jugador, panel del objetivo (si se ve), oro, minimapa con su pie del sector, barra de acciones y cada línea visible del feed. **390×844**: barra superior, objetivo (si se ve), minimapa, Atacar, Objetivo, Reparar y Puerto. 844×390 usa los mismos elementos. **En los tres tamaños, cada aviso visible también es un bloque** (D41): los toasts de §12.5, el aviso «Zona segura», que se queda mientras el barco está en la zona, y en móvil las líneas del feed que se muestran como avisos. **No son bloques** la pista de primera sesión, que ya esquiva la placa propia, la del objetivo y los avisos (AC-105, AC-110), ni los chips de borde de I2 (44–48 px en el marco, que se mueven en cada frame). Con la vista libre (I2), el botón Centrar sí es un bloque |
| Caja de la placa | La del declutter (§11.2): la placa completa o compacta, con su desplazamiento de +18 o +36 px, y en la propia, con el indicador de recarga (AC-107) |
| Ocultar | Si la caja de la placa, ampliada 8 px por cada lado, se cruza con la caja de un bloque: `visibility: hidden` en la raíz de la placa y opacidad 0 en sus hijos, **sin transición** y en el mismo frame en que se coloca la placa (`position()`, por ref). La opacidad no se escribe en la raíz porque ahí va, en línea y por frame, la del hundimiento (VFX-SPEC: la placa se desvanece en 300 ms; `overlays.ts:462`). Las dos se multiplican y ninguna pisa a la otra (D41). Por eso el cruce es 0 en cualquier frame y a cualquier velocidad: el peor caso, dos barcos a 14 m/s en sentidos opuestos con 0,7×, se mueve 248 px/s |
| Volver a mostrar | Cuando la caja ampliada 16 px ya no se cruza con ningún bloque (histéresis de 8 px, sin parpadeo en el borde). Fundido de entrada de 150 ms en los hijos (`ease-out`, la animación `fade-in` existente), no en la raíz. **No se usa** `transition: opacity`, que retrasaría el desvanecido del hundimiento, porque ese se escribe por frame. Con `prefers-reduced-motion: reduce`, aparece sin fundido |
| Alcance | **Todas las placas, también la propia y la del objetivo**, como excepción a §11.2 paso 4: el panel del jugador y el del objetivo ya muestran su nombre y su vida. Una placa oculta por el HUD no ocupa sitio en el declutter, así que sus vecinas conservan su posición natural |
| Lectura de los bloques | `getBoundingClientRect()` de los bloques visibles a 10 Hz, en la fase de lectura del declutter (el mismo layout), y al cambiar el tamaño de la ventana. Como los avisos entran y salen de golpe, las cajas también se releen en el mismo commit en que cambia la lista de avisos, antes de pintar (como ya hace la pista, O-1; D41). Así, una placa que ya estaba debajo se oculta en el primer frame en que se ve el aviso. La prueba de cada frame usa esas cajas guardadas. 0 commits de React (AD-20) |

AD-32 lo verifica.

---

## 12. HUD

### 12.1 Escritorio 1440×900
```
x:0   16                    312        560                880                     1240        1424 1440
y:16  ┌─ Jugador 296×88 ─────┐           ┌─ Objetivo 320×72 ─┐                     ┌─ Oro 184×40 ─┐
      │[⛵56] Capitán   Balandra│          │[☠40] Barbarroja    │                     │ ◉ 12 450  48ms│
      │ ███████████░░ 640/800 │          │ Pirata · hostil    │                     └──────────────┘
      │ ⚔ Atacando · 2,1 s    │          │ ██████░░  48 m ✓En │                     ┌─ Minimapa ───┐ y:64
y:104 └───────────────────────┘           └────────────────────┘                     │  184×184 (P1)│
                                     y:96 ┌ Toast / Zona segura 360×36 ┐            │              │
                                          └────────────────────────────┘            ├──────────────┤ y:248
                                                                                     │Sector E5 · X…│ pie 24 px (D39)
                                                                                     └──────────────┘ y:272
                     ··· círculo de alcance R (r 403 × 330 px con cualquier R: manda el eje vertical) ···
                                         ⛵ (centro 720, 450)

y:772 ┌─ Feed (P1) 360×112 ──┐            ┌──── Acciones 336×76 ────┐
      │ Hundiste a Pirata +120│     y:808  │ [Espacio][R][Tab][S][P] │                   (sin botones extra)
      │ ...                   │            │  Atacar Reparar Obj Det Puerto              │
      └───────────────────────┘            └─────────────────────────┘ x:552–888
```

| Bloque | x, y, w, h (px) | Contenido |
|---|---|---|
| Panel del jugador | 16, 16, 296, 88 | Icono de clase 56 px (silueta sobre un aro dorado), nombre (15/600), clase (13 `--ui-text-dim`), barra de vida 200×14 (`--ui-ok`, números 12 px tabulares dentro a la derecha) y línea de estado (§12.4) |
| Panel del objetivo | 560, 16, 320, 72 | Solo con objetivo. Icono de relación 40 px, nombre en su color, "Tipo · actitud", barra 220×10 en el color de la relación, distancia "48 m" y estado "✓ En alcance" (`--ui-ok`) o "✕ Fuera de alcance" (`--ui-text-dim`). Botón ✕ de 24 px (Esc) |
| Oro + ping | 1240, 16, 184, 40 | Moneda `--ui-gold` + total (16/600 tabular). Al ganar, "+120" que sube 16 px en 800 ms. El ping solo aparece si es > 200 ms (`--ui-gold`) |
| Minimapa (P1) | 1240, 64, 184, **208**: mapa de 184 × 184 arriba y pie de 24 px (D39) | Fondo `ocean.deep` al 90 %, islas `sand`, zona segura discontinua, rectángulo de la vista (1 px blanco al 60 %) y entidades con la forma de §4.3. Canvas 2D a ≤ 2 Hz (AC-77). El mapa no cambia de tamaño (AD-29) |
| Coordenadas | **Dentro del pie del minimapa** (D39): 1240, 248, 184, 24, separado del mapa por una línea de 1 px `--ui-line` | "Sector E5 · X 12 Z −40" (12 px tabular `--ui-text-dim`, centrado y sin `text-shadow`). Va sobre el fondo del panel (contraste 5,7:1 en el peor fondo, §4.5). Antes flotaba sin fondo en y = 252 y se mezclaba con las placas que pasaban por debajo (O-4). Como en Seafight, el sector va en el marco de la carta (R1). En móvil sigue oculto |
| Toast / aviso de zona | 540, 96, 360, 36; el 2.º en 540, 140 (se apilan ≤ 3 hacia abajo con 8 px de separación). Área de texto 356 × 36, sin recortar (verificado en e2e, b5dc2c1) | §12.5 |
| Feed (P1) | 16, 772, 360, 112 | 4 líneas de 24 px, 13 px; cada una dura 5 s y se desvanece en 300 ms (AC-78) |
| Barra de acciones | 552, 808, 336, 76 | 5 ranuras de 56×56 con 8 px de separación y 12 px de padding: **Atacar (Espacio) · Reparar (R) · Objetivo (Tab) · Detener (S) · Puerto (P)** |
| Pistas de primera sesión (P1) | Centradas, ≤ 420 × 41. **Ranura normal**: borde inferior en y = 752 (`bottom: 148px`), así que la esquina superior queda en ≈ 712. Pista 0 con ratón («Haz clic en el agua para navegar»): 588, 712, 264 × 41 en la normal y 588, 140 en la alta (e2e en el proyecto de escritorio). Anchos con ratón: pista 0 264 px, pista 1 311 y pista 2 367 (x 536–903). **Ranura alta** y = 140 (la pista 2 queda en y 140–181, sin tocar el panel del objetivo, y 16–88), justo bajo el aviso 1 (96 + 36 + 8): se usa si la normal está ocupada. **Si la ranura normal está libre, la pista se queda en ella con 0, 1 o 2 avisos. Si está ocupada, sube a la alta con 1 aviso y se oculta con 2**, porque el 2.º aviso ocupa la alta. Esquiva placas, avisos, el botón Centrar y los chips de borde (AC-110; verificado en e2e, b5dc2c1) | Texto 15 px sobre `--ui-panel` con una flecha hacia el elemento. Texto según la entrada: "Haz clic en el agua…" con ratón y "Toca el agua…" con pantalla táctil |

**Ranura de acción**: fondo `--ui-panel`, borde 1 px `--ui-line`, radio 8. Icono de 28 px, tecla arriba a la izquierda (11 px `--ui-text-dim`) y etiqueta debajo (11 px). La recarga se dibuja con una capa `conic-gradient` al 65 % que barre en sentido horario y se actualiza por ref, no por React. Estados: deshabilitada (icono al 40 % + `title` con el motivo), **activa** (fondo `--ui-gold` al 20 % + borde 2 px `--ui-gold`) y **pulso** (Reparar con vida < 30 %: borde `--ui-danger` 1 Hz + ⚠, AC-41). Puerto deshabilitado fuera de la zona, con `title` = "Solo en la zona segura" (AC-66).

### 12.2 Móvil vertical 390×844
```
x:0                                                        390
y:0  ┌──── Barra superior 390×52 ────────────────────────────┐
     │[⛵36] ██████████░░ 640/800      ◉ 455      [≡ 44×44]  │
y:52 └───────────────────────────────────────────────────────┘
y:60 ┌─ Objetivo 262×48 ───────────────┐ ┌ Mini 88 ┐
     │☠ Barbarroja ████░ 48 m ✓        │ │  (P1)   │
y:108└─────────────────────────────────┘ └─────────┘ y:148
y:156      ┌ Toast / Zona segura 358×36 ┐
           └────────────────────────────┘
          ··· círculo de alcance R (r 183 × 150 px con cualquier R: manda el ancho) ···
                              ⛵ (195, 422)
                                                   ┌Rep 52┐ y:684
                                                   └──────┘
     ┌Puerto┐                       ┌Obj 52┐  ┌ ATACAR 72 ┐ y:756
y:776└──52──┘                       └──────┘  └───────────┘ y:828
```

| Bloque | x, y, w, h (px; y relativa a `env(safe-area-inset-top)` arriba y a `safe-area-inset-bottom` abajo) |
|---|---|
| Barra superior | 0, 0, 390, 52 — icono 36, barra 150×10, números 12 px, oro 14/600, menú 44×44 (P2) |
| Objetivo | 16, 60, 262, 48 |
| Minimapa (P1) | 286, 60, 88, 88. Al tocarlo se amplía a 300×300 en un modal |
| Toasts y aviso de zona | 16, 156, 358, 36 (texto 354 × 36); el 2.º en 16, 200. Empiezan por debajo del minimapa, que acaba en y = 148 (D10: con y = 116 se solapaban) |
| Pista de primera sesión (P1) | Ranura normal 16, 604, 358 × 41; ranura alta 16, 200, 358 × 41, justo bajo el aviso 1 (156 + 36 + 8). El 2.º aviso cae en 16, 200; si la ranura normal también está ocupada, la pista se oculta (con la normal libre se queda en ella) (AC-110; b5dc2c1) |
| **Atacar** | 302, 756, 72, 72 (≥ 64, AC-80). Anillo de recarga de 4 px en el borde |
| **Objetivo** | 234, 776, 52, 52 |
| **Reparar** | 322, 684, 52, 52 |
| **Puerto** | 16, 776, 52, 52 |
| Feed | Oculto: los eventos van como toasts |

Los botones táctiles miden ≥ 48×48 px y están separados ≥ 8 px. Ninguno se solapa con el panel ni con el minimapa (AC-80).

### 12.3 Móvil horizontal 844×390
La columna izquierda (x 12–264) tiene la barra de vida 252×44 y debajo el objetivo 252×48. La derecha (x 580–832) tiene el oro y el minimapa de 72×72 arriba y los botones abajo: Atacar 72×72 en (748, 306), Objetivo y Reparar de 52 en (684, 326) y (768, 238), y Puerto en (12, 326). El centro queda libre para el juego. El círculo de alcance R puede pasar por debajo de las esquinas (AC-24 solo exige 1440×900 y 390×844). **Avisos**: 272, 12, 300 × 36 (texto 296 × 36); el 2.º en 272, 56, entre la columna izquierda (≤ 264) y la derecha (≥ 580). **Pista**: ranura normal en y = 338 y ranura alta en y = 64, justo bajo el aviso 1 (12 + 36 + 8), con la misma regla que en §12.1: si la normal está libre, la pista se queda en ella; si está ocupada, sube con 1 aviso y se oculta con 2, centradas. Anchos táctiles: pista 0 («Toca el agua para navegar») 226 px, pista 1 273 y pista 2 300 (x 272–572, a 8 px de las dos columnas). Aquí el ancho máximo de la pista es **300 px**, el hueco entre columnas; hoy lo cumplen las 3 pistas sin variante corta. La esquiva dinámica no cuenta los paneles del objetivo ni del oro como obstáculo, así que **el e2e de AC-110 recorre las 3 pistas en 844×390 contra las dos columnas** (D30). Una pista nueva de más de 300 px necesita una variante corta (AC-110; b5dc2c1).

### 12.4 Estados del HUD
| Estado (GDD §7–8) | Línea del panel del jugador | Ranura Atacar | Placa propia |
|---|---|---|---|
| Inactivo | "Listo" `--ui-text-dim` | Normal | — |
| Armado, fuera de alcance | "⚔ Fuera de alcance" `--ui-text-dim` | Activa con borde discontinuo | Recarga visible |
| Disparando | "⚔ Atacando · 2,1 s" | Activa; destello dorado de 150 ms en cada andanada | Recarga en curso |
| Reparando | "🔧 Reparando +4 %/s" (bajo fuego: "+1,5 %/s" `--ui-gold`) | — | Icono de llave |
| Vida < 30 % | Borde del panel `--ui-danger` 1 Hz + "⚠ Vida baja" | Reparar pulsa | Barra pulsa |
| Hundido | HUD al 40 %, sin interacción | Deshabilitada | Oculta |
| Protegido | "🛡 Protegido 12 s" `#BDEBFF` | Normal (atacar quita la protección) | Escudo + s |
| En zona segura | Aviso "🛡 Zona segura" fijo bajo el objetivo (`--ui-info`) | Puerto habilitado | — |
| Progreso sin guardar (AC-132; D50; solo con cuenta) | Sin cambios: el aviso va en la columna de avisos (§12.5) | Normal (se sigue combatiendo). **Puerto deshabilitado**, con `title` = «La tienda no está disponible: no podemos guardar» | — |

### 12.5 Toasts (sustituyen a `alert`)
Fondo `--ui-panel`, borde izquierdo de 4 px según el tipo (info `--ui-info`, éxito `--ui-ok`, aviso `--ui-gold`, peligro `--ui-danger`), icono 16 px + texto 14 px. Duran 3,5 s; como máximo se ven 3 (el más viejo sale). `role="status"` y `aria-live="polite"`. **Seleccionar un objetivo no genera toast ni diálogo**: solo actualiza el anillo y el panel.

**Aviso del Capitán (I2; D49)**: «¡Capitán pirata en el {región}, sector {celda}!». La región es el cuadrante de su guarida (GDD §9): noreste, noroeste, suroeste o sureste. La celda es `sectorOf(guarida)`, la misma función que usa el pie del minimapa, para que los dos textos no puedan divergir. **En pantalla, «sector» solo nombra la celda de la rejilla** A–J × 1–10 (§7.4, pie del minimapa). Los cuadrantes del GDD nunca se muestran como «sector NE» ni con su abreviatura. El aviso cabe en una línea en 1440×900 y en 390×844. En 844×390 también cabe sin el icono de 16 px, como están hoy los toasts genéricos; con el icono puede ocupar 2 líneas: la caja crece (`min-height`) y no recorta.

**Aviso persistente de guardado (AC-132; D50)**: «Progreso sin guardar, reintentando…» con el icono `cloud-off` de 16 px en `--ui-gold` y el borde izquierdo de tipo aviso (`--ui-gold`). Va **el primero de la columna de avisos**, por encima de «Zona segura» y de los toasts: 540, 96 en 1440×900; 16, 156 en 390×844; 272, 12 en 844×390. Como «Zona segura», no caduca, no cuenta en el máximo de 3 toasts ni sale por cupo, y es un bloque del HUD (`data-hud-block`, D41) que cuenta para la regla de la pista. Ocupa una línea en los tres tamaños: el texto mide 224 px, y con el icono, 248. Lo ven todos los jugadores con cuenta mientras la BD siga caída, tengan o no cambios pendientes. Los invitados no lo ven y su Puerto sigue habilitado, porque no escriben en la BD (AC-132). Aparece en el mismo commit en que llega el estado del servidor y se queda **al menos 3 s**, para que un corte de un instante no parpadee. **Al volver la BD**, cuando el servidor confirma la escritura, se quita sin fundido y sale un toast de éxito «Progreso guardado» (3,5 s), que cierra el ciclo. El toast entra en la pila de toasts, detrás de «Zona segura», y no en el hueco del aviso: los avisos persistentes siempre van delante (D55). Ese mismo commit rehabilita Puerto. Mientras dure el corte, pulsar Puerto o la tecla P no abre la tienda y saca un toast de peligro «La tienda no está disponible: no podemos guardar» (el texto de AC-132). Vale dentro y fuera de la zona segura: el corte manda sobre «Solo en la zona segura» (AC-66), en el toast y en el `title`, porque ese aviso mandaría al jugador a navegar hasta el puerto para nada (D55). En móvil, el `title` no se ve.

### 12.6 Capas (z-index)
canvas 0 · placas 10 · números de daño 15 · HUD 20 · toasts 30 · modal (tienda, muerte, desconexión) 40.

### 12.7 Cursor (escritorio)
Sobre el agua: flecha por defecto. Sobre un barco atacable: mira SVG de 32 px (coral, punto caliente en el centro). Sobre un barco no atacable (zona segura o protegido): `not-allowed`.

### 12.8 Vista libre e indicadores de borde (I2; GDD §5, AC-119, AC-121 y AC-124)
| Elemento | Escritorio 1440×900 | Móvil vertical 390×844 | Móvil horizontal 844×390 |
|---|---|---|---|
| **Botón Centrar** (solo en vista libre; aparece con un fundido de 150 ms) | 1240, 280, 184, 40 (D39: 8 px bajo el pie del minimapa, que acaba en y = 272), junto al minimapa con el que se mueve la vista: icono Lucide `locate-fixed` + "Centrar" + tecla `C` | 322, 616, 52, 52, encima de Reparar (684) con 16 px de separación: solo el icono | 704, 238, 52, 52, a la izquierda de Reparar (768, 238) |
| **Indicador del barco propio** (solo si el barco propio queda fuera de la pantalla, con 24 px de margen) | Chip circular de 44 px | 48 px (se puede tocar) | 48 px |

**Indicador**: círculo `--ui-panel` con borde de 2 px `--rel-self` (`#FFD166`), una estrella de 18 px en el centro, un triángulo de 10 px fuera del círculo que apunta hacia el barco y debajo la distancia ("320 m", 12 px tabular). **Posición**: sobre el rayo que va del centro de la pantalla a la proyección del barco, recortado contra el marco útil (escritorio: 16 px a los lados, 120 arriba y 108 abajo; móvil vertical: 12 / 116 / 104). Si cae sobre un bloque del HUD (minimapa, paneles, botones), se desliza por el marco hasta el punto libre más cercano. **Ángulo**: el triángulo apunta desde la posición **real** del chip hacia el barco (no desde el centro), así que no hay error aunque el chip se haya deslizado (AC-121: ≤ 10°). Se mueve por ref en cada frame, fuera de React (GDD §13). Al pulsarlo se centra como con `C`. Desaparece en 150 ms cuando el barco vuelve a verse.

**Indicador de atacante (AC-124; D26).** Usa el mismo componente de chip que el del barco propio, con estas diferencias:

| Campo | Indicador del barco propio (AC-121) | Indicador de atacante (AC-124) |
|---|---|---|
| Cuándo | Vista libre con el barco propio fuera de pantalla | Un barco fuera de pantalla te dispara (evento `volley` con `targetId` = tú). Dura mientras siga atacando y **3 s** después del último disparo; luego se desvanece en 300 ms |
| Rayo | Del centro de la pantalla a tu barco | De tu barco (que en seguimiento está en el centro) al atacante |
| Forma, borde y color | **Círculo** de 44/48 px, borde de 2 px `--rel-self` (`#FFD166`) | **Rombo de esquinas redondeadas** (cuadrado girado 45°, radio 6) del mismo tamaño, borde de 3 px del color de la relación del atacante (§4.3: coral `#FF7A7A` para hostiles; hueso `#F5F1E6` para jugadores en PvP). La forma y el icono distinguen los dos chips también en grises y con daltonismo (D27) |
| Icono | Estrella | El de la relación: calavera, calavera + bomba, calavera + corona o ancla |
| Al recibir un impacto | — | Late una vez: escala 1,0 → 1,15 → 1,0 en 180 ms |
| Al pulsarlo | Centra | Selecciona al atacante como objetivo (como Tab sobre él), sin mover la cámara |
| Cuántos | 1 | Hasta 3 a la vez (los 3 más cercanos); el resto se agrupa en el 3.º con un número «+2» |

Si dos chips quedan a menos de 52 px por el borde, el más lejano se desliza por el marco hasta separarse. El ángulo siempre se calcula desde la posición real de cada chip (≤ 10°). Caso de diseño: PvP con un jugador N3 a 80 m contra un N1 con R = 65 m; queda fuera arriba o abajo y el chip señala desde dónde llegan las balas.

**Convivencia con la pista de primera sesión** (D27): en 390×844, el botón Centrar (322, 616, 52×52) se cruza con la ranura normal de la pista (16, 604, 358×41) en 1 508 px² (medido por `game-product`). El botón no se mueve: según AC-110, la pista esquiva el botón Centrar y los chips de borde, igual que ya esquiva placas y avisos.

---

## 13. Tipografía e iconos

| Uso | Familia (Google Fonts vía `next/font/google`, `display: swap`, subsets `latin` + `latin-ext`) | Peso | Escritorio / móvil |
|---|---|---|---|
| Logo y títulos de pantalla | **Pirata One**: gótica legible, evoca los títulos de Seafight (R12) | 400 | 88/52 (logo), 48/36 (títulos) |
| Títulos de panel (tienda, muerte) | Pirata One | 400 | 28/24 |
| Texto de UI y botones | **Barlow** | 500 / 600 | 14–16 / 14–15 |
| Números del HUD | Barlow con `font-variant-numeric: tabular-nums` | 600 | 12–16 |
| Etiquetas en el mundo y números de daño | **Barlow Semi Condensed**: condensada, para que quepan 16 caracteres | 600 / 700 | 12 / 11 (etiquetas) |

Reglas: Pirata One **nunca** por debajo de 20 px ni en texto corrido. Mínimo absoluto de 11 px.

**Iconos**: SVG de línea de 24×24, trazo de 2 px y `currentColor`. Se copian de [Lucide](https://lucide.dev) (licencia ISC) a un módulo propio, sin dependencia en tiempo de ejecución: `anchor`, `skull`, `coins`, `star`, `crosshair`, `wrench`, `shield`, `sailboat`, `swords`, `octagon-x` (detener), `store` (puerto), `settings`, `wifi` y `cloud-off` (progreso sin guardar, D50). La corona del capitán es un SVG propio.

### 13.1 Icono de la aplicación (D54; AC-141)
**Motivo**: un barco de perfil con la proa a la derecha. Lleva el velacho, la mayor con panza y el foque en crema `#F5F1E6` (`--ui-text`, el tono de las velas del jugador) y el mástil, el gallardete, el casco con castillo de popa y el bauprés en oro `#F2C14E` (`--ui-gold`, el gallardete del jugador). Todo va sobre `#0F3F5C` (el `themeColor` y el fondo de «Conectando») con una ola `#1A5F86` (`ocean.deep`) abajo. Es el barco del jugador, no el pirata: crema y oro, como el logo y el botón «Zarpar». Los únicos colores son estos 4.

**SVG maestro** (rejilla de 32: 1 unidad = 1 px a 32 px; el mástil cae en una columna entera para que salga nítido a 32):
```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <!-- Icono de Sea Battle (D54). Rejilla de 32: 1 unidad = 1 px a 32 px = 16 px a 512. Proa a la derecha -->
  <defs><clipPath id="r"><rect width="32" height="32" rx="7"/></clipPath></defs>
  <g clip-path="url(#r)">
    <rect width="32" height="32" fill="#0F3F5C"/>
    <path d="M0 25.5 Q4 24 8 25.5 T16 25.5 T24 25.5 T32 25.5 V32 H0 Z" fill="#1A5F86"/>
    <path d="M17.5 7 L29.5 19 L22 18.5 Z" fill="#F5F1E6"/>
    <path d="M12 6 H21 Q22.2 8.5 21.5 11 H11.5 Q10.8 8.5 12 6 Z" fill="#F5F1E6"/>
    <path d="M10 12 H23 Q24.3 15 23.5 17.5 H9.5 Q8.7 15 10 12 Z" fill="#F5F1E6"/>
    <rect x="16" y="2.5" width="1" height="17" fill="#F2C14E"/>
    <path d="M16.5 2.5 L10.5 3.6 L16.5 4.7 Z" fill="#F2C14E"/>
    <path d="M4.5 17.5 H9 V19.5 H27 L29 18.6 L25 24.8 H8.5 L5 20.5 Z" fill="#F2C14E"/>
    <path d="M27.5 19 L31 16.2" stroke="#F2C14E" stroke-width="0.9" stroke-linecap="round"/>
  </g>
</svg>
```
Variantes del mismo SVG: **apple-icon**, a sangre (sin `rx`: iOS pone su propia máscara) y opaco. **Maskable**, a sangre, con el barco dentro de `<g transform="translate(16 16) scale(0.8) translate(-16 -16)">` y la ola subida a `M0 23.6 Q4 22.4 8 23.6 T16 23.6 T24 23.6 T32 23.6 V32 H0 Z`. Así todo el motivo queda dentro de la zona segura (círculo de radio 0,4).

**16 px a mano.** Reescalado, el SVG se emborrona a 16 px: el mástil y el foque se funden. Por eso el 16 es un mapa propio, con `.` = `#0F3F5C`, `w` = `#1A5F86`, `C` = `#F5F1E6` y `G` = `#F2C14E`. Las esquinas se recortan con el alfa del rectángulo redondeado (radio de 3,5 px, supermuestreado):
```
................
........G.......
......GGG.......
......CCGCC.....
......CCGCC.....
......CCGCCC....
........G..CC...
.....CCCGCCCCC..
.....CCCGCCCCCC.
.....CCCGCCCCCC.
..GG....G......G
..GGGGGGGGGGGGG.
...GGGGGGGGGGG..
....GGGGGGGGG...
wwwwwwwwwwwwwwww
wwwwwwwwwwwwwwww
```

| Archivo (App Router) | Tamaño | Origen |
|---|---|---|
| `src/app/favicon.ico` | Entradas PNG de 16 y 32 | El 16, del mapa; el 32, del SVG |
| `src/app/icon1.png` · `icon2.png` · `icon3.png` · `icon4.png` | 16 · 32 · 192 · 512 | El 16, del mapa; el resto, del SVG |
| `src/app/apple-icon.png` | 180 | Variante a sangre, opaca |
| `src/app/manifest.ts` | — | `name` y `short_name` «Sea Battle», la `description` de `metadata`, `start_url` `/`, `display` `standalone`, `background_color` `#06111A` (la base de la landing), `theme_color` `#0F3F5C` (el mismo `themeColor` del viewport) e `icons`: `/icons/icon-192.png` y `/icons/icon-512.png` (`any`) más `/icons/icon-maskable-512.png` (`maskable`), en `public/icons/` para que tengan rutas fijas |

Sin `icon.svg` servido: si el `<head>` ofrece un SVG, el navegador puede usarlo para la pestaña de 16 px y sale el reescalado borroso. Los PNG y el ICO se generan con un script de Playwright, como `qa:hero`, a partir de los SVG y del mapa, y se versionan. Se borran el `favicon.ico` de create-next-app y los 5 SVG de la plantilla en `public/` (AC-141 b). Las referencias (renders de Chromium) están en `qa-artifacts/render/d54-icono/ref-*.png`. Lo verifica AD-36.

---

## 14. Tienda (Puerto)

Se abre con `P` o con el botón, solo dentro de la zona segura (GDD §11). El barco y el mundo siguen vivos detrás.

| Elemento | Escritorio | Móvil |
|---|---|---|
| Velo | `--ui-scrim` (55 %) + `backdrop-filter: blur(3px)`; sin blur si no hay soporte | Igual |
| Panel | Modal centrado de 880×580, radio 12 | Hoja inferior de 390 × 82 % de alto, radio 16 arriba, asa de 36×4 |
| Marco | Borde de 6 px `--wood` + filete interior de 1 px `#C9A24B` | Borde superior de 4 px `--wood` |
| Fondo | `--paper` | `--paper` |
| Cabecera (64 px) | "Astillero del Puerto" en Pirata One 28 `--ink-title` · ficha de oro (fondo `--ui-gold`, texto `--ink`, "◉ 12 450") · cerrar ✕ 44×44 | Igual, título a 24 |
| Pestañas | **Mejoras** · **Barcos** (P1, GDD §11) (15/600; la activa con subrayado de 3 px `--ink-title`). Sin la pestaña Barcos, la rejilla de mejoras ocupa todo el panel. La reparación no está en la tienda: es R en el mar y es gratis (GDD §8) | Igual |
| Rejilla | Tarjetas de 404×128 en 2 columnas con 16 px de separación | 1 columna de 358×128 |

**Tarjeta de mejora** (Cañones, Casco y Velas, 3 niveles cada una; GDD §7 y §11):
```
┌────────────────────────────────────────────────────────────┐ fondo --paper-card · borde 1 px --paper-line · radio 8
│ [icono 64]  Cañones                         ●●○  Nivel 2/3 │ título 18/600 --ink · niveles: lleno --ui-gold-lo, vacío --paper-line
│             Daño 38 → 48 · Alcance 70 → 80 m · Recarga 3,5 → 3,0 s │ 13 --ink-soft; las mejoras en negrita
│                                   [ ◉ 1 500 ]  [  Mejorar  ] │ ficha de precio + botón de 132×40
└────────────────────────────────────────────────────────────┘
```

| Estado | Botón | Texto adicional |
|---|---|---|
| Se puede pagar | `--btn-primary` "Mejorar" | — |
| Oro insuficiente | `--btn-disabled` | "Te faltan 420" en `#A23B2A`, 13 px |
| Nivel anterior pendiente | `--btn-disabled` | "Requiere nivel 2" |
| Máximo | Sin botón | Sello "Máximo" con borde de 2 px `--ui-gold-lo` |
| Tras comprar | Borde dorado de 300 ms + toast de éxito + el oro baja con una animación de 400 ms | — |

**Tarjeta de barco**: silueta de perfil (SVG) + vida, velocidad, cañones y precio. Botones "Comprar" (`--btn-primary`), "Usar" (secundario: borde de 1,5 px `--btn-primary`) o el sello "En uso".

**Guardado no disponible** (AC-132; D50). La tienda no se abre durante un corte de la BD (§12.5). Si ya estaba abierta cuando llega el corte, no se cierra sola: bajo las pestañas aparece una franja de 40 px en `--paper-card` con el icono `cloud-off` y «La tienda no está disponible: no podemos guardar» en `#A23B2A`, 14 px (el rojo de «Te faltan 420»). Todos los botones «Mejorar», «Comprar» y «Usar» pasan a `--btn-disabled`. Al volver la BD, la franja desaparece y los botones recuperan su estado en el mismo commit.

---

## 15. Muerte y reaparición (GDD §12)

| t desde la muerte | Qué se ve |
|---|---|
| 0 s | Hundimiento (VFX-SPEC §7). La placa propia se desvanece en 300 ms y el HUD baja al 40 % sin interacción. La cámara sigue los restos |
| 0,3 s | `filter: saturate(0.35) brightness(0.85)` sobre el canvas (600 ms) + viñeta `radial-gradient(transparent 40%, rgba(6,17,26,.7))` |
| 1,2 s | Entra la tarjeta (200 ms, de 0,96 a 1,0 de escala) |
| 8 s | El botón **Zarpar** se activa (borde dorado con un pulso de 1 Hz). No hay reaparición automática |
| Al pulsar Zarpar | Se quitan el filtro y la viñeta (300 ms), la cámara salta al punto de reaparición y aparecen las ondas de reaparición y el brillo de protección (VFX-SPEC §12) |

```
┌──────────── 440×300 (móvil 358×300) ────────────┐  fondo rgba(6,17,26,.88) · borde 1 px --ui-line · radio 12
│                    Hundido                      │  Pirata One 48 (móvil 40) --ui-text
│             por ☠ Barbarroja                    │  16/600, color de la relación del atacante
│                  −45 oro                        │  20/600 --ui-danger, con icono de moneda
│                   ( 5 )                         │  anillo de 64 px, trazo de 4 px --ui-gold, número 24/600
│              [   Zarpar   ]                     │  220×48 · desactivado: --btn-disabled "Zarpar en 5 s"
└─────────────────────────────────────────────────┘
```

---

## 16. Landing, acceso, "Conectando" y "Desconectado"

### 16.1 Landing (`/`)
| Elemento | Escritorio 1440×900 | Móvil 390×844 |
|---|---|---|
| Fondo | Captura del motor en WebP de 1920×1080, ≤ 220 KB: cámara de presentación (elevación 40°, **`ppm = 1,6 · ppm₀(R = 80 m)` calculado para el viewport de la captura**: 10,25 px/m en 1920×1080 y 3,90 en 414×896, `scripts/qa-hero.mjs:22-24`). No cambia con U8, así se conserva la composición aprobada en D14 (D28, corregido en D29), una Fragata y un pirata intercambiando andanadas con humo y una isla con palmeras en una esquina. Se genera con `npm run qa:hero`. `priority` (LCP). **Estado: provisional** (D14). El peso vigente es el del último `qa:hero` (la columna fija los topes: ≤ 220 KB y ≤ 120 KB). Para aceptarla como definitiva hay que regenerarla tras D22, porque el pirata de la portada está al 22 % de vida y le afectan el humo y las llamas nuevas. Además debe cumplir VFX-21 (humo de andanada) sin líneas de rejilla falsas | Recorte vertical de 828×1792, ≤ 120 KB |
| Velo | `linear-gradient(180deg, rgba(6,17,26,.15) 0%, rgba(6,17,26,.55) 60%, #06111A 100%)` | Igual |
| Logo | "Sea Battle" en Pirata One 88 `--ui-gold` con `text-shadow: 0 3px 0 #6B3A1A, 0 8px 24px rgba(0,0,0,.5)`, alineado a la izquierda en x = 120, centrado en vertical | 52 px, centrado, y = 30 % |
| Lema | Barlow 22/500 `--ui-text`, máx. 520 px: "Navega, hunde piratas y conviértete en el terror de los mares." | 17 px, máx. 342 px |
| CTA | **"Zarpar"** 240×56, radio 8, fondo `--ui-gold`, texto `--ink` 18/700. *Hover* `--ui-gold-hi` y −1 px en Y | 358×56, fijo abajo (16 px + `safe-area`) |
| Secundario | "Jugar como invitado", solo con `AUTH_BYPASS=1` (AC-10): botón fantasma con borde de 1 px `--ui-text` al 66 % | Debajo del CTA |
| Mensaje de servidor lleno (AC-12) | Toast de peligro sobre el CTA: "Servidor lleno. Inténtalo en unos minutos." | Igual |
| Bajo el pliegue | Franja `--wood-dark` con 3 tarjetas de 320×220 (**Navega**, **Combate**, **Mejora**), cada una con una captura del motor de 320×160 y 2 líneas de texto | Tarjetas apiladas de 358 de ancho |
| Prohibido | Imágenes externas de stock y WebGL en la landing | — |

### 16.2 "Conectando" y "Desconectado"
- **Conectando**: fondo `linear-gradient(#0F3F5C, #1A5F86)` (nunca negro), rosa de los vientos SVG de 64 px girando a 1 vuelta cada 2 s y "Izando velas…" en 16 px.
- **Desconectado** (AC-99): modal sobre el juego con velo `--ui-scrim`, tarjeta de 400×220 con el título "Sin conexión" en Pirata One 32, "Reintentando (2/3)…" y, tras el 3.er intento, los botones "Reintentar" (primario) y "Salir" (secundario).
- **Un solo componente para todos los estados** (D50): la tarjeta `.offline` de 400 px de ancho (`calc(100vw − 32px)` en móvil, 358 en 390×844) y ≥ 220 px de alto. Lleva título en Pirata One 32, texto de 16 px `--ui-text`, una línea de detalle opcional de 14 px `--ui-text-dim` y los botones. El texto se parte en líneas y nunca se recorta. En pantallas táctiles (`pointer: coarse`) y con los cortes móviles del HUD (≤ 699,98 px de ancho o ≤ 499,98 px de alto), los botones miden ≥ 48 px de alto, como los del HUD (§12.2). Los cortes se añaden en D55 porque Chromium da `pointer: coarse` de forma inestable en el contexto táctil de Playwright, y en una pantalla pequeña un botón más alto no estorba. Al abrirse, el foco va al primario (o a «Salir» si es el único), así que Enter funciona sin buscarlo. Los textos son los de cada AC:

| Estado (`data-state`) | Fondo | Título | Texto | Detalle | Botones |
|---|---|---|---|---|---|
| Reconectando, `reconnecting` (AC-99; D55: decía `disconnected`) | Juego + `--ui-scrim` | Sin conexión | «Reintentando (2/3)…» | — | — |
| Sin reconexión, `failed` (AC-99, AC-126) | Juego + `--ui-scrim` | Sin conexión | «No pudimos reconectar con el servidor.» | «El servidor no responde. Vuelve a intentarlo en unos segundos», solo si «Salir» no llega al servidor (AC-126) | Reintentar · Salir |
| **Progreso no disponible**, `load-failed` (AC-131) | **El de «Conectando», sin velo y sin la rosa**: el jugador no entra al mundo y no hay juego detrás | Progreso no disponible | «No podemos cargar tu progreso ahora mismo» | «Lo que tenías guardado sigue intacto.» Tras un reintento fallido: «Sigue sin responder. Prueba de nuevo en unos segundos.» | Reintentar · Salir |
| **Otra pestaña**, `kicked` (AC-133) | Juego + `--ui-scrim` (congelado) | Sesión en otra pestaña | «Has abierto el juego en otra pestaña» | «Tu barco sigue en la otra: solo hay uno por cuenta.» | Salir (sin reintentos) |
| Sesión no válida, `unauthorized` | Juego + `--ui-scrim` | Sesión no válida | «Vuelve a iniciar sesión para seguir jugando.» | — | Salir |

«Reintentar» en el estado de AC-131 lanza un solo intento a la vez, como «Salir» en AC-126 e. Mientras espera, dice «Reintentando…» y lleva `aria-busy` y `aria-disabled="true"`, sin el atributo `disabled`: así conserva el foco, y los clics de más no lanzan otro intento (D55). Su aspecto: fondo `--btn-primary` al 60 % (solo el fondo), texto `--ui-text` pleno (8,2:1) y `cursor: progress`. No se usa `--btn-disabled`, que es un token del pergamino: sobre la tarjeta oscura parece un botón claro activo, y su texto da 3,2:1. Si el intento falla, se vuelve a habilitar y cambia el detalle; si sale bien, entra al mundo con su progreso. «Salir» usa el sondeo de AC-126.

### 16.3 Inicio de sesión y registro (`/sign-in`, `/sign-up`; D53)
Son la puerta entre la landing y el juego, así que se ven como ellas: el mismo fondo, la tarjeta oscura de los overlays de §16.2 y el botón dorado de «Zarpar». Los componentes son los de Clerk (`<SignIn />` y `<SignUp />`). El aspecto se fija con su `appearance` y los textos con su `localization`, los dos en el `ClerkProvider` de `layout.tsx`, para que cualquier componente de Clerk salga igual. Solo hay usuario y contraseña (GDD Q13).

| Elemento | Escritorio 1440×900 | Móvil 390×844 | Móvil horizontal 844×390 |
|---|---|---|---|
| Fondo | El de la landing (§16.1): `.landing__bg` (degradado radial y captura del motor, la de móvil en móvil) más `.landing__veil`. **Nunca** el azul plano del `body` (`#0F3F5C`) | Igual | Igual |
| Composición | Rejilla de 3 filas, `minmax(max-content, 1fr) auto minmax(max-content, 1fr)`, centrada en horizontal, con `min-height: 100dvh` y 16 px de relleno (más `safe-area`). Fila 1: el logo, pegado abajo y a 24 px de la tarjeta. Fila 2: la tarjeta. Fila 3: el enlace de vuelta, a 16 px de la tarjeta. Las dos filas exteriores reparten el sitio a partes iguales, así que la tarjeta queda en el centro exacto | Igual | Con < 560 px de alto, la tarjeta no cabe (≥ 384 px): **sin logo**, la tarjeta arranca a 16 px del borde superior y la página hace scroll vertical, nunca horizontal |
| Logo | «Sea Battle» en Pirata One 48, `--ui-gold`, con la sombra de la landing. Es un enlace a `/` (`aria-label` «Sea Battle: volver a la portada») | 36 px | Oculto |
| Tarjeta (`.cl-cardBox`) | 400 px de ancho, radio 12, fondo **sólido** `#0B1A24` (el de `--ui-panel` sin alfa, para que el contraste no dependa de la foto), borde de 1 px `--ui-line` y sombra `0 8px 24px rgba(0,0,0,.5)`. El pie de Clerk lleva el mismo fondo, sin su degradado claro | `calc(100vw − 32px)`: 358 px | 400 px |
| Título y subtítulo | Título en Pirata One 28 `--ui-gold` (títulos de panel, §13). Subtítulo en Barlow 500 15 `--ui-text-dim` | Título a 24 | Igual que en móvil |
| Campos | 44 px de alto, texto de 16 px `--ui-text` sobre `#06111A` y borde de 1 px `#6A7983` (`--ui-text-dim` al 60 %: 3,9:1; `--ui-line` daría 2,3:1, por debajo del 3:1 de un borde de control). Con foco: anillo de 2 px `--ui-gold`. Etiqueta en Barlow 600 14 `--ui-text` | Igual (los 16 px evitan el zoom de iOS al enfocar) | Igual |
| Botón primario | 44 px de alto, fondo `--ui-gold`, texto `--ink` en Barlow 700 16; *hover* `--ui-gold-hi`, como «Zarpar» | Igual | Igual |
| Enlaces y errores | Enlaces («Regístrate», «Inicia sesión») en `--ui-gold`, 600. Errores en `--ui-danger` | Igual | Igual |
| Enlace de vuelta | «← Volver a la portada», en Barlow 600 15 `--ui-text`, subrayado al pasar el ratón y con foco; caja ≥ 44 px de alto; va a `/` | Igual | Bajo la tarjeta, se llega con scroll |

**`appearance.variables` de Clerk** (los nombres de `@clerk/nextjs` 6.32): `colorPrimary #F2C14E` · `colorTextOnPrimaryBackground #2B1D0E` · `colorBackground #0B1A24` · `colorText #F5F1E6` · `colorTextSecondary #A9B8C2` · `colorInputBackground #06111A` · `colorInputText #F5F1E6` · `colorDanger #FF7A7A` · `colorSuccess #3DDC97` · `colorNeutral #F5F1E6` · `fontFamily` y `fontFamilyButtons` = `var(--font-ui), system-ui, sans-serif` · `fontSize 15px` · `borderRadius 8px`. Lo demás (el título en Pirata One, el alto de 44 px, el borde y el foco de los campos, el pie) va en `appearance.elements`.

**Textos** (Q8, solo español): la localización `esES` de `@clerk/localizations` (dependencia aprobada por el lead, en la versión cuya línea casa con `@clerk/nextjs` 6.32 y `@clerk/shared` 3.x, el mismo criterio que `@clerk/testing` 1.14.10; la fija dev-render con `npm ls`), con estas claves sobrescritas, porque `esES` mezcla «tú» y «usted» («Regístrese», «Introduzca su contraseña») y el juego habla de tú:

| Clave | Texto |
|---|---|
| `signIn.start.title` / `subtitle` | «Inicia sesión» / «Entra con tu usuario para zarpar» |
| `signIn.start.actionText` / `actionLink` | «¿No tienes cuenta?» / «Regístrate» |
| `signIn.password.title` / `subtitle` | «Escribe tu contraseña» / «para zarpar» |
| `signUp.start.title` | «Crea tu cuenta» |
| `signUp.start.subtitle` | **El aviso de Q25** (aprobado por Jonattan; AC-140 e): «Guarda tu contraseña: no se puede recuperar», en `--ui-gold` y solo en `/sign-up`. Va encima de los campos, así que se lee antes de elegir la contraseña. Mide 295 px a 15 px: una línea en escritorio (322 px de campo) y dos en móvil |
| `signUp.start.actionText` / `actionLink` | «¿Ya tienes cuenta?» / «Inicia sesión» |

El pie «Secured by Clerk» se queda. Quitarlo depende del plan de Clerk, y `esES` no lo traduce (HIPÓTESIS: no lo encontré entre sus claves). «Development mode» solo sale en la instancia de desarrollo (staging). Sin correo no hay recuperación (Q13): si en el paso de la contraseña aparece un enlace para recuperarla, es un hallazgo. Lo verifica AD-35.

---

## 17. Accesibilidad
- Ninguna información depende solo del color: icono + forma + valor (§4.3, §10).
- `prefers-reduced-motion: reduce` desactiva la sacudida de cámara, los pulsos de 1 Hz (pasan a un borde fijo) y el giro de los anillos.
- Contraste ≥ 4,5:1 en todo el texto (§4.5). Las placas aseguran el contraste sobre cualquier fondo.
- Objetivos táctiles ≥ 48×48 px; Atacar ≥ 64×64 px (AC-80).

---

## 18. Reglas verificables (QA)

Captura estándar = `npm run qa:capture` con zoom 1,0×, sin modales y el barco propio quieto en mar abierto a ≥ 60 m de cualquier isla, salvo que la regla diga otra cosa.

| Id | Regla | Medición | Umbral | AC |
|---|---|---|---|---|
| AD-01 | Color del océano en el centro | Media sRGB de un parche de 200×200 px centrado en (720, 300) en escritorio y (195, 300) en móvil, sin entidades | R 15–55, G 80–125, B 115–165 | — |
| AD-02 | El océano nunca es casi negro | Mínimo de L\* del parche de AD-01 tras un desenfoque de 4 px | L\* ≥ 24 (más claro que #0B3D5C) | — |
| AD-03 | El agua está viva | Diferencia absoluta media entre dos capturas separadas 1 s en un parche de océano | ≥ 1,5/255 y ≤ 12/255 | — |
| AD-04 | Aguas someras visibles | L\* medio de un parche de 10×10 px a 5 m de la costa de una isla | ≥ 50 | — |
| AD-05 | Cámara | Leer `camera` en e2e: `isOrthographicCamera`, ángulo de elevación y dirección de vista | Ortográfica · 55° ±0,5 · vista con componente X = 0 y Z < 0 | AC-23 |
| AD-06 | Círculo de alcance en pantalla (U8) | Dibujar en el mundo un círculo de radio R = máx(alcance del cañón propio, 65 m) para N1, N2 y N3 (65 / 70 / 80 m) y proyectarlo con el ppm₀ de cada nivel | En 1440×900 y 390×844 cabe dentro de [12, W−12] × [top, H−bottom] de §6.2, y el eje que manda toca su borde (±1 px): el vertical en escritorio y el horizontal en móvil vertical | AC-24 |
| AD-07 | Barco centrado | Proyección del origen del barco propio en 10 frames navegando | A ≤ 4 px del centro del viewport, salvo durante la sacudida (≤ 4 px más) | AC-23 |
| AD-08 | Zoom | `ppm₀ / camera.zoom` tras girar la rueda | Exactamente {0,7; 1,0; 1,5}; 0,7 = más cerca | AC-25 |
| AD-09 | Tamaño de los barcos | Ancho proyectado de lado de una Balandra con el zoom por defecto | ≥ 78 px en escritorio y ≥ 35 px en móvil | — |
| AD-10 | Facción por el valor de las velas | L\* medio de los píxeles de lona en una captura con el nivel más cercano (0,7×) y rumbo N. **Las franjas de color (`sailStripe`) no son lona y quedan fuera**: las azules del Mercante y la fila roja del Capitán (D46) | Pirata, Cañonera y Capitán ≤ 25; jugador y mercante ≥ 80; el mercante muestra franjas azules | AC-72 |
| AD-11 | Las placas no se solapan | Intersección de los `getBoundingClientRect()` de las placas visibles en 20 capturas de combate | Área de solape = 0 px²; placa propia y de objetivo siempre visibles, salvo bajo un bloque del HUD (§11.4) | AC-76 |
| AD-32 | **Las placas no se cruzan con el HUD** (O-4; D39, D41) | e2e en 1440×900 y en 390×844 con zoom 1,0×. Un barco de la escena sintética se desplaza a pasos de 4 px de pantalla por una trayectoria que lleva su placa desde 40 px fuera hasta el interior de tres bloques: el minimapa (en escritorio, también por su pie del sector), un bloque inferior (barra de acciones en escritorio; Atacar en móvil) y la columna de avisos, con el aviso «Zona segura» visible (barco propio en la zona segura). Después se aleja. En cada paso, tras 2 frames, se leen los `getBoundingClientRect()` de las placas visibles (`display` ≠ `none`, `visibility` ≠ `hidden` en la raíz y opacidad efectiva > 0, el producto de la de la raíz y la de los hijos) y de los bloques `[data-hud-block]` visibles. **Aviso que entra** (D41): con una placa quieta en la caja de la ranura de avisos, se lanza un toast y se mide en cada frame desde su primer `requestAnimationFrame`. Capturas en los dos tamaños (`qa:capture`), en pareja (D52): `under`, con la placa de un pirata a 4 px de un bloque del HUD, y `near`, con la misma placa a 24 px. El bloque es el minimapa en escritorio y, en 390×844, «Zona segura», que va bajo el minimapa y es bloque desde D41 | En todos los pasos: área de cruce entre cada placa y cada bloque = 0 px², y separación ≥ 8 px (±1 px por redondeo). En escritorio, la caja del texto del sector (`coords`) queda dentro de la del minimapa, que mide 184 × 208 (±4 px, AD-16). Al alejarse a ≥ 16 px, la placa vuelve con opacidad 1 en ≤ 250 ms. Aviso que entra: cruce = 0 px² desde el primer frame en que se pinta el aviso, y la placa vuelve en ≤ 250 ms cuando el aviso sale. Durante el hundimiento, la opacidad de la raíz sigue la de VFX-SPEC aunque la placa haya estado oculta. 0 commits de React atribuibles a las placas durante el recorrido (AD-20). Capturas (D52): en `under`, opacidad 0; en `near`, opacidad 1 y una separación de 16 a 32 px al bloque más cercano. Con 16 px, el umbral de vuelta de §11.4, la placa se ve sea cual sea su historia, y con 32 sigue junto al bloque. Es una pose fija, así que no lleva el ±1 px del recorrido. Medido en `5217c1a`: 24 px | O-4, AC-107 |
| AD-12 | Contraste de las placas | Contraste del texto frente al color compuesto de la placa sobre agua, arena y espuma | ≥ 4,5:1 (tabla §4.5) | AC-72 |
| AD-13 | Barra de vida proporcional | Ancho del relleno frente a `round(64·hp/max)` | ±1 px | — |
| AD-14 | Sin diálogos bloqueantes | `page.on('dialog')` durante una partida e2e completa (seleccionar NPC, comprar, morir) | 0 eventos | AC-26 |
| AD-15 | Tienda no negra | Opacidad del velo; color del panel; media del área de juego visible tras el velo | Velo ≤ 0,6; panel = `--paper`; el área no es #000 (media de L\* ≥ 10) | — |
| AD-16 | Layout del HUD | Cajas de §12.1–12.3 en las 3 resoluciones | ±4 px; sin intersecciones entre bloques; botones táctiles ≥ 48 px (Atacar ≥ 64) | AC-71, AC-80 |
| AD-17 | Landing propia | Peticiones de red en `/` | 0 imágenes de dominios externos; el LCP es la captura de `/public`; existe el CTA "Zarpar" | — |
| AD-18 | Secuencia de muerte | Marcas de tiempo en e2e | Tarjeta visible en t = 1,2 s ±0,2 s; Zarpar se activa en t = 8 s ±1 tick | AC-62 |
| AD-19 | Luces | Recorrer la escena | 1 `HemisphereLight` + 1 `DirectionalLight` + 0 `PointLight` y `SpotLight` | — |
| AD-20 | Las etiquetas no causan renders de React | Profiler durante 10 s navegando sin cambios de datos del HUD | 0 commits atribuibles a placas o números de daño | AC-83 |
| AD-21 | Legibilidad en grises | Capturas de AC-72 convertidas a escala de grises | ≥ 4/5 evaluadores identifican propio, jugador, pirata, mercante y objetivo | AC-72 |
| AD-22 | Recarga monótona | 5 capturas de un ciclo de recarga: ángulo del relleno del indicador | Creciente y en 360° en el frame del disparo | AC-73 |
| AD-23 | Zona segura visible | Captura en el borde de la zona (r 110 m) | La línea discontinua y ≥ 3 boyas son visibles; aparece el aviso "Zona segura" | AC-65 |
| AD-24 | Olas sin bandas regulares | Percentiles p5 y p95 de L\* en el parche de AD-01 | p95 − p5 entre 4 y 12. Medido el 2026-10-11: 16–21, son bandas. Con el ruido de 9 m y 4,5 m (D20): 8,8 (dev-render; falta QA) | — |
| AD-25 | Albedo compensado | ΔE76 entre el color medio de la tapa de la playa o de la cubierta en la captura y su token de §4.2.1. La cubierta, con tablas, se compara con la media de sus tablas (`#C9965E`; pirata `#6E4B30`; D36). **También en 390×844 con N1 (D40)**, sobre las clases que van en LOD1 (Balandra, Pirata y Mercante, ASSET-SPEC §7), con el mismo token: su cubierta es lisa | LOD0 (1440×900): ≤ 6. **LOD1 (390×844): ≤ 4**, porque es un color plano. Con la cubierta de LOD1 en `#BD8D59` daba 2,2–2,9 (`a422dd1`); con la tabla clara, 5,4–6,2 (`1a3440e`, O-8). Modelo con D40: 0,4–1,1 | — |
| AD-33 | **Sin salto de color al cambiar de LOD** (D40; O-8) | 1440×900 con N1 a 1,0×, rumbos 0°, 90° y 180°. Cada clase se mide dos veces en la misma pose, con LOD0 y con LOD1 forzado (`runtime.measureShipValues(clases, rumbos, ppm, lod)`). Por clase, se toman el L\* medio de los píxeles puros de vela y el color medio de los píxeles puros de cubierta, con **la máscara de `measureShipValues`, la misma de AD-10 y AD-25** (D44): píxeles con valor pleno en su pase de máscara, vela sin las franjas de color (`sailStripe`: las azules del Mercante y la fila roja del Capitán, D46) y cubierta con las tablas de LOD0 o la cara lisa de LOD1. Equivale al pase de ids y mantiene un solo arnés para las tres reglas | \|ΔL\*\| de la vela entre LOD0 y LOD1 ≤ 3, y ΔE76 de la cubierta entre LOD0 y LOD1 ≤ 3, **en cada rumbo**, no en la media de la clase: el salto se ve en una pose concreta (D46). Modelo: hoy, vela +4,5…+6,2 y cubierta 6,0–7,4; con D40, vela −0,8…+2,0 y cubierta 0,5–1,2 (`d40-modelo/o8.py` y `sailmean.py`) | AD-25 |
| AD-26 | **Escala del barco inicial** (D23; U8 cerrado, D26) | `measureShipValues` (vela + cubierta + casco) con el zoom por defecto de una sesión nueva (Balandra, cañón de 8 lb) en 1440×900, rumbos 0/90/180/270° | ≥ 1 900 px en el peor rumbo: paridad con el barco del jugador en Seafight (2 000–2 018 px² en dos capturas, `qa-artifacts/render/escala/`), con un margen del 5 % por la incertidumbre de la máscara de un JPEG. Hoy: 1 310 px a 0°. Con R = 65: 1 980 px | AC-24 (revisado) |
| AD-28 | **Hostiles distinguibles en grises** (I2; AC-115) | 390×844, zoom 1,0×, rumbos 45 / 135 / 225 / 315°, captura en L\*. Máscara de cada barco = píxeles que cambian al ocultarlo. Firmas: área (px), **L\* medio de la máscara** (D43; antes, fracción oscura con L\* ≤ 25), fracción clara (L\* ≥ 65) y **fracción media** (45 ≤ L\* < 65; D51), que mide la cubierta clara de la Cañonera. La fracción oscura dejó de servir con la lona de 3 tonos de D40: el tono claro del pirata se renderiza en L\* 26,6–33,8 (p5–p95), así que cualquier corte entre 25 y 34 lo parte, y uno más bajo deja fuera ⅓ de la lona solo en LOD0. En 390×844, el Pirata va en LOD1 y la Cañonera y el Capitán en LOD0, así que esa diferencia de LOD se colaba como diferencia entre barcos. Modelo (paleta pirata a 5,64 px/m físicos, DPR 2, rumbos 45–315°; `d40-modelo/ad28.py`): con el corte en 25, D40 da 43,2–52,2 % en LOD0 frente a 48,5–65,2 % en LOD1. El L\* medio da 24,9–26,7 en LOD0 y 25,6–27,4 en LOD1 (Δ ≤ 1,1: ≈ 4 %, lejos del 30 % que busca la regla), y no depende del corte | En cada rumbo y para cada par de {pirata, cañonera, capitán}, **al menos dos firmas** difieren ≥ 30 % (\|x − y\| / máx ≥ 0,30; D51). En las fracciones, además, \|x − y\| ≥ 1 punto, para que dos fracciones casi nulas, como 0,02 % y 0 %, no cuenten como distintas. Además: el estandarte del capitán da ≥ 20 **px CSS** de área con L\* ≥ 80 en cada rumbo (px de lienzo ÷ DPR² del lienzo; en 390×844 el lienzo va a DPR 1,5, así que son ≥ 45 px de lienzo; D47). Medido en I2 entre el Pirata y el Capitán: área 49–58 %, fracción clara 98–100 % y L\* medio 5–18 %. El Capitán se separa por el área y por el estandarte, como preveía D43, y en 1440×900 se cuentan ≥ 8 cañones de la cañonera en cada uno de los 4 rumbos, con N3 a 1,0× (5,04 px/m, el menor ppm de escritorio, como AS-V20; D48). **Región**: píxeles con cobertura ≥ 50 % en un pase de solo cubierta (cubierta en blanco y el resto en negro, como el pase de cobertura de AS-V20) **con cañones y cureñas ocultos**, para que entre la cubierta que ellos tapan. Velas, mástil y borda quedan fuera porque la tapan. **Manchas**: componentes de 8 vecinos de píxeles con L\* ≤ 25 en la captura normal, dentro de la región, con diámetro de Feret ≥ 4 px (máxima distancia entre los centros de dos de sus píxeles). La cubierta es clara (L\* 56), así que ahí el corte de 25 sigue valiendo. **El mortero se oculta en las dos pasadas**: si se oculta solo en el pase de región, cuenta como una mancha más. Modelo (geometría provisional de dev-render, render por software, balanceo 0 y ±3°; `qa-artifacts/render/d48-canonera/`): 10–12 manchas por rumbo, cada una de un solo cañón, sin fusiones ni manchas sin cañón (las velas tapan 0–2 cañones); con N1, también 10–12. Si los cañones no se ocultan en el pase de región, sale 0. Las placas «Capitán pirata» y «Cañonera pirata» se ven sin «…» en los dos tamaños (§11.1) | AC-115 |
| AD-29 | **Minimapa: 6 formas** (I2; AC-115) | Plantilla de cada marcador de §4.3 dibujada aparte a 4×. En una captura del minimapa (escritorio y móvil), correlación cruzada normalizada en grises de cada marcador con las 6 plantillas | Con la suya ≥ 0,90 y con cada una de las otras ≤ 0,80. El capitán se ve en el minimapa desde cualquier punto del mapa | AC-115, AC-111 |
| AD-30 | **Vista libre** (I2) | e2e con el barco propio fuera de pantalla en 8 direcciones y en los 3 viewports | El indicador es visible y apunta al barco con ≤ 10° de error, no se cruza con ningún bloque del HUD, y el botón Centrar solo existe en vista libre | AC-119, AC-121 |
| AD-31 | **Indicador de atacante** (I2; D26) | e2e: un barco te dispara desde fuera de la pantalla (8 direcciones; 3 viewports), y otro caso con 2 atacantes | Aparece ≤ 100 ms después del primer `volley`; apunta al atacante con ≤ 10° de error; desaparece a los 3,0 ±0,2 s del último disparo; no se cruza con el HUD ni con otro chip; 0 commits de React por frame. En grises, la correlación normalizada entre el chip de atacante y el del barco propio es ≤ 0,80 | AC-124 |
| AD-27 | **Espuma natural** (D23, D42) | **Conjunto fijo de 12 vistas, no capturas sueltas** (D42): 3 puntos de mar abierto, A (0, 220), B (250, −40) y C (−240, −60), × 4 tiempos del reloj del océano fijado (`uTime` = 10, 40, 70 y 100 s), en 1440×900 a 1,0×. Pase de solo océano: barcos, VFX, placas y HUD ocultos. Por vista: espuma = píxeles de agua con L\* ≥ mediana + 10; celdas de 240×110 px con ≥ 85 % de agua; se miden la cobertura, el % de celdas sin espuma (< 0,1 %) y la mediana de ΔL\* de la espuma. **Periodicidad (R23)**: con la proyección de la vista y los parámetros de la ola de 23 m que exporta el arnés (esquinas, `waves`, `uTime`), R23 = \|media de e^{iφ}\| sobre los píxeles de espuma, con φ = k₁·(d₁·p) − ω₁·t en su posición del mundo. R23 = 1 si toda la espuma cae en la misma fase de la ola (diagonales rectas cada 23 m); el control con una onda perpendicular da 0,16 de mediana. La varianza entre vistas es propia de las rachas. En el modelo completo de dev-tests (IoU 0,957–1,000 frente a 84 capturas; sesgo de cobertura de −0,1 a +0,4 pp), con k1 y el desplazamiento de §7.3 una vista suelta pasa las tres condiciones en el 85–87 % de los casos, así que 3 capturas sueltas pasan las tres solo en el 61–66 % de las corridas. La mediana de 12 con las guardas pasa en el 100 % de 20 000 conjuntos al azar, y con R23 en el 99,8 % | **Mediana de las 12 vistas**: cobertura entre 0,3 % y 1,2 %; **≥ 40 % de celdas sin espuma**; ΔL\* ≤ 20; **R23 ≤ 0,40**. **Guardas en cada vista** (para que la mediana no esconda vistas malas): cobertura ≤ 2,0 %, ≥ 25 % de celdas sin espuma, ΔL\* ≤ 22 y, en las vistas con ≥ 0,3 % de cobertura, R23 ≤ 0,70. Con menos espuma, R23 sale de 1 o 2 manchas y no significa nada: en el modelo, las dos únicas vistas con 0,76 tenían 0,09 % y 0,13 %. Medido en las 12 vistas (dev-tests, `~/sea-battle-work/ad27/`): hoy 1,64 % · 0 % · 20,8 (falla; guarda: 0 % de celdas vacías en las 12); D23 tal cual 0,11 % · 79 % · 14,3 (falla la cobertura); k1 sin desplazamiento 0,72 % · 58 % · 15,6, pero R23 0,91 (0,90–0,92 en las 12), así que falla; **k1 + desplazamiento de 18 m: 0,60 % · 64 % · 16,1 y R23 0,22 (0,11–0,41): pasa, y además pasan las 12 vistas por separado**. Modelo de k1 + desplazamiento en 300 vistas (`qa-artifacts/render/d42-espuma/sets_r23.py`): R23 p50 0,25 y p90 0,43 en todas las vistas, y máximo 0,63 en las que tienen ≥ 0,3 % de cobertura; sin desplazamiento, 0,91 y 0,92 | — |
| AD-34 | **Estados de persistencia** (D50; AC-131, AC-132 y AC-133) | e2e en 1440×900 y 390×844 (y 844×390 en b) con los ganchos de la BD de dev-npc (parada, colgada y registro corrupto), un usuario con cuenta y un invitado. Textos medidos con `scrollWidth ≤ clientWidth` en cada nodo de texto y cajas con `getBoundingClientRect` | **(a) AC-131**: overlay con `data-state="load-failed"`, con «Progreso no disponible», «No podemos cargar tu progreso ahora mismo» y «Reintentar», sin recortar y con la tarjeta dentro del viewport con ≥ 16 px de margen. «Reintentar» tiene el foco. No hay ningún `[data-hud-block]` visible ni lienzo del juego. Fondo de «Conectando»: el píxel (8, 8) a ΔE76 ≤ 3 de `#0F3F5C` y el (8, alto − 8) a ≤ 3 de `#1A5F86`. 3 clics en «Reintentar» separados 120 ms lanzan 1 intento, con «Reintentando…» y `aria-busy` mientras espera. Con la BD aún caída, sigue el overlay con el detalle del reintento fallido y el botón activo; con la BD de vuelta, entra con su progreso. En 390×844, botones ≥ 48 px de alto. **(b) AC-132**: el aviso es el primer hijo de la columna de avisos, con la esquina superior en y = 96 / 156 / 12 según el tamaño, `data-hud-block`, 36 px de alto (una línea) y el texto de §12.5. Aparece ≤ 1 s después de que el servidor lo notifique. Sigue visible a los 60 s de corte y con 3 toasts a la vez. Puerto queda deshabilitado. P o un toque en Puerto no abren la tienda y sacan el toast de peligro «La tienda no está disponible: no podemos guardar». Con la tienda ya abierta, aparece la franja y quedan 0 botones de compra o uso habilitados. Al volver la BD, el aviso desaparece en ≤ 5 s, pero nunca antes de 3 s desde que apareció, y sale el toast «Progreso guardado»; Puerto vuelve en el mismo commit. Un invitado no lo ve nunca y su Puerto sigue habilitado. Las placas bajo el aviso cumplen AD-32. **(c) AC-133**: overlay con `data-state="kicked"`, con «Sesión en otra pestaña», «Has abierto el juego en otra pestaña» y solo «Salir». En ningún momento sale «Reintentar» ni «Reintentando (n/3)…» | AC-131, AC-132, AC-133 |
| AD-35 | **Inicio de sesión y registro como el juego** (D53; GDD Q8) | e2e sin WebGL en `/sign-in` y `/sign-up`, en 1440×900, 390×844 y 844×390, contra la instancia de desarrollo de Clerk (local o staging). Se leen `getBoundingClientRect()` de `.cl-cardBox`, `document.documentElement.scrollWidth`, los estilos calculados y el `innerText` de la tarjeta. Las mismas esquinas, en una captura de `/` | **(a) Centrado** (AC-140 a): en 1440×900 y 390×844, el centro de la tarjeta queda a ≤ 2 px del centro del área visible en los dos ejes. En 844×390, donde no cabe en alto, a ≤ 2 px en horizontal, con el borde superior a 16 ±2 px y scroll solo vertical. **(b)** `scrollWidth` = ancho del viewport en los 3 tamaños. **(c) Fondo**: los 4 píxeles a 8 px de las esquinas quedan a ΔE76 ≤ 3 de los de la landing en el mismo tamaño. **(d) Idioma** (AC-140 c): el texto de la tarjeta, también con el error de una contraseña incorrecta, contiene «Continuar» y ninguna de estas cadenas: «Sign in», «Sign up», «Continue», «Username», «Password», «Welcome», «account», «Don't have an account?». Quedan fuera «Secured by» y «Development mode», del pie de Clerk. **(e) Aspecto**: la `font-family` calculada de `.cl-formButtonPrimary`, `.cl-formFieldInput` y `.cl-formFieldLabel` es la del `body`, y la de `.cl-headerTitle` es Pirata One. El fondo de `.cl-card` es `rgb(11, 26, 36)`, y el de `.cl-formButtonPrimary`, `rgb(242, 193, 78)`. Ni `.cl-card`, ni `.cl-footer`, ni `.cl-formFieldInput` tienen fondo blanco. Campos y botón miden ≥ 44 px de alto. **(f) Vuelta**: «Volver a la portada» se ve (en 844×390, tras el scroll), mide ≥ 44 px de alto y lleva a `/`. **(g) Q25** (AC-140 e): en `/sign-up`, «Guarda tu contraseña: no se puede recuperar» se ve encima del primer campo, en `rgb(242, 193, 78)`. **(h)** Contrastes de D53: texto ≥ 4,5:1; bordes de campo y foco ≥ 3:1 | AC-140; Q8, Q25 |
| AD-36 | **Icono de Sea Battle** (D54) | Script sin WebGL contra cada página (landing, `/sign-in`, `/sign-up` y `/game`): lee los `<link rel="icon">`, el `apple-touch-icon` y el `manifest` del `<head>`, descarga y decodifica cada imagen (también las entradas del ICO) y las compara con `qa-artifacts/render/d54-icono/ref-*.png`. La pestaña la mira QA en un navegador real (AC-141) | **(a)** Se sirven el ICO con entradas de 16 y 32, los PNG de 16, 32, 192 y 512, el apple-icon de 180 y el manifest con 192 y 512 `any` y 512 `maskable`. Todos dan 200 y miden lo que declaran. Ningún `<link>` ofrece un SVG. **(b)** El 16 (PNG y entrada del ICO) coincide píxel a píxel con el mapa de §13.1: los opacos a ΔE76 ≤ 1 y el alfa de las esquinas a ±8. Solo usa los 4 colores, y el motivo (crema y oro) ocupa el 35 % (89 de 256 px) frente al fondo, con contraste ≥ 6,6:1. **(c)** 32, 192 y 512: ΔE76 medio ≤ 2 frente a la referencia, y ≤ 1 % de píxeles con ΔE76 > 10. En el 512, fondo (448, 96), ola (256, 496), vela (200, 140), casco (256, 360) y gallardete (232, 58) quedan a ΔE76 ≤ 2 de su color. **(d)** apple-icon: alfa 255 en todos los píxeles y la esquina (0, 0) a ΔE76 ≤ 2 de `#0F3F5C`. **(e)** Maskable: alfa 255, y todo píxel a ΔE76 > 10 del fondo y de la ola queda a ≤ 204,8 px del centro. **(f)** Manifest: `name` y `short_name` «Sea Battle», y `theme_color` = `themeColor` del viewport = `#0F3F5C` | AC-141 |

---

## 19. Dependencias y preguntas abiertas

**Resueltas con `game-product`** (aplicadas en el GDD el 2026-10-10):

| # | Decisión | Dónde |
|---|---|---|
| U1 | Pantalla: +X a la derecha (Este) y **−Z arriba (Norte)**. Sectores NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+). En pantalla, estos cuadrantes se nombran como región («el noreste»…), y «sector» queda para la celda de la rejilla (D49) | GDD §4 |
| U2 | Rumbo: ψ = 0 con la proa hacia +Z, creciendo hacia +X; `forward = (sin ψ, 0, cos ψ)`, `rotation.y = ψ`; en pantalla gira en sentido antihorario | GDD §4, ASSET-SPEC §2.3 |
| U3 | La cámara no se limita al borde; más allá de ±500 m hay mar oscuro con una línea de borde | GDD §4, §7.4 aquí |
| U4 | "Fuera de React" = canvas de three.js o capa DOM movida por refs | GDD §14 |
| U5 | Un número de daño por andanada (`impactos × daño`); "Fallo" solo si el tirador o el objetivo es el jugador propio; una salpicadura por cada bala fallada | GDD §14, AC-75, VFX-SPEC §4 y §9 |
| U8 | **Encuadre por alcance** (cerrada el 2026-10-11): `R = máx(alcance del cañón propio, 65 m)` → 65 / 70 / 80 m con N1 / N2 / N3; transición de 600 ms al cerrar la tienda, aceptada | GDD §5, AC-24; §6.2 aquí |

**Decisiones de implementación** (preguntas de desarrollo, 2026-10-11):

| # | Pregunta | Decisión | Spec |
|---|---|---|---|
| D1 | La receta de la playa (cilindro 0,88r→r + jitter del 6 %) deja la flotación en 0,89r, fuera de AS-V16 | **Validado** escalar cada columna para que la flotación quede en `r·(1 − 0,06·rnd)` ∈ [0,94r, r]. La receta estaba mal; se corrige | ASSET-SPEC §9.1 |
| D2 | NeutralToneMapping convierte #1A5F86 en #025B83 (AD-01). ¿Compensar también los cascos? | **No compensar por material: `NoToneMapping`** y quitar la compensación del océano. El *toe* aplasta todos los oscuros (casco #4A2F1C → #442403, vela pirata → #0E0B15) | §5 |
| D3 | El servidor emite `volley{hits, cannons}`, no `broadside{shots[]}` | **Válido**: banda según el rumbo y la posición del objetivo, aciertos repartidos al azar (si se siembra con `shipId` + `t`, se ve igual en todos los clientes) y vuelo = `duration` | VFX-SPEC §1, §3 |
| D4 | `WreckView` sin `expiresAt` | **Pedirlo al servidor** (ya existe en `Wreck`, `src/game/types.ts:86-90`). Al entrar en el área de interés tarde, el parpadeo y la desaparición quedarían desfasados. Mientras no esté, se cuenta desde que el cliente ve el resto | VFX-SPEC §14 |
| D5 | Boyas: ¿alternas o bicolor? | **Bicolor e idénticas** (cuerpo oro + cono marfil): una sola geometría instanciada | §8.2, ASSET-SPEC §9.2 |
| D6 | Faro: ¿3 tramos o 2 franjas? | **5 tramos alternos** blanco/rojo = 2 franjas rojas (lo que hizo desarrollo) | ASSET-SPEC §9.2 |
| D7 | Muelles de 14 m y rocas a 1,05r sobresalen del colisionador | **No es aceptable** ("lo que parece sólido es sólido", GDD). Rocas con el borde exterior en r; muelles de 0,70r a 0,99r. AS-V16 se amplía: nada sobre el agua fuera de r + 0,5 m | ASSET-SPEC §9.1, §9.2, AS-V16 |
| D8 | Velas en sombra grises (L\* ≈ 60) y casco protegido grisáceo | **Luces recalibradas** (hemisférica clara ×3,0 + sol ×1,2, sin TM): velas con L\* 81–90 en cualquier cara. La protección pasa a un borde luminoso (rim), no a un velo | §5, VFX-SPEC §12 |
| D9 | Franjas del mercante: "filas 1 y 3" | **Contando desde 0** → crema-azul-crema-azul-crema. Correcto | ASSET-SPEC §8.4 |
| D10 | En móvil, el toast (y = 116) se solapa con el minimapa (y 60–148) | Error del spec: los toasts pasan a y = 156 | §12.2 |
| D11 | El anillo de objetivo fuera de alcance se ve caqui (α 0,6) | α 1; el estado se comunica con el relleno al 40 % y sin giro | VFX-SPEC §11 |
| D12 | AS-V14 falla en 3 de 5 clases; la braza a 30° empeora las 5 | Braza de las cuadras en 20°. **Todas las velas de cuchillo de todas las clases se abren 25°** hacia el costado de la prueba medida. Foque nuevo en el Mercante. Umbral ≥ 0,25 en LOD0 y LOD1 (objetivo ≥ 0,28); 35° solo para la clase que falle | ASSET-SPEC §8.2–8.4, AS-V14 |
| D13 | Q10: el humo denso del pirata no se distingue y sube solo 4,8 m | Humo claro (`#B8B3AC` / denso `#8A8580`, L\* ≥ 55) que sube hasta la punta del mástil más alto (cinemática escalada con `sb_mast_height`). Precisión de D33/D34: lo que llega a la punta es la parte visible con ΔE ≥ 15, deriva del viento incluida. En el mundo sube ≈ 0,95h sobre el socket, y VFX-20 (c) da 1,03–1,06 con la vida de 3,4 s. El oscurecimiento medido (43 → 6) no se explica con mezcla alfa normal: **HIPÓTESIS**, la muestra con VFX se leyó de un render target lineal (6/255 lineal ≈ 42 sRGB). Falta el resto del reporte de dev-render para confirmarlo | VFX-SPEC §6, VFX-20 |
| D14 | Portada U6-a | **Provisional aceptada**. Para la definitiva hay que regenerarla con `qa:hero` tras D2/D8, la rejilla, el humo (VFX-21) y las olas (AD-24). Estado según QA-REPORT-2026-10-11-3 (:78, :84, :139): AD-24 ya pasa (5,0–10,8) y la imagen actual pesa 100 / 84 KB, pero no se ve humo. Faltan regenerarla tras D22 y que cumpla VFX-21 | §16.1 |
| D15 | Q12: las facetas de vela más orientadas al sol llegan a p95 L\* 96,7, aunque la media es ≤ 90,1 | **Aceptado**: es el brillo de la lona al sol y aporta volumen. El sol sigue en ×1,2. Condición: sin recorte, < 1 % de los píxeles de vela con algún canal = 255 | §5 |
| D16 | Q13: velas pirata con L\* 16,9–17,5 frente al cálculo de 14–16 | **Aceptado**. El 14–16 era una estimación mía, no un umbral. Manda AD-10 (≤ 25) y se cumple con margen frente al agua (L\* 38) | AD-10 |
| D17 | Q14: las caras horizontales reciben ×1,15; la arena sale `#F5DDA3` | **Albedo compensado** solo para los materiales que se ven desde arriba (arena, hierba, cubiertas y carga). Ni velas ni cascos | §4.2.1, AD-25 |
| D18 | Rim de `uShield`: mástiles azulados; dev-render usa `(0,0,1)` como vista ortográfica | **Excluir del rim todo lo que no es casco** con la máscara `_rim_mask`. **Confirmado** `geometryViewDir` (`(0,0,1)` en ortográfica, como hace three) | VFX-SPEC §12, ASSET-SPEC §6 |
| D19 | H-05 (QA): con el 10 % de vida, un mercante solo muestra una llama de ~2 px y casi nada de humo | Área mínima medible en VFX-09b (fracción de la huella del casco, con contraste en grises) y llamas más grandes (de 2,0 a 0,6 m × L/24, mínimo 8 px). D13 cubre el color y la altura del humo (VFX-20), no el área | VFX-SPEC §6, VFX-09b (**revisada en D21**) |
| D20 | Q15: VFX-20 da mediana +6,3 (p75 +8,5) y solo 113 px sobre vela; la cangreja abierta (D12) tapa la base de la columna. Además dev-render confirmó huecos de alfa en el framebuffer y eligió 9 m y 4,5 m para el ruido de AD-24 | **Las dos cosas, primero el humo** (la causa): forma 7 «bocanada» de borde firme, alfa sostenida hasta el 55 % de la vida, más tamaño (0,10·h → 0,32·h) y 6/s, y sesgo de profundidad de 6 m para que las velas no la tapen. **Métrica**: VFX-20 mide el núcleo (p75 de ΔE76 ≥ 20 y p75 de ΔL\* ≥ +20 sobre vela), porque la mediana castiga el borde suave, que es intencionado; un umbral de α no se puede medir en una captura. Alfa del framebuffer: obligatorio en todo `CustomBlending` (VFX-22). Ruido de AD-24 **fijado** en 9 m y 4,5 m. Sesgo de 6 m **aceptado por el lead** con una condición: sin artefactos visibles en la escena estándar de 41 barcos (lo comprueba dev-render); si aparecen, vuelve con captura para decidir | VFX-SPEC §0.2, §0.3, §6, VFX-20, VFX-22; §7.2, AD-24 |
| D21 | Q16: VFX-09b falla por un orden de magnitud (con \|ΔL\*\| ≥ 8, 0,01–0,08·A frente a 0,35·A y 0,60·A; fuego 18–66 px²). Mi 0,60·A suponía cuadrados opacos (dev-render tenía razón) | **Una sola versión, coherente con D20**, calibrada con un modelo de partículas realista: perfil y α del shader, mezcla sRGB de 8 bits y fondo real de `tanda-d15-d19`. La medición del modelo, aplicada a las capturas reales, reproduce las cifras de dev-render (73 / 104 / 308 px frente a 76 / 93 / 277). (1) **Humo**: el de D20, sin el 0,40·h. (2) **Llamas**: cuerpo en mezcla normal (`#FF9E2C` → `#D9381A`), de 3,0 a 0,9 m × L/24 (mínimo 10 px), nacidas en una elipse de 0,06·L × 0,15·B por socket, más un núcleo aditivo pequeño. En aditivo puro, la llama se vuelve blanca sobre la cubierta y cian sobre el agua. (3) **VFX-09b** mide ΔE76 ≥ 15, porque el humo gris sobre el agua azul es contraste de croma: \|ΔL\*\| no pasa de +16 ni con α 1 (L\* 56 frente a 40). Umbrales: 0,07·A y 0,25·A, fuego ≥ 0,03·A y ≥ 60 px², grises ≥ 0,04·A y tope del 20 % del barco tapado. Todos quedan ≥ 20 % por debajo de la previsión en la peor clase (el Mercante, ancho para su `h`) y por encima de lo que daba el D19 real, que fallaba (Mercante: 0,01·A con ≤ 50 % y 0,08·A con ≤ 25 %). **0,60·A no se alcanza sin tapar el barco**: con 0,14·h → 0,48·h el Mercante llega solo a 0,52·A y la Balandra queda tapada un 22 %, con la vela mayor oculta. **Legibilidad frente a Seafight**: el referente lee la vida en la línea bajo el nombre y en el panel del objetivo (R4, R7), y la evidencia R1–R13 no registra humo de daño. Aquí el humo y el fuego refuerzan la placa: avisan a primera vista sin competir con la identidad del barco (el color de la vela da la relación) | VFX-SPEC §0.2, §6, VFX-09b; modelo y capturas en `qa-artifacts/render/q16-modelo/` |
| D22 | Medición de D20 + D21 (`qa-artifacts/render/d20-d21/`): pasan VFX-20, VFX-22 y el tope de barco tapado. VFX-09b falla en 4 casillas (Q17 ≤ 50 % en Balandra y Mercante; Q18 fuego del Mercante; Q19 grises de la Fragata). El sesgo de 6 m pinta 506 px sobre barcos ajenos | (Q17) Humo claro con α0,42 y **color constante**: oscurecerse con la edad le restaba contraste sobre el agua. (Q18) La carga del Mercante pasa de z +1,0 a −3,0, y se corrigen **6 sockets de fuego** que caían dentro de objetos (dos de ellos al 93–100 %), con la regla nueva AS-V17. (Q19) Humo denso `#A29D97` (L\* 65), constante: ΔL\* +19,7 sobre el agua frente a +12,2. **Sesgo: opción A, se mantiene 6 m**. El 85 % de lo que cambia es la columna propia, visible desde la base en todos los frames. Lo ajeno (10,5 %) solo aparece con las arboladuras ya cruzadas y se ve como gris claro sobre el borde de una vela. B no lo elimina (el pirata necesita ≥ 5,5 m) y C cambia el contrato sin quitar la oclusión de la vela propia (de 3,4 a 13,4 m). Guarda: VFX-23 ≤ 15 %. **Corrijo** mi cota de «barcos casi tocándose»: valía para cascos, no para foques ni baupreses. Previsión del modelo (5 semillas, fondo de d20-d21; HIPÓTESIS hasta el render): ≤ 50 % 0,12 / 0,12 / 0,19·A; ≤ 25 % 0,56 / 0,34 / 0,43·A; grises 0,42 / 0,24 / 0,22·A. Confirmados los supuestos de dev-render: núcleo con forma 2 y subida de 1,8 ±0,4 m/s; tono = `h_ab` de CIELab. **ROI resuelta**: dev-render usa la misma ROI y su medida coincide con la mía (0,053 / 0,096 / 0,160 frente a 0,053 / 0,096 / 0,159). La diferencia ×1,5 venía de una pausa que no detenía el reloj de VFX; ya está arreglado. **Render con D22** (dev-render, 12 capturas): ≤ 50 % da 0,146–0,156 / 0,130–0,135 / 0,186–0,199·A (pasa; previsión 0,12 / 0,12 / 0,19) y el Mercante con ≤ 25 % da 0,305–0,354·A | VFX-SPEC §0.3, §6, VFX-09b, VFX-23; ASSET-SPEC §3, §8.4, AS-V17 |
| D23 | QA-REPORT-2026-10-11-3 §8: Barcos 7/10, «a 1,0× se ven pequeños y facetados frente a los sprites de Seafight». Además, la espuma se ve repetida y procedural | **Medición** (`qa-artifacts/render/escala/`). Seafight: barco del jugador de 64–68 × 84–85 px y ≈ 2 000 px²; galeón de 81 × 81 px y 2 200 px²; pirata de 52 × 49 px y 1 014 px², en un área de juego de ≈ 800×565. Nuestro (vela + cubierta + casco a 1,0×): Balandra 1 310–2 100 px, Bergantín 2 750–3 980, Fragata 5 400–7 210, Pirata 1 770–2 670 y Mercante 2 680–3 090, en 1440×900. **En px absolutos ya estamos cerca. Lo que falla es la Balandra inicial**, que sale al 65–105 % del barco de Seafight según el rumbo, sobre un mar con 2,9× más píxeles, y además **el detalle interno**: píxeles interiores con \|∇L\*\| ≥ 4, 70–80 % en Seafight frente a 30–49 % aquí. **Opciones**: (a) subir ppm a todos: con 6,2 ya no cabe el círculo de 80 m en 1440×900 (rompe GDD §5) ✗. (b) Escalar los modelos: rompe eslora y radio del GDD, navClearance y sockets ✗. **(a') Encuadre por alcance propio** (R = 60 m con el cañón inicial → ppm 6,71): la Balandra pasa a 2 330 px en el peor rumbo, el círculo propio sigue cabiendo y no cuesta rendimiento ✓. Necesita U8. **(c) Detalle dentro del presupuesto** ✓: normales con pliegue de 40°, loft de 13 estaciones, tablas de cubierta, paneles de vela, oclusión horneada y cañones y portas legibles; 0 draw calls y entre +400 (Balandra) y +700 tris (Fragata, ≈ 1 900 ≤ 2 500) por barco en LOD0. **Recomendación: (a') + (c)**, con las reglas AD-26 (escala), AS-V18 (sin facetas), AS-V19 (textura interna ≥ 55 %) y AS-V20 (cañones legibles). **Espuma**: vetas a lo largo del viento, agrupadas por rachas y con opacidad 0,25 (§7.3; AD-27). El umbral de AS-V19 es provisional (HIPÓTESIS): se calibra con el primer render y no baja de 50 % | §6.2, §7.3, §4.2, AD-26, AD-27, U8; ASSET-SPEC §6, §8.1, §8.2, AS-V18–V20 |
| D24 | Q20: el fuego del Mercante da 72–81 px² = 0,021–0,023·A (pide ≥ 0,03·A). Lo tapan sus cuadras braceadas a 20° (dev-render: 79 px² con velas, 125 plegadas, 143 sin prueba de profundidad) | **(a) Sesgo también en las llamas**: forma 8 (perfil de la 2 con el sesgo de la 7), en el cuerpo y en el núcleo, con los mismos 6 m que el humo (`uFxBias`). Previsión: ≈ 125–143 px², ≥ 0,036·A. Es la misma razón que en D20: el efecto de daño de un barco no lo tapa su propio aparejo. La vela que tapa puede estar hasta ≈ 6,7 m por delante a lo largo de la vista. Descartadas: (b) mover `_01` y la carga o los barriles solo arregla un rumbo de una clase; (c) aceptar el criterio absoluto en el Mercante daría por buena una llama que en otros rumbos tampoco se ve. VFX-23 pasa a medir humo y llamas juntos (≤ 15 %); las llamas son pequeñas frente a la columna, así que se espera poco cambio | VFX-SPEC §0.3, §6, VFX-23; ASSET-SPEC AS-V17 |
| D25 | Requisitos de arte de I2 (GDD §9: cañonera y capitán; GDD §5: vista libre; AC-115 y AC-121) y petición de product: las cifras del intercambio de escala | **Cañonera**: casco ancho y bajo (28 × 10 m, francobordo 1,5), **un solo mástil** con una sola cuadra grande negra, **cubierta clara con la batería de 6 + 6 cañones oscuros a la vista** y un mortero central. Es la hostil con menos vela y la única con la cubierta clara. **Capitán**: el mayor de los piratas (30 m, 3 mástiles de hasta 24 m), con **estandarte blanco de 6 × 4 m** como rasgo exclusivo y regala dorada. Firmas en grises previstas (HIPÓTESIS, estimadas por áreas proyectadas): área del capitán ≈ 1,35× la de la cañonera y 2,3× la del pirata; fracción oscura de la cañonera ≈ 0,18 frente a ≈ 0,4 del pirata y del capitán. AD-28 lo verifica. **Minimapa**: ▬ para la cañonera y ★ con halo para el capitán (AD-29). **Vista libre**: botón Centrar y chip indicador (§12.8, AD-30). **Escala (corrige D23)**: R = máx(alcance propio, 65 m), porque con R = 60 la cañonera y el capitán dispararían desde fuera de la pantalla. AD-26 baja a ≥ 1 900 px (paridad con Seafight, con un margen del 5 % por la medida) | §4.3, §6.2, §10, §12.8, AD-26, AD-28–AD-30, U8; ASSET-SPEC §3, §8.1, §8.4, §10 |
| D26 | U8 cerrado por `game-product` (R = máx(alcance propio, 65 m)); propone AD-26 ≥ 1 950 px; pide AC-124 (indicador de atacante fuera de pantalla) | **AD-26 se queda en ≥ 1 900 px**, no en 1 950. La previsión con R = 65 es 1 984 px, sacada de `measureShipValues` a ppm 7,2 y escalada, sin render. 1 950 dejaría un margen del 1,7 % frente al ruido del render real (bordes y suavizado). La referencia de Seafight ya tiene ±5 %: 2 000–2 018 px² en dos capturas del mismo barco con una máscara sobre JPEG. Si el render da < 1 900, la palanca sería visual (detalle de D23), no el encuadre. **AC-124**: el mismo chip que el indicador de vista libre, con el color y el icono de la relación del atacante, que late con cada impacto, dura 3 s tras el último disparo, con hasta 3 chips a la vez y que al pulsarlo selecciona al atacante (§12.8, AD-31). Tablas de §6.2 y niveles de zoom actualizados a N1 / N2 / N3. Encuadre por defecto de los barcos actuales con N1 en 1440×900: Balandra 99 px y Bergantín 149 px de eslora (390×844: 45 y 68) | §6.2, §12.8, AD-26, AD-31, U8; ASSET-SPEC §7 (LOD) |
| D27 | Respuesta de `game-product` a D25 (aprobado; AD-28 y AD-29 añadidos a AC-115) con tres ajustes: Centrar se cruza con la pista en 390×844; AC-124 no debe confundirse con el chip propio, tampoco en grises; la cañonera queda fuera del ≥ 0,25 de vela de AS-V14 | (1) El botón **no se mueve**: la pista lo esquiva (AC-110 ampliado por producto). (2) El chip de atacante pasa a **rombo** con borde de 3 px de la relación; el propio sigue siendo **círculo** con estrella. AD-31 exige una correlación en grises ≤ 0,80 entre los dos. (3) AS-V14 no aplica a la cañonera: su identidad es el casco y la batería, y la verifica AD-28 en cada rumbo. Los umbrales de D26 siguen igual (AD-26 ≥ 1 900 px) | §12.8, AD-31; ASSET-SPEC AS-V14 |
| D28 | dev-render, al empezar U8: ¿qué ppm base usan la portada y AS-V14? | **Portada**: ~~ppm fijo de 8,06~~ (**error, corregido en D29**: 1,6 · ppm₀(R = 80) de cada viewport, 10,25 / 3,90 px/m). **AS-V14**: ppm fijo de 7,2 (= 5,04 / 0,7), con el que se calibró; es un cociente de geometría. **Corrección de D26**: las reglas en px absolutos se miden en el peor caso, N3 (5,04 / 2,29), no con «el ppm₀ de la sesión», que con N1 sería el caso fácil. AD-26 mide N1. Las fracciones no dependen del nivel | §6.2, §16.1; ASSET-SPEC AS-V14 |
| D29 | dev-render: (Q22) el «ppm = 8,06 fijo» de la portada no coincide con las imágenes aprobadas; (Q21) con N1, el fuego del Mercante da 0,029–0,033·A (con N3 daba 0,033–0,038) | **Q22, error mío**: calculé 8,06 con 1440×900, pero `qa:hero` captura en 1920×1080 y 414×896 (`scripts/qa-hero.mjs:22-24`). La portada aprobada salió con 1,6 · ppm₀(R = 80) de cada viewport: 10,25 y 3,90 px/m (comprobado con la fórmula de §6.2). Se confirma la implementación de dev-render: calcula ppm₀ con R = 80 por viewport, como antes de U8. **Q21**: VFX-09b se mide con N1 y con N3, y pasa en los dos. Corrijo lo que escribí en D28: sus fracciones sí dependen un poco del nivel, por los mínimos en px. Para el fuego, el caso difícil es N1. Palanca: el tamaño final de la llama pasa de 0,9 a 1,2 m × L/24. El tamaño medio sube de 1,6 a 1,8 m (+12,5 %) y el área ≈ +27 %. Previsión (HIPÓTESIS): Mercante con N1 ≈ 0,037·A ≥ 0,03 | §6.2, §16.1; VFX-SPEC §6, VFX-09b |
| D30 | Lead: (1) los «226 px de «Pulsa Espacio o Atacar…»» eran de «Toca el agua para navegar», y el caso de escritorio heredaba el puntero táctil; (2) y = 752 frente a 712 no es una discrepancia: el spec da el borde inferior (`bottom: 148px`) y el e2e la esquina superior; (3) anchos de las 3 pistas por layout | §12.1 da el borde inferior y los anchos con ratón (264 / 311 / 367). §12.3 da los anchos táctiles (226 / 273 / 300) y la regla nueva: el e2e de AC-110 recorre las 3 pistas en 844×390 contra las columnas, porque la esquiva dinámica no las ve. Quedan pendientes las cajas reales de escritorio, cuando el caso pase al proyecto de escritorio con la guarda de tipo de puntero | §12.1, §12.3 |
| D31 | Lote U8 + D29: (Q23) VFX-23 compuesto con N1 da 23,9 % (> 15 %) y con N3 da 6,6 %; el fuego del Mercante con N1 da 0,030–0,034·A, al límite, con oclusión residual (98 px² con profundidad frente a 150 sin ella); hay que concretar el núcleo | **Q23: la escena estándar se compone en metros con la densidad de N3** y se renderiza con cualquier nivel. Lo que mide VFX-23 depende de los metros entre arboladuras, no del zoom. Rellenar la pantalla con N1 junta los barcos un 19 % sin que el juego cambie. Que las arboladuras se crucen a < 7 m sí es un caso real: grupos contra el capitán (orbita a 50 m y premia ir en grupo), corros de NPC y PvP. La escena de N3 ya los cubre de forma conservadora: 41 barcos y ≥ 6 duelos en 286 × 218 m, más denso que el juego normal. **Fuego del Mercante: sesgo a 7 m** (humo y llamas, `uFxBias`), coherente con los ≈ 6,7 m calculados en D24. No se mueve el socket, que solo arreglaría un rumbo de una clase. Hay que volver a medir VFX-23 con N3; previsión < 10 % (HIPÓTESIS). **Núcleo**: queda la interpretación de dev-render, de 0,45 a 0,6 m × L/24. Un núcleo mayor blanquearía el centro y restaría píxeles de fuego | VFX-SPEC §0.3, §6, §15, VFX-23 |
| D32 | QA-4: (H-12) VFX-09b no tiene umbrales para móvil y AC-104 exige 390×844 (Mercante con ≤ 50 % a 0,065·A; fuego de 37 px² CSS < 60); (VFX-20 c) no hay método para medir la cima de la columna (según el umbral da de 1,07 a 1,37) | **H-12**: en móvil se miden **las mismas fracciones** que en escritorio. La causa era la tasa × 0,5 de la calidad baja, así que **el humo y el fuego de vida baja quedan fuera de ese recorte**: son información de daño, no decoración. A cambio, el humo se limita a ≤ 12 barcos en móvil (332 partículas ≤ 640 del pool). El mínimo absoluto del fuego en móvil es ≥ 25 px² CSS, una llama mínima entera: con `A_casco` ≈ 1/5 del de escritorio, exigir 60 px² serían ≈ 8 % del casco. Previsión (HIPÓTESIS): con la tasa completa, Mercante con ≤ 50 % ≈ 0,09–0,10·A y fuego ≈ 60–70 px². Se corrige §0.4, que decía fuego en ≤ 3 barcos frente a los 4 del código y de §6. **VFX-20 (c)**: máscara ΔE76 ≥ 15 (el mismo nivel que VFX-09b), banda de la columna con la deriva del viento, cima = la fila más alta con ≥ 3 px, media de 3 capturas y cociente de alturas en pantalla sobre el socket, entre 0,85 y 1,15. La subida por el viento cuenta | VFX-SPEC §0.4, §6, VFX-09b, VFX-20 |
| D33 | D31 en verde (Mercante con N1 a 0,036·A; VFX-23 al 5,7 / 8,1 %). VFX-20 (c) con el método de D32 da de 1,06 a 1,53 según el rumbo: ruido por el balanceo (±5 px sobre 50–58) y una dependencia del rumbo por la caída del mástil | **Denominador de diseño**, independiente del rumbo y del balanceo: `D = ((h_tope − y_socket)·cos 55° + 0,6·vida·sen 55°)·ppm`, es decir, la altura en pantalla de una columna que llega justo a la punta, viento incluido. `y_s` se toma de la pose sin balanceo. Pasa si cada uno de los 8 rumbos queda entre 0,85 y 1,15. **Palanca: vida del humo de 3,4 a 3,1 s** (retirada en D34: no hace falta). La cinemática de D13 subía 0,95h y no restaba la altura del socket; con 3,1 s sube 0,85h, y 0,85h + socket ≈ punta (pirata: 14,9 + 2,1 = 17,0 m frente a 17,5). Previsión ≈ 1,07 (HIPÓTESIS). Coste: el área del humo baja ≈ 9 % (VFX-09b); el caso más justo es el claro en móvil (previsión 0,09–0,10 → ≈ 0,08–0,09·A frente a 0,07). Topes: 10 / 19 por socket | VFX-SPEC §0.4, §6, VFX-20 |
| D34 | QA midió VFX-20 (c) con el método de D33 (máscara ΔE ≥ 15) sobre b5dc2c1: 1,03–1,06 en los 8 rumbos con la vida de 3,4 s. La palanca de D33 no hace falta y cuesta ≈ 9 % de área, justo en el humo claro de móvil (hoy 0,063·A frente a 0,07, antes de D32) | **Retiro los 3,1 s: la vida sigue en 3,4 s.** Error mío en la previsión de 1,19: saqué el numerador (≈ 63 px) multiplicando el cociente de dev-render por el denominador viejo. Su script no usa la máscara de ΔE ≥ 15, y según QA esos 63 px equivalen a la cima con ΔE ≥ 3. Mezclé dos métodos de medida. Queda como **palanca condicionada**: solo si, tras D32, VFX-20 (c) da > 1,15 en algún rumbo con el método de D33. Confirmado después por dev-render con 12 capturas por rumbo: la columna mide 67,3–70,1 px en los 8 rumbos y el denominador de D33 es 54,7 + 10,4 (viento) ≈ 65,1 px, lo que da ≈ 1,03–1,08, igual que QA. VFX-20 (c) se mide con 12 capturas. Los topes vuelven a 11 / 21 por socket y el pool de móvil a 332. El método de D33 (denominador de diseño) se mantiene | VFX-SPEC §0.4, §6, VFX-20 |
| D35 | Q24 (tras D32, todo en verde salvo esto): Balandra en 390×844 con N3 y ≤ 25 %, tapado de 19,9–20,7 % frente a ≤ 20 % (de 18,2 a 23,3 % por captura). Causa medida: la llama nativa de 4,6 px se infla ×2,2 hasta el mínimo de 10 px, sobre un casco de ≈ 37 × 10 px | **El mínimo en px de la llama pasa a ser relativo a la eslora en pantalla**: cuerpo `min(10, 0,22·L·ppm)` y núcleo `min(5, 0,11·L·ppm)`. Se calcula al emitir, con el ppm actual. Ataca la causa (un mínimo fijo sobre un casco diminuto) sin una regla aparte para móvil. En escritorio no cambia nada (0,22·L·ppm ≥ 17 px en todas las clases con 5,04). En el caso medido da 8 px, la variante de dev-render: tapado del 15,7 % y fuego de 0,138·A y 42 px² CSS ≥ 25. Con N1 en móvil (2,82) da 9,9 px sobre un casco ×1,5 mayor en área; previsión ≈ 13 % de tapado (HIPÓTESIS). Descartadas: (b) volver la llama a ×0,5 en móvil contradice D32, porque el daño es información; (c) un tope propio para móvil relaja el criterio sin arreglar la causa. §0.4 pasa a 336 partículas en el pico (4 × 21 llamas) | VFX-SPEC §0.4, §6 |
| D36 | QA-5 §9 (Pareto n.º 1: detalle interno). dev-render implementó D23 c y AS-V19 no llega: 0° / 90° = 50,7/41,6 · 45,6/45,6 · 33,7/40,9 · 18,4/21,1 · 66,0/51,2 frente a ≥ 55 %. Causas medidas: alternos con ΔL\* < 8, velas de cuchillo sin paños y tapas de castillo lisas. Ambigüedades (a)–(e) | **AS-V19 ≥ 55 % en las 5 clases, sin excepción, y deja de ser provisional** (cierra la HIPÓTESIS de D23). Se calibra con Seafight sin su ruido JPEG: el barco del jugador da 48–59 % y Rackham, de velas oscuras, 59–69 %. **Receta (§9.1; ASSET-SPEC §8.1–8.2)**: tablas a ±7 de L\* del token de cubierta, `sail.alt` del jugador `#D0C8BA` y del pirata `#0D0D0F`, tablas en las tapas de castillos, paños de ≈ 0,7 m en cuadras y cangrejas, paños de ≈ 0,9 m en foques y latinas, y franja de portas de 1,0 m. La Fragata cabe en 2 370 tris porque la porta pasa a 1 quad y el cañón pierde la tapa interior (−256 tris). **Previsión (HIPÓTESIS; modelo validado con 40 medidas de dev-render, error máximo 2,67 puntos)**: 0° / 90° = 67,0/65,8 · 63,6/64,3 · 58,1/59,9 · 59,5/59,2 · 69,5/60,4. **(a) AS-V20** exige contraste local, no un L\* absoluto: cada porta debe romper la franja con ΔL\* ≥ 15 frente a los píxeles de franja que la rodean. Con la franja de 0,25·F, a N3 la franja mide ≈ 1 px y ni siquiera hay píxeles puros de franja junto a la porta (modelo: Balandra 1/4, Bergantín 0/6, Pirata 1/4). Por eso la franja pasa a 1,0 m centrada en la línea de cañones y contiene la porta de 0,8 m en la maestra; en los cañones de los extremos asoma por debajo (D37) (modelo a N3: 4/4, 6/6, 8/8 con ΔL\* 39–51; Pirata 4/4 con 20–25; Mercante 0). Es la franja ocre con portas negras de los navíos de guerra, y se lee igual que las portas oscuras sobre casco claro de Seafight. **(b)** AS-V18 y AS-V19 se miden solo en 1440×900 con N1 a 1,0× (LOD0), y AS-V20 en 1440×900 con N3 (D28). En 390×844, LOD1 quita a propósito tablas, paños y portas (§7): a 2,3–2,8 px/m serían patrones de 1–2 px, que dan moiré y no detalle. Además, la referencia de Seafight es de escritorio. **(c)** Las rejillas (4, 2) del pirata y (2, 5) del mercante de §8.4 eran restos anteriores a D23, y dev-render hizo bien en aplicar D23. En LOD0, D36 las sustituye por la fórmula de paños; en LOD1 quedan (4, 3) y (4, 5). **(d)** Las velas de LOD1 siguen en `PlaneGeometry(w, h, 4, 3)` (franjas: 4, 5), no en 2×2. Las muescas del pirata necesitan vértices en u' = 0,25 y 0,75, y con 2 filas la panza forma un pico de ≈ 59° entre las dos mitades, más que el pliegue de 40°: saldría una arista horizontal (AS-V18). Con 3 filas son 36,5°. LOD1 usa ≤ 419 tris de 700–800 posibles. **(e)** Acepto los parámetros del arnés de AS-V18: borde de albedo con ΔE76 ≥ 2 dilatado ±1 px, vela visible con ≥ 50 px y caja ≥ 6 × 6, y líneas en k/6. Quedan escritos en AS-V18. Con paños de 4,3 px, las líneas horizontales sobre las velas quedan casi enteras en la máscara, y miden las verticales y el costado. Basta, porque una faceta de sombreado que cruce los paños aparece en las verticales. Pendiente de I2: la franja más ancha del pirata y del capitán baja un poco su fracción oscura (AD-28). La cañonera no tiene portas en el costado y conserva 0,30–0,55·F | §4.2, §4.2.1, §9.1, AD-25; ASSET-SPEC §5, §6, §7, §8.1, §8.2, §8.4, AS-V18–V20 |
| D37 | D36 implementado en `1a3440e`: AS-V19 ≥ 55 % en las 5 clases y AS-V20 pasa a N3. dev-render deja 4 puntos sin bloquear: (1) en los cañones de los extremos, la porta sale de la franja; (2) el Pirata queda −2,6 / −3,0 / −4,6 por debajo de la previsión; (3) el filete de la Fragata cuenta como franja en la máscara de AS-V20; (4) la Balandra da L\* de vela 79,6 a 270° | **(1) Se acepta y corrijo el texto, sin tocar la geometría.** La franja sigue el arrufo y `cannonY` es fijo, así que la porta solo queda contenida en la maestra. En la Fragata a z −11,5 (s = 1,093, calculado con el perfil de §8.1), la franja sube 0,26 m y la porta asoma 0,16 m por debajo (Bergantín 0,05 y 0,07; Balandra y Pirata, 0). En pantalla son 0,57 px a N1 y 0,81 px a 0,7×, y además asoma sobre el casco oscuro, del mismo valor que la porta. Descartadas: una franja recta sin arrufo, que rompería la línea que dibuja el casco, y subir los cañones con el arrufo, que movería los sockets de cañón (§3) para ganar menos de 1 px. **(2) Corrijo mi afirmación de D36.** Fuera de la muestra de validación, el error del modelo llegó a 4,7, en el Pirata y siempre optimista. Con el especular GGX en el modelo (hipótesis de dev-render, comprobada) baja a −0,1 / +1,4 / +3,0 / 0,0 (§9.1). Su margen a 90° (56,2 frente a 55) es menor que la dispersión entre capturas (55,6–57,1), así que **el Pirata pasa a paños de 0,6 m**: cuadras con `nx = max(4, 4·round(w / 2.4))`, cangreja con `round(|AD| / 0.6)` columnas, y foques y latina con filas de 0,75 m. El modelo con GGX da 59,9 / 61,0 a 0° y 90° (+3,1 / +3,4) por 1 131 tris (≤ 2 000). Previsión real ≈ 60 / 59,6, con un margen ≈ 4,6 (HIPÓTESIS). Es P3: puede ir en el mismo lote que el hallazgo de QA sobre los paños, si llega. **(3) La máscara de franja de AS-V20 pasa de ΔE76 ≤ 8 a ≤ 4.** El pase de albedo devuelve el vertex color con un error de redondeo < 1 de ΔE, y el filete `#D9A93F` está a 5,8. El resultado no cambia. **(4) Sin cambio.** AD-10 se mide con rumbo N (83,5) y la separación de facción frente al pirata (≤ 25) sigue siendo > 50 de L\* | §9.1; ASSET-SPEC §8.1, §8.2, §8.4, AS-V19, AS-V20 |
| D38 | Arnés de AS-V20 tras D37 (`b790150`; `qa-artifacts/render/d37/`). Con N3 la porta mide ≈ 2,3 px de alto. (A) Con píxeles puros del pase de ids, a veces queda en una fila de 3 × 1 y cae por la caja ≥ 2 × 2: el Bergantín da a veces 5 de 6. (B) Con cobertura ≥ 50 %, la detección es estable (7/7 corridas), pero los píxeles de borde, que mezclan porta y franja, suben la mediana de L\*: el Pirata baja hasta 13,9. La variación viene de la fase del balanceo, no de la geometría | **Opción C: detecto con la componente al 50 % (como B) y mido el contraste en su núcleo, los píxeles con cobertura ≥ 75 %.** El núcleo debe tener ≥ 2 px; si no, la componente no es legible. El umbral sigue en 15. **No relaja la regla**: el núcleo es lo que A ya medía (píxeles puros, mínimo 16; con el núcleo al 99 %, 18,6). C solo arregla la detección de A, y el contraste baja en B por un artefacto del antialias, no por legibilidad. Verificado con `v20core.py` de dev-render: 52 componentes del Pirata en 13 capturas, mínimo 18,5 con el núcleo frente a 13,9 con la componente entera; ninguno < 15 con C, 2 con B. Sigue rechazando el caso malo conocido: con la franja de 0,25·F no hay píxeles de franja junto a la porta, y eso no depende de cómo se mida la porta. Una porta de un color cercano al de la franja tampoco pasaría, porque su núcleo tiene ese color. Descartada D (cambiar el arte de la franja o de la porta del Pirata): el contraste real, de 18,5 o más, ya pasa con 3,5 de margen | ASSET-SPEC AS-V20 |
| D39 | O-4 de QA-6 (P3; `qa-artifacts/qa/a422dd1/explore/mcp-04-*.png`): el panel del minimapa tapa media placa de un pirata, y el texto del sector, sin fondo, se dibuja encima de ella. Criterio de product: ninguna placa visible cruza la caja del texto del sector ni la del panel del minimapa | **Dos cambios, en la línea de Seafight.** (1) **El sector entra en el minimapa**: pie de 24 px dentro del mismo panel (1240, 64, 184 × 208), con el texto sobre el fondo del panel, como el sector en el marco de la carta de Seafight (R1). Así no queda ningún texto del HUD sin fondo. (2) **Las placas no entran en el HUD** (§11.4): una placa a menos de 8 px de cualquier bloque marcado con `data-hud-block` se oculta en el mismo frame, sin transición, y vuelve a ≥ 16 px con un fundido de 150 ms. Es como el marco de Seafight, que recorta las etiquetas en el borde del mar (R11). Se aplica a todas las placas, también la propia y la del objetivo, porque sus paneles ya dan la vida. **Descartadas**: dar fondo solo al texto, que arregla la mezcla pero deja la placa cortada por el panel; desplazar la placa fuera del bloque, que la separa de su barco, que ya queda tapado; y un fundido de salida, que con 248 px/s (dos barcos a 14 m/s con 0,7×) llega a cruzar el bloque. El Centrar de I2 baja a y = 280. AD-32 lo verifica en 1440×900 y 390×844 (cajas a pasos de 4 px, separación ≥ 8 px y vuelta en ≤ 250 ms) | §11.2, §11.4, §12.1, §12.8, AD-11, AD-32 |
| D40 | O-7 y O-8 de QA-6 (P3; addendum §15, `4750267`). **O-7**: los paños se leen como rayas, no como lona: el perfil de L\* es una onda cuadrada de dos niveles con un periodo de 7–8 px (Pirata 4–5 frente a 15–17), mientras que Seafight es irregular (L\* 4–48), y las rayas eran la seña del Mercante (D9). Se pide una métrica de carácter verificable, conservar AS-V19 ≥ 55 % y devolverle la seña al Mercante. **O-8**: en LOD1 la cubierta usa la tabla clara, +5–6 L\* en 390×844 (ΔE76 5,4–6,2 frente a 2,2–2,9 en `a422dd1`) | **(1) Lona de 3 tonos en bolsas barajadas** para el jugador y la paleta pirata (§9.1; ASSET-SPEC §8.2). Tonos `#FBF3E3` / `#DED7C8` / `#C2BBAC` y `#4A494D` / `#303033` / `#171619`. Cada grupo de 3 paños seguidos es una permutación de los tres tonos, sin repetir el tono del vecino. Paños de 0,55 m (pirata, 0,5 m), y paños radiales en foques y latinas. Lo que rompe el periodo es el orden de los tonos; el ancho del paño apenas influye. **(2) Métrica: AS-V21**, con los descriptores que ya calcula dev-render (`o7-base/scripts/sail-profile.py`), para que QA y dev-render midan lo mismo: η de Otsu por clase ≤ 0,80 (dos niveles) y r de autocorrelación con mediana ≤ 0,40 sobre las 4 clases (periodo), cada uno con ≤ 15 % de velas por encima de 0,85 / 0,70; más una regla de geometría por vela. Calibración: juego actual η 0,88 (0,83–0,89 por clase) y r 0,54–0,55; Seafight η 0,63–0,79 y sin periodo. El modelo reproduce el juego actual (η 0,90, r 0,53). **Previsión (HIPÓTESIS; modelo con GGX y 7 semillas)**: η 0,72–0,75 (0,72–0,76 por clase) y r 0,19–0,26; AS-V19 a 0° / 90° = 69,8–73,0 / 71,1–73,2 · 67,9–69,4 / 68,7–69,4 · 63,4–64,4 / 63,1–63,9 · 61,2–63,8 / 65,5–66,4, con el Mercante sin cambio (69,5 / 60,2); AD-10 del jugador 81,7–83,3 y del pirata 19,0–19,5; tris 978 · 1 524 · 2 440 · 1 122 · 1 645. **(3) El Mercante no cambia**: 2 tonos alternos y franjas azules, la única clase con patrón regular. **(4) O-8: LOD1 pinta la media en pantalla de lo que quita.** La cubierta y las tapas van al albedo del token medio (`#BD8D59`; pirata `#67462D`), es decir, se cambia de token, no se corrige el valor de `deck`, que en LOD0 debe seguir siendo la tabla clara. Las velas van a `sail.lod1` = media lineal de los tonos de LOD0 (`#E0D9C9`, `#353438` y `#E2D7BE`). Tolerancia: AD-25 también en 390×844, con ≤ 4 en LOD1, y AD-33, con un salto de LOD0 a LOD1 ≤ 3 de L\* en la vela y ≤ 3 de ΔE76 en la cubierta (modelo: hoy 4,5–6,2 y 6,0–7,4; con D40, ≤ 2,0 y ≤ 1,2). **Pareto de QA-6, punto 2 (en móvil, 3 de 5 clases en LOD1):** D40 no añade detalle en LOD1, porque a 2,8 px/m los paños serían moiré (D36 b). Lo que arregla en móvil es el color, y la regla se aplica a todo lo que LOD1 simplifica. **Descartadas**: el degradado dentro del paño (Pirata 34–36 % de AS-V19 a 0°), los pliegues superpuestos, el damero 2D, las costuras desplazadas, la concentración espectral como métrica, la textura de ruido y la lona irregular en el Mercante (motivos en §9.1) | §4.2, §4.2.1, §9.1, §10, AD-25, AD-33; ASSET-SPEC §6, §7, §8.2, §8.4, AS-V19, AS-V21 |
| D41 | Revisión del lead de D39 (implementado por dev-render; commit pendiente). (1) En `qa-artifacts/render/o4/mobile-hud-plate-near.png` el aviso «Zona segura» (z 30, 85 % opaco) tapa media placa de un pirata. §11.4 decía que los toasts «ya esquivan las placas (AC-110)», pero no es así: AC-110 solo obliga a la pista a esquivar los avisos, el Centrar y los chips, y la pista esquiva la placa propia y la del objetivo (`Hud.tsx:351-361`). Ningún aviso esquiva placas. (2) El diff pone `visibility: hidden` en la raíz de la placa, y la opacidad 0 y el fundido en los hijos, para no pisar la opacidad del hundimiento, que va en línea en la raíz (`overlays.ts:462`) | **(1) Corrijo mi afirmación de D39: los avisos pasan a ser bloques del HUD en los tres tamaños** (toasts, «Zona segura» y, en móvil, las líneas del feed que se muestran como avisos), y una placa a < 8 px de un aviso se oculta. Motivos: «Zona segura» no es pasajero, porque se queda mientras el barco está en la zona, que incluye el spawn, así que se comporta como un panel. Además, los avisos ocupan ranuras fijas: si esquivaran placas en movimiento, el texto saltaría, y AC-110 pide que se lea completo. Y es el mismo principio de D39: el HUD no se mezcla con las placas. Como entran y salen de golpe, las cajas de bloques también se releen en el commit en que cambia la lista de avisos, como ya hace la pista (O-1), y la placa se oculta desde el primer frame pintado. **Siguen sin ser bloques**: la pista, que es de primera sesión y ya esquiva las placas que importan (la propia y la del objetivo; AC-105), y los chips de borde de I2, de 44–48 px y que se mueven en cada frame, de modo que una lectura a 10 Hz llegaría tarde. Se revisan con QA de I2. **(2) Acepto el desvío** y lo escribo en la spec: `visibility: hidden` en la raíz y la opacidad 0 y el fundido de 150 ms en los hijos. Las dos opacidades se multiplican, así que el hundimiento sigue igual aunque la placa haya estado oculta. AD-32 pasa a medir la opacidad efectiva (raíz × hijos), recorre también la columna de avisos con «Zona segura» visible y añade el caso de un aviso que entra sobre una placa quieta | §11.4, AD-32 |
| D42 | AD-27, espuma (Pareto n.º 3 frente a Seafight). dev-tests implementó D23 tal cual en su copia y lo midió en 12 capturas reales. D23 tal cual pasa 1 de 12 (cobertura 0,00–0,42 %); k1 pasa 11 de 12, y k2 también. Dos preguntas: (1) ¿AD-27 se mide por captura o sobre un conjunto? (2) La espuma sale en bandas diagonales ancladas a la cresta de la ola de 23 m (R 0,91–0,95): ¿entra en esta decisión? **Revisión (2026-10-11)**: dev-tests corrigió su modelo, que rellenaba el color base con los vecinos sin espuma. El nuevo calcula el color completo del shader (IoU 0,957–1,000 en 84 capturas) y probó la fase deformada por ruido (`grid-warp-*.png`) | **(1) Cifras: k1** (§7.3): umbral de h de 0,55 a 0,95, racha de 35 m con umbral 0,60–0,80 y fuerza 0,30; las vetas no cambian. Frente a k2 (fuerza 0,35), k1 deja más margen en ΔL\* (mediana 15,6 frente a 16,4) y en el techo de cobertura (máximo 1,08 % frente a 1,19 %), y es más sutil, en la línea de Seafight. En su captura de referencia (`qa-artifacts/render/escala/ref-seafight-1297031307.jpg`, 3 recortes de mar sin entidades), con el método de AD-27 sale 0,04–0,36 % de «espuma», con un p99 de ΔL\* de 5–9: textura y ruido JPEG, sin cabrillas. **(2) Método: AD-27 se mide sobre un conjunto fijo de 12 vistas** (3 puntos × 4 tiempos, con el reloj del océano fijado), con las condiciones sobre la mediana y guardas por vista. La varianza entre vistas es propia de las rachas. Con el modelo completo, una vista de k1 pasa las tres condiciones en el 80–82 % de los casos (con el desplazamiento, en el 85–87 %), así que 3 capturas sueltas pasan solo en el 51–66 % de las corridas, mientras que la mediana de 12 con las guardas pasa en el 100 % de 20 000 conjuntos. Las guardas siguen pasando el 100 %: en 300 vistas, k1 llega a 1,57 % de cobertura (2,0 de guarda), 29,2 % de celdas vacías como mínimo y ΔL\* 17,5 como máximo. Corrijo las cifras de la primera versión, sacadas del modelo viejo: 85–87 %, 61–66 %, ≤ 1,26 %, ≥ 29 % y ≤ 17,2. La regla sigue rechazando lo malo: hoy (mediana 1,64 % y 0 % de celdas vacías, con la guarda fallando en las 12 vistas) y D23 tal cual (0,11 %). Con vistas y tiempos fijos, el veredicto es reproducible. **(3) Las bandas entran en D42, con el desplazamiento de 18 m** (`h` evaluada en `p + 18·ruido(p/40)`; §7.3). Medido por dev-tests en las 12 capturas reales: R23 0,11–0,41 (mediana 0,22) frente a 0,90–0,92 sin desplazamiento, y pasan las tres condiciones las 12 vistas por separado. Modelo completo: una vista pasa en el 85 % frente al 82 %, y R23 queda en p50 0,25 frente a 0,16–0,17 del control perpendicular. El de 24 m baja algo más R23 (0,20), pero cizalla algunas manchas; el de 14 m deja R23 en 0,37. **Corrijo lo que dije en la primera versión**: escribí que R no servía como métrica porque «mide el anclaje a la cresta». Con las crestas rectas, anclarse a la cresta es formar diagonales rectas, y eso es justo el defecto visible. Con el desplazamiento, la espuma sigue en una cresta local, que serpentea, y R23 cae. R23 pasa así de vigilancia a criterio de AD-27: mediana ≤ 0,40, y ≤ 0,70 en cada vista con ≥ 0,3 % de cobertura. Lo cumple el 99,8 % de los conjuntos (`qa-artifacts/render/d42-espuma/sets_r23.py`), y k1 sin desplazamiento, el 0 %. Coste: 2 `vnoise` y 4 `sin` por píxel de océano, sin draw calls; lo confirma AC-90 (fps en el portátil de referencia, verificación manual). D48 corrige la referencia: decía AC-22, que es el p99 de la ruta en CPU y no depende del shader | §7.3, AD-27 |
| D43 | Jonattan aprobó I2 (Q11). Antes del arte del Capitán y la Cañonera, el lead pide revisar: (1) que `npc_pirate_captain` y `npc_pirate_gunboat` estén completos y sean coherentes con D36–D40; (2) el riesgo de D40 sobre AD-28: el tono claro del pirata (L\* 31) deja ⅓ de su lona fuera de «oscuro»; ¿cambia AD-28 o la paleta?, y que «vela negra = hostil» se lea como en Seafight; (3) marcadores, etiquetas y halo del Capitán (AC-111) sin ambigüedad | **(1) Recetas completadas** (ASSET-SPEC §8.4). Capitán: colores de la paleta pirata más `trim` (antes no estaban escritos), franja de portas de 1,18–2,18 m, **sin foques** (para no confundir su silueta con la de la Fragata), paños de 0,5 m con columnas por vela, LOD1 con `sail.lod1` y cubierta `#67462D`, estandarte conservado en LOD1 y ≈ 2 100 tris (HIPÓTESIS; ≤ 2 500). Arreglo además la frase rota «Franja de portas… : trinquete…», que mezclaba la franja con las velas. Cañonera: 24 y 16 columnas, foque radial, LOD1 con `sail.lod1` y cubierta `#907C61`, y ≈ 1 600 tris (HIPÓTESIS; el ≈ 1 300 era anterior a D36; ≤ 2 000). **(2) La paleta pirata no cambia; AD-28 cambia su firma de valor.** «Vela negra = hostil» lo garantiza AD-10 (L\* medio de vela ≤ 25; D40 da 19,0–19,5). La lona renderizada (p50 19,6, p99 33,4) cae dentro de la lona oscura de Seafight: Rackham L\* 16–46 (§9.1) y 6–29 en el perfil de QA. Oscurecer el tono claro costaría el margen de AS-V19 del Pirata (con `#414044`, 55,3 a 0°, frente a 59,5 con `#4A494D`; D40) y le devolvería el contraste de código de barras. El problema estaba en la firma. Con el tono claro en L\* 26,6–33,8, ningún corte fijo deja de partirlo, y en 390×844 el Pirata (LOD1) y la Cañonera y el Capitán (LOD0) caían en lados distintos del corte. Por eso la fracción L\* ≤ 25 pasa a **L\* medio de la máscara**: con D40, 24,9–26,7 en LOD0 y 25,6–27,4 en LOD1, invariante con el LOD (Δ ≤ 1,1), frente a 43–52 % y 48–65 % con el corte. El conteo de cañones de la Cañonera mantiene su corte de 25, porque es sobre su cubierta clara. Las firmas de la Cañonera y el Capitán se miden cuando exista su arte (HIPÓTESIS: el L\* medio de la Cañonera sube por su cubierta de L\* 56, y el Capitán se separa por su área y por el estandarte en la fracción clara). **(3) Marcadores sin ambigüedad** (§4.3): geometría y tamaños en px CSS (★ de radio 5,5 y 2,2 px; ▬ de 11 × 5 px sin girar), contorno de 1 px `#07121B`, orden de dibujo, y halo como elemento DOM con animación CSS de 1 s, porque el canvas va a ≤ 2 Hz (AC-77) y daría 2 fotogramas por latido. El marcador se ve desde el aviso de aparición hasta el hundimiento, y AD-29 se mide sobre el canvas, sin el halo. Placas con 2 iconos de 12 px; «Capitán pirata» y «Cañonera pirata» nunca se truncan (ancho máximo +14 px; lo comprueba AD-28) | §4.3, §9.1, §10, §11.1, AD-28; ASSET-SPEC §8.4 |
| D44 | dev-render implementó D40 (cumple AS-V21, AD-25 en LOD1 y AD-33, según su entrega; lo verifica el lead) y encontró dos cosas en la spec: (a) ASSET-SPEC §8.4, Pirata, dice `nx = max(4, 4·round(w / 2.4))`, pero la misma línea habla de 16 y 12 columnas y §8.2 usa `/ 2.0`; él implementó `/ 2.0`. (b) AD-33 pide los píxeles puros «del pase de ids», y él usa la máscara de `measureShipValues`, la de AD-10 y AD-25. Además, el lead ve que en la comparativa ×3 las cubiertas se leen como rayas regulares | **(a) Errata mía**: la fórmula buena es `/ 2.0` (16 y 12 columnas, paños de 0,48 y 0,5 m); al pasar de D37 a D40 cambié el texto de las columnas, pero no la fórmula. **(b) AD-33 pasa a decir la máscara de `measureShipValues`**: píxeles con valor pleno en su pase de máscara, vela sin franjas y cubierta con las tablas de LOD0 o la cara lisa de LOD1. Mide lo mismo que el pase de ids y deja un solo arnés para AD-10, AD-25 y AD-33, con el LOD forzado por el argumento `lod`. **(c) Cubiertas: nota de vigilancia** en §9.1, como la de las bandas de espuma. Con los descriptores de AS-V21, a 90°: r 0,88–0,97 y η 0,80–0,91 (las velas daban 0,88 antes de D40). Si QA lo señala, la receta sería la de D40 con la media en el token | §9.1, AD-33; ASSET-SPEC §8.4 |
| D45 | dev-render, al implementar D43, encontró 5 huecos en la receta del Capitán (ASSET-SPEC §8.4 en `63a79a6`) y los tomó de forma provisional: (1) railH 1,0, como la Fragata; (2) cañón de la Fragata, `(0.26, 0.32, 1.6)`, con fogonazo ×1,2; (3) cofas en y = 9,5 y 9,9 por la regla de §8.2; (4) mascarón en LOD1, porque §7 solo conservaba el mortero y el estandarte, pero D43 decía también mascarón y regala; (5) fila roja en `band` y estandarte con los colores de la bandera invertidos, en lugar de la bandera. Además, AS-V08 aserta por `sb_kind` (NPC ≤ 2 000), pero §5 da al Capitán ≤ 2 500 / 800 | **Confirmo (1), (2), (3) y (5); corrijo (4).** (1) railH 1,0 = 0,36·F, igual que la Fragata y en la serie de las demás clases (0,33–0,36·F; la Cañonera, con su borda alta, va aparte con 0,6). (2) Misma F (2,8) y misma `cannonY` (1,68) que la Fragata: mismas medidas, sin tapa interior, porta de 1 quad y fogonazo ×1,2, que VFX-SPEC ya daba («Fragata y Capitán 1,2»). (3) Cofas solo en el trinquete y la mayor, como la Fragata en el código (`topY` 10,3 y 10,7; la mesana sin cofa). (5) Fila inferior en `band #B3261E`; estandarte en `flagMark #F5F1E6` con cuadro en `flag #111111`, y sustituye a la bandera. **(4) El mascarón no va en LOD1**: mide 0,6 m, que son 1,4 px cuando el Capitán cae en LOD1 (con N3, 2,29 px/m y 69 px de eslora, dentro de la banda de histéresis), y no es un rasgo de identidad, como sí lo es el estandarte (AD-28). La regala sí se queda, porque es el color de la borda y no añade geometría. §7 y §8.4 dicen ya lo mismo. Error mío de D43, que escribió «la regala y el mascarón». **AS-V08 se aserta por `assetId`**: `npc_pirate_captain`, con la fila del Capitán (≤ 2 500 / 800); el resto de NPC, ≤ 2 000 / 700. La fila de §5 pasa de «(P2)» a «(I2)» | §10; ASSET-SPEC §5, §7, §8.4, AS-V08 |
| D46 | dev-render, con la geometría del Capitán (2 073 / 392 tris; decía 404, la cifra de antes de quitar de LOD1 el mascarón, una caja de 12 tris (D45); corregido en D48; pasa AS-V19, AS-V21, AC-102 y AD-25), falla AD-10: la lona a 180° da L\* 28,5 frente a ≤ 25. Hipótesis suya: la fila inferior roja (`band #B3261E`, L\* ≈ 40) cuenta como vela, mientras que las franjas azules del Mercante (`sailStripe`) quedan fuera. Además, AD-33 a 90° salta +3,7 L\* (+1,3 en la media de la clase) | **La fila roja es una franja, no lona.** Cumple la misma función que las franjas azules del Mercante: es un acento de color que identifica (§10: «Negras con franja inferior roja»), no el valor de la lona que da la facción. Pasa a ser el `sailStripe` del Capitán (`#B3261E`, el mismo hex que `band`) y queda fuera de AD-10 y AD-33, como en el Mercante. No cambio el tono, el tamaño de la fila ni el umbral: la lona negra es la de la paleta pirata, que en el Pirata da 19,0–19,5. **Previsión (HIPÓTESIS)**: con la fila inferior (¼ de la altura de las cuadras, L\* ≈ 40) fuera de la media, el 28,5 baja a ≈ 20–22, porque 0,75 · 20 + 0,25 · 40 = 25 y la cangreja ya va sin fila roja. dev-render debe volver a medirlo. **AD-33 se aserta en cada rumbo**, no en la media de la clase, porque el salto de LOD se ve en una pose concreta; lo dejo escrito. Es probable que el +3,7 a 90° venga de la misma fila roja, que a 90° ocupa más vela visible. Si tras sacarla sigue por encima de 3, que me lo pase con la captura | AD-10, AD-33; ASSET-SPEC §8.4 |
| D47 | AD-28 no decía en qué px se cuentan los «≥ 20 px» del estandarte del capitán. En 390×844 el lienzo va a DPR 1,5: el estandarte mide 87–112 px de lienzo, que son 39–50 px CSS | **px CSS de área** (px de lienzo ÷ DPR² del lienzo), porque el umbral salió de la medida en CSS (≈ 17 × 6 px a 1,0×, §10) y así no depende del DPR del dispositivo. Hoy pasa con margen (39–50 ≥ 20). Queda anotada la confirmación de la hipótesis de D43 | AD-28 |
| D48 | Cañonera (§8.4, D43) y AD-27 (D42): dev-render construye la Cañonera con 10 lecturas provisionales de huecos de la receta, y dev-tests detecta 2 dudas en D42. (1) Escala del fogonazo; (2) altura de la cureña; (3) cañón con tapa; (4) cofa; (5) cuadro de la bandera; (6) velas; (7) AS-V20; (8) cómo contar los cañones en AD-28; (9) `socket_smoke_02`; (10) `sailStripe` → `palette`; (11) D42 cita AC-22; (12) ¿`h_w` lleva `ampScale`? | **Confirmo las 12 lecturas, con 2 precisiones en (8).** (1) **1,2**: la escala va por el tamaño del barco (28 m, junto al Capitán de 30), no por el calibre. Su daño por bala (20, GDD §9) es menor que el del Pirata (22) y el del Capitán (28), así que un fogonazo mayor que el del jefe daría una pista falsa. (2) **yd + 0,45 es el eje del cañón**, y la cureña apoya en la cubierta, con el centro en yd + 0,25. Si fuera el centro de la cureña, esta flotaría 0,2 m sobre la cubierta. (3) **24 tris, con tapa**: sobre cubierta se ve. Medido en la geometría de dev-render: la batería suma 432 = 12 × (24 + 12), y el barco, 1 624 / 241 (≤ 2 000 / 700). (4) **Sin cofa**: en la paleta pirata solo la lleva el Capitán, y un disco oscuro de 2,5 m taparía la batería, que es la seña de la Cañonera. (5) **0,32·kf = 0,56 m**; el Pirata no cambia (0,32·1,25 = 0,4). (6) **Lisas**: las muescas son del Pirata (§10). (7) **Fuera de AS-V20**, sin asertar «0 componentes». (8) **El método de dev-render vale**: ocultar los cañones en el pase de región es lo que hace que la región incluya su suelo; sin ocultarlos, sale 0. Precisiones: **(a) N3 en lugar de N1**, porque es el menor ppm de escritorio y el de AS-V20 (lo que se cuenta con N3 se cuenta con N1; el modelo da 10–12 con los dos). **(b) El mortero se oculta en las dos pasadas**: oculto solo en la de región, suma una mancha en los 4 rumbos. «Eje mayor» = diámetro de Feret ≥ 4 px. La región va sin erosión: con 1 px de erosión, el conteo baja a 8–10 con N3 y no quita ningún falso positivo, porque no los hay. Modelo (`qa-artifacts/render/d48-canonera/`, balanceo 0 y ±3°): 10–12 manchas por rumbo, todas de un solo cañón. (9) **Sí**: VFX-SPEC §6 ya lo pedía («por socket»). Con las 4 cañoneras, el pico de calidad baja pasa de 336 a ≤ 420 partículas, de 640. (10) **Sí**: es implementación; la spec habla de tokens (`sailStripe`, `deck`), no de campos de la receta. (11) **AC-90**, corregido en la fila D42. (12) **Sí**, ahora escrito en §7.3: la zona segura escala la amplitud de todas las olas (× 0,6). Con `h_w` ≤ 0,6, la espuma de cresta no pasa de ≈ 0,013, y AD-27 mide a ≥ 220 m del puerto, donde el factor es 1. **Errata de D46**: el LOD1 del Capitán tiene 392 tris, no 404 (`getShipModel('captain').triangles` = `[2073, 392]` en HEAD). No cambia ningún veredicto: el techo es 800 | ASSET-SPEC §8.4 (Cañonera) y AS-V20; VFX-SPEC §0.4 y §1; §7.3, AD-28, D42, D46 |
| D49 | H-305 (lead): el aviso del Capitán dice «sector NE» (GDD §9) y el pie del minimapa, «Sector E5» (D39). Son dos vocabularios de sector en pantalla. ¿Unificamos? ¿Cuál? | **Sí. En pantalla, «sector» es solo la celda de la rejilla A–J × 1–10**, la del pie y la de Seafight (R1: «1/4 - 18AK»). Los 4 cuadrantes del GDD se nombran como región, sin la palabra sector ni la abreviatura: «el noreste», «el noroeste», «el suroeste», «el sureste». Aviso: «¡Capitán pirata en el noroeste, sector B2!», con la celda de la guarida calculada con `sectorOf`, la misma función que usa el pie (§12.5). Por qué: (1) el pie está siempre a la vista en escritorio y usa el vocabulario de Seafight; (2) la celda se compara con la del pie, así que el jugador sabe si está cerca (E5 frente a B2); (3) la región funciona sin el pie, que en móvil está oculto, y el marcador del minimapa termina de ubicar al Capitán; (4) «sector NO» se lee como «no». Descarto pasar el pie a cuadrantes («Sector NE · X…»): perdería precisión (un cuadrante mide 500 × 500 m) y dejaría sin uso la rejilla del mar (§7.4). Ancho, con Barlow 500 a 14 px en Chromium: 249 px, y 254 px en el peor caso posible («noroeste, sector J10»). Con el icono de §12.5, el toast deja 308 / 302 / 248 px de texto en 1440×900 / 390×844 / 844×390. Sin icono, como los toasts genéricos de hoy (`Hud.tsx:194`), deja 332 / 330 / 272. Solo con icono y en 844×390 se parte en 2 líneas, sin recortar. El texto actual del GDD mide 286 px. Cambiar el texto del aviso en GDD §9 le toca a product | §12.5, U1; GDD §9 (product) |
| D50 | Release 1.0 (lead): dev-npc implementa la persistencia y necesita tres piezas de HUD. (1) AC-131: overlay de pantalla completa sin entrar al mundo, «No podemos cargar tu progreso ahora mismo» + «Reintentar», coherente con «Sin conexión» (AC-99, AC-126) y, si se puede, con el mismo componente. (2) AC-132: aviso **persistente** con la BD caída en partida, sin tapar el HUD de combate, con `data-hud-block`, comportamiento en 390×844 y salida al volver la BD; la tienda y el cambio de barco, bloqueados. (3) AC-133: texto de la pestaña vieja | **(1) El mismo componente** que «Sin conexión» (§16.2): la tarjeta `.offline` con una tabla de estados. AC-131 no pone velo sobre el juego, porque no lo hay: va sobre el fondo de «Conectando». Título «Progreso no disponible»; texto de AC-131; detalle «Lo que tenías guardado sigue intacto.», que AC-131 garantiza (el registro queda igual byte a byte) y que quita el miedo a perder la Fragata; «Reintentar» con un solo intento a la vez; y «Salir», para no dejar al jugador encerrado. **(2) Aviso persistente en la columna de avisos**, el primero (§12.5): es el sitio que ya ocupan los toasts y «Zona segura», ya es un bloque para las placas (D41), ya tiene posición en los 3 tamaños y no tapa ni los paneles ni la barra de acciones. Tono de aviso (`--ui-gold`, el del oro, que es lo que no se guarda), no de peligro, porque se sigue jugando. Se queda ≥ 3 s y se cierra con «Progreso guardado». Puerto queda deshabilitado; pulsarlo explica el motivo con un toast, porque en móvil no hay `title`. La tienda abierta no se cierra: muestra una franja y bloquea los botones. Descarto: una marca junto al oro (en 184 × 40 no cabe el texto de AC-132) y una franja a todo el ancho (taparía los paneles del jugador y del objetivo). **(3)** «Has abierto el juego en otra pestaña», con el detalle «Tu barco sigue en la otra: solo hay uno por cuenta.» (cubre también el caso de otro dispositivo) y solo «Salir». Desde la landing, «Zarpar» recupera el control. Anchos medidos con las fuentes del HUD en Chromium (`qa-artifacts/render/d50-persistencia/measure.log`): títulos en Pirata One 32 de 262 px como máximo, frente a 318 de texto en 390×844; texto de AC-131 de 314 px a 16 px (cabe con 4 de margen, y si no, se parte); aviso de 224 px. Lo verifica AD-34 | §12.4, §12.5, §13, §14, §16.2, AD-34 |
| D51 | AD-28 con la Cañonera (dev-render, 390×844, en grises; para I2): el Capitán y la Cañonera difieren un 0–11 % en área y un 15–24 % en L\* medio. Solo los separa la fracción clara (98–100 %: el estandarte del Capitán frente a 0 en la Cañonera). La regla pasa con un solo rasgo. ¿Basta o hace falta un segundo rasgo para la Cañonera? | **No basta, pero no hace falta arte nuevo: la Cañonera ya tiene su rasgo y AD-28 no lo medía.** Es la cubierta clara con la batería (D43: «la única con la cubierta clara»), que en grises es una gran superficie gris media. Las firmas actuales no la ven: el L\* medio la diluye entre la lona negra, y la fracción clara empieza en 65, por encima de la cubierta (L\* 56). Por qué un solo rasgo no basta: la fracción clara del Capitán es solo el 2,5–6,2 % de su máscara (el estandarte y la regala). Un humo, una vela o un rumbo de canto la pueden tapar, y entonces nada separaría al jefe (1 800 de vida) de la Cañonera (900). **Cambio (AD-28)**: (1) una 4.ª firma, la **fracción media** (45 ≤ L\* < 65); (2) cada par debe diferir en **al menos 2 firmas**; (3) en las fracciones, también ≥ 1 punto absoluto, porque la diferencia relativa entre fracciones casi nulas es ruido: el Pirata y la Cañonera dan «clara 100 %» con 0 % frente a 0,02 %. Modelo (geometría provisional de dev-render, 390×844 a 4,23 px/m de lienzo, rumbos 45–315° con balanceo 0 y ±3°; `qa-artifacts/render/d51-ad28/`): reproduce lo medido (área 4–12 %, L\* 16–24 %, clara 99–100 %). La fracción media da 3,7–5,9 % en el Capitán y 45–55 % en la Cañonera (diferencia del 87–93 %). Con el corte entre 40 y 50, la diferencia sigue en el 48–94 %. Con la regla nueva, en las 12 poses de cada par: Capitán–Cañonera, 2 firmas (clara y media); Pirata–Cañonera, 2 o 3 (área y media, más el L\* medio en 8 de las 12 poses); Pirata–Capitán, 3 (área, clara y media). Descarto rasgos de arte nuevos (otra bandera, velas distintas): costarían triángulos y una revisión de AD-10, AD-33 y AS-V21 para medir lo que la cubierta ya enseña. La hoja `grises-390x844-x3.png` lo muestra | AD-28 |
| D52 | O-10 (QA-8 §6), redacción de AD-32: desde `5217c1a`, la captura `near` en 390×844 queda a 24 px de «Zona segura», que va bajo el minimapa, y no del minimapa, como decía AD-32 («con un pirata bajo el minimapa»). Además, el cierre de O-10 pide la placa «a ≥ 8 px de cualquier bloque» y el spec aserta ≥ 7 (8 − 1 de redondeo) | **Acepto la redacción de product**: el bloque es el minimapa en escritorio y «Zona segura» en 390×844. **Cifra: de 16 a 32 px al bloque más cercano, con opacidad 1.** Con ≥ 8 px, una placa a 9 px solo se vería si nunca entró en la franja (histéresis de §11.4); 16 es el umbral de vuelta, así que la placa se ve sea cual sea su historia. El tope de 32 hace que la captura muestre de verdad una placa *junto a* un bloque. La pose es fija (24 px, `capture.spec.ts:124`), así que no lleva tolerancia. dev-tests cambia el ≥ 7 por 16–32 | AD-32 |
| D53 | Release 1.0 (Jonattan, por el lead): el login de Clerk no está centrado. Medido en staging: la tarjeta sale en x = 0, y = 0 (Δ del centro −520 / −258 px en 1440×900 y −20 / −230 en 390×844), sobre el azul plano `rgb(15, 63, 92)` y **en inglés** («Sign in to Sea Battle», «Continue»), cuando GDD Q8 dice solo español. Causa: `sign-in` y `sign-up` pintan `<SignIn />` y `<SignUp />` sin contenedor. Piden: centrado con tolerancia en 3 tamaños, el fondo de la landing, textos en español, `appearance` con §13, enlace de vuelta y el hueco de Q25 | **§16.3: la puerta del juego se ve como el juego.** (1) Rejilla de 3 filas que centra la tarjeta exacta (logo arriba y vuelta abajo, en filas de igual altura) sobre `.landing__bg` y `.landing__veil`. En 844×390 la tarjeta mide ≥ 384 px de alto, más que los 358 libres, así que no se puede centrar en vertical: sin logo, arranca a 16 px y hace scroll vertical. Tamaños medidos en staging (`qa-artifacts/render/d53-clerk/shot.log`): `/sign-in` 400 × 384, `/sign-up` 400 × 464 (482 en móvil), y en móvil 350 de ancho. (2) `esES` más 10 claves en tú: `esES` mezcla «Regístrese» con «¿No tienes cuenta?». (3) Tarjeta oscura sólida `#0B1A24`, como las de §16.2, con el título en Pirata One dorado y el botón dorado de «Zarpar». Barlow en todo lo demás. Campos de 44 px con texto de 16. Contrastes (`contrast.log`): texto 15,7:1, secundario 8,7:1, oro 10,5:1, botón 9,7:1 y error 7,0:1. El borde de campo pasa de `--ui-line` (2,3:1, por debajo de 3:1) a `#6A7983` (3,9:1). (4) Logo-enlace y «← Volver a la portada». (5) El aviso de Q25, que aprobó Jonattan, va en `signUp.start.subtitle`: «Guarda tu contraseña: no se puede recuperar», en dorado y encima de los campos (AC-140 e). Responde a la HIPÓTESIS del GDD: Clerk sí deja cambiar ese texto, porque la clave existe en sus tipos (`@clerk/shared`, `signUp.start.subtitle`). AC-140 deja en manos de ux la tolerancia (≤ 2 px) y el margen de 844×390 (16 px). Descarto el pergamino de la tienda: el acceso va antes del juego, junto a los overlays de conexión, que son oscuros. Lo verifica AD-35 | §16.3, AD-35 |
| D54 | Release 1.0 (Jonattan, por el lead): el favicon sigue siendo el de Vercel. `src/app/favicon.ico` es el de create-next-app (25 931 bytes, md5 `c30c7d42…`) y en `public/` quedan los SVG de la plantilla, sin uso. Piden: un icono con la paleta y la identidad, legible a 16 px, los tamaños del App Router (`icon` 32/192/512, `apple-icon` 180 y `favicon.ico` 16 + 32), una regla medible y, si cabe, el manifest. AC-141 c: a 16 px se lee como juego naval y se distingue de otras pestañas | **§13.1: un barco crema y oro sobre el mar de «Conectando».** (1) **Motivo**: el barco del jugador de perfil (velacho, mayor, foque, gallardete, casco con castillo y bauprés), con la proa a la derecha para que la silueta sea asimétrica y se lea como barco y no como un bloque. Sobre `#0F3F5C` con una ola `#1A5F86`. Son 4 colores de la paleta y ninguno nuevo. (2) **16 px a mano**: el SVG reescalado a 16 se emborrona (`hoja-icono.png`: el mástil y el foque se funden). Probé dos mapas: el primero, con las velas a lo ancho, se leía como una tarta de pisos; el elegido deja ver el mástil de oro entre las velas y el foque en diagonal. (3) **Contrastes** (`checks.log`): oro sobre fondo 6,6:1, crema 9,9:1, fondo frente a una pestaña clara 11,1:1, oro frente a una pestaña oscura (`#202124`) 9,6:1. El cuadro no se distingue sobre una pestaña oscura (1,45:1), pero el barco sí. (4) **Maskable**, con el barco al 80 %: radio máximo del motivo de 197,6 px, frente a los 204,8 de la zona segura (en el icono normal llega a 247,5, por eso necesita su variante). **apple-icon** a sangre y opaco: alfa mínima 255. (5) **Sin `icon.svg` servido**, para que la pestaña use el 16 a mano y no el reescalado. (6) **Manifest** con el mismo `themeColor`. Pongo `display: standalone` y `background_color #06111A`, la base de la landing. Descarto una «S» en Pirata One (a 16 px la gótica se empasta), un ancla (genérica: la usan muchas webs) y la calavera (es el pirata, el enemigo). Lo verifica AD-36 | §13.1, AD-36 |
| D55 | dev-render, al implementar el cliente de D50 (capturas en `qa-artifacts/render/d50-cliente/capturas/`), hizo 5 lecturas de la spec y pide confirmación: (1) `data-state` de «Reconectando»: la tabla dice `disconnected`, pero el código de la 1.0 y el e2e de AC-99 usan `reconnecting`; (2) Puerto fuera de la zona con la BD caída: ¿qué aviso sale?; (3) 48 px también con los cortes móviles, porque `pointer: coarse` es inestable en Playwright; (4) «Reintentar» mientras espera, visualmente deshabilitado con `--btn-disabled` pero sin `disabled`; (5) «Progreso guardado» en la pila, detrás de «Zona segura» | **Confirmo 1, 2, 3 y 5, y corrijo el aspecto de 4.** (1) **`reconnecting`**: era una errata mía en D50. Lo comprobé en `game-client.ts:10` y `mobile-robustness.spec.ts:357`. (2) **El aviso del corte**, dentro y fuera de la zona. El de la zona mandaría al jugador al puerto para nada. (3) **Sí**: en pantalla pequeña, un botón de 48 px no estorba. (4) **Sin `disabled` y con `aria-busy` está bien, pero con `aria-disabled="true"` y otro aspecto.** `--btn-disabled` (`#D9CDB0`) es un token del pergamino: sobre la tarjeta oscura parece un botón claro activo, y su texto da 3,2:1. Pasa a fondo `--btn-primary` al 60 % (solo el fondo) con texto pleno (8,2:1) y `cursor: progress`. Bajar la opacidad del botón entero dejaría el texto en 3,3:1. (5) **Sí**: los avisos persistentes siempre van delante, y el toast entra detrás. Los 3 050 ms de un corte de 0,5 s cumplen AD-34: ≥ 3 s visibles, y 2,55 s después de que vuelva la BD (≤ 5). Revisé las capturas de AC-131, AC-132 (aviso y tienda) y AC-133: coinciden con §12.5, §14 y §16.2 | §12.5, §16.2 |

**Abiertas:**

| # | Para | Pregunta | Supuesto en este documento |
|---|---|---|---|
| U6 | `game-developer` | Preset de cámara de `qa:capture` para generar las imágenes de la landing | §16.1 |
| U7 | Jonattan | Licencia: fuentes de Google (OFL) e iconos Lucide (ISC) | Aceptables |
