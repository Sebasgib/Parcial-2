'use strict';
/* ==========================================================================
   GOLAZO · Fútbol 11 & Callejero — script.js
   --------------------------------------------------------------------------
   1.  Utilidades
   2.  Base de datos: equipos y jugadores reales
   3.  Configuración: modos, formaciones, formatos callejeros y dificultad
   4.  Audio procedural (WebAudio, sin archivos externos)
   5.  Entrada: teclado y controles táctiles
   6.  Estados de la aplicación y pantallas (Menú → Selección → Juego → Fin)
   7.  Creación del partido (campo, equipos, saque inicial)
   8.  Game loop: update()
   9.  Física del balón, goles, fueras y saques
   10. Acciones de juego: pase, tiro, entrada y regate
   11. Inteligencia artificial
   12. Render: campo pre-renderizado, jugadores, balón y efectos
   13. HUD, pausa y pantalla final
   14. Arranque
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
   3. CONFIGURACIÓN DE MODOS, FORMACIONES Y DIFICULTAD
   --------------------------------------------------------------------------
   Coordenadas de formación normalizadas desde el punto de vista de cada
   equipo: x = 0 en su propia portería y x = 1 en la rival; y de 0 a 1.
   ========================================================================== */
function S(x, y, role) { return { x, y, role }; }

const FORMATIONS = {
  '4-4-2': {
    label: '4-4-2',
    slots: [S(0.04, 0.5, 'GK'),
      S(0.2, 0.14, 'DEF'), S(0.17, 0.38, 'DEF'), S(0.17, 0.62, 'DEF'), S(0.2, 0.86, 'DEF'),
      S(0.4, 0.14, 'MID'), S(0.37, 0.4, 'MID'), S(0.37, 0.6, 'MID'), S(0.4, 0.86, 'MID'),
      S(0.6, 0.4, 'FWD'), S(0.6, 0.6, 'FWD')],
  },
  '4-3-3': {
    label: '4-3-3',
    slots: [S(0.04, 0.5, 'GK'),
      S(0.2, 0.14, 'DEF'), S(0.17, 0.38, 'DEF'), S(0.17, 0.62, 'DEF'), S(0.2, 0.86, 'DEF'),
      S(0.36, 0.28, 'MID'), S(0.33, 0.5, 'MID'), S(0.36, 0.72, 'MID'),
      S(0.6, 0.16, 'FWD'), S(0.63, 0.5, 'FWD'), S(0.6, 0.84, 'FWD')],
  },
  '3-5-2': {
    label: '3-5-2',
    slots: [S(0.04, 0.5, 'GK'),
      S(0.18, 0.26, 'DEF'), S(0.16, 0.5, 'DEF'), S(0.18, 0.74, 'DEF'),
      S(0.42, 0.1, 'MID'), S(0.36, 0.33, 'MID'), S(0.32, 0.5, 'MID'), S(0.36, 0.67, 'MID'), S(0.42, 0.9, 'MID'),
      S(0.6, 0.4, 'FWD'), S(0.6, 0.6, 'FWD')],
  },
  '4-2-3-1': {
    label: '4-2-3-1',
    slots: [S(0.04, 0.5, 'GK'),
      S(0.2, 0.14, 'DEF'), S(0.17, 0.38, 'DEF'), S(0.17, 0.62, 'DEF'), S(0.2, 0.86, 'DEF'),
      S(0.31, 0.38, 'MID'), S(0.31, 0.62, 'MID'), S(0.47, 0.16, 'MID'), S(0.49, 0.5, 'MID'), S(0.47, 0.84, 'MID'),
      S(0.64, 0.5, 'FWD')],
  },
};

/** Formatos reducidos del modo callejero. */
const STREET_FORMATS = {
  3: {
    id: 3, label: '3 vs 3 (sin porteros)', size: 3, hasGK: false,
    court: { L: 960, W: 560 }, goalW: 110, crossbar: 26, areaDepth: 0, shootRange: 280,
    slots: [S(0.2, 0.5, 'DEF'), S(0.5, 0.3, 'FWD'), S(0.5, 0.7, 'FWD')],
  },
  5: {
    id: 5, label: '5 vs 5 (con porteros)', size: 5, hasGK: true,
    court: { L: 1160, W: 620 }, goalW: 160, crossbar: 32, areaDepth: 110, shootRange: 340,
    slots: [S(0.03, 0.5, 'GK'), S(0.22, 0.3, 'DEF'), S(0.22, 0.7, 'DEF'), S(0.48, 0.36, 'FWD'), S(0.48, 0.64, 'FWD')],
  },
};

/**
 * Parámetros físicos y de reglas de cada modo. El callejero es más rápido:
 * jugadores con más aceleración, balón que rueda y bota más y paredes que rebotan.
 */
const MODES = {
  f11: {
    id: 'f11', name: 'Fútbol 11', walls: false,
    playerR: 11, ballR: 5.5,
    baseSpeed: 120, speedK: 1.5, accel: 7, sprintMul: 1.35,
    gravity: 900, ballFriction: 0.42, airDrag: 0.86, bounce: 0.45,
    controlSpeed: 520, shotBase: 620, shotK: 5.5, dribbleOffset: 3,
    tackleRange: 20, maxPassDist: 620, shootRange: 400, kickoffLock: true,
    durations: [{ v: 180, label: '3 min' }, { v: 300, label: '5 min' }, { v: 480, label: '8 min' }],
    defaultDuration: 300,
  },
  street: {
    id: 'street', name: 'Fútbol Callejero', walls: true,
    playerR: 13, ballR: 6.5,
    baseSpeed: 150, speedK: 1.6, accel: 11, sprintMul: 1.4,
    gravity: 950, ballFriction: 0.55, airDrag: 0.9, bounce: 0.62, wallRest: 0.82,
    controlSpeed: 620, shotBase: 680, shotK: 6, dribbleOffset: 2,
    tackleRange: 16, maxPassDist: 520, kickoffLock: false, goalLimit: 5,
    durations: [{ v: 120, label: '2 min' }, { v: 180, label: '3 min' }, { v: 240, label: '4 min' }],
    defaultDuration: 180,
  },
};

/** Ajustes de la IA rival según dificultad (los compañeros del jugador usan "normal"). */
const DIFFICULTY = {
  facil: { label: 'Fácil', speedMul: 0.9, reaction: 0.45, tackleRate: 0.9, tackleSkill: 0.8, accuracy: 1.5, gkBonus: -0.1, skillRate: 0.15 },
  normal: { label: 'Normal', speedMul: 1.0, reaction: 0.3, tackleRate: 1.6, tackleSkill: 1.0, accuracy: 1.0, gkBonus: 0, skillRate: 0.3 },
  dificil: { label: 'Difícil', speedMul: 1.07, reaction: 0.18, tackleRate: 2.6, tackleSkill: 1.15, accuracy: 0.7, gkBonus: 0.08, skillRate: 0.5 },
};

const SKILL_NAMES = ['¡Caño!', '¡Sombrerito!', '¡Elástica!', '¡Ruleta!', '¡Bicicleta!', '¡Lambretta!'];


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
   Todas las fuentes (teclado, joystick y botones táctiles) escriben en el
   mismo objeto Input, que el juego consulta con held / pressed / released.
   ========================================================================== */
const KEYMAP = {
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  KeyZ: 'pass', Space: 'pass',
  KeyX: 'shoot',
  KeyC: 'sprint', ShiftLeft: 'sprint', ShiftRight: 'sprint',
  KeyV: 'skill',
};

const Input = {
  held: { up: false, down: false, left: false, right: false, pass: false, shoot: false, sprint: false, skill: false },
  justPressed: new Set(),
  justReleased: new Set(),
  axis: { x: 0, y: 0 }, // joystick táctil analógico

  press(a) { if (!this.held[a]) this.justPressed.add(a); this.held[a] = true; },
  release(a) { if (this.held[a]) this.justReleased.add(a); this.held[a] = false; },
  releaseAll() { Object.keys(this.held).forEach((k) => this.release(k)); this.axis.x = this.axis.y = 0; },
  pressed(a) { return this.justPressed.has(a); },
  released(a) { return this.justReleased.has(a); },

  /** Dirección de movimiento normalizada (longitud ≤ 1). */
  dir() {
    let x = (this.held.right ? 1 : 0) - (this.held.left ? 1 : 0) + this.axis.x;
    let y = (this.held.down ? 1 : 0) - (this.held.up ? 1 : 0) + this.axis.y;
    const l = Math.hypot(x, y);
    if (l > 1) { x /= l; y /= l; }
    return { x, y };
  },

  /** Se llama al final de cada frame para limpiar los eventos de un solo frame. */
  endFrame() { this.justPressed.clear(); this.justReleased.clear(); },
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
    const a = KEYMAP[e.code];
    if (a) {
      e.preventDefault();
      Sound.init();
      if (!e.repeat) Input.press(a);
    }
  } else if (e.code === 'Escape') {
    $('#controls-modal').classList.add('hidden');
  }
});
window.addEventListener('keyup', (e) => { const a = KEYMAP[e.code]; if (a) Input.release(a); });
window.addEventListener('blur', () => { Input.releaseAll(); togglePause(true); });
document.addEventListener('visibilitychange', () => { if (document.hidden) { Input.releaseAll(); togglePause(true); } });

/** Joystick virtual y botones para pantallas táctiles. */
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

  $$('#touch-controls [data-act]').forEach((btn) => {
    const a = btn.dataset.act;
    const up = () => { Input.release(a); btn.classList.remove('pressed'); };
    btn.addEventListener('pointerdown', (e) => { e.preventDefault(); Sound.init(); Input.press(a); btn.classList.add('pressed'); });
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('pointerleave', up);
  });
}


/* ==========================================================================
   6. ESTADOS DE LA APLICACIÓN Y PANTALLAS
   --------------------------------------------------------------------------
   Máquina de estados: MENU → MODE → TEAMS → LINEUP → PLAYING → END.
   Dentro de PLAYING, el partido tiene sus propias fases (ver update()).
   ========================================================================== */
const STATES = { MENU: 'menu', MODE: 'mode', TEAMS: 'teams', LINEUP: 'lineup', PLAYING: 'game', END: 'end' };
let appState = STATES.MENU;

/** Selección del usuario a lo largo de los menús. */
const sel = {
  mode: 'f11',
  homeId: 'rma',
  awayId: 'fcb',
  difficulty: 'normal',
  formation: '4-3-3',
  streetFormat: 3,
  duration: MODES.f11.defaultDuration,
  starters: new Set(), // índices de la plantilla del equipo propio
  lineupKey: '',
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
      sel.duration = MODES[sel.mode].defaultDuration;
      updateTeamSelection();
      showScreen(STATES.TEAMS);
      break;
    case 'pick-team':
      if (t.dataset.side === 'home') sel.homeId = t.dataset.team; else sel.awayId = t.dataset.team;
      updateTeamSelection();
      break;
    case 'pick-diff': sel.difficulty = t.dataset.diff; updateTeamSelection(); break;
    case 'go-lineup': enterLineup(); break;
    case 'toggle-player': togglePlayer(Number(t.dataset.index)); break;
    case 'auto-lineup': applyAutoLineup(); renderSquad(); break;
    case 'start': if (!lineupError()) startMatch(); break;
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
function teamStats(t) {
  const xi = t.players.slice(0, 11);
  const avg = (k) => Math.round(xi.reduce((s, p) => s + p[k], 0) / xi.length);
  const vel = avg('vel'), tir = avg('tir'), pas = avg('pas'), def = avg('def');
  return { vel, tir, pas, def, ovr: Math.round((vel + tir + pas + def) / 4) };
}

function buildTeamGrids() {
  for (const side of ['home', 'away']) {
    const grid = $(`#grid-${side}`);
    grid.innerHTML = '';
    for (const t of TEAMS) {
      const st = teamStats(t);
      const b = makeEl('button', 'team-card');
      b.type = 'button';
      b.dataset.action = 'pick-team';
      b.dataset.side = side;
      b.dataset.team = t.id;
      b.setAttribute('aria-pressed', 'false');
      b.style.setProperty('--c1', t.kit.primary);
      b.style.setProperty('--c2', t.kit.secondary);
      b.style.setProperty('--ct', t.kit.text);
      const bar = (label, v) => `<span class="tbar"><em>${label}</em><i style="--v:${v}%"></i><b>${v}</b></span>`;
      b.innerHTML = `
        <span class="badge">${t.short}</span>
        <span class="team-info"><span class="team-name">${t.name}</span><span class="team-ovr">Media ${st.ovr}</span></span>
        <span class="team-bars">${bar('VEL', st.vel)}${bar('TIR', st.tir)}${bar('PAS', st.pas)}</span>`;
      grid.appendChild(b);
    }
  }
}

function updateTeamSelection() {
  $$('#grid-home .team-card').forEach((c) => { const on = c.dataset.team === sel.homeId; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); });
  $$('#grid-away .team-card').forEach((c) => { const on = c.dataset.team === sel.awayId; c.classList.toggle('selected', on); c.setAttribute('aria-pressed', on); });
  $$('[data-action="pick-diff"]').forEach((b) => b.classList.toggle('active', b.dataset.diff === sel.difficulty));
  $('#teams-mode-label').textContent = MODES[sel.mode].name;
  const h = teamById(sel.homeId), a = teamById(sel.awayId);
  $('#matchup').innerHTML = `<b>${h.name}</b> vs <b>${a.name}</b> · IA ${DIFFICULTY[sel.difficulty].label}`;
}

/* ---------- Pantalla de alineación ---------- */
function lineupSpec() {
  if (sel.mode === 'f11') return { size: 11, hasGK: true, slots: FORMATIONS[sel.formation].slots };
  const f = STREET_FORMATS[sel.streetFormat];
  return { size: f.size, hasGK: f.hasGK, slots: f.slots };
}

/** Elige titulares automáticamente: el once base en F11 o los mejores en calle. */
function autoLineup(team, spec, modeId) {
  const idx = team.players.map((_, i) => i);
  if (modeId === 'f11') return idx.slice(0, 11);
  const rating = (p) => (p.vel * 1.2 + p.tir + p.pas + p.def * 0.6) / 3.8;
  const outfield = idx.filter((i) => team.players[i].pos !== 'POR')
    .sort((a, b) => rating(team.players[b]) - rating(team.players[a]));
  if (spec.hasGK) {
    const gk = idx.find((i) => team.players[i].pos === 'POR');
    return [gk, ...outfield.slice(0, spec.size - 1)];
  }
  // 3v3: garantizamos al menos un defensa para cubrir la portería sin portero
  const best = outfield.slice(0, spec.size);
  if (!best.some((i) => team.players[i].pos === 'DEF')) {
    const d = outfield.find((i) => team.players[i].pos === 'DEF');
    if (d !== undefined) best[best.length - 1] = d;
  }
  return best;
}

/** Ordena los titulares por demarcación para asignarlos a las posiciones de la formación. */
function orderedStarters(team, indices, spec) {
  const order = { POR: spec.hasGK ? 0 : 4, DEF: 1, MED: 2, DEL: 3 };
  return indices
    .map((i) => ({ p: team.players[i], i }))
    .sort((a, b) => order[a.p.pos] - order[b.p.pos] || a.i - b.i)
    .map((o) => o.p);
}

function applyAutoLineup() {
  sel.starters = new Set(autoLineup(teamById(sel.homeId), lineupSpec(), sel.mode));
}

function lineupError() {
  const spec = lineupSpec(), team = teamById(sel.homeId);
  const n = sel.starters.size;
  if (n !== spec.size) return `Debes elegir ${spec.size} titulares (llevas ${n}).`;
  const gks = [...sel.starters].filter((i) => team.players[i].pos === 'POR').length;
  if (spec.hasGK && gks !== 1) return 'La alineación necesita exactamente 1 portero (POR).';
  return '';
}

function enterLineup() {
  const mode = MODES[sel.mode];
  const fSel = $('#sel-formation');
  fSel.innerHTML = '';
  if (sel.mode === 'f11') {
    $('#lbl-formation').textContent = 'Formación';
    Object.keys(FORMATIONS).forEach((k) => fSel.add(new Option(FORMATIONS[k].label, k)));
    fSel.value = sel.formation;
  } else {
    $('#lbl-formation').textContent = 'Formato';
    Object.keys(STREET_FORMATS).forEach((k) => fSel.add(new Option(STREET_FORMATS[k].label, k)));
    fSel.value = String(sel.streetFormat);
  }
  const dSel = $('#sel-duration');
  dSel.innerHTML = '';
  mode.durations.forEach((d) => dSel.add(new Option(d.label, d.v)));
  if (!mode.durations.some((d) => d.v === sel.duration)) sel.duration = mode.defaultDuration;
  dSel.value = String(sel.duration);

  // Solo se recalcula la alineación si cambió el equipo, el modo o el formato
  const key = `${sel.homeId}|${sel.mode}|${sel.streetFormat}`;
  if (key !== sel.lineupKey) { sel.lineupKey = key; applyAutoLineup(); }

  $('#lineup-team-label').textContent = teamById(sel.homeId).name;
  renderSquad();
  showScreen(STATES.LINEUP);
}

$('#sel-formation').addEventListener('change', (e) => {
  if (sel.mode === 'f11') sel.formation = e.target.value;
  else {
    sel.streetFormat = Number(e.target.value);
    sel.lineupKey = `${sel.homeId}|${sel.mode}|${sel.streetFormat}`;
    applyAutoLineup();
  }
  renderSquad();
});
$('#sel-duration').addEventListener('change', (e) => { sel.duration = Number(e.target.value); });

function togglePlayer(i) {
  const spec = lineupSpec();
  if (sel.starters.has(i)) sel.starters.delete(i);
  else if (sel.starters.size < spec.size) sel.starters.add(i);
  else { $('#lineup-error').textContent = `Ya tienes ${spec.size} titulares: quita uno antes.`; return; }
  renderSquad();
}

function renderSquad() {
  const team = teamById(sel.homeId), spec = lineupSpec();
  const list = $('#squad-list');
  list.innerHTML = '';
  team.players.forEach((p, i) => {
    const on = sel.starters.has(i);
    const row = makeEl('button', `squad-row${on ? ' starter' : ''}`);
    row.type = 'button';
    row.setAttribute('aria-pressed', on);
    row.dataset.action = 'toggle-player';
    row.dataset.index = i;
    const stat = (l, v) => `<span>${l}<b>${v}</b></span>`;
    row.innerHTML = `
      <span class="sq-num">${p.num}</span>
      <span class="sq-name">${p.name}</span>
      <span class="sq-pos pos-${p.pos}">${p.pos}</span>
      <span class="sq-stats">${stat('VEL', p.vel)}${stat('TIR', p.tir)}${stat('PAS', p.pas)}${stat(p.pos === 'POR' ? 'PAR' : 'DEF', p.def)}</span>
      <span class="sq-check">${on ? '✓' : ''}</span>`;
    list.appendChild(row);
  });
  const count = $('#lineup-count');
  count.textContent = `Titulares: ${sel.starters.size}/${spec.size}`;
  count.classList.toggle('ok', sel.starters.size === spec.size);
  const err = lineupError();
  $('#lineup-error').textContent = err;
  $('#btn-start').disabled = !!err;
  drawLineupPreview();
}

/** Mini-campo con la formación y los nombres de los titulares. */
function drawLineupPreview() {
  const cv = $('#preview-canvas'), x = cv.getContext('2d'), W = cv.width, H = cv.height;
  const spec = lineupSpec(), team = teamById(sel.homeId), street = sel.mode === 'street';
  const roster = orderedStarters(team, [...sel.starters], spec);
  const pad = 16, fw = W - pad * 2, fh = H - pad * 2;
  const span = street ? 0.62 : 0.7; // fracción del campo mostrada desde la portería propia

  x.clearRect(0, 0, W, H);
  if (street) { x.fillStyle = '#25272e'; x.fillRect(0, 0, W, H); }
  else for (let i = 0; i < 10; i++) { x.fillStyle = i % 2 ? '#2f8a43' : '#287a3a'; x.fillRect(0, (i * H) / 10, W, H / 10 + 1); }

  const line = street ? '#00f0ff' : 'rgba(255,255,255,0.85)';
  x.save();
  x.strokeStyle = line; x.lineWidth = 2;
  if (street) { x.shadowColor = line; x.shadowBlur = 8; }
  x.strokeRect(pad, pad, fw, fh);
  const halfY = H - pad - (0.5 / span) * fh;
  x.beginPath(); x.moveTo(pad, halfY); x.lineTo(W - pad, halfY); x.stroke();
  x.beginPath(); x.arc(W / 2, halfY, fw * 0.16, 0, TAU); x.stroke();
  const aw = fw * 0.6, ah = fh * 0.15;
  x.strokeRect(W / 2 - aw / 2, H - pad - ah, aw, ah);
  x.restore();

  x.textAlign = 'center'; x.textBaseline = 'middle';
  spec.slots.forEach((s, i) => {
    const px = pad + s.y * fw, py = H - pad - (s.x / span) * fh;
    const p = roster[i];
    x.beginPath(); x.arc(px, py, 13, 0, TAU);
    if (p) {
      const isGK = s.role === 'GK';
      x.fillStyle = isGK ? team.gk : team.kit.primary; x.fill();
      x.lineWidth = 2.5; x.strokeStyle = isGK ? '#111' : team.kit.secondary; x.stroke();
      x.fillStyle = isGK ? '#111' : team.kit.text;
      x.font = '700 11px Rubik, sans-serif';
      x.fillText(p.num, px, py + 0.5);
      x.font = '600 11px Rubik, sans-serif';
      x.lineWidth = 3; x.strokeStyle = 'rgba(0,0,0,0.75)';
      x.strokeText(p.short, px, py + 23);
      x.fillStyle = '#fff'; x.fillText(p.short, px, py + 23);
    } else {
      x.setLineDash([4, 3]); x.strokeStyle = 'rgba(255,255,255,0.7)'; x.lineWidth = 2; x.stroke(); x.setLineDash([]);
      x.fillStyle = 'rgba(255,255,255,0.85)'; x.font = '700 12px Rubik, sans-serif'; x.fillText('?', px, py + 1);
    }
  });
}


/* ==========================================================================
   7. CREACIÓN DEL PARTIDO
   ========================================================================== */
const canvas = $('#game-canvas');
const ctx = canvas.getContext('2d');
const VIEW_W = canvas.width, VIEW_H = canvas.height; // resolución lógica 1280×720
let game = null;

/**
 * Geometría del terreno de juego. En F11 usamos 15 px por metro
 * (campo de 105 × 68 m). En calle, la cancha se centra en la vista.
 */
function buildPitch(mode, format) {
  if (mode.id === 'f11') {
    const S = 15, L = 105 * S, W = 68 * S, M = 80;
    return {
      left: M, top: M, right: M + L, bottom: M + W, width: L, height: W,
      cx: M + L / 2, cy: M + W / 2, worldW: L + 2 * M, worldH: W + 2 * M,
      goalW: 7.32 * S, goalDepth: 30, crossbar: 34, postR: 3.5,
      areaDepth: 16.5 * S, areaH: 40.32 * S, smallDepth: 5.5 * S, smallH: 18.32 * S,
      circleR: 9.15 * S, penSpot: 11 * S, gkReach: 16, gkOut: 55, shootRange: mode.shootRange,
    };
  }
  const L = format.court.L, W = format.court.W;
  const MX = Math.max(70, (VIEW_W - L) / 2), MY = Math.max(50, (VIEW_H - W) / 2);
  return {
    left: MX, top: MY, right: MX + L, bottom: MY + W, width: L, height: W,
    cx: MX + L / 2, cy: MY + W / 2, worldW: L + 2 * MX, worldH: W + 2 * MY,
    goalW: format.goalW, goalDepth: 34, crossbar: format.crossbar, postR: 5,
    areaDepth: format.areaDepth, areaH: format.goalW + 150, circleR: 70,
    gkReach: 14, gkOut: 36, shootRange: format.shootRange,
  };
}

function startMatch() {
  const mode = MODES[sel.mode];
  const format = sel.mode === 'street' ? STREET_FORMATS[sel.streetFormat] : null;
  const homeData = teamById(sel.homeId), awayData = teamById(sel.awayId);
  const homeSpec = lineupSpec();
  const awaySpec = sel.mode === 'f11'
    ? { size: 11, hasGK: true, slots: FORMATIONS[awayData.formation].slots }
    : homeSpec;
  const pitch = buildPitch(mode, format);

  game = {
    mode, format, pitch,
    difficulty: DIFFICULTY[sel.difficulty],
    formationLabel: sel.mode === 'f11' ? FORMATIONS[sel.formation].label : format.label,
    time: 0,          // segundos reales de juego transcurridos
    clock: 0,         // reloj interno para animaciones
    duration: sel.duration,
    half: 1, goldenGoal: false,
    phase: 'kickoff', phaseTimer: 0, paused: false,
    endAfterGoal: false, nextKickoff: 0, firstKickoff: 0,
    ball: {
      x: pitch.cx, y: pitch.cy, z: 0, vx: 0, vy: 0, vz: 0, r: mode.ballR,
      owner: null, lastTouch: null, kickType: null, isShot: false, shotTeam: null,
      fire: false, passFrom: null, passTarget: null, spin: 0, hopT: 0,
    },
    teams: [], controlled: null,
    charging: false, power: 0, looseTimer: 0,
    particles: [], floaters: [], cam: { x: 0, y: 0 }, shake: 0,
    scorers: [], possession: [0, 0],
  };

  // Si las camisetas se parecen demasiado (o es el mismo equipo), el rival usa la segunda equipación
  let awayKit = awayData.kit;
  if (homeData.id === awayData.id || colorDist(homeData.kit.primary, awayData.kit.primary) < 120) awayKit = awayData.kit2;

  game.teams.push(createTeam(homeData, homeData.kit, orderedStarters(homeData, [...sel.starters], homeSpec), homeSpec.slots, 1, true, 0));
  game.teams.push(createTeam(awayData, awayKit, orderedStarters(awayData, autoLineup(awayData, awaySpec, sel.mode), awaySpec), awaySpec.slots, -1, false, 1));

  // El campo es estático: se dibuja una sola vez en un canvas fuera de pantalla
  game.bg = mode.walls ? renderStreetBackground(pitch, format) : renderF11Background(pitch);

  setupHUD();
  $('#pause-overlay').classList.add('hidden');
  Input.releaseAll();
  if (document.activeElement) document.activeElement.blur();
  showScreen(STATES.PLAYING);
  kickoff(0, '¡A jugar!', `${homeData.name} vs ${awayData.name}`);
  snapCamera();
}

function createTeam(data, kit, roster, slots, dir, isHuman, index) {
  const team = {
    data, kit, dir, isHuman, index,
    score: 0, style: 0, fireReady: false, chaser: null, players: [],
    stats: { shots: 0, onTarget: 0, passes: 0, passesOk: 0, tackles: 0 },
  };
  team.players = roster.map((pd, i) => createPlayer(pd, slots[i], team, i));
  return team;
}

function createPlayer(pd, slot, team, idx) {
  const isGK = slot.role === 'GK';
  return {
    name: pd.name, short: pd.short, num: pd.num, pos: pd.pos,
    attrs: { vel: pd.vel, tir: pd.tir, pas: pd.pas, def: pd.def },
    team, slot, idx, role: slot.role, isGK,
    kit: isGK ? { primary: team.data.gk, secondary: '#1a1a1a', text: '#111111' } : team.kit,
    r: game.mode.playerR,
    x: 0, y: 0, vx: 0, vy: 0, facing: 0, stamina: 1, sprinting: false,
    kickCd: 0, tackleCd: 0, stun: 0, skillT: 0, skillCd: 0, skillDir: { x: 1, y: 0 },
    diveT: 0, diveAng: 0, slideT: 0, restartLock: false, aiTimer: 0, aiDir: null, trail: [],
  };
}

/* ---------- Conversión de coordenadas según el sentido de ataque ---------- */
function toWorld(team, nx, ny) {
  const P = game.pitch;
  return { x: team.dir === 1 ? P.left + nx * P.width : P.right - nx * P.width, y: P.top + ny * P.height };
}
function toNorm(team, x, y) {
  const P = game.pitch;
  return { x: team.dir === 1 ? (x - P.left) / P.width : (P.right - x) / P.width, y: (y - P.top) / P.height };
}
function oppGoal(team) { const P = game.pitch; return { x: team.dir === 1 ? P.right : P.left, y: P.cy }; }
function ownGoal(team) { const P = game.pitch; return { x: team.dir === 1 ? P.left : P.right, y: P.cy }; }
function otherTeam(team) { return game.teams[1 - team.index]; }

/** Área del portero de un equipo (área grande en F11, zona del portero en 5v5). */
function areaRect(team) {
  const P = game.pitch, w = P.areaDepth || 0;
  const x0 = team.dir === 1 ? P.left : P.right - w;
  return { x0, x1: x0 + w, y0: P.cy - P.areaH / 2, y1: P.cy + P.areaH / 2 };
}
function inArea(team, x, y) {
  if (!game.pitch.areaDepth) return false;
  const a = areaRect(team);
  return x >= a.x0 && x <= a.x1 && y >= a.y0 && y <= a.y1;
}

function closestPlayer(team, x, y, excludeGK) {
  let best = null, bd = Infinity;
  for (const p of team.players) {
    if (excludeGK && p.isGK) continue;
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < bd) { bd = d; best = p; }
  }
  return best;
}
function nearestOpponent(p) {
  let best = null, bd = Infinity;
  for (const o of otherTeam(p.team).players) {
    const d = dist(p, o);
    if (d < bd) { bd = d; best = o; }
  }
  return best ? { p: best, d: bd } : null;
}
function nearestOpponentTo(team, x, y, maxD) {
  let best = null, bd = maxD;
  for (const o of otherTeam(team).players) {
    if (o.isGK) continue;
    const d = Math.hypot(o.x - x, o.y - y);
    if (d < bd) { bd = d; best = o; }
  }
  return best;
}

function resetPlayerTimers(p) {
  p.kickCd = p.tackleCd = p.stun = p.skillT = p.diveT = p.slideT = 0;
  p.restartLock = false;
  p.aiTimer = 0;
  p.aiDir = null;
  p.trail.length = 0;
}

/** Coloca a los equipos en su campo y entrega el balón al equipo que saca. */
function kickoff(teamIndex, title, subtitle) {
  const g = game, P = g.pitch, b = g.ball;
  g.phase = 'kickoff';
  g.phaseTimer = 1.4;
  g.charging = false; g.power = 0; g.endAfterGoal = false;

  for (const team of g.teams) {
    for (const p of team.players) {
      const w = toWorld(team, Math.min(p.slot.x * 0.9, 0.44), p.slot.y);
      p.x = w.x; p.y = w.y;
      // Nadie dentro del círculo central salvo el que saca
      const dx = p.x - P.cx, dy = p.y - P.cy, d = Math.hypot(dx, dy), minR = P.circleR + 14;
      if (!p.isGK && d < minR) {
        const n = d > 1 ? { x: dx / d, y: dy / d } : { x: -team.dir, y: 0 };
        p.x = P.cx + n.x * minR; p.y = P.cy + n.y * minR;
      }
      p.vx = p.vy = 0;
      p.facing = team.dir === 1 ? 0 : Math.PI;
      resetPlayerTimers(p);
    }
  }

  Object.assign(b, { x: P.cx, y: P.cy, z: 0, vx: 0, vy: 0, vz: 0, owner: null, isShot: false, fire: false, passFrom: null, hopT: 0 });

  const team = g.teams[teamIndex];
  const attackers = team.players.filter((p) => !p.isGK).sort((a, c) => c.slot.x - a.slot.x);
  const taker = attackers[0];
  taker.x = P.cx - team.dir * (taker.r + b.r + 2);
  taker.y = P.cy;
  // Un compañero cerca para recibir el primer pase
  if (attackers[1]) { attackers[1].x = P.cx - team.dir * 45; attackers[1].y = P.cy + 75; }

  setOwner(taker, true);
  taker.restartLock = g.mode.kickoffLock;
  taker.aiTimer = 0.4;
  g.controlled = team.isHuman ? taker : closestPlayer(g.teams[0], P.cx, P.cy, true);

  if (title) showBanner(title, subtitle || '', '', 1600);
  else if (team.isHuman && taker.restartLock) showBanner('Saque inicial', 'Pulsa Z / Espacio para sacar', 'small', 1400);
}


/* ==========================================================================
   8. GAME LOOP
   --------------------------------------------------------------------------
   Fases del partido:
   kickoff → play ⇄ restart (fueras) → goal → kickoff ... → halftime → fulltime
   ========================================================================== */
let lastTs = performance.now();

function loop(ts) {
  const dt = Math.min(0.05, Math.max(0, (ts - lastTs) / 1000)); // dt limitado para evitar saltos
  lastTs = ts;
  if (appState === STATES.PLAYING && game) {
    if (!game.paused) update(dt);
    render();
  }
  Input.endFrame();
  requestAnimationFrame(loop);
}

function update(dt) {
  const g = game;
  g.clock += dt;

  switch (g.phase) {
    case 'kickoff': // jugadores congelados hasta el pitido
      g.phaseTimer -= dt;
      stickBall(dt);
      if (g.phaseTimer <= 0) { g.phase = 'play'; Sound.whistle(false); }
      break;

    case 'play':
      tickClock(dt);
      handleHuman(dt);
      updatePlayers(dt);
      updateBall(dt);
      if (g.ball.owner) g.possession[g.ball.owner.team.index] += dt;
      break;

    case 'restart': // breve pausa mientras se coloca un saque
      tickClock(dt);
      updatePlayers(dt);
      stickBall(dt);
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) g.phase = 'play';
      break;

    case 'goal': // celebración: el balón sigue dentro de la red
      updatePlayers(dt);
      updateBall(dt);
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) {
        if (g.endAfterGoal) startFulltime();
        else kickoff(g.nextKickoff);
      }
      break;

    case 'halftime':
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) {
        g.half = 2;
        g.teams.forEach((t) => t.players.forEach((p) => { p.stamina = 1; }));
        kickoff(1 - g.firstKickoff, 'Segundo tiempo');
      }
      break;

    case 'fulltime':
      g.phaseTimer -= dt;
      if (g.phaseTimer <= 0) endMatch();
      break;
  }

  updateEffects(dt);
  updateCamera(dt);
  updateHUD();
}

/** Reloj del partido: dos tiempos en F11, cuenta atrás + gol de oro en calle. */
function tickClock(dt) {
  const g = game;
  g.time += dt;
  if (g.mode.id === 'f11') {
    const minute = (g.time / g.duration) * 90;
    if (g.half === 1 && minute >= 45) startHalftime();
    else if (g.half === 2 && minute >= 90) startFulltime();
  } else if (!g.goldenGoal && g.time >= g.duration) {
    const [h, a] = g.teams;
    if (h.score === a.score) {
      g.goldenGoal = true;
      showBanner('¡GOL DE ORO!', 'El próximo gol gana', 'big', 2200);
      Sound.whistle(true);
    } else startFulltime();
  }
}

function startHalftime() {
  const g = game, [h, a] = g.teams;
  g.phase = 'halftime';
  g.phaseTimer = 3.2;
  g.time = g.duration / 2;
  g.charging = false;
  showBanner('DESCANSO', `${h.data.short} ${h.score} - ${a.score} ${a.data.short}`, 'big', 3000);
  Sound.whistle(true);
}

function startFulltime() {
  const g = game, [h, a] = g.teams;
  if (g.phase === 'fulltime') return;
  g.phase = 'fulltime';
  g.phaseTimer = 2.8;
  g.charging = false;
  showBanner('¡FINAL!', `${h.data.short} ${h.score} - ${a.score} ${a.data.short}`, 'big', 2600);
  Sound.whistle(true);
}

/** Lee las acciones del jugador humano (pase, tiro, entrada, cambio, truco). */
function handleHuman(dt) {
  const g = game, b = g.ball, p = g.controlled;
  if (!p) return;
  const inp = Input.dir();

  if (b.owner === p) {
    g.looseTimer = 0;
    if (Input.pressed('pass')) { humanPass(p, inp); return; }
    if (Input.pressed('shoot')) { g.charging = true; g.power = 0; }
    if (g.charging) {
      g.power = Math.min(1, g.power + dt / 0.8);
      if (!Input.held.shoot) { // al soltar X se dispara con la potencia cargada
        shoot(p, Math.max(0.2, g.power), Math.abs(inp.y) > 0.3 ? clamp(inp.y, -1, 1) : null, 1);
        g.charging = false; g.power = 0;
        return;
      }
    }
    if (Input.pressed('skill') && g.mode.id === 'street') doSkill(p, inp);
  } else {
    g.charging = false; g.power = 0;
    if (Input.pressed('pass')) switchPlayer();
    if (Input.pressed('shoot')) humanTackle(p);
    // Cambio automático si el balón suelto queda mucho más cerca de otro compañero
    if (!b.owner) {
      g.looseTimer += dt;
      if (g.looseTimer > 0.8) {
        g.looseTimer = 0;
        const c = closestPlayer(g.teams[0], b.x, b.y, true);
        if (c && c !== p && dist(c, b) < dist(p, b) * 0.6) g.controlled = c;
      }
    } else g.looseTimer = 0;
  }
}

function switchPlayer() {
  const g = game, b = g.ball;
  const c = g.teams[0].players
    .filter((p) => !p.isGK && p !== g.controlled)
    .sort((a, d) => dist(a, b) - dist(d, b))[0];
  if (c) g.controlled = c;
}

/** Movimiento de todos los jugadores: humano (teclado) o IA. */
function updatePlayers(dt) {
  const g = game, b = g.ball;
  computeChasers();
  for (const team of g.teams) {
    for (const p of team.players) {
      p.kickCd -= dt; p.tackleCd -= dt; p.stun -= dt; p.skillT -= dt; p.skillCd -= dt; p.diveT -= dt; p.slideT -= dt;

      let dir, sprint;
      if (p === g.controlled) { dir = Input.dir(); sprint = Input.held.sprint; }
      else { const a = aiThink(p, dt); dir = a.dir; sprint = a.sprint; }

      // En los saques el lanzador no puede moverse, solo orientarse
      if (p.restartLock && b.owner === p) {
        if (p === g.controlled && Math.hypot(dir.x, dir.y) > 0.3) {
          p.facing = lerpAngle(p.facing, Math.atan2(dir.y, dir.x), Math.min(1, dt * 8));
        }
        dir = ZERO; sprint = false;
      }
      if (p.skillT > 0) dir = p.skillDir;
      movePlayer(p, dir, sprint, dt);
    }
  }
  resolveCollisions();
}

function playerMaxSpeed(p, sprint) {
  const g = game, m = g.mode;
  let s = m.baseSpeed + p.attrs.vel * m.speedK;
  if (p.team.index === 1) s *= g.difficulty.speedMul;
  if (sprint) s *= m.sprintMul;
  if (g.ball.owner === p) s *= 0.9;   // con balón se corre un poco menos
  if (p.skillT > 0) s *= 1.55;        // arrancada del truco callejero
  if (p.stun > 0) s *= 0.3;           // tras perder un duelo
  return s;
}

function movePlayer(p, dir, sprint, dt) {
  const g = game, m = g.mode;
  const moving = Math.hypot(dir.x, dir.y) > 0.05;
  const canSprint = sprint && moving && p.stamina > 0.05;
  p.stamina = canSprint ? Math.max(0, p.stamina - dt * 0.2) : Math.min(1, p.stamina + dt * 0.09);
  p.sprinting = canSprint;

  // Aceleración suave hacia la velocidad deseada (inercia)
  const max = playerMaxSpeed(p, canSprint);
  const a = Math.min(1, (p.skillT > 0 ? 20 : m.accel) * dt);
  p.vx += (dir.x * max - p.vx) * a;
  p.vy += (dir.y * max - p.vy) * a;
  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (moving) p.facing = lerpAngle(p.facing, Math.atan2(dir.y, dir.x), Math.min(1, dt * (p === g.controlled ? 18 : 10)));
  else if (g.ball.owner !== p) p.facing = lerpAngle(p.facing, Math.atan2(g.ball.y - p.y, g.ball.x - p.x), Math.min(1, dt * 5));

  clampPlayer(p);
  if (p.skillT > 0) p.trail.push({ x: p.x, y: p.y, life: 0.25 });
}

function clampPlayer(p) {
  const P = game.pitch;
  if (game.mode.walls) {
    p.x = clamp(p.x, P.left + p.r, P.right - p.r);
    p.y = clamp(p.y, P.top + p.r, P.bottom - p.r);
  } else {
    p.x = clamp(p.x, P.left - 28, P.right + 28);
    p.y = clamp(p.y, P.top - 28, P.bottom + 28);
  }
  if (p.isGK && P.areaDepth) { // el portero no sale de su área
    const a = areaRect(p.team);
    p.x = clamp(p.x, a.x0, a.x1);
    p.y = clamp(p.y, a.y0, a.y1);
  }
}

/** Separación de jugadores que se solapan (colisión círculo-círculo). */
function resolveCollisions() {
  const all = game.teams[0].players.concat(game.teams[1].players);
  for (let i = 0; i < all.length; i++) {
    for (let j = i + 1; j < all.length; j++) {
      const a = all[i], c = all[j];
      // En calle, quien hace un truco atraviesa al rival
      if (a.team !== c.team && (a.skillT > 0 || c.skillT > 0)) continue;
      const dx = c.x - a.x, dy = c.y - a.y, min = a.r + c.r, d2 = dx * dx + dy * dy;
      if (d2 < min * min && d2 > 0.0001) {
        const d = Math.sqrt(d2), o = (min - d) / 2, nx = dx / d, ny = dy / d;
        a.x -= nx * o; a.y -= ny * o;
        c.x += nx * o; c.y += ny * o;
      }
    }
  }
  all.forEach(clampPlayer);
}


/* ==========================================================================
   9. FÍSICA DEL BALÓN, GOLES, FUERAS Y SAQUES
   ========================================================================== */

/** Balón controlado: se mantiene pegado delante del pie del poseedor. */
function stickBall(dt) {
  const g = game, b = g.ball, o = b.owner;
  if (!o) return;
  const off = o.r + b.r + g.mode.dribbleOffset + (o.sprinting ? 5 : 0);
  const tx = o.x + Math.cos(o.facing) * off, ty = o.y + Math.sin(o.facing) * off;
  const k = Math.min(1, dt * 24);
  b.x += (tx - b.x) * k;
  b.y += (ty - b.y) * k;
  b.vx = o.vx; b.vy = o.vy; b.vz = 0;
  b.z = b.hopT > 0 ? Math.sin(Math.PI * (1 - b.hopT / 0.42)) * 16 : 0; // "sombrerito" visual
  b.spin += Math.hypot(o.vx, o.vy) * dt * 0.08;
  if (g.mode.walls) {
    const P = g.pitch;
    b.y = clamp(b.y, P.top + b.r, P.bottom - b.r);
    if (Math.abs(b.y - P.cy) > P.goalW / 2) b.x = clamp(b.x, P.left + b.r, P.right - b.r);
  }
}

function updateBall(dt) {
  const g = game, b = g.ball, m = g.mode;
  b.hopT = Math.max(0, b.hopT - dt);

  if (b.owner) {
    stickBall(dt);
    if (g.phase === 'play' && !b.owner.restartLock) checkBounds();
    return;
  }

  // Sub-pasos para que un tiro rápido no atraviese jugadores ni postes
  const SUB = 3, h = dt / SUB;
  for (let s = 0; s < SUB; s++) {
    b.x += b.vx * h;
    b.y += b.vy * h;
    if (b.z > 0 || b.vz > 0) {
      b.z += b.vz * h;
      b.vz -= m.gravity * h;
      if (b.z <= 0) { // bote: el balón pierde parte de su velocidad al tocar el suelo
        b.z = 0;
        if (b.vz < -90) { b.vz = -b.vz * m.bounce; b.vx *= 0.75; b.vy *= 0.75; }
        else b.vz = 0;
      }
    }
    // Rozamiento: mucho mayor en el suelo que en el aire
    const damp = Math.pow(b.z > 0.5 ? m.airDrag : m.ballFriction, h);
    b.vx *= damp; b.vy *= damp;
    if (Math.hypot(b.vx, b.vy) < 4) { b.vx = 0; b.vy = 0; }
    b.spin += Math.hypot(b.vx, b.vy) * h * 0.08;

    if (g.phase === 'goal') { confineNet(); continue; }
    collidePosts();
    if (checkBounds()) return;
    checkBallContacts();
    if (b.owner) return;
  }
}

/** Devuelve true si hubo gol o fuera (cambio de fase). */
function checkBounds() {
  const g = game, b = g.ball, P = g.pitch, halfG = P.goalW / 2;

  if (g.mode.walls) {
    // Calle: las bandas y los fondos son paredes que devuelven el balón
    const rest = g.mode.wallRest;
    if (b.y - b.r < P.top) { b.y = P.top + b.r; if (b.vy < 0) { b.vy = -b.vy * rest; wallHit(b.x, P.top); } }
    else if (b.y + b.r > P.bottom) { b.y = P.bottom - b.r; if (b.vy > 0) { b.vy = -b.vy * rest; wallHit(b.x, P.bottom); } }
    const inMouth = Math.abs(b.y - P.cy) < halfG - b.r * 0.5 && b.z < P.crossbar;
    if (b.x - b.r < P.left) {
      if (inMouth) { if (b.x < P.left - b.r) { onGoal(teamAttacking('left')); return true; } }
      else { b.x = P.left + b.r; if (b.vx < 0) { b.vx = -b.vx * rest; wallHit(P.left, b.y); } }
    } else if (b.x + b.r > P.right) {
      if (inMouth) { if (b.x > P.right + b.r) { onGoal(teamAttacking('right')); return true; } }
      else { b.x = P.right - b.r; if (b.vx > 0) { b.vx = -b.vx * rest; wallHit(P.right, b.y); } }
    }
    return false;
  }

  // Fútbol 11: línea de gol (gol o fuera de fondo) y líneas de banda
  if (b.x < P.left - b.r || b.x > P.right + b.r) {
    const side = b.x < P.left ? 'left' : 'right';
    if (Math.abs(b.y - P.cy) < halfG && b.z < P.crossbar) { onGoal(teamAttacking(side)); return true; }
    goalLineOut(side);
    return true;
  }
  if (b.y < P.top - b.r || b.y > P.bottom + b.r) { throwIn(); return true; }
  return false;
}

/** La portería izquierda la defiende el equipo con dir = +1, así que la ataca el de dir = -1. */
function teamAttacking(side) { return game.teams.find((t) => t.dir === (side === 'left' ? -1 : 1)); }

function wallHit(x, y) {
  const b = game.ball, sp = Math.hypot(b.vx, b.vy);
  if (sp > 220) {
    Sound.wall();
    spawnParticles(x, y, 8, ['#00f0ff', '#ff2bd6', '#ffffff'], 160, 0.35, 3, 'spark');
  }
}

/** Postes y larguero: rebote del balón. */
function collidePosts() {
  const b = game.ball, P = game.pitch, halfG = P.goalW / 2;
  if (b.z < P.crossbar) {
    const posts = [[P.left, P.cy - halfG], [P.left, P.cy + halfG], [P.right, P.cy - halfG], [P.right, P.cy + halfG]];
    for (const [px, py] of posts) {
      const dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy), min = b.r + P.postR;
      if (d < min && d > 0) {
        const nx = dx / d, ny = dy / d, vn = b.vx * nx + b.vy * ny;
        if (vn < 0) {
          b.vx -= 1.7 * vn * nx;
          b.vy -= 1.7 * vn * ny;
          if (Math.abs(vn) > 250) { addFloater('¡Al palo!', px, py - 22, '#ffffff', 22); Sound.post(); }
        }
        b.x = px + nx * min; b.y = py + ny * min;
      }
    }
  } else if (b.z < P.crossbar + 7 && Math.abs(b.y - P.cy) < halfG) {
    const hitL = b.vx < 0 && b.x < P.left + 4 && b.x > P.left - 6;
    const hitR = b.vx > 0 && b.x > P.right - 4 && b.x < P.right + 6;
    if (hitL || hitR) {
      b.vx = -b.vx * 0.5;
      b.vz = Math.abs(b.vz) * 0.3 + 60;
      addFloater('¡Larguero!', b.x, b.y - 30, '#ffffff', 22);
      Sound.post();
    }
  }
}

/** Tras un gol el balón se queda dentro de la red. */
function confineNet() {
  const b = game.ball, P = game.pitch, halfG = P.goalW / 2;
  const left = b.x < P.cx;
  const back = left ? P.left - P.goalDepth + b.r : P.right + P.goalDepth - b.r;
  if (left ? b.x < back : b.x > back) { b.x = back; b.vx *= -0.25; }
  if (left ? b.x < P.left : b.x > P.right) {
    if (b.y < P.cy - halfG + b.r) { b.y = P.cy - halfG + b.r; b.vy *= -0.3; }
    if (b.y > P.cy + halfG - b.r) { b.y = P.cy + halfG - b.r; b.vy *= -0.3; }
    if (b.z > P.crossbar - b.r) { b.z = P.crossbar - b.r; b.vz = -Math.abs(b.vz) * 0.2; }
    b.vx *= 0.9; b.vy *= 0.9; // la red frena el balón
  }
}

/** Contacto balón-jugador cuando el balón está suelto: control, parada o rechace. */
function checkBallContacts() {
  const g = game, b = g.ball, m = g.mode, P = g.pitch;
  const speed = Math.hypot(b.vx, b.vy);
  let cand = null, cd = Infinity;
  for (const team of g.teams) {
    for (const p of team.players) {
      if (p.kickCd > 0 || p.stun > 0.25) continue;
      // Un pase rápido dirigido a otro compañero no rebota en los jugadores de su equipo
      if (b.passTarget && p.team === b.passTarget.team && p !== b.passTarget && speed >= m.controlSpeed) continue;
      const reach = p.r + b.r + (p.isGK ? P.gkReach : 3);
      const zMax = p.isGK ? P.crossbar + 10 : 22; // los balones altos pasan por encima
      if (b.z > zMax) continue;
      const d = Math.hypot(b.x - p.x, b.y - p.y);
      if (d < reach && d < cd) { cand = p; cd = d; }
    }
  }
  if (!cand) return;
  const p = cand;

  if (p.isGK && b.isShot && b.shotTeam !== p.team) { gkSave(p, speed); return; }

  const ctrl = p.isGK && inArea(p.team, p.x, p.y) ? m.controlSpeed * 1.7 : m.controlSpeed;
  // Balones lentos se controlan siempre; los rápidos dependen del pase (técnica) del jugador
  if (speed < ctrl || Math.random() < (p.attrs.pas / 100) * 0.35 * (ctrl / speed)) setOwner(p);
  else deflect(p, cd);
}

function deflect(p, d) {
  const b = game.ball, speed = Math.hypot(b.vx, b.vy);
  const nx = (b.x - p.x) / (d || 1), ny = (b.y - p.y) / (d || 1);
  const vn = b.vx * nx + b.vy * ny;
  if (vn < 0) { b.vx -= 2 * vn * nx; b.vy -= 2 * vn * ny; }
  b.vx *= 0.45; b.vy *= 0.45;
  b.vz = Math.max(b.vz, 80);
  b.x = p.x + nx * (p.r + b.r + 4);
  b.y = p.y + ny * (p.r + b.r + 4);
  b.lastTouch = p; b.isShot = false; b.passFrom = null; b.passTarget = null; b.kickType = 'touch';
  p.kickCd = 0.2;
  if (speed > 650) addFloater('¡Bloqueo!', p.x, p.y - 26, '#ffffff', 18);
  Sound.tackle();
}

/** Intento de parada: probabilidad según paradas del portero y velocidad del tiro. */
function gkSave(gk, speed) {
  const g = game, b = g.ball, shooterTeam = b.shotTeam;
  const og = ownGoal(gk.team);
  const tLine = b.vx !== 0 ? (og.x - b.x) / b.vx : -1;
  const onTarget = tLine > 0 && Math.abs(b.y + b.vy * tLine - og.y) < g.pitch.goalW / 2;
  b.isShot = false; // una sola oportunidad por tiro

  let chance = 0.3 + gk.attrs.def / 180 - Math.max(0, speed - 600) / 2200;
  if (b.fire) chance -= 0.3;
  if (gk.team.index === 1) chance += g.difficulty.gkBonus;
  chance = clamp(chance, 0.08, 0.92);
  gk.diveT = 0.45;
  gk.diveAng = Math.atan2(b.y - gk.y, b.x - gk.x);

  if (Math.random() < chance) {
    if (onTarget && shooterTeam) shooterTeam.stats.onTarget++;
    if (speed < 850 && !b.fire && Math.random() < 0.6) {
      setOwner(gk);
      addFloater('¡Atajada!', gk.x, gk.y - 28, '#ffffff', 22);
    } else { // despeje con los puños hacia fuera
      const side = b.y >= gk.y ? 1 : -1;
      b.vx = gk.team.dir * rand(160, 320);
      b.vy = side * rand(220, 420);
      b.vz = rand(120, 220);
      b.lastTouch = gk; b.kickType = 'touch'; b.fire = false;
      gk.kickCd = 0.4;
      addFloater('¡Paradón!', gk.x, gk.y - 30, '#ffffff', 24);
      Sound.tackle();
    }
    return true;
  }
  gk.kickCd = 0.6; gk.stun = 0.6; // se lanzó y no llegó
  return false;
}

/** Asigna la posesión del balón a un jugador. */
function setOwner(p, silent = false) {
  const g = game, b = g.ball;
  if (!silent && b.passFrom && b.passFrom.team === p.team && b.passFrom !== p) p.team.stats.passesOk++;
  b.passFrom = null; b.passTarget = null;
  b.owner = p; b.lastTouch = p; b.isShot = false; b.fire = false; b.kickType = 'own';
  b.vz = 0; b.z = 0;
  p.aiTimer = 0.15 + Math.random() * 0.1;
  p.aiDir = null;
  if (p.isGK && inArea(p.team, p.x, p.y)) { p.restartLock = true; p.aiTimer = 0.9; } // el portero retiene y saca
  if (silent) return;
  if (p.team.isHuman) { if (!p.isGK) g.controlled = p; }
  else { const c = closestPlayer(g.teams[0], b.x, b.y, true); if (c) g.controlled = c; }
}

function onGoal(team) {
  const g = game, b = g.ball, P = g.pitch;
  if (g.phase !== 'play') return;
  team.score++;
  const lt = b.lastTouch;
  const own = lt && lt.team !== team;
  if (b.kickType === 'shot' && b.shotTeam === team) team.stats.onTarget++;
  const name = lt ? lt.short + (own ? ' (p.p.)' : '') : '—';
  g.scorers.push({ team: team.index, name, minute: minuteLabel() });

  if (b.owner) { b.vx = b.owner.vx; b.vy = b.owner.vy; b.owner = null; }
  g.phase = 'goal';
  g.phaseTimer = 3;
  g.charging = false;
  g.shake = 1;
  g.nextKickoff = 1 - team.index;
  if (g.mode.id === 'street' && (g.goldenGoal || team.score >= g.mode.goalLimit)) g.endAfterGoal = true;

  showBanner('¡GOOOL!', `${name} · ${team.data.name}`, 'big goal', 2600);
  Sound.goal();
  const gx = team.dir === 1 ? P.right : P.left;
  spawnParticles(gx, P.cy, 90, [team.kit.primary, team.kit.secondary, '#ffffff', '#ffe14d'], 420, 1.6, 5, 'confetti');
}

/** Saque de banda: lo saca el equipo que NO tocó el balón por última vez. */
function throwIn() {
  const g = game, b = g.ball, P = g.pitch;
  const team = b.lastTouch ? otherTeam(b.lastTouch.team) : g.teams[0];
  const y = b.y < P.cy ? P.top + 1 : P.bottom - 1;
  doRestart('throw', team, clamp(b.x, P.left + 20, P.right - 20), y);
}

/** Fuera por la línea de fondo: córner o saque de puerta. */
function goalLineOut(side) {
  const g = game, b = g.ball, P = g.pitch;
  const defending = g.teams.find((t) => t.dir === (side === 'left' ? 1 : -1));
  const attacking = otherTeam(defending);
  const lineX = side === 'left' ? P.left : P.right;
  const inward = side === 'left' ? 1 : -1;
  if (b.lastTouch && b.lastTouch.team === defending) {
    doRestart('corner', attacking, lineX + inward, b.y < P.cy ? P.top + 1 : P.bottom - 1);
  } else {
    doRestart('goalkick', defending, lineX + inward * P.smallDepth, P.cy + (b.y < P.cy ? -1 : 1) * P.smallH * 0.3);
  }
}

/** Prepara cualquier saque a balón parado. */
function doRestart(type, team, x, y) {
  const g = game, b = g.ball, P = g.pitch;
  g.phase = 'restart';
  g.phaseTimer = 1.0;
  g.charging = false;
  Object.assign(b, { x, y, z: 0, vx: 0, vy: 0, vz: 0, owner: null, isShot: false, fire: false, passFrom: null });

  let taker = type === 'goalkick' ? team.players.find((p) => p.isGK) : null;
  if (!taker) taker = closestPlayer(team, x, y, true);

  // Orientación del lanzador: hacia dentro del campo (en banda, con algo de avance)
  const face = type === 'throw' ? norm(team.dir * 0.6, y < P.cy ? 1 : -1) : norm(P.cx - x, P.cy - y);
  const off = taker.r + b.r + g.mode.dribbleOffset;
  taker.x = x - face.x * off;
  taker.y = y - face.y * off;
  taker.vx = taker.vy = 0;
  taker.facing = Math.atan2(face.y, face.x);
  setOwner(taker, true);
  taker.restartLock = true;
  taker.aiTimer = 0.5 + Math.random() * 0.4;
  b.x = x; b.y = y;

  // Los rivales deben guardar distancia
  for (const o of otherTeam(team).players) {
    const d = dist(o, b);
    if (d < 75) {
      const n = d > 0.1 ? norm(o.x - b.x, o.y - b.y) : { x: -team.dir, y: 0 };
      o.x = b.x + n.x * 75; o.y = b.y + n.y * 75;
      clampPlayer(o);
    }
  }
  if (team.isHuman && !taker.isGK) g.controlled = taker;

  const labels = { throw: 'Saque de banda', corner: 'Saque de esquina', goalkick: 'Saque de puerta' };
  showBanner(labels[type], team.data.name, 'small', 1100);
  Sound.whistle(false);
}


/* ==========================================================================
   10. ACCIONES DE JUEGO
   ========================================================================== */

/** Golpeo genérico del balón (pase, tiro o despeje). */
function kickBall(p, vx, vy, vz, type) {
  const b = game.ball;
  b.owner = null;
  b.vx = vx; b.vy = vy; b.vz = vz;
  b.lastTouch = p;
  b.kickType = type;
  b.isShot = type === 'shot';
  b.shotTeam = p.team;
  b.passFrom = type === 'pass' ? p : null;
  b.passTarget = null; // doPass() lo rellena si el pase tiene destinatario
  p.kickCd = 0.28;
  p.restartLock = false;
  if (type === 'shot') p.team.stats.shots++;
  if (type === 'pass') p.team.stats.passes++;
  // El balón sale desde delante del cuerpo para no chocar con el propio lanzador
  const a = Math.atan2(vy, vx);
  b.x = p.x + Math.cos(a) * (p.r + b.r + 2);
  b.y = p.y + Math.sin(a) * (p.r + b.r + 2);
  Sound.kick(type === 'shot');
}

/**
 * Pase hacia un punto. La velocidad se calcula para que el balón llegue
 * con algo de fuerza teniendo en cuenta el rozamiento. Los pases largos van por alto.
 */
function passBall(p, tx, ty, lob = false, accMul = 1) {
  const m = game.mode, k = -Math.log(m.ballFriction);
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy) || 1;
  const ang = Math.atan2(dy, dx) + (1 - p.attrs.pas / 100) * 0.16 * (Math.random() * 2 - 1) * accMul;
  let speed, vz = 0;
  if (lob) {
    const t = clamp(d / 450, 0.6, 1.5);    // tiempo de vuelo: globo alto y "dormido"
    speed = (d * 0.85) / (t * 0.95);       // cae un poco antes del receptor
    vz = 0.5 * m.gravity * t;
  } else {
    speed = clamp(k * d * 1.4 + 90, 240, 1050);
  }
  kickBall(p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz, 'pass');
  p.facing = ang;
}

/** Pase a un compañero anticipando su movimiento. */
function doPass(p, t) {
  const tx = t.x + t.vx * 0.3, ty = t.y + t.vy * 0.3;
  const d = Math.hypot(tx - p.x, ty - p.y);
  passBall(p, tx, ty, d > 420, p.team.index === 1 ? game.difficulty.accuracy : 1);
  game.ball.passTarget = t; // el receptor irá a buscar el balón
}

/** Despeje largo hacia campo rival. */
function clearBall(p) {
  const t = toWorld(p.team, rand(0.6, 0.75), rand(0.2, 0.8));
  passBall(p, t.x, t.y, true);
}

/** El humano pasa al compañero mejor situado en la dirección que indica. */
function humanPass(p, inp) {
  const t = pickPassTarget(p, inp);
  if (t) doPass(p, t);
  else passBall(p, p.x + Math.cos(p.facing) * 220, p.y + Math.sin(p.facing) * 220);
}

function pickPassTarget(p, inp) {
  const useInput = Math.hypot(inp.x, inp.y) > 0.2;
  const ang = useInput ? Math.atan2(inp.y, inp.x) : p.facing;
  let best = null, bs = Infinity, fallback = null, fa = Infinity;
  for (const t of p.team.players) {
    if (t === p) continue;
    const dx = t.x - p.x, dy = t.y - p.y, d = Math.hypot(dx, dy);
    if (d < 30 || d > game.mode.maxPassDist * 1.2) continue;
    const ad = Math.abs(angleDiff(ang, Math.atan2(dy, dx)));
    if (ad < fa) { fa = ad; fallback = t; }
    if (ad < 0.85) { // dentro del cono de visión: preferimos cercanos y bien alineados
      const s = d * (1 + ad * 2.2) + (t.isGK ? 250 : 0);
      if (s < bs) { bs = s; best = t; }
    }
  }
  return best || fallback;
}

/**
 * Tiro a portería.
 * @param power 0.2–1 (carga del botón)
 * @param aimY  -1 (palo superior) … 1 (palo inferior) o null = palo largo
 * Más potencia = más velocidad, pero un mal tirador eleva el balón por encima del larguero.
 */
function shoot(p, power, aimY, accMul = 1) {
  const g = game, m = g.mode, P = g.pitch, team = p.team, goal = oppGoal(team);
  power = clamp(power, 0.2, 1);
  const fire = m.id === 'street' && team.style >= 100;
  if (aimY == null) aimY = (p.y < P.cy ? 1 : -1) * 0.55;
  const ty = goal.y + aimY * P.goalW * 0.42;

  const d = Math.hypot(goal.x - p.x, ty - p.y);
  // Error angular: peor tirador, más potencia y más distancia = menos precisión
  let err = (1 - p.attrs.tir / 100) * 0.22 * (0.5 + power) * (0.7 + d / 500) * (Math.random() * 2 - 1) * accMul;
  if (fire) err *= 0.3;
  const ang = Math.atan2(ty - p.y, goal.x - p.x) + err;

  let speed = (m.shotBase + p.attrs.tir * m.shotK) * (0.5 + 0.5 * power);
  if (fire) speed *= 1.3;

  // Altura del balón al llegar a la portería → velocidad vertical necesaria
  let h = P.crossbar * (0.12 + Math.pow(power, 3) * 1.1 * (1.25 - p.attrs.tir / 100)) + Math.random() * P.crossbar * 0.2;
  if (fire) h = P.crossbar * 0.35;
  const t = Math.max(0.12, d / (speed * 0.9));
  const vz = Math.min(700, (h + 0.5 * m.gravity * t * t) / t);

  kickBall(p, Math.cos(ang) * speed, Math.sin(ang) * speed, vz, 'shot');
  p.facing = ang;
  if (fire) {
    g.ball.fire = true;
    team.style = 0;
    team.fireReady = false;
    addFloater('¡TIRO DE FUEGO!', p.x, p.y - 34, '#ff7a1a', 26);
    g.shake = 0.5;
  }
}

/** Entrada del jugador humano: pequeña plancha hacia delante. */
function humanTackle(p) {
  if (p.tackleCd > 0 || p.stun > 0) return;
  p.tackleCd = 0.7;
  p.slideT = 0.28;
  p.vx += Math.cos(p.facing) * 240;
  p.vy += Math.sin(p.facing) * 240;
  const o = game.ball.owner;
  if (o && o.team !== p.team && !o.restartLock && dist(p, o) < p.r + o.r + game.mode.tackleRange + 14) resolveTackle(p);
}

function tryTackle(t) {
  t.tackleCd = 0.9;
  resolveTackle(t);
}

/** Duelo defensa vs. regateador: Defensa del que entra contra Pase+Velocidad del poseedor. */
function resolveTackle(t) {
  const g = game, b = g.ball, o = b.owner;
  if (!o || o.team === t.team || o.restartLock) return false;
  if (dist(t, o) > t.r + o.r + g.mode.tackleRange + 14) return false;
  if (o.skillT > 0) { // el truco callejero hace inmune durante un instante
    t.stun = 0.7;
    addFloater('¡Esquivado!', o.x, o.y - 28, '#00f0ff', 18);
    return false;
  }
  let chance = 0.45 + (t.attrs.def - o.attrs.pas * 0.5 - o.attrs.vel * 0.3 + 10) / 150;
  if (t.team.index === 1) chance *= g.difficulty.tackleSkill;
  chance = clamp(chance, 0.12, 0.85);

  if (Math.random() < chance) {
    t.team.stats.tackles++;
    o.stun = 0.45; o.kickCd = 0.5;
    Sound.tackle();
    if (Math.random() < 0.55) setOwner(t);
    else { // balón suelto tras el choque
      b.owner = null;
      const n = norm(o.x - t.x, o.y - t.y);
      b.vx = n.x * 160 + rand(-90, 90);
      b.vy = n.y * 160 + rand(-90, 90);
      b.lastTouch = t; b.passFrom = null; b.kickType = 'touch';
      t.kickCd = 0.15;
    }
    return true;
  }
  t.stun = 0.55; // falló la entrada y queda vendido
  return false;
}

/**
 * Truco callejero (solo modo Callejero): arrancada con el balón, inmune a entradas
 * durante 0,42 s. Si hay un rival cerca, suma mucho Estilo y lo deja sentado.
 */
function doSkill(p, inp) {
  const g = game;
  if (p.skillCd > 0 || g.ball.owner !== p) return;
  const d = Math.hypot(inp.x, inp.y) > 0.2 ? norm(inp.x, inp.y) : { x: Math.cos(p.facing), y: Math.sin(p.facing) };
  p.skillT = 0.42;
  p.skillCd = 1.2;
  p.skillDir = d;
  p.facing = Math.atan2(d.y, d.x);
  g.ball.hopT = 0.42;

  const near = nearestOpponent(p);
  if (near && near.d < 75) {
    p.team.style = Math.min(100, p.team.style + 25);
    near.p.stun = Math.max(near.p.stun, 0.5);
    addFloater(SKILL_NAMES[Math.floor(Math.random() * SKILL_NAMES.length)], p.x, p.y - 30, '#ff2bd6', 26);
  } else {
    p.team.style = Math.min(100, p.team.style + 6);
  }
  if (p.team.style >= 100 && !p.team.fireReady) {
    p.team.fireReady = true;
    if (p.team.isHuman) showBanner('¡Tiro de fuego listo!', 'Tu próximo disparo será imparable', 'small', 1500);
  }
  Sound.skill();
}


/* ==========================================================================
   11. INTELIGENCIA ARTIFICIAL
   --------------------------------------------------------------------------
   Cada jugador no controlado decide en función de su rol:
   - Portero: cubre el ángulo, sale a por balones en el área y se lanza a los tiros.
   - Poseedor: tira si está en rango, pasa si está presionado o hay un pase claro,
     o regatea esquivando rivales.
   - "Perseguidor" (el más cercano al balón): presiona al rival o intercepta el balón.
   - Resto: mantiene la formación desplazada según la posición del balón y marca.
   ========================================================================== */
const STOP = Object.freeze({ dir: ZERO, sprint: false });

function seek(p, tx, ty, stopR = 6) {
  const dx = tx - p.x, dy = ty - p.y, d = Math.hypot(dx, dy);
  if (d < stopR || d < 0.5) return ZERO;
  const s = d < 50 ? d / 50 : 1; // frena al llegar
  return { x: (dx / d) * s, y: (dy / d) * s };
}

/** Elige en cada equipo quién va a por el balón. */
function computeChasers() {
  const g = game, b = g.ball;
  for (const team of g.teams) {
    team.chaser = null;
    if (b.owner && b.owner.team === team) continue;
    // Pase en vuelo hacia un compañero: el receptor sale a buscarlo
    if (!b.owner && b.passTarget && b.passTarget.team === team && b.passTarget !== g.controlled) {
      team.chaser = b.passTarget;
      continue;
    }
    let best = null, bd = Infinity;
    for (const p of team.players) {
      if (p.isGK || p === g.controlled) continue;
      const d = dist(p, b);
      if (d < bd) { bd = d; best = p; }
    }
    // En el equipo humano, la IA solo ayuda si el controlado está lejos
    if (team.isHuman && g.controlled && best) {
      const dc = dist(g.controlled, b);
      if (bd > dc * 0.75 && dc < 160) best = null;
    }
    team.chaser = best;
  }
}

function aiThink(p, dt) {
  const g = game, b = g.ball, team = p.team;
  if (g.phase === 'goal') return { dir: seekPoint(p, formationTarget(p), 10), sprint: false };
  if (b.owner === p) return g.phase === 'play' ? carrierThink(p, dt) : STOP;
  if (p.isGK) return gkThink(p);
  if (g.phase === 'restart') return { dir: seekPoint(p, formationTarget(p), 8), sprint: false };

  const owner = b.owner;
  // Intento de entrada si el rival con balón está a tiro
  if (owner && owner.team !== team && !owner.restartLock && p.tackleCd <= 0 && p.stun <= 0) {
    if (dist(p, owner) < p.r + owner.r + g.mode.tackleRange) {
      const rate = team.index === 1 ? g.difficulty.tackleRate : 1.4;
      if (Math.random() < rate * dt) tryTackle(p);
    }
  }

  if (team.chaser === p) {
    const og = ownGoal(team);
    if (owner && owner.restartLock) { // respetar la distancia en los saques
      const n = norm(og.x - b.x, og.y - b.y);
      return { dir: seek(p, b.x + n.x * 80, b.y + n.y * 80, 6), sprint: false };
    }
    if (owner) { // presión: ponerse entre el rival y nuestra portería
      const n = norm(og.x - owner.x, og.y - owner.y);
      const tx = owner.x + owner.vx * 0.2 + n.x * 8, ty = owner.y + owner.vy * 0.2 + n.y * 8;
      return { dir: seek(p, tx, ty, 2), sprint: dist(p, owner) > 50 };
    }
    const ip = interceptPoint(p);
    return { dir: seek(p, ip.x, ip.y, 1), sprint: true };
  }

  const t = formationTarget(p);
  return { dir: seekPoint(p, t, 8), sprint: Math.hypot(t.x - p.x, t.y - p.y) > 220 };
}

function seekPoint(p, t, r) { return seek(p, t.x, t.y, r); }

/** Punto en el que el jugador puede alcanzar el balón en movimiento. */
function interceptPoint(p) {
  const g = game, b = g.ball, P = g.pitch, k = -Math.log(g.mode.ballFriction);
  const sp = playerMaxSpeed(p, true);
  let bx = b.x, by = b.y;
  for (let t = 0.05; t <= 2; t += 0.1) {
    const f = (1 - Math.exp(-k * t)) / k; // distancia recorrida con rozamiento exponencial
    bx = b.x + b.vx * f;
    by = b.y + b.vy * f;
    if (Math.hypot(bx - p.x, by - p.y) <= sp * t + p.r) break;
  }
  return { x: clamp(bx, P.left - 20, P.right + 20), y: clamp(by, P.top - 20, P.bottom + 20) };
}

/** Posición táctica: la formación base se desplaza con el balón y según quién ataca. */
function formationTarget(p) {
  const g = game, b = g.ball, team = p.team;
  const bn = toNorm(team, b.x, b.y);
  const owner = b.owner;
  // Un pase en vuelo sigue contando como posesión del equipo que lo dio
  const possTeam = owner ? owner.team : b.passFrom ? b.passFrom.team : null;
  const attacking = possTeam === team;
  const defending = !!possTeam && possTeam !== team;

  // Sin portero (3v3), el defensa hace de último hombre entre el balón y la portería
  if (p.role === 'DEF' && !attacking && !g.pitch.areaDepth && g.mode.walls) {
    const og = ownGoal(team);
    return { x: og.x + (b.x - og.x) * 0.3, y: og.y + (b.y - og.y) * 0.3 };
  }

  let nx = p.slot.x + (bn.x - 0.5) * 0.5 + (attacking ? 0.1 : defending ? -0.05 : 0);
  let ny = p.slot.y + (bn.y - 0.5) * (p.role === 'FWD' ? 0.25 : 0.35);
  if (attacking && p.role !== 'DEF') { // desmarques
    nx += 0.04;
    ny += Math.sin(g.clock * 0.7 + p.idx * 1.9) * 0.05;
  }
  const t = toWorld(team, clamp(nx, 0.04, 0.94), clamp(ny, 0.05, 0.95));

  if (defending) { // marcaje al rival más cercano a nuestra zona
    const m = nearestOpponentTo(team, t.x, t.y, 170);
    if (m) {
      const og = ownGoal(team);
      t.x = lerp(t.x, m.x + (og.x - m.x) * 0.12, 0.5);
      t.y = lerp(t.y, m.y + (og.y - m.y) * 0.12, 0.5);
    }
    if (owner && owner.restartLock) { // distancia reglamentaria en saques
      const d = dist(t, b);
      if (d < 80) { const n = d > 1 ? norm(t.x - b.x, t.y - b.y) : { x: -team.dir, y: 0 }; t.x = b.x + n.x * 80; t.y = b.y + n.y * 80; }
    }
  }
  if (attacking && owner && owner !== p) { // abrir líneas de pase, no amontonarse
    const d = dist(t, owner);
    if (d < 90) { const n = d > 1 ? norm(t.x - owner.x, t.y - owner.y) : { x: 0, y: 1 }; t.x = owner.x + n.x * 90; t.y = owner.y + n.y * 90; }
  }
  return t;
}

/** Decisiones del jugador con balón controlado por la IA. */
function carrierThink(p, dt) {
  const g = game, team = p.team, P = g.pitch;
  const diff = team.index === 1 ? g.difficulty : DIFFICULTY.normal;
  const goal = oppGoal(team);
  p.aiTimer -= dt;

  // Saques y portero con el balón en las manos: pasar (o despejar)
  if (p.restartLock) {
    if (p.aiTimer <= 0) {
      const opt = bestPassOption(p);
      if (opt && (!p.isGK || opt.score > 0)) doPass(p, opt.p);
      else clearBall(p);
    }
    return STOP;
  }

  const dGoal = Math.hypot(goal.x - p.x, goal.y - p.y);
  const near = nearestOpponent(p);
  const pressure = near ? near.d : 999;

  if (p.aiTimer <= 0) {
    p.aiTimer = diff.reaction * (0.7 + Math.random() * 0.6);
    // 1) ¿Tiro?
    const angleOk = Math.abs(goal.y - p.y) < P.height * 0.32;
    if (dGoal < P.shootRange && angleOk && (dGoal < P.shootRange * 0.5 || Math.random() < 0.12 || pressure < 40)) {
      const aim = (Math.random() < 0.5 ? -1 : 1) * (0.35 + Math.random() * 0.55);
      shoot(p, 0.6 + Math.random() * 0.35, aim, diff.accuracy);
      return STOP;
    }
    // 2) ¿Pase?
    const opt = bestPassOption(p);
    if (opt && ((pressure < 55 && opt.score > -60) || (opt.score > 140 && Math.random() < 0.45))) {
      doPass(p, opt.p);
      return STOP;
    }
    // 3) ¿Truco? (calle)
    if (g.mode.id === 'street' && pressure < 70 && p.skillCd <= 0 && Math.random() < diff.skillRate) {
      doSkill(p, dribbleDirection(p, goal));
    }
    // 4) Conducción
    p.aiDir = dribbleDirection(p, goal);
  }
  return { dir: p.aiDir || norm(goal.x - p.x, goal.y - p.y), sprint: pressure > 90 && p.stamina > 0.35 };
}

/** Dirección de regate: hacia la portería esquivando a los rivales que hay delante. */
function dribbleDirection(p, goal) {
  const P = game.pitch;
  const d = norm(goal.x - p.x, goal.y - p.y);
  let ax = d.x, ay = d.y;
  for (const o of otherTeam(p.team).players) {
    const dx = o.x - p.x, dy = o.y - p.y, dd = Math.hypot(dx, dy);
    if (dd > 120 || dd < 1) continue;
    if ((dx * d.x + dy * d.y) / dd < -0.2) continue; // rival por detrás: se ignora
    const w = (1 - dd / 120) * 1.6;
    const cross = d.x * dy - d.y * dx;   // ¿rival a la izquierda o a la derecha?
    const s = cross > 0 ? -1 : 1;        // salir por el lado contrario
    ax += -d.y * s * w;
    ay += d.x * s * w;
    ax -= (dx / dd) * w * 0.4;
    ay -= (dy / dd) * w * 0.4;
  }
  if (p.y < P.top + 50) ay += 1;
  if (p.y > P.bottom - 50) ay -= 1;
  return norm(ax, ay);
}

/** Puntúa cada compañero: avance, desmarque y línea de pase libre. */
function bestPassOption(p) {
  const g = game, team = p.team, opps = otherTeam(team).players;
  const myN = toNorm(team, p.x, p.y).x;
  let best = null;
  for (const t of team.players) {
    if (t === p || t.isGK) continue;
    const d = dist(p, t);
    if (d < 50 || d > g.mode.maxPassDist) continue;
    let score = (toNorm(team, t.x, t.y).x - myN) * g.pitch.width * 0.8;
    let open = Infinity;
    for (const o of opps) {
      open = Math.min(open, dist(o, t));
      const dl = distPointSegment(o, p, t);
      if (dl < 22) score -= 220; else if (dl < 40) score -= 60;
    }
    score += Math.min(open, 150) * 0.8;
    score -= Math.max(0, d - 350) * 0.3;
    if (!best || score > best.score) best = { p: t, score };
  }
  return best;
}

function gkThink(p) {
  const g = game, b = g.ball, team = p.team, P = g.pitch;
  const og = ownGoal(team), halfG = P.goalW / 2;

  // 1) Balón rápido hacia la portería: cubrir el punto por donde cruzará la línea
  if (!b.owner && b.vx * team.dir < -150) {
    const t = (og.x - b.x) / b.vx;
    if (t > 0 && t < 1.6) {
      const yy = b.y + b.vy * t;
      if (Math.abs(yy - og.y) < halfG * 1.6) {
        return { dir: seek(p, og.x + team.dir * 12, clamp(yy, og.y - halfG, og.y + halfG), 1), sprint: true };
      }
    }
  }
  // 2) Balón suelto en el área y el portero llega antes: salir a por él
  if (!b.owner && inArea(team, b.x, b.y)) {
    const rival = closestPlayer(otherTeam(team), b.x, b.y, false);
    if (!rival || dist(p, b) < dist(rival, b) + 40) return { dir: seek(p, b.x, b.y, 0), sprint: true };
  }
  // 3) Posición base: sobre la línea entre el balón y el centro de la portería
  const dBall = Math.hypot(b.x - og.x, b.y - og.y);
  const ang = Math.atan2(b.y - og.y, b.x - og.x);
  const dd = Math.min(P.gkOut, 14 + dBall * 0.07);
  const tx = og.x + Math.cos(ang) * dd;
  const ty = clamp(og.y + Math.sin(ang) * dd, og.y - halfG * 0.85, og.y + halfG * 0.85);
  return { dir: seek(p, tx, ty, 3), sprint: false };
}


/* ==========================================================================
   12. RENDER
   ========================================================================== */
const displayFont = () => (game.mode.walls ? '"Permanent Marker", cursive' : '"Bebas Neue", Impact, sans-serif');

/* ---------- Cámara ---------- */
function cameraTarget() {
  const g = game, b = g.ball, P = g.pitch;
  let tx = b.x + b.vx * 0.2 - VIEW_W / 2;
  let ty = b.y - b.z * 0.5 + b.vy * 0.2 - VIEW_H / 2;
  const maxX = P.worldW - VIEW_W, maxY = P.worldH - VIEW_H;
  tx = maxX <= 0 ? maxX / 2 : clamp(tx, 0, maxX);
  ty = maxY <= 0 ? maxY / 2 : clamp(ty, 0, maxY);
  return { x: tx, y: ty };
}
function updateCamera(dt) {
  const t = cameraTarget(), k = Math.min(1, dt * 3.5);
  game.cam.x += (t.x - game.cam.x) * k;
  game.cam.y += (t.y - game.cam.y) * k;
}
function snapCamera() { const t = cameraTarget(); game.cam.x = t.x; game.cam.y = t.y; }

/* ---------- Fondo Fútbol 11 (pre-renderizado) ---------- */
function renderF11Background(P) {
  const c = document.createElement('canvas');
  c.width = P.worldW; c.height = P.worldH;
  const x = c.getContext('2d');

  // Entorno del estadio
  x.fillStyle = '#0f2e1a';
  x.fillRect(0, 0, c.width, c.height);

  // Césped a franjas (incluye el margen fuera de las líneas)
  const gx0 = P.left - 46, gy0 = P.top - 46, gw = P.width + 92, gh = P.height + 92;
  const stripes = 18, sw = gw / stripes;
  for (let i = 0; i < stripes; i++) {
    x.fillStyle = i % 2 ? '#2f8a43' : '#287a3a';
    x.fillRect(gx0 + i * sw, gy0, sw + 1, gh);
  }
  for (let i = 0; i < 12000; i++) { // textura de hierba
    x.fillStyle = Math.random() < 0.5 ? 'rgba(0,0,0,0.05)' : 'rgba(255,255,255,0.035)';
    x.fillRect(gx0 + Math.random() * gw, gy0 + Math.random() * gh, 2, 2);
  }

  drawAdBoards(x, gx0, gy0, gw, gh);

  // Líneas reglamentarias
  x.strokeStyle = 'rgba(255,255,255,0.92)';
  x.lineWidth = 3;
  x.lineCap = 'round';
  x.strokeRect(P.left, P.top, P.width, P.height);
  x.beginPath(); x.moveTo(P.cx, P.top); x.lineTo(P.cx, P.bottom); x.stroke();
  x.beginPath(); x.arc(P.cx, P.cy, P.circleR, 0, TAU); x.stroke();
  fillDot(x, P.cx, P.cy, 4, '#ffffff');

  const arcA = Math.acos((P.areaDepth - P.penSpot) / P.circleR); // semicírculo fuera del área
  for (const side of [-1, 1]) {
    const gl = side === -1 ? P.left : P.right;
    const inw = -side; // hacia el interior del campo
    x.strokeRect(Math.min(gl, gl + inw * P.areaDepth), P.cy - P.areaH / 2, P.areaDepth, P.areaH);
    x.strokeRect(Math.min(gl, gl + inw * P.smallDepth), P.cy - P.smallH / 2, P.smallDepth, P.smallH);
    const sx = gl + inw * P.penSpot;
    fillDot(x, sx, P.cy, 3.5, '#ffffff');
    x.beginPath();
    if (inw === 1) x.arc(sx, P.cy, P.circleR, -arcA, arcA);
    else x.arc(sx, P.cy, P.circleR, Math.PI - arcA, Math.PI + arcA);
    x.stroke();
  }

  // Arcos de esquina y banderines
  const corners = [[P.left, P.top, 0, Math.PI / 2], [P.right, P.top, Math.PI / 2, Math.PI],
    [P.right, P.bottom, Math.PI, Math.PI * 1.5], [P.left, P.bottom, Math.PI * 1.5, TAU]];
  for (const [cx, cy, a0, a1] of corners) {
    x.beginPath(); x.arc(cx, cy, 15, a0, a1); x.stroke();
    x.fillStyle = '#ffe14d';
    x.beginPath(); x.moveTo(cx, cy); x.lineTo(cx + (cx === P.left ? -10 : 10), cy - 6); x.lineTo(cx, cy - 12); x.closePath(); x.fill();
  }

  for (const side of [-1, 1]) drawGoalNet(x, P, side, 'rgba(255,255,255,0.4)', '#ffffff', 'rgba(0,0,0,0.25)', false);

  // Iluminación de estadio
  const vg = x.createRadialGradient(P.cx, P.cy, P.height * 0.3, P.cx, P.cy, P.width * 0.75);
  vg.addColorStop(0, 'rgba(255,255,255,0.05)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  x.fillStyle = vg;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

function fillDot(x, px, py, r, color) { x.fillStyle = color; x.beginPath(); x.arc(px, py, r, 0, TAU); x.fill(); }

/** Vallas publicitarias genéricas alrededor del campo. */
function drawAdBoards(x, gx0, gy0, gw, gh) {
  const colors = ['#0b2a6b', '#c8102e', '#111827', '#f5c518'];
  const texts = ['GOLAZO', 'FÚTBOL 11', 'GOLAZO', 'JUEGO LIMPIO'];
  const H = 16, gap = 14, segW = 170;
  x.font = '700 11px Rubik, sans-serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  for (const y of [gy0 - gap - H, gy0 + gh + gap]) {
    for (let i = 0, xx = gx0; xx < gx0 + gw; i++, xx += segW) {
      const w = Math.min(segW, gx0 + gw - xx);
      const col = colors[i % colors.length];
      x.fillStyle = col;
      x.fillRect(xx, y, w - 2, H);
      x.fillStyle = col === '#f5c518' ? '#111' : '#fff';
      x.fillText(texts[i % texts.length], xx + w / 2, y + H / 2 + 0.5, w - 10);
    }
  }
}

/** Portería con red (vista cenital). */
function drawGoalNet(x, P, side, netColor, frameColor, fill, glow) {
  const gl = side === -1 ? P.left : P.right, out = side;
  const x0 = Math.min(gl, gl + out * P.goalDepth), y0 = P.cy - P.goalW / 2;
  x.save();
  x.fillStyle = fill;
  x.fillRect(x0, y0, P.goalDepth, P.goalW);
  x.beginPath(); x.rect(x0, y0, P.goalDepth, P.goalW); x.clip();
  x.strokeStyle = netColor;
  x.lineWidth = 1;
  for (let i = -P.goalW; i < P.goalW + P.goalDepth; i += 7) {
    x.beginPath(); x.moveTo(x0 + i, y0); x.lineTo(x0 + i + P.goalW, y0 + P.goalW); x.stroke();
    x.beginPath(); x.moveTo(x0 + i + P.goalW, y0); x.lineTo(x0 + i, y0 + P.goalW); x.stroke();
  }
  x.restore();

  x.save();
  if (glow) { x.shadowColor = frameColor; x.shadowBlur = 14; }
  x.strokeStyle = frameColor;
  x.lineWidth = 4;
  x.beginPath();
  x.moveTo(gl, y0); x.lineTo(gl + out * P.goalDepth, y0);
  x.lineTo(gl + out * P.goalDepth, y0 + P.goalW); x.lineTo(gl, y0 + P.goalW);
  x.stroke();
  fillDot(x, gl, y0, P.postR + 1, frameColor);
  fillDot(x, gl, y0 + P.goalW, P.postR + 1, frameColor);
  x.restore();
}

/* ---------- Fondo Callejero (pre-renderizado) ---------- */
function renderStreetBackground(P, format) {
  const c = document.createElement('canvas');
  c.width = Math.ceil(P.worldW); c.height = Math.ceil(P.worldH);
  const x = c.getContext('2d');

  // 1) Muro de ladrillo
  x.fillStyle = '#17131b';
  x.fillRect(0, 0, c.width, c.height);
  x.strokeStyle = 'rgba(255,255,255,0.045)';
  x.lineWidth = 1;
  for (let row = 0, y = 0; y < c.height; row++, y += 22) {
    x.beginPath(); x.moveTo(0, y); x.lineTo(c.width, y); x.stroke();
    for (let xx = (row % 2) * 24; xx < c.width; xx += 48) { x.beginPath(); x.moveTo(xx, y); x.lineTo(xx, y + 22); x.stroke(); }
  }

  // 2) Grafitis
  drawGraffiti(x, P, c.width, c.height);

  // 3) Asfalto con textura, manchas y grietas
  x.fillStyle = '#2a2c33';
  x.fillRect(P.left, P.top, P.width, P.height);
  for (let i = 0; i < 16000; i++) {
    x.fillStyle = Math.random() < 0.5 ? `rgba(0,0,0,${rand(0.05, 0.2)})` : `rgba(255,255,255,${rand(0.02, 0.07)})`;
    x.fillRect(P.left + Math.random() * P.width, P.top + Math.random() * P.height, rand(1, 2.5), rand(1, 2.5));
  }
  for (let i = 0; i < 9; i++) {
    x.fillStyle = 'rgba(0,0,0,0.18)';
    x.beginPath();
    x.ellipse(P.left + Math.random() * P.width, P.top + Math.random() * P.height, rand(20, 60), rand(10, 30), rand(0, Math.PI), 0, TAU);
    x.fill();
  }
  x.strokeStyle = 'rgba(0,0,0,0.45)';
  x.lineWidth = 1.4;
  for (let i = 0; i < 12; i++) {
    let px = P.left + Math.random() * P.width, py = P.top + Math.random() * P.height;
    x.beginPath(); x.moveTo(px, py);
    for (let k = 0; k < 6; k++) {
      px = clamp(px + rand(-30, 30), P.left, P.right);
      py = clamp(py + rand(-30, 30), P.top, P.bottom);
      x.lineTo(px, py);
    }
    x.stroke();
  }
  x.fillStyle = 'rgba(255,43,214,0.06)'; x.fillRect(P.left, P.top, P.width / 2, P.height);
  x.fillStyle = 'rgba(0,240,255,0.06)'; x.fillRect(P.cx, P.top, P.width / 2, P.height);

  x.save();
  x.translate(P.cx, P.cy); x.rotate(-0.12);
  x.font = '64px "Permanent Marker", cursive';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillStyle = 'rgba(255,255,255,0.07)';
  x.fillText('CALLE', 0, 0);
  x.restore();

  // 4) Líneas de neón
  const neon = (color, fn, w = 3) => {
    x.save();
    x.strokeStyle = color; x.lineWidth = w; x.shadowColor = color; x.shadowBlur = 14;
    fn();
    x.restore();
  };
  neon('#00f0ff', () => {
    x.strokeRect(P.left + 6, P.top + 6, P.width - 12, P.height - 12);
    x.beginPath(); x.moveTo(P.cx, P.top + 6); x.lineTo(P.cx, P.bottom - 6); x.stroke();
    x.beginPath(); x.arc(P.cx, P.cy, P.circleR, 0, TAU); x.stroke();
  });
  neon('#ff2bd6', () => {
    x.beginPath(); x.arc(P.left, P.cy, P.goalW * 0.95, -Math.PI / 2, Math.PI / 2); x.stroke();
    x.beginPath(); x.arc(P.right, P.cy, P.goalW * 0.95, Math.PI / 2, Math.PI * 1.5); x.stroke();
  });
  if (format.hasGK) {
    neon('rgba(255,225,77,0.85)', () => {
      x.setLineDash([10, 8]);
      x.strokeRect(P.left, P.cy - P.areaH / 2, P.areaDepth, P.areaH);
      x.strokeRect(P.right - P.areaDepth, P.cy - P.areaH / 2, P.areaDepth, P.areaH);
    }, 2);
  }
  fillDot(x, P.cx, P.cy, 4, '#00f0ff');

  // 5) Jaula metálica alrededor de la cancha
  const band = 18;
  x.save();
  x.beginPath();
  x.rect(P.left - band, P.top - band, P.width + band * 2, P.height + band * 2);
  x.rect(P.left, P.top, P.width, P.height);
  x.clip('evenodd');
  x.fillStyle = 'rgba(10,10,14,0.55)';
  x.fillRect(P.left - band, P.top - band, P.width + band * 2, P.height + band * 2);
  x.strokeStyle = 'rgba(190,200,220,0.32)';
  x.lineWidth = 1;
  const span = P.width + P.height + 80, ox = P.left - band, oy = P.top - band;
  for (let i = -span; i < span; i += 9) {
    x.beginPath(); x.moveTo(ox + i, oy); x.lineTo(ox + i + span, oy + span); x.stroke();
    x.beginPath(); x.moveTo(ox + i + span, oy); x.lineTo(ox + i, oy + span); x.stroke();
  }
  x.restore();
  x.fillStyle = '#5b5f6b';
  for (let xx = P.left; xx <= P.right; xx += 120) { x.fillRect(xx - 3, P.top - band, 6, band); x.fillRect(xx - 3, P.bottom, 6, band); }
  for (let yy = P.top; yy <= P.bottom; yy += 120) {
    if (Math.abs(yy - P.cy) < P.goalW / 2 + 6) continue;
    x.fillRect(P.left - band, yy - 3, band, 6);
    x.fillRect(P.right, yy - 3, band, 6);
  }

  // 6) Porterías con marco de neón
  drawGoalNet(x, P, -1, 'rgba(255,255,255,0.28)', '#ff2bd6', '#0c0a12', true);
  drawGoalNet(x, P, 1, 'rgba(255,255,255,0.28)', '#00f0ff', '#0c0a12', true);

  // 7) Farolas: charcos de luz cálida
  x.save();
  x.globalCompositeOperation = 'lighter';
  const lamps = [[P.left + P.width * 0.25, P.top - 8], [P.left + P.width * 0.75, P.top - 8],
    [P.left + P.width * 0.25, P.bottom + 8], [P.left + P.width * 0.75, P.bottom + 8]];
  for (const [lx, ly] of lamps) {
    const gr = x.createRadialGradient(lx, ly, 10, lx, ly, 340);
    gr.addColorStop(0, 'rgba(255,190,120,0.2)');
    gr.addColorStop(1, 'rgba(255,190,120,0)');
    x.fillStyle = gr;
    x.fillRect(lx - 340, ly - 340, 680, 680);
  }
  x.restore();
  for (const [lx, ly] of lamps) fillDot(x, lx, ly, 5, '#fff3d6');

  // 8) Viñeta oscura (sombras de la calle)
  const vg = x.createRadialGradient(P.cx, P.cy, Math.min(P.width, P.height) * 0.35, P.cx, P.cy, Math.max(c.width, c.height) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.7)');
  x.fillStyle = vg;
  x.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Pintadas en los muros que rodean la jaula. */
function drawGraffiti(x, P, W, H) {
  const tags = ['STREET', 'GOLAZO', 'BARRIO', 'NO LIMITS', 'CALLE 10', 'FREESTYLE', '¡CAÑO!', 'JOGA BONITO'];
  const colors = ['#ff2bd6', '#00f0ff', '#ffe14d', '#7cff4f', '#ff7a1a'];
  const bands = [
    { x0: 0, y0: 0, x1: W, y1: P.top - 20, vertical: false },
    { x0: 0, y0: P.bottom + 20, x1: W, y1: H, vertical: false },
    { x0: 0, y0: P.top, x1: P.left - 20, y1: P.bottom, vertical: true },
    { x0: P.right + 20, y0: P.top, x1: W, y1: P.bottom, vertical: true },
  ];
  let k = 0;
  for (const b of bands) {
    const th = b.vertical ? b.x1 - b.x0 : b.y1 - b.y0;
    if (th < 26) continue;
    const len = b.vertical ? b.y1 - b.y0 : b.x1 - b.x0;
    const size = clamp(th * 0.6, 18, 54);
    const n = Math.max(1, Math.floor(len / (size * 6)));
    for (let i = 0; i < n; i++) {
      const t = (i + 0.5) / n;
      const cx = b.vertical ? (b.x0 + b.x1) / 2 : b.x0 + len * t;
      const cy = b.vertical ? b.y0 + len * t : (b.y0 + b.y1) / 2;
      const col = colors[k % colors.length], tag = tags[k % tags.length];
      k++;
      x.save();
      x.translate(cx, cy);
      x.rotate((b.vertical ? -Math.PI / 2 : 0) + rand(-0.12, 0.12));
      x.font = `${size}px "Permanent Marker", cursive`;
      x.textAlign = 'center'; x.textBaseline = 'middle';
      x.lineWidth = 6; x.strokeStyle = 'rgba(0,0,0,0.6)';
      x.strokeText(tag, 0, 0, len / n - 20);
      x.shadowColor = col; x.shadowBlur = 16;
      x.globalAlpha = 0.55; x.fillStyle = col;
      x.fillText(tag, 0, 0, len / n - 20);
      x.restore();
    }
  }
}

/* ---------- Render de cada frame ---------- */
function render() {
  const g = game;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = g.mode.walls ? '#0a0a10' : '#0f2e1a';
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  const sx = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 14 : 0;
  const sy = g.shake > 0 ? (Math.random() - 0.5) * g.shake * 14 : 0;
  ctx.setTransform(1, 0, 0, 1, Math.round(-g.cam.x + sx), Math.round(-g.cam.y + sy));
  ctx.drawImage(g.bg, 0, 0);

  drawTrails();

  // Orden por profundidad (y) para que los de abajo tapen a los de arriba
  const ents = [];
  for (const t of g.teams) for (const p of t.players) ents.push({ y: p.y, p });
  ents.push({ y: g.ball.y, ball: true });
  ents.sort((a, c) => a.y - c.y);

  for (const e of ents) if (e.p) drawShadow(e.p.x + 3, e.p.y + e.p.r * 0.6, e.p.r * 1.05, e.p.r * 0.55, 0.35);
  drawBallShadow();
  if (g.controlled) drawControlRing(g.controlled);
  for (const e of ents) { if (e.ball) drawBall(); else drawPlayer(e.p); }

  drawParticles();
  drawFloaters();
  if (g.controlled) drawControlledOverlay(g.controlled);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  if (!g.mode.walls) drawMinimap();
}

function drawShadow(x, y, rx, ry, a) {
  ctx.fillStyle = `rgba(0,0,0,${a})`;
  ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, TAU); ctx.fill();
}

function drawTrails() {
  for (const t of game.teams) {
    for (const p of t.players) {
      for (const s of p.trail) {
        ctx.globalAlpha = (s.life / 0.25) * 0.35;
        ctx.fillStyle = p.kit.primary;
        ctx.beginPath(); ctx.arc(s.x, s.y, p.r, 0, TAU); ctx.fill();
      }
    }
  }
  ctx.globalAlpha = 1;
}

function drawPlayer(p) {
  const g = game, kit = p.kit, street = g.mode.walls;
  ctx.save();
  ctx.translate(p.x, p.y);
  // Estirada del portero o entrada en plancha: el cuerpo se alarga en esa dirección
  const stretch = p.diveT > 0 ? p.diveAng : p.slideT > 0 ? p.facing : null;
  if (stretch !== null) { ctx.rotate(stretch); ctx.scale(1.45, 0.8); ctx.rotate(-stretch); }

  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, TAU);
  if (street) { ctx.shadowColor = kit.primary; ctx.shadowBlur = 12; }
  ctx.fillStyle = kit.primary;
  ctx.fill();
  ctx.shadowBlur = 0;
  if (kit.pattern === 'stripes') {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = kit.secondary;
    const w = p.r * 0.38;
    for (let sx = -p.r + w * 0.5; sx < p.r; sx += w * 2) ctx.fillRect(sx, -p.r, w, p.r * 2);
    ctx.restore();
  }
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = kit.secondary;
  ctx.stroke();

  // Indicador de orientación
  ctx.rotate(p.facing);
  ctx.beginPath();
  ctx.moveTo(p.r + 6, 0); ctx.lineTo(p.r, -4.5); ctx.lineTo(p.r, 4.5); ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fill();
  ctx.restore();

  // Dorsal
  ctx.font = `700 ${Math.round(p.r * 0.95)}px Rubik, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  if (kit.pattern) { ctx.lineWidth = 3; ctx.strokeStyle = kit.primary; ctx.strokeText(p.num, p.x, p.y + 0.5); }
  ctx.fillStyle = kit.text;
  ctx.fillText(p.num, p.x, p.y + 0.5);

  // Aturdido: estrellitas
  if (p.stun > 0.05) {
    ctx.fillStyle = '#ffe14d';
    for (let i = 0; i < 3; i++) {
      const a = g.clock * 6 + (i * TAU) / 3;
      ctx.beginPath(); ctx.arc(p.x + Math.cos(a) * p.r * 0.9, p.y - p.r - 4 + Math.sin(a) * 3, 2, 0, TAU); ctx.fill();
    }
  }

  // Nombre del controlado y del poseedor
  if (p === g.controlled || p === g.ball.owner) {
    ctx.font = '600 11px Rubik, sans-serif';
    ctx.lineWidth = 3;
    ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(p.short, p.x, p.y - p.r - 10);
    ctx.fillStyle = p === g.controlled ? (street ? '#00f0ff' : '#ffe14d') : '#ffffff';
    ctx.fillText(p.short, p.x, p.y - p.r - 10);
  }
}

/** Anillo en el suelo bajo el jugador controlado. */
function drawControlRing(p) {
  const g = game, c = g.mode.walls ? '#00f0ff' : '#ffe14d';
  ctx.save();
  ctx.globalAlpha = 0.6 + Math.sin(g.clock * 8) * 0.25;
  ctx.strokeStyle = c;
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(p.x, p.y + 2, p.r + 7, (p.r + 7) * 0.75, 0, 0, TAU); ctx.stroke();
  ctx.restore();
}

/** Flecha, energía, barra de potencia y ayuda de saque sobre el controlado. */
function drawControlledOverlay(p) {
  const g = game, c = g.mode.walls ? '#00f0ff' : '#ffe14d';
  const ay = p.y - p.r - 32 + Math.sin(g.clock * 6) * 2;
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.moveTo(p.x, ay + 8); ctx.lineTo(p.x - 6, ay); ctx.lineTo(p.x + 6, ay); ctx.closePath(); ctx.fill();

  if (p.stamina < 0.98) {
    const w = 28, y = p.y + p.r + 8;
    ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(p.x - w / 2, y, w, 4);
    ctx.fillStyle = p.stamina > 0.3 ? '#22c55e' : '#ef4444'; ctx.fillRect(p.x - w / 2, y, w * p.stamina, 4);
  }

  if (g.charging) {
    const w = 46, h = 7, x0 = p.x - w / 2, y0 = p.y - p.r - 50;
    ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillRect(x0 - 2, y0 - 2, w + 4, h + 4);
    const grad = ctx.createLinearGradient(x0, 0, x0 + w, 0);
    grad.addColorStop(0, '#22c55e'); grad.addColorStop(0.6, '#f5c518'); grad.addColorStop(1, '#ef4444');
    ctx.fillStyle = grad; ctx.fillRect(x0, y0, w * g.power, h);
  }

  if (p.restartLock && g.ball.owner === p) {
    ctx.font = '600 11px Rubik, sans-serif';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.8)';
    const txt = 'Z: pasar · X: tirar';
    ctx.strokeText(txt, p.x, p.y + p.r + 24);
    ctx.fillStyle = '#ffffff'; ctx.fillText(txt, p.x, p.y + p.r + 24);
  }
}

function drawBallShadow() {
  const b = game.ball, k = Math.min(0.6, b.z / 120);
  drawShadow(b.x + 2 + b.z * 0.15, b.y + 2, b.r * (1 - k * 0.5), b.r * (1 - k * 0.5) * 0.7, 0.35 * (1 - k));
}

function drawBall() {
  const g = game, b = g.ball;
  const by = b.y - b.z * 0.9;              // la altura se representa desplazando hacia arriba
  const r = b.r * (1 + b.z / 140);         // y aumentando ligeramente el tamaño
  if (b.fire) {
    const gr = ctx.createRadialGradient(b.x, by, 1, b.x, by, r * 4);
    gr.addColorStop(0, 'rgba(255,200,60,0.9)');
    gr.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = gr;
    ctx.beginPath(); ctx.arc(b.x, by, r * 4, 0, TAU); ctx.fill();
  }
  ctx.beginPath(); ctx.arc(b.x, by, r, 0, TAU);
  ctx.fillStyle = '#ffffff'; ctx.fill();
  ctx.lineWidth = 1; ctx.strokeStyle = '#222'; ctx.stroke();
  ctx.fillStyle = g.mode.walls ? '#ff2bd6' : '#222';
  for (let i = 0; i < 3; i++) { // paneles que giran con el balón
    const a = b.spin + (i * TAU) / 3;
    ctx.beginPath(); ctx.arc(b.x + Math.cos(a) * r * 0.45, by + Math.sin(a) * r * 0.45, r * 0.28, 0, TAU); ctx.fill();
  }
}

function drawParticles() {
  for (const pt of game.particles) {
    const a = clamp(pt.life / pt.max, 0, 1);
    if (pt.type === 'fire') {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * a + 1, 0, TAU); ctx.fill();
      ctx.restore();
    } else if (pt.type === 'confetti') {
      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot);
      ctx.fillStyle = pt.color;
      ctx.fillRect(-pt.size / 2, -pt.size / 4, pt.size, pt.size / 2);
      ctx.restore();
    } else {
      ctx.globalAlpha = a;
      ctx.fillStyle = pt.color;
      ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size, 0, TAU); ctx.fill();
      ctx.globalAlpha = 1;
    }
  }
}

function drawFloaters() {
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const f of game.floaters) {
    ctx.globalAlpha = clamp(f.life / f.max * 1.5, 0, 1);
    ctx.font = `${f.size}px ${displayFont()}`;
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.75)';
    ctx.strokeText(f.text, f.x, f.y);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

/** Minimapa de Fútbol 11 (el campo es más grande que la pantalla). */
function drawMinimap() {
  const g = game, P = g.pitch;
  const w = 210, h = (w * P.height) / P.width, x0 = VIEW_W / 2 - w / 2, y0 = VIEW_H - h - 14;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x0 - 4, y0 - 4, w + 8, h + 8);
  ctx.fillStyle = 'rgba(46,140,67,0.55)';
  ctx.fillRect(x0, y0, w, h);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x0, y0, w, h);
  ctx.beginPath(); ctx.moveTo(x0 + w / 2, y0); ctx.lineTo(x0 + w / 2, y0 + h); ctx.stroke();

  const sx = w / P.width, sy = h / P.height;
  const mx = (px) => x0 + (px - P.left) * sx, my = (py) => y0 + (py - P.top) * sy;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.strokeRect(mx(g.cam.x), my(g.cam.y), VIEW_W * sx, VIEW_H * sy);
  for (const t of g.teams) {
    for (const p of t.players) {
      ctx.fillStyle = p.kit.primary;
      ctx.beginPath(); ctx.arc(mx(p.x), my(p.y), p === g.controlled ? 3.6 : 2.6, 0, TAU); ctx.fill();
      ctx.strokeStyle = p === g.controlled ? '#ffe14d' : 'rgba(0,0,0,0.6)';
      ctx.stroke();
    }
  }
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(mx(g.ball.x), my(g.ball.y), 2.2, 0, TAU); ctx.fill();
}

/* ---------- Efectos: partículas y textos flotantes ---------- */
function spawnParticles(x, y, n, colors, speed, life, size, type) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * TAU, s = Math.random() * speed;
    game.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: life * rand(0.6, 1), max: life, size: size * rand(0.6, 1.3),
      color: colors[Math.floor(Math.random() * colors.length)],
      type, rot: Math.random() * TAU, vr: rand(-8, 8),
    });
  }
}

function addFloater(text, x, y, color = '#ffffff', size = 20) {
  game.floaters.push({ text, x, y, color, size, life: 1.2, max: 1.2 });
}

function updateEffects(dt) {
  const g = game, b = g.ball;
  const drag = Math.pow(0.3, dt);
  for (const pt of g.particles) {
    pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    pt.vx *= drag; pt.vy *= drag;
    pt.rot += pt.vr * dt;
    pt.life -= dt;
  }
  g.particles = g.particles.filter((pt) => pt.life > 0);
  for (const f of g.floaters) { f.y -= 28 * dt; f.life -= dt; }
  g.floaters = g.floaters.filter((f) => f.life > 0);
  for (const t of g.teams) {
    for (const p of t.players) {
      if (!p.trail.length) continue;
      for (const s of p.trail) s.life -= dt;
      p.trail = p.trail.filter((s) => s.life > 0);
    }
  }
  g.shake = Math.max(0, g.shake - dt * 1.8);
  // Estela del tiro de fuego
  if (b.fire && !b.owner && g.particles.length < 400) {
    spawnParticles(b.x, b.y - b.z * 0.9, 3, ['#ff6a00', '#ffd23f', '#ff2b2b'], 60, 0.35, 6, 'fire');
  }
}


/* ==========================================================================
   13. HUD, PAUSA Y PANTALLA FINAL
   ========================================================================== */
const hudEl = {
  scoreHome: $('#hud-score-home'),
  scoreAway: $('#hud-score-away'),
  time: $('#hud-time'),
  stamina: $('#meter-stamina-fill'),
  style: $('#meter-style-fill'),
  styleMeter: $('#meter-style'),
  player: $('#meter-player'),
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
  $('#hud-mode').textContent = `${g.mode.name} · ${g.formationLabel}`;
}

/** Solo toca el DOM cuando el valor cambia (evita repintados en cada frame). */
function setText(elm, v) { if (elm._v !== v) { elm._v = v; elm.textContent = v; } }
function setWidth(elm, f) { const w = Math.round(f * 100); if (elm._w !== w) { elm._w = w; elm.style.width = `${w}%`; } }

function timeLabel() {
  const g = game;
  if (g.mode.id === 'f11') {
    const m = Math.min(90, Math.floor((g.time / g.duration) * 90));
    return `${String(m).padStart(2, '0')}' · ${g.half}T`;
  }
  if (g.goldenGoal) return 'GOL DE ORO';
  const rem = Math.max(0, Math.ceil(g.duration - g.time));
  return `${Math.floor(rem / 60)}:${String(rem % 60).padStart(2, '0')}`;
}

function minuteLabel() {
  const g = game;
  if (g.mode.id === 'f11') return `${clamp(Math.ceil((g.time / g.duration) * 90), 1, 90)}'`;
  if (g.goldenGoal) return 'Gol de oro';
  const s = Math.floor(g.time);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function updateHUD() {
  const g = game, c = g.controlled;
  setText(hudEl.scoreHome, String(g.teams[0].score));
  setText(hudEl.scoreAway, String(g.teams[1].score));
  setText(hudEl.time, timeLabel());
  setText(hudEl.player, c ? `${c.num} ${c.short}` : '—');
  setWidth(hudEl.stamina, c ? c.stamina : 1);
  if (g.mode.id === 'street') {
    const s = g.teams[0].style / 100;
    setWidth(hudEl.style, s);
    hudEl.styleMeter.classList.toggle('full', s >= 1);
  }
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
  $('#end-mode').textContent = `${g.mode.name} · ${g.formationLabel} · IA ${g.difficulty.label}`;
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
      li.append(makeEl('b', null, s.name), document.createTextNode(` ${s.minute}`));
      ul.appendChild(li);
    }
  });

  const totalPos = g.possession[0] + g.possession[1] || 1;
  const pos0 = Math.round((g.possession[0] / totalPos) * 100);
  const pct = (t) => (t.stats.passes ? Math.round((t.stats.passesOk / t.stats.passes) * 100) : 0);
  const rows = [
    ['Posesión', pos0, 100 - pos0, '%'],
    ['Tiros', h.stats.shots, a.stats.shots, ''],
    ['Tiros a puerta', h.stats.onTarget, a.stats.onTarget, ''],
    ['Pases', h.stats.passes, a.stats.passes, ''],
    ['Precisión de pase', pct(h), pct(a), '%'],
    ['Entradas ganadas', h.stats.tackles, a.stats.tackles, ''],
  ];
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
   14. ARRANQUE
   ========================================================================== */
function init() {
  buildTeamGrids();
  updateTeamSelection();
  setupTouch();
  setTheme('f11');
  // Precarga de fuentes para que el campo callejero pinte los grafitis con su tipografía
  if (document.fonts && document.fonts.load) {
    document.fonts.load('40px "Permanent Marker"').catch(() => {});
    document.fonts.load('40px "Bebas Neue"').catch(() => {});
  }
  requestAnimationFrame(loop);
}

init();
