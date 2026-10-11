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
| `deck` | — | `#C9965E` | `#6E4B30` | `#C9965E` |
| `rail` / `mast` | — | `#6B4426` | `#3A2A20` | `#6B4426` |
| `sail` | — | `#F2EADB` | `#2B2A2E` | `#EADFC6` + franjas `#2F7FB8` |
| `sail.alt` (paneles de lona, D23) | — | `#E1D9CA` (ΔL\* −6) | `#363539` (+5; L\* 22 ≤ AD-10) | `#D9CEB6` (solo en las franjas crema) |
| `deck.alt` (tablas alternas, D23) | — | `#AC7C46` (ΔL\* −10) | `#5C3B21` (−7) | `#AC7C46` |
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
| `deck` (jugador y mercante) | `#C9965E` | `#BD8D59` |
| `deck` (pirata) | `#6E4B30` | `#67462D` |
| `deck.alt` (jugador y mercante) | `#AC7C46` | `#A17442` |
| `deck.alt` (pirata) | `#5C3B21` | `#56371F` |
| `cargo` | `#B07A3E` | `#A5723B` |

### 4.3 Relación (etiquetas, minimapa, barras)
| Relación | Texto/acento | Barra de vida | Icono | Forma en el minimapa |
|---|---|---|---|---|
| **Propio** | `#FFD166` | `#3DDC97` | estrella | ▲ 10 px orientado según el rumbo |
| **Otro jugador** | `#F5F1E6` | `#F5F1E6` | ancla | ● 5 px |
| **Pirata (hostil)** | `#FF7A7A` | `#FF7A7A` | calavera | ◆ 7 px |
| **Mercante (pasivo)** | `#6CC3F5` | `#6CC3F5` | moneda | ■ 6 px |
| **Cañonera pirata (I2)** | `#FF7A7A` | `#FF7A7A` | calavera + bomba (Lucide `bomb`) | ▬ 11 × 5 px (ancha y baja, como su casco) |
| **Capitán pirata (I2, jefe)** | `#FF7A7A` | `#FF7A7A` | calavera + corona | ★ 11 px con halo que late (anillo de r 7 → 12 px, α 0,6 → 0, 1 Hz). **Siempre visible**, también fuera del área de interés (GDD §9) |

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
- Las **fracciones y cocientes** (VFX-09b sobre `A_casco`, AS-V14, VFX-20, AS-V19) no dependen del nivel. VFX-09b usa el ppm de su captura para `A_casco`, y AS-V14 conserva su ppm fijo de calibración (7,2).
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
| Espuma de cresta (D23) | `crest = smoothstep(0.75, 0.95, h) · smoothstep(0.45, 0.65, n_v) · racha · 0.25`. `n_v = vnoise(rot_viento(p) · (1/6, 1/2) + 0.5·drift)`: ruido **estirado 3:1 a lo largo del viento**, que da vetas en lugar de manchas redondas. `racha = smoothstep(0.55, 0.80, vnoise(p/70 + 0.15·drift))`: unas 2/3 partes del mar quedan sin espuma y el resto la tiene en grupos. Antes era `smoothstep(0.72, 0.95, h) · 0.35 · step(0.5, vnoise(p·0.45))`: medias lunas de borde duro, repartidas por igual en todo el mar (QA-REPORT-2026-10-11-3: «repetidas y procedurales»). Lo verifica AD-27 |
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

---

## 10. NPC

| | **Pirata** (hostil) | **Mercante** (pasivo) | **Capitán pirata** (I2, jefe) | **Cañonera pirata** (I2, hostil) |
|---|---|---|---|---|
| Eslora × manga | 20 × 5,0 m (fino, L/B 4,0) | 22 × 7,6 m (panzudo, L/B 2,9) | 30 × 8,0 m | 28 × 10,0 m (**ancha y baja**, L/B 2,8; perfil chato) |
| Francobordo / bauprés | 1,6 / 6,0 m | 2,4 / 4,0 m | 2,8 / 8,0 m | **1,5** / 3,0 m |
| Mástiles | 2, **inclinados 8° a popa**: 16 y 17,5 m | 3 verticales: 16, 17,5 y mesana latina 12 m | 3, inclinados 6°: 21, 24 y 18 m | **1**, inclinado 4°: 16 m |
| Velas | **Negras** `#2B2A2E`: trinquete cuadro con muescas + mayor de cangreja + foque | **Crema con 2 franjas azules** (`#EADFC6` / `#2F7FB8`) + mesana latina | Negras con franja inferior roja `#B3261E` | Negras `#2B2A2E`: **una sola cuadra grande** (11 × 5,6 m) + gavia pequeña + foque. Es la hostil con menos vela |
| Casco | Negro `#2A2523`, franja roja | Marrón claro `#6E4A2C`, franja marfil, popa alta y redondeada | Negro, franja roja, **regala dorada** `#D9A93F` y mascarón dorado | Negro, franja roja, proa y popa romas |
| Cubierta | Despejada | **Carga**: 6 cajas + 3 barriles | Despejada | **Clara** `#9A8466` (L\* 56), con tablas. **Batería de 6 cañones por banda sobre cubierta**, oscuros (L\* 16) sobre claro, y un **mortero** central (disco oscuro de 2,6 m) |
| Bandera | Negra con un cuadro blanco (calavera a esta escala) | Azul con un cuadro blanco | **Estandarte blanco de 6 × 4 m** `#F5F1E6` con un cuadro negro de 2 m: es el **rasgo exclusivo** (≈ 17 × 6 px a 1,0× en 390×844, L\* 95 sobre velas de L\* 17) | Negra con un cuadro blanco |
| Cañones por banda (GDD §9) | 4 | 0 | 6 | 6 |
| Etiqueta | Calavera + coral | Moneda + cielo | Calavera y corona + coral: "Capitán pirata" | Calavera y bomba + coral: "Cañonera pirata" |
| `sb_radius` / colisión (GDD) | 11 m / 6 m | 12 m / 7 m | 16 m / 9 m | 14 m / 8 m |

**Matriz de distinción.** Cada par se distingue por ≥ 2 canales que no son el tono:

| Par | Valor | Silueta | Icono | Tono |
|---|---|---|---|---|
| Pirata vs jugador | Velas L\* 17 contra 93 | Mástiles inclinados, casco fino | Calavera / estrella o ancla | Coral / oro o blanco |
| Mercante vs jugador | Franjas azules en las velas | Casco panzudo, carga en cubierta, 3 palos con latina | Moneda / estrella o ancla | Cielo / oro o blanco |
| Pirata vs mercante | Velas L\* 17 contra 89 | Fino frente a panzudo | Calavera / moneda | Coral / cielo |
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
- **Nombre**: hasta 16 caracteres (GDD §13); el resto se trunca con "…". Color e icono según §4.3.
- **Barra de vida**: el ancho del relleno es `round(64 · hp/max)`. Tras un daño, el tramo perdido queda como "estela" `#FFF2B3` que se encoge en 400 ms. Con vida < 30 % la barra pulsa (opacidad 1 ↔ 0,55 a 1 Hz) y aparece el icono ⚠.
- **Placa propia**: además del indicador de **recarga** (18 × 18 px, a la izquierda de la placa; ver §11.3) y el icono de estado (§12.4).
- **Protección** (GDD §12): escudo + segundos restantes ("🛡 12") en la placa del barco protegido, propio o ajeno.
- **Iconos de estado** (protección, espadas): van en la **2.ª fila, a la derecha de la barra**. No restan espacio al nombre: con 16 caracteres el nombre nunca se trunca por un icono de estado.
- **Ataque en PvP (P1)**: si otro jugador te está atacando, su placa añade el icono de espadas cruzadas y un borde de 1 px `#FF7A7A`.

### 11.2 *Declutter* (a 10 Hz, fuera de React)
1. Se ordenan las placas por prioridad: propio (0) > objetivo (1) > los que te atacan (2) > hostiles a ≤ 80 m (3) > resto por distancia (4).
2. Se coloca cada placa en su posición natural. Si se cruza con una ya colocada, se prueba a desplazarla +18 px y luego +36 px hacia abajo.
3. Si sigue cruzándose y su prioridad es ≥ 2: se compacta a solo la barra (64 × 5 px). Si aún se cruza, se oculta.
4. **Nunca** se ocultan ni se compactan las placas propia y del objetivo.
5. Las placas fuera del viewport se ocultan (`display: none`, y solo se escribe cuando cambia).

**Umbral de AC-76:** con los centros de dos barcos separados ≥ **26 m** (escritorio, 1,0×) o ≥ **52 m** (390×844, 1,0×), ambas placas se ven **completas y sin solape**. Por debajo, el área de solape sigue siendo 0, aunque una se desplace o se compacte. Derivación: placa máxima de 128 px / 5,04 ppm = 25,4 m; 116 px / 2,29 ppm = 50,7 m.

### 11.3 Recarga junto al barco (AC-73)
Es un círculo de 18 px a la izquierda de la placa propia: pista `rgba(255,255,255,.15)` y relleno cónico `#F2C14E` que avanza en sentido horario desde las 12. Se actualiza por frame con `style.setProperty('--p', progreso)` desde `useFrame`. Estados: lleno y cargado → borde de 1 px `#FFD166` con un pulso lento (1,2 Hz); al disparar, destello blanco de 120 ms y vuelta a 0. Solo es visible con el ataque armado o durante la recarga. Avanza de forma monótona.

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
                                          └────────────────────────────┘            └──────────────┘ y:248
                                                                                     Sector E5 · X 12 Z −40
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
| Minimapa (P1) | 1240, 64, 184, 184 | Fondo `ocean.deep` al 90 %, islas `sand`, zona segura discontinua, rectángulo de la vista (1 px blanco al 60 %) y entidades con la forma de §4.3. Canvas 2D a ≤ 2 Hz (AC-77) |
| Coordenadas | 1240, 252, 184, 16 | "Sector E5 · X 12 Z −40" (12 px `--ui-text-dim`) |
| Toast / aviso de zona | 540, 96, 360, 36 (se apilan ≤ 3 hacia abajo con 8 px de separación) | §12.5 |
| Feed (P1) | 16, 772, 360, 112 | 4 líneas de 24 px, 13 px; cada una dura 5 s y se desvanece en 300 ms (AC-78) |
| Barra de acciones | 552, 808, 336, 76 | 5 ranuras de 56×56 con 8 px de separación y 12 px de padding: **Atacar (Espacio) · Reparar (R) · Objetivo (Tab) · Detener (S) · Puerto (P)** |
| Pistas de primera sesión (P1) | centradas, y = 752, ≤ 420 × 40 | Texto 15 px sobre `--ui-panel` con una flecha hacia el elemento. Texto según la entrada: "Haz clic en el agua…" con ratón y "Toca el agua…" con pantalla táctil |

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
| Toasts y aviso de zona | 16, 156, 358, 36. Empiezan por debajo del minimapa, que acaba en y = 148 (D10: con y = 116 se solapaban) |
| **Atacar** | 302, 756, 72, 72 (≥ 64, AC-80). Anillo de recarga de 4 px en el borde |
| **Objetivo** | 234, 776, 52, 52 |
| **Reparar** | 322, 684, 52, 52 |
| **Puerto** | 16, 776, 52, 52 |
| Feed | Oculto: los eventos van como toasts |

Los botones táctiles miden ≥ 48×48 px y están separados ≥ 8 px. Ninguno se solapa con el panel ni con el minimapa (AC-80).

### 12.3 Móvil horizontal 844×390
La columna izquierda (x 12–264) tiene la barra de vida 252×44 y debajo el objetivo 252×48. La derecha (x 580–832) tiene el oro y el minimapa de 72×72 arriba y los botones abajo: Atacar 72×72 en (748, 306), Objetivo y Reparar de 52 en (684, 326) y (768, 238), y Puerto en (12, 326). El centro queda libre para el juego. El círculo de alcance R puede pasar por debajo de las esquinas (AC-24 solo exige 1440×900 y 390×844).

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

### 12.5 Toasts (sustituyen a `alert`)
Fondo `--ui-panel`, borde izquierdo de 4 px según el tipo (info `--ui-info`, éxito `--ui-ok`, aviso `--ui-gold`, peligro `--ui-danger`), icono 16 px + texto 14 px. Duran 3,5 s; como máximo se ven 3 (el más viejo sale). `role="status"` y `aria-live="polite"`. **Seleccionar un objetivo no genera toast ni diálogo**: solo actualiza el anillo y el panel.

### 12.6 Capas (z-index)
canvas 0 · placas 10 · números de daño 15 · HUD 20 · toasts 30 · modal (tienda, muerte, desconexión) 40.

### 12.7 Cursor (escritorio)
Sobre el agua: flecha por defecto. Sobre un barco atacable: mira SVG de 32 px (coral, punto caliente en el centro). Sobre un barco no atacable (zona segura o protegido): `not-allowed`.

### 12.8 Vista libre e indicadores de borde (I2; GDD §5, AC-119, AC-121 y AC-124)
| Elemento | Escritorio 1440×900 | Móvil vertical 390×844 | Móvil horizontal 844×390 |
|---|---|---|---|
| **Botón Centrar** (solo en vista libre; aparece con un fundido de 150 ms) | 1240, 276, 184, 40, bajo las coordenadas y junto al minimapa con el que se mueve la vista: icono Lucide `locate-fixed` + "Centrar" + tecla `C` | 322, 616, 52, 52, encima de Reparar (684) con 16 px de separación: solo el icono | 704, 238, 52, 52, a la izquierda de Reparar (768, 238) |
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

**Iconos**: SVG de línea de 24×24, trazo de 2 px y `currentColor`. Se copian de [Lucide](https://lucide.dev) (licencia ISC) a un módulo propio, sin dependencia en tiempo de ejecución: `anchor`, `skull`, `coins`, `star`, `crosshair`, `wrench`, `shield`, `sailboat`, `swords`, `octagon-x` (detener), `store` (puerto), `settings`, `wifi`. La corona del capitán es un SVG propio.

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

## 16. Landing, "Conectando" y "Desconectado"

### 16.1 Landing (`/`)
| Elemento | Escritorio 1440×900 | Móvil 390×844 |
|---|---|---|
| Fondo | Captura del motor en WebP de 1920×1080, ≤ 220 KB: cámara de presentación (elevación 40°, **`ppm = 8,06` fijo** = 1,6 × 5,04, la base de R = 80 m; no cambia con U8 para conservar la composición aprobada en D14; con el ppm₀ de N1 saldría un 23 % más cerca, D28), una Fragata y un pirata intercambiando andanadas con humo y una isla con palmeras en una esquina. Se genera con `npm run qa:hero`. `priority` (LCP). **Estado: provisional** (D14). El peso vigente es el del último `qa:hero` (la columna fija los topes: ≤ 220 KB y ≤ 120 KB). Para aceptarla como definitiva hay que regenerarla tras D22, porque el pirata de la portada está al 22 % de vida y le afectan el humo y las llamas nuevas. Además debe cumplir VFX-21 (humo de andanada) sin líneas de rejilla falsas | Recorte vertical de 828×1792, ≤ 120 KB |
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
| AD-10 | Facción por el valor de las velas | L\* medio de los píxeles de vela en una captura con el nivel más cercano (0,7×) y rumbo N | Pirata ≤ 25; jugador y mercante ≥ 80; el mercante muestra franjas azules | AC-72 |
| AD-11 | Las placas no se solapan | Intersección de los `getBoundingClientRect()` de las placas visibles en 20 capturas de combate | Área de solape = 0 px²; placa propia y de objetivo siempre visibles | AC-76 |
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
| AD-25 | Albedo compensado | ΔE76 entre el color medio de la tapa de la playa o de la cubierta en la captura y su token de §4.2.1 | ≤ 6 | — |
| AD-26 | **Escala del barco inicial** (D23; U8 cerrado, D26) | `measureShipValues` (vela + cubierta + casco) con el zoom por defecto de una sesión nueva (Balandra, cañón de 8 lb) en 1440×900, rumbos 0/90/180/270° | ≥ 1 900 px en el peor rumbo: paridad con el barco del jugador en Seafight (2 000–2 018 px² en dos capturas, `qa-artifacts/render/escala/`), con un margen del 5 % por la incertidumbre de la máscara de un JPEG. Hoy: 1 310 px a 0°. Con R = 65: 1 980 px | AC-24 (revisado) |
| AD-28 | **Hostiles distinguibles en grises** (I2; AC-115) | 390×844, zoom 1,0×, rumbos 45 / 135 / 225 / 315°, captura en L\*. Máscara de cada barco = píxeles que cambian al ocultarlo. Firmas: área (px), fracción oscura (L\* ≤ 25) y fracción clara (L\* ≥ 65) | En cada rumbo y para cada par de {pirata, cañonera, capitán}, al menos una firma difiere ≥ 30 % (\|x − y\| / máx ≥ 0,30). Además: el estandarte del capitán da ≥ 20 px con L\* ≥ 80 en cada rumbo, y en 1440×900 se cuentan ≥ 8 cañones de la cañonera (manchas con L\* ≤ 25 y ≥ 4 px de largo sobre su cubierta) | AC-115 |
| AD-29 | **Minimapa: 6 formas** (I2; AC-115) | Plantilla de cada marcador de §4.3 dibujada aparte a 4×. En una captura del minimapa (escritorio y móvil), correlación cruzada normalizada en grises de cada marcador con las 6 plantillas | Con la suya ≥ 0,90 y con cada una de las otras ≤ 0,80. El capitán se ve en el minimapa desde cualquier punto del mapa | AC-115, AC-111 |
| AD-30 | **Vista libre** (I2) | e2e con el barco propio fuera de pantalla en 8 direcciones y en los 3 viewports | El indicador es visible y apunta al barco con ≤ 10° de error, no se cruza con ningún bloque del HUD, y el botón Centrar solo existe en vista libre | AC-119, AC-121 |
| AD-31 | **Indicador de atacante** (I2; D26) | e2e: un barco te dispara desde fuera de la pantalla (8 direcciones; 3 viewports), y otro caso con 2 atacantes | Aparece ≤ 100 ms después del primer `volley`; apunta al atacante con ≤ 10° de error; desaparece a los 3,0 ±0,2 s del último disparo; no se cruza con el HUD ni con otro chip; 0 commits de React por frame. En grises, la correlación normalizada entre el chip de atacante y el del barco propio es ≤ 0,80 | AC-124 |
| AD-27 | **Espuma natural** (D23) | Capturas de mar abierto a 1,0× (`desktop-open-sea`, `d-ocean-a/b`), sin HUD, barcos ni islas. Espuma = píxeles de agua con L\* ≥ mediana + 10. Celdas de 240×110 px con ≥ 85 % de agua | Cobertura entre 0,3 % y 1,2 %; **≥ 40 % de las celdas sin espuma** (< 0,1 %); mediana de ΔL\* de la espuma ≤ 20. Hoy: 1,8–3,0 %, 0–17 % de celdas sin espuma y ΔL\* 22–26 | — |

---

## 19. Dependencias y preguntas abiertas

**Resueltas con `game-product`** (aplicadas en el GDD el 2026-10-10):

| # | Decisión | Dónde |
|---|---|---|
| U1 | Pantalla: +X a la derecha (Este) y **−Z arriba (Norte)**. Sectores NE = (x+, z−), NO = (x−, z−), SO = (x−, z+), SE = (x+, z+) | GDD §4 |
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
| D13 | Q10: el humo denso del pirata no se distingue y sube solo 4,8 m | Humo claro (`#B8B3AC` / denso `#8A8580`, L\* ≥ 55) que sube hasta la punta del mástil más alto (cinemática escalada con `sb_mast_height`). El oscurecimiento medido (43 → 6) no se explica con mezcla alfa normal: **HIPÓTESIS**, la muestra con VFX se leyó de un render target lineal (6/255 lineal ≈ 42 sRGB). Falta el resto del reporte de dev-render para confirmarlo | VFX-SPEC §6, VFX-20 |
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
| D28 | dev-render, al empezar U8: ¿qué ppm base usan la portada y AS-V14? | **Portada**: ppm fijo de 8,06 (= 1,6 × 5,04), así no cambia la composición aprobada (D14). **AS-V14**: ppm fijo de 7,2 (= 5,04 / 0,7), con el que se calibró; es un cociente de geometría. **Corrección de D26**: las reglas en px absolutos se miden en el peor caso, N3 (5,04 / 2,29), no con «el ppm₀ de la sesión», que con N1 sería el caso fácil. AD-26 mide N1. Las fracciones no dependen del nivel | §6.2, §16.1; ASSET-SPEC AS-V14 |

**Abiertas:**

| # | Para | Pregunta | Supuesto en este documento |
|---|---|---|---|
| U6 | `game-developer` | Preset de cámara de `qa:capture` para generar las imágenes de la landing | §16.1 |
| U7 | Jonattan | Licencia: fuentes de Google (OFL) e iconos Lucide (ISC) | Aceptables |
