# Barras Bravas FPS

FPS 3D en el navegador (Three.js, sin instalación). Abre `index.html` con Chrome o Edge y haz clic en **¡A LA TRIBUNA!**.

## Controles
WASD mover · Mouse apuntar · Clic izq. atacar · 1-6 o rueda cambian de arma · Q arma anterior · Espacio saltar · Shift correr · M sonido · Esc pausa

## Armas
Bate · Cadena · Botellas · Bengalas (dejan fuego) · Papa bomba (explosiva) · Resortera

## Escenarios
- **Tribuna Popular** (dentro del estadio): gradas, reja a la cancha, túneles por donde entran los rivales y, más tarde, la policía.
- **Afueras del Estadio**: calle con bus incendiado, vallas, llantas quemadas, boleterías y camionetas de la policía.

## Enemigos
Barristas rivales (barrista, lanzador de botellas, bengalero y el capo) con cortes y camisas de su equipo, y policía antimotines (policía, escudo, gasero con gas lacrimógeno). Policía y rivales también se pelean entre sí.

## Estructura
- `js/data.js` equipos, armas, enemigos y oleadas (aquí se ajusta el balance)
- `js/characters.js` personajes y armas low-poly
- `js/levels.js` escenarios
- `js/game.js` lógica, IA, proyectiles y HUD
- `index.html` incluye los estilos (`<style>`) y el menú ya escrito para que la página cargue rápido y sin saltos; si cambias `TEAMS` o `LEVELS` en `js/data.js`, actualiza también los botones del menú.
