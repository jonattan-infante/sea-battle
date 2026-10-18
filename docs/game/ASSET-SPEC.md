# Sea Battle — Especificación de assets (contrato del motor)

> Autor: `game-ux` · v1.0 · 2026-10-10 · **v1.1 · 2026-10-17**: Goleta, Navío de línea y Galeón del tesoro, libreas como mecanismo interno, 16 islas de un círculo en 5 arquetipos y puerto con amarres (D64, D66–D68; fase 2 ajustada a las cifras finales del GDD) · Consumidores: `game-developer`, `game-qa`
> Motor: three.js 0.180 + React Three Fiber. Números de juego: [`GDD.md`](./GDD.md) (§4, §6, §9). Estética: [`ART-DIRECTION.md`](./ART-DIRECTION.md).
> **Regla de oro:** el modelo procedural del MVP y un `.glb` futuro cumplen el **mismo contrato**: ejes, escala, pivote, sockets, `extras` y presupuesto. Cambiar uno por otro no toca la lógica (CLAUDE.md, regla 5). Las reglas verificables llevan id `AS-Vnn` (§11).
> **Citas** (BACKLOG, «Convenciones»): los otros documentos se citan por sección o id (GDD §13, AS-V22, D51, AC-159), nunca por línea. En el código, salvo que la cita diga otra cosa, las `ruta:línea` de `src/`, `server/`, `e2e/` y `scripts/` son del tag `v1.0.2` (como en el GDD); las de `node_modules/three`, de three 0.180.0; y las de clerk-js, de la versión que dice cada cita. Los scripts de `scripts/ux/` se citan por nombre y sección de su salida.

## 0. El contrato en una tabla

| Aspecto | Contrato |
|---|---|
| Formato | glTF 2.0 binario (`.glb`); en el MVP, `THREE.Object3D` procedural con la misma jerarquía |
| Ejes | Dextrógiro, **+Y arriba, +Z = proa, −X = estribor, +X = babor** |
| Unidades | **1 u = 1 m**. Escala de la raíz = 1 |
| Pivote | Origen en la **línea de flotación** (y = 0), en el centro de la eslora del casco y de la manga |
| Draw calls | **1 por barco** (1 malla, 1 primitiva, 1 material por LOD) |
| Material | `MeshStandardMaterial` con vertex colors (`COLOR_0`, lineal), rugosidad 0,85, metalicidad 0, `DoubleSide`, opaco. **Barcos**: `flatShading: false` con normales con pliegue de 40° (`NORMAL` del GLB o `BufferGeometryUtils.toCreasedNormals(g, 40°)`, `BufferGeometryUtils.js:1316`). **Islas y estáticos**: `flatShading` (D23) |
| Texturas | 0 en el MVP. GLB futuro: ≤ 1 atlas en potencia de 2, KTX2 |
| Sockets | Nodos vacíos con nombre fijo: cañones por banda, humo, fuego, etiqueta, estela, proa |
| Metadatos | `extras` de la raíz con dimensiones y radios (§4) |
| LOD | 2 niveles, elegidos por **px proyectados**, no por distancia (cámara ortográfica) |

---

## 1. Formato y archivos

| Regla | Valor |
|---|---|
| Ruta | `public/models/<id>.glb` |
| Id | `snake_case` ASCII: `<tipo>_<nombre>` (`ship_sloop`, `npc_pirate`, `prop_palm`) |
| Compresión de geometría | `EXT_meshopt_compression`. El decodificador ya está en `three/examples/jsm/libs/meshopt_decoder.module.js`. Se admite `KHR_mesh_quantization` |
| Compresión de texturas | `KHR_texture_basisu` (KTX2: ETC1S para *base color*) con `KTX2Loader` |
| Prohibido | Cámaras, luces, skins, morph targets, animaciones en la raíz, `alphaMode` ≠ `OPAQUE`, planos con textura que imitan un modelo (el bug actual del PNG con fondo blanco) |

---

## 2. Ejes, unidades, pivote y rumbo

### 2.1 Ejes (cita de la fuente)
> "glTF uses a right-handed coordinate system. glTF defines +Y as up, +Z as forward, and -X as right; the front of a glTF asset faces +Z." — [glTF 2.0 §3.4](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
>
> "The units for all linear distances are meters." — misma fuente

Verificación independiente en three 0.180: `Object3D.lookAt()` orienta el **+Z local** de los objetos que no son cámaras hacia el punto (`node_modules/three/src/core/Object3D.js:688-694`: `_m1.lookAt( _target, _position, this.up )`). Por eso `barco.lookAt(destino)` apunta la proa al destino sin correcciones.

```
Vista superior del asset (desde +Y)           En pantalla (cámara de ART-DIRECTION §6:
                +Z  PROA                       arriba = −Z, derecha = +X)
                 ▲
                ╱ ╲                                 un barco con rumbo +Z se ve con la
   BABOR  +X ◄─┤ O ├─► −X  ESTRIBOR                 proa hacia ABAJO de la pantalla
                │   │      (la derecha mirando
                 ╲_╱        hacia la proa)
                 POPA (−Z)        O = origen
```

### 2.2 Pivote y línea de flotación
- `y = 0` es la línea de flotación. El casco baja hasta `−D` (calado modelado, §8.4), suficiente para que con el balanceo (±4°) y la escora del hundimiento nunca se vea el corte del casco.
- El océano es opaco y se dibuja antes que los barcos. Lo que está bajo `y = 0` queda oculto por la prueba de profundidad, y el hundimiento lo aprovecha (VFX-SPEC §7).
- El origen está en `z = 0`, en el centro de la eslora del casco **sin bauprés**. La eslora del GDD es la del casco.

### 2.3 Rumbo → rotación
**Contrato:** `forward = (sin ψ, 0, cos ψ)` y `rotation.y = ψ`. ψ = 0 apunta la proa a +Z y crece hacia +X.
- Ya es la convención del código: `src/game/vec.ts:13-19` dice "Rumbo 0 = proa hacia +Z; crece hacia +X (igual que rotation.y en three.js)", con `forward = { x: sin(h), z: cos(h) }`.
- Con la cámara de ART-DIRECTION §6, un ψ creciente gira en sentido **antihorario en pantalla**. El GDD §4 ya está alineado con esto.
- La simulación 2D usa `(x, z)` del mundo.

---

## 3. Jerarquía, nombres y sockets

```
<id>                         raíz · transform identidad · extras (§4)
├── <id>_lod0                Mesh · 1 primitiva · 1 material
├── <id>_lod1                Mesh · 1 primitiva · 1 material (oculto según §7)
├── socket_cannon_port_01…N  vacíos · babor (+X) · 01 = el más a popa (z menor)
├── socket_cannon_stbd_01…N  vacíos · estribor (−X) · mismo orden
├── socket_smoke             vacío · humo con vida ≤ 50 %
├── socket_fire_01…03        vacíos · fuego con vida ≤ 25 %
├── socket_label             vacío · números de daño e iconos de estado
├── socket_wake              vacío · popa en la flotación (estela)
└── socket_bow               vacío · proa en la flotación (bigote de proa)
```

| Socket | Posición | Orientación (+Z local) | Lo usa |
|---|---|---|---|
| `socket_cannon_port_NN` | `x = +(a(u)·B/2 + 0.30)`, `y = 0.60·F`, `z` de la tabla de clase (§8.4); `u = z/L` | Hacia afuera: `rotation.y = +π/2` (+Z → +X) | Fogonazo, humo, salida de la bala |
| `socket_cannon_stbd_NN` | Igual, con `x` negativa | `rotation.y = −π/2` (+Z → −X) | Igual |
| `socket_smoke` | `(0, yd(−0.15) + 0.5, −0.15·L)` | — | VFX-SPEC §6 |
| `socket_smoke_02` (opcional; solo la cañonera, D25) | `(0, yd(+0.20) + 0.5, +0.20·L)` | — | Segunda columna de humo: su huella `L·B` (280 m²) es grande para su mástil de 16 m |
| `socket_fire_01` / `_02` / `_03` | `(+0.2·B, yd(+0.25)+0.3, +0.25·L)` / `(−0.2·B, yd(0)+0.3, 0)` / `(0, yd(−0.30)+0.3, −0.30·L)`, salvo las excepciones de abajo (AS-V17) | — | VFX-SPEC §6 |
| `socket_label` | `(0, h_max + 1.5, 0)`; `h_max` = mástil más alto | — | Números de daño, icono de protección (VFX-SPEC §9) |
| `socket_wake` | `(0, 0, −L/2)` | +Z hacia proa | Estela (VFX-SPEC §8) |
| `socket_bow` | `(0, 0, +L/2)` | +Z hacia proa | Bigote de proa |

- `yd(u) = s(u)·F` es la altura de cubierta en `u = z/L` (perfil de §8.1, interpolación lineal).
- **Excepciones de `socket_fire_NN`** (D22). Con la fórmula, la elipse de fuego (0,06·L × 0,15·B, VFX-SPEC §6) caía sobre objetos de cubierta: Mercante `_02` (caja, 26 %) y `_03` (castillo de popa, 93 %); Fragata `_01` (castillo de proa, 20 %) y `_03` (alcázar, 100 %); Bergantín `_03` (camareta, 33 %); Balandra `_03` (camareta, 13 %). Las llamas nacían dentro del objeto y la prueba de profundidad las tapaba. Posiciones corregidas, todas con 0 % de solape:

| Clase | Socket | Posición |
|---|---|---|
| Balandra | `_03` | `(0, yd+0.3, −4.4)` |
| Bergantín | `_03` | `(0, yd+0.3, −6.0)` |
| Fragata | `_01` | `(+1.72, yd+0.3, +7.4)` |
| Fragata | `_03` | Sobre el alcázar: `(0, 5.06, −12.5)` (tapa en 4,76 + 0,3) |
| Mercante | `_02` | Sin cambio: se mueve la carga (§8.4) |
| Mercante | `_03` | Sobre el castillo de popa: `(0, 4.95, −8.3)` (tapa en 4,65 + 0,3) |

- La **placa de nombre** no usa socket: se ancla debajo del casco con `sb_length` y `sb_beam` (ART-DIRECTION §11.1).
- La **banda que dispara** es la que mira al objetivo: babor si `dot(objetivo − pos, +X_mundo_del_barco) > 0`; si no, estribor.
- Los sockets son hijos directos de la raíz (no de un LOD), así que sobreviven al cambio de LOD.

---

## 4. Metadatos (`extras` de la raíz → `userData`)

`GLTFLoader` copia los `extras` de cada nodo a `object.userData` (`GLTFLoader.js:2382-2388`, `assignExtrasToUserData`). El procedural escribe el mismo objeto en `root.userData`.

```json
{
  "sb_version": 1,
  "sb_kind": "ship",               // ship | npc | island | prop
  "sb_id": "ship_frigate",
  "sb_length": 34.0,               // L, eslora del casco (m)
  "sb_beam": 8.6,                  // B, manga máxima (m)
  "sb_freeboard": 2.8,             // F (m)
  "sb_draft": 1.5,                 // D modelado (m)
  "sb_mast_height": 27.0,          // h_max sobre la flotación (m)
  "sb_radius": 18.0,               // L/2 + 1: radio del anillo de selección (× 1,1) y del cálculo del declutter
  "sb_pick": [7.0, 27.0, 17.0],    // semiejes de la caja de selección: [máx(B/2, media verga), alto, L/2]
  "sb_cannons_per_side": 8,
  "sb_lod_px": [72, 64]            // umbrales de LOD en px de eslora (§7)
}
```
`sb_radius` es visual. El **radio de colisión** es el del GDD (§6 y §9) y vive en la simulación, no en el asset.

**Claves de la 1.1** (opcionales; solo los assets que las usan):

| Clave | Asset | Contenido |
|---|---|---|
| `sb_livery_slots` (D66) | Barcos con libreas | `["band", "trim", "flag"]`: las ranuras que pinta el atributo `_livery_slot` (§6). Sin la clave, el barco no admite libreas. En la 1.1 solo la lleva el Galeón (mecanismo interno; el jugador no elige aspecto, GDD Q28) |
| `sb_collider` (D67) | Islas y puerto | `[x, z, r]` en metros del mundo: el círculo de colisión, **el mismo dato** que la simulación importa de `src/game/constants.ts` (GDD §4). La receta visual se construye a partir de él, así que no pueden divergir. Es también la forma del sombreado del agua y el disco del minimapa |
| `sb_archetype` (D67) | Islas y puerto | `port` · `tropical` · `rocky` · `reef` · `pirate_cove` (ART-DIRECTION §8.3) |
| `sb_variant` (D67) | Islas con variante | `village` (T1, T2) · `stack` (I2) · `volcano` (I3) · `cliff` (I4). Sin la clave, la receta base del arquetipo |

---

## 5. Presupuestos

| Tipo | LOD0 (tris) | LOD1 (tris) | Draw calls | Materiales | Textura (GLB) | Tamaño GLB |
|---|---|---|---|---|---|---|
| Barco del jugador (por clase) | ≤ 2 500 | ≤ 800 | 1 | 1 | ≤ 1024² KTX2 | ≤ 350 KB |
| Barco NPC | ≤ 2 000 | ≤ 700 | 1 | 1 | ≤ 512² | ≤ 250 KB |
| Capitán pirata (I2) | ≤ 2 500 | ≤ 800 | 1 | 1 | ≤ 1024² | ≤ 350 KB |
| Isla (r = 28–55 m), con rocas y arbustos | ≤ 900 | — | 0 propias: se fusionan en la geometría estática del mapa | Compartido | ≤ 512² | ≤ 150 KB |
| Puerto (isla + pueblo + muelles) | ≤ 2 000 | — | Fusionado con las islas | Compartido | ≤ 512² | ≤ 200 KB |
| Palmera | ≤ 100 | — | 1 en total (`InstancedMesh`) | Compartido | — | ≤ 20 KB |
| Boya | ≤ 48 | — | 1 en total (`InstancedMesh`) | Compartido | — | — |
| Caja de restos (P1) | ≤ 48 | — | 1 en total (`InstancedMesh`) | Compartido | — | — |
| **1.1** · Barco del jugador grande, L > 34 m (D64: el Navío de línea, `ship_line`) | ≤ 3 200 | ≤ 1 000 | 1 | 1 | ≤ 1024² | ≤ 400 KB |
| **1.1** · Galeón del tesoro (`npc_merchant_galleon`, NPC de evento, P2) | ≤ 2 800 | ≤ 900 | 1 | 1 | ≤ 1024² | ≤ 400 KB |
| **1.1** · Islas por forma (D67; ART-DIRECTION §8.3) | Tropical: I1 ≤ 900, I5 e I6 ≤ 700 · islote habitado (T1, T2) ≤ 900 · rocosa: peñón I2 ≤ 1 000, volcán I3 ≤ 1 500, acantilado I4 ≤ 1 200 · escollo ≤ 150 cada uno · cala pirata ≤ 900 cada una | — | 0 propias: fusionadas | Compartido | ≤ 512² | ≤ 150 KB |
| **1.1** · Puerto (D68; sustituye a la fila de arriba) | ≤ 3 000: muelle, cantil, 12 pantalanes con norays, astillero, faro, almacenes, grúa, capitanía y casas. Sin barcos de decorado | — | Fusionado con las islas | Compartido | ≤ 512² | ≤ 250 KB |
| **1.1** · Geometría estática total (las 16 formas) | ≤ 16 000 (GDD §16). Con los presupuestos por forma de arriba, ≤ 14 850. Hoy, 3 090 (medido) | — | **1** | Compartido | — | — |

**Medido hoy** (2026-10-17, `qa-artifacts/render/r11-fase1/`, script de `tsx` sobre `buildIslands(ISLANDS)` y `getShipModel` del código de la 1.0.2, igual en el worktree y en el árbol principal): islas PORT 650 · I1 480 · I2 380 · I3 580 · I4 412 · I5 294 · I6 294 (total 3 090); 45 palmeras de 54 tris (2 430); 24 boyas de 30 (720); barcos LOD0 / LOD1: Balandra 978 / 196, Bergantín 1 524 / 298, Fragata 2 440 / 419, Pirata 1 122 / 236, Mercante 1 645 / 405 y Capitán 2 073 / 392 (la Cañonera de I2, 1 624 / 241, en `85ab00b`). En escena, la última medida de QA (QA-12, AC-89) da **51 draw calls y 72 526 tris** con 41 barcos, y AC-90 da 120 fps con un p95 de 2,55 ms por frame en el M4 Pro.

**Escena estándar (AC-89 y AC-175: 20 jugadores + 20 NPC + islas), peor caso con todo en LOD0.** La columna de la 1.0.2 usa lo medido donde lo hay; la de la 1.1, los presupuestos de la tabla de arriba.

| Elemento | Draw calls (1.0.2 / 1.1) | Tris 1.0.2 (41 barcos) | Tris 1.1 (44 entidades) |
|---|---|---|---|
| Océano | 1 | 2 | 2 |
| Islas + puerto (estático fusionado) | 1 | 3 090 (medido) | ≤ 16 000 (GDD §16; ≤ 14 850 con los presupuestos por forma) |
| Palmeras / boyas / restos | 3 | 2 430 + 720 (medido) + restos | ≤ 4 320 + 720 + restos |
| Barcos | 41 / 44 | ≤ 41 × 2 500 = 102 500 | 113 300 (desglose abajo) |
| VFX (VFX-SPEC §0.2) | 7 pools (tope 11) | ≤ 6 000 | ≤ 6 000 |
| **Total** | **53 / 56** (≤ 57 / 60 con el tope de VFX) | **≈ 114 700 + restos** | **≈ 140 300 + restos (56 %)** |
| Presupuesto GDD §16 | ≤ 100 | ≤ 250 000 | ≤ 250 000 |

Restos: 36 tris por caja; si los 44 barcos dejaran los suyos a la vez, 1 584 (HIPÓTESIS de tope), que no cambia ninguna conclusión. La medida real de QA-12 (AC-89, 1.0.2) es de **51 draw calls y 72 526 tris**: el peor caso de arriba es una cota, no una predicción. Margen en la 1.1: 44 draw calls. Si alguna vez hay > 60 barcos, se pasa a un `InstancedMesh` por (clase, LOD), con el destello de impacto como atributo de instancia.

**Desglose de los barcos de la 1.1** (GDD §13 y §16: 44 entidades con el galeón y su escolta): los 20 jugadores en Navío (20 × 3 200 = 64 000); 8 piratas, 4 cañoneras y 8 mercantes a 2 000 (40 000); el Capitán (2 500); el Galeón (2 800) y sus 2 escoltas (4 000): **113 300**. Las palmeras pasan de 45 a ≤ 80 por las de T1, T2 y las calas. Las libreas, las islas y el puerto no suman draw calls. Son las cifras de GDD §16. Lo verifica AC-175 con `renderer.info` (AC-89) y AS-V25.

---

## 6. Materiales y color

| Regla | Detalle |
|---|---|
| Material único | `new MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.85, metalness: 0, side: DoubleSide })` para islas y estáticos. **Barcos** (D23): el mismo con `flatShading: false`, y la geometría fusionada del barco pasa por `toCreasedNormals(g, 40° en radianes)` antes de generar los LOD. Así desaparecen las bandas de facetas del casco y de la panza de las velas, y siguen duros los cantos de cubierta, borda y franjas. `DoubleSide` porque las velas son planos; el casco es cerrado y su sobrecoste es despreciable |
| Material por barco | Se clona por instancia de barco (mismo programa de shader, uniforms propios) para el destello de impacto `uHit` y el oscurecimiento `uDamage` (VFX-SPEC §5) vía `onBeforeCompile` |
| Espacio de color | Los hex de ART-DIRECTION §4 son sRGB. **`COLOR_0` es lineal**: "COLOR_0 … acts as an additional linear multiplier to base color" ([glTF 2.0](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)). En el procedural, `new THREE.Color(hex)` ya convierte a lineal (`ColorManagement.enabled = true` por defecto, `ColorManagement.js:21`), así que se escriben `c.r, c.g, c.b` en el atributo |
| Máscara de borde (D18) | Atributo por vértice `_rim_mask` (escalar float; en el GLB se llama `_RIM_MASK`, que `GLTFLoader` pasa a minúsculas, `GLTFLoader.js:4836`). Vale **1** en el casco (*loft*, borda, castillos y camaretas) y **0** en todo lo demás (mástiles, vergas, botavaras, picos, bauprés, cofas, velas, cañones, portas, banderas, carga). Lo usa el borde de protección (VFX-SPEC §12) |
| Color por pieza | Cada pieza tiene un único color; las caras de una pieza no mezclan colores. Excepciones: el casco (por banda, §8.1), las cajas con tapa (tapa = `deck.mid`, D62), las velas a franjas (por fila de vértices), las **tablas de cubierta y de las tapas de castillos y camaretas** (`deck` / `deck.mid` / `deck.alt` por tira, §8.2.2) y los **paños de lona** (D23, D36, D40; recetas en §8.1–8.2): en el jugador y la paleta pirata, 3 tonos `sail` / `sail.mid` / `sail.alt` en bolsas barajadas, por columna en cuadras y cangrejas y por paño radial en foques y latinas; en el Mercante, `sail` / `sail.alt` alternos, por columna en las cuadras y por fila en foque y latina. **En LOD1** (D40), las velas lisas van en `sail.lod1` y la cubierta y las tapas lisas en el albedo de la media de las tablas (§7). **Oclusión horneada** (D23): multiplicador de `COLOR_0` ×0,85 en la tira de cubierta junto a la borda, en la base de mástiles y castillos (primeros 0,4 m) y en el vértice inferior de la cara V2–V3 del casco |
| Ranura de librea (1.1; D66; mecanismo interno: en la 1.1 solo la usa el Galeón, para su franja de oro sobre la receta del mercante) | Atributo por vértice `_livery_slot` (float; en el GLB, `_LIVERY_SLOT`): **0** = fijo, **1** = franja de portas, **2** = regala o filete, **3** = bandera o gallardete. El material del barco, que ya se clona por instancia (fila de arriba), recibe `uLivery[3]` (vec3, lineal) y en el vertex shader multiplica el color: `vColor *= slot == 1 ? uLivery[0] : slot == 2 ? uLivery[1] : slot == 3 ? uLivery[2] : vec3(1.0)`. Cada `uLivery[k]` = color de la librea ÷ color por defecto de la ranura, canal a canal en lineal; así la oclusión horneada (×0,85) se conserva y con la librea por defecto el factor es exactamente 1, sin cambio de píxeles. Los colores por defecto de las ranuras tienen todos los canales lineales > 0. Alternativa equivalente si dev la prefiere: un `COLOR_0` por librea que comparte `POSITION` y `NORMAL`. Las dos dan 0 draw calls y 0 programas de shader nuevos. Lo verifica AS-V23 |
| Emisivos | No hay: los faroles y ventanas usan el vertex color `#FFE9A8`, que con el *tone mapping* se lee como luz |
| Transparencia | Prohibida en los assets. Toda la transparencia es de VFX |
| GLB futuro | `baseColorFactor` = 1 y (opcional) 1 atlas `baseColorTexture` en sRGB. Sin mapas de normales, rugosidad ni oclusión en el MVP. Si el GLB trae textura y vertex colors, se multiplican (comportamiento estándar de glTF) |

---

## 7. LOD

| Regla | Valor |
|---|---|
| Criterio | Eslora proyectada en px = `L · ppm` (`ppm = camera.zoom`). Con una cámara ortográfica la distancia no cambia el tamaño, así que **no se usa `THREE.LOD`** |
| Umbrales | LOD0 si `L·ppm ≥ 72`; LOD1 si `L·ppm < 64`; entre 64 y 72 se mantiene el actual (histéresis). Al aparecer un barco dentro de esa banda, arranca en LOD1 |
| Resultado por defecto | Escritorio (6,20 ppm con N1; 5,04 con N3): todas las clases en LOD0. Móvil vertical con N1 (2,82 ppm): Balandra (45 px), Pirata (56) y Mercante (62) en LOD1; Bergantín (68, dentro de la banda) arranca en LOD1; Cañonera (79), Capitán (84) y Fragata (96) en LOD0. Con N3 (2,29 ppm): la Cañonera (64) y el Capitán (69) caen en la banda y arrancan en LOD1 |
| Qué quita LOD1 | Cañones, portas, vergas (el borde superior de la vela hace de verga), cofas, faroles, ventanas, carga, barriles, tablas de cubierta y de las tapas de castillos y paños de lona (D23, D36). Las velas de LOD1 son lisas: cuadras en `PlaneGeometry(w, h, 4, 3)` (franjas del mercante: `(w, h, 4, 5)`) y velas de cuchillo en abanico (§8.2). No bajan a 2×2: las muescas del pirata necesitan vértices en u' = 0,25 y 0,75, y con 2 filas la panza forma un pico de ≈ 59° entre las dos mitades, más que el pliegue de 40°, que se vería como una arista (D36 d). **Se quedan** el mortero de la cañonera y el estandarte del capitán, porque son rasgos de identidad (AD-28), y la regala dorada del capitán, que es el color de su borda y no añade geometría. El mascarón del capitán se quita, como los faroles (D45). El casco pasa a 5 estaciones (u = −0.5, −0.25, 0, +0.36, +0.5). **Las velas, los mástiles, los castillos y los colores de franja se quedan**: son la silueta y la facción |
| Color de LOD1 (D40; O-8) | **Lo liso pinta el color medio en pantalla de lo que LOD1 quitó**, no el de una de sus piezas. La cubierta y las tapas de castillos y camaretas van en el albedo de la media de las tablas: `#BD8D59` (en pantalla `#C9965E`) y, en la paleta pirata, `#67462D` (`#6E4B30`). Es el mismo hex que `deck.mid` (D62), así que LOD1 no cambia con los 3 tonos. No van en `deck`, que es la tabla clara. Las velas van en `sail.lod1`, la media lineal de los tonos de LOD0: jugador `#E0D9C9`, paleta pirata `#353438` y Mercante `#E2D7BE` (sus franjas siguen en `#2F7FB8`). La Cañonera, que tiene su propia cubierta (§8.4), usa el albedo `#907C61`, que en pantalla da la media de sus tablas, `#9A8466`. Si una pieza nueva pierde detalle en LOD1, se aplica la misma regla. Lo verifican AD-25 (390×844) y AD-33 |
| GLB | Nodos hermanos `<id>_lod0` y `<id>_lod1`. No se usa `MSFT_lod` (three no lo soporta de forma nativa) |

---

## 8. Recetas procedurales: barcos

Cada barco = **casco por *loft*** (§8.1) + **aparejo** (§8.2) + **piezas** (§8.4). Todo se construye en coordenadas del asset, se transforma, se colorea, se fusiona con `BufferGeometryUtils.mergeGeometries` (atributos `position`, `normal`, `color` y `_rim_mask`; quitar `uv` para homogeneizar) y se añaden los sockets como `Object3D` hijos con su nombre.

### 8.1 Casco por *loft* (una sola función para todos los barcos)
`loftHull({ L, B, F, D, profile, railH, colors })`. Recibe estaciones a lo largo de Z (`z = u·L`) y unas proporciones normalizadas por estación:

| Símbolo | Significado |
|---|---|
| `a` | Semimanga en cubierta / (B/2) |
| `b` | Semimanga en la flotación / (B/2) |
| `s` | Altura de cubierta / F (arrufo) |
| `k` | Profundidad de la quilla / D |

**Sección por estación** (babor; estribor = espejo en X):
```
 V5 (a·B/2, s·F + railH)   ← borde superior de la borda (regala)
 V0 (a·B/2, s·F)           ← canto de cubierta
 V1 x(y₁), y₁ = s·F − 0.30·F  ← arriba de la franja de portas
 V2 x(y₂), y₂ = s·F − 0.55·F  ← abajo de la franja
   Con portas en el costado (D36): y₁ = s·F − (F − c_y − 0.5) · y₂ = s·F − (F − c_y + 0.5)
 V3 (b·B/2, 0)             ← flotación
 V4 (0, −k·D)              ← quilla (compartido entre bandas)
 x(y) = B/2 · (b + (a − b) · y / (s·F))   (interpolación lineal entre V3 y V0)
```

**Franja de portas (D36)**: en las clases con portas en el costado (Balandra, Bergantín, Fragata, Pirata y Capitán), la franja mide **1,0 m** y se centra en la línea de cañones `c_y` (= `cannonY`) en la maestra (s = 1). Sigue el arrufo. Así **la porta de 0,8 m queda dentro de la franja en la maestra**, con 0,1 m de franja arriba y abajo, y se lee como un hueco oscuro en un color claro (AS-V20). Como `c_y` es fijo y la franja sube con el arrufo, en los cañones de los extremos la porta asoma por debajo de la franja: 0,16 m en la Fragata a z −11,5 y 0,05–0,07 m en el Bergantín (≤ 0,6 px a N1 y ≤ 0,8 px a 0,7×, sobre casco oscuro). Se acepta (D37). En la maestra, la franja va de 0,40 a 1,40 m en la Balandra (cubierta a 1,50), de 0,70 a 1,70 en el Bergantín (2,00), de 1,18 a 2,18 en la Fragata y el Capitán (2,80) y de 0,46 a 1,46 en el Pirata (1,60). El Mercante y la Cañonera (sin portas en el costado) conservan 0,30·F y 0,55·F. Con 0,25·F, a N3 la franja medía ≈ 1 px y la porta del Pirata no se distinguía del casco (D36 a).

**Caras entre estaciones i → i+1** (por banda, todo quads de 2 triángulos):

| Tramo | Color |
|---|---|
| V0–V1 | `hull` |
| V1–V2 | `hull.band` |
| V2–V3 | `hull` |
| V3–V4 | `hull.bottom` |
| V0–V5 (borda, una sola cara) | `rail` (Fragata: `trim`) |
| Cubierta: V0 babor – V0 estribor | Tablas en `deck` / `deck.mid` / `deck.alt` (§8.2.2) |

**Tapas:** espejo de popa = polígono V5…V4…V5' triangulado con `THREE.ShapeUtils.triangulateShape`, en `hull`. Proa = lo mismo si `a > 0` en `u = +0.5`. Si `a = b = 0`, los quads degeneran a triángulos: se eliminan los de área < 1e-6.

**Estaciones (D23)**: 13, con u cada 1/12. La tabla de perfiles se interpola con Catmull-Rom; antes eran las 7 filas con interpolación lineal, que daban 6 facetas a lo largo de la eslora. **Cubierta en tablas (D23)**: la cara V0 babor – V0 estribor se divide en `n = 2·ceil(B/2 / 0.5)` tiras longitudinales (≈ 0,5 m; 3,1 px con N1 en escritorio, ppm 6,20), con los 3 tonos `deck` / `deck.mid` / `deck.alt` y el orden de §8.2.2 (D62). Antes (D36) alternaban `deck` y `deck.alt` a ±7 de L\* de la media; con −10, los bordes de tabla que el antialias parte entre dos píxeles no llegaban a \|∇L\*\| ≥ 4. Por eso, con 3 tonos, el salto entre tablas vecinas sigue siendo de ≥ 14 L\*. **Tapas de castillos y camaretas (D36, solo LOD0)**: `n = 2·ceil(w/2 / 0.5)` tiras a lo largo de Z sobre el ancho `w` de la caja, con los mismos tonos (§8.2.2). Sin ellas, la Fragata a 0° solo ve cubierta lisa (causa 3 de dev-render). Las tapas de la carga van en un solo `deck.mid` (D62; antes `deck`). ≈ 22 tris por tramo × 12 + tablas (`n` × 12 × 2) + tapas ≈ **530 tris en la Balandra y 730 en la Fragata** (LOD1: sin tablas y con las 5 estaciones de §7, ≈ 100).

**Perfiles** (interpolación lineal entre filas):

| u | Estándar a / b / s / k | Fino (pirata y capitán) a / b / s / k | Lleno (mercante) a / b / s / k | Chato (cañonera) a / b / s / k |
|---|---|---|---|---|
| −0.50 | 0.80 / 0.62 / 1.30 / 0.35 | 0.62 / 0.48 / 1.18 / 0.35 | 0.92 / 0.80 / 1.40 / 0.45 | 0.86 / 0.78 / 1.10 / 0.40 |
| −0.40 | 0.96 / 0.85 / 1.15 / 0.75 | 0.88 / 0.78 / 1.08 / 0.75 | 1.00 / 0.93 / 1.22 / 0.85 | 0.98 / 0.94 / 1.04 / 0.80 |
| −0.25 | 1.00 / 0.93 / 1.04 / 1.00 | 1.00 / 0.92 / 1.02 / 1.00 | 1.00 / 0.97 / 1.05 / 1.00 | 1.00 / 0.98 / 1.00 / 1.00 |
| 0.00 | 1.00 / 0.95 / 1.00 / 1.00 | 1.00 / 0.94 / 1.00 / 1.00 | 1.00 / 0.97 / 1.00 / 1.00 | 1.00 / 0.98 / 1.00 / 1.00 |
| +0.20 | 0.97 / 0.88 / 1.03 / 1.00 | 0.92 / 0.82 / 1.02 / 1.00 | 1.00 / 0.95 / 1.04 / 1.00 | 1.00 / 0.97 / 1.00 / 1.00 |
| +0.36 | 0.72 / 0.56 / 1.12 / 0.85 | 0.55 / 0.42 / 1.10 / 0.85 | 0.88 / 0.78 / 1.15 / 0.90 | 0.92 / 0.85 / 1.04 / 0.90 |
| +0.50 | 0.00 / 0.00 / 1.28 / 0.30 | 0.00 / 0.00 / 1.25 / 0.30 | 0.30 / 0.18 / 1.30 / 0.50 | 0.45 / 0.30 / 1.12 / 0.50 |

### 8.2 Aparejo genérico
Con `rm = 0.022·L` (radio de la base del mástil):

| Pieza | Geometría (args) | Colocación | Color |
|---|---|---|---|
| Mástil | `CylinderGeometry(0.6·rm, rm, h − yd(u), 6)` | Base en `(0, yd(u_m), z_m)`. Con caída: grupo del mástil y sus velas rotado `rotation.x = −rake` alrededor de la base (la punta va a popa) | `mast` |
| Verga (LOD0) | `CylinderGeometry(0.35·rm, 0.35·rm, w + 0.6, 5)`, `rotation.z = π/2` | Borde superior de cada vela cuadra, en `z_m + 0.35` | `mast` |
| **Vela cuadra** | LOD0 (D36, D40): `PlaneGeometry(w, h, nx, 3)` con **paños de ≈ 0,55 m** en el jugador: `nx = max(4, 2·round(w / 1.1))`. Paleta pirata: paños de 0,5 m (D40; en D37 eran de 0,6), con `nx = max(4, 4·round(w / 2.0))`, múltiplo de 4 para que haya vértices en u' = 0,25 y 0,75 (borde raído). Mercante: paños de 0,7 m, `nx = max(4, 2·round(w / 1.4))`, y 5 filas por las franjas. Capitán: 4 filas, con la inferior roja. Tonos por columna: en el jugador y la paleta pirata, los de §8.2.1, iguales en todas las filas de lona (en el Capitán, las negras); en el mercante, las columnas impares van en `sail.alt`, solo en las filas crema. LOD1: `(w, h, 4, 3)` (franjas: `(4, 5)`), lisa, en `sail.lod1` (§7). Con 3,4 px por paño a N1 (pirata 3,1; mercante 4,3), cada borde de paño cuenta en AS-V19 | Centro en `(0, y_b + h/2, z_m + 0.45)`. **Panza**: `z += 0.12·w·sin(πu')·sin(πv')`, con u', v' ∈ [0, 1] a lo ancho y alto. **Braza**: vela + verga rotadas `+20°` en Y alrededor del eje del mástil (todas igual) | `sail` / `sail.mid` / `sail.alt` (mercante: `sail` / `sail.alt`); LOD1: `sail.lod1` |
| Vela cangreja / cangrejo | LOD0 (D36): **parche bilineal** en el plano YZ (x = 0) sobre amura A, puño de driza B, pico C y puño de escota D: `P(u, v) = (1−v)·((1−u)·A + u·D) + v·((1−u)·B + u·C)`, más la panza `x += 0.08·\|AD\|·sin(πu)·sin(πv)`. Rejilla de `nu = max(2, round(\|AD\| / p))` columnas × 3 filas, con el paño p de la vela cuadra: 0,55 m en el jugador y 0,5 en la paleta pirata (D40). Paños casi verticales, con los tonos de §8.2.1. LOD1: los 4 triángulos en abanico desde el centro E desplazado `x += 0.08·\|AD\|`, lisa, en `sail.lod1`. **Apertura de 25°** (D12): vela + botavara + pico giran 25° alrededor del eje del mástil (gratil A→B) | Coordenadas (z, y) en la tabla de clase | `sail` / `sail.mid` / `sail.alt` (mercante: `sail` / `sail.alt`); LOD1: `sail.lod1` |
| Botavara y pico (LOD0) | `CylinderGeometry(0.3·rm, 0.3·rm, len, 5)` alineados de A→D y de B→C | — | `mast` |
| Vela latina | LOD0 (D36): el parche de la cangreja con A = amura, D = escota B y los dos vértices superiores en el pico C (los triángulos degenerados se eliminan). **Jugador y paleta pirata (D40): paños radiales**, con `nu = max(2, round(\|AB\| / p))` columnas a lo largo del pujamen A→B que convergen en el pico C, × 3 filas, con los tonos de §8.2.1. **Mercante** (D36): 3 columnas × `nv = max(2, round(\|AC\| / 0.9))` **filas paralelas al pujamen**, alternas (corte horizontal). Panza `0.06·\|AC\|·sin(πu)·sin(πv)`. LOD1: triángulo A · B · C + centro con panza `0.06·len`, liso, en `sail.lod1`. **Apertura de 25°** alrededor del eje vertical que pasa por A, con la entena incluida (D12) | Tabla de clase | `sail` / `sail.mid` / `sail.alt` (mercante: `sail` / `sail.alt`); LOD1: `sail.lod1` |
| Foque | LOD0 (D36): el mismo parche con A = amura T, D = escota C y los dos vértices superiores en el puño de driza H. **Jugador y paleta pirata (D40): paños radiales**, con `nu = max(2, round(\|TC\| / p))` columnas a lo largo del pujamen T→C que convergen en el puño de driza H, × 3 filas, con los tonos de §8.2.1. **Mercante** (D36): 3 columnas × `nv = max(2, round(\|TH\| / 0.9))` filas paralelas al pujamen, alternas. Panza `0.06·\|HT\|·sin·sin`. LOD1: triángulo H · T · C + centro con panza `0.06·\|HT\|`, liso, en `sail.lod1`. **Apertura de 25°** alrededor del estay T→H (D12) | Tabla de clase | `sail` / `sail.mid` / `sail.alt` (mercante: `sail` / `sail.alt`); LOD1: `sail.lod1` |
| Bauprés | `CylinderGeometry(0.25·rm, 0.45·rm, bs + 1, 5)`, `rotation.x = +70°` (eje a 20° sobre el horizonte hacia +Z) | Arranque `S = (0, 1.25·F, L/2 − 1)`; centro = `S + (0, 0.342, 0.940)·(bs + 1)/2`; punta `T = S + (0, 0.342, 0.940)·(bs + 1)` | `mast` |
| Cofa (LOD0) | `CylinderGeometry(0.045·L, 0.04·L, 0.5, 6)` | En el mástil, a la altura del borde superior de la vela baja + 0,1 | `rail` |
| Cañón (LOD0) | Balandra `(0.22, 0.28, 1.2, 6)` · Bergantín `(0.24, 0.30, 1.4, 6)` · Fragata `(0.26, 0.32, 1.6, 6)` · Pirata `(0.23, 0.29, 1.3, 6)`; `rotation.z = π/2`. Radios ≈ ×1,7 (D23): con los de antes, 0,12–0,21 m ocupaban 1 px a 1,0×. Exageración deliberada, como en los sprites de Seafight. **Sin la tapa interior** (D36), que queda dentro del casco: 18 tris en lugar de 24 | La boca en el socket; centro = socket − signo·(len/2) en X | `cannon` |
| Porta (LOD0) | **Un quad de 0,8 × 0,8 m** (D36; 2 tris). Antes era `BoxGeometry(0.06, 0.8, 0.8)`, de 12 tris, de los que solo se ve la cara exterior. Entre portas y cañones, la Fragata ahorra 256 tris y cabe en su presupuesto con los paños. Va dentro de la franja de portas (§8.1) y bajo el canto de cubierta: `0.60·F + 0.4 ≤ yd(u)` | Cara exterior en `x = ±(a(u)·B/2 + 0.05)`, misma y, z que el cañón | `gunport` |
| Bandera | `PlaneGeometry(1.0·kf, 0.65·kf)`, `kf = L/16`, en el plano YZ (`rotation.y = π/2`) | Punta del palo mayor, desplazada `−Z` media anchura (ondea a popa) | `flag` |
| Gallardete (jugador) | Triángulo de `2.4·kf × 0.5·kf` en el plano YZ | Punta del palo mayor | `flag` |

#### 8.2.1 Tonos de lona (D40)
Se aplica al jugador y a la paleta pirata (también a la Cañonera y a las filas negras del Capitán, de I2). El Mercante queda fuera: sus paños alternos y sus franjas son su seña (D9). Por qué y con qué previsión: ART-DIRECTION §9.1.

| Paso | Regla |
|---|---|
| Paños de una vela | Índices i = 0…n−1: columnas en u, de izquierda a derecha, en cuadras y cangrejas; paños radiales desde la amura hasta la escota, en foques y latinas. En las cuadras, todas las filas de lona de un paño llevan su mismo tono |
| Tonos | t = 0, 1 y 2 → `sail` (claro), `sail.mid` (medio) y `sail.alt` (sombra), con los hex de ART-DIRECTION §4.2. Jugador `#FBF3E3` / `#DED7C8` / `#C2BBAC`; paleta pirata `#4A494D` / `#303033` / `#171619`. `sail.mid` es el punto medio en sRGB, no en lineal |
| Orden (bolsas barajadas) | Grupo g = ⌊i / 3⌋. Para cada g, un hash de (clase, índice de la vela en el barco, g) elige una de las 6 permutaciones de (0, 1, 2), descartadas las que empiezan por el tono del último paño del grupo anterior. Así, dos paños vecinos nunca comparten tono, y cada tono cubre ⌊n/3⌋ o ⌈n/3⌉ de los n paños. Esto último fija la media de la lona, y con ella AD-10 y `sail.lod1` |
| Hash | Determinista, sin `Math.random`, para que un barco salga igual en cada sesión y en cada cliente, y las capturas de QA sean reproducibles. Sirve cualquier hash entero: la previsión de ART-DIRECTION §9.1 da el rango con 7 semillas |
| Color por vértice | Cada paño es una pieza de un solo color: todos sus vértices llevan su tono. Las costuras quedan duplicadas, como hoy entre `sail` y `sail.alt` |
| Lo que no se hace | Ni degradados dentro del paño, ni costuras desplazadas, ni damero 2D: los tres se probaron y se descartaron (ART-DIRECTION §9.1) |
| GLB futuro | El mismo contrato: 3 tonos por vela en `COLOR_0`, o un atlas que dé la misma lectura y pase AS-V19 y AS-V21 |

#### 8.2.2 Tonos de cubierta (D62; O-11)
Se aplica en LOD0 a la cubierta y a las tapas de castillos y camaretas de la Balandra, el Bergantín, la Fragata, el Pirata y el Mercante. El Capitán y la Cañonera (I2) conservan los 2 tonos alternos de D36 hasta que I2 mida AD-28 con esta regla. Por qué y con qué previsión: ART-DIRECTION §9.1 (D62).

| Paso | Regla |
|---|---|
| Tablas | Cubierta: j = 0…n−1 de babor a estribor, con `n = 2·ceil(B/2 / 0.5)`: 10 en la Balandra y el Pirata, 14 en el Bergantín, 16 en el Mercante y 18 en la Fragata. Tapas: j = 0…n−1 en X, con `n = 2·ceil(w/2 / 0.5)`. Superficie s = 0 para la cubierta y 1, 2… para las tapas, en el orden de la receta |
| Tonos | t = 0, 1 y 2 → `deck` (clara), `deck.mid` (media) y `deck.alt` (oscura). `deck.mid` es la media de las tablas de D36, que también es el color de LOD1. `deck` y `deck.alt` se separan de ella el doble que en D36, en sRGB, y `deck.mid` queda en su punto medio. Así, el salto entre dos tablas vecinas sigue siendo de ≈ 14 L\*, como en D36. **Albedo**: jugador y Mercante `#E1B17B` / `#BD8D59` / `#976B39`; paleta pirata `#89664B` / `#67462D` / `#452811`. **En pantalla** (ART-DIRECTION §4.2): `#F0BC82` / `#C9965E` / `#A1723C` (L\* 79,7 / 65,8 / 51,8) y `#926D4F` / `#6E4B30` / `#4A2B12` (L\* 49,0 / 35,1 / 20,9) |
| Trancanil (solo en la cubierta) | j = 0 y j = n−1, las tiras junto a la borda que ya llevan la oclusión ×0,85, van en `deck.mid`. Son lo que más se ve a 0°, donde las velas tapan el centro. Con un tono fijo en la media, el color medio de la cubierta no salta al pasar a LOD1 (AD-33) |
| Orden del interior | El interior es j = 1…n−2 en la cubierta y j = 0…n−1 en las tapas: m tablas. Se recorre en grupos de 3 tablas seguidas, g = 0, 1… Cada grupo es una permutación de (0, 1, 2), elegida por hash entre las que cumplen: **(i)** no empieza por el tono de la tabla anterior (en la cubierta, la anterior a j = 1 es el trancanil, medio); **(ii)** no repite la permutación del grupo anterior, porque si se repite, las tablas vuelven a ser periódicas cada 3; **(iii)** en el último grupo, si quedan 2 tablas, son clara y oscura: (0, 2, 1) o (2, 0, 1); **(iv)** en la cubierta, la última tabla del interior (j = n−2) no es media, porque linda con el trancanil. Siempre queda al menos una permutación que cumple todo. Dos tablas vecinas nunca comparten tono |
| Hash | La permutación es `candidatas[hash32(strHash('<assetId>:deck'), s, g) % candidatas.length]`, con el `hash32` y el `strHash` de §8.2.1. La clave cambia para que la cubierta no copie el orden de las velas. Es determinista |
| Media | En cada superficie, cada grupo completo y las 2 tablas sobrantes (una clara y una oscura) dan exactamente `deck.mid`. Solo sobra 1 tabla en la Fragata (16 en el interior), que desvía la media ≈ 0,8 L\* |
| Carga | Las tapas de las cajas de carga del Mercante van en `deck.mid` (antes, `deck`) |
| LOD1 | Sin cambio: la cara lisa en el albedo de `deck.mid` (§7) |
| Color por vértice | Cada tabla es una pieza de un solo color, como hoy |
| Lo que no se hace | Ni juntas a lo largo de la eslora (tramos de tabla), que darían el damero 2D que D40 descartó en las velas, ni degradados dentro de la tabla. Las líneas de AS-V22 cruzan las tablas a cualquier rumbo, así que las juntas no cambiarían la medida |
| GLB futuro | El mismo contrato: 3 tonos por tabla en `COLOR_0`, o un atlas que dé la misma lectura y pase AS-V19 y AS-V22 |

### 8.3 Visibilidad de las velas (braza, apertura y velas de cuchillo)
Con la cámara a 55° y guiñada 0°, el plano de vista es YZ. Cada familia de velas tiene un rumbo ciego:
- **Cuadras** (plano XY local): se ven de canto con rumbo E/O.
- **De cuchillo** (cangreja, latina, foque; plano YZ local): se ven de canto con rumbo N/S. Con la proa alejándose de la cámara, además, las cuadras se ven acortadas por el cos 55°.

**Medición** (dev-render, `runtime.measureSails`; zoom 0,7×; rumbos de 0° a 345° cada 15°; mínimo/máximo de píxeles de vela; capturas en `qa-artifacts/render/as-v14/`):

| Clase | Braza 20° | Braza 30° | Braza 20° + cuchillo abierto 25° |
|---|---|---|---|
| Balandra | **0,180** (180°) | 0,169 | 0,292 |
| Bergantín | 0,361 | 0,324 | 0,517 |
| Fragata | 0,491 | 0,416 | 0,546 |
| Pirata | **0,232** (180°) | 0,210 | 0,329 |
| Mercante | **0,249** (240°) | 0,247 | 0,262 |

**Decisión (D12):**
1. **Braza de las cuadras: +20°**, sin cambios. Subirla a 30° empeora las 5 clases. Corrijo lo que decía este spec antes: el mínimo no está en E/O sino con la proa alejándose de la cámara, donde la braza no ayuda.
2. **Todas las velas de cuchillo de todas las clases se abren 25°** alrededor de su gratil (§8.2). Todas giran hacia el mismo costado del barco, el de la prueba medida (`*-cuchillo25.png`), porque cambiar el sentido cambiaría el rumbo del mínimo. Se aplica a todas las clases y no solo a las que fallan: el aparejo se ve coherente en toda la flota y las que ya pasaban también mejoran.
3. **El Mercante gana un foque** (§8.4): era la única clase sin vela a proa y pasaba por solo 0,012.
4. **Panza de 0,12·w** en las cuadras (sin cambios).

Regla AS-V14 (§11): mínimo/máximo ≥ 0,25 en las 5 clases, en LOD0 y LOD1. Objetivo de margen: ≥ 0,28. Si una clase queda por debajo de 0,25, solo esa clase abre sus velas de cuchillo a 35° y se vuelve a medir.

### 8.4 Parámetros por clase
Notación: vela cuadra = `w × h @ y_b` (ancho × alto en la altura de su borde inferior); cangreja = puntos (z, y) A/B/C/D.

#### `ship_sloop` — Balandra (perfil estándar)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 16 / 4,4 / 1,5 / 0,8 / 4,5 / 0,5 m |
| Mástil | z = +1,5, h = 14,5 |
| Cangreja | A (1,1, 2,8) · B (1,1, 10,6) · C (−5,3, 11,8) · D (−7,4, 3,4) |
| Gavia cuadra | 5,6 × 2,4 @ 11,4 |
| Foque | H (0, 12,0, 1,8) · T = punta del bauprés (0, 3,76, 12,17) · C (0, 2,9, 6,47) |
| Camareta de popa | `Box(2.6, 0.7, 2.4)` en (0, 2,10, −6,6); laterales `rail`, tapa `deck` |
| Cañones por banda | 4: z = −4,5, −1,5, +1,5, +4,5 → x = ±2,48, ±2,50, ±2,47, ±2,15; y = 0,9 |
| Bandera | Gallardete `flag` |
| `extras` | `sb_radius` 9,0 · `sb_mast_height` 14,5 · `sb_pick` [3,2, 14,5, 8,0] |
| Tris estimados | LOD0 ≈ 560 · LOD1 ≈ 190. Con D36 (modelo, `d36-modelo/out/FIN.log`): LOD0 985 · LOD1 196. Con D40 (modelo, `d40-modelo/geo-N0.json`): LOD0 978 · LOD1 196 |

#### `ship_brigantine` — Bergantín (perfil estándar)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 24 / 6,2 / 2,0 / 1,1 / 6,0 / 0,7 m |
| Mástiles | Trinquete z = +5,5, h = 18,0 · Mayor z = −3,0, h = 19,5 |
| Trinquete (cuadras) | 9,0 × 3,6 @ 4,4 · 7,4 × 3,2 @ 8,3 · 5,6 × 2,4 @ 11,8 |
| Mayor | Cangreja A (−3,4, 3,8) · B (−3,4, 13,6) · C (−11,4, 15,0) · D (−12,4, 4,4) + gavia cuadra 5,8 × 2,6 @ 15,4 |
| Foque | H (0, 14,8, 5,8) · T (0, 4,89, 17,58) · C (0, 3,44, 11,1) |
| Camareta de popa | `Box(4.0, 1.0, 4.0)` en (0, 2,8, −9,6) |
| Cofa | Trinquete, y = 8,1 |
| Cañones por banda | 6: z = −7,5, −4,5, −1,5, +1,5, +4,5, +7,5; y = 1,2 |
| `extras` | `sb_radius` 13,0 · `sb_mast_height` 19,5 · `sb_pick` [4,8, 19,5, 12,0] |
| Tris estimados | LOD0 ≈ 900 · LOD1 ≈ 230. Con D36: LOD0 1 473 · LOD1 298. Con D40: LOD0 1 524 · LOD1 298 |

#### `ship_frigate` — Fragata (perfil estándar)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 34 / 8,6 / 2,8 / 1,5 / 8,0 / 1,0 m |
| Mástiles | Trinquete z = +10, h = 24 · Mayor z = +0,5, h = 27 · Mesana z = −9,5, h = 21 |
| Trinquete | 12,0 × 4,6 @ 5,6 · 9,8 × 4,0 @ 10,6 · 7,4 × 3,0 @ 15,0 |
| Mayor | 13,2 × 5,0 @ 5,6 · 10,8 × 4,4 @ 11,0 · 8,0 × 3,2 @ 15,8 |
| Mesana | Cangreja A (−9,9, 5,4) · B (−9,9, 13,0) · C (−16,9, 14,6) · D (−18,4, 6,0) + gavia 7,6 × 3,2 @ 14,0 |
| Foques | Interior: H (0, 18,7, 10,3) · T (0, 5,35, 21,08) · C (0, 4,34, 15,15) — Exterior: H (0, 21,6, 10,3) · T (0, 6,58, 24,46) · C (0, 4,34, 16,67) |
| Alcázar | `Box(6.9, 1.6, 9.0)` en (0, 3,96, −12,5); laterales `rail`, tapa `deck` |
| Castillo de proa | `Box(5.6, 1.0, 5.5)` en (0, 3,64, +12,25) |
| Faroles | 2 × `Box(0.35, 0.55, 0.35)` en (±2,6, 5,4, −16,8), `lantern` |
| Ventanas de popa | 3 × `Box(0.9, 0.6, 0.06)` en (−2,0 / 0 / +2,0, 3,0, −17,05), `lantern` |
| Cofas | Trinquete y = 10,3 · Mayor y = 10,7 |
| Borda | Color `trim` (filete dorado) |
| Cañones por banda | 8: z = −11,5, −8,5, −5,5, −2,5, +0,5, +3,5, +6,5, +9,5; y = 1,68 |
| `extras` | `sb_radius` 18,0 · `sb_mast_height` 27,0 · `sb_pick` [7,0, 27,0, 17,0] |
| Tris estimados | LOD0 ≈ 1 200 · LOD1 ≈ 270. Con D36: LOD0 2 370 (≤ 2 500 gracias a la porta de 1 quad y al cañón sin tapa interior, §8.2) · LOD1 419. Con D40: LOD0 2 440 (los foques radiales, de 3 filas, pagan los paños de 0,55 m) · LOD1 419 |

#### `ship_schooner` — Goleta (1.1; perfil estándar)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 22 / 5,6 / 1,6 / 0,9 / 7,0 / 0,56 m (casco bajo: F 1,6 frente a 2,0 del Bergantín) |
| Mástiles | Trinquete z = +4,0, h = 18,0 · Mayor z = −3,3, h = 19,5 · `rake` = 0 (la caída es del pirata) |
| Trinquete | Cangreja A (3,6, 3,0) · B (3,6, 13,8) · C (−1,8, 15,0) · D (−2,4, 3,4) + gavia cuadra 5,4 × 2,4 @ 14,6 (la gavia, por AS-V14, como en la Balandra) |
| Mayor | Cangreja A (−3,7, 3,2) · B (−3,7, 15,2) · C (−10,4, 16,4) · D (−11,0, 3,6) |
| Foques | 2 radiales (§8.2): interior H (0, 14,0, 4,4) · T a la mitad del bauprés · C a 2,9 m; exterior H (0, 16,6, 4,4) · T = punta del bauprés · C a 3,2 m |
| Castillos | Ninguno: cubierta despejada (S4 frente a la camareta del Bergantín) |
| Cañones por banda | 4: z = −6,0, −2,0, +2,0, +6,0; y = 1,0 (1 franja) |
| Colores | Los del jugador (§8.2.1, §8.2.2) · bandera: gallardete `flag` en el mayor |
| `extras` | `sb_radius` 12,0 · `sb_mast_height` 19,5 · `sb_pick` [2,8, 19,5, 11,0] |
| Tris estimados | HIPÓTESIS: LOD0 ≈ 1 500 (la Balandra, 978, más la 2.ª cangreja con botavara y pico, el 2.º foque y el casco de 22 m) · LOD1 ≈ 330. Presupuesto ≤ 2 500 / 800 |

#### `ship_line` — Navío de línea (1.1; perfil estándar, 2 franjas de portas)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 42 / 11,2 / 3,6 / 1,9 / 10,0 / 1,2 m |
| Mástiles | Trinquete z = +12,5, h = 30 · Mayor z = +1,0, h = 34 · Mesana z = −11,5, h = 26 |
| Trinquete | 14,6 × 5,4 @ 6,8 · 12,0 × 4,8 @ 12,8 · 9,2 × 3,8 @ 18,2 |
| Mayor | 16,0 × 6,0 @ 6,8 · 13,2 × 5,2 @ 13,4 · 10,0 × 4,0 @ 19,2 |
| Mesana | **Latina** A (−8,6, 6,6) · B (−19,4, 7,0) · C (−20,6, 18,0), entena de A a C (S3 frente a la cangreja de la Fragata) + gavia cuadra 9,0 × 3,6 @ 18,8 |
| Foques | 3 radiales: H en el trinquete a 22, 25 y 28 m; T en el bauprés a 0,5, 0,75 y 1,0 de su largo |
| Popa alta | Alcázar de 2 pisos: `Box(9.6, 1.6, 11.0)` en (0, yd + 0,8, −15,0) y `Box(8.6, 1.4, 6.0)` en (0, yd + 2,3, −17,5); laterales `rail`, tapas en tablas (§8.2.2) |
| Castillo de proa | `Box(7.6, 1.2, 7.0)` en (0, yd + 0,6, +15,5) |
| **Franjas de portas (S6)** | 2 franjas `hull.band` en la maestra: baja de 0,9 a 1,8 m y alta de 2,3 a 3,2 m sobre la flotación (0,25–0,50·F y 0,64–0,89·F), con 0,5 m de casco entre ellas. El *loft* de §8.1 pinta cada franja como la de hoy, con su propio intervalo |
| Cañones por banda | 10, 5 por franja **al tresbolillo**: baja (y = 1,35) en z = −14,0, −7,0, 0,0, +7,0, +14,0; alta (y = 2,75) en z = −17,5, −10,5, −3,5, +3,5, +10,5. Portas de 0,55 m de alto. Sockets numerados 01…10 con z creciente (AS-V06), mezclando las 2 filas |
| Acentos | Borda `trim` (filete dorado) · 3 faroles `Box(0.4, 0.6, 0.4)` `lantern` en el espejo · 2 filas de 3 ventanas de popa `lantern` |
| Cofas | Trinquete y = 12,8 · Mayor y = 13,4 · Mesana y = 11,0 |
| `extras` | `sb_radius` 22,0 · `sb_mast_height` 34,0 · `sb_pick` [8,0, 34,0, 21,0] |
| Tris estimados | HIPÓTESIS: LOD0 ≈ 3 000 (la Fragata, 2 440, más 2 cañones y 2 portas por banda, el 3.er foque, el 2.º piso del alcázar y la 2.ª franja) · LOD1 ≈ 520. Presupuesto ≤ 3 200 / 1 000 (§5) |

#### `npc_merchant_galleon` — Galeón del tesoro (1.1, P2; perfil lleno)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 36 / 12,0 / 3,4 / 1,8 / 7,0 / 1,2 m (L/B 3,0, el perfil lleno del mercante) |
| Mástiles | Trinquete z = +11,0, h = 24 · Mayor z = +1,5, h = 27 · Mesana z = −7,5, h = 18 · Contramesana z = −14,0, h = 14 (base sobre el alcázar) · `rake` = 0 |
| Trinquete (a franjas, como el mercante) | 12,4 × 4,8 @ 6,2 · 10,0 × 4,0 @ 11,2 |
| Mayor (a franjas) | 14,0 × 5,4 @ 6,2 · 11,4 × 4,6 @ 11,8 · 8,6 × 3,4 @ 16,6 |
| Mesana y contramesana | Latinas crema `#EADFC6`: A (−5,0, 6,5) · B (−12,4, 7,0) · C (−13,2, 16,0) y A (−12,0, 9,2) · B (−18,4, 9,6) · C (−19,0, 15,5); entenas de A a C |
| Foques | 2, con la regla del mercante (D12) |
| Popa alta dorada (rasgo de riqueza) | `Box(10.4, 2.0, 9.0)` en (0, yd + 1,0, −13,0) y `Box(9.4, 2.0, 5.5)` en (0, yd + 3,0, −14,8): laterales y espejo en `trim` `#D9A93F`, tapas en tablas; 3 faroles `lantern` y 2 filas de ventanas `lantern` en el espejo |
| Castillo de proa | `Box(8.0, 1.4, 6.0)` en (0, yd + 0,7, +13,5), laterales `rail` |
| Carga | 4 cofres `Box(1.6, 1.1, 1.1)` `cargo` con 2 flejes `#F2C14E` (los de `prop_loot`) entre los palos |
| Colores | Los del mercante (casco, cubierta, velas a franjas y bandera) con la ranura `band` de la librea (D66) en oro `#D9A93F`, sin portas |
| Cañones por banda | 0 (sin sockets de cañón) |
| `extras` | `sb_radius` 19,0 · `sb_mast_height` 27,0 · `sb_pick` [7,0, 27,0, 18,0] · `sb_livery_slots` |
| Tris estimados | HIPÓTESIS: LOD0 ≈ 2 500 (el mercante, 1 645, con un palo más, una cuadra más en el mayor, la popa de 2 pisos y los cofres) · LOD1 ≈ 600. Presupuesto ≤ 2 800 / 900 (§5) |

#### `npc_pirate` — Pirata (perfil fino, caída 8°)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 20 / 5,0 / 1,6 / 0,9 / 6,0 / 0,56 m |
| Mástiles | Trinquete z = +4,5, h = 16 · Mayor z = −2,5, h = 17,5 · `rake` = 8° |
| Trinquete (cuadras con muescas) | 7,6 × 3,2 @ 3,6 · 6,0 × 2,8 @ 7,2. LOD0: `PlaneGeometry(w, h, nx, 3)` con `nx = max(4, 4·round(w / 2.0))` (16 y 12 columnas; paños de 0,48 y 0,5 m, D40; corregido en D44, decía `/ 2.4`). LOD1: `(w, h, 4, 3)`. La rejilla `(w, h, 4, 2)` que había aquí era anterior a D23 (D36 c). Los vértices inferiores en u' = 0,25 y 0,75 suben 0,6 m (borde raído) |
| Mayor | Cangreja A (−2,9, 3,4) · B (−2,9, 12,0) · C (−9,4, 13,4) · D (−10,4, 3,9) |
| Foque | H (0, 13,1, 4,8) · T (0, 4,39, 15,58) · C (0, 2,96, 9,65) |
| Colores | `hull #2A2523` · `band #B3261E` · `bottom #1C1817` · cubierta `#6E4B30` de media, en tablas `deck #926D4F` / `deck.mid #6E4B30` / `deck.alt #4A2B12` (§8.2.2, D62) · `rail/mast #3A2A20` · lona `sail #4A494D` / `sail.mid #303033` / `sail.alt #171619` (D40, §8.2.1); LOD1 `sail.lod1 #353438` |
| Bandera | `#111111` de 1,25 × 0,81 + cuadro `#F5F1E6` de 0,4 × 0,4 en las 2 caras (desplazado ±0,01 en X) |
| Cañones por banda | 4: z = −5,6, −2,4, +0,8, +4,0; y = 0,96 |
| `extras` | `sb_radius` 11,0 · `sb_mast_height` 17,5 · `sb_pick` [4,1, 17,5, 10,0] |
| Tris estimados | LOD0 ≈ 640 · LOD1 ≈ 200. Con D36: LOD0 1 077 (medido) · LOD1 236. Con los paños de 0,6 m de D37: LOD0 1 131 (modelo). Con D40: LOD0 1 122 · LOD1 236 |

#### `npc_merchant` — Mercante (perfil lleno)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 22 / 7,6 / 2,4 / 1,2 / 4,0 / 0,84 m |
| Mástiles | Trinquete z = +5,0, h = 16 · Mayor z = −2,5, h = 17,5 · Mesana z = −8,0, h = 12 (base sobre el castillo, y = 4,65) |
| Trinquete (a franjas) | 8,6 × 3,6 @ 4,6 · 7,0 × 3,0 @ 8,6. LOD0: `PlaneGeometry(w, h, nx, 5)` con `nx = max(4, 2·round(w / 1.4))` (D36). LOD1: `(w, h, 4, 5)`. La rejilla `(w, h, 2, 5)` que había aquí era anterior a D23 (D36 c). Las bandas de caras 1 y 3, **contando desde 0** desde arriba, en `#2F7FB8`; el resto en `#EADFC6`, con las columnas impares en `sail.alt` (patrón crema-azul-crema-azul-crema; D9) |
| Mayor (a franjas) | 9,2 × 3,8 @ 4,6 · 7,4 × 3,2 @ 8,8 |
| Mesana latina | A (−5,0, 4,5) · B (−11,4, 4,8) · C (−12,4, 11,5); entena de A a C |
| Foque (D12) | H (0, 13,1, 5,3) · T = punta del bauprés (0, 4,71, 14,7) · C (0, 3,96, 9,53) |
| Castillo de popa alto | `Box(6.0, 1.8, 5.4)` en (0, 3,75, −8,3) |
| Carga | 6 × `Box(1.4, 1.4, 1.4)` `cargo` en (±1,2, 3,1, +2,6 / −3,0 / −4,4). El par de z = +1,0 pasa a −3,0 porque metía el 26 % de la elipse de `socket_fire_02` dentro de una caja (Q18; D22) · 3 × `CylinderGeometry(0.45, 0.45, 1.0, 6)` `barrel` en (−1,3 / 0 / +1,3, 3,2, +7,6) |
| Colores | `hull #6E4A2C` · `band #E8DCC0` · cubierta `#C9965E` de media, en tablas `deck #F0BC82` / `deck.mid #C9965E` / `deck.alt #A1723C` (§8.2.2, D62) · `rail/mast #6B4426` |
| Bandera | `#2F7FB8` + cuadro `#F5F1E6` |
| Cañones por banda | 0 (sin sockets de cañón) |
| `extras` | `sb_radius` 12,0 · `sb_mast_height` 17,5 · `sb_pick` [4,9, 17,5, 11,0] |
| Tris estimados | LOD0 ≈ 620 · LOD1 ≈ 260. Con D36: LOD0 1 645 · LOD1 405. D40 no lo cambia |

#### `npc_pirate_gunboat` — Cañonera pirata (I2; perfil chato, D25)
| Parámetro | Valor |
|---|---|
| L / B / F / D / bauprés / railH | 28 / 10,0 / 1,5 / 1,2 / 3,0 / 0,9 m |
| Mástil | Uno: z = −1,0, h = 16, `rake` = 4° |
| Velas (paleta pirata, 3 tonos de §8.2.1; D40) | **Lisas** (`plain`): sin las muescas del Pirata, que son su seña (ART-DIRECTION §10; D48). Cuadra 11,0 × 5,6 @ 3,4 · gavia 7,0 × 2,6 @ 9,6 (paños de 0,5 m de §8.2 en LOD0: 24 y 16 columnas; `PlaneGeometry(w, h, 4, 3)` en LOD1, en `sail.lod1 #353438`) · foque radial H (0, 12,0, −0,6) · T = punta del bauprés · C (0, 2,6, 8,0) |
| Cofa | **Ninguna** (D48). En la paleta pirata solo la lleva el Capitán, y sobre la cubierta clara un disco oscuro de 2,5 m (0,045·L) taparía la batería |
| Batería | 6 cañones por banda **sobre cubierta**: `CylinderGeometry(0.34, 0.40, 2.4, 6)` `cannon`, eje en X con la boca afuera y **con la tapa interior** (24 tris; D48): sobre cubierta se ve, y el cañón sin tapa de §8.2 es el de porta. **Eje del cañón** en x = ±(a(u)·B/2 − 1.0), y = yd + 0.45, z = −10,0, −6,0, −2,0, +2,0, +6,0, +10,0. Debajo, con el mismo x y z, una cureña `Box(1.0, 0.5, 1.4)` `rail` **apoyada en la cubierta** (centro en yd + 0,25; D48), con el cañón medio hundido en ella. Los sockets de cañón, en las bocas: x = ±(a(u)·B/2 + 0.2). Sin portas en el costado, así que queda fuera de AS-V20 (D48) |
| Mortero | `CylinderGeometry(1.1, 1.3, 1.2, 8)` `cannon` en (0, yd + 0,6, +3,5): disco oscuro de 2,6 m visto desde arriba |
| Colores | `hull #2A2523` · `band #B3261E` · `bottom #1C1817` · cubierta `#9A8466` en pantalla, con tablas a ±7 de L\* (D36): `deck #AD9678` / `deck.alt #877255` (albedo `#A28D72` / `#7E6B51`). **Sigue con 2 tonos alternos**: D62 no se aplica a las clases de I2 hasta que se mida AD-28 con los 3 tonos (§8.2.2). En LOD1, la cubierta lisa va en el albedo `#907C61` (§7, D40). La franja de portas sigue en 0,30–0,55·F, porque sus cañones van sobre cubierta · `rail/mast #3A2A20` |
| Bandera | La del pirata (negra con cuadro blanco) a `kf = L/16` = 1,75: 1,75 × 1,14 m, con el cuadro de **0,32·kf = 0,56 m** (D48). Los 0,4 m fijos del Pirata son 0,32·1,25: la regla común es 0,32·kf, y el Pirata no cambia |
| Sockets de fuego y humo | Fuego: fórmula de §3; solape con cureñas y mortero ≤ 1 % (AS-V17). Humo: `socket_smoke` y `socket_smoke_02` (§3, D25), cada uno con la tasa de VFX-SPEC §6 (D48) |
| `extras` | `sb_radius` 14,0 · `sb_mast_height` 16,0 · `sb_pick` [5,5, 16,0, 13,0] |
| Tris estimados | LOD0 ≈ 1 300 · LOD1 ≈ 300 (antes de D36). **Con D36–D40 (HIPÓTESIS, estimado a partir del Pirata de D40, 1 122)**: LOD0 ≈ 1 600. Suman la cubierta de 20 tiras (+240), los 12 cañones sobre cureña (+272 frente a los 8 cañones con porta del Pirata), el mortero (+32), las cuadras más anchas (+72) y el foque más largo (+30); restan la cangreja con su botavara y su pico (−130) y un palo con su cofa (−48). Presupuesto ≤ 2 000 (NPC). LOD1 ≈ 300 (≤ 700). **Medido en la geometría provisional de dev-render (D48; `qa-artifacts/render/d48-canonera/export.log`)**: LOD0 1 624 · LOD1 241. La batería suma 432 tris (12 × (24 + 12)) y el mortero, 32. En la estimación sobraba «con su cofa»: el Pirata no lleva cofa |

#### `npc_pirate_captain` — Capitán pirata (I2, jefe; perfil fino, caída 6°)
L / B / F / D / bauprés / railH = 30 / 8,0 / 2,8 / 1,5 / 8,0 / 1,0 m (eslora del GDD §9; railH como la Fragata, ≈ 0,35·F, D45). Mástiles: +9,0 / h 21; 0 / h 24; −8,5 / h 18. **Colores**: los de la paleta pirata (`hull #2A2523` · `band #B3261E` · `bottom #1C1817` · cubierta en tablas `#805C40` / `#5C3B21`, de media `#6E4B30` · `rail/mast #3A2A20`), más `trim #D9A93F` en la regala y el mascarón. **Franja de portas** de 1,0 m (§8.1), de 1,18 a 2,18 m en la maestra, como la Fragata. **Velas, sin foques** (el bauprés solo lleva el mascarón; así la silueta no se confunde con la de la Fragata, que lleva dos): cuadras negras con la fila inferior roja, que es una **franja** (`sailStripe #B3261E`, el mismo hex que `band`; D46): no es lona, igual que las franjas azules del Mercante, y queda fuera de AD-10 y AD-33. En LOD0, `PlaneGeometry(w, h, nx, 4)` con los paños de 0,5 m de la paleta pirata (§8.2) y, en las filas negras, sus 3 tonos (§8.2.1, D40): trinquete 10,4 × 4,2 @ 5,2 · 8,4 × 3,6 @ 9,8; mayor 11,4 × 4,6 @ 5,2 · 9,4 × 4,0 @ 10,2 · 7,0 × 2,8 @ 14,6 (20, 16, 24, 20 y 16 columnas); mesana con cangreja A (−8,9, 5,2) · B (−8,9, 12,0) · C (−15,0, 13,4) · D (−16,4, 5,8). En LOD1, `(w, h, 4, 4)`, con las filas negras en `sail.lod1 #353438` y la franja en `#B3261E`. Alcázar `Box(6.4, 1.6, 8.0)` en (0, 3,96, −11,0). Mascarón `Box(0.6, 1.0, 1.2)` `#D9A93F` en (0, 3,2, 15,3). 6 cañones por banda: z = −8,5, −5,1, −1,7, +1,7, +5,1, +8,5; y = 1,68, con las medidas de la Fragata, que tiene la misma F y la misma `cannonY`: `CylinderGeometry(0.26, 0.32, 1.6, 6)`, sin tapa interior y con porta de 1 quad (§8.2); fogonazo a escala 1,2 (VFX-SPEC, escala por clase) (D45). **Cofas** (LOD0), por la regla de §8.2 (borde superior de la vela baja + 0,1): trinquete y = 9,5 y mayor y = 9,9. La mesana no lleva, como en la Fragata (D45). **Estandarte** (rasgo exclusivo, D25): `PlaneGeometry(6.0, 4.0)` en `flagMark #F5F1E6` con un cuadro en `flag #111111` de 2,0 × 2,0 m centrado (los colores de la bandera pirata, invertidos; separado ±0,01 en X a las dos caras), en la punta del palo mayor (y = 24) y desplazado −Z media anchura. **Sustituye a la bandera**: el Capitán no lleva la bandera pirata (D45). **Regala** en `trim #D9A93F`. `sb_radius` 16 · `sb_mast_height` 24 · `sb_pick` [6,0, 24,0, 15,0]. **LOD1** (§7): quita cañones, portas, vergas, cofas, tablas y **el mascarón** (0,6 m, que con N3 serían 1,4 px; D45). **Conserva el estandarte** (rasgo de identidad, AD-28) y la regala, que es el color de la borda y no añade geometría. La cubierta y la tapa del alcázar van lisas en `#67462D`. **Tris (HIPÓTESIS, estimado a partir de la Fragata de D40, 2 440; tris por vela medidos en `d40-modelo/geo-N0.json`)**: LOD0 ≈ 2 100. Restan los dos foques (−130), 4 cañones con porta (−80), el castillo de proa (≈ −40), 2 tiras de cubierta (−48) y cuadras con vergas (−28). Presupuesto ≤ 2 500 (§5). LOD1 ≈ 400 (≤ 800).

### 8.5 Plantilla para una clase nueva (1.1; D64)
Una clase nueva es una receta más de §8.4 con el mismo *loft*, el mismo aparejo y los mismos tonos de lona y cubierta (D36, D40, D62). No hay técnica nueva, salvo la 2.ª franja de portas del Navío, que es un intervalo más del mismo *loft*. Las de la 1.1 (Goleta, Navío y Galeón) están en §8.4; su gramática, en ART-DIRECTION §9.2.

| Campo | Regla |
|---|---|
| `assetId` | `ship_<nombre>` para el jugador y `npc_<facción>_<nombre>` para los NPC, en `snake_case` ASCII (§1) |
| `look` | `player`, `pirate` o `merchant`: fija los tonos de §8.2.1–8.2.2 y los canales reservados de ART-DIRECTION §9.2 |
| L, B, F, D, bauprés, `railH` | L ≥ 16 m. B según el perfil, como en las clases de hoy: estándar L/B 3,6–4,0; fino 3,75–4,0; lleno ≤ 3,0; chato ≈ 2,8. `railH` ≈ 0,35·F (la Cañonera, 0,6·F) |
| Perfil | Uno de los 4 de §8.1. Un perfil nuevo se añade como columna de la tabla de §8.1, no como otra función |
| Mástiles | (z, h) y `rake`: 0 en jugador y mercante, 4–8° en pirata |
| Velas | Por tipo (cuadra, cangreja, latina o foque), con las recetas de §8.2. Las de cuchillo, abiertas 25° (D12) |
| Castillos | Cajas con tapa en tablas (§8.2.2) |
| Cañones | Por banda, en portas dentro de la franja de 1,0 m (§8.1). Más de 8 por banda: 2 franjas de 0,9 m con 0,5 m de casco entre ellas, cada una con su `cannonY` y las portas al tresbolillo (S6; el Navío) |
| Sockets | Los de §3; los de fuego, comprobados con AS-V17 |
| `extras` | Los de §4, más `sb_livery_slots` si admite libreas |
| Presupuesto | §5 por `assetId` (AS-V08): jugador ≤ 2 500 (≤ 3 200 si L > 34 m, el Navío), NPC ≤ 2 000 (el Galeón, ≤ 2 800) |
| Reglas que tiene que pasar sin excepciones | AS-V02–V09, V14 (≥ 0,25), V15, V17, V18, V19 (≥ 55 %), V20 (si tiene portas; 0 componentes si no), V21, V22 y V23 (si admite libreas); y AD-10, AD-25, AD-33 y AD-37 de ART-DIRECTION. Si es hostil, AD-28 con los demás hostiles; el Galeón, AD-41 |

---

## 9. Recetas procedurales: islas, puerto y props

### 9.1 Isla genérica `island_<id>` (GDD §4: I1–I6)
Semilla `hash(id)`; `rnd()` determinista. Entrada: radio `r` del GDD (= radio de colisión).

| Pieza | Geometría | Colocación y jitter | Color |
|---|---|---|---|
| Playa | `CylinderGeometry(0.88r, r, 1.4, n)`, `n = clamp(round(r/2.5), 12, 24)` | Centro en y = 0,1 (de −0,6 a +0,8). Cada columna de vértices se escala para que su radio **en la flotación** (y = 0) sea `r·(1 − 0.06·rnd())` ∈ [0,94r, r]: el cilindro sin escalar mide 0,949r en y = 0 (factor `(1 − 0.06·rnd())/0.9486`). Lo que queda bajo el agua puede superar r: no se ve (D1) | Tapa `sand`, lateral `sand.wet` |
| Meseta | `CylinderGeometry(0.62r, 0.74r, 1.0, n − 2)` | Centro (dx, 1,3, dz) con \|d\| ≤ 0,08r; radios × (1 ± 0,08·rnd()) | `grass` |
| Colina (r ≥ 35) | `ConeGeometry(0.38r, 0.22r, 9)` | Sobre la meseta (y base 1,8) | Vértices de la base `grass.dark`, cima `rock.dark` |
| Rocas | `DodecahedronGeometry(rr, 0)`, rr = 1,2–2,8, × `round(r/9)` | Centro a `r − rr` del centro de la isla (el borde exterior queda en r), y = 0,2, rotación aleatoria. Mitad sobre la playa y mitad en el anillo de agua de 0,94r–r (D7) | Alterna `rock` / `rock.dark` |
| Arbustos | `IcosahedronGeometry(1.0–1.8, 0)` con escala Y de 0,6 × `round(r/5)` | Sobre la meseta | Alterna `grass.dark` / `grass` |
| Palmeras | Instancias de `prop_palm` × `round(r/6)` | Anillo a 0,6–0,85r, rotación Y aleatoria, escala 0,85–1,2 | — |

Todas las islas y el puerto se fusionan en **una geometría estática** (1 draw call). Los centros y radios se pasan también al shader del océano (`uIslands`, ART-DIRECTION §7.2).

### 9.2 Puerto `island_port` (r = 30)
Isla genérica (r = 30, sin colina) más:

| Pieza | Geometría | Colocación | Color |
|---|---|---|---|
| Casas × 5 | `BoxGeometry(4, 3, 5)` + tejado `ConeGeometry(3.6, 2.2, 4)` rotado 45° en Y | Anillo a 0,4r, y base 1,8 | `town.wall` / `town.roof` |
| Faro | `CylinderGeometry(1.2, 1.6, 12, 8)` en **5 tramos** de 2,4 m: blanco, rojo, blanco, rojo, blanco (= 2 franjas; D6) + linterna `BoxGeometry(1.4, 1.2, 1.4)` | (0, 1,8, −0,55r), lado norte | `#F5F1E6` / `town.roof` alternos · `lantern` |
| Muelles × 2 | Tablero `BoxGeometry(3, 0.4, 0.29r)` sobre 3 postes `CylinderGeometry(0.2, 0.2, 2, 5)` | Hacia +X y hacia +Z, de 0,70r a 0,99r (en PORT, de 21 a 29,7 m): cruzan la playa hasta el agua **sin salir del colisionador** (D7), a y = 1,0 | `palm.trunk` |
| Mástil y bandera | `CylinderGeometry(0.15, 0.2, 9, 5)` + bandera de 2 × 1,3 | (0,25r, 1,8, 0) | `mast` / `#F2C14E` |
| Boyas × 24 | Instancias idénticas de `prop_buoy` (bicolor, §9.3; D5) cada 15° en r = 110 | y = 0 | — |

### 9.3 Props
| Id | Receta | Tris |
|---|---|---|
| `prop_palm` | Tronco: 3 × `CylinderGeometry(r_top, r_bot, 1.8, 5)` apilados con radio de 0,22→0,16 y desplazamiento +0,25 en X por tramo (curvo; 5,4 m en total). Copa: 6 hojas `PlaneGeometry(0.9, 3.4, 1, 2)` cada 60°, con la fila exterior bajada 0,8 m e inclinadas 20° hacia abajo. Colores `palm.trunk` / `palm.leaf` | ≈ 84 |
| `prop_buoy` | `CylinderGeometry(0.5, 0.7, 1.2, 6)` (`buoy.a`) + `ConeGeometry(0.5, 0.6, 6)` arriba (`buoy.b`). Pivote en la flotación | ≈ 42 |
| `prop_loot` (P1) | `BoxGeometry(1.2, 1.2, 1.2)` `cargo` + 2 flejes `BoxGeometry(1.24, 0.15, 1.24)` `#F2C14E`. Pivote en la flotación, con el 30 % sumergido | 36 |
| `prop_wreck` (1.1; D67; calas piratas) | Casco por *loft* (§8.1) con las 5 estaciones de LOD1, L 14 m y perfil estándar, **sin la proa** (cortado en u = +0,2, con el borde irregular: 3 vértices desplazados ±0,6 m), escorado 20–25° y hundido el 30 % en la arena; 1 tocón de palo de ≤ 3 m. Colores `wreck` (casco y tocón) y `hull.bottom` (la obra viva que asoma); sin franja, velas, bandera, cañones ni portas. Va fusionado en la geometría estática, sobre la playa | ≤ 200 |
| `prop_crate` / `prop_barrel` (1.1) | Las cajas y barriles de la carga del Mercante (§8.4), sueltos: pie de la grúa del puerto | 12 / 24 |
| `prop_tent` (1.1; calas) | Pirámide de 4 caras de 3 × 3 m y 2,2 m de alto, sin base, en la lona pirata `#4A494D` | 4 |
| `prop_pirate_flag` (1.1; calas) | Mástil `CylinderGeometry(0.1, 0.12, 6, 5)` `mast` pirata `#3A2A20` + la bandera del pirata (§8.4) a escala 1,6: `#111111` de 2,0 × 1,3 m con el cuadro `#F5F1E6` de 0,64 m, en las 2 caras | ≈ 18 |
| `prop_hut` (1.1; islotes habitados) | Cabaña redonda: `CylinderGeometry(1.6, 1.6, 2.2, 8)` en `town.wall` + techo `ConeGeometry(2.2, 1.6, 8)` de paja en `palm.trunk` | ≈ 32 |

**Instanciar o fusionar** (1.1): un prop que se repite ≥ 20 veces y tiene ≥ 50 tris va en un `InstancedMesh` (1 draw call), como las palmeras. El resto se fusiona en la geometría estática, que no suma draw calls.

### 9.4 Islas de la 1.1 por arquetipo (D67)
Entrada: `sb_collider` [x, z, r] de GDD §4, `sb_archetype`, `sb_variant` y la semilla `hash(id)`. Por qué cada arquetipo: ART-DIRECTION §8.3. Las 6 islas de la 1.0 no se mueven; I2, I3 e I4 cambian de receta (pasan a rocosas).

| Regla común | Valor |
|---|---|
| Borde en la flotación | En [0,94·r, r] en cada columna de vértices (D1, AS-V16), también en los escollos y en el puerto. Lo que queda bajo el agua puede superar r: no se ve |
| Decorado | Ningún vértice con y > 0 a más de r + 0,5 m del centro (AC-103, AS-V24) |
| Alturas | El punto de suelo que tapa cada vértice, `(x, z − 0,70·y)`, a ≤ r + 8 m del centro (≤ 31 m en el puerto) (AD-39 b) |
| Caras al agua | `rock.cliff`, `stone.face` o arena, nunca `rock` (canto oscuro, ART-DIRECTION §8.3) |
| Tapas horizontales | Con el albedo compensado de D17 (ART-DIRECTION §4.2.1); la de `stone`, `#9E9A90` |

| Arquetipo / variante | Formas | Piezas |
|---|---|---|
| Tropical (`tropical`) | I1, I5, I6 | §9.1 tal cual: playa, meseta, colina si r ≥ 35, rocas, arbustos y palmeras |
| Islote habitado (`tropical` / `village`) | T1, T2 (r 22) | §9.1 (sin colina) + 3 `prop_hut` en la meseta, a 0,35·r del centro y separadas 100–140°, con la puerta hacia fuera · un embarcadero `Box(2.0, 0.3, 0.29·r)` `palm.trunk` a y = 1,0 de 0,70·r a 0,99·r, sobre 3 postes, hacia el puerto (D7, como los muelles de §9.2) · un secadero de redes: 2 postes de 2 m y un travesaño de 3 m `palm.trunk` con una red `PlaneGeometry(3, 1.4)` en `sail.alt` del jugador `#C2BBAC` · palmeras `round(r/6)` |
| Peñón (`rocky` / `stack`) | I2 (r 35) | Playa de §9.1 (anillo entero, borde en [0,94·r, r]) + peñón `CylinderGeometry(0.62r, 0.78r, 0.30r, 9)` **desplazado 0,2·r al norte**, de y = −0,6 a 9,9 m, con *jitter* radial hacia dentro ≤ 8 % solo en los vértices de arriba: al norte su cara queda a 0,98·r y es el borde (en `rock.cliff`, canto oscuro); al sur deja una media luna de playa, la única. Tapa `rock.dark` y 3–5 matas `grass.dark` (`IcosahedronGeometry(1.4, 0)` aplastadas). Sin palmeras. Oclusión: la arista norte de arriba (0,82·r, 9,9 m) tapa hasta 35,6 m del centro (≤ r + 8 = 43) |
| Volcán (`rocky` / `volcano`) | I3 (r 55) | Playa de §9.1 · falda: la meseta de §9.1 con radio de base **0,88·r** (playa estrecha) en `grass.dark` · cono `ConeGeometry(0.55r, 0.30r, 11)` truncado al 85 % de su altura (cima a 1,8 + 14,0 = 15,8 m), en `rock.dark` con los 3 m de arriba en `rock.cliff` · cráter: `CylinderGeometry(0.06r, 0.04r, 1.2, 11)` invertido en `rock.cliff` · 4–6 palmeras en la falda sur |
| Acantilado (`rocky` / `cliff`) | I4 (r 40) | Meseta inclinada: un `CylinderGeometry(0.94r, 0.97r, h, 12)` cuya tapa baja de 9,0 m en el borde sur (rumbo 0°) a 2,0 m en el norte (y de cada vértice de la tapa = 2 + 7·(z_local + r)/(2r)); caras `rock.cliff` y tapa `grass.dark` con manchas `rock.dark` · una cala de arena de 60° centrada en el este (rumbo 90°), a +0,8 m · sin playa en el resto. Oclusión: el borde sur tapa hacia el norte, sobre la propia isla |
| Escollos (`reef`) | E1a, E1b, E1c (r 7) | Losa `CylinderGeometry(0.80r, r_wl, 1.8, 16)` de y = −0,6 a +1,2, con cada columna escalada para que el radio en la flotación quede en [0,96·r, r] (como la playa de §9.1): con 16 lados, el punto medio de cada lado queda a ≥ 0,96 · cos 11,25° = 0,94·r, así que **todo** el borde visible está en [0,94·r, r] y el hueco que se ve entre dos rocas mide 31–31,8 m (AC-174 a). Los vértices de la tapa, a y ∈ [0,6, 1,2] con la semilla (roca rota). Todo `rock.cliff`. 1–2 rocas `DodecahedronGeometry(0.9–1.4, 0)` encima, con el punto más alto a ≤ 1,2 m. **Nada más**: ni arena, ni hierba, ni props. La espuma la pone el océano |
| Cala pirata (`pirate_cove`) | G1–G4 (r 20) | Playa de §9.1 · peñón `CylinderGeometry(0.45r, 0.60r, 3.6, 9)` en (0, −0,35·r) local (la mitad norte), de y = −0,6 a +3,0: caras `rock.cliff`, tapa `rock.dark` · en la playa sur: 2 `prop_tent`, una hoguera (6 piedras `DodecahedronGeometry(0.25, 0)` `rock.cliff` en un anillo de 0,7 m), 3 `prop_pirate_flag`, 1 `prop_wreck` con ≥ 70 % de su huella dentro de la playa, y 2–4 maderos `Box(0.3, 0.2, 2.5)` `wreck` · 2 palmeras. La entrada a la cala mira al centro del mapa (hacia el puerto), y lo alto (el peñón) queda detrás |

**Tris** (presupuesto por forma, §5): puerto 3 000 · I1 900 · I5 e I6 700 · T1 y T2 900 · I2 1 000 · I3 1 500 · I4 1 200 · escollo 150 · cala 900. Total ≤ 14 850 frente a 16 000 (GDD §16). Los medirá AS-V25 con `buildIslands(...).triangles`, que ya los cuenta por id (`island-geometry.ts:23`).

### 9.5 Puerto de la 1.1 `island_port` (D68)
Coordenadas locales con el origen en el centro del puerto (GDD §4: (0, 0)), +X al este, +Z al sur (hacia la cámara), y arriba. `TOP` = +1,2 m. Rumbo ψ de un amarre k: 15° + 30°·k (k = 0…11), con su dirección `(sin ψ, cos ψ)`. Por qué cada pieza: ART-DIRECTION §8.4.

| Pieza | Geometría | Colocación | Color |
|---|---|---|---|
| Muelle | `CylinderGeometry(30, 30, 1.8, 48)` | De y = −0,6 a `TOP`; la flotación queda en r 29,94 (el apotema de 48 lados), dentro de [0,94·r, r] | Tapa `stone` (albedo `#9E9A90`), cara `stone.face` |
| Cantil | `RingGeometry(29, 30, 48)` | En `TOP` + 0,05 | `stone.face` |
| Pantalanes × 12 | `Box(4.0, 0.1, 5.4)` (ancho tangencial × alto × largo radial) | Centro a r 27,2 en el rumbo de cada amarre, de r 24,5 a 29,9, a `TOP` → `TOP` + 0,1, girado ψ | `palm.trunk` |
| Norays × 24 | `CylinderGeometry(0.3, 0.3, 0.6, 5)` | 2 por pantalán, a r 29,2 y ±1,5 m del eje del amarre, sobre el pantalán | `cannon` |
| Grada (astillero) | Caja de 6 × 17,5 m con la tapa en rampa: de `TOP` + 1,2 en z = 12 a `TOP` + 0,15 en z = 29,5 | x ∈ [−3, 3], z ∈ [12, 29,5] (el hueco entre los amarres de 345° y 15°) | `wreck` |
| Quilla y roda | Quilla `Box(0.5, 0.5, 14)` sobre la rampa, de z = 13,5 a 27,5; roda: un palo de 0,4 m de (0, rampa + 0,5, 13,5) a (0, rampa + 3,4, 12,9) | x = 0 | `deck` (`#F0BC82`) |
| Cuadernas × 7 | 2 barras de 0,4 m por cuaderna, de la quilla a (±w, rampa + 2,8, z), con w = máx(0,8, 2,4·sin(π·(0,15 + 0,85·u))) y u = (z − 13,5)/14 | z = 14,5, 16,5 … 26,5 | `deck` |
| Cabria | 2 palos de 0,4 m de (±3,8, `TOP`, 20) a (0, 9,2, 20) | Sobre la grada | `mast` |
| Cobertizo | `Box(4.4, 3.0, 9.0)` + tejado a dos aguas de 1,4 m | (7,6, 15,5) | `town.wall` / `town.roof` |
| Madera | `Box(2.0, 1.0, 3.5)` y `Box(2.0, 0.6, 3.5)` | (−6,4, 14,5) y (−6,4, 19,0) | `palm.trunk` |
| Faro y baluarte | Baluarte `CylinderGeometry(3.2, 3.2, 0.6, 10)`; el faro de §9.2 (5 tramos de 2,4 m, r 1,6 → 1,2, linterna `Box(1.4, 1.2, 1.4)`) encima | (0, −19,5): la linterna queda a 15,0 m y tapa el suelo hasta r 30,7 | Baluarte `stone` / `stone.face`; faro §9.2 |
| Almacenes × 2 | `Box(10, 4, 6)` + tejado a dos aguas de 1,8 m | (±15, −6), fachada larga al sur | `store.wall` / `roof.slate` |
| Grúa | Poste `CylinderGeometry(0.3, 0.35, 7, 6)`; pluma de 0,3 m de (23, `TOP` + 7, 0) a (29,2, `TOP` + 8,2, 0); cabo de 0,1 m hasta `TOP` + 3,5 | Poste en (23, 0): el hueco entre los amarres de 75° y 105° | `mast` |
| Carga | 6 `prop_crate` / `prop_barrel` | Al pie de la grúa, en x 19,6–22,0 y z ±3–4,6 | `cargo` / `barrel` |
| Capitanía | `Box(6, 5, 6)` + tejado a 4 aguas de 2,2 m; mástil de 9 m con la bandera dorada de §9.2 | (0, −4); mástil en (3,6, −7,6) | `town.wall` / `town.roof` |
| Casas × 3 | Las de §9.2 | (−10, −13) girada −20°, (10, −13) y (0, −12,5) | `town.wall` / `town.roof` |
| Palmeras | 3 instancias de `prop_palm` | En la plaza, a r ≤ 12 y lejos de las piezas | — |
| Boyas × 24 | Sin cambios (§9.2) | r 110 | — |

**Comprobado** (`python3 -I scripts/ux/puerto.py`, con estas piezas, 2026-10-17):
- Radio máximo de un vértice con y > 0: **30,00 m** (el cantil); ninguno fuera de r 30.
- Oclusión: el punto de suelo tapado más lejano está a **30,88 m** (el cantil, a +1,25 m); el del faro, a 30,7. Límite: 31 (la popa atracada está a 32).
- Holgura mínima entre las huellas de las piezas sólidas: **1,0 m**.
- Barcos atracados en los 12 amarres, con todos de la misma clase: holgura entre las popas de dos vecinos de 12,3 m (Balandra), 11,2 (Goleta), 10,6 (Bergantín), 8,3 (Fragata) y **5,8 m (Navío)**. Con clases mezcladas en amarres contiguos (los 25 pares; R-04 de QA), el peor sigue siendo Navío–Navío (5,75 m); Navío–Balandra da 9,07 (tabla de la sección (4b) de `scripts/ux/puerto.py`). Con la regla de amarre libre de GDD §4, el centro de un barco atracado queda a 20,0–26,5 m del eje del amarre contiguo (≥ 12): nunca lo bloquea.
- Tris estimados: ≈ 1 400 (presupuesto 3 000; el de hoy, medido, 650).
- Astillero en pantalla con N1: esqueleto de 87 px en 1440×900 (cuadernas cada 12,4 px, de 2,5 px) y de 39 px en 390×844 (cada 5,6 px, de 1,1 px).

---

## 10. Assets del MVP

| Id | Uso | Fuente en el MVP | GLB futuro | Cañones por banda | Tris LOD0 / LOD1 | Prioridad |
|---|---|---|---|---|---|---|
| `ship_sloop` | Balandra | Procedural §8.4 | `public/models/ship_sloop.glb` | 4 | 560 / 190 | P0 |
| `ship_brigantine` | Bergantín | Procedural | `ship_brigantine.glb` | 6 | 900 / 230 | P0 |
| `ship_frigate` | Fragata | Procedural | `ship_frigate.glb` | 8 | 1 200 / 270 | P0 |
| `npc_pirate` | Pirata | Procedural | `npc_pirate.glb` | 4 | 640 / 200 | P0 |
| `npc_merchant` | Mercante | Procedural | `npc_merchant.glb` | 0 | 620 / 260 | P0 |
| `npc_pirate_gunboat` | Cañonera pirata | Procedural §8.4 | `npc_pirate_gunboat.glb` | 6 | ≈ 1 300 / 300 | P1 (I2) |
| `npc_pirate_captain` | Capitán pirata | Procedural | `npc_pirate_captain.glb` | 6 | ≈ 1 700 / 300 | P1 (I2) |
| `island_i1`…`island_i6` | Islas | Procedural §9.1 con semilla | Opcional | — | ≤ 900 cada una | P0 |
| `island_port` | Puerto | Procedural §9.2 | Opcional | — | ≤ 2 000 | P0 |
| `prop_palm` / `prop_buoy` | Decoración y límite de la zona segura | Procedural §9.3 | Opcional | — | 84 / 42 | P0 |
| `prop_loot` | Restos flotantes | Procedural §9.3 | Opcional | — | 36 | P1 |
| Iconos de UI | HUD y placas | SVG de Lucide (ART-DIRECTION §13) | — | — | — | P0 |
| Silueta de clase (SVG) | Panel del jugador y tienda | SVG de perfil, generado desde la receta | — | — | — | P0 |
| **1.1** · `ship_schooner` (Goleta) · `ship_line` (Navío de línea) | Clases del jugador de nivel 5 y 9 (GDD §6) | Procedural §8.4 | `public/models/<id>.glb` | 4 · 10 | ≈ 1 500 / 330 · ≈ 3 000 / 520 (HIPÓTESIS; presupuesto §5) | 1.1 (P0) |
| **1.1** · `npc_merchant_galleon` (Galeón del tesoro) | NPC pasivo de evento (GDD §9) | Procedural §8.4 | `npc_merchant_galleon.glb` | 0 | ≈ 2 500 / 600 (HIPÓTESIS; ≤ 2 800 / 900) | 1.1 (P2: lo primero que se recorta) |
| **1.1** · Islas por arquetipo (D67) | Las 15 de GDD §4 (I1–I6, T1, T2, E1a–c, G1–G4) | Procedural §9.4 | Opcional | — | §5, por forma | 1.1 (P0; la regla de grises de AC-174 es P1) |
| **1.1** · `island_port` (D68) | Puerto con muelle, 12 pantalanes, astillero y faro | Procedural §9.5 | Opcional | — | ≤ 3 000 (≈ 1 400 estimados) | 1.1 (P0) |
| **1.1** · `prop_wreck`, `prop_crate`, `prop_barrel`, `prop_tent`, `prop_pirate_flag`, `prop_hut` | Calas, puerto e islotes habitados | Procedural §9.3 | Opcional | — | ≤ 200 / 12 / 24 / 4 / 18 / 32 | 1.1 |
| **1.1** · Insignias de rango (SVG; D69, D74) | Placas, HUD, avisos, feed y tienda | El marcado exacto de `scripts/ux/calibracion/insignias-1-1.json` (5 insignias, ART-DIRECTION §11.5), copiado tal cual en un módulo propio como los iconos; el mismo SVG en los 4 tamaños | — | — | — | 1.1 |

**No deben volver**: texturas PNG sobre planos (como el antiguo `src/assets/barco_modelo_1.png`) ni barcos hechos de `<mesh>` sueltos (en `f3f1345`, cada barco tenía más de 40 draw calls).

---

## 11. Validación (antes de integrar un asset)

Se ejecuta con un script de desarrollo (`npm run assets:validate`, dependencia de `game-developer`) que usa [`gltf-validator`](https://github.com/KhronosGroup/glTF-Validator) y `@gltf-transform/core`, y con un test de Jest que **aplica las mismas comprobaciones al Object3D procedural**. Three funciona en Node sin renderizador, así que no hace falta WebGL.

| Id | Comprobación | Umbral |
|---|---|---|
| AS-V01 | glTF-Validator | 0 errores; avisos solo de la lista permitida (`UNUSED_OBJECT` no) |
| AS-V02 | Raíz | Se llama `<id>` (= nombre del archivo); transform identidad; escala 1 |
| AS-V03 | `extras` | Están todas las claves de §4. `sb_length` y `sb_beam` coinciden con la caja del casco de `<id>_lod0` (sin bauprés) a ±2 % |
| AS-V04 | Proa en +Z | `socket_bow.z > 0 > socket_wake.z`; `bbox.max.z > abs(bbox.min.z)` (el bauprés sobresale) |
| AS-V05 | Flotación y pivote | `bbox.min.y ≥ −(sb_draft + 0.05)`; el casco cruza y = 0; centro XZ del casco a ≤ 0,05·L del origen |
| AS-V06 | Sockets de cañón | Número por banda = `sb_cannons_per_side`; babor con x > 0 y estribor con x < 0; numeración 01…N con z creciente; resto de sockets de §3 presentes |
| AS-V07 | Orientación de los sockets | +Z del socket en el mundo: babor · (1, 0, 0) ≥ 0,99; estribor · (−1, 0, 0) ≥ 0,99 |
| AS-V08 | Triángulos | ≤ el presupuesto de §5 para cada LOD, **por `assetId`, no por `sb_kind`** (D45): `npc_pirate_captain` usa la fila del Capitán (≤ 2 500 / 800), aunque su `sb_kind` sea `npc`; en la 1.1, `ship_line` usa la de L > 34 m (≤ 3 200 / 1 000) y `npc_merchant_galleon` la suya (≤ 2 800 / 900); el resto de NPC, la de «Barco NPC» (≤ 2 000 / 700) |
| AS-V09 | Draw calls y material | 1 malla y 1 primitiva por LOD; 1 material; `alphaMode = OPAQUE`; procedural sin texturas; sin planos con textura que imiten el modelo; atributos exactos: `POSITION`, `NORMAL`, `COLOR_0`, `_RIM_MASK` (con `_rim_mask` = 1 solo en vértices del casco), y en la 1.1 `_LIVERY_SLOT` si el asset declara `sb_livery_slots` (D66) |
| AS-V10 | Texturas (GLB) | ≤ 1 por asset; potencia de 2; ≤ el tamaño de §5; KTX2 |
| AS-V11 | Tamaño del archivo | ≤ §5 |
| AS-V12 | Contenido prohibido | 0 cámaras, luces, skins, morph targets y animaciones en la raíz |
| AS-V13 | Equivalencia GLB ↔ procedural | Cajas envolventes a ±5 % por eje y sockets a ≤ 0,2 m de distancia |
| AS-V14 | Velas visibles con cualquier rumbo: `runtime.measureSails` con zoom 0,7× sobre la base de R = 80 m, es decir **ppm fijo 7,2** (= 5,04 / 0,7), con el que se calibró. Es un cociente de geometría y no depende del nivel de cañón (D28); rumbos de 0° a 345° cada 15°, en LOD0 y LOD1, para las 5 clases P0 y el Capitán. **No aplica a la cañonera** (D27): lleva poca vela a propósito, su identidad es el casco y la batería, y la distingue AD-28 | Mínimo/máximo ≥ 0,25 en todas (objetivo ≥ 0,28) |
| AS-V15 | El procedural cumple el contrato: AS-V02…V09 en Jest para las 5 recetas P0 | `npm test` en verde |
| AS-V16 | Islas: radio visual en la flotación de cada columna de vértices de la playa; y ningún vértice sobre el agua (y > 0) de la isla, rocas, muelles o palmeras fuera de r + 0,5 m en XZ | Playa entre 0,94r y 1,00r en el 100 %; 0 vértices fuera |
| AS-V17 | **Fuego sin obstáculos** (D22): para cada `socket_fire_NN`, la elipse de semiejes 0,06·L (eslora) × 0,15·B (manga) no se solapa en planta con ningún objeto de cubierta que sobresalga > 0,5 m de la superficie del socket (carga, barriles, camaretas, castillos, botes). Quedan fuera mástiles, velas y jarcia: no tapan el fuego porque las llamas llevan el sesgo de profundidad (VFX-SPEC §0.3, forma 8; D24). Si el socket cae sobre una superestructura, va en su tapa + 0,3 m | Solape ≤ 5 % del área de cada elipse |
| AS-V18 | **Sin facetas** (D23, D36): capturas de cada clase a rumbos 0° y 90° en **1440×900 con N1 a 1,0×** (6,20 px/m; todas en LOD0), más la misma vista con una pasada de solo albedo (vertex colors sin luz) para localizar los bordes de color. Parámetros del arnés (D36 e): borde de albedo = ΔE76 ≥ 2 con un vecino, dilatado ±1 px (8 vecinos); región = cada vela visible y el costado, con ≥ 50 px y caja ≥ 6 × 6; 5 líneas horizontales y 5 verticales en k/6 de la caja (k = 1…5); escalón = \|ΔL\*\| ≥ 5 entre píxeles vecinos de la misma región fuera de la máscara de bordes. Con paños de 4,3 px, las líneas horizontales sobre las velas quedan casi enteras en la máscara: miden las verticales y el costado. No se mide en 390×844 (D36 b) | ≤ 1 escalón por línea; media ≤ 0,5 |
| AS-V19 | **Textura interna** (D23, D36): las capturas de AS-V18 (1440×900, N1 a 1,0×, rumbos 0° y 90°), 3 por rumbo separadas 0,5 s. Silueta = píxeles que cambian (ΔE76 ≥ 3) al ocultar el barco en el mismo frame, erosionada 1 px (4 vecinos); se cuenta la fracción de píxeles interiores con \|∇L\*\| ≥ 4 (diferencia central). 180° y 270° se registran sin asertar. No se mide en 390×844 (D36 b). Calibración (ART-DIRECTION §9.1): Seafight da 70 % (jugador) y 80 % (Rackham) tal cual, y 48–59 % y 59–69 % sin el ruido JPEG. Con D23: 18–66 %. Con D36 (`1a3440e`): 56,2–70,1 % en 0° y 90°. Con D40 (modelo, HIPÓTESIS): 61,2–73,2 % | Media de las 3 capturas ≥ 55 % en cada clase y rumbo (definitivo, D36) |
| AS-V20 | **Cañones legibles** (D23, D36, D38): rumbos 90° y 270° en **1440×900 con N3 a 1,0×** (5,04 px/m, D28), 3 capturas. **Pase de cobertura**: solo el barco, con cañones y portas en blanco y el resto en negro, con la luz de albedo y el mismo MSAA; cobertura = valor / 255. **Componentes** = componentes conexas (8 vecinos) de píxeles con cobertura ≥ 50 %, con caja ≥ 2 × 2 px y a ≤ 3 px de píxeles de franja (pase de albedo a ΔE76 ≤ 4 de `hull.band`; con ≤ 8 entraba el filete de la Fragata, a 5,8; D37). **Núcleo** = los píxeles de la componente con cobertura ≥ 75 %; con < 2 px, la componente no es legible. **Contraste** = mediana de L\* de esos píxeles de franja en la captura − mediana de L\* del núcleo. La componente al 50 % sirve para detectar la porta de ≈ 2,3 px de alto, estable frente a la fase del balanceo. El núcleo sirve para medir su color sin los píxeles de borde, que mezclan porta y franja (D38). No se usa un L\* absoluto, porque el casco del jugador (L\* 22) y el del pirata (15) ya quedan por debajo de 30 (D36 a). No se mide en 390×844: LOD1 quita cañones y portas (§7). Medido en `1a3440e` (píxeles puros): 4/4, 6/6 y 8/8 con contraste 46–54; Pirata 4/4 con 18–25; Mercante 0. Con D38, en el Pirata (52 componentes en 13 capturas, `qa-artifacts/render/d37/scripts/v20core.py`): contraste del núcleo 18,5–24,8 y ninguno < 15; con la componente entera al 50 %, mínimo 13,9 y 2 por debajo de 15. Con la franja de 0,25·F (modelo): 1/4, 0/6 y 1/4. **La Cañonera queda fuera** (D48): no tiene portas en el costado, porque sus cañones van sobre cubierta, y los cuenta AD-28. No se aserta con «0 componentes», como el Mercante, porque sí tiene cañones | En cada captura, componentes con contraste ≥ 15 = cañones por banda de la clase (4 / 6 / 8; Pirata 4); Mercante, 0 componentes |
| AS-V21 | **Carácter de la lona** (D40; O-7 de QA-6): las velas no son una onda periódica de dos niveles. Clases: Balandra, Bergantín, Fragata y Pirata (y, con I2, Cañonera y Capitán). El Mercante queda fuera: su patrón regular es su seña (D9); se registra sin asertar. **(a) Geometría** (test unitario sobre los rangos de vela de LOD0, `model.sails`): en cada vela con n ≥ 3 paños, (1) solo aparecen los 3 tonos de su paleta (§8.2.1); (2) dos paños vecinos nunca tienen el mismo tono; (3) cada tono cubre ⌊n/3⌋ o ⌈n/3⌉ paños. **(b) Captura**, con los descriptores de dev-render (`qa-artifacts/render/o7-base/scripts/sail-profile.py`), para que QA y dev-render midan lo mismo. Capturas de AS-V19 (1440×900, N1 a 1,0×, rumbos 0° y 90°, 3 capturas), con sus pases de albedo y de ids. Vela = región del pase de ids con ≥ 120 px, erosionada 1 px. Dirección «a través de los paños» = la dominante del gradiente del albedo dentro de la vela (tensor de estructura). Líneas = paralelas a esa dirección cada 2 px (hasta ±40 px del centroide), partidas en tramos continuos de ≥ 12 px dentro de la vela; se quedan las de ≥ 60 % de la más larga. Perfil = L\* de la captura iluminada a lo largo de la línea, sin su tendencia lineal. Por línea: **r** = el mayor máximo local de la autocorrelación normalizada para 3 ≤ k < n/2, con n ≥ 2,5·k, o **0 si no hay máximo** (sin periodo). **η** = varianza entre las 2 clases de Otsu / varianza del perfil (1 = dos niveles puros; 0,75 = distribución uniforme). Rango = p95 − p5 de L\*. Por vela: la mediana de sus líneas. Calibración (velas de las 4 clases a 0° y 90°; `d40-modelo/dev/`): juego actual (`ca02798`, dos corridas de dev-render) r 0,54–0,55 con 35–42 % ≥ 0,70, η 0,88 con 77–90 % ≥ 0,85, y η por clase 0,83–0,89; el modelo de render da en el código actual r 0,53 / 40 %, η 0,90 / 83 %, lo que lo valida; D40 en el modelo (7 semillas) r 0,19–0,26 con 0–3 % ≥ 0,70, η 0,72–0,75 con 0 % ≥ 0,85, y η por clase 0,72–0,76. Seafight: sin máximo de autocorrelación en sus 3 perfiles (r 0) y η 0,63–0,79 | (a) Las 3 condiciones, en todas las velas. (b) **η: mediana por clase ≤ 0,80** y ≤ 15 % de velas con η ≥ 0,85 sobre las 4 clases. **r: mediana ≤ 0,40** y ≤ 15 % de velas con r ≥ 0,70 sobre las 4 clases (r por clase es ruidoso con 4–12 velas: el Bergantín de hoy, de rayas, da 0,26–0,35 en el juego y 0,00 en el modelo). Se registran sin asertar el rango (hoy 14, D40 ≈ 21, Seafight 20–40) y el Mercante |
| AS-V22 | **Carácter de la cubierta** (D62; O-11 de QA-9): las tablas de la cubierta y de las tapas no son una onda periódica de dos niveles. Clases: Balandra, Bergantín, Fragata y Pirata. El Mercante lleva la misma receta (§8.2.2), pero se registra sin asertar, como en AS-V21. **(a) Geometría** (test unitario sobre las tablas de LOD0, por superficie; un `model.decks` análogo a `model.sails`): (1) solo aparecen los 3 tonos de su paleta, con la oclusión ×0,85 en j = 0 y n−1 de la cubierta; (2) dos tablas vecinas nunca tienen el mismo tono; (3) en la cubierta, j = 0 y n−1 van en `deck.mid`; (4) en el interior de m tablas, cada tono cubre ⌊m/3⌋ o ⌈m/3⌉, y si m mod 3 = 2, hay tantas claras como oscuras; (5) dos grupos completos seguidos no repiten permutación; (6) dos construcciones del mismo barco dan la misma secuencia. **(b) Captura**, con los descriptores de AS-V21 (b) y el script de QA-9 (`qa-artifacts/qa/scripts/deck-profile.py`) con tres cambios: los 3 tonos, los 4 rumbos y solo líneas a través. Capturas de AS-V19 (1440×900, N1 a 1,0×) en los rumbos **0°, 90°, 180° y 270°**: con 2 rumbos solo hay 6 regiones medibles y una sola es el 17 %. **Una captura por pose**: la primera de las 3 de AS-V19, la de los recortes de `D23_OUT`. Con ella se calibró el modelo, que hace un render por pose, y así el e2e y el script de QA miden la misma imagen. Cubierta = píxeles del pase de ids de las superficies de `model.decks` (la cubierta y todas las tapas juntas), como se hace con las velas, así que no depende de los hex. Una región por clase y rumbo, erosionada 1 px y con ≥ 120 px. **Para asertar vale la región de ids**: QA la toma del JSON del e2e (`d36.json`, campo `v22`). El recorte por color de `deck-profile.py` sirve solo para contrastar, porque no da la misma región: píxeles del pase de albedo a ≤ 4 (RGB) de un segmento entre dos de los 6 colores de tabla (los 3 tonos de albedo y sus versiones ×0,85). También acepta los píxeles de borde que el antialias mezcla, que el pase de ids deja fuera. Medido por dev-render en 56 regiones (`qa-artifacts/render/o11/ids-run1..3`): la región de ids tiene el 75–99 % de los píxeles de la de color, y las medianas cambian poco (\|Δη\| 0,002 y \|Δr\| 0,006). Pero r de una sola región puede saltar hasta 0,52 entre los dos métodos (Balandra a 90°: 0,00 con ids y 0,52 con color), según haya o no un máximo local con n ≥ 2,5·k. El veredicto por clase es el mismo, y las regiones no medibles coinciden. Las líneas son las de AS-V21 (b), **solo a través de las tablas**: si no hay tramos de ≥ 12 px en la dirección del tensor, la región no se mide y se registra, sin la segunda pasada a lo largo que hace hoy `deck-profile.py`. En el modelo pasa con la Balandra y el Pirata a 0°, donde las velas tapan el centro de la cubierta. Calibración (modelo de render de D36/D40, `qa-artifacts/render/d62-cubierta/`): el modelo reproduce la medida de QA-9 sobre el código actual (con 2 rumbos y la medida tal cual: r 0,72 con el 50 % ≥ 0,70, η 0,85 con el 50 % ≥ 0,85 y rango 13,9, frente a r 0,45–0,90, 50–62 %, η 0,85–0,86 y 13,7–13,9 en el juego). Hoy, con esta medida: η por clase hasta 0,90, el 71 % de regiones con η ≥ 0,85, r 0,90 con el 86 % ≥ 0,70 y rango 13,9. D62 (14 semillas del hash): η por clase 0,74–0,77, 0 % ≥ 0,85, r 0,14–0,33, 0–7 % ≥ 0,70 y rango 27,5. Mercante con D62: η 0,67–0,77 y r 0,00–0,65 | (a) Las 6 condiciones, en todas las superficies. (b) **Los umbrales de AS-V21 (b)**, sobre las regiones medibles de las 4 clases en los 4 rumbos: η mediana por clase ≤ 0,80 y ≤ 15 % de regiones con η ≥ 0,85; r mediana ≤ 0,40 y ≤ 15 % de regiones con r ≥ 0,70. Se registran sin asertar el rango (hoy 14, D62 ≈ 28), las regiones no medibles y el Mercante. Sin regresión de AS-V19, AD-25 ni AD-33, cuyos umbrales no cambian |
| AS-V23 | **Libreas sin cruzar canales** (1.1; D66; mecanismo interno: en la 1.1, el Galeón). (a) Test unitario por clase y librea: la librea solo cambia el color de los vértices con `_livery_slot` > 0 (o solo los uniforms); posiciones, normales, velas, casco, cubierta y palos, idénticos. (b) Colores de la librea con el método de `scripts/ux/pal.py`. (c) Las capturas de AS-V20 con cada librea. (d) La librea por defecto, frente a la escena sin soporte de libreas | (a) Se cumple en todas. (b) `band`: L\* ≥ 45 y ≥ 15 sobre el casco; `band` y `trim`: ΔE76 ≥ 25 frente a `#B3261E` y `#E8DCC0`; `flag`: ΔE76 ≥ 25 frente a `#111111` y `#2F7FB8`; las tres, en visión normal, protan, deutan y tritan. (c) AS-V20 pasa con cada librea. (d) 0 píxeles distintos |
| AS-V24 | **Islas de la 1.1** (D67, D68; AC-103 y AC-170). Test unitario sobre `buildIslands` con las 16 formas | (1) El `sb_collider` de cada forma es igual al círculo que importa la simulación (GDD §4). (2) Ningún vértice sobre el agua (y > 0) de islas, puerto y props a más de r + 0,5 m del centro de su forma: generaliza AS-V16. (3) En cada forma, el radio en la flotación de cada columna del borde (playa, losa, cara del peñón o del acantilado, muelle) está en [0,94·r, r]; en los escollos, en [0,96·r, r], para que también los lados queden en [0,94·r, r] (AC-174 a). (4) El punto de suelo que tapa cada vértice con y > 0 queda a ≤ r + 8 m del centro (≤ 31 m en el puerto; AD-39 b). (5) Los escollos no tienen ningún vértice por encima de 1,2 m. (6) 16 formas en el sombreado del agua (`ocean-material.ts:8`), las mismas de la simulación |
| AS-V25 | **Presupuesto de la geometría estática** (1.1; D67, D68; AC-175). Test unitario sobre `buildIslands(ISLANDS).triangles` (`island-geometry.ts:23`, ya cuenta por id) y la escena de AC-89 con `renderer.info` | Cada forma, ≤ su presupuesto de §5 (puerto 3 000 · I1 900 · I5 e I6 700 · T1 y T2 900 · I2 1 000 · I3 1 500 · I4 1 200 · escollo 150 · cala 900); la suma, ≤ 16 000; la geometría estática es **1** malla y 1 draw call; con la escena estándar del mapa de la 1.1, ≤ 100 draw calls y ≤ 250 000 tris (AC-89, AC-175) |

---

## 12. Dependencias
| Para | Qué |
|---|---|
| `game-developer` | Escribir `loftHull`, el constructor de aparejo y `buildShip(params)` a partir de §8; `assets:validate` y el test de AS-V15; un visor de assets (ruta solo de desarrollo) para AS-V14 |
| `game-qa` | Ejecutar AS-V01…V16 en cada cambio de asset y adjuntar la salida |
| `game-product` (1.1) | Nada pendiente: las cifras de §8.4, §9.4 y §9.5 son las del GDD del 2026-10-17 (U9–U13 resueltas) |
| `game-developer` (1.1) | Islas como datos de un círculo por forma que comparten la simulación y el render (`sb_collider`, las 16 formas de GDD §4); las recetas de §9.4 y el puerto de §9.5; las clases de §8.4 con la 2.ª franja de portas en el *loft*; `_livery_slot` para la franja de oro del Galeón; los tests AS-V24 y AS-V25; y el ⚓ y el ▣ del minimapa (ART-DIRECTION §4.3) |
