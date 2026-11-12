# Changelog

Todos los cambios relevantes de Sea Battle se documentan en este archivo.

El formato sigue [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/) y el proyecto usa [versionado semántico](https://semver.org/lang/es/).

## [Unreleased]

## [1.2.0] - 2026-11-12

### Añadido

- **Un mapa nuevo.** El mar sigue midiendo 1 × 1 km, con el puerto en el centro y la misma zona segura de 110 m, pero ahora tiene 8 islas, 4 calas piratas y un paso entre escollos. Cerca del puerto hay dos islotes con poblados de pescadores, y cuanto más te alejas, más oscuro y rocoso es el paisaje. Cada zona pirata se reconoce por el suyo: el acantilado al noreste, el volcán al noroeste, la roca al suroeste y los escollos y la selva al sureste. Al fondo de cada una hay una cala pirata, la guarida del Capitán. Las 6 islas de siempre siguen en su sitio, con otra forma y con sus islotes. Como antes, las islas cortan el paso, pero no paran los disparos.
- **Un paso entre escollos.** Al sureste, 3 rocas a flor de agua dejan pasos estrechos. Caben la Balandra y el Bergantín; la Fragata, las cañoneras y el Capitán pirata, no. Si te persigue un barco grande, puedes escapar por ahí. No hace falta calcularlo: haz clic al otro lado y la ruta cruza el paso o lo rodea según tu barco.
- **Un puerto con forma de isla,** con ciudad, fuerte, muelles, un palmar y 12 amarres.
- **El Capitán pirata, el jefe del mar.** Aparece cuando se han hundido 10 piratas o cañoneras en el servidor desde que cayó el anterior, en la guarida de la zona pirata con menos jugadores, y todos reciben el aviso, por ejemplo «¡Capitán pirata en el noroeste, sector B2!». Su icono se ve en el minimapa desde cualquier punto, y nunca hay dos a la vez. Tiene 1 800 de vida y cañones que llegan a 65 m. Si se aleja más de 150 m de su guarida, o tú te alejas más de 110 m de él, vuelve a la guarida y recupera toda la vida. Hundirlo da 600 de oro y 240 de experiencia, repartidos según el daño, y deja una caja de restos de 150 de oro. El aviso de su hundimiento nombra a quienes se reparten el botín.
- **Cañoneras piratas.** Hay 4, una por zona pirata, en lugar de 4 de los 12 piratas: ahora son 8 piratas y 4 cañoneras. Mantienen la distancia: sus cañones llegan a 65 m, más que los de nivel 1 (60 m), y si te acercas a menos de 55 m se alejan sin dejar de disparar. Son más lentas que cualquiera de tus barcos, así que puedes alcanzarlas. Tienen 900 de vida, dan 210 de oro y 60 de experiencia, dejan una caja de 50 y reaparecen a los 45 s.
- **«Demasiado fuerte para tu barco».** El panel del objetivo te avisa cuando hundir ese barco tú solo te costaría más de la mitad de tu vida. Con la Balandra y los cañones de nivel 1, sale con las cañoneras y con el Capitán; con los cañones de nivel 2, deja de salir con las cañoneras.

El Capitán pirata, las cañoneras y ese aviso ya navegaban desde el 7 de noviembre de 2026. Desde esta versión son parte fija del juego.

### Cambiado

- **Apareces atracado en el puerto.** Al entrar al juego y al zarpar tras hundirte, tu barco aparece atracado de popa en un amarre libre, con la proa hacia el mar. Si los 12 amarres están ocupados, apareces junto al puerto, como antes.
- **La primera vez que entras, el juego descarga los modelos de las islas y del puerto.** Las siguientes veces ya los tiene tu navegador y no descarga nada. Con una conexión lenta, al entrar puedes ver el puerto y las islas un momento en una versión sencilla, con la misma costa, hasta que llegan.
- **Interno: las pruebas de rutas usan el mapa nuevo,** con las 7 clases de barco. Otra prueba lanza barcos de 3 clases contra la costa de las 16 formas, en 8 rumbos, y ningún casco toca tierra.
- **Interno: un escenario de prueba de combate con el Capitán y una cañonera,** para medir el rendimiento del juego con ellos. Solo existe en el modo invitado de pruebas, que nunca corre en Railway.
- **Interno: las pruebas de navegador esperan hasta 120 s a que entre cada página** (antes, 30). Con el mapa nuevo y varias páginas abiertas a la vez, el WebGL por software de la CI tarda más en dibujarlas.

### Operación

- **El mapa nuevo, el Capitán pirata y las cañoneras vienen encendidos sin ninguna variable.** `SEA_BATTLE_I2=1` ya no hace falta, y dejarla puesta no cambia nada ni da avisos. Para una emergencia, `SEA_BATTLE_MAP=1.0` vuelve al mapa de la 1.0 y `SEA_BATTLE_I2=0` apaga el Capitán y las cañoneras, con un redespliegue y sin tocar código. El arranque escribe qué mapa queda y si el Capitán y las cañoneras están encendidos, y `/healthz` lo dice en `map` e `i2`.

### Límites conocidos

- **La portada todavía enseña las islas de antes.** El juego ya usa el mapa nuevo; la portada se pondrá al día en una próxima versión.

## [1.1.4] - 2026-11-04

### Corregido

- **El Capitán pirata ya no gira en el sitio junto a una isla.** Cuando su punto de órbita caía en la orilla, daba vueltas sin avanzar. Ahora mira cuánto mar libre le queda en cada sentido de la órbita: si el suyo se cierra y el otro está más libre, da la vuelta, con 15 s como mínimo entre un cambio y otro. Si no le queda mar libre en ningún sentido, como en un canal entre dos islas, se queda quieto a tiro y sigue disparando. Los piratas y la cañonera navegan igual que antes. En mar abierto, el Capitán también.
- **Interno: pruebas del regreso del Capitán a su guarida (AC-112).** Al llegar, su registro de daño queda vacío. A un jugador que se desconecta lo sigue atacando durante sus 10 s de gracia, y cuando su barco desaparece, el Capitán vuelve sin disparar. La prueba de 10 minutos ya no exige que el Capitán vuelva a la guarida, porque eso dependía del azar.

### Cambiado

- **Interno: la CI corre en Node 24 y en Ubuntu 26.04.** Las acciones de GitHub pasan a versiones que usan Node 24: checkout v5.1.0, setup-node v5.0.0, upload-artifact v6.0.0 y download-artifact v7.0.0. El runner queda fijado en `ubuntu-26.04`, la imagen que ya usaba. Se acaban los avisos de Node 20 y de `ubuntu-latest`.

## [1.1.3] - 2026-11-02

### Cambiado

- **Nada cambia para quien juega.** El juego se ve y se juega igual que en la 1.1.2.
- **Interno: las escenas de la prueba de legibilidad del Capitán pirata (AC-115).** Son las capturas que se enseñan a los evaluadores. En escritorio, el Capitán sale a 225°. En móvil sale a 90°, con su propia escena: desde el puesto de escritorio, la proa se salía de la pantalla. En las dos, cada barco ocupa sus propias celdas de la rejilla, para que no puntúe quien confunda los 3 piratas. Estas escenas solo existen en el modo invitado de pruebas, que nunca corre en Railway, y necesitan `SEA_BATTLE_I2=1`.

## [1.1.2] - 2026-11-02

### Corregido

- **Barcos que daban vueltas alrededor de un punto.** Si mandabas la Fragata a un punto cercano a su espalda, a veces se quedaba girando alrededor sin llegar nunca, y mientras giraba no se reparaba. Les pasaba también a los mercantes. Ahora cada barco frena según lo que gira y llega al punto. Las rutas largas no cambian.
- Los enlaces del final de este archivo llegan a todas las versiones publicadas.

## [1.1.1] - 2026-11-02

### Añadido

- **Opciones de cámara y teclas.** Un botón nuevo con un engranaje, junto a tu oro, abre el panel de opciones. El juego no se pausa mientras lo tienes abierto, y el panel se cierra con Esc, con su botón de cerrar o con un clic fuera. Puedes elegir entre dos cámaras: **«Centrada»**, que sigue a tu barco en todo momento, y **«Libre»**, la vista libre de la 1.1.0. En escritorio, con ratón, también puedes cambiar las teclas de mover la vista, Centrar y Detener: si eliges una tecla que ya usa otra de ellas, se intercambian, y **Restablecer** vuelve a las de siempre. Lo que elijas se guarda en tu navegador.

### Cambiado

- **La cámara de partida es «Centrada».** Tu barco queda siempre en el centro de la pantalla. Arrastrar en el agua te lleva hasta donde sueltas, como un clic, y el minimapa solo se mira. Si prefieres la vista libre de la 1.1.0, elige «Libre» en Opciones y se recordará la próxima vez.
- La ranura de Detener y el botón Centrar enseñan la tecla que tengas asignada.

## [1.1.0] - 2026-10-25

### Añadido

- **Experiencia y niveles.** Hundir barcos da experiencia: 10 un mercante y 30 un pirata, repartidos según el daño que hizo cada jugador, igual que el oro. Hundir a otro jugador da 100, repartidos igual, con un 10 % más por cada nivel que te saque (hasta un 50 % más) y un 25 % menos por cada nivel que tú le saques. Si vuelves a hundir al mismo jugador en los 30 minutos siguientes, da la mitad, y a partir de la tercera vez, nada. Quien se hunde no pierde experiencia. Hay 20 niveles; pasado el 20, la experiencia se sigue sumando.
- **Rangos e insignias.** Cada 4 niveles subes de rango: Grumete (desde el nivel 1), Marinero (5), Contramaestre (9), Teniente (13) y Almirante (17). Tu insignia se ve en tu panel y sobre tu barco. La de los demás jugadores se ve sobre sus barcos y, con su nivel, en el panel del objetivo. Al subir de nivel, un aviso te lo dice, por ejemplo «¡Nivel 5! Ahora eres Marinero».
- **Barra de experiencia** en tu panel, con tu nivel. Al pasar el ratón por encima ves cuánta llevas en tu nivel y cuánta pide el siguiente.
- **Vista libre.** Puedes mover la vista por el mar sin que el clic deje de servir para navegar: arrastra en el agua, haz clic o arrastra en el minimapa o, en escritorio, usa las flechas. Si haces clic en el agua, tu barco va hasta allí aunque esté lejos. `C` o **Centrar** devuelven la vista a tu barco, y también vuelve sola cuando te dañan. Si tu barco queda fuera de la pantalla, una flecha en el borde te dice dónde está, y otra te avisa de quién te dispara aunque no lo veas.

### Cambiado

- **Tu experiencia se guarda** con tu oro, tus mejoras y tus barcos. Si vienes de la 1.0, entras con todo lo que tenías y 0 de experiencia. Si hubiera que volver a la 1.0.3, tu experiencia se queda guardada y la recuperas al volver a la 1.1.

## [1.0.4] - 2026-10-23

### Seguridad

- **Next.js 15.5.28.** Corrige dos fallos de seguridad de Next.js publicados el 2026-10-22, que afectaban a la 15.5.27 que usaba la 1.0.3. El primero, crítico, estaba en la optimización de imágenes y podía permitir ejecutar código en el servidor (GHSA-2464-fhr4-w9xw). El segundo, de gravedad alta, dejaba saturar el servidor con peticiones preparadas contra las Server Actions (CVE-2026-94482). La 15.5.28 también exige `sharp` 0.35.5 o superior, la versión que cierra el primero. Nada cambia en lo que ves ni en cómo se juega.

## [1.0.3] - 2026-10-17

### Cambiado

- **Preparada para la 1.1.** La 1.1 guardará también la experiencia y dos barcos nuevos, la Goleta y el Navío de línea. Si después de publicarla hubiera que volver a la versión anterior, la 1.0.2 no podría leer esas partidas y quien hubiera jugado a la 1.1 vería «No podemos cargar tu progreso ahora mismo». La 1.0.3 sí las lee: juegas con tu oro, tus mejoras y tus barcos de siempre, y la experiencia y los barcos nuevos se quedan guardados tal como estaban, aunque esta versión no los muestra. Si tu barco activo era uno nuevo, entras con el mejor de los de siempre que tengas; al volver a la 1.1, el barco nuevo se elige otra vez en el puerto, sin coste. Nada cambia en lo que ves ni en cómo se juega.
- **Interno: las pruebas de navegador solo recogen los `.spec.ts`.** Los tests de Jest del arnés de estrés (`e2e/stress/__tests__/`), añadidos después de la 1.0.2, hacían que `npm run test:e2e`, `test:perf`, `test:soak` y `qa:capture` terminaran con error y 0 tests; ahora vuelven a correr los suyos (H-30). No cambia nada del juego.

## [1.0.2] - 2026-10-12

### Corregido

- **Un segundo rebote al entrar.** Con la 1.0.1, si la sesión volvía a desincronizarse en menos de 30 s después de la primera recarga, la página podía volver a rebotar entre el juego y el inicio de sesión. Ahora, al entrar al juego se borra la marca de esa recarga, así que cada desacuerdo se resuelve con una sola recarga. Una sesión que ni la recarga arregla sigue yendo al inicio de sesión sin recargar en bucle.

## [1.0.1] - 2026-10-12

### Corregido

- **Bucle al entrar después de crear una cuenta.** Tras registrarse, la página podía rebotar entre el juego y el inicio de sesión durante cerca de un minuto. Pasaba cuando el servidor todavía no reconocía la sesión que el navegador ya tenía: en prod, Clerk actualiza por su cuenta una cookie de sesión y, en una navegación interna de la página, el servidor no puede renovar el token. Ahora, en ese caso, la página del juego se recarga una sola vez, Clerk renueva la sesión y se entra al juego. Sin sesión, `/game` sigue llevando al inicio de sesión como antes.

## [1.0.0] - 2026-10-12

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
- **(d) Avisos de seguridad de `postcss`.** `next` 15.5.27 lleva su propia copia de `postcss` (≤ 8.5.22), con 4 avisos de severidad alta, y `next` sale como moderada por depender de ella:
  - [GHSA-qx2v-qp2m-jg93](https://github.com/advisories/GHSA-qx2v-qp2m-jg93): XSS por un `</style>` sin escapar en el CSS que genera;
  - [GHSA-6g55-p6wh-862q](https://github.com/advisories/GHSA-6g55-p6wh-862q): lectura de archivos arbitrarios mediante un `sourceMappingURL` controlado por el atacante en comentarios CSS;
  - [GHSA-fxqj-rqcc-2cmp](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp): arreglo incompleto del anterior, cuando `from` no está definido;
  - [GHSA-r28c-9q8g-f849](https://github.com/advisories/GHSA-r28c-9q8g-f849): recorrido de rutas al cargar los source maps previos, que expone archivos `.map`.

  El arreglo exige `next` 16.4.0. Ese salto de versión mayor, con riesgo de regresión justo antes de publicar, va a la 1.1. Es la única excepción: `npm audit` pasa de 15 vulnerabilidades antes de la 1.0.0 (2 críticas, 9 altas y 4 moderadas) a estas 2 (1 alta y 1 moderada), y ninguna otra dependencia de producción tiene avisos altos ni críticos.
- **(e) El botón de ver la contraseña se anuncia en inglés.** En el inicio de sesión y en el registro, un lector de pantalla lee «Show password» / «Hide password». En pantalla no se ve ningún texto en inglés. El texto está fijo en el componente de Clerk y no se puede traducir. Se revisará si Clerk lo permite en una versión futura.
- **(f) El rendimiento se mide en un Apple M4 Pro, no en un portátil común.** El objetivo son 60 fps en un portátil común, y la 1.0.0 no tiene uno para comprobarlo. Por eso se mide en un M4 Pro con un umbral más exigente: el p95 del trabajo por frame, ≤ 7 ms, frente a los 20 ms del criterio original. La equivalencia, ~2,8 veces un M1, es una estimación por especificaciones, no una medida. Medido en la 1.0.0: 120 fps de media y 2,55 ms de p95 en 60 s de combate, con Chrome y la GPU Metal del M4 Pro a DPR 2.
- **(g) Otra pestaña abierta durante una actualización del servidor.** Si en los primeros segundos de una actualización abres el juego en otra pestaña, o recargas, mientras tu sesión sigue en el servidor anterior, la pestaña nueva puede cargar tu progreso anterior. Durante ese rato puede haber dos barcos tuyos, uno en cada servidor. El juego lo detecta al guardar: no sobrescribe lo más reciente, y la sesión con el progreso anterior se cierra con «Has abierto el juego en otra pestaña». Al volver a entrar cargas lo último. Como mucho pierdes el botín que ganaste en esa sesión antes de su primer guardado, nunca lo ya guardado ni una compra o un cambio de barco confirmados. Ventana medida en staging con la 1.0.0: el servidor anterior guarda tu progreso entre 1,29 y 1,45 s después de que el tráfico pase al nuevo, y el navegador ve el cierre a los 1,52 s (2,30 s en el primer despliegue de la versión).

### Operación
- **Postgres.** El progreso se guarda en Postgres (tabla `player_progress`). En Railway, `DATABASE_URL` es obligatoria: sin ella, el servidor no arranca. Las migraciones se aplican al arrancar, antes de abrir el puerto. Si fallan, el healthcheck no pasa y sigue el despliegue anterior. Staging usa Postgres 18, y las suites de persistencia pasan con la 18.6.
- **Railway: la configuración vive en los ajustes y las variables del servicio de cada entorno, no en el repo.** Railway no aplica `railway.json` a este servicio, y el archivo ya no existe. Los deploys se lanzan a mano: ningún entorno tiene disparador. Se comprueba en solo lectura con `python3 scripts/railway/check_deploy.py --env staging` (o `production`), que sale con 1 si algo no coincide.

| Valor | Dónde | Por qué |
|---|---|---|
| Arranque `node dist/server/index.js` | Ajuste Start Command | El arranque con `node` (sin `npm`) hace que el `SIGTERM` llegue al servidor y el progreso se guarde antes de cerrar |
| Healthcheck `/healthz` | Ajuste Healthcheck Path | Sin respuesta 2xx, el tráfico no pasa al despliegue nuevo |
| 1 réplica | Ajuste Replicas | Un solo mundo y un solo escritor por cuenta |
| Solape 0 | Variable `RAILWAY_DEPLOYMENT_OVERLAP_SECONDS=0` | El servidor anterior recibe el `SIGTERM` al empezar el relevo |
| Drenaje de 15 s | Variable `RAILWAY_DEPLOYMENT_DRAINING_SECONDS=15` | Más que los 10 s del apagado, para que no se corte el guardado |

- **clerk-js fijada en 5.128.0** (`src/lib/clerk-js.ts`). El navegador carga esa versión y no la última 5.x, así que Clerk no puede cambiar textos ni comportamiento en prod sin un deploy nuestro. Mantenimiento: cada subida de `@clerk/nextjs` o de clerk-js cambia la versión fijada a propósito, en un commit propio, y vuelve a pasar las pruebas de los textos en español del inicio de sesión y el registro (AC-140 c y AD-35 d). Así ningún texto nuevo de Clerk en inglés llega a prod sin que nadie lo vea.
- **Node 24 en todo**: local, CI y Railway usan la misma versión mayor. La fijan `engines.node` (`24.x`) en `package.json`, `.nvmrc` y la CI, que lee `.nvmrc`. Si `verify` corre con otra versión mayor, falla `server/__tests__/node-runtime.test.ts`.

[Unreleased]: https://github.com/jonattan-infante/sea-battle/compare/v1.2.0...HEAD
[1.2.0]: https://github.com/jonattan-infante/sea-battle/compare/v1.1.4...v1.2.0
[1.1.4]: https://github.com/jonattan-infante/sea-battle/compare/v1.1.3...v1.1.4
[1.1.3]: https://github.com/jonattan-infante/sea-battle/compare/v1.1.2...v1.1.3
[1.1.2]: https://github.com/jonattan-infante/sea-battle/compare/v1.1.1...v1.1.2
[1.1.1]: https://github.com/jonattan-infante/sea-battle/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/jonattan-infante/sea-battle/compare/v1.0.4...v1.1.0
[1.0.4]: https://github.com/jonattan-infante/sea-battle/compare/v1.0.3...v1.0.4
[1.0.3]: https://github.com/jonattan-infante/sea-battle/compare/v1.0.2...v1.0.3
[1.0.2]: https://github.com/jonattan-infante/sea-battle/compare/v1.0.1...v1.0.2
[1.0.1]: https://github.com/jonattan-infante/sea-battle/compare/v1.0.0...v1.0.1
[1.0.0]: https://github.com/jonattan-infante/sea-battle/releases/tag/v1.0.0
