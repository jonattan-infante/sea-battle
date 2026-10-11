# Sea Battle — Especificación de efectos (VFX)

> Autor: `game-ux` · v1.0 · 2026-10-10 · Consumidores: `game-developer`, `game-qa`
> Reglas de juego: [`GDD.md`](./GDD.md) (§7 combate, §8 reparación, §10 restos, §12 muerte). Estética y paleta: [`ART-DIRECTION.md`](./ART-DIRECTION.md). Sockets: [`ASSET-SPEC.md`](./ASSET-SPEC.md) §3.
> Las reglas verificables llevan id `VFX-NN` (§15). Los tamaños van en metros del mundo y tienen un **mínimo en px de pantalla**: tamaño final = `max(m, px_min / ppm)`, para que se lean también en móvil (2,29 ppm).

## 0. Arquitectura y presupuesto global

### 0.1 Principios
1. **Todo está preasignado.** Se usan *pools* de tamaño fijo con *ring buffer*: si el pool se llena, se sobrescribe la instancia más vieja. Cero `new` por frame (AC-91).
2. **Las partículas se animan en la GPU.** La CPU solo escribe al emitir (`addUpdateRange` sobre los atributos de instancia). El vertex shader calcula posición, tamaño y color a partir de `uTime`.
3. **Los VFX son imperativos.** Ningún efecto pasa por el estado de React (CLAUDE.md, regla 3; AC-83).
4. **Están sincronizados con la interpolación.** Un evento del servidor con marca `t` se dispara cuando el reloj de render (`serverTime − 100 ms`, GDD §13) alcanza `t`, así que el fogonazo coincide con la posición interpolada del barco.
5. **Se recortan por vista.** Un emisor fuera del suelo visible + 30 m no emite, salvo los eventos del barco propio.

### 0.2 Pools (7 draw calls en total)
| Pool | Geometría | Mezcla | Instancias (escritorio / móvil) | Draw calls | CPU por frame | Usado por |
|---|---|---|---|---|---|---|
| `P_ADD` | Quad *billboard* | Aditiva, `depthWrite: false` | 384 / 192 | 1 | Solo al emitir | Fogonazo, chispas, fuego, brasas, destellos |
| `P_ALPHA` | Quad *billboard* | Normal, `depthWrite: false` | 1 024 / 512 | 1 | Solo al emitir | Humo, rocío, astillas, vapor, cruces de reparación |
| `P_WATER` | Quad horizontal en y = 0,03 | Normal, `depthWrite: false` | 768 / 384 | 1 | Solo al emitir | Estela, ondas, espuma, restos del naufragio |
| `P_BALL` | Quad *billboard* | Normal | 96 / 64 | 1 | Escribe ≤ 96 posiciones | Balas de cañón |
| `P_BALL_SHADOW` | Quad horizontal | Normal | 96 / 64 | 1 | Escribe ≤ 96 posiciones | Sombras de las balas en el agua |
| `P_CONTACT` | Quad horizontal | Normal | 64 | 1 | Escribe ≤ 41 matrices | Espuma de contacto bajo cada casco |
| `RINGS` | Quad horizontal en y = 0,05 + shader de anillo | Normal, `depthTest: false` | 64 | 1 | Escribe los anillos activos (≤ 30) | Selección, hover, propio, alcance, marcador de clic, protección, restos |
| **Total** | | | | **7** (tope de ASSET-SPEC §5: 11) | | |

**Orden de render** (`renderOrder`): océano 0 → `P_WATER` 1 → `P_CONTACT` 2 → islas 3 → `RINGS` 4 → barcos 5 → `P_BALL_SHADOW` 6 → `P_BALL` 7 → `P_ALPHA` 8 → `P_ADD` 9. Los anillos se pintan sobre las islas y los barcos los tapan.

**Alfa del framebuffer.** El canvas se crea sin alfa (`gl={{ alpha: false }}`; R3F lo activa por defecto). Si un pool usa `CustomBlending`, fija `blendSrcAlpha = ONE` y `blendDstAlpha = ONE_MINUS_SRC_ALPHA`. Así el alfa del framebuffer sigue en 1 y la página no se transparenta bajo los efectos. `P_WATER` usa `CustomBlending` sin factores de alfa: **HIPÓTESIS** de que hoy deja huecos de alfa; hay que comprobarlo con `gl.readPixels` bajo una estela.

### 0.3 Partícula estándar (atributos de instancia)
| Atributo | Contenido |
|---|---|
| `aP0T0` (vec4) | Posición inicial xyz + `t0` (s) |
| `aV0Life` (vec4) | Velocidad inicial xyz (m/s) + vida (s) |
| `aSize` (vec4) | Tamaño inicial, tamaño final (m), gravedad (m/s², + = sube), arrastre (s⁻¹) |
| `aC0` / `aC1` (vec4) | Color RGBA inicial y final (lineal) |
| `aMisc` (vec4) | Forma (0 disco suave · 1 anillo · 2 llama · 3 astilla cuadrada · 4 estela de chispa · 5 espuma ruidosa: disco suave × ruido de valor **interpolado** (bilineal, 3 celdas por diámetro, semilla por instancia). Un `floor()` sin interpolar da bloques pixelados, como en `particles.ts:124-126` · 6 cruz), rotación inicial, velocidad de giro (rad/s), estiramiento |

```
τ = uTime − t0 ;  si τ < 0 o τ > life → fuera del clip
p = p0 + v0 · (1 − e^(−drag·τ)) / drag + ½ · g · τ² · ŷ          (drag = 0 → v0·τ)
size = max(mix(s0, s1, 1 − (1 − τ/life)²), px_min / uPpm)
color = mix(c0, c1, τ/life);  alpha *= smoothstep(0, 0.08, τ/life)    (entrada rápida)
billboard: offset = (uCamRight·x + uCamUp·y)·size (cámara ortográfica: mismos vectores para todos)
```
Las formas son procedurales en el fragment shader. **Sin texturas.**

### 0.4 Calidad adaptativa (ART-DIRECTION §5)
En calidad "baja" (media del frame > 20 ms durante 3 s, o en móvil): tasas × 0,5, vida de la estela × 0,7, sin estela de humo en las balas y fuego en ≤ 3 barcos.

---

## 1. Fogonazo de cañón

| Campo | Valor |
|---|---|
| Disparador | Evento `volley { shipId, targetId, from, to, duration, hits, cannons }` (`src/game/types.ts:96`; D3). **Banda**: babor si `dot(to − from, (cos ψ, 0, −sin ψ)) > 0` (el +X local del tirador en el mundo), si no estribor. Un fogonazo por cada uno de los `min(cannons, sockets de la banda)` sockets `socket_cannon_<banda>_NN`, con un desfase visual de 45 ms del cañón 01 (popa) a N (proa) |
| Duración | 100 ms |
| Forma | Núcleo: disco aditivo en la boca, de 0,9 a 1,5 m. Penacho: disco a `boca + dir·0.9 m`, de 0,6 a 1,2 m. Chispas: 3 de forma 4 a 9 m/s dentro de un cono de 25° alrededor de `dir`, g = −9,8, vida 0,25 s, 0,18 m |
| Colores | Núcleo `#FFF6C8` α1 → `#FFB347` α0 · penacho `#FF8A2B` α0,9 → `#FF5A1F` α0 · chispas `#FFD27A` → `#FF6A1F` α0 |
| Escala por clase | Balandra 0,8 · Bergantín y Pirata 1,0 · Fragata y Capitán 1,2 |
| Mínimo en pantalla | Núcleo 10 px |
| Partículas | 5 por cañón (andanada de Fragata = 40 `P_ADD`) |
| Técnica | `P_ADD`, sin luces dinámicas |

## 2. Humo de cañón

| Campo | Valor |
|---|---|
| Disparador | El mismo del §1, en el mismo instante |
| Duración | 1,6 s ±0,3 |
| Forma | 3 discos suaves por cañón. Velocidad 3,5 m/s en `dir` (±25°) + 0,8 m/s hacia arriba + viento `(0.5, 0, −0.5)` m/s; arrastre 2,5 s⁻¹; g = +0,3; tamaño de 0,9 a 3,4 m × escala de clase |
| Colores | `#E9E4DA` α0,75 → `#9A958C` α0 |
| Mínimo en pantalla | 8 px |
| Partículas | 3 por cañón (Fragata = 24) |
| Técnica | `P_ALPHA` |

## 3. Bala con arco

| Campo | Valor |
|---|---|
| Disparador | Una bala por cañón del §1. **Qué balas aciertan**: se eligen `hits` de los `cannons` al azar. Es cosmético; si se siembra con `shipId` + `t`, todos los clientes ven el mismo reparto (D3) |
| Tiempo de vuelo | `T = duration` del evento (= `d/120` s, GDD §7; ≈ 0,5 s a 60 m y 0,67 s a 80 m). La bala k sale en `t + k·45 ms` y llega en `t + T + k·45 ms`. La primera llegada coincide con el tick de daño |
| Trayectoria | `p(s) = lerp(boca, P_imp(ahora), s) + ŷ · 4h·s(1−s)`, con `s = τ/T` y `h = clamp(0.06·d, 1.5, 5)` m. `P_imp` sigue la posición **interpolada actual** del objetivo (la CPU actualiza ≤ 96 balas por frame), así que la bala no se queda atrás de un barco que se mueve |
| Punto de impacto | **Acierto**: punto aleatorio dentro de la elipse del casco del objetivo (0,6·L/2 × 0,6·B/2) a y = 0,6·F. **Fallo**: en el agua, a una distancia del centro ∈ [0,5·`sb_radius` + 2, `sb_radius` + 4] m y un ángulo de ±60° alrededor de la dirección al tirador (cae del lado visible del duelo) |
| Forma | Bala: disco de **tamaño constante en pantalla**, 7 px (escritorio) o 6 px (móvil): núcleo `#2E2E30` (r < 0,35) + aro `#FFE2B0` (0,35–0,5), que se ve sobre agua oscura y sobre arena. Sombra: elipse `#000000` en el agua bajo la bala, de 6 px × (1 − 0,5·y/h), con α = 0,35·(1 − y/8). La sombra es lo que hace legible el arco con la cámara ortográfica |
| Estela de humo | Solo en las balas del jugador o dirigidas a él, solo en escritorio y calidad alta: 1 disco cada 60 ms, de 0,6 a 1,6 m (mínimo 3 px), vida 0,4 s, `#D8D3CA` α0,45 → α0 (≤ 7 vivos por bala) |
| Partículas | 1 `P_BALL` + 1 `P_BALL_SHADOW` por bala (+ ≤ 7 `P_ALPHA` de estela) |
| Al llegar (s = 1) | Acierto → §5. Fallo → §4 |

## 4. Salpicadura (fallo)

| Campo | Valor |
|---|---|
| Disparador | Una bala de fallo llega a `s = 1` |
| Duración | Columna 0,75 s · ondas 0,8 s · espuma 1,2 s |
| Forma | **Columna**: 12 discos suaves a 6–9 m/s hacia arriba (±1,5 m/s en horizontal), g = −18, de 0,6 a 1,2 m. **Ondas**: 2 anillos (forma 1) en `P_WATER`, de 0,8 a 6,0 m y de 0,8 a 8,4 m de diámetro (el 2.º con 120 ms de retraso), con un grosor del 18 % del radio. **Espuma**: 1 disco (forma 5) de 3,2 m |
| Colores | Columna `#F4FBFD` α0,95 → `#BFE3F0` α0 · ondas `#EAF6FA` α0,8 → α0 · espuma `#EAF6FA` α0,5 → α0 |
| Mínimo en pantalla | Diámetro final de la onda: 36 px; partícula de la columna: 4 px |
| Partículas | 15 (12 `P_ALPHA` + 3 `P_WATER`) |
| Legibilidad | AC-75: el fallo se lee como una salpicadura blanca y el impacto como fuego naranja más un número. Se distinguen por la forma, no solo por el color |

## 5. Impacto en madera

| Campo | Valor |
|---|---|
| Disparador | Una bala de acierto llega a `s = 1` |
| Duración | Destello 90 ms · chispas 0,35 s · astillas 0,7 s · humo 1,0 s |
| Forma | **Destello**: 1 disco aditivo de 1,6 m (mínimo 14 px). **Chispas**: 8 de forma 4, de 0,15 m (mínimo 2 px), a 6–10 m/s hacia arriba y afuera, g = −12. **Astillas**: 6 de forma 3, de 0,22 m (mínimo 3 px), girando a 6–12 rad/s, a 4–7 m/s, g = −14. **Humo**: 3 discos de 0,8 a 2,6 m |
| Colores | Destello `#FFE7A8` → `#FF7A1A` α0 · chispas `#FFD27A` → `#FF6A1F` α0 · astillas `#7A4E2A` α1 → α0 · humo `#6B6660` α0,7 → `#4A4642` α0 |
| Destello del casco | Uniform `uHit` del material del barco = 1 al impactar, decae linealmente a 0 en 120 ms; el shader suma `vec3(0.35)·uHit` al color difuso |
| Sacudida | Si el objetivo es el barco propio: ART-DIRECTION §6.3 |
| Partículas | 18 por impacto. A partir del 5.º impacto de una misma andanada: 4 chispas y 3 astillas (tope por andanada de Fragata con 8 impactos: 9·4 + 5·4 = 56 `P_ADD` y 9·4 + 6·4 = 60 `P_ALPHA`) |
| Técnica | `P_ADD` + `P_ALPHA` + uniform por barco |

## 6. Fuego y humo con vida baja

| Campo | Valor |
|---|---|
| Disparador | Vida del barco en el snapshot. **Humo**: se enciende con ≤ 50 % y se apaga con > 53 %. **Fuego**: se enciende con ≤ 25 % y se apaga con > 28 % (histéresis). La reparación lo apaga al cruzar el umbral: las partículas vivas terminan su vida |
| Duración | Continuo mientras se cumpla la condición |
| Humo (≤ 50 %) | En `socket_smoke`, 3 discos/s. Velocidad inicial `(0, 0.22·h, 0)` m/s + viento `(0.6, 0, −0.6)` m/s, con flotación `g = +0.035·h` m/s² y `h = sb_mast_height`. En coordenadas de mundo, así que deja un rastro si el barco navega. Vida 3,4 s: **sube hasta ≈ la punta del mástil más alto** (0,75h + 0,20h + la altura del socket). Tamaño de 1,2 a 0,25·h m. **Claro**: `#B8B3AC` α0,5 → `#8E8984` α0 (Q10) |
| Humo denso (≤ 25 %) | 5/s, con la misma cinemática. Tamaño de 1,5 a 0,30·h m. `#8A8580` α0,75 → `#5E5A56` α0. **Antes era `#45413D` y se fundía con las velas negras del pirata y con el agua**: el humo tiene que aclarar lo que cubre (L\* inicial ≥ 55; vela pirata L\* ≈ 15; agua L\* ≈ 38) (Q10) |
| Fuego (≤ 25 %) | En `socket_fire_01` y `_02` (y `_03` con ≤ 12 %): 12 llamas/s por socket (forma 2) a 1,8 ±0,4 m/s hacia arriba, de 0,9 a 0,25 m × (L/24) (mínimo 5 px), vida 0,55 s, `#FFE08A` α1 → `#C2361B` α0 |
| Brasas (≤ 25 %) | 2/s por socket de fuego, de 0,12 m (mínimo 2 px), a 3 m/s hacia arriba, vida 1,2 s, `#FFB347` → α0 |
| Casco dañado | Uniform `uDamage = clamp((0.5 − hp)/0.5, 0, 1)` → difuso × (1 − 0,25·uDamage) |
| Topes | Por barco: humo ≤ 12 (denso ≤ 18), fuego ≤ 22 y brasas ≤ 7 vivos. Fuego en ≤ 8 barcos a la vez (los más cercanos al centro de la pantalla); el resto, solo humo. Móvil: 4 barcos y tasas × 0,5 |
| Técnica | `P_ALPHA` (humo) + `P_ADD` (fuego y brasas); la CPU recorre ≤ 41 barcos para acumular los temporizadores |

## 7. Hundimiento

| Campo | Valor |
|---|---|
| Disparador | La entidad pasa a `Hundiéndose` (GDD §12, AC-61) |
| Duración | **3,0 s**; en t = 3,0 s el barco deja de dibujarse (su material vuelve al pool; la geometría por clase se comparte y no se libera) |
| Animación de la raíz (CPU) | Escora `rotation.z = ±22°·easeInOut(t/3)` hacia la banda del último impacto · cabeceo de proa abajo `rotation.x = +14°·easeInOut(t/3)` · `y = −(sb_mast_height + 2)·easeInCubic(t/3)`. El océano opaco oculta lo que queda bajo y = 0 (ASSET-SPEC §2.2) |
| t = 0 | Impacto §5 a 1,5× de tamaño en el centro del casco. La placa se desvanece en 300 ms y el anillo de selección en 300 ms. El fuego sigue encendido |
| 0–3 s | **Ondas de espuma** (`P_WATER`, forma 1) cada 0,4 s, de 0,5·L a 1,2·L de diámetro, vida 1,2 s, `#EAF6FA` α0,7 → 0. **Rocío** (`P_ALPHA`): 2 cada 0,1 s en el contorno del casco, a 3 m/s hacia arriba, de 0,5 a 1,2 m, vida 0,6 s, `#F4FBFD` α0,8 → 0 |
| Cuando un socket de fuego pasa bajo y = 0 | Se apaga ese emisor y salen 4 bocanadas de **vapor**: `#F2F2F0` α0,6, de 1 a 3,5 m, a 2 m/s hacia arriba, vida 1,2 s |
| t = 2,6 s | **Restos**: 6 tablones en `P_WATER` (forma 3 estirada a 1,4 × 0,3 m × L/24) dentro de 0,4·L, que derivan a 0,3 m/s hacia afuera girando a 0,3 rad/s, vida 5 s (se desvanecen el último 1,5 s), `#6B4426` |
| Partículas | ≈ 65 por hundimiento |
| Muerte propia | Además, la secuencia de pantalla de ART-DIRECTION §15 |

## 8. Estela

| Campo | Valor |
|---|---|
| Disparador | Por barco, cuando la velocidad interpolada es > 0,6 m/s. Se emite por **distancia recorrida** (densidad constante): `Δs = max(1.5, 0.06·L)` m |
| Espuma de popa | En `socket_wake`, 1 mancha (forma 5) por `Δs`: elipse de 0,8B × 0,6B (ancho × largo, orientada al rumbo) a 2,2B × 1,6B; vida 2,6 s; α0 = 0,55·f con `f = clamp(v/v_max, 0.3, 1)`; `#F2FAFC` |
| Bigote de proa | En `socket_bow` ± B/2 en lateral, 2 manchas cada 2·`Δs`, con velocidad lateral ±0,15·v m/s perpendicular al rumbo (forman la V); de 0,3B a 0,9B; vida 1,6 s; α 0,45·f |
| Espuma de contacto | `P_CONTACT`: 1 por barco **siempre**, incluso parado. Elipse anular suave de 1,1L × 1,4B orientada al rumbo, α de 0,22 (parado) a 0,35 (a velocidad máxima). Separa el casco oscuro del agua (ART-DIRECTION §4.5) |
| Topes | ≤ 50 manchas vivas por barco. El *ring buffer* recorta la cola de la estela si el pool se llena. Móvil: pool de 384 y vida × 0,7 |
| Técnica | `P_WATER` (CPU: acumular la distancia de ≤ 41 barcos) + `P_CONTACT` |

## 9. Números de daño flotantes

| Campo | Valor |
|---|---|
| Disparador | **Uno por andanada** (GDD §14): cuando llega la primera bala de acierto se muestra `impactos × daño` (lo informa el servidor). Con 0 impactos: "Fallo", solo si el tirador o el objetivo es el jugador. Reparación propia: se suma cada 1 s. Oro: al acreditarse una recompensa o recoger restos |
| Técnica | Capa DOM (ART-DIRECTION §11, z = 15) con un pool de 24 (escritorio) o 16 (móvil) pares `<div><span/></div>`. El `div` exterior se reposiciona en cada frame, por ref, en la proyección de un **punto fijo del mundo** (`socket_label` del objetivo en el instante de aparecer), así que acompaña a la cámara. El `span` interior se anima con la Web Animations API (`el.animate`) solo sobre `transform` y `opacity` (compositor). Sin estado de React |
| Contorno | `text-shadow: -1px 0 #07121B, 1px 0 #07121B, 0 -1px #07121B, 0 1px #07121B, 0 2px 4px rgba(0,0,0,.6)` (contraste frente al contorno ≥ 7,5:1 en todos los tipos; ART-DIRECTION §4.5) |
| Movimiento | 0–90 ms escala 0,8 → 1,15; 90–200 ms → 1,0. Sube 36 px en 900 ms (`cubic-bezier(.22,1,.36,1)`). Opacidad 1 hasta 600 ms → 0 en 900 ms. Jitter horizontal aleatorio de ±10 px al aparecer. Si en el mismo objetivo aparece otro número antes de 250 ms, empieza 18 px más arriba |
| Tope | 24 / 16 simultáneos; si se supera, se recicla el más viejo |

| Tipo | Texto | Color | Fuente (Barlow Semi Condensed) |
|---|---|---|---|
| Daño infligido por ti | `−90` | `#FFD166` | 20 px / 700 |
| Golpe fuerte (≥ 15 % de la vida máxima del objetivo) | `−144` | `#FFD166` | 26 px / 700 + pulso inicial de 1,4 → 1,0 |
| Daño recibido | `−66` | `#FF7A7A` | 22 px / 700 |
| Daño entre terceros | `−44` | `#F5F1E6` α0,75 | 15 px / 600 |
| Fallo | `Fallo` | `#C9D4DB` | 14 px / 600 cursiva |
| Reparación propia | `+32` | `#3DDC97` | 15 px / 600 |
| Oro | `+120 ◉` | `#F2C14E` | 18 px / 700; dura 1 200 ms y sube 48 px |

## 10. Marcador de clic de destino

| Campo | Valor |
|---|---|
| Disparador | Clic o toque en el agua, **local e inmediato** (≤ 50 ms, AC-14), antes de la respuesta del servidor. El destino se ajusta en el cliente con la misma función pura de la simulación (límite ±490 m y punto navegable más cercano si cae en una isla; GDD §5, §6) |
| Forma | **Ping**: anillo de 8 a 44 px de diámetro en 350 ms *ease-out*, trazo de 2 px, α 1 → 0. **Marcador persistente**: anillo de 24 px de diámetro con trazo de 2 px y α 0,6 que late (escala 0,92 ↔ 1,08 a 1,2 Hz) + punto central de 5 px. Tamaños en px constantes (el shader usa `uPpm`) |
| Colores | `#E6F7FF` con un contorno de 1 px `#07121B` α0,5 a ambos lados (visible sobre arena y espuma) |
| Destino ajustado (> 1 m del clic) | Una ✕ de 12 px `#FF7A7A` en el punto del clic, que se desvanece en 300 ms, y una línea discontinua de 1 px hasta el marcador |
| Fin | Al llegar (≤ 2 m, GDD §6) el marcador se encoge a 0 en 200 ms. Con `S` (detener) o un clic nuevo se reemplaza al instante |
| Tope | 1 persistente + 1 ping + 1 ✕ (instancias de `RINGS`) |
| P2 | Ruta prevista: línea discontinua `#E6F7FF` α0,25 del barco al destino |

## 11. Anillos: selección, hover, propio y alcance

**Técnica:** `RINGS`, un único `InstancedMesh` de quads horizontales con un shader de anillo. Atributos por instancia: centro, radio (m), trazo (px), color RGBA, número de trazos, fracción llena, velocidad de giro y contorno. El grosor y el contorno se calculan en px con `uPpm`, así que se ven igual en escritorio y en móvil. `depthTest: false` y `renderOrder` entre las islas y los barcos (§0.2).

| Anillo | Disparador | Radio | Trazo | Color | Patrón y animación |
|---|---|---|---|---|---|
| **Objetivo** | Selección local (clic, toque o Tab; AC-26) | `sb_radius` del objetivo × 1,1 | 3 px + contorno de 1 px `#07121B` α0,6 | `#FFD166` | 12 trazos llenos al 70 %, girando a 25°/s. **Fuera de alcance**: llenos al 40 %, sin giro y **α 1** (con α 0,6 el oro se mezclaba con el agua y se veía caqui, `#A9B086` en `desktop-target.png`; D11) |
| Hover (escritorio) | Puntero sobre la caja de selección (`sb_pick`), raycast a 30 Hz | `sb_radius` × 1,05 | 2 px | `#FFFFFF` α0,5 | Continuo |
| **Propio** | Siempre que se está vivo | `sb_radius` × 1,1 | 2 px | `#F2C14E` α0,4 | Continuo (adapta el anillo verde propio de Seafight, ART-DIRECTION R5) |
| **Alcance** | Hay un objetivo seleccionado | Alcance del cañón actual (60/70/80 m, GDD §7), centrado en el barco propio | 1,5 px | **En alcance**: `#3DDC97` α0,45 · **Fuera**: `#F5F1E6` α0,25 | En alcance: trazos de 2 m / huecos de 2 m. Fuera: trazos de 2 m / huecos de 6 m. Se distinguen en grises (AC-74) |

- Al hundirse el objetivo, su anillo se desvanece en 300 ms.
- Con `prefers-reduced-motion`, los anillos no giran.

## 12. Reaparición y protección

| Campo | Valor |
|---|---|
| Disparador | Reaparición (`respawn` aceptado; GDD §12) |
| Emersión | El barco sube de `y = −(F + 1)` a 0 en 600 ms (`easeOutBack`), más 3 ondas en `P_WATER` de 2 m a 2,4·L de diámetro en 1,2 s con 0,2 s de desfase, `#EAF6FA` α0,8 → 0 |
| Protección (15 s o hasta atacar) | El anillo propio se sustituye por 2 anillos `RINGS` `#BDEBFF`: r × 1,1 continuo de 2 px α0,7 + r × 1,22 discontinuo de 2 px α0,5 girando a −30°/s. Lo ven todos los jugadores. Además, el uniform `uShield` añade un **borde luminoso (rim)**, no un velo sobre el difuso, porque el velo dejaba el casco grisáceo (D8): antes de `#include <opaque_fragment>`, `outgoingLight += uShieldColor · 0.6 · uShield · pow(1 − abs(dot(normal, normalize(vViewPosition))), 2)` con `uShield = 0,4 + 0,6·(0,5 + 0,5·sin(2π·2t))`. La placa muestra el escudo + segundos (ART-DIRECTION §11.1) |
| Fin de la protección | Los anillos se encogen y se desvanecen en 300 ms y `uShield` vuelve a 0 |
| Tope | 2 instancias de `RINGS` por barco protegido (con 20 jugadores reapareciendo, 40 de 64) |

## 13. Reparación

| Campo | Valor |
|---|---|
| Disparador | Estado `Reparando` (GDD §8) |
| Forma | 3 cruces/s (forma 6) desde puntos aleatorios de la cubierta, a 1,2 m/s hacia arriba, de 0,6 m (mínimo 6 px), vida 1,0 s, `#3DDC97` α0,9 → α0. Más 2 virutas/s (forma 3), `#C9965E`, de 0,2 m, a 2 m/s hacia arriba, g = −10, vida 0,6 s |
| Bajo fuego (+1,5 %/s) | Tasas × 0,5 |
| Números | "+N" cada 1 s, solo en el barco propio (§9) |
| Técnica | `P_ALPHA` |

## 14. Restos flotantes (P1, GDD §10)

| Campo | Valor |
|---|---|
| Disparador | Aparece la caja `prop_loot` en la posición de un NPC hundido |
| Movimiento | Balanceo `y = 0.15·sin(2πt/2.4)` y giro en Y a 0,4 rad/s (instancia de `prop_loot`) |
| Marca | Anillo `RINGS` de 5 m de diámetro (mínimo 20 px), `#F2C14E` α0,45, latiendo a 1 Hz. Destello `P_ADD` cada 0,6 s sobre la caja: 0,5 m (mínimo 6 px), `#FFF2B3`, vida 0,4 s |
| Últimos 5 s (de 30) | El anillo parpadea a 2 Hz. Se cuenta con `expiresAt` de `WreckView` (hora del servidor, convertida con el desfase de reloj de la interpolación). Hasta que el servidor lo envíe, se cuenta desde que el cliente ve el resto (D4) |
| Recogida | 6 chispas doradas `P_ADD` + número de oro "+30 ◉" (§9) + la caja escala a 0 en 200 ms |

---

## 15. Reglas verificables (QA)

Escena de combate estándar = AC-89 (20 barcos + 20 NPC + islas) con ≥ 6 duelos simultáneos en pantalla.

| Id | Regla | Medición | Umbral | AC |
|---|---|---|---|---|
| VFX-01 | Draw calls de VFX | `renderer.info.render.calls` con los VFX activos menos con los VFX desactivados, en la escena estándar | ≤ 7 (tope 11) | AC-89 |
| VFX-02 | Sin asignaciones | 60 s de combate: `renderer.info.memory.geometries` y `.textures` constantes; heap atribuible a VFX | Δ = 0 · ≤ 2 MB | AC-91 |
| VFX-03 | Pools acotados | Contador de depuración de instancias vivas por pool | ≤ tamaño del pool (§0.2) | — |
| VFX-04 | Fogonazo visible | Captura de frames a 60 fps | Visible entre 3 y 9 frames | — |
| VFX-05 | Andanada correcta | Fogonazos por andanada y banda | = cañones por banda de la clase (4/6/8; Pirata 4), en la banda que mira al objetivo | — |
| VFX-06 | Sincronía de la bala | Llegada de la primera bala frente a `t + d/120` | ±1 frame | AC-33 |
| VFX-07 | Fallo legible | Captura con el zoom por defecto en 1440×900 y 390×844 | La salpicadura es visible ≥ 300 ms y la onda llega a ≥ 36 px de diámetro | AC-75 |
| VFX-08 | Número de daño legible | Captura + DOM | Aparece ≤ 50 ms tras la llegada; daño propio ≥ 20 px; contraste con el contorno ≥ 4,5:1; desaparece a los 900 ms ±1 frame; ≤ 24 simultáneos | AC-75 |
| VFX-09 | Umbrales de daño | Barco al 60/50/30/25/20 % de vida (y reparado al 54 %) | Humo solo con ≤ 50 % (se apaga con > 53 %); fuego solo con ≤ 25 % (se apaga con > 28 %) | — |
| VFX-10 | Hundimiento | Captura secuencial | Dura 3,0 s ±1 frame; en t = 2,9 s no queda geometría del barco sobre y = 0; en t = 3,0 s no se dibuja | AC-61 |
| VFX-11 | Estela | Barco a > 0,6 m/s frente a parado | Hay espuma de popa y bigote al navegar; parado solo queda la espuma de contacto | — |
| VFX-12 | Marcador de clic | Marca de tiempo del evento frente a la del marcador (e2e) | ≤ 50 ms; persiste hasta llegar a ≤ 2 m; `S` lo quita | AC-14, AC-19 |
| VFX-13 | Anillo de objetivo visible | Captura con el objetivo sobre agua y junto a una isla | Hay píxeles del anillo con contraste ≥ 3:1 frente al fondo local en los dos casos | AC-74 |
| VFX-14 | Alcance distinguible | Captura en escala de grises en alcance y fuera de alcance | Patrón de trazos distinto (2/2 m frente a 2/6 m) | AC-74 |
| VFX-15 | Movimiento reducido | Emular `prefers-reduced-motion: reduce` | Sin sacudida ni anillos girando | — |
| VFX-16 | Sin React | Profiler durante un combate sin cambios de HUD | 0 commits atribuibles a VFX | AC-85 |
| VFX-17 | Coste | Traza de Performance en el portátil de referencia: escena estándar con VFX frente a sin VFX | p95 del frame +≤ 2 ms | AC-90 |
| VFX-18 | Protección | Captura tras reaparecer | Anillos `#BDEBFF` y escudo durante 15 s o hasta atacar | AC-64 |
| VFX-19 | Restos (P1) | Captura | Anillo dorado visible; parpadea los últimos 5 s; desaparece a los 30 s | AC-59 |
| VFX-20 | Humo con vida baja legible | Pirata al 20 % de vida: L\* de los píxeles con humo frente a los mismos píxeles sin VFX, **los dos leídos de la captura de pantalla** (sRGB, mismo pipeline); altura de la columna | El humo denso aclara: ΔL\* ≥ +15 sobre la vela negra; la columna llega a la punta del mástil más alto ±15 % | — |
| VFX-21 | Humo de andanada visible | Captura 300 ms después del fogonazo | Hay humo junto a cada boca, ≥ 8 px de diámetro y L\* ≥ 70 | — |
