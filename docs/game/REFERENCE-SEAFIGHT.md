# Seafight — referencia de mecánicas

> Autor: `game-product` · Investigación: 2026-10-10; ampliada el 2026-10-17 para la 1.1.0 (§16–§19) · Consumidores: `GDD.md`, `game-ux`, `game-qa`

## 0. Conclusión

Seafight es un MMO naval en tiempo real de navegador (Bigpoint, desde 2006). Su bucle es: **clic en el mar para navegar → marcar un objetivo → una tecla de ataque que sigue disparando hasta que se cancela → hundir NPC por oro → mejorar cañones, velas y casco**. Tomamos ese bucle completo. Descartamos la capa de moneda premium (perlas), los monstruos con arpones y el abordaje. De los 50 niveles, la 1.1 adopta una versión reducida: 20 niveles con una sola experiencia (§16 y §19).

| # | Rasgo de Seafight que adoptamos | Evidencia |
|---|---|---|
| 1 | Navegar con clic en un punto del mar | V-Fuente (S4) |
| 2 | Marcar un objetivo y atacar con una tecla; el ataque sigue activo hasta "Cancelar ataque" | V-Fuente (S3) |
| 3 | Una tecla cicla entre los enemigos de la zona visible | V-Fuente (S3) |
| 4 | El cañón define precisión, alcance y recarga; la munición define el daño | V-Fuente (S5, S6) |
| 5 | Indicador de recarga junto al barco | V-Fuente (S3) |
| 6 | Reparar con un botón en el mar, también bajo fuego, pero rindiendo menos | V-Staff (S9) |
| 7 | 0 HP = barco hundido; reaparición en un refugio seguro | V-Staff (S15), V-Fuente (S20) |
| 8 | Protección temporal tras hundirse que se pierde al atacar | V-Fuente (S18), V-Staff (S19) |
| 9 | Oro como moneda blanda (NPC → tienda) | V-Fuente (S1, S12) |
| 10 | Minimapa con puntos por tipo de entidad | V-Staff (S16) |

**Niveles de evidencia:** `V-Staff` = dicho por personal de Team Seafight en el foro oficial · `V-Fuente` = dicho en una fuente publicada (wiki, guía o reseña de jugadores) · `HIPÓTESIS` = no verificado.

**Límites de la investigación:**
- `seafight.com` solo tiene texto de marketing (S2).
- Estas fuentes no se pudieron leer: el wiki de Fandom (HTTP 402), fr.vikidia (403) y en.wikipedia (404).
- Casi todos los datos vienen del foro oficial `board-en.seafight.com` (2014–2024). Pueden estar desactualizados; los números exactos sirven como **orden de magnitud**, no como valores a copiar.
- El "Seafight" de MobyGames (id 41250) es otro juego de escritorio y no se usa.

---

## 1. Identidad

| Afirmación | Cita textual | Fuente | Evidencia |
|---|---|---|---|
| Juego de navegador de Bigpoint, en línea desde el 18-03-2006 | "Seafight ist ein Online-Browserspiel der Firma Bigpoint, das seit dem 18. März 2006 betrieben wird." | S1 | V-Fuente |
| Objetivo: hundir monstruos, NPC y otros jugadores | "muss dort Monster oder Computerschiffe (NPCs) sowie Mitspieler versenken" | S1 | V-Fuente |
| 50 niveles agrupados en regiones temáticas | "Insgesamt ist das Spiel in 50 Level aufgeteilt" | S1 | V-Fuente |
| Tiempo real, monstruos marinos, clanes o juego en solitario | "Seafight es tu aventura fantástica en tiempo real." / "El mar está infestado de gigantescas criaturas marinas" | S2 | V-Fuente |
| Vista cenital oblicua (¾), **sin** rotación isométrica a 45°: la carta está alineada con los ejes de la pantalla y los sprites se ven desde arriba, con los mástiles visibles | El texto de la página no describe la vista. La conclusión sale del análisis de `game-ux` de las 6 capturas del cliente Flash (~2011). `game-product` verificó que la página es de Seafight y que tiene 6 capturas. | S24 | V-Fuente (análisis visual de capturas) |

## 2. Navegación

| Afirmación | Cita textual | Fuente | Evidencia |
|---|---|---|---|
| El barco se mueve haciendo clic en el mar | "clicking on a point on the sea, as in any strategy game" | S4 | V-Fuente |
| Los trayectos largos tardan | "Ships can take a lot of time going from place to place." | S4 | V-Fuente |
| Navegación por coordenadas (piloto automático), solo con premium | "your Ship will automatically sail there" / "Navigation is only available for Premium members." | S16b | V-Staff |
| La vista ("Chart area") se desplaza con teclas y vuelve al barco con "To the Ship" | "To the Ship: Jumps the Chart area back to your Ship" (paráfrasis de la tabla de controles) | S3 | V-Fuente |
| Hay velocidad base y bonificaciones de velas (+53 por vela Bermuda) | "Elite Ship has a starting base of 385 Speed." | S22 | V-Fuente |
| El barco esquiva las islas automáticamente (pathfinding) | — | — | **HIPÓTESIS** |

## 3. Selección de objetivo y ataque

| Afirmación | Cita / paráfrasis | Fuente | Evidencia |
|---|---|---|---|
| "Attack" ataca al objetivo marcado | "Attack: Attacks the currently marked target." | S3 | V-Fuente |
| "Cancel Attack" detiene el ataque en curso, así que el ataque es **persistente** | "Cancel Attack: Cancels the current attack." | S3 | V-Fuente |
| "Toggle Opponents" marca uno a uno a los enemigos (monstruos y NPC) de la zona visible | (tabla de controles) | S3 | V-Fuente |
| Las teclas se pueden reasignar; no se documentan las teclas por defecto | "you can assign a new key for that function" | S3 | V-Fuente |
| Indicador de recarga de cañón y arpón junto al barco | "Reload Symbol: Shows Cannon and Harpoon reloading beside your boat." | S3 | V-Fuente |
| Se puede alternar entre reparar y atacar rápidamente | "Spamming rep/attack buttons" | S9 | V-Staff |
| El costado del barco tiene que apuntar al objetivo (arco de andanada) | — | — | **HIPÓTESIS**: no la adoptamos (ver GDD §7) |
| El barco persigue solo al objetivo si está fuera de alcance | — | — | **HIPÓTESIS**: no la adoptamos |

## 4. Cañones: precisión, alcance y recarga

Fuente: S5 (tabla del foro; el alcance está en unidades propias del juego, no en metros).

| Cañón | Precisión | Alcance | Recarga | Precio |
|---|---|---|---|---|
| 8 libras | 25 % | 5 | 50 s | 750 oro |
| 12 libras | 29 % | 8 | 40 s | 2 000 oro |
| 20 libras | 38 % | 12 | 20 s | 6 000 oro |
| 30 libras | 45 % | 18 | 10 s | 10 000 oro |
| 50 libras | 75 % | 25 | 7 s | 100 000 oro |
| Thunderbolt (tope) | 75 % | 31→34 | 5,5→4,9 s | — |

**Patrón que extraemos:** cada nivel de cañón mejora **los tres ejes a la vez** (precisión ↑, alcance ↑, recarga ↓), y el precio crece de forma aproximadamente exponencial. Los cañones de reparación no hacen daño: "It does not do any damage. It is designed to repair your mates boats." (S5).

## 5. Munición

Fuente: S6. La munición define el daño de cada bala y se compra por lotes de 100.

| Munición (oro) | Daño | Precio / 100 |
|---|---|---|
| Cadena | 4 | 10 oro |
| Piedra | 6 | 15 oro |
| Astilla | 10 | 20 oro |
| Fuego | 14 | 25 oro |
| Hueca | 20 | 30 oro |

La munición "élite" va de 50 a 250 de daño y tiene efectos: daño en el tiempo (p. ej. Kraken Poison: "15 per tick, 4 ticks, every 3s"), bonificación contra elementales o desventajas (Depth Charge: "Reload time +2 seconds"). Algunos tipos de munición solo se pueden comprar con dinero real (S1: "Munitionsarten").

## 6. Monstruos y arpones

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Las balas de cañón no dañan a los monstruos | "Monsters can not be damaged by cannonballs, you need to equip yourself with some of the finest selection of harpoons!" | S7 | V-Fuente |
| Arpones de 10 a 2 000 de daño, que se consumen al disparar | "Each shot uses up one harpoon." | S7 | V-Fuente |

**Decisión:** fuera del MVP. Exigen un segundo sistema de armas y de inventario (ver GDD §3).

## 7. Reparación

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Hay una tecla de reparación, que exige tener un carpintero a bordo | "Repair: Repairs your Ship, but only if a Carpenter is on board." | S3 | V-Fuente |
| Se repara en el mar con un botón y el barco no se puede mover mientras tanto | "you can not move the ship at that time" | S4 | V-Fuente |
| Se puede reparar bajo fuego, pero se recupera menos | "You also have the ability to repair while being shot regardless of your stats, you will simply not repair as much." | S9 | V-Staff |
| La reparación funciona por ticks (valor por tick y duración del tick) | "Repair duration starts at 2 seconds I think" | S8 | V-Fuente (estimación de un jugador) |
| Por debajo de cierto umbral de HP no se puede reparar | "In order to repair you have to have more than 1,000 Hitpoints." (S10) / "below a thousand hp you lose the ability to repair your ship" (S11) | S10, S11 | V-Staff |
| Si HP < 25 000, el botón de reparar parpadea (opcional) | "Damage Info: ... the rep button blinks" | S3 | V-Fuente |

**Lo que extraemos:** reparar es una **decisión táctica**: te detienes y dejas de disparar, y bajo fuego rinde menos. El aviso de vida baja (botón que parpadea) se adopta tal cual.

## 8. NPC

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Los NPC tienen vida, recompensa en oro y XP, y mapas donde aparecen | p. ej. "Merchant Cutter … 200,000 [HP] … ~20,000 Gold, ~4 XP" | S12 | V-Fuente |
| Hay mercantes débiles con poca recompensa y fragatas más duras con más recompensa | Merchant Cutter 200 000 HP / ~20 000 oro; Ruthless Frigate 300 000 HP / ~560 000 oro | S12 | V-Fuente |
| Aparece un "almirante" tras hundir 10 NPC de un tipo | "Drakir Klert (Admiral) … appears after 10 Drakir Arral sunk" | S12 | V-Fuente |
| La mayoría de los NPC normales **no** atacan primero; los almirantes y los de evento sí | "Most of admiral rank npcs are aggressive towards player - that include event npcs too." | S13 | V-Staff |
| Algunos NPC son agresivos solo con jugadores de nivel bajo | "HRMS Surprise is aggressive only towards players below level 26, this is not a bug." | S13 | V-Staff |
| Cada NPC tiene su propio algoritmo de agresión | "many NPCs will use different aggressive algorithms for both events and regular ones" | S13 | V-Staff |
| Algunos jefes reaparecen cada minuto | "spawns every 1 min" (Akkorospawn, Karkinos) | S12 | V-Fuente |

**Lo que extraemos:** necesitamos dos arquetipos legibles: **pasivo** (mercante, botín fácil) y **hostil** (pirata, ataca primero). Más adelante, un **jefe** que aparece tras N hundimientos.

## 9. Botín

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Al destruir un NPC se recibe oro y XP directamente | tablas "Destroy: ~X Gold, ~Y XP" | S12 | V-Fuente |
| En el mapa aparecen cofres que se abren con llave | "they can spawn in every regular PvP map" / "Once the Chest has been opened, the Key will be lost." | S14 | V-Fuente |
| En la carta hay destellos (*glitters*) y naufragios que se recogen | "Glitters: … the Glitter and the Shipwreck" | S15 | V-Fuente |
| Al hundir un NPC queda una caja flotante con oro | — | — | **HIPÓTESIS**: la adoptamos como adaptación propia (GDD §10) |

## 10. Muerte, reaparición y protección

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| 0 HP = barco hundido, que hay que reparar | "When you have 0 Hitpoints your ship is sunk and shall need to be repaired." | S15 | V-Fuente |
| Tras hundirse se pasa por un "nimbus" (pantalla o mapa intermedio) y se sale con HP mínimo | "you can get 1,000 Hitpoints when leaving the nimbus" | S10 | V-Staff |
| La reaparición es en un refugio seguro (Safe Haven) | "came back in the safe haven below Map 10" | S20 | V-Fuente |
| Protección de 1 h tras hundirse (niveles 1–5), que se pierde al atacar | "noobie protection will last for 1 hour after you get sunk if you are level 1 - 5 but if you shoot any monsters or npcs then you loose it" | S18 | V-Fuente |
| La protección impide que otros jugadores te hundan | "while you can not be sunk by a player shooting at you" | S19 | V-Staff |
| La desconexión no es inmediata: hay que pasar 30 s sin moverse, disparar ni recibir disparos | "The default logout time is 30 seconds without moving, shooting or being shot" | S15 | V-Fuente |
| Pérdidas materiales al morir | — | — | **HIPÓTESIS**: no se encontró. El MVP define una penalización propia (GDD §12) |

## 11. Mundo: mapas, regiones, puertos e islas

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Cada nivel del jugador desbloquea una zona nueva del mapa | "Each Level u gonna unlock a new zone in the map, likely your mission is going to be kill npc's and walk in that new zone." (cita literal, revisada el 2026-10-17; antes figuraba como «Each level unlocks a new zone in the map.», que era una paráfrasis) | S21 | V-Fuente |
| 7 regiones por rangos de mapas (Normal 1–5, Tropical 6–10, Hielo 11–15…) | "Found in maps 1 - 5" … | S17 | V-Fuente |
| Hay mapas PvE y PvP, y el aviso de la carta indica cuál es | "This box informs you as to what kind of a Map you are on" | S15 | V-Fuente |
| Zona segura (Safe Haven) de la que se sale con un botón | "Click this bar when you want to leave the Safe Haven" | S15 | V-Fuente |
| Los gremios pueden conquistar islas | "gemeinsam Aufgaben lösen oder eine Insel [erobern]" | S1 | V-Fuente |
| Las islas son obstáculos físicos de navegación | — | — | **HIPÓTESIS** |
| Las tiendas (Traders, Shipyard) son menús, no lugares físicos del mapa | "Home, Cabin, Shipyard, Traders, Market Place, Tavern, Navy" | S4 | V-Fuente. **Adaptación:** en el MVP la tienda se abre solo en el puerto (GDD §11) |

## 12. Minimapa y HUD

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Puntos naranjas = NPC, rojos = jugadores, amarillos = destellos | "orange dots on the Mini Map pointing out the location of NPC's nearby, and red dots for Players nearby" | S16b | V-Staff |
| Al hacer clic en el minimapa se mueve la vista | "The Mini Map allows you to quickly move your screen to a different area of the map." | S16b | V-Staff |
| La carta muestra HP, VP, BP y EP; tiene un botón para centrar el barco, chat, barras de acceso rápido y un aviso del tipo de mapa | "Clicking this icon will place the view of your Ship into the center of your screen." | S15 | V-Fuente |
| La interfaz se puede reconfigurar arrastrando barras | "Start Configuator" | S3 | V-Fuente |
| En los ajustes de gráficos se pueden mostrar los números de daño y los disparos | "High: Adds attacks, damage, hits, damage points, and shots to the display." | S3 | V-Fuente |

**Capturas del cliente (~2011), según el análisis de `game-ux` (S24):** línea fina de vida bajo cada nombre; anillo verde discontinuo en el barco propio y amarillo en el objetivo; números de daño rojos encima del barco; HP y XP abajo al centro; minimapa arriba a la derecha; chat abajo a la derecha. Evidencia: V-Fuente (observación visual, no texto).

**Lo que extraemos:** el HUD de Seafight está muy cargado (menús, chat, eventos). Del minimapa adoptamos el **código por tipo de entidad**, con forma además de color (ver GDD §14), y del HUD los **números de daño**.

## 13. Economía

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Moneda blanda: oro, que se gana jugando y se gasta en casi todo | Paráfrasis del artículo: la mayoría de los objetos se consiguen juntando oro y comprando en el mercado | S1 | V-Fuente |
| Moneda premium: perlas, que se compran con euros o se ganan en tareas | Paráfrasis del artículo: las perlas se compran con euros o se obtienen como recompensa de ciertas tareas | S1 | V-Fuente |
| También hay cristales, coronas y otras monedas | "gold, pearls, crystal" | S4, S21 | V-Fuente |
| Los cañones de oro llegan a 100 000 de oro; las velas de oro cuestan 3 500 | "Gaff Sails: Cost 3,500 Gold" | S5, S23 | V-Fuente |

## 14. Barcos y mejoras

| Afirmación | Cita | Fuente | Evidencia |
|---|---|---|---|
| Hay barcos de distinta potencia: más cañones y vida o más velocidad | "Warship: Has 105 cannons … slower than the Little Buccaneer" | S23 | V-Fuente |
| Los barcos nuevos se desbloquean al subir de nivel o se compran con perlas | "Supremacy … 150k pearls" | S23, S1 | V-Fuente |
| Mejoras por ejes: velocidad (velas, castillos), vida (casco), recarga (habilidades), precisión, daño | "Super Salvo (50/50): -20.7% cannon reload time" / "Hale and Hearty: +150,000 health" | S21 | V-Fuente |

**Lo que extraemos:** 3 ejes de mejora (cañones, casco, velas) y clases de barco que intercambian vida y potencia de fuego por velocidad.

## 15. Implicaciones para el MVP

| Seafight | Sea Battle MVP | Motivo |
|---|---|---|
| Clic para navegar | **Adoptar** | Es el núcleo del control |
| Ataque persistente con tecla + cancelar | **Adoptar** | Una sola entrada genera un combate continuo y no hay tráfico de red durante el combate |
| Ciclar objetivos | **Adoptar** (Tab) | Accesibilidad y velocidad |
| Cañón = precisión, alcance y recarga | **Adoptar** con 3 niveles | Progresión legible |
| 5+ tipos de munición | **Adaptar**: 1 tipo infinito (P0); 1 tipo especial en P2 | Calidad sobre cantidad |
| Reparar bajo fuego rinde menos | **Adoptar** | Decisión táctica |
| Hundido → refugio + protección que se pierde al atacar | **Adoptar** (15 s) | Antiabuso al reaparecer |
| NPC pasivos frente a almirantes agresivos | **Adaptar**: mercante pasivo + pirata hostil; capitán pirata tras 10 hundimientos (I2, en la 1.1.0) | Dos arquetipos claros |
| Oro / perlas | **Solo oro** | No hay monetización en el MVP |
| Monstruos y arpones, abordaje, tripulación, gemas, castillos, gremios | **Descartar** | Fuera del 20 % que produce el 80 % de la experiencia |
| 50 niveles con EP, tests y misiones, más un rango PvP aparte (BP) | **Adaptar en la 1.1**: 20 niveles con una sola XP y 5 insignias (§16, §19) | Era «Descartar» en el slice; Jonattan lo pidió para la 1.1.0 |
| Minimapa por colores | **Adaptar**: color + forma | Accesibilidad para daltónicos |

---

## 16. Experiencia, niveles y rangos (investigación para la 1.1.0)

**Conclusión:** Seafight separa dos progresiones. La **experiencia (EP)** viene del PvE (NPC, mapas de bonificación y misiones) y sube de **nivel**, y el nivel abre mapas. El PvP da otra moneda, los **Battle Points (BP)**, que sube un **rango PvP con insignias**. La curva de EP es muy empinada y cada nivel exige además misiones y un test.

| Afirmación | Cita textual | Fuente | Evidencia |
|---|---|---|---|
| La EP es la experiencia, y sale de hundir NPC, de los mapas de bonificación y de las misiones | "EP is short for Experience Points." / "EP is gained from completing various tasks in Seafight;" / "Destroying NPCs, completing Bonus Maps, and completing Quests to name a few." | S15 | V-Fuente |
| Un NPC hostil da mucha más EP por punto de vida que un mercante: unas 10 veces | Merchant Cutter: "Hitpoints: 200,000." / "~4 Experience Points." · Ruthless Frigate: "Hitpoints: 300,000." / "~60 Experience Points." | S12 | V-Fuente |
| El almirante (jefe) da la misma EP por punto de vida que una fragata: no lleva prima de experiencia | Drakir Klert (Admiral): "Hitpoints: 1,000,000." / "~200 Experience Points." | S12 | V-Fuente (cálculo propio: 200 / 1 000 000 = 60 / 300 000) |
| El nivel abre mapas: el número del mapa es el nivel que pide | "The first number of the map is the level requirement of the map," / "for example to go into map 2 you need to be level 2." | S35 | V-Fuente |
| Subir de nivel exige EP, las misiones del nivel y un test | "87,500,000 Experience Points" / "You need to complete all Quests: Level 22 - 23 before you can attempt this Test." | S30 | V-Fuente |
| La EP de las misiones de un nivel no siempre basta para el siguiente | "Yes, that is possible. That's why some of the Daily Quests are for EP," (Bawdyn, «Commander of the Forum», jugador) | S29 | V-Fuente |
| Ayudar a otros jugadores en combate también da EP | "find some1 whos doing big event ships and heal players around it that will also give you nice amount of EXP" (KRUCHY, jugador) | S31 | V-Fuente |
| El PvP no da EP, sino Battle Points | "Battle Points are gained from sinking your fellow players." | S15 | V-Fuente. Que el PvP no dé EP es **HIPÓTESIS**: ninguna respuesta de S31 lo cita como fuente de EP |
| Los BP suben un rango PvP con recompensas e insignias | "The more you gain the higher your BP Rank, gaining rewards and new badges as you increase the ranks." | S15 | V-Fuente |
| Hay 70 rangos PvP con nombre propio, de 0 a 3 427 500 BP | Tabla: "1 Cannon Fodder 0", "2 Spineless Minnow 1"… "70 Emperor of the Oceans 3427500" | S25 | V-Fuente |
| Los BP dependen de la diferencia de rango: una víctima de rango más alto da más | "The income of battle points depends on the difference between you and your opponents Battle Point Rank." / "the amount of bps received will be higher." (Rymar, Board Administrator, Team Seafight) | S27 | V-Staff |
| Hay un límite por diferencia de rango hacia abajo | "As long as they have a Battle Point rank that is at the minimum 10 Ranks lower than your own, you will receive Battle Points (1-10 Battle Points)." | S25 | V-Fuente. Cómo se aplica es **HIPÓTESIS**: la frase admite dos lecturas |
| Hundir varias veces a la misma víctima rinde menos hasta un reinicio diario | "Battle point reset (when you get again full Battle points for a player) will be each day at 12 noon (local server time)" | S25 | V-Fuente. Cuánto baja no se publica: **HIPÓTESIS** |
| Hundirse no resta BP | Propuesta de un jugador para añadirlo: "When you are sunk, you lose 3 Battlepoints. (No more than that, ever)." / "do not care about being sunk, it honestly does not impact them in the slightest unless they are sunk out of a Raid or alike." | S28 | V-Fuente (indirecta: es una propuesta, no una regla vigente) |
| El rango se lleva **en el barco**, a la izquierda, y a la derecha una insignia que elige el jugador | "Your Pirate Rank sits on the left side of your boat." / "The right side however, a selectable badge which can be changed to show off your biggest achievement" | S26 | V-Fuente |
| La insignia de rango PvP se sustituye al subir | "Each time you progress to the next Battle Point Rank, your old Badge will be replaced" | S26 | V-Fuente |
| Hay protección de novato por nivel y NPC agresivos solo con niveles bajos | Ya citado en §10 (S18) y §8 (S13) | S18, S13 | V-Fuente, V-Staff |

## 17. Variedad de barcos: los «designs» (investigación para la 1.1.0)

**Conclusión:** en Seafight un «diseño» es un tipo de barco con su aspecto y sus estadísticas, y los hay por tramos de nivel. Eso respalda leer «más diseños de barcos» (Jonattan) como **barcos nuevos que se juegan distinto**, no como aspectos. Así queda en GDD Q28 (decidida por producto el 2026-10-17, por delegación de Jonattan).

| Afirmación | Cita textual | Fuente | Evidencia |
|---|---|---|---|
| Hay muchos diseños de barco y el jugador elige | "there are lots of ship designs in the game, choose the one you like the best and use it" (Corsair_Bill, jugador) | S23 | V-Fuente |
| Los diseños se consiguen en el mercado, en eventos, como recompensa o pagando | "Ship Designs can be acquired from the Market, Events, Rewards and Payment." | S32 | V-Fuente |
| Un diseño cambia las estadísticas (gemas incluidas) | "These are gems which can improve the stats of your ship." | S32 | V-Fuente |
| Los diseños van por tramos de nivel | Tabla de diseños élite: "Level 1", "Level 5", "Level 13"… "Level 33" | S32 | V-Fuente |
| Los barcos intercambian potencia de fuego por velocidad | Ya citado en §14: Warship "105 cannons but is slow", Little Buccaneer "quicker but only has 80 cannons" | S23 | V-Fuente |
| Hay NPC de evento, más duros y con más botín | Ya citado en §8 (jefes y almirantes de S12) | S12 | V-Fuente |
| Un «galeón del tesoro» con escolta | — | — | **HIPÓTESIS**: no se encontró en Seafight. Es adaptación propia (GDD §9) |

## 18. Islas, puertos y refugio seguro (investigación para la 1.1.0)

**Conclusión:** el refugio de Seafight (Safe Haven) es un mapa aparte, sin daño, donde se equipa el barco y están los que dan misiones. Las islas grandes (de gremio) son lugares «donde atracar». Las regiones tienen tema visual propio (Normal, Tropical, Hielo, Lava). No se encontró texto sobre muelles ni sobre si las islas bloquean el paso o los disparos.

| Afirmación | Cita textual | Fuente | Evidencia |
|---|---|---|---|
| El refugio es un lugar de calma entre los naufragios | "The Safe Haven is a place of peace and clarity amongst the the destruction and shipwrecks." | S33 | V-Fuente |
| En el refugio no se recibe daño | "This map is a PvE map, meaning that you can not take damage while situated there." | S33 | V-Fuente |
| Allí se equipa el barco y están los que dan misiones | "Containing various features and quest givers, the Safe Haven is a perfect spot to take some time" / "and equip your boat to the best it can be!" | S33 | V-Fuente |
| Se entra con una cuenta atrás de 15 s y no en pleno combate | "A 15 second countdown will begin, after which you will be transferred to the Safe Haven." / "You will not be allowed access to the Safe Haven if you are currently involved in battle." | S33 | V-Fuente |
| En el mapa del mundo, el refugio va en azul claro con «SH» | "Safe Havens are labelled as SH on the World Map and are highlighted with a light blue colour." | S35 | V-Fuente |
| Las islas de gremio son más grandes, se fortifican y sirven para atracar | "Guild Islands are larger than the average island, easily able to fortified and provide a safer spot" / "for your guild members to dock their ships." | S34 | V-Fuente |
| Los tipos de isla cambian de aspecto y de tamaño según la región | "These four types of island differ in visual appearance and size." / "Guild Island (located in the Normal, Tropical, Ice and Lava Regions)" | S34 | V-Fuente |
| Las islas de gremio se conquistan destruyendo sus torres | "Conquering a Guild Island is simple, destroy all the Towers so it is defenceless," | S34 | V-Fuente |
| El refugio tiene muelles o amarres visibles | — | — | **HIPÓTESIS**: ninguna fuente de texto lo describe |
| Las islas bloquean los disparos o la vista | — | — | **HIPÓTESIS**: no se encontró |

## 19. Qué aplica a la 1.1.0 y qué no (razonado desde primeros principios)

| Seafight | Sea Battle 1.1.0 | Por qué (no por autoridad) |
|---|---|---|
| EP del PvE y BP del PvP, dos barras | **Una sola XP**; hundir a un jugador da más que cualquier NPC común (GDD §10b) | Lo pidió Jonattan. Una barra se lee de un vistazo (pilar P2). Con 20 jugadores por sala, un rango PvP aparte quedaría vacío para quien no hace PvP (HIPÓTESIS) |
| EP de un hostil ≈ ×10 la de un mercante por punto de vida | **×2** (hostil `vida/15`, pasivo `vida/30`) | El riesgo se paga, pero el mercante tiene que seguir valiendo para el novato, que con N1 no puede con la Cañonera (GDD §9) |
| El almirante no lleva prima de EP | El Capitán y el Galeón llevan **×2** | Son raros, se reparten por daño en grupo y sin prima darían lo mismo por segundo que un pirata (GDD §10b) |
| BP según la diferencia de rango; más por una víctima superior | **Factor por diferencia de nivel**: hasta ×1,5 hacia arriba y 0 a 4 niveles por debajo | Quita el premio de cazar novatos sin prohibir el PvP, que es libre fuera de la zona segura (GDD Q1) |
| BP completos por víctima una vez al día | **Por pareja**: 100 %, 50 % y 0 % en 30 min | La progresión completa dura 45–70 min (GDD §10): un día no frena el intercambio de hundimientos entre dos amigos dentro de una misma sesión |
| Hundirse no resta BP (indirecto) | **No se pierde XP** al hundirse | Morir ya cuesta el 10 % del oro y ~11 s (GDD §10, §12). Restar XP desanimaría a arriesgar y permitiría pasar XP de una cuenta a otra |
| 50 niveles con misiones y tests, curva exponencial (87,5 M de EP en el 22–23) | **20 niveles** sin misiones ni tests, ~6–7 h hasta el máximo contra NPC | Pareto: el bucle es combatir → botín. Las misiones y los tests son otro sistema |
| El nivel abre mapas | Un solo mapa: el nivel **no** abre zonas; abre los dos barcos nuevos (GDD Q27, decidida por producto) | 20 jugadores en 1 000 × 1 000 m: dividir el mapa por nivel vaciaría cada zona |
| Rango en el barco + insignia elegida | **Insignia del tramo en la placa** del jugador y en su panel | La placa es lo que se lee en combate. Elegir la insignia queda fuera (P3) |
| «Designs» por tramos de nivel, con estadísticas | **2 clases nuevas del jugador** (Goleta y Navío de línea) y **1 NPC nuevo** (Galeón del tesoro, P2), además del Capitán y la Cañonera de I2 | Variedad de decisiones (velocidad frente a potencia) y de presas, no solo de aspecto |
| Refugio en otro mapa, con cuenta atrás de 15 s | **Puerto en el centro del mismo mapa**, sin cuenta atrás, con amarres donde se aparece | Un solo mapa. La cuenta atrás de Seafight evita entrar huyendo del combate; aquí no hace falta, porque desde la zona segura no se ataca a jugadores (`src/game/world.ts:151`) y los piratas no entran a < 130 m (GDD §9) |
| Regiones con tema visual (Normal, Tropical, Hielo, Lava) | **5 arquetipos de isla** que dicen dónde estás y cuánto riesgo hay (GDD §4) | Orientación sin leer texto (pilar P2) |
| Islas de gremio con torres | **Fuera** | Los gremios son P3 (GDD §3) |
| Islas que bloquean disparos (HIPÓTESIS) | **No**: las islas solo cortan el paso | Con la cámara cenital oblicua, una línea de tiro tapada se lee mal, y cambiaría la IA y el balance de duelos (GDD §9) |

## Fuentes

| Id | URL |
|---|---|
| S1 | https://de.wikipedia.org/wiki/Seafight |
| S2 | https://www.seafight.com/ |
| S3 | https://board-en.seafight.com/threads/options-overview.1858/ |
| S4 | https://www.mmommorpg.com/browser-games/sea-fight/ |
| S5 | https://board-en.seafight.com/threads/cannons.1822/ |
| S6 | https://board-en.seafight.com/threads/ammunition.9856/ |
| S7 | https://board-en.seafight.com/threads/harpoons.172246/ |
| S8 | https://board-en.seafight.com/threads/max-repair-duration-and-repair-value.173998/ |
| S9 | https://board-en.seafight.com/threads/repairing-while-being-shot.174075/ |
| S10 | https://board-en.seafight.com/threads/ship-destroyed.175657/ |
| S11 | https://board-en.seafight.com/threads/unable-to-repair.42137/ |
| S12 | https://board-en.seafight.com/threads/npcs.1823/ |
| S13 | https://board-en.seafight.com/threads/immunity-from-aggressive-ncp.182458/ |
| S14 | https://board-en.seafight.com/threads/chests-chest-loot-table.1974/ |
| S15 | https://board-en.seafight.com/threads/sea-chart-overview.172255/ |
| S16 | https://board-en.seafight.com/threads/new-mini-map.172057/ |
| S16b | https://board-en.seafight.com/threads/mini-map.171655/ |
| S17 | https://board-en.seafight.com/threads/map-regions.172403/ |
| S18 | https://board-en.seafight.com/threads/protection.56569/ |
| S19 | https://board-en.seafight.com/threads/pirate-protection.179556/ |
| S20 | https://board-en.seafight.com/threads/i-got-sunk-and-i-ended-up-in-safe-haven.183984/ |
| S21 | https://board-en.seafight.com/threads/complete-guide-for-new-players-2024-last-update-15-01-2024.184248/ |
| S22 | https://board-en.seafight.com/threads/ship-speed.169771/ |
| S23 | https://board-en.seafight.com/threads/ships.169962/ |
| S24 | https://www.jeux-mmorpg.com/seafight.html (reseña con 6 capturas; análisis visual de `game-ux`, 2026-10-10) |
| S25 | https://board-en.seafight.com/threads/battle-points.5/ (consultada el 2026-10-17) |
| S26 | https://board-en.seafight.com/threads/badges.173164/ (2026-10-17) |
| S27 | https://board-en.seafight.com/threads/i-find-this-very-hard-to-believe.182612/ (2026-10-17) |
| S28 | https://board-en.seafight.com/threads/minus-battle-points.179619/ (2026-10-17) |
| S29 | https://board-en.seafight.com/threads/experience-points.175570/ (2026-10-17) |
| S30 | https://board-en.seafight.com/threads/test-22-23.164549/ (2026-10-17) |
| S31 | https://board-en.seafight.com/threads/how-to-farm-experience-ep.175949/ (2026-10-17) |
| S32 | https://board-en.seafight.com/threads/designs.171633/ (2026-10-17; leída la primera parte, 100 000 de 287 333 caracteres) |
| S33 | https://board-en.seafight.com/threads/safe-haven.171667/ (2026-10-17) |
| S34 | https://board-en.seafight.com/threads/guild-islands.172089/ (2026-10-17) |
| S35 | https://board-en.seafight.com/threads/world-map.171887/ (2026-10-17) |

**No legibles el 2026-10-17:** el wiki de Fandom (`seafight.fandom.com`, HTTP 402) y GameFAQs (HTTP 403). Lo que solo aparecía en ellas no se cita.
