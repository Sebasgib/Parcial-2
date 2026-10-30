'use strict';
/* ==========================================================================
   GOLAZO · Fútbol de discos — script.js
   --------------------------------------------------------------------------
   1.  Utilidades
   2.  Base de datos: equipos y jugadores reales (nombres y colores)
   3.  Configuración: física, estadios (modos), poderes y dificultad
   4.  Audio procedural (WebAudio, sin archivos externos)
   5.  Entrada: teclado (1 o 2 jugadores) y controles táctiles
   6.  Estados de la aplicación y pantallas (Menú → Modo → Equipos → Juego → Fin)
   7.  Creación del partido y saques
   8.  Game loop y física de discos
   9.  Goles, tiempo y fases del partido
   10. Inteligencia artificial
   11. Render
   12. HUD, pausa y pantalla final
   13. Arranque
   ========================================================================== */


/* ==========================================================================
   1. UTILIDADES
   ========================================================================== */
const TAU = Math.PI * 2;
const ZERO = Object.freeze({ x: 0, y: 0 });
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const $ = (s) => document.querySelector(s);
const $$ = (s) => Array.from(document.querySelectorAll(s));

function norm(x, y) {
  const l = Math.hypot(x, y) || 1;
  return { x: x / l, y: y / l };
}
/** Diferencia angular normalizada en (-π, π]. */
function angleDiff(a, b) {
  let d = (b - a) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return d;
}
function lerpAngle(a, b, t) { return a + angleDiff(a, b) * t; }
/** Distancia de un punto p al segmento a-b (para detectar líneas de pase cortadas). */
function distPointSegment(p, a, b) {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy || 1;
  const t = clamp(((p.x - a.x) * dx + (p.y - a.y) * dy) / l2, 0, 1);
  return Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
}
function hexToRgb(h) {
  const n = parseInt(h.slice(1), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}
function colorDist(a, b) {
  const x = hexToRgb(a), y = hexToRgb(b);
  return Math.hypot(x.r - y.r, x.g - y.g, x.b - y.b);
}
function surname(name) {
  const parts = name.split(' ');
  return parts.length > 1 ? parts.slice(1).join(' ') : name;
}
function makeEl(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}


/* ==========================================================================
   2. BASE DE DATOS: EQUIPOS Y JUGADORES
   --------------------------------------------------------------------------
   Atributos (0-99): vel = Velocidad, tir = Tiro, pas = Pase,
   def = Defensa (en porteros se usa como "Paradas").
   Los 11 primeros de cada plantilla forman el once titular por defecto.
   ========================================================================== */
function P(name, num, pos, vel, tir, pas, def, short) {
  return { name, num, pos, vel, tir, pas, def, short: short || surname(name) };
}

const TEAMS = [
  {
    id: 'rma', name: 'Real Madrid', short: 'RMA', formation: '4-3-3',
    kit: { primary: '#f4f4f4', secondary: '#c9a227', text: '#1b1b1b' },
    kit2: { primary: '#24305e', secondary: '#c9a227', text: '#ffffff' },
    gk: '#39d353',
    players: [
      P('Thibaut Courtois', 1, 'POR', 48, 20, 62, 90),
      P('Dani Carvajal', 2, 'DEF', 78, 58, 78, 84),
      P('Éder Militão', 3, 'DEF', 80, 50, 68, 85),
      P('Antonio Rüdiger', 22, 'DEF', 82, 52, 70, 87),
      P('Ferland Mendy', 23, 'DEF', 86, 45, 72, 82),
      P('Aurélien Tchouaméni', 14, 'MED', 74, 68, 80, 82),
      P('Federico Valverde', 8, 'MED', 88, 82, 84, 78),
      P('Jude Bellingham', 5, 'MED', 80, 86, 85, 74),
      P('Rodrygo', 11, 'DEL', 89, 82, 80, 40),
      P('Vinícius Júnior', 7, 'DEL', 95, 84, 81, 30, 'Vini Jr.'),
      P('Kylian Mbappé', 9, 'DEL', 97, 90, 80, 36),
      P('Andriy Lunin', 13, 'POR', 50, 15, 58, 80),
      P('David Alaba', 4, 'DEF', 74, 72, 82, 83),
      P('Eduardo Camavinga', 6, 'MED', 82, 68, 82, 80),
      P('Luka Modrić', 10, 'MED', 70, 78, 90, 70),
      P('Arda Güler', 15, 'MED', 78, 82, 86, 50),
      P('Endrick', 16, 'DEL', 88, 82, 68, 32),
    ],
  },
  {
    id: 'fcb', name: 'FC Barcelona', short: 'FCB', formation: '4-3-3',
    kit: { primary: '#a50044', secondary: '#004d98', text: '#ffffff', pattern: 'stripes' },
    kit2: { primary: '#f6c945', secondary: '#a50044', text: '#2b0a16' },
    gk: '#ff9f1c',
    players: [
      P('Marc-André ter Stegen', 1, 'POR', 50, 18, 80, 88),
      P('Jules Koundé', 23, 'DEF', 84, 55, 74, 85),
      P('Pau Cubarsí', 2, 'DEF', 70, 40, 78, 82),
      P('Ronald Araujo', 4, 'DEF', 82, 50, 64, 86),
      P('Alejandro Balde', 3, 'DEF', 91, 55, 74, 76),
      P('Frenkie de Jong', 21, 'MED', 80, 70, 87, 77, 'De Jong'),
      P('Pedri', 8, 'MED', 76, 74, 90, 70),
      P('Gavi', 6, 'MED', 80, 70, 82, 74),
      P('Lamine Yamal', 19, 'DEL', 90, 82, 86, 35),
      P('Raphinha', 11, 'DEL', 90, 84, 82, 45),
      P('Robert Lewandowski', 9, 'DEL', 76, 91, 79, 40),
      P('Iñaki Peña', 13, 'POR', 48, 15, 60, 78),
      P('Íñigo Martínez', 5, 'DEF', 62, 60, 80, 82),
      P('Dani Olmo', 20, 'MED', 80, 82, 85, 52),
      P('Fermín López', 16, 'MED', 80, 78, 78, 62),
      P('Ferran Torres', 7, 'DEL', 84, 80, 76, 40),
    ],
  },
  {
    id: 'mci', name: 'Manchester City', short: 'MCI', formation: '4-2-3-1',
    kit: { primary: '#6cabdd', secondary: '#1c2c5b', text: '#0d1b3e' },
    kit2: { primary: '#1c2c5b', secondary: '#6cabdd', text: '#ffffff' },
    gk: '#ffd23f',
    players: [
      P('Ederson', 31, 'POR', 55, 30, 92, 86),
      P('Kyle Walker', 2, 'DEF', 90, 60, 76, 82),
      P('Rúben Dias', 3, 'DEF', 66, 45, 74, 89),
      P('Joško Gvardiol', 24, 'DEF', 80, 66, 78, 85),
      P('Nathan Aké', 6, 'DEF', 74, 52, 76, 83),
      P('Rodri', 16, 'MED', 66, 78, 89, 87),
      P('Mateo Kovačić', 8, 'MED', 74, 70, 86, 74),
      P('Kevin De Bruyne', 17, 'MED', 72, 88, 94, 60),
      P('Bernardo Silva', 20, 'DEL', 80, 80, 88, 62),
      P('Phil Foden', 47, 'DEL', 84, 85, 86, 54),
      P('Erling Haaland', 9, 'DEL', 89, 94, 68, 45),
      P('Stefan Ortega', 18, 'POR', 45, 15, 72, 82),
      P('John Stones', 5, 'DEF', 68, 55, 82, 85),
      P('Manuel Akanji', 25, 'DEF', 76, 50, 74, 84),
      P('Jack Grealish', 10, 'DEL', 80, 76, 84, 40),
      P('Jérémy Doku', 11, 'DEL', 96, 72, 76, 30),
    ],
  },
  {
    id: 'bra', name: 'Brasil', short: 'BRA', formation: '4-3-3',
    kit: { primary: '#ffdc02', secondary: '#009b3a', text: '#002776' },
    kit2: { primary: '#1f4fa3', secondary: '#ffdc02', text: '#ffffff' },
    gk: '#7d3cff',
    players: [
      P('Alisson Becker', 1, 'POR', 52, 20, 80, 89, 'Alisson'),
      P('Danilo', 2, 'DEF', 70, 60, 76, 80),
      P('Marquinhos', 4, 'DEF', 74, 55, 78, 88),
      P('Gabriel Magalhães', 3, 'DEF', 70, 58, 70, 86, 'Gabriel'),
      P('Guilherme Arana', 6, 'DEF', 84, 62, 78, 76),
      P('Casemiro', 5, 'MED', 60, 74, 80, 85),
      P('Bruno Guimarães', 8, 'MED', 74, 76, 86, 80),
      P('Lucas Paquetá', 17, 'MED', 76, 80, 84, 68),
      P('Raphinha', 11, 'DEL', 90, 84, 82, 45),
      P('Vinícius Júnior', 7, 'DEL', 95, 84, 81, 30, 'Vini Jr.'),
      P('Rodrygo', 21, 'DEL', 89, 82, 80, 40),
      P('Ederson', 23, 'POR', 55, 30, 92, 86),
      P('Éder Militão', 14, 'DEF', 80, 50, 68, 85),
      P('Neymar Jr', 10, 'DEL', 84, 86, 88, 35, 'Neymar'),
      P('Endrick', 9, 'DEL', 88, 82, 68, 32),
      P('Savinho', 19, 'DEL', 90, 74, 78, 32),
    ],
  },
  {
    id: 'arg', name: 'Argentina', short: 'ARG', formation: '4-4-2',
    kit: { primary: '#8cc5f0', secondary: '#ffffff', text: '#0b1f3a', pattern: 'stripes' },
    kit2: { primary: '#1d1d35', secondary: '#8cc5f0', text: '#ffffff' },
    gk: '#ff5d8f',
    players: [
      P('Emiliano Martínez', 23, 'POR', 50, 15, 70, 88, 'Dibu'),
      P('Nahuel Molina', 26, 'DEF', 84, 60, 74, 78),
      P('Cristian Romero', 13, 'DEF', 74, 50, 68, 87),
      P('Nicolás Otamendi', 19, 'DEF', 58, 52, 70, 82),
      P('Nicolás Tagliafico', 3, 'DEF', 76, 52, 72, 80),
      P('Rodrigo De Paul', 7, 'MED', 76, 72, 84, 76),
      P('Enzo Fernández', 24, 'MED', 72, 78, 87, 76),
      P('Alexis Mac Allister', 20, 'MED', 72, 80, 85, 76),
      P('Lionel Messi', 10, 'DEL', 80, 92, 93, 34),
      P('Julián Álvarez', 9, 'DEL', 84, 85, 80, 52),
      P('Lautaro Martínez', 22, 'DEL', 82, 89, 74, 48, 'Lautaro'),
      P('Gerónimo Rulli', 12, 'POR', 45, 15, 60, 80),
      P('Lisandro Martínez', 25, 'DEF', 70, 55, 80, 85, 'Lisandro'),
      P('Giovani Lo Celso', 16, 'MED', 72, 76, 84, 60),
      P('Ángel Di María', 11, 'DEL', 80, 84, 86, 40),
      P('Alejandro Garnacho', 17, 'DEL', 92, 78, 74, 36),
    ],
  },
  {
    id: 'bay', name: 'Bayern Múnich', short: 'BAY', formation: '4-2-3-1',
    kit: { primary: '#dc052d', secondary: '#ffffff', text: '#ffffff' },
    kit2: { primary: '#f2f2f2', secondary: '#dc052d', text: '#1b1b1b' },
    gk: '#22d3ee',
    players: [
      P('Manuel Neuer', 1, 'POR', 50, 20, 82, 87),
      P('Joshua Kimmich', 6, 'DEF', 70, 74, 89, 80),
      P('Dayot Upamecano', 2, 'DEF', 82, 45, 66, 84),
      P('Kim Min-jae', 3, 'DEF', 80, 40, 70, 86, 'Kim'),
      P('Alphonso Davies', 19, 'DEF', 95, 62, 76, 74),
      P('Aleksandar Pavlović', 45, 'MED', 68, 64, 84, 76),
      P('Leon Goretzka', 8, 'MED', 76, 80, 78, 78),
      P('Jamal Musiala', 42, 'MED', 84, 82, 86, 58),
      P('Michael Olise', 17, 'DEL', 84, 82, 86, 40),
      P('Leroy Sané', 10, 'DEL', 90, 82, 80, 36),
      P('Harry Kane', 9, 'DEL', 68, 94, 86, 48),
      P('Sven Ulreich', 26, 'POR', 40, 15, 62, 76),
      P('Konrad Laimer', 27, 'MED', 82, 64, 76, 78),
      P('Thomas Müller', 25, 'DEL', 66, 80, 84, 50),
      P('Kingsley Coman', 11, 'DEL', 92, 76, 76, 32),
      P('Serge Gnabry', 7, 'DEL', 86, 80, 76, 40),
    ],
  },
];

const teamById = (id) => TEAMS.find((t) => t.id === id);



/* ==========================================================================
   3. CONFIGURACIÓN: FÍSICA, ESTADIOS Y DIFICULTAD
   --------------------------------------------------------------------------
   Física de discos (unidades por tick a 60 Hz):
   todo son discos; el balón pesa la mitad que un jugador y se frena menos.
   Coordenadas del mundo: origen en el centro del campo, +x hacia la derecha.
   ========================================================================== */
const STEP = 1 / 60;

const PHYS = {
  playerR: 15, ballR: 10, postR: 8,
  playerIm: 0.5, ballIm: 1,          // masa inversa
  playerDamp: 0.96,
  accel: 0.1, kickAccel: 0.07,       // aceleración normal y mientras se mantiene la patada
  kickStrength: 5, kickReach: 4,     // impulso al balón y margen extra de alcance
  playerB: 0.5, postB: 0.5,          // coeficientes de rebote
};

/**
 * Estadios. hw/hh = semiancho y semialto del campo, goalH = semiancho de la
 * portería, depth = fondo de la red, circle = radio del círculo central.
 */
const MODES = {
  f11: {
    id: 'f11', name: 'Clásico',
    hw: 370, hh: 170, goalH: 64, depth: 42, circle: 75,
    ballB: 0.5, ballDamp: 0.99,
  },
  street: {
    id: 'street', name: 'Street',
    hw: 370, hh: 195, goalH: 68, depth: 40, circle: 68,
    ballB: 0.85, ballDamp: 0.992,
    powers: true, // poderes y combos
  },
};

/** Poderes de Street. Se cargan encadenando toques (combo) y se sortean al llenar la barra. */
const POWERS = {
  turbo: { name: 'Turbo', dur: 4, desc: 'Velocidad x1.9' },
  fire: { name: 'Tiro de fuego', dur: 7, desc: 'Próxima patada x2.4' },
  magnet: { name: 'Imán', dur: 3.5, desc: 'Atrae el balón' },
  freeze: { name: 'Congelar', dur: 2.6, desc: 'Paraliza al rival' },
};
const POWER_IDS = Object.keys(POWERS);
const COMBO_WINDOW = 1.6; // s máximos entre patadas para seguir el combo
const COMBO_BONUS = (n) => (n >= 6 ? 2 : n >= 3 ? 1 : 0); // goles extra por combo

/** Papel de cada jugador según el tamaño del equipo (el primero es el que controla el humano). */
const ROLES = {
  1: ['FWD'],
  2: ['FWD', 'DEF'],
  3: ['FWD', 'MID', 'DEF'],
  4: ['FWD', 'FWD', 'MID', 'DEF'],
};

/** speed: multiplicador de aceleración · react: segundos entre decisiones · jitter: error de puntería (rad) */
const DIFFICULTY = {
  facil: { label: 'Fácil', speed: 0.9, react: 0.16, jitter: 0.16 },
  normal: { label: 'Normal', speed: 1.0, react: 0.06, jitter: 0.05 },
  dificil: { label: 'Difícil', speed: 1.08, react: 0.02, jitter: 0.015 },
};

/* ==========================================================================
   4. AUDIO PROCEDURAL (WebAudio)
   ========================================================================== */
const Sound = {
  ctx: null,
  muted: false,

  /** El contexto de audio solo puede crearse tras un gesto del usuario. */
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    try { this.ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { this.ctx = null; }
  },

  tone(freq, dur, type = 'sine', vol = 0.15, slideTo = null) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  noise(dur, vol = 0.2, freq = 1000) {
    if (!this.ctx || this.muted) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.7;
    const g = this.ctx.createGain();
    g.gain.value = vol;
    src.connect(f).connect(g).connect(this.ctx.destination);
    src.start();
  },

  whistle(long) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime, dur = long ? 0.9 : 0.35;
    const o = this.ctx.createOscillator(), lfo = this.ctx.createOscillator();
    const lg = this.ctx.createGain(), g = this.ctx.createGain();
    o.frequency.value = 2900;
    lfo.frequency.value = 28;
    lg.gain.value = 180;
    lfo.connect(lg).connect(o.frequency);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.07, t + 0.03);
    g.gain.setValueAtTime(0.07, t + dur - 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.ctx.destination);
    o.start(t); lfo.start(t);
    o.stop(t + dur + 0.05); lfo.stop(t + dur + 0.05);
  },

  kick(strong) { this.tone(strong ? 140 : 190, 0.09, 'triangle', strong ? 0.35 : 0.2, 60); this.noise(0.05, 0.1, 1800); },
  goal() {
    this.noise(1.8, 0.35, 700);
    [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => this.tone(f, 0.25, 'square', 0.07), i * 110));
  },
  post() { this.tone(1200, 0.25, 'square', 0.07, 600); },
  wall() { this.noise(0.08, 0.14, 420); },
  tackle() { this.noise(0.12, 0.2, 300); },
  skill() { this.tone(600, 0.12, 'sawtooth', 0.06, 1200); },
};



/* ==========================================================================
   5. ENTRADA: TECLADO Y CONTROLES TÁCTILES
   --------------------------------------------------------------------------
   Jugador 1: WASD + Espacio/X/Z. Con un solo humano también vale las flechas.
   Jugador 2 (local): flechas + Enter.
   ========================================================================== */
const P1_KEYS = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], kick: ['Space', 'KeyX', 'KeyZ'], power: ['KeyC', 'ShiftLeft'] };
const P2_KEYS = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], kick: ['Enter', 'NumpadEnter', 'ShiftRight', 'Numpad0'], power: ['Slash', 'ControlRight', 'Numpad1'] };
const GAME_CODES = new Set([...Object.values(P1_KEYS), ...Object.values(P2_KEYS)].flat());

const Input = {
  down: new Set(),
  axis: { x: 0, y: 0 }, // joystick táctil analógico
  touchKick: false,
  touchPower: false,

  any(codes) { return codes.some((c) => this.down.has(c)); },

  /** Lee el control del jugador humano `id` (1 o 2); `shareArrows` deja las flechas al jugador 1. */
  read(id, shareArrows) {
    const keys = id === 1 ? P1_KEYS : P2_KEYS;
    const alt = id === 1 && shareArrows ? P2_KEYS : null;
    const h = (k) => (this.any(keys[k]) || (alt && this.any(alt[k]))) ? 1 : 0;
    let x = h('right') - h('left'), y = h('down') - h('up');
    if (id === 1) { x += this.axis.x; y += this.axis.y; }
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return {
      x, y,
      kick: !!h('kick') || (id === 1 && this.touchKick),
      power: !!h('power') || (id === 1 && this.touchPower),
    };
  },

  releaseAll() { this.down.clear(); this.axis.x = this.axis.y = 0; this.touchKick = this.touchPower = false; },
};

window.addEventListener('keydown', (e) => {
  // Esc cierra primero el modal de controles si está abierto
  if (e.code === 'Escape' && !$('#controls-modal').classList.contains('hidden')) {
    $('#controls-modal').classList.add('hidden');
    return;
  }
  if (appState === STATES.PLAYING && game) {
    if (e.code === 'KeyP' || e.code === 'Escape') { e.preventDefault(); togglePause(); return; }
    if (e.code === 'KeyM') { Sound.muted = !Sound.muted; showBanner(Sound.muted ? 'Sonido desactivado' : 'Sonido activado', '', 'small', 900); return; }
    if (GAME_CODES.has(e.code) && !game.paused) {
      e.preventDefault();
      Sound.init();
      Input.down.add(e.code);
    }
  } else if (e.code === 'Escape') {
    $('#controls-modal').classList.add('hidden');
  }
});
window.addEventListener('keyup', (e) => { Input.down.delete(e.code); });
window.addEventListener('blur', () => { Input.releaseAll(); togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { Input.releaseAll(); togglePause(true); } });

/** Joystick virtual y botón de patada para pantallas táctiles. */
function setupTouch() {
  const coarse = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  if (!coarse) return;
  document.body.classList.add('touch');

  const joy = $('#joystick'), knob = $('#joy-knob');
  let pid = null;
  const setFrom = (e) => {
    const rect = joy.getBoundingClientRect();
    const r = rect.width / 2;
    let dx = e.clientX - (rect.left + r), dy = e.clientY - (rect.top + r);
    const l = Math.hypot(dx, dy);
    if (l > r) { dx = (dx / l) * r; dy = (dy / l) * r; }
    knob.style.transform = `translate(${dx}px, ${dy}px)`;
    const ax = dx / r, ay = dy / r;
    const dead = Math.hypot(ax, ay) < 0.15;
    Input.axis.x = dead ? 0 : ax;
    Input.axis.y = dead ? 0 : ay;
  };
  const end = (e) => {
    if (e.pointerId !== pid) return;
    pid = null;
    Input.axis.x = Input.axis.y = 0;
    knob.style.transform = '';
  };
  joy.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.init(); pid = e.pointerId; joy.setPointerCapture(pid); setFrom(e); });
  joy.addEventListener('pointermove', (e) => { if (e.pointerId === pid) setFrom(e); });
  joy.addEventListener('pointerup', end);
  joy.addEventListener('pointercancel', end);

  const btn = $('#btn-kick');
  const up = () => { Input.touchKick = false; btn.classList.remove('pressed'); };
  btn.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.init(); Input.touchKick = true; btn.classList.add('pressed'); });
  btn.addEventListener('pointerup', up);
  btn.addEventListener('pointercancel', up);
  btn.addEventListener('pointerleave', up);

  const pw = $('#btn-power');
  const pwUp = () => { Input.touchPower = false; pw.classList.remove('pressed'); };
  pw.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.init(); Input.touchPower = true; pw.classList.add('pressed'); });
  pw.addEventListener('pointerup', pwUp);
  pw.addEventListener('pointercancel', pwUp);
  pw.addEventListener('pointerleave', pwUp);
}


/* ==========================================================================
   6. ESTADOS DE LA APLICACIÓN Y PANTALLAS
   --------------------------------------------------------------------------
   Máquina de estados: MENU → MODE → TEAMS → PLAYING → END.
   ========================================================================== */
const STATES = { MENU: 'menu', MODE: 'mode', TEAMS: 'teams', PLAYING: 'game', END: 'end' };
let appState = STATES.MENU;

/** Selección del usuario a lo largo de los menús. */
const sel = {
  mode: 'f11',
  homeId: 'rma',
  awayId: 'fcb',
  difficulty: 'normal',
  size: 3,        // jugadores por equipo
  humans: 1,      // jugadores humanos (0 = CPU vs CPU)
  duration: 180,  // segundos (0 = sin límite)
  goals: 3,       // goles para ganar (0 = sin límite)
};

function showScreen(name) {
  $$('.screen').forEach((s) => s.classList.toggle('active', s.id === `screen-${name}`));
  appState = name;
  window.scrollTo(0, 0);
}

function setTheme(mode) {
  document.body.classList.toggle('theme-f11', mode === 'f11');
  document.body.classList.toggle('theme-street', mode === 'street');
}

/** Delegación de eventos: cualquier elemento con data-action. */
document.addEventListener('click', (e) => {
  const t = e.target.closest('[data-action]');
  if (!t) return;
  Sound.init();
  handleAction(t.dataset.action, t);
});

function handleAction(action, t) {
  switch (action) {
    case 'go-mode': showScreen(STATES.MODE); break;
    case 'show-controls': $('#controls-modal').classList.remove('hidden'); break;
    case 'close-controls': $('#controls-modal').classList.add('hidden'); break;
    case 'back': showScreen(t.dataset.target); break;
    case 'pick-mode':
      sel.mode = t.dataset.mode;
      setTheme(sel.mode);
      updateTeamSelection();
      showScreen(STATES.TEAMS);
      break;
    case 'pick-team':
      if (t.dataset.side === 'home') sel.homeId = t.dataset.team; else sel.awayId = t.dataset.team;
      updateTeamSelection();
      break;
    case 'pick-diff': sel.difficulty = t.dataset.diff; updateTeamSelection(); break;
    case 'pick-opt': sel[t.dataset.opt] = Number(t.dataset.val); updateTeamSelection(); break;
    case 'start': startMatch(); break;
    case 'pause': togglePause(); break;
    case 'resume': togglePause(false); break;
    case 'restart': startMatch(); break;
    case 'rematch': startMatch(); break;
    case 'change-teams': game = null; showScreen(STATES.TEAMS); break;
    case 'quit':
    case 'menu':
      game = null;
      $('#pause-overlay').classList.add('hidden');
      showScreen(STATES.MENU);
      break;
  }
}

/* ---------- Pantalla de equipos ---------- */
function buildTeamGrids() {
  for (const side of ['home', 'away']) {
    const grid = $(`#grid-${side}`);
    grid.innerHTML = '';
    for (const t of TEAMS) {
      const b = makeEl('button', 'team-card');
      b.type = 'button';
      b.dataset.action = 'pick-team';
      b.dataset.side = side;
      b.dataset.team = t.id;
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--c1', t.kit.primary);
      b.style.setProperty('--c2', t.kit.secondary);
      b.style.setProperty('--ct', t.kit.text);
      b.innerHTML = `
        <span class="badge">${t.short}</span>
        <span class="team-info"><span class="team-name">${t.name}</span></span>`;
      grid.appendChild(b);
    }
  }
}

function updateTeamSelection() {
  $$('#grid-home .team-card').forEach((c) => { const on = c.dataset.team === sel.homeId; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); });
  $$('#grid-away .team-card').forEach((c) => { const on = c.dataset.team === sel.awayId; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); });
  $$('[data-action="pick-diff"]').forEach((b) => b.classList.toggle('active', b.dataset.diff === sel.difficulty));
  $$('[data-action="pick-opt"]').forEach((b) => b.classList.toggle('active', sel[b.dataset.opt] === Number(b.dataset.val)));
  $('#teams-mode-label').textContent = MODES[sel.mode].name;
  const h = teamById(sel.homeId), a = teamById(sel.awayId);
  $('#matchup').innerHTML = `<b>${h.name}</b> vs <b>${a.name}</b> · ${sel.size}v${sel.size} · IA ${DIFFICULTY[sel.difficulty].label}`;
}


/* ==========================================================================
   7. CREACIÓN DEL PARTIDO Y SAQUES
   ========================================================================== */
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const VIEW_W = canvas.width, VIEW_H = canvas.height; // resolución lógica 1280×720
let game = null;

function makeDisc(x, y, r, im, damp, b) {
  return { x, y, vx: 0, vy: 0, r, im, damp, b };
}

function startMatch() {
  const mode = MODES[sel.mode], diff = DIFFICULTY[sel.difficulty];
  const homeData = teamById(sel.homeId), awayData = teamById(sel.awayId);
  // Si las camisetas se parecen, el visitante usa la segunda equipación
  const awayKit = colorDist(homeData.kit.primary, awayData.kit.primary) < 120 ? awayData.kit2 : awayData.kit;

  const teams = [homeData, awayData].map((data, i) => ({
    index: i, data, kit: i ? awayKit : data.kit, dir: i ? -1 : 1,
    score: 0, stats: { shots: 0, onTarget: 0, kicks: 0, combo: 0 }, players: [], chaser: null,
    combo: { n: 0, last: -99 },          // racha de patadas seguidas
    power: { charge: 0, ready: null },   // barra de poder y poder sorteado
    frozen: 0,                           // segundos que le quedan congelado
  }));

  const g = {
    mode, diff, teams,
    size: sel.size, humans: sel.humans,
    players: [], ball: null, posts: [],
    duration: sel.duration, goalLimit: sel.goals,
    time: 0, clock: 0, phase: 'kickoff', phaseTimer: 0, live: false, kickTeam: 0,
    lastTouch: null, conceded: 0,
    powersOn: !!mode.powers,
    fire: { team: -1, timer: 0 }, trail: 0, magnet: { p: null, timer: 0 },
    paused: false, scorers: [], possession: [0, 0], fx: [],
    scale: Math.min(VIEW_W / (2 * (mode.hw + mode.depth + 40)), VIEW_H / (2 * mode.hh + 150)),
  };

  for (const t of teams) {
    const roster = t.data.players.filter((p) => p.pos !== 'POR');
    for (let k = 0; k < sel.size; k++) {
      const pd = roster[k % roster.length];
      const p = makeDisc(0, 0, PHYS.playerR, PHYS.playerIm, PHYS.playerDamp, PHYS.playerB);
      Object.assign(p, {
        team: t, idx: k, role: ROLES[sel.size][k],
        num: pd.num, short: pd.short, name: pd.name,
        ctrl: 0, kick: false, kicked: false, turbo: 0, powerHeld: false,
        ai: { timer: 0, cmd: { x: 0, y: 0, kick: false }, jitter: 0 },
      });
      t.players.push(p);
      g.players.push(p);
    }
  }
  if (sel.humans >= 1) teams[0].players[0].ctrl = 1;
  if (sel.humans >= 2) teams[1].players[0].ctrl = 2;

  g.ball = makeDisc(0, 0, PHYS.ballR, PHYS.ballIm, mode.ballDamp, mode.ballB);
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) {
    g.posts.push(Object.assign(makeDisc(sx * mode.hw, sy * mode.goalH, PHYS.postR, 0, 1, PHYS.postB), { side: sx }));
  }

  game = g;
  resetKickoff(0);
  setupHUD();
  Input.releaseAll();
  $('#pause-overlay').classList.add('hidden');
  loopAcc = 0;
  showScreen(STATES.PLAYING);
  Sound.whistle(false);
}

/** Coloca a todos en su campo y deja el balón en el centro esperando el saque. */
function resetKickoff(kickTeam) {
  const g = game, m = g.mode, b = g.ball;
  g.kickTeam = kickTeam;
  g.phase = 'kickoff';
  g.live = false;
  g.lastTouch = null;
  b.x = b.y = b.vx = b.vy = 0;
  // Los efectos de poder y los combos no sobreviven al saque (la barra de poder sí)
  g.fire = { team: -1, timer: 0 };
  g.trail = 0;
  g.magnet = { p: null, timer: 0 };
  for (const t of g.teams) { t.combo.n = 0; t.frozen = 0; for (const p of t.players) p.turbo = 0; }

  const fwdCount = g.size === 4 ? 2 : 1;
  for (const t of g.teams) {
    let fwdSeen = 0;
    for (const p of t.players) {
      let dist = 0.8 * m.hw, y = 0; // distancia al centro hacia su propia portería
      if (p.role === 'FWD') {
        dist = 0.3 * m.hw;
        if (fwdCount === 2) y = fwdSeen === 0 ? -0.35 * m.hh : 0.35 * m.hh;
        // El delantero que saca se pega al balón
        if (fwdSeen === 0 && t.index === kickTeam) { dist = 33; y = 0; }
        fwdSeen++;
      } else if (p.role === 'MID') dist = 0.52 * m.hw;
      p.x = -t.dir * dist;
      p.y = y;
      p.vx = p.vy = 0;
      p.kick = p.kicked = false;
      p.ai.timer = 0;
      p.ai.cmd = { x: 0, y: 0, kick: false };
    }
  }
  showBanner(`Saca ${g.teams[kickTeam].data.name}`, '', 'small', 1200);
}


/* ==========================================================================
   8. GAME LOOP Y FÍSICA DE DISCOS
   ========================================================================== */
let lastTs = 0, loopAcc = 0;

function loop(ts) {
  const dt = Math.min(0.1, (ts - lastTs) / 1000 || 0);
  lastTs = ts;
  if (appState === STATES.PLAYING && game) {
    if (!game.paused) {
      loopAcc += dt;
      while (loopAcc >= STEP) {
        tick();
        loopAcc -= STEP;
        if (!game || appState !== STATES.PLAYING) break;
      }
    }
    if (game) { render(); updateHUD(); }
  }
  requestAnimationFrame(loop);
}

function tick() {
  const g = game;
  g.clock += STEP;
  updateChasers();
  updatePowers();

  // 1. Controles → aceleración y patadas
  for (const p of g.players) {
    let c = p.ctrl ? Input.read(p.ctrl, g.humans === 1) : aiControl(p);
    if (g.powersOn && c.power && !p.powerHeld) usePower(p.team, p);
    p.powerHeld = !!c.power;
    if (p.team.frozen > 0) c = IDLE; // congelado: ni se mueve ni patea
    p.kick = c.kick;
    if (!c.kick) p.kicked = false;
    if (p.turbo > 0) p.turbo -= STEP;
    const a = (p.kick ? PHYS.kickAccel : PHYS.accel) * (p.ctrl ? 1 : g.diff.speed) * (p.turbo > 0 ? 1.9 : 1);
    p.vx += c.x * a;
    p.vy += c.y * a;
    if (p.kick && !p.kicked) tryKick(p);
  }

  // 2. Integración (primero se mueve, luego se aplica el rozamiento)
  for (const d of g.players) integrate(d);
  integrate(g.ball);

  // 3. Colisiones (dos pasadas para que el apilamiento sea estable)
  for (let it = 0; it < 2; it++) resolveCollisions();

  // 4. Reglas
  updateRules();
  updateFx();
}

function integrate(d) {
  d.x += d.vx;
  d.y += d.vy;
  d.vx *= d.damp;
  d.vy *= d.damp;
}

/**
 * Choque elástico entre dos discos con masas inversas distintas (una masa
 * inversa 0 es un objeto fijo, como un poste). Devuelve la velocidad de
 * impacto, o -1 si no hay contacto.
 */
function collide(a, b, e) {
  let dx = a.x - b.x, dy = a.y - b.y;
  const min = a.r + b.r, d2 = dx * dx + dy * dy;
  if (d2 >= min * min) return -1;
  const sum = a.im + b.im;
  if (!sum) return -1;
  let d = Math.sqrt(d2);
  if (d < 1e-4) { dx = 1; dy = 0; d = 1; }
  const nx = dx / d, ny = dy / d;
  const ov = min - d;
  a.x += nx * ov * (a.im / sum);
  a.y += ny * ov * (a.im / sum);
  b.x -= nx * ov * (b.im / sum);
  b.y -= ny * ov * (b.im / sum);
  const vn = (a.vx - b.vx) * nx + (a.vy - b.vy) * ny;
  if (vn >= 0) return 0;
  const j = (-(1 + e) * vn) / sum;
  a.vx += j * a.im * nx;
  a.vy += j * a.im * ny;
  b.vx -= j * b.im * nx;
  b.vy -= j * b.im * ny;
  return -vn;
}

function resolveCollisions() {
  const g = game, ball = g.ball, ps = g.players;

  for (let i = 0; i < ps.length; i++) {
    for (let j = i + 1; j < ps.length; j++) collide(ps[i], ps[j], PHYS.playerB * PHYS.playerB);
  }
  for (const p of ps) {
    if (collide(p, ball, PHYS.playerB * ball.b) >= 0) touch(p);
  }
  for (const post of g.posts) {
    const hit = collide(ball, post, ball.b * post.b);
    if (hit > 2) { Sound.post(); }
    for (const p of ps) collide(p, post, 0);
  }

  wallBall(ball);
  for (const p of ps) wallPlayer(p);
}

/** Paredes del balón: el campo está cerrado salvo por las bocas de gol, que dan a una red con fondo. */
function wallBall(b) {
  const m = game.mode, e = m.ballB;
  const ymax = Math.abs(b.x) > m.hw ? m.goalH - b.r : m.hh - b.r;
  const xmax = Math.abs(b.y) < m.goalH ? m.hw + m.depth - b.r : m.hw - b.r;
  let hit = 0;
  if (b.y > ymax) { b.y = ymax; if (b.vy > 0) { hit = Math.max(hit, b.vy); b.vy = -b.vy * e; } }
  else if (b.y < -ymax) { b.y = -ymax; if (b.vy < 0) { hit = Math.max(hit, -b.vy); b.vy = -b.vy * e; } }
  if (b.x > xmax) { b.x = xmax; if (b.vx > 0) { hit = Math.max(hit, b.vx); b.vx = -b.vx * e; } }
  else if (b.x < -xmax) { b.x = -xmax; if (b.vx < 0) { hit = Math.max(hit, -b.vx); b.vx = -b.vx * e; } }
  if (hit > 2.5) Sound.wall();
}

/** Los jugadores no entran en las porterías y, en el saque, respetan su mitad y el círculo central. */
function wallPlayer(p) {
  const g = game, m = g.mode;
  const xmax = m.hw - p.r, ymax = m.hh + 22;
  if (p.x > xmax) { p.x = xmax; if (p.vx > 0) p.vx = 0; }
  else if (p.x < -xmax) { p.x = -xmax; if (p.vx < 0) p.vx = 0; }
  if (p.y > ymax) { p.y = ymax; if (p.vy > 0) p.vy = 0; }
  else if (p.y < -ymax) { p.y = -ymax; if (p.vy < 0) p.vy = 0; }

  if (g.phase === 'kickoff' && !g.live) {
    const dir = p.team.dir;
    if (dir * p.x > 0) { p.x = 0; if (dir * p.vx > 0) p.vx = 0; }
    if (p.team.index !== g.kickTeam) {
      const min = m.circle + p.r, d = Math.hypot(p.x, p.y);
      if (d < min) {
        const nx = d ? p.x / d : -dir, ny = d ? p.y / d : 0;
        p.x = nx * min;
        p.y = ny * min;
      }
    }
  }
}

/** Registra el contacto con el balón: último en tocarlo y, si es el saque, pone la bola en juego. */
function touch(p) {
  const g = game;
  // Si el rival toca el balón, se corta la racha de combo del equipo que lo tenía
  if (g.lastTouch && g.lastTouch.team !== p.team) g.lastTouch.team.combo.n = 0;
  g.lastTouch = p;
  if (!g.live) { g.live = true; if (g.phase === 'kickoff') g.phase = 'play'; }
}

function tryKick(p) {
  const g = game, b = g.ball;
  const dx = b.x - p.x, dy = b.y - p.y, d = Math.hypot(dx, dy) || 1;
  if (d >= p.r + b.r + PHYS.kickReach) return;
  const nx = dx / d, ny = dy / d;
  let strength = PHYS.kickStrength;
  if (g.fire.timer > 0 && g.fire.team === p.team.index) {
    strength *= 2.4; // tiro de fuego: gasta el poder y deja estela
    g.fire.timer = 0;
    g.trail = 1.4;
    for (let i = 0; i < 14; i++) g.fx.push({ k: 'dot', x: b.x, y: b.y, vx: nx * rand(1, 5) + rand(-1, 1), vy: ny * rand(1, 5) + rand(-1, 1), life: rand(0.3, 0.7), max: 0.7, size: rand(3, 6), color: '#ff9f1a' });
  }
  b.vx += nx * strength * b.im;
  b.vy += ny * strength * b.im;
  p.kicked = true;
  p.team.stats.kicks++;
  touch(p);
  Sound.kick(Math.hypot(b.vx, b.vy) > 6);
  g.fx.push({ k: 'ring', x: b.x, y: b.y, life: 0.25, max: 0.25 });
  registerCombo(p);
  registerShot(p, b);
}

/* ---------- Street: combos y poderes ---------- */

/** Cada patada del mismo equipo en menos de COMBO_WINDOW segundos alarga el combo y carga el poder. */
function registerCombo(p) {
  const g = game;
  if (!g.powersOn) return;
  const t = p.team, c = t.combo;
  c.n = c.n > 0 && g.clock - c.last <= COMBO_WINDOW ? c.n + 1 : 1;
  c.last = g.clock;
  t.stats.combo = Math.max(t.stats.combo, c.n);
  g.teams[1 - t.index].combo.n = 0;
  chargePower(t, c.n > 1 ? 8 + 8 * (c.n - 1) : 6);
  if (c.n === 4 || c.n === 8) Sound.skill();
}

function chargePower(t, amount) {
  const pw = t.power;
  if (pw.ready) return;
  pw.charge = Math.min(100, pw.charge + amount);
  if (pw.charge < 100) return;
  pw.ready = POWER_IDS[Math.floor(Math.random() * POWER_IDS.length)];
  showBanner(`¡Poder listo!`, `${t.data.name}: ${POWERS[pw.ready].name}`, 'small', 1400);
  Sound.skill();
}

function usePower(t, p) {
  const g = game, pw = t.power;
  if (!pw.ready) return;
  const id = pw.ready, def = POWERS[id];
  pw.ready = null;
  pw.charge = 0;
  if (id === 'turbo') p.turbo = def.dur;
  else if (id === 'fire') g.fire = { team: t.index, timer: def.dur };
  else if (id === 'magnet') g.magnet = { p, timer: def.dur };
  else if (id === 'freeze') g.teams[1 - t.index].frozen = def.dur;
  showBanner(def.name, def.desc, 'small', 1100);
  Sound.skill();
  for (let i = 0; i < 24; i++) {
    const a = rand(0, TAU), s = rand(1, 3.5);
    g.fx.push({ k: 'dot', x: p.x, y: p.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.4, 0.8), max: 0.8, size: rand(2, 4), color: id === 'freeze' ? '#9be7ff' : '#ff2bd6' });
  }
}

/** Temporizadores de los poderes, combos que caducan, estela del tiro de fuego e imán. */
function updatePowers() {
  const g = game, b = g.ball;
  for (const t of g.teams) {
    if (t.frozen > 0) t.frozen -= STEP;
    if (t.combo.n && g.clock - t.combo.last > COMBO_WINDOW + 0.8) t.combo.n = 0;
  }
  if (g.fire.timer > 0) g.fire.timer -= STEP;
  if (g.trail > 0) {
    g.trail -= STEP;
    if (Math.hypot(b.vx, b.vy) > 3) g.fx.push({ k: 'dot', x: b.x, y: b.y, vx: rand(-0.4, 0.4), vy: rand(-0.4, 0.4), life: 0.45, max: 0.45, size: rand(3, 6), color: Math.random() < 0.5 ? '#ff9f1a' : '#ffd23f' });
  }
  const mg = g.magnet;
  if (mg.timer > 0) {
    mg.timer -= STEP;
    const dx = mg.p.x - b.x, dy = mg.p.y - b.y, d = Math.hypot(dx, dy);
    if (d < 190 && d > mg.p.r + b.r + 2) {
      b.vx += (dx / d) * 0.16;
      b.vy += (dy / d) * 0.16;
      const s = Math.hypot(b.vx, b.vy);
      if (s > 6) { b.vx *= 6 / s; b.vy *= 6 / s; }
    }
  }
  if (g.powersOn) aiPowers();
}

/** Cuenta tiros: la bola va hacia la portería rival y cruzaría la línea cerca de ella. */
function registerShot(p, b) {
  const m = game.mode, dir = p.team.dir;
  if (b.vx * dir < 0.5) return;
  const t = (dir * m.hw - b.x) / b.vx;
  const yAt = b.y + b.vy * t;
  if (Math.abs(yAt) < m.goalH * 2) {
    p.team.stats.shots++;
    if (Math.abs(yAt) < m.goalH) p.team.stats.onTarget++;
  }
}


/* ==========================================================================
   9. GOLES, TIEMPO Y FASES DEL PARTIDO
   ========================================================================== */
function updateRules() {
  const g = game, m = g.mode, b = g.ball;

  if (g.lastTouch) g.possession[g.lastTouch.team.index] += STEP;

  if (g.phase === 'play') {
    g.time += STEP;
    if (Math.abs(b.x) > m.hw + b.r) { onGoal(b.x > 0 ? 0 : 1); return; }
    if (g.duration && g.time >= g.duration) startFulltime();
  } else if (g.phase === 'kickoff') {
    // El balón puede ser empujado por un jugador antes de que se marque "live"; no cuenta como gol
  } else if (g.phase === 'goal' || g.phase === 'fulltime') {
    g.phaseTimer -= STEP;
    if (g.phaseTimer > 0) return;
    if (g.phase === 'fulltime') { endMatch(); return; }
    const limit = g.goalLimit && g.teams.some((t) => t.score >= g.goalLimit);
    if (limit || (g.duration && g.time >= g.duration)) startFulltime();
    else { resetKickoff(g.conceded); Sound.whistle(false); }
  }
}

function onGoal(scoringIdx) {
  const g = game, team = g.teams[scoringIdx];
  const lt = g.lastTouch;
  const og = !!lt && lt.team.index !== scoringIdx;
  // Street: un gol con combo vale doble o triple
  const combo = team.combo.n;
  const bonus = g.powersOn && lt && !og ? COMBO_BONUS(combo) : 0;
  const pts = 1 + bonus;
  team.score += pts;
  g.phase = 'goal';
  g.phaseTimer = 2.4;
  g.conceded = 1 - scoringIdx;
  g.scorers.push({ team: scoringIdx, name: lt ? lt.short : '—', minute: clockLabel(g.time), og, pts });

  const who = `${lt ? lt.short : team.data.name}${og ? ' (p.p.)' : ''} · ${team.data.name}`;
  showBanner(bonus ? `¡GOL x${pts}!` : '¡GOOOL!', bonus ? `${who} · Combo x${combo}` : who, 'goal', 2200);
  Sound.goal();
  const m = g.mode;
  for (let i = 0; i < 70; i++) {
    const a = rand(0, TAU), s = rand(0.8, 4);
    g.fx.push({
      k: 'dot', x: scoringIdx ? -m.hw : m.hw, y: rand(-m.goalH, m.goalH),
      vx: Math.cos(a) * s - (scoringIdx ? -1 : 1), vy: Math.sin(a) * s,
      life: rand(0.8, 1.6), max: 1.6, size: rand(2, 4.5),
      color: [team.kit.primary, team.kit.secondary, '#ffffff'][i % 3],
    });
  }
}

function startFulltime() {
  const g = game;
  g.phase = 'fulltime';
  g.phaseTimer = 2.2;
  Sound.whistle(true);
  showBanner('Fin del partido', `${g.teams[0].score} - ${g.teams[1].score}`, 'big', 2200);
}

function updateFx() {
  const fx = game.fx;
  for (let i = fx.length - 1; i >= 0; i--) {
    const f = fx[i];
    f.life -= STEP;
    if (f.life <= 0) { fx.splice(i, 1); continue; }
    if (f.k === 'dot') { f.x += f.vx; f.y += f.vy; f.vy += 0.04; f.vx *= 0.99; }
  }
}

function clockLabel(sec) {
  const s = Math.floor(sec);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}


/* ==========================================================================
   10. INTELIGENCIA ARTIFICIAL
   --------------------------------------------------------------------------
   En cada equipo, el jugador de IA más cercano al balón (con sesgo por rol)
   es el "perseguidor": anticipa la trayectoria del balón, se coloca a su
   espalda respecto al punto al que quiere tirar y lo patea. Apunta a los
   palos lejos del defensor, regatea o pasa a un compañero libre si un rival
   tapa el tiro, y en Street usa los poderes en el momento oportuno.
   El defensa hace de portero y solo sale si el balón está cerca de su área.
   ========================================================================== */
const IDLE = Object.freeze({ x: 0, y: 0, kick: false });

function updateChasers() {
  const g = game, b = g.ball, m = g.mode;
  for (const t of g.teams) {
    let best = null, bestScore = Infinity;
    for (const p of t.players) {
      if (p.ctrl) continue;
      let s = Math.hypot(p.x - b.x, p.y - b.y);
      // El defensa (portero) solo sale a por el balón si está cerca de su portería
      if (p.role === 'DEF' && Math.abs(b.x + t.dir * m.hw) > 240) s += 220;
      if (p === t.chaser) s -= 20; // histéresis para que no cambien de perseguidor cada tick
      if (s < bestScore) { bestScore = s; best = p; }
    }
    t.chaser = best;
  }
}

function nearestFoe(team, pt) {
  let best = null, bd = Infinity;
  for (const o of game.teams[1 - team.index].players) {
    const d = dist(o, pt);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

/** Punto de la portería rival al que apuntar: el palo lejano al defensor, o el centro si se tira de lejos. */
function shotTarget(t, b) {
  const m = game.mode, goalX = t.dir * m.hw;
  if (Math.abs(goalX - b.x) > 330) return { x: goalX, y: 0 };
  const guard = nearestFoe(t, { x: goalX, y: 0 });
  const side = guard && dist(guard, { x: goalX, y: 0 }) < 150 ? (guard.y > 0 ? -1 : 1) : (b.y > 0 ? -1 : 1);
  return { x: goalX, y: side * m.goalH * 0.55 };
}

/** Compañero más adelantado con línea de pase libre. */
function bestMate(p, b) {
  const t = p.team, foes = game.teams[1 - t.index].players;
  let best = null, bs = -Infinity;
  for (const q of t.players) {
    if (q === p || t.dir * (q.x - b.x) < 20) continue;
    const d = Math.hypot(q.x - b.x, q.y - b.y);
    if (d < 80 || d > 420) continue;
    if (foes.some((o) => distPointSegment(o, b, q) < 34)) continue;
    const s = t.dir * q.x - d * 0.1;
    if (s > bs) { bs = s; best = q; }
  }
  return best;
}

function aiControl(p) {
  const ai = p.ai;
  ai.timer -= STEP;
  if (ai.timer > 0) return ai.cmd;
  const d = game.diff;
  ai.timer = d.react * (0.6 + Math.random() * 0.8);
  ai.jitter = rand(-d.jitter, d.jitter);
  ai.cmd = aiThink(p);
  return ai.cmd;
}

function aiThink(p) {
  const g = game, t = p.team, m = g.mode, b = g.ball, dir = t.dir;
  if (!g.live && g.phase === 'kickoff' && (t.index !== g.kickTeam || p.idx !== 0)) return IDLE;

  const rr = p.r + b.r;
  const d = Math.hypot(b.x - p.x, b.y - p.y);
  let tx, ty, kick = false;

  if (t.chaser === p) {
    // Punto donde estará el balón cuando llegue (anticipación)
    const lead = clamp(d / 3, 0, 22);
    const bp = { x: clamp(b.x + b.vx * lead, -m.hw + 12, m.hw - 12), y: clamp(b.y + b.vy * lead, -m.hh + 12, m.hh - 12) };

    const aim = shotTarget(t, b);
    let tg = norm(aim.x - b.x, aim.y - b.y);
    let ang = p.ai.jitter;
    const foe = nearestFoe(t, b);
    if (foe && dist(foe, b) < 150 && distPointSegment(foe, b, aim) < 40) {
      // Un rival tapa el tiro: pase a un compañero libre o, si no hay, regate hacia el lado libre
      const mate = bestMate(p, b);
      if (mate) tg = norm(mate.x + mate.vx * 12 - b.x, mate.y + mate.vy * 12 - b.y);
      else ang += (tg.x * (foe.y - b.y) - tg.y * (foe.x - b.x)) > 0 ? -0.65 : 0.65;
    }
    const ca = Math.cos(ang), sa = Math.sin(ang);
    tg = { x: tg.x * ca - tg.y * sa, y: tg.x * sa + tg.y * ca };

    const toBall = norm(b.x - p.x, b.y - p.y);
    const align = toBall.x * tg.x + toBall.y * tg.y;
    if (align > 0.92) {
      tx = bp.x; ty = bp.y;
      kick = d < rr + 3;
    } else {
      // Ir a la espalda del balón; si el camino pasa por él, rodearlo por el lado más cercano
      tx = bp.x - tg.x * (rr + 14);
      ty = bp.y - tg.y * (rr + 14);
      if (d > rr + 4 && distPointSegment(b, p, { x: tx, y: ty }) < rr + 8) {
        // Orbitar: avanzar un tramo de arco alrededor del balón hacia el punto de destino
        const a0 = Math.atan2(p.y - b.y, p.x - b.x), a1 = Math.atan2(ty - b.y, tx - b.x);
        const a = a0 + clamp(angleDiff(a0, a1), -0.9, 0.9);
        const r = rr + 30;
        tx = b.x + Math.cos(a) * r;
        ty = b.y + Math.sin(a) * r;
      }
    }
  } else if (p.role === 'DEF') {
    // Portero: se mueve sobre la línea entre el balón y el centro de su portería
    const ownX = -dir * m.hw;
    const ratio = clamp(90 / Math.max(90, Math.abs(b.x - ownX)), 0.25, 1);
    tx = ownX + dir * 50;
    ty = clamp(b.y * ratio, -(m.goalH - 14), m.goalH - 14);
  } else {
    const attacking = g.lastTouch && g.lastTouch.team === t;
    if (p.role === 'MID') {
      tx = clamp(b.x + dir * (attacking ? 40 : -100), -m.hw + 40, m.hw - 40);
      ty = b.y * 0.5 + (p.idx % 2 ? 45 : -45);
    } else {
      tx = clamp(b.x + dir * (attacking ? 130 : 60), -m.hw + 40, m.hw - 40);
      ty = -b.y * 0.4 + (p.idx % 2 ? 60 : -60);
    }
  }

  // Patada oportunista: el balón está al alcance y por delante
  if (!kick && d < rr + 3 && dir * (b.x - p.x) > 0) kick = true;
  // Hay que soltar la patada entre golpe y golpe: solo se patea una vez por pulsación
  if (p.kicked) kick = false;

  ty = clamp(ty, -m.hh + 10, m.hh - 10);
  const dx = tx - p.x, dy = ty - p.y, l = Math.hypot(dx, dy);
  if (l < 5) return { x: 0, y: 0, kick };
  return { x: dx / l, y: dy / l, kick };
}

/** La IA gasta su poder cuando le sirve: Turbo lejos del balón, Fuego cerca de la portería, etc. */
function aiPowers() {
  const g = game;
  if (!g.live) return;
  for (const t of g.teams) {
    const pw = t.power, p = t.chaser;
    if (!pw.ready || !p || t.players.some((q) => q.ctrl)) continue;
    const b = g.ball, d = dist(p, b), gd = Math.abs(t.dir * g.mode.hw - b.x);
    const ok = {
      turbo: d > 130,
      fire: d < 40 && gd < 320,
      magnet: d < 170 && gd < 450,
      freeze: dist(nearestFoe(t, b), b) < 90,
    }[pw.ready];
    if (ok) usePower(t, p);
  }
}


/* ==========================================================================
   11. RENDER
   ========================================================================== */
function render() {
  const g = game, m = g.mode, s = g.scale, street = m.id === 'street';
  const cx = VIEW_W / 2, cy = VIEW_H / 2 + 22;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = street ? '#08080f' : '#4b6639';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(s, s);

  drawPitch(m, street);
  drawGoals(g, m, street);
  for (const post of g.posts) drawPost(post, g);
  for (const p of g.players) drawPlayer(p);
  drawBall(g.ball);
  drawFx(g.fx);

  ctx.restore();
}

function drawPitch(m, street) {
  const { hw, hh } = m;
  // Césped / asfalto
  if (street) {
    ctx.fillStyle = '#171925';
    ctx.fillRect(-hw, -hh, hw * 2, hh * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.07)';
    ctx.lineWidth = 1;
    for (let x = -hw; x <= hw; x += 30) { ctx.beginPath(); ctx.moveTo(x, -hh); ctx.lineTo(x, hh); ctx.stroke(); }
    for (let y = -hh; y <= hh; y += 30) { ctx.beginPath(); ctx.moveTo(-hw, y); ctx.lineTo(hw, y); ctx.stroke(); }
  } else {
    const n = 14, w = (hw * 2) / n;
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = i % 2 ? '#6f8d5a' : '#678550';
      ctx.fillRect(-hw + i * w, -hh, w + 0.5, hh * 2);
    }
  }

  ctx.save();
  ctx.strokeStyle = street ? '#00f0ff' : 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = 3;
  if (street) { ctx.shadowColor = '#00f0ff'; ctx.shadowBlur = 10; }
  ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
  ctx.beginPath(); ctx.moveTo(0, -hh); ctx.lineTo(0, hh); ctx.stroke();
  ctx.beginPath(); ctx.arc(0, 0, m.circle, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** Porterías: red detrás de la línea con el color del equipo que la defiende. */
function drawGoals(g, m, street) {
  for (const sx of [-1, 1]) {
    const team = g.teams[sx < 0 ? 0 : 1];
    const x0 = sx * m.hw, x1 = sx * (m.hw + m.depth);
    const xa = Math.min(x0, x1), w = Math.abs(x1 - x0);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(xa, -m.goalH, w, m.goalH * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.22)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += 8) { ctx.beginPath(); ctx.moveTo(xa + x, -m.goalH); ctx.lineTo(xa + x, m.goalH); ctx.stroke(); }
    for (let y = -m.goalH; y <= m.goalH; y += 8) { ctx.beginPath(); ctx.moveTo(xa, y); ctx.lineTo(xa + w, y); ctx.stroke(); }
    ctx.strokeStyle = team.kit.primary;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x0, -m.goalH); ctx.lineTo(x1, -m.goalH); ctx.lineTo(x1, m.goalH); ctx.lineTo(x0, m.goalH);
    ctx.stroke();
  }
}

function drawPost(post, g) {
  const team = g.teams[post.side < 0 ? 0 : 1];
  ctx.beginPath();
  ctx.arc(post.x, post.y, post.r, 0, TAU);
  ctx.fillStyle = team.kit.primary;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#111';
  ctx.stroke();
}

/** Anillo de aura alrededor de un disco (poderes activos). */
function drawAura(x, y, r, color, dashed) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  if (dashed) { ctx.setLineDash([6, 5]); ctx.lineDashOffset = -game.clock * 40; }
  ctx.stroke();
  ctx.restore();
}

function drawPlayer(p) {
  const g = game, t = p.team;
  if (p.turbo > 0) drawAura(p.x, p.y, p.r + 6, '#ffd23f', false);
  if (g.fire.timer > 0 && g.fire.team === t.index) drawAura(p.x, p.y, p.r + 5, '#ff9f1a', false);
  if (g.magnet.timer > 0 && g.magnet.p === p) {
    drawAura(p.x, p.y, 44, '#ff2bd6', true);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(g.ball.x, g.ball.y);
    ctx.strokeStyle = 'rgba(255, 43, 214, 0.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r, 0, TAU);
  ctx.fillStyle = t.kit.primary;
  ctx.fill();
  // Borde blanco grueso mientras se mantiene la patada
  ctx.lineWidth = p.kick ? 4 : 2.5;
  ctx.strokeStyle = p.kick ? '#ffffff' : '#111111';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(p.x, p.y, p.r - 3.5, 0, TAU);
  ctx.lineWidth = 2;
  ctx.strokeStyle = t.kit.secondary;
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = t.kit.text;
  ctx.font = '700 13px Rubik, sans-serif';
  ctx.fillText(p.num, p.x, p.y + 0.5);

  if (t.frozen > 0) {
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r + 1, 0, TAU);
    ctx.fillStyle = 'rgba(160, 230, 255, 0.65)';
    ctx.fill();
    ctx.strokeStyle = '#e8fbff';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Etiqueta: J1/J2 para humanos, apellido pequeño para el resto
  ctx.font = '600 9px Rubik, sans-serif';
  const label = p.ctrl ? `J${p.ctrl}` : p.short;
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
  ctx.strokeText(label, p.x, p.y - p.r - 7);
  ctx.fillStyle = p.ctrl ? '#ffe066' : 'rgba(255, 255, 255, 0.85)';
  ctx.fillText(label, p.x, p.y - p.r - 7);
}

function drawBall(b) {
  if (game.trail > 0 || game.fire.timer > 0) drawAura(b.x, b.y, b.r + 5, '#ff9f1a', false);
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, TAU);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#111111';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r * 0.38, 0, TAU);
  ctx.fillStyle = '#222222';
  ctx.fill();
}

function drawFx(fx) {
  for (const f of fx) {
    const a = clamp(f.life / f.max, 0, 1);
    if (f.k === 'ring') {
      ctx.beginPath();
      ctx.arc(f.x, f.y, 12 + (1 - a) * 18, 0, TAU);
      ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.8})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = f.color;
      ctx.fillRect(f.x, f.y, f.size, f.size);
      ctx.globalAlpha = 1;
    }
  }
}


/* ==========================================================================
   12. HUD, PAUSA Y PANTALLA FINAL
   ========================================================================== */
const hudEl = {
  scoreHome: $('#hud-score-home'),
  scoreAway: $('#hud-score-away'),
  time: $('#hud-time'),
  combo: [$('#hud-combo-home'), $('#hud-combo-away')],
  powerBox: [$('#hud-power-home'), $('#hud-power-away')],
  powerLabel: [$('#pw-label-home'), $('#pw-label-away')],
  powerFill: [$('#pw-fill-home'), $('#pw-fill-away')],
};

function setBadge(elm, data, kit) {
  elm.textContent = data.short;
  elm.style.setProperty('--c1', kit.primary);
  elm.style.setProperty('--c2', kit.secondary);
  elm.style.setProperty('--ct', kit.text);
}

function setupHUD() {
  const g = game, [h, a] = g.teams;
  $('#hud-name-home').textContent = h.data.name;
  $('#hud-name-away').textContent = a.data.name;
  setBadge($('#hud-badge-home'), h.data, h.kit);
  setBadge($('#hud-badge-away'), a.data, a.kit);
  $('#hud-mode').textContent = `${g.mode.name} · ${g.size}v${g.size}`;
}

/** Solo toca el DOM cuando el valor cambia (evita repintados en cada frame). */
function setText(elm, v) { if (elm._v !== v) { elm._v = v; elm.textContent = v; } }

function timeLabel() {
  const g = game;
  if (!g.duration) return clockLabel(g.time);
  return clockLabel(Math.max(0, Math.ceil(g.duration - g.time)));
}

function updateHUD() {
  const g = game;
  setText(hudEl.scoreHome, String(g.teams[0].score));
  setText(hudEl.scoreAway, String(g.teams[1].score));
  setText(hudEl.time, timeLabel());
  if (g.powersOn) updatePowerHUD();
}

/** Combo y barra de poder de cada equipo (solo Street). */
function updatePowerHUD() {
  const g = game;
  g.teams.forEach((t, i) => {
    const { n } = t.combo, pw = t.power;
    const combo = hudEl.combo[i];
    setText(combo, n >= 2 ? `COMBO x${n}` : '');
    combo.classList.toggle('on', n >= 2);
    combo.classList.toggle('hot', n >= 4);

    // Pista de la tecla solo si hay un humano en el equipo
    const human = t.players.find((q) => q.ctrl);
    const hint = human ? (human.ctrl === 1 ? ' · C' : ' · /') : '';
    setText(hudEl.powerLabel[i], pw.ready ? `${POWERS[pw.ready].name}${hint}` : `Poder ${Math.floor(pw.charge)}%`);
    setWidth(hudEl.powerFill[i], pw.charge / 100);
    hudEl.powerBox[i].classList.toggle('ready', !!pw.ready);
  });
}

function setWidth(elm, f) {
  const w = Math.round(f * 100);
  if (elm._w !== w) { elm._w = w; elm.style.width = `${w}%`; }
}

let bannerTimer = null;
function showBanner(title, sub = '', variant = '', ms = 1600) {
  const elm = $('#hud-banner');
  elm.className = `hud-banner ${variant}`;
  elm.replaceChildren(makeEl('strong', null, title));
  if (sub) elm.appendChild(makeEl('span', null, sub));
  void elm.offsetWidth; // reinicia la transición
  elm.classList.add('show');
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => elm.classList.remove('show'), ms);
}

function togglePause(force) {
  if (!game || appState !== STATES.PLAYING || game.phase === 'fulltime') return;
  game.paused = typeof force === 'boolean' ? force : !game.paused;
  $('#pause-overlay').classList.toggle('hidden', !game.paused);
  Input.releaseAll();
}

function endMatch() {
  const g = game, [h, a] = g.teams;
  const res = h.score > a.score ? 'win' : h.score < a.score ? 'loss' : 'draw';
  $('#end-card').dataset.result = res;
  $('#end-title').textContent = res === 'win' ? '¡Victoria!' : res === 'loss' ? 'Derrota' : 'Empate';
  $('#end-mode').textContent = `${g.mode.name} · ${g.size}v${g.size} · IA ${g.diff.label}`;
  $('#end-result').textContent = `${h.score} - ${a.score}`;

  for (const [team, id] of [[h, '#end-home'], [a, '#end-away']]) {
    const box = $(id);
    box.replaceChildren();
    const badge = makeEl('span', 'badge');
    setBadge(badge, team.data, team.kit);
    box.append(badge, makeEl('span', null, team.data.name));
  }

  [['#end-scorers-home', 0], ['#end-scorers-away', 1]].forEach(([id, idx]) => {
    const ul = $(id);
    ul.replaceChildren();
    const list = g.scorers.filter((s) => s.team === idx);
    if (!list.length) ul.appendChild(makeEl('li', null, '—'));
    for (const s of list) {
      const li = makeEl('li', null, '⚽ ');
      li.append(makeEl('b', null, s.name), document.createTextNode(`${s.og ? ' (p.p.)' : ''}${s.pts > 1 ? ` x${s.pts}` : ''} ${s.minute}`));
      ul.appendChild(li);
    }
  });

  const totalPos = g.possession[0] + g.possession[1] || 1;
  const pos0 = Math.round((g.possession[0] / totalPos) * 100);
  const rows = [
    ['Posesión', pos0, 100 - pos0, '%'],
    ['Tiros', h.stats.shots, a.stats.shots, ''],
    ['Tiros a puerta', h.stats.onTarget, a.stats.onTarget, ''],
    ['Patadas', h.stats.kicks, a.stats.kicks, ''],
  ];
  if (g.powersOn) rows.push(['Mejor combo', h.stats.combo, a.stats.combo, '']);
  const stats = $('#end-stats');
  stats.replaceChildren();
  for (const [label, vh, va, unit] of rows) {
    const total = vh + va;
    const share = total ? (vh / total) * 100 : 50;
    const row = makeEl('div', 'stat-row');
    const mid = makeEl('div', 'stat-mid');
    const bar = makeEl('div', 'stat-bar');
    const bh = makeEl('i', 'h'), ba = makeEl('i', 'a');
    bh.style.width = `${share}%`;
    ba.style.width = `${100 - share}%`;
    bar.append(bh, ba);
    mid.append(makeEl('small', null, label), bar);
    row.append(makeEl('span', 'v', `${vh}${unit}`), mid, makeEl('span', 'v', `${va}${unit}`));
    stats.appendChild(row);
  }

  showScreen(STATES.END);
}


/* ==========================================================================
   13. ARRANQUE
   ========================================================================== */
function init() {
  buildTeamGrids();
  updateTeamSelection();
  setupTouch();
  setTheme('f11');
  requestAnimationFrame(loop);
}

init();
