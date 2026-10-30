// Personajes low-poly (barristas y policías) y modelos de armas
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];

function lamb(color, extra) {
  return new THREE.MeshLambertMaterial(Object.assign({ color }, extra || {}));
}
function addBox(parent, w, h, d, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}
function addCyl(parent, rt, rb, h, mat, x = 0, y = 0, z = 0, seg = 8) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), mat);
  m.position.set(x, y, z);
  parent.add(m);
  return m;
}

// Todas las armas apuntan a +Y desde el agarre (origen)
function makeWeaponMesh(id, team) {
  const g = new THREE.Group();
  switch (id) {
    case 'bate': {
      const wood = lamb('#b07a3c');
      addCyl(g, 0.05, 0.022, 0.95, wood, 0, 0.47, 0);
      addCyl(g, 0.024, 0.024, 0.14, lamb('#222'), 0, 0.04, 0);
      break;
    }
    case 'cadena': {
      const steel = lamb('#9aa0a8');
      addCyl(g, 0.025, 0.025, 0.2, lamb('#222'), 0, 0.05, 0);
      for (let i = 0; i < 9; i++) {
        const l = addBox(g, 0.05, 0.1, 0.03, steel, 0, 0.18 + i * 0.075, Math.sin(i * 0.5) * 0.05);
        l.rotation.y = i % 2 ? Math.PI / 2 : 0;
      }
      addBox(g, 0.09, 0.09, 0.09, steel, 0, 0.88, 0.04);
      break;
    }
    case 'botella': {
      const glass = lamb('#2c8f48', { emissive: 0x0a2a10 });
      addCyl(g, 0.045, 0.048, 0.22, glass, 0, 0.11, 0, 10);
      addCyl(g, 0.018, 0.04, 0.1, glass, 0, 0.27, 0, 10);
      addCyl(g, 0.02, 0.02, 0.03, lamb('#d6b24a'), 0, 0.335, 0, 8);
      addCyl(g, 0.049, 0.049, 0.08, lamb('#f2efe0'), 0, 0.11, 0, 10);
      break;
    }
    case 'bengala': {
      addCyl(g, 0.025, 0.025, 0.38, lamb('#c0392b'), 0, 0.19, 0);
      const tip = addCyl(g, 0.03, 0.025, 0.04, lamb('#ffb347', { emissive: 0xff7a00 }), 0, 0.4, 0);
      tip.name = 'tip';
      break;
    }
    case 'papa': {
      addCyl(g, 0.05, 0.05, 0.2, lamb('#b8321f'), 0, 0.1, 0, 10);
      addCyl(g, 0.052, 0.052, 0.03, lamb('#e9d36a'), 0, 0.12, 0, 10);
      const fuse = addCyl(g, 0.006, 0.006, 0.09, lamb('#222'), 0, 0.245, 0, 4);
      const tip = addBox(g, 0.02, 0.02, 0.02, lamb('#ffd34a', { emissive: 0xffa000 }), 0, 0.3, 0);
      tip.name = 'tip';
      break;
    }
    case 'resortera': {
      const wood = lamb('#8a5a2c');
      addCyl(g, 0.025, 0.03, 0.22, wood, 0, 0.1, 0);
      const l = addCyl(g, 0.02, 0.02, 0.2, wood, -0.07, 0.28, 0); l.rotation.z = -0.5;
      const r = addCyl(g, 0.02, 0.02, 0.2, wood, 0.07, 0.28, 0); r.rotation.z = 0.5;
      addBox(g, 0.18, 0.012, 0.012, lamb('#222'), 0, 0.37, 0).name = 'band';
      break;
    }
    case 'bandera': {
      addCyl(g, 0.02, 0.02, 1.6, lamb('#d8d2c2'), 0, 0.8, 0);
      const f = addBox(g, 0.02, 0.4, 0.7, lamb(team ? team.pri : '#cc2222', { side: THREE.DoubleSide }), 0, 1.35, 0.35);
      addBox(g, 0.022, 0.12, 0.7, lamb(team ? team.sec : '#ffffff'), 0, 1.35, 0.35);
      break;
    }
    case 'baton': {
      addCyl(g, 0.028, 0.028, 0.65, lamb('#101010'), 0, 0.32, 0);
      break;
    }
    case 'lanzagas': {
      addCyl(g, 0.07, 0.07, 0.65, lamb('#3b4a3a'), 0, 0.3, 0, 10);
      addCyl(g, 0.09, 0.07, 0.1, lamb('#222'), 0, 0.65, 0, 10);
      break;
    }
    case 'piedra': {
      const s = new THREE.Mesh(new THREE.DodecahedronGeometry(0.07, 0), lamb('#777'));
      g.add(s);
      break;
    }
  }
  return g;
}

function makeCharacter(o) {
  const scale = o.scale || 1;
  const root = new THREE.Group();
  const g = new THREE.Group();
  root.add(g);
  g.scale.setScalar(scale);
  const police = !!o.police;
  const team = o.team;
  const skin = lamb(o.skin || '#d9a273');
  const mats = [skin];
  const M = (c, e) => { const m = lamb(c, e); mats.push(m); return m; };

  // Sombra falsa
  const shadow = new THREE.Mesh(new THREE.CircleGeometry(0.5 * scale, 14), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.35, depthWrite: false }));
  shadow.rotation.x = -Math.PI / 2; shadow.position.y = 0.03;
  root.add(shadow);

  // Piernas
  const legs = [];
  const pantsColor = police ? '#1b232c' : pick(['#2a3b57', '#1d1d1d', '#3b4f73', '#4a4a4f', '#222a3a']);
  const shorts = !police && Math.random() < 0.25;
  for (const s of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(s * 0.13, 0.86, 0);
    g.add(leg);
    if (shorts) {
      addBox(leg, 0.21, 0.4, 0.23, M(team ? team.pri : pantsColor), 0, -0.2, 0);
      addBox(leg, 0.17, 0.3, 0.19, skin, 0, -0.55, 0);
      addBox(leg, 0.2, 0.15, 0.3, M('#f2f2f2'), 0, -0.78, 0.03);
    } else {
      addBox(leg, 0.21, 0.72, 0.23, M(pantsColor), 0, -0.36, 0);
      addBox(leg, 0.22, 0.16, 0.32, M(police ? '#0b0b0b' : pick(['#f2f2f2', '#111', '#e24a2c'])), 0, -0.78, 0.04);
    }
    legs.push(leg);
  }

  // Torso
  let torsoMat;
  if (police) torsoMat = new THREE.MeshLambertMaterial({ map: Tex.policeVest() });
  else torsoMat = new THREE.MeshLambertMaterial({ map: Tex.jersey(team) });
  mats.push(torsoMat);
  addBox(g, 0.52, 0.64, 0.29, torsoMat, 0, 1.18, 0);
  if (police) addBox(g, 0.54, 0.1, 0.31, M('#0f1419'), 0, 0.9, 0);

  // Brazos (pivotes en hombro)
  const arms = [];
  const sleeve = police ? '#1d2630' : team.sleeve;
  for (const s of [-1, 1]) {
    const arm = new THREE.Group();
    arm.position.set(s * 0.34, 1.46, 0);
    g.add(arm);
    addBox(arm, 0.15, 0.3, 0.15, M(sleeve), 0, -0.15, 0);
    addBox(arm, 0.13, 0.34, 0.13, police ? M('#1d2630') : skin, 0, -0.47, 0);
    addBox(arm, 0.13, 0.1, 0.13, police ? M('#111') : skin, 0, -0.67, 0);
    arms.push(arm);
  }
  const armR = arms[1], armL = arms[0];

  // Cabeza
  const head = new THREE.Group();
  head.position.set(0, 1.5, 0);
  g.add(head);
  addBox(head, 0.26, 0.28, 0.26, skin, 0, 0.14, 0);
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x111111 });
  addBox(head, 0.04, 0.035, 0.01, eyeMat, -0.06, 0.17, 0.131);
  addBox(head, 0.04, 0.035, 0.01, eyeMat, 0.06, 0.17, 0.131);
  addBox(head, 0.07, 0.025, 0.01, M(o.female ? '#c2415a' : '#8a4b3a'), 0, 0.07, 0.131);
  if (o.female) {
    addBox(head, 0.05, 0.012, 0.01, eyeMat, -0.06, 0.205, 0.131);
    addBox(head, 0.05, 0.012, 0.01, eyeMat, 0.06, 0.205, 0.131);
    g.scale.set(scale * 0.93, scale, scale * 0.93);
  }

  const hairColor = o.hairColor || pick(['#111111', '#1a1209', '#3a2412', '#5a3a1e']);
  const hair = M(hairColor);
  const kind = police ? 'casco' : o.hair;

  switch (kind) {
    case 'rapado':
      addBox(head, 0.27, 0.04, 0.27, M('#2a2018'), 0, 0.29, 0);
      break;
    case 'degradado':
      addBox(head, 0.27, 0.09, 0.27, hair, 0, 0.3, 0);
      addBox(head, 0.275, 0.07, 0.275, M('#3a2f27'), 0, 0.2, -0.005);
      break;
    case 'mohicano': {
      const c = pick(['#e11d48', '#f59e0b', '#111111', team ? team.pri : '#e11d48']);
      addBox(head, 0.06, 0.16, 0.3, M(c), 0, 0.36, 0);
      addBox(head, 0.27, 0.03, 0.27, M('#2a2018'), 0, 0.29, 0);
      break;
    }
    case 'afro': {
      const afro = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), hair);
      afro.position.set(0, 0.3, -0.01);
      head.add(afro);
      break;
    }
    case 'melena':
      addBox(head, 0.29, 0.1, 0.29, hair, 0, 0.31, 0);
      addBox(head, 0.29, 0.5, 0.08, hair, 0, 0.05, -0.15);
      addBox(head, 0.06, 0.34, 0.2, hair, -0.15, 0.1, -0.03);
      addBox(head, 0.06, 0.34, 0.2, hair, 0.15, 0.1, -0.03);
      break;
    case 'trenzas':
      addBox(head, 0.27, 0.05, 0.27, hair, 0, 0.29, 0);
      for (let i = -2; i <= 2; i++) addBox(head, 0.025, 0.03, 0.27, M('#000'), i * 0.05, 0.325, 0);
      addBox(head, 0.04, 0.3, 0.04, hair, -0.1, 0.0, -0.15);
      addBox(head, 0.04, 0.3, 0.04, hair, 0.1, 0.0, -0.15);
      break;
    case 'colita':
      addBox(head, 0.29, 0.1, 0.29, hair, 0, 0.31, 0);
      addBox(head, 0.1, 0.1, 0.1, M(team ? team.sec : '#fff'), 0, 0.22, -0.17);
      addBox(head, 0.09, 0.34, 0.09, hair, 0, 0.04, -0.19);
      break;
    case 'rubio':
      addBox(head, 0.28, 0.1, 0.28, M('#f1e08a'), 0, 0.31, 0);
      addBox(head, 0.28, 0.12, 0.06, M('#f1e08a'), 0, 0.2, -0.13);
      break;
    case 'gorra':
      addBox(head, 0.285, 0.11, 0.285, M(team.pri), 0, 0.31, 0);
      addBox(head, 0.26, 0.025, 0.17, M(team.sec), 0, 0.27, 0.2);
      break;
    case 'capucha': {
      const hood = M(pick(['#222222', '#2b2f3a', team.sec === '#ffffff' ? '#3a3a3a' : team.sec]));
      addBox(head, 0.3, 0.1, 0.3, hood, 0, 0.32, 0);
      addBox(head, 0.3, 0.3, 0.07, hood, 0, 0.15, -0.14);
      addBox(head, 0.06, 0.3, 0.25, hood, -0.15, 0.15, 0);
      addBox(head, 0.06, 0.3, 0.25, hood, 0.15, 0.15, 0);
      break;
    }
    case 'pasamontanas': {
      const b = M('#141414');
      addBox(head, 0.29, 0.3, 0.29, b, 0, 0.14, 0);
      addBox(head, 0.2, 0.06, 0.01, skin, 0, 0.17, 0.148);
      addBox(head, 0.03, 0.03, 0.01, eyeMat, -0.06, 0.17, 0.155);
      addBox(head, 0.03, 0.03, 0.01, eyeMat, 0.06, 0.17, 0.155);
      break;
    }
    case 'calvo':
      addBox(head, 0.275, 0.12, 0.05, hair, 0, 0.06, 0.135); // barba
      addBox(head, 0.09, 0.05, 0.02, hair, 0, 0.1, 0.14);
      break;
    case 'casco': {
      const hel = M('#e8eaee');
      addBox(head, 0.31, 0.16, 0.31, hel, 0, 0.3, 0);
      addBox(head, 0.31, 0.2, 0.06, hel, 0, 0.14, -0.14);
      addBox(head, 0.27, 0.14, 0.02, new THREE.MeshLambertMaterial({ color: 0x223344, transparent: true, opacity: 0.6 }), 0, 0.17, 0.16);
      break;
    }
  }

  // Accesorios del barrista
  if (!police) {
    if (o.scarf) addBox(g, 0.34, 0.1, 0.34, M(pick([team.pri, team.sec])), 0, 1.52, 0);
    if (o.bandana && kind !== 'pasamontanas') addBox(head, 0.27, 0.12, 0.27, M(team.sec === '#ffffff' ? team.pri : team.sec), 0, 0.06, 0.005);
    if (o.cape) {
      const flag = new THREE.Group();
      flag.position.set(0, 1.46, -0.16);
      addBox(flag, 0.56, 0.7, 0.025, M(team.pri), 0, -0.35, 0);
      addBox(flag, 0.56, 0.14, 0.03, M(team.sec), 0, -0.35, 0);
      flag.rotation.x = 0.12;
      g.add(flag);
    }
    if (o.shades) addBox(head, 0.28, 0.05, 0.03, new THREE.MeshBasicMaterial({ color: 0x050505 }), 0, 0.17, 0.14);
    if (o.chain) addBox(g, 0.12, 0.12, 0.02, M('#d4b23a'), 0, 1.38, 0.15);
  }

  // Armas en mano
  if (o.weapon) {
    const w = makeWeaponMesh(o.weapon, team);
    w.position.set(0, -0.67, 0.02);
    w.rotation.x = 1.15;
    if (o.weapon === 'bandera') w.rotation.x = 0.35;
    armR.add(w);
  }

  // Escudo antimotines
  if (o.shield) {
    const sh = new THREE.Group();
    addBox(sh, 0.8, 1.15, 0.05, new THREE.MeshLambertMaterial({ map: Tex.bluePolice(), transparent: true, opacity: 0.85, color: 0xbad4ff }), 0, 0, 0);
    addBox(sh, 0.82, 0.05, 0.07, M('#111'), 0, 0.6, 0);
    addBox(sh, 0.82, 0.05, 0.07, M('#111'), 0, -0.6, 0);
    sh.position.set(0, -0.35, 0.28);
    armL.add(sh);
    armL.rotation.x = -1.1;
    root.userData.shieldArm = armL;
  }

  root.userData = Object.assign(root.userData, { mats, legs, armR, armL, head, g, shadow, torso: torsoMat });
  return root;
}

function flashChar(root, amt) {
  const m = root.userData.mats;
  for (let i = 0; i < m.length; i++) m[i].emissive.setRGB(amt, amt * 0.1, amt * 0.1);
  root.userData.torso.emissive.setRGB(amt, amt * 0.1, amt * 0.1);
}

function disposeObject(o) {
  o.traverse(c => {
    if (c.geometry) c.geometry.dispose();
    if (c.material) (Array.isArray(c.material) ? c.material : [c.material]).forEach(m => m.dispose());
  });
}

// Genera un barrista con apariencia aleatoria del equipo dado
function randomBarrista(team, type) {
  const jefe = type === 'jefe';
  const lanzador = type === 'lanzador';
  const bengalero = type === 'bengalero';
  const weapon = jefe ? 'bate' : lanzador ? 'botella' : bengalero ? 'bengala' : pick(['bate', 'cadena', 'bandera', 'botella', 'bate']);
  return makeCharacter({
    team, scale: jefe ? 1.28 : rand(0.95, 1.06),
    skin: pick(SKINS), hair: jefe ? 'calvo' : pick(HAIRCUTS),
    scarf: Math.random() < 0.4, bandana: Math.random() < 0.3,
    cape: jefe || Math.random() < 0.3, shades: jefe || Math.random() < 0.15, chain: jefe || Math.random() < 0.12,
    weapon
  });
}

// Compañera de la barra del jugador (femenina, con la camiseta del equipo)
function randomAlly(team, ranged) {
  return makeCharacter({
    team, female: true, scale: rand(0.95, 1.0), skin: pick(SKINS),
    hair: pick(['melena', 'colita', 'colita', 'trenzas', 'rubio', 'afro', 'gorra']),
    hairColor: pick(['#111111', '#3a2412', '#7a4a22', '#b5651d']),
    scarf: Math.random() < 0.5, bandana: Math.random() < 0.3, cape: Math.random() < 0.5,
    weapon: ranged ? 'botella' : pick(['bate', 'cadena', 'bandera'])
  });
}

function randomPolice(type) {
  const shield = type === 'escudo';
  return makeCharacter({
    police: true, scale: rand(0.98, 1.06), skin: pick(SKINS), shield,
    weapon: type === 'gas' ? 'lanzagas' : 'baton'
  });
}

// Animación procedural de caminata/ataque
function animateChar(root, t, moveAmt, atk, armsUp) {
  const u = root.userData;
  const sw = Math.sin(t * 9) * 0.7 * moveAmt;
  u.legs[0].rotation.x = sw;
  u.legs[1].rotation.x = -sw;
  if (u.shieldArm) { u.armL.rotation.x = -1.1; } else { u.armL.rotation.x = -sw * 0.8; }
  // atk: 0..1 progreso de ataque (<0 = sin ataque)
  if (atk >= 0) {
    const a = atk < 0.55 ? -0.4 - (atk / 0.55) * 2.6 : -3.0 + ((atk - 0.55) / 0.45) * 2.7;
    u.armR.rotation.x = a;
  } else {
    u.armR.rotation.x = sw * 0.8 + (armsUp ? -0.8 : 0);
  }
  u.g.position.y = Math.abs(Math.sin(t * 9)) * 0.04 * moveAmt;
}
