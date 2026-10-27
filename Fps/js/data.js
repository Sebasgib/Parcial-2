// Datos del juego: equipos, armas, enemigos y niveles

const TEAMS = {
  nacional:    { name: 'Atlético Nacional', short: 'Nacional',    pri: '#1d8f3f', sec: '#ffffff', sleeve: '#1d8f3f', pattern: 'band',    cheer: '¡VERDOLAGA!' },
  millonarios: { name: 'Millonarios',       short: 'Millonarios', pri: '#1f45a8', sec: '#ffffff', sleeve: '#1f45a8', pattern: 'solid',   cheer: '¡EMBAJADOR!' },
  america:     { name: 'América de Cali',   short: 'América',     pri: '#c1121f', sec: '#ffffff', sleeve: '#c1121f', pattern: 'band',    cheer: '¡DIABLOS ROJOS!' },
  junior:      { name: 'Junior',            short: 'Junior',      pri: '#d7263d', sec: '#ffffff', sleeve: '#ffffff', pattern: 'vstripes', cheer: '¡TIBURÓN!' },
  medellin:    { name: 'Independiente Medellín', short: 'Medellín', pri: '#b3131b', sec: '#1a3a7a', sleeve: '#1a3a7a', pattern: 'solid', cheer: '¡POODLE!' },
  tolima:      { name: 'Deportes Tolima',   short: 'Tolima',      pri: '#6d1030', sec: '#f2c500', sleeve: '#f2c500', pattern: 'band',    cheer: '¡VINOTINTO!' }
};

const WEAPONS = [
  { id: 'bate',      name: 'Bate',        type: 'melee', dmg: 38, range: 2.7, cd: 0.62, wide: false, ammo: Infinity, start: Infinity, max: Infinity, hint: 'Clásico de la tribuna' },
  { id: 'cadena',    name: 'Cadena',      type: 'melee', dmg: 22, range: 3.3, cd: 0.42, wide: true,  ammo: Infinity, start: Infinity, max: Infinity, hint: 'Golpea en arco amplio' },
  { id: 'botella',   name: 'Botella',     type: 'proj',  dmg: 24, speed: 24, grav: 14, cd: 0.55, splash: 1.6, start: 14, max: 30, hint: 'Se rompe al impacto' },
  { id: 'bengala',   name: 'Bengala',     type: 'proj',  dmg: 26, speed: 34, grav: 3,  cd: 0.8,  fire: true,  start: 8,  max: 18, hint: 'Deja fuego en el piso' },
  { id: 'papa',      name: 'Papa bomba',  type: 'proj',  dmg: 95, speed: 18, grav: 14, cd: 1.1,  splash: 5.5, fuse: 1.5, start: 3, max: 8, hint: 'Explosiva, ¡cuidado!' },
  { id: 'resortera', name: 'Resortera',   type: 'proj',  dmg: 20, speed: 75, grav: 3,  cd: 0.3,  start: 30, max: 60, hint: 'Piedras rápidas y precisas' }
];

// speed en m/s, hp, rangos de ataque
const ENEMY_TYPES = {
  barrista:  { label: 'Barrista',  hp: 48,  speed: 3.7, score: 10, melee: { dmg: 9,  range: 1.7, cd: 1.1, wind: 0.4 } },
  lanzador:  { label: 'Lanzador',  hp: 34,  speed: 3.3, score: 12, ranged: { proj: 'bottle', dmg: 9,  range: 18, min: 7,  cd: 2.2, speed: 21 } },
  bengalero: { label: 'Bengalero', hp: 40,  speed: 3.1, score: 15, ranged: { proj: 'flare',  dmg: 12, range: 22, min: 9,  cd: 3.0, speed: 28 } },
  jefe:      { label: 'Capo',      hp: 300, speed: 3.5, score: 80, scale: 1.28, melee: { dmg: 24, range: 2.2, cd: 1.0, wind: 0.45 } },
  tombo:     { label: 'Policía',   hp: 75,  speed: 3.5, score: 15, police: true, melee: { dmg: 12, range: 1.9, cd: 0.95, wind: 0.4 } },
  escudo:    { label: 'Antimotines', hp: 120, speed: 2.9, score: 25, police: true, shield: true, melee: { dmg: 14, range: 1.9, cd: 1.2, wind: 0.5 } },
  gas:       { label: 'Gasero',    hp: 65,  speed: 2.9, score: 25, police: true, ranged: { proj: 'gas', dmg: 0, range: 24, min: 11, cd: 5.0, speed: 20 } }
};

const HAIRCUTS = ['rapado', 'mohicano', 'afro', 'melena', 'trenzas', 'rubio', 'degradado', 'gorra', 'capucha', 'pasamontanas', 'calvo'];
const SKINS = ['#f1c9a0', '#d9a273', '#b9805a', '#8a5a3c', '#5e3a26', '#e8b88a'];

const LEVELS = {
  estadio: {
    name: 'Tribuna Popular',
    desc: 'Dentro del estadio. La barra rival invade la tribuna... y la policía no tarda en llegar.',
    waves: [
      { msg: '¡LA BARRA RIVAL INVADE LA TRIBUNA!', sub: 'Defiende tu territorio', spawns: [['barrista', 8], ['lanzador', 3]] },
      { msg: '¡LLEGAN REFUERZOS RIVALES!', sub: 'Cuidado con las bengalas', spawns: [['barrista', 9], ['lanzador', 4], ['bengalero', 3]] },
      { msg: '¡LLEGÓ LA POLICÍA!', sub: 'Los antimotines entran por los túneles', police: true, spawns: [['tombo', 7], ['escudo', 3], ['gas', 3], ['barrista', 5]] },
      { msg: '¡ENTRA EL CAPO RIVAL!', sub: 'Último round: tombos y rivales a la vez', police: true, spawns: [['jefe', 1], ['escudo', 4], ['barrista', 8], ['gas', 3], ['bengalero', 3], ['tombo', 4]] }
    ]
  },
  afueras: {
    name: 'Afueras del Estadio',
    desc: 'La calle, buses incendiados, vallas y el desorden de antes y después del partido.',
    waves: [
      { msg: '¡EMBOSCADA EN LA CALLE!', sub: 'Los rivales bajan de los buses', spawns: [['barrista', 9], ['lanzador', 4]] },
      { msg: '¡VIENEN POR LOS LADOS!', sub: 'Bengalas y botellas', spawns: [['barrista', 9], ['bengalero', 4], ['lanzador', 4]] },
      { msg: '¡LLEGAN LOS ANTIMOTINES!', sub: 'Gases y escudos, ¡a moverse!', police: true, spawns: [['tombo', 8], ['escudo', 4], ['gas', 3], ['barrista', 6]] },
      { msg: '¡EL CAPO Y LA POLICÍA!', sub: 'Aguanta hasta el final', police: true, spawns: [['jefe', 1], ['tombo', 7], ['escudo', 4], ['barrista', 8], ['gas', 3]] }
    ]
  }
};
