# Hoja de ruta

Última actualización: 15 de noviembre de 2026.

La versión que se juega hoy es la **1.2.0**. Trae un mapa nuevo, con 8 islas, 4 calas piratas, un paso entre escollos y un puerto con forma de isla. Además, el Capitán pirata y las cañoneras pasan a ser parte fija del juego. El detalle está en el [CHANGELOG](CHANGELOG.md).

Esta hoja dice en qué se trabaja y en qué orden. No lleva fechas: cada mejora sale cuando está probada.

## Ahora

- **Una pantalla de niveles** para ver los 20 niveles, las 5 insignias y lo que te falta para el siguiente.
- **Quitar un pequeño tirón de la imagen** al entrar al juego y al cambiar de barco. Dura menos de una décima de segundo, pero se nota.
- **Poner al día la portada.** La página de entrada todavía enseña las islas de antes, y pasará a enseñar las del mapa nuevo.
- **Confirmar con una revisión independiente que los escollos y el puerto se reconocen de un vistazo.**

## Próximo

- **Jugar sin tarjeta gráfica.** Si tu navegador dibuja el juego sin la tarjeta gráfica, el mapa nuevo va muy lento: unas 4 imágenes por segundo. Primero contaremos cuántos jugadores entran así, y el juego les dirá cómo activarla. Si son bastantes, haremos que vaya al menos a 10 imágenes por segundo.
- **Probar el servidor lleno**, con muchos jugadores a la vez, en el servidor de pruebas y no solo en un ordenador.
- **Más comprobaciones automáticas,** para que no se rompa sin que nadie lo vea:
  - que subir de nivel siga llevando el tiempo previsto;
  - que el barco choque justo donde se ve la costa de cada isla;
  - que las islas se distingan también en blanco y negro.

## Después

- **Pequeños retoques en las islas:** 4 rocas que sobresalen hacia el agua unos centímetros más de la cuenta, y corregir la descripción del islote del puerto en la documentación del diseño.
- **Pruebas automáticas más estables,** que no fallen solo porque el ordenador que las corre va lento.
