# Changelog

Todos los cambios relevantes de Sea Battle se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Unreleased]

## [1.0.0] - fecha por fijar

<!-- Al cortar: la fecha del tag v1.0.0, en formato AAAA-MM-DD (AC-139). -->

Primera versión numerada de Sea Battle, un juego naval multijugador de navegador inspirado en Seafight. Navegas con un clic, marcas un barco, das la orden de atacar y tu barco dispara andanadas solo hasta hundirlo. Con el botín compras en el puerto mejores cañones, casco, velas y barcos. Se juega en escritorio y en móvil, en https://seabattle.jonattan.dev.

### Añadido

#### Combate y NPC
- **Mar compartido:** hasta 20 jugadores por servidor, en un mar de 1 × 1 km con el puerto en el centro y 6 islas.
- **Navegar con un clic** o un toque: el barco traza la ruta solo, esquivando las islas. `S` lo detiene.
- **Seleccionar y atacar:** clic en un barco para marcarlo (`Tab` recorre los atacables a menos de 150 m) y `Espacio` o **Atacar** para atacar. El doble clic selecciona y ataca a la vez. `Esc` cancela el ataque y, si lo pulsas otra vez, la selección.
- **Ataque persistente:** tu barco dispara una andanada cada vez que los cañones están cargados y el objetivo está a tiro, en cualquier dirección. Puedes moverte sin dejar de disparar. Si el objetivo se aleja, el ataque espera a que vuelva a tiro, pero tu barco no lo persigue.
- **Reparación gratis** con `R` o **Reparar**: el barco se detiene y recupera el 4 % de su vida máxima por segundo, o el 1,5 % si le han dado en los últimos 3 s. Navegar o atacar la cancela. Con menos del 30 % de vida, el botón pulsa.
- **Piratas** (12, repartidos en cuatro zonas lejos del puerto): hostiles. Te atacan si te acercas a menos de 70 m o si les disparas, y te rodean a unos 45 m. Si te alejas, vuelven a su zona y recuperan la vida. Nunca se acercan al puerto. Reaparecen a los 30 s.
- **Mercantes** (8, en rutas cerca del puerto): pasivos. Nunca disparan y, si los atacas, huyen durante 12 s. Reaparecen a los 20 s.
- **Zona segura** de 110 m alrededor del puerto: los piratas no te eligen como objetivo y no hay combate entre jugadores.
- **Combate entre jugadores** fuera de la zona segura, cuando ninguno de los dos tiene protección. Quien hunde a otro jugador se lleva el oro que este pierde.
- **Hundimiento y vuelta al mar:** al hundirte ves quién te hundió y cuánto oro perdiste, con una cuenta atrás de 8 s. Después, **Zarpar** (o `Espacio` / `Enter`) te devuelve junto al puerto con la vida llena, el mismo barco y las mismas mejoras. Durante 15 s, o hasta que ataques, tienes protección: los piratas no te eligen y ningún jugador puede dañarte.

#### Economía y tienda
- Empiezas con **100 de oro** y una Balandra.
- **Botín:** un pirata da 105 de oro y un mercante 60, repartidos según el daño que hizo cada jugador. Al hundirse dejan una **caja de restos** (25 y 15 de oro) para el primero que pase a menos de 8 m. La caja dura 30 s.
- **Hundirte cuesta el 10 % de tu oro.**
- **Tienda del puerto** (`P` o **Puerto**, solo dentro de la zona segura). Las mejoras valen para todos tus barcos y se conservan al hundirte:

| Mejora | Nivel 2 | Nivel 3 |
|---|---|---|
| Cañones (ver la tabla de «Barcos y arte») | 500 de oro | 1 500 de oro |
| Casco: vida máxima ×1,2 / ×1,4 | 400 de oro | 1 200 de oro |
| Velas: velocidad máxima ×1,1 / ×1,2 | 300 de oro | 900 de oro |

- **Barcos:** el Bergantín cuesta 2 000 de oro y la Fragata, 6 000. Comprar un barco te pasa a él con la vida llena. Los barcos comprados son tuyos y puedes cambiar entre ellos gratis en el puerto.
- Todo junto cuesta 12 800 de oro. La munición es infinita y la reparación, gratis.

#### Barcos y arte
- **Tres clases de barco:**

| Barco | Vida | Velocidad máxima | Cañones por banda | Precio |
|---|---|---|---|---|
| Balandra | 800 | 14 m/s | 4 | Inicial |
| Bergantín | 1 400 | 12 m/s | 6 | 2 000 de oro |
| Fragata | 2 200 | 10 m/s | 8 | 6 000 de oro |

- **Tres niveles de cañones**, para cualquier barco:

| Cañones | Daño por bala | Precisión | Alcance | Recarga |
|---|---|---|---|---|
| Nivel 1 (de 8 libras) | 30 | 70 % | 60 m | 4,0 s |
| Nivel 2 (de 12 libras) | 38 | 75 % | 70 m | 3,5 s |
| Nivel 3 (de 18 libras) | 48 | 80 % | 80 m | 3,0 s |

- **Vista isométrica** que sigue a tu barco, con tres niveles de zoom. Con el zoom por defecto ves entero el alcance de tus cañones.
- **Islas** con muelles, rocas y palmeras.
- **Cada barco se reconoce de un vistazo:** los piratas llevan velas negras, mástiles inclinados y bandera con calavera; los mercantes son panzudos, con velas crema de franjas azules y carga en cubierta; los jugadores llevan velas claras, y el tuyo, además, un anillo propio.
- **Velas con textura de lona y cubiertas de tablas de madera.**
  <!-- O-11: si QA no aprueba AS-V22 antes del corte, quitar «y cubiertas de tablas de madera» y añadir la cubierta a «Límites conocidos» (BACKLOG, O-11). -->
- **Efectos de combate:** fogonazo y humo de los cañones, balas en arco, salpicaduras en los fallos, impactos en el casco, humo y fuego cuando a un barco le queda poca vida, hundimiento y estela.

#### HUD y móvil
- **Vida** (con alerta por debajo del 30 %) y **oro** (con «+N» al ganar).
- **Panel del objetivo:** nombre, tipo (hostil, pasivo o jugador), vida, distancia y si está a tiro.
- **Indicador de recarga** junto a tu barco, **anillo de selección** sobre el objetivo y **círculo de alcance** de tus cañones.
- **Un número de daño por andanada**, la suma de sus impactos, y «Fallo» cuando una andanada tuya o contra ti no acierta ninguna bala.
- **Etiquetas** con nombre, vida e icono de tipo sobre cada barco, que no se solapan entre sí.
- **Minimapa** con las islas, el puerto, la zona segura y los barcos cercanos.
- **Feed de eventos:** lo que hundes y su botín («Hundiste a Pirata +105 oro») y quién te hundió.
- **Avisos:** zona segura, protección con su tiempo restante y estado de la conexión (con el ping si pasa de 200 ms).
- **Primera partida:** tres pistas (navegar, seleccionar y atacar) que desaparecen al hacer cada cosa.
- **Móvil, en vertical y en horizontal:** tocar el agua navega y tocar un barco lo selecciona. Hay botones de **Atacar**, **Objetivo**, **Reparar** y **Puerto**, y el zoom va con el pellizco. Mientras juegas, la página no hace scroll ni zoom.

#### Cuentas y progreso guardado
- **Cuenta con usuario y contraseña**, sin correo.
- **Tu progreso se guarda:** oro, mejoras, barcos comprados y barco activo. La vida y la posición no: al volver, apareces en el puerto con la vida llena.
- Las compras y los cambios de barco se guardan antes de confirmarse, y el oro, en menos de 5 s. Las actualizaciones del servidor no te hacen perder progreso, salvo el caso de otra pestaña del límite (g).
- **Si no se puede cargar tu progreso**, ves «No podemos cargar tu progreso ahora mismo» con **Reintentar**. Nunca entras con una partida vacía que pise la tuya.
- **Si el guardado falla en plena partida**, sigues jugando con el aviso «Progreso sin guardar, reintentando…», y la tienda se cierra hasta que vuelva. Entonces se guarda todo.
- **Una sola sesión por cuenta:** si abres el juego en otra pestaña u otro dispositivo, la nueva toma tu barco y la anterior se cierra con «Has abierto el juego en otra pestaña».
- **Si se corta la conexión**, tu barco sigue 10 s en el mar y lo recuperas si vuelves a tiempo. El juego reintenta la conexión solo tres veces (a 1, 2 y 4 s) y después ofrece **Reintentar** o **Salir**.

#### Landing e icono
- **Portada** con el botón **Zarpar** y tres tarjetas: Navega, Combate y Mejora. Si el servidor está lleno, lo avisa: «Servidor lleno. Inténtalo en unos minutos».
- **Inicio de sesión y registro en español**, centrados en cualquier pantalla y con un enlace de vuelta a la portada. El registro avisa: «Guarda tu contraseña: no se puede recuperar».
- **Icono propio de Sea Battle** en la pestaña del navegador y en la pantalla de inicio del móvil.

### Límites conocidos

Detalle y criterios en `docs/game/BACKLOG.md`, «Conocidos de la 1.0.0».

- **(a) Comprar justo al hundirte.** Si tu barco se hunde en los ~20 ms en que una compra se está guardando, la compra se completa y el precio se cobra con el oro que te queda, sin bajar de 0, así que puede salirte más barata. Lo que se deja de cobrar no pasa del 10 % de tu oro, y nunca acabas con más oro que si hubieras comprado antes de hundirte. No se puede provocar a propósito: solo se compra en la zona segura, donde no entran los piratas ni hay combate entre jugadores.
- **(b) Cada actualización del servidor desconecta a todos unos segundos.** El juego reconecta solo y vuelves al puerto con la vida llena y todo tu progreso. El combate en curso se pierde. Se acepta porque, con dos servidores a la vez, habría dos mundos y dos copias de tu barco. Medido en staging: la pestaña vuelve a conectar 1,55 s y 4,75 s después de que el servidor anterior la suelte, dentro de los 7 s de reintentos automáticos.
- **(c) Sin correo no hay recuperación de contraseña.** Si la olvidas, pierdes la cuenta y su progreso. El registro lo avisa: «Guarda tu contraseña: no se puede recuperar».
- **(d) Avisos de seguridad de `postcss`.** `next` 15.5.27 arrastra una versión de `postcss` con avisos de seguridad moderados y altos, que solo se arreglan con `next` 16. Ese salto de versión mayor, con riesgo de regresión justo antes de publicar, va a la 1.1. Es la única excepción: ninguna otra dependencia de producción tiene avisos altos ni críticos.
  - Avisos: **PENDIENTE DT-11**.
- **(e) El botón de ver la contraseña se anuncia en inglés.** En el inicio de sesión y en el registro, un lector de pantalla lee «Show password» / «Hide password». En pantalla no se ve ningún texto en inglés. El texto está fijo en el componente de Clerk y no se puede traducir. Se revisará si Clerk lo permite en una versión futura.
- **(f) El rendimiento se mide en un Apple M4 Pro, no en un portátil común.** El objetivo son 60 fps en un portátil común, y la 1.0.0 no tiene uno para comprobarlo. Por eso se mide en un M4 Pro con un umbral más exigente: el p95 del trabajo por frame, ≤ 7 ms, frente a los 20 ms del criterio original. La equivalencia, ~2,8 veces un M1, es una estimación por especificaciones, no una medida.
- **(g) Otra pestaña abierta durante una actualización del servidor.** Si en los primeros segundos de una actualización abres el juego en otra pestaña, o recargas, mientras tu sesión sigue en el servidor anterior, la pestaña nueva puede cargar tu progreso anterior. Durante ese rato puede haber dos barcos tuyos, uno en cada servidor. El juego lo detecta al guardar: no sobrescribe lo más reciente, y la sesión con el progreso anterior se cierra con «Has abierto el juego en otra pestaña». Al volver a entrar cargas lo último. Como mucho pierdes el botín que ganaste en esa sesión antes de su primer guardado, nunca lo ya guardado ni una compra o un cambio de barco confirmados. Ventana medida en staging: 2,53 s hasta que el servidor anterior deja de simular, ≤ 6,5 s hasta que guarda y cierra, y 8,40 s hasta que el navegador ve el cierre.
  <!-- H-25: si el siguiente redeploy medido cierra H-25, sustituir la ventana por la medida de cierre (N, del cambio de /healthz a «💾 Progreso guardado»). -->

### Operación
- **Postgres.** El progreso se guarda en Postgres (tabla `player_progress`). En Railway, `DATABASE_URL` es obligatoria: sin ella, el servidor no arranca. Las migraciones se aplican al arrancar, antes de abrir el puerto. Si fallan, el healthcheck no pasa y sigue el despliegue anterior. Staging usa Postgres 18, y las suites de persistencia pasan con la 18.6.
- **Railway: la configuración vive en los ajustes y las variables del servicio de cada entorno, no en el repo.** Railway no aplica `railway.json` a este servicio, y el archivo ya no existe. Los deploys se lanzan a mano: ningún entorno tiene disparador. Se comprueba en solo lectura con `python3 scripts/railway/check_deploy.py --env staging` (o `production`), que sale con 1 si algo no coincide.

| Valor | Dónde | Por qué |
|---|---|---|
| Arranque `node dist/server/index.js` | Ajuste Start Command | El `SIGTERM` llega directo a `node` y el progreso se guarda antes de cerrar |
| Healthcheck `/healthz` | Ajuste Healthcheck Path | Sin respuesta 2xx, el tráfico no pasa al despliegue nuevo |
| 1 réplica | Ajuste Replicas | Un solo mundo y un solo escritor por cuenta |
| Solape 0 | Variable `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0` | El servidor anterior recibe el `SIGTERM` al empezar el relevo |
| Drenaje de 15 s | Variable `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` | Más que los 10 s del apagado, para que no se corte el guardado |

- **Node 24**, la versión con la que corre Railway. **PENDIENTE DT-14:** `engines.node`, `.nvmrc` y la CI en Node 24.

[Unreleased]: https://github.com/jonattan-infante/sea-battle/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/jonattan-infante/sea-battle/releases/tag/v1.0.0
