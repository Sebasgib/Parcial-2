const canvas = document.getElementById('game');
const context = canvas.getContext('2d');
const menu = document.getElementById('menu');
const gameContainer = document.getElementById('game-container');
const difficultySection = document.getElementById('difficulty-section');

const grid = 15;
const paddleHeight = grid * 5; // 75
const maxPaddleY = canvas.height - grid - paddleHeight;

const paddleSpeed = 7.5;
const ballBaseSpeed = 6.5;
const ballMaxSpeed = 15;
const ballMaxSpeedPotente = 24;
const ballSpeedIncrement = 0.5;
const MATCH_DURATION = 30000; // duración del partido: 30 segundos
const SCORE_FLASH_DURATION = 700; // aviso breve al anotar, sin pausar el juego

// Golpear la pelota cerca del borde de la paleta produce un disparo potente
const UMBRAL_DISPARO_POTENTE = 0.7; // 0 = centro de la pala, 1 = borde
const MULTIPLICADOR_DISPARO_POTENTE = 1.5;
const COLOR_DISPARO_POTENTE = '#ff2200';

// --- Escenarios: cada uno define su propia paleta de colores ---
const ESCENARIOS = {
  clasico: {
    nombre: 'Clásico',
    fondo: '#000000',
    pared: '#cfd8dc',
    pala: '#ffffff',
    bolas: ['#ffffff', '#ff4d4d', '#ffa64d', '#ffff4d', '#4dff4d', '#4dd2ff', '#ff4dff'],
    estrellas: false
  },
  neon: {
    nombre: 'Neón',
    fondo: '#1a0033',
    pared: '#ff66ff',
    pala: '#00eaff',
    bolas: ['#ff00ff', '#00eaff', '#ffe600', '#ff3366', '#39ff14'],
    estrellas: false
  },
  espacial: {
    nombre: 'Espacial',
    fondo: '#01020a',
    pared: '#7f8c9a',
    pala: '#e8eef5',
    bolas: ['#ffffff', '#ffd27f', '#7fd4ff', '#ff7f7f'],
    estrellas: true
  },
  retro: {
    nombre: 'Retro',
    fondo: '#001a00',
    pared: '#33ff33',
    pala: '#33ff33',
    bolas: ['#33ff33'],
    estrellas: false
  }
};

// --- Dificultades de la CPU ---
// probabilidadError: chance de que la CPU tenga un fallo en un punto (nunca dos veces seguidas)
const DIFICULTADES = {
  facil: { etiqueta: 'Fácil', velocidad: paddleSpeed * 0.5, reaccion: 600, error: 50, probabilidadError: 0.4 },
  normal: { etiqueta: 'Normal', velocidad: paddleSpeed * 0.85, reaccion: 300, error: 25, probabilidadError: 0.22 },
  dificil: { etiqueta: 'Difícil', velocidad: paddleSpeed * 1.15, reaccion: 120, error: 10, probabilidadError: 0.1 },
  imposible: { etiqueta: 'Imposible', velocidad: 999, reaccion: 0, error: 0, probabilidadError: 0 }
};

let modo = 'pvp'; // 'pvp' | 'cpu'
let dificultad = 'normal';
let escenarioKey = 'clasico';
let currentEscenario = ESCENARIOS.clasico;
let estrellas = [];
let running = false;

let colorBolaIndex = 0;

const STATE = { PLAYING: 'playing', GAMEOVER: 'gameover' };
let state = STATE.PLAYING;
let lastScorer = null; // 'izquierda' | 'derecha'
let winner = null;
let scoreFlashUntil = 0;

let leftScore = 0;
let rightScore = 0;

// --- Datos para el historial y los récords ---
let nombreIzq = 'Jugador 1';
let nombreDer = 'Jugador 2';
let rallyActual = 0;       // golpes de pala seguidos desde el último punto
let rallyMax = 0;          // mejor intercambio del partido
let potentesPartido = 0;   // disparos potentes realizados en el partido
let resultadoGuardado = null; // lo que devolvió Historial.registrarPartido al terminar

let matchStartTime = 0;
let timeRemaining = MATCH_DURATION;

let cpuTarget = canvas.height / 2;
let cpuLastUpdate = 0;
let cpuRallyConError = false; // este punto la CPU va a fallar a propósito
let cpuUltimoPuntoConError = false; // evita que el fallo ocurra en puntos seguidos

const leftPaddle = {
  x: grid * 2,
  y: canvas.height / 2 - paddleHeight / 2,
  width: grid,
  height: paddleHeight,
  dy: 0
};

const rightPaddle = {
  x: canvas.width - grid * 3,
  y: canvas.height / 2 - paddleHeight / 2,
  width: grid,
  height: paddleHeight,
  dy: 0
};

const ball = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  width: grid,
  height: grid,
  dx: ballBaseSpeed,
  dy: -ballBaseSpeed,
  speed: ballBaseSpeed,
  potente: false
};

// --- Sonido (beeps simples generados con Web Audio API) ---
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
}
function playTone(freq, duration, type = 'square', volume = 0.1) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.value = volume;
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.start();
  gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
  osc.stop(audioCtx.currentTime + duration);
}

function collides(obj1, obj2) {
  return obj1.x < obj2.x + obj2.width &&
         obj1.x + obj1.width > obj2.x &&
         obj1.y < obj2.y + obj2.height &&
         obj1.y + obj1.height > obj2.y;
}

function cambiarColorBola() {
  colorBolaIndex = (colorBolaIndex + 1) % currentEscenario.bolas.length;
}

function generarEstrellas() {
  const arr = [];
  for (let i = 0; i < 100; i++) {
    arr.push({
      x: Math.random() * canvas.width,
      y: Math.random() * canvas.height,
      size: Math.random() < 0.8 ? 1 : 2
    });
  }
  return arr;
}

function resetBall(direction) {
  ball.x = canvas.width / 2;
  ball.y = canvas.height / 2;
  ball.speed = ballBaseSpeed;
  ball.dx = ballBaseSpeed * direction;
  ball.dy = ballBaseSpeed * (Math.random() > 0.5 ? 1 : -1);
  ball.potente = false;
}

// Decide si la CPU va a fallar a propósito en el punto que empieza ahora.
// Nunca ocurre en dos puntos consecutivos.
function decidirErrorCPU() {
  if (modo !== 'cpu') {
    cpuRallyConError = false;
    return;
  }
  const preset = DIFICULTADES[dificultad];
  cpuRallyConError = !cpuUltimoPuntoConError && Math.random() < preset.probabilidadError;
}

// Saca la pelota en una dirección y decide si este punto tendrá un error de la CPU
function serve(direction) {
  resetBall(direction);
  decidirErrorCPU();
}

// Sirve la pelota hacia el lado que acaba de recibir el punto
function serveAfterScore(scorerSide) {
  serve(scorerSide === 'izquierda' ? 1 : -1);
}

function handleScore(side) {
  if (side === 'izquierda') leftScore++; else rightScore++;
  lastScorer = side;
  rallyActual = 0;
  cambiarColorBola();
  scoreFlashUntil = performance.now() + SCORE_FLASH_DURATION;
  playTone(160, 0.35, 'sawtooth', 0.15);

  if (modo === 'cpu') {
    // ¿este punto lo perdió la CPU por el error que le programamos?
    cpuUltimoPuntoConError = side === 'izquierda' && cpuRallyConError;
  }

  serveAfterScore(side); // sin espera: saca de inmediato
}

// Termina el partido cuando se acaba el tiempo; gana quien tenga más puntos
function endMatch() {
  if (leftScore > rightScore) winner = 'Izquierda';
  else if (rightScore > leftScore) winner = 'Derecha';
  else winner = 'Empate';

  state = STATE.GAMEOVER;

  // Guarda el partido (JSON en localStorage) y recibe los logros: puesto en el Top 10
  resultadoGuardado = Historial.registrarPartido({
    modo,
    dificultad: modo === 'cpu' ? dificultad : null,
    escenario: escenarioKey,
    nombreIzq,
    nombreDer,
    puntosIzq: leftScore,
    puntosDer: rightScore,
    duracion: Math.round(MATCH_DURATION / 1000),
    rallyMax,
    disparosPotentes: potentesPartido
  });
  HistorialUI.actualizarMejor();

  playTone(523, 0.15);
  setTimeout(() => playTone(659, 0.15), 150);
  setTimeout(() => playTone(784, 0.25), 300);
}

function resetGame() {
  leftScore = 0;
  rightScore = 0;
  winner = null;
  lastScorer = null;
  rallyActual = 0;
  rallyMax = 0;
  potentesPartido = 0;
  resultadoGuardado = null;
  colorBolaIndex = 0;
  cpuTarget = canvas.height / 2;
  cpuLastUpdate = 0;
  cpuUltimoPuntoConError = false;
  matchStartTime = performance.now();
  timeRemaining = MATCH_DURATION;
  serve(Math.random() > 0.5 ? 1 : -1);
  state = STATE.PLAYING;
}

function clampPaddle(p) {
  if (p.y < grid) p.y = grid;
  else if (p.y > maxPaddleY) p.y = maxPaddleY;
}

function updateCPU(now) {
  const preset = DIFICULTADES[dificultad];

  if (now - cpuLastUpdate >= preset.reaccion) {
    cpuLastUpdate = now;
    // si este punto tiene un error programado, la CPU calcula muy mal dónde va la pelota
    const margenError = cpuRallyConError ? preset.error + 150 : preset.error;
    const error = (Math.random() * 2 - 1) * margenError;
    cpuTarget = ball.y + ball.height / 2 + error;
  }

  // durante un error también se mueve más lento, para que el fallo sea creíble
  const velocidadEfectiva = cpuRallyConError ? preset.velocidad * 0.55 : preset.velocidad;
  const paddleCenter = rightPaddle.y + rightPaddle.height / 2;
  const diff = cpuTarget - paddleCenter;

  if (Math.abs(diff) < 2) {
    rightPaddle.dy = 0;
  } else {
    rightPaddle.dy = Math.sign(diff) * Math.min(Math.abs(diff), velocidadEfectiva);
  }
}

function updatePaddles(now) {
  leftPaddle.y += leftPaddle.dy;

  if (modo === 'cpu') {
    updateCPU(now);
  }
  rightPaddle.y += rightPaddle.dy;

  clampPaddle(leftPaddle);
  clampPaddle(rightPaddle);
}

function updateBallAndCollisions() {
  ball.x += ball.dx;
  ball.y += ball.dy;

  // rebote en paredes superior e inferior, con un pequeño toque aleatorio
  if (ball.y < grid) {
    ball.y = grid;
    ball.dy = -ball.dy + (Math.random() * 2 - 1) * 0.5;
  } else if (ball.y + grid > canvas.height - grid) {
    ball.y = canvas.height - grid * 2;
    ball.dy = -ball.dy + (Math.random() * 2 - 1) * 0.5;
  }

  // punto anotado
  if (ball.x < 0) {
    handleScore('derecha');
    return;
  } else if (ball.x > canvas.width) {
    handleScore('izquierda');
    return;
  }

  let hit = null;
  if (collides(ball, leftPaddle)) hit = leftPaddle;
  else if (collides(ball, rightPaddle)) hit = rightPaddle;

  if (hit) {
    // el ángulo de rebote depende de en qué punto de la pala golpea la pelota
    const relativeIntersect = ((ball.y + ball.height / 2) - (hit.y + hit.height / 2)) / (hit.height / 2);
    const direction = hit === leftPaddle ? 1 : -1;
    const esDisparoPotente = Math.abs(relativeIntersect) > UMBRAL_DISPARO_POTENTE;

    ball.speed = Math.min(ball.speed + ballSpeedIncrement, ballMaxSpeed);
    rallyActual++;
    if (rallyActual > rallyMax) rallyMax = rallyActual;

    if (esDisparoPotente) {
      potentesPartido++;
      // golpear la pelota cerca del borde de la pala genera un disparo potente
      ball.speed = Math.min(ball.speed * MULTIPLICADOR_DISPARO_POTENTE, ballMaxSpeedPotente);
      ball.potente = true;
      playTone(880, 0.12, 'sawtooth', 0.18);
    } else {
      ball.potente = false;
      playTone(hit === leftPaddle ? 220 : 277, 0.08, 'square', 0.12);
    }

    ball.dx = direction * ball.speed;
    ball.dy = relativeIntersect * ball.speed + (Math.random() * 2 - 1) * 0.5;
    ball.x = hit === leftPaddle ? hit.x + hit.width : hit.x - ball.width;
  }
}

function drawBackground() {
  context.fillStyle = currentEscenario.fondo;
  context.fillRect(0, 0, canvas.width, canvas.height);
}

function drawStars() {
  if (!currentEscenario.estrellas) return;
  context.fillStyle = '#ffffff';
  estrellas.forEach(s => context.fillRect(s.x, s.y, s.size, s.size));
}

function drawWalls() {
  context.fillStyle = currentEscenario.pared;
  context.fillRect(0, 0, canvas.width, grid);
  context.fillRect(0, canvas.height - grid, canvas.width, grid);
}

function drawCenterLine() {
  context.fillStyle = currentEscenario.pared;
  context.globalAlpha = 0.4;
  for (let i = grid; i < canvas.height - grid; i += grid * 2) {
    context.fillRect(canvas.width / 2 - grid / 2, i, grid, grid);
  }
  context.globalAlpha = 1;
}

function drawPaddles() {
  context.fillStyle = currentEscenario.pala;
  context.fillRect(leftPaddle.x, leftPaddle.y, leftPaddle.width, leftPaddle.height);
  context.fillRect(rightPaddle.x, rightPaddle.y, rightPaddle.width, rightPaddle.height);
}

function drawBall() {
  const paleta = currentEscenario.bolas;
  context.fillStyle = ball.potente ? COLOR_DISPARO_POTENTE : paleta[colorBolaIndex % paleta.length];
  context.fillRect(ball.x, ball.y, ball.width, ball.height);
}

function drawScores() {
  context.fillStyle = '#ffffff';
  context.globalAlpha = 0.85;
  context.font = 'bold 48px monospace';
  context.textAlign = 'center';
  context.fillText(leftScore, canvas.width / 2 - 60, 60);
  context.fillText(rightScore, canvas.width / 2 + 60, 60);
  context.font = '14px monospace';
  context.globalAlpha = 0.6;
  context.fillText(nombreIzq, canvas.width / 2 - 60, 82);
  context.fillText(nombreDer, canvas.width / 2 + 60, 82);
  context.globalAlpha = 1;
}

function drawFooter() {
  const rightLabel = modo === 'cpu' ? 'CPU (' + DIFICULTADES[dificultad].etiqueta + ')' : nombreDer + ' (↑/↓)';
  context.fillStyle = '#ffffff';
  context.globalAlpha = 0.45;
  context.font = '14px monospace';
  context.textAlign = 'center';
  context.fillText(nombreIzq + ' (W/S)   vs   ' + rightLabel + '   |   ESC: Menú   |   Partido de 30 segundos', canvas.width / 2, canvas.height - 20);
  context.globalAlpha = 1;
}

function drawTimer() {
  const segundos = Math.ceil(timeRemaining / 1000);
  context.fillStyle = segundos <= 5 ? '#ff4d4d' : '#ffffff';
  context.globalAlpha = 0.85;
  context.font = 'bold 22px monospace';
  context.textAlign = 'center';
  context.fillText(segundos + 's', canvas.width / 2, 30);
  context.globalAlpha = 1;
}

function capitalize(s) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function drawScoreFlash() {
  if (performance.now() > scoreFlashUntil || !lastScorer) return;
  context.fillStyle = '#ffffff';
  context.globalAlpha = 0.8;
  context.font = 'bold 20px monospace';
  context.textAlign = 'center';
  context.fillText('¡Punto para ' + (lastScorer === 'izquierda' ? nombreIzq : nombreDer) + '!', canvas.width / 2, 108);
  context.globalAlpha = 1;
}

function drawOverlayMessage(lines, extra) {
  context.fillStyle = 'rgba(0, 0, 0, 0.6)';
  context.fillRect(0, canvas.height / 2 - 70, canvas.width, extra ? 150 : 120);
  context.fillStyle = '#ffffff';
  context.textAlign = 'center';
  context.font = 'bold 28px monospace';
  context.fillText(lines[0], canvas.width / 2, canvas.height / 2 - 18);
  if (lines[1]) {
    context.font = '18px monospace';
    context.fillText(lines[1], canvas.width / 2, canvas.height / 2 + 14);
  }
  if (extra) {
    context.fillStyle = extra.color;
    context.font = 'bold 20px monospace';
    context.fillText(extra.texto, canvas.width / 2, canvas.height / 2 + 52);
  }
}

// Mensaje de logro al terminar: récord absoluto, entrada al Top 10 o aviso si no se pudo guardar
function mensajeLogro() {
  if (!resultadoGuardado) return null;
  if (!resultadoGuardado.guardado) return { texto: 'No se pudo guardar el partido en este navegador', color: '#ff6b6b' };
  const mejor = resultadoGuardado.logros.slice().sort((a, b) => a.puesto - b.puesto)[0];
  if (!mejor) return null;
  const cat = Historial.CATEGORIAS[mejor.categoria];
  if (mejor.esRecord) return { texto: '★ ¡NUEVO RÉCORD! ' + mejor.nombre + ': ' + mejor.puntos + ' pts (' + cat + ') ★', color: '#f1c40f' };
  return { texto: 'Top ' + Historial.TOP + ': puesto ' + mejor.puesto + ' en ' + cat + ' (' + mejor.puntos + ' pts)', color: '#2ecc71' };
}

// bucle del juego
function loop(now) {
  requestAnimationFrame(loop);
  if (!running) return;

  drawBackground();
  drawStars();

  if (state === STATE.PLAYING) {
    updatePaddles(now);
    updateBallAndCollisions();

    timeRemaining = Math.max(0, MATCH_DURATION - (now - matchStartTime));
    if (timeRemaining <= 0) {
      endMatch();
    }
  }

  drawWalls();
  drawCenterLine();
  drawPaddles();

  if (state === STATE.PLAYING) {
    drawBall();
  }

  drawScores();
  drawTimer();
  drawFooter();
  drawScoreFlash();

  if (state === STATE.GAMEOVER) {
    const nombreGanador = winner === 'Izquierda' ? nombreIzq : nombreDer;
    const tituloFinal = winner === 'Empate' ? '¡Empate!' : 'Gana ' + nombreGanador;
    drawOverlayMessage([
      tituloFinal,
      'Marcador final: ' + leftScore + ' - ' + rightScore + '   |   ENTER: Reiniciar   |   ESC: Menú'
    ], mensajeLogro());
  }
}

// --- Menú ---
function seleccionarOpcion(selectorGrupo, boton) {
  document.querySelectorAll(selectorGrupo).forEach(b => b.classList.remove('selected'));
  boton.classList.add('selected');
}

// --- Nombres de los jugadores (se recuerdan en el historial) ---
const nameP1 = document.getElementById('name-p1');
const nameP2 = document.getElementById('name-p2');

function sincronizarNombres() {
  // En modo CPU el lado derecho es la CPU: su campo no se puede editar
  nameP2.disabled = modo === 'cpu';
  nameP2.placeholder = modo === 'cpu' ? 'CPU' : 'Jugador 2';
}

(function cargarNombres() {
  const guardados = Historial.nombres();
  nameP1.value = guardados.j1;
  nameP2.value = guardados.j2;
  sincronizarNombres();
})();

document.querySelectorAll('[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => {
    modo = btn.dataset.mode;
    seleccionarOpcion('[data-mode]', btn);
    difficultySection.classList.toggle('disabled', modo !== 'cpu');
    sincronizarNombres();
  });
});

document.querySelectorAll('[data-difficulty]').forEach(btn => {
  btn.addEventListener('click', () => {
    if (modo !== 'cpu') return;
    dificultad = btn.dataset.difficulty;
    seleccionarOpcion('[data-difficulty]', btn);
  });
});

document.querySelectorAll('[data-scenario]').forEach(btn => {
  btn.addEventListener('click', () => {
    escenarioKey = btn.dataset.scenario;
    seleccionarOpcion('[data-scenario]', btn);
  });
});

function startGame() {
  // Los nombres vacíos vuelven a su valor por defecto; se guardan para la próxima vez
  Historial.guardarNombres(nameP1.value, nameP2.value);
  const nombres = Historial.nombres();
  nombreIzq = nombres.j1;
  nombreDer = modo === 'cpu' ? 'CPU' : nombres.j2;
  nameP1.value = nombres.j1;
  nameP2.value = nombres.j2;

  currentEscenario = ESCENARIOS[escenarioKey];
  estrellas = currentEscenario.estrellas ? generarEstrellas() : [];
  menu.style.display = 'none';
  gameContainer.style.display = 'flex';
  resetGame();
  running = true;
}

function backToMenu() {
  running = false;
  gameContainer.style.display = 'none';
  menu.style.display = 'flex';
}

document.getElementById('start-btn').addEventListener('click', startGame);

// Escuchar los eventos del teclado para mover las paletas
document.addEventListener('keydown', function (e) {
  ensureAudio();

  if (e.which === 27) { // ESC cierra el panel de historial si está abierto; si no, vuelve al menú
    if (HistorialUI.estaAbierto()) HistorialUI.cerrar();
    else backToMenu();
    return;
  }

  // Escribiendo un nombre (o con el panel abierto) las teclas no mueven las palas
  if (HistorialUI.estaAbierto() || (e.target && e.target.tagName === 'INPUT')) return;

  if (!running) return;

  if (state === STATE.GAMEOVER) {
    if (e.which === 13) resetGame(); // ENTER reinicia
    return;
  }

  // jugador izquierdo: W / S
  if (e.which === 87) {
    leftPaddle.dy = -paddleSpeed;
  } else if (e.which === 83) {
    leftPaddle.dy = paddleSpeed;
  }

  // jugador derecho: flechas (solo en modo 2 jugadores)
  if (modo === 'pvp') {
    if (e.which === 38) {
      rightPaddle.dy = -paddleSpeed;
    } else if (e.which === 40) {
      rightPaddle.dy = paddleSpeed;
    }
  }
});

document.addEventListener('keyup', function (e) {
  if (e.which === 83 || e.which === 87) {
    leftPaddle.dy = 0;
  }
  if (modo === 'pvp' && (e.which === 38 || e.which === 40)) {
    rightPaddle.dy = 0;
  }
});

// Iniciar el bucle de animación (no hace nada hasta presionar "Jugar")
requestAnimationFrame(loop);
