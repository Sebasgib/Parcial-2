// Construcción de escenarios: dentro del estadio y afueras
const L = (color, map, extra) => new THREE.MeshLambertMaterial(Object.assign({ color: color, map: map || null }, extra || {}));

function newWorld(scene) {
  return {
    scene, obs: [], spawnRival: [], spawnPolice: [], spawnAlly: [], emitters: [], alarmLights: [], flickers: [], pickSpots: [],
    playerStart: { x: 0, y: 0, z: 0, yaw: 0 }, bounds: { minx: -40, maxx: 40, minz: -40, maxz: 40 }
  };
}

function solid(W, o) {
  const y = o.y || 0;
  if (o.visible !== false) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(o.w, o.h, o.d), o.mat);
    m.position.set(o.x, y + o.h / 2, o.z);
    W.scene.add(m);
  }
  if (o.collide !== false) W.obs.push({ minx: o.x - o.w / 2, maxx: o.x + o.w / 2, minz: o.z - o.d / 2, maxz: o.z + o.d / 2, base: y, top: y + o.h });
}

function plane(scene, w, d, mat, x, y, z) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y, z);
  scene.add(m);
  return m;
}

function stars(scene) {
  const g = new THREE.BufferGeometry();
  const p = [];
  for (let i = 0; i < 400; i++) {
    const a = Math.random() * Math.PI * 2, e = Math.random() * 1.2 + 0.15, r = 450;
    p.push(Math.cos(a) * Math.cos(e) * r, Math.sin(e) * r, Math.sin(a) * Math.cos(e) * r);
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
  scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, fog: false })));
}

function lightTower(scene, x, z, h) {
  const t = new THREE.Mesh(new THREE.BoxGeometry(1.6, h, 1.6), L('#444'));
  t.position.set(x, h / 2, z); scene.add(t);
  const panel = new THREE.Mesh(new THREE.BoxGeometry(14, 6, 1), new THREE.MeshBasicMaterial({ color: 0xfff4d0, fog: false }));
  panel.position.set(x, h + 2, z); panel.lookAt(0, h, 0); scene.add(panel);
}

// ───────────────────────── ESTADIO ─────────────────────────
function buildStadium(scene, own, rival) {
  const W = newWorld(scene);
  const HX = 70;          // semiancho de la tribuna
  const BZ = 58;          // pared trasera de la tribuna
  const PZ1 = -196;       // fondo de la cancha
  scene.background = new THREE.Color(0x0a0f1f);
  scene.fog = new THREE.FogExp2(0x0a0f1f, 0.0042);
  stars(scene);

  scene.add(new THREE.HemisphereLight(0x9fb4ff, 0x33333c, 0.9));
  const sun = new THREE.DirectionalLight(0xe8eeff, 0.65);
  sun.position.set(25, 60, 20); scene.add(sun);
  [[-40, 12, 14], [40, 12, 14], [0, 12, 40], [0, 12, -2]].forEach(p => {
    const l = new THREE.PointLight(0xffd9a0, 0.6, 70); l.position.set(p[0], p[1], p[2]); scene.add(l);
  });

  const conc = L('#ffffff', Tex.concrete([28, 8]));
  const concDark = L('#9a9aa0', Tex.concrete([10, 3]));
  const wallGraf = L('#ffffff', Tex.graffiti(1));

  // Terreno general
  plane(scene, 700, 700, L('#1b1b20'), 0, -0.05, 0);
  plane(scene, HX * 2, 3.4, conc, 0, 0.01, -25.5);

  // Gradas escalonadas hacia el campo
  for (let i = 0; i < 10; i++) {
    solid(W, { x: 0, z: -24 + 1.6 * i + 0.8, y: 0, w: HX * 2, d: 1.6, h: 0.3 * (i + 1), mat: i % 2 ? conc : concDark });
  }
  // Plataforma superior (grande)
  solid(W, { x: 0, z: (-8 + BZ) / 2, y: 0, w: HX * 2, d: BZ + 8, h: 3, mat: conc });

  // Reja con dos compuertas abiertas para entrar a la cancha
  const fenceSegs = [[-HX, -34], [-26, 26], [34, HX]];
  fenceSegs.forEach(s => {
    const len = s[1] - s[0], cx = (s[0] + s[1]) / 2;
    solid(W, { x: cx, z: -27.2, y: 0, w: len, d: 0.4, h: 3.2, mat: L('#555'), visible: false });
    const ft = Tex.fence(); ft.repeat.set(len / 2, 1.6);
    const fm = new THREE.Mesh(new THREE.PlaneGeometry(len, 3.2), new THREE.MeshBasicMaterial({ map: ft, transparent: true, side: THREE.DoubleSide }));
    fm.position.set(cx, 1.6, -27.2); scene.add(fm);
    solid(W, { x: cx, z: -27.2, y: 3.1, w: len, d: 0.3, h: 0.12, mat: L('#333'), collide: false });
  });
  [-HX, -34, -26, 26, 34, HX].forEach(x => solid(W, { x, z: -27.2, y: 0, w: 0.3, d: 0.3, h: 3.6, mat: L('#333'), collide: false }));
  [-30, 30].forEach(gx => {
    const sg = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.2), new THREE.MeshBasicMaterial({ map: Tex.sign('A LA CANCHA', '#101216', '#f5c518') }));
    sg.position.set(gx, 4.4, -27.2); scene.add(sg);
  });

  // Campo de juego accesible (con borde de pasto y tablas alrededor)
  plane(scene, HX * 2 + 10, 170, L('#2b6e31'), 0, -0.03, -113);
  plane(scene, 112, 156, L('#ffffff', Tex.pitch()), 0, -0.02, -113);
  const board = L('#222831');
  solid(W, { x: 0, z: PZ1 - 0.5, y: 0, w: HX * 2 + 12, d: 1, h: 2.6, mat: board });
  solid(W, { x: -HX - 0.5 - 4, z: (-28 + PZ1) / 2, y: 0, w: 9, d: 170, h: 2.6, mat: board });
  solid(W, { x: HX + 0.5 + 4, z: (-28 + PZ1) / 2, y: 0, w: 9, d: 170, h: 2.6, mat: board });
  const adCols = [['#e11d48', '#111'], ['#0ea5e9', '#fff'], ['#f59e0b', '#111'], ['#10b981', '#fff']];
  ['AGUARDIENTE', 'BANCO', 'CERVEZA', 'GOL TV', 'ARROZ', 'RADIO', 'CAFÉ', 'SEGUROS'].forEach((t, i) => {
    const c = adCols[i % 4];
    const ad = new THREE.Mesh(new THREE.PlaneGeometry(14, 1.8), new THREE.MeshBasicMaterial({ map: Tex.sign(t, c[0], c[1]) }));
    ad.position.set(-HX + 10 + i * 18.5, 1.0, PZ1 + 0.05); scene.add(ad);
  });
  // Arco del fondo
  const post = L('#f2f2f2');
  [-4, 4].forEach(px => { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 2.5, 6), post); p.position.set(px, 1.25, PZ1 + 3); scene.add(p); });
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 8, 6), post); bar.rotation.z = Math.PI / 2; bar.position.set(0, 2.5, PZ1 + 3); scene.add(bar);

  // Tribunas lejanas con hinchada
  const crowdTex = Tex.crowd(own.pri, rival.pri); crowdTex.repeat.set(4, 1);
  const crowdMat = L('#ffffff', crowdTex, { emissiveMap: crowdTex, emissive: 0x888888 });
  for (let i = 0; i < 10; i++) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(240, 2.4 * (i + 1), 4), crowdMat);
    m.position.set(0, 1.2 * (i + 1), PZ1 - 6 - i * 4); scene.add(m);
  }
  for (let i = 0; i < 8; i++) {
    [-1, 1].forEach(s => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(4, 2.4 * (i + 1), 170), crowdMat);
      m.position.set(s * (HX + 10 + i * 4), 1.2 * (i + 1), -113); scene.add(m);
    });
  }

  // Torres de luz
  [[-105, -40], [105, -40], [-105, -190], [105, -190]].forEach(p => lightTower(scene, p[0], p[1], 40));

  // Muros laterales cerrando la tribuna
  solid(W, { x: -HX - 2.5, z: (-28 + BZ + 2) / 2, y: 0, w: 5, d: BZ + 30, h: 14, mat: wallGraf });
  solid(W, { x: HX + 2.5, z: (-28 + BZ + 2) / 2, y: 0, w: 5, d: BZ + 30, h: 14, mat: wallGraf });
  // Muro trasero con túneles (vomitorios)
  const tunnelX = [-50, -25, 0, 25, 50];
  const segs = [[-HX - 5, -53], [-47, -28], [-22, -3], [3, 22], [28, 47], [53, HX + 5]];
  segs.forEach(s => solid(W, { x: (s[0] + s[1]) / 2, z: BZ + 1, y: 0, w: s[1] - s[0], d: 2, h: 14, mat: wallGraf }));
  tunnelX.forEach(tx => {
    solid(W, { x: tx, z: BZ + 3, y: 3, w: 6, d: 6, h: 6, mat: new THREE.MeshBasicMaterial({ color: 0x020204 }), collide: false });
    solid(W, { x: tx, z: BZ + 1, y: 9, w: 6, d: 2, h: 5, mat: wallGraf, collide: false });
  });
  W.spawnRival.push({ x: -50, y: 3, z: BZ - 1.5 }, { x: -25, y: 3, z: BZ - 1.5 }, { x: -66, y: 3, z: 14 }, { x: -66, y: 3, z: 40 });
  W.spawnPolice.push({ x: 0, y: 3, z: BZ - 1.5 }, { x: 25, y: 3, z: BZ - 1.5 }, { x: 50, y: 3, z: BZ - 1.5 }, { x: -25, y: 3, z: BZ - 1.5 });
  W.spawnAlly.push({ x: 50, y: 3, z: BZ - 1.5 }, { x: 66, y: 3, z: 30 }, { x: 66, y: 3, z: 8 });

  // Luces de alarma de la policía
  const red = new THREE.PointLight(0xff2020, 0, 60); red.position.set(-5, 8, BZ - 8);
  const blue = new THREE.PointLight(0x2050ff, 0, 60); blue.position.set(5, 8, BZ - 8);
  scene.add(red, blue); W.alarmLights.push(red, blue);

  // Techo y columnas
  solid(W, { x: 0, z: 28, y: 15, w: HX * 2 + 6, d: 72, h: 0.8, mat: L('#1c1c22'), collide: false });
  [-60, -36, -12, 12, 36, 60].forEach(px => [-4, 30].forEach(pz => solid(W, { x: px, z: pz, y: 3, w: 1.3, d: 1.3, h: 12, mat: concDark })));
  for (let x = -60; x <= 60; x += 20) for (let z = 4; z <= 52; z += 24) solid(W, { x, z, y: 14.4, w: 3, d: 0.6, h: 0.5, mat: new THREE.MeshBasicMaterial({ color: 0xfff1c9 }), collide: false });

  // Gradas con asientos
  const seatOwn = L(own.pri), seatRival = L(rival.pri);
  [18, 26, 34, 42].forEach((z, row) => {
    for (let x = -HX + 4 + (row % 2 ? 5 : 0); x < HX - 3; x += 10) {
      if (Math.abs(x) < 4) continue;
      solid(W, { x, z, y: 3, w: 7, d: 0.8, h: 0.55, mat: x > 0 ? seatOwn : seatRival });
    }
  });
  // Cajas para cubrirse
  [[-20, 12], [20, 10], [-45, 16], [45, 20], [10, 46], [-10, 46], [-35, 32], [35, 36], [0, 30], [-62, 12], [62, 28], [-55, 50], [55, 50]]
    .forEach(c => solid(W, { x: c[0], z: c[1], y: 3, w: 1.6, d: 1.6, h: 1.2, mat: L('#8a6a3f') }));

  // Trapos / banderas de las barras
  const mkBanner = (text, c1, c2, x, y, z, w, ry) => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(w, w * 0.3), new THREE.MeshBasicMaterial({ map: Tex.banner(text, c1, c2) }));
    b.position.set(x, y, z); b.rotation.y = ry; scene.add(b);
  };
  mkBanner('AGUANTE ' + own.short.toUpperCase(), own.pri, '#101010', 36, 8.5, BZ - 0.1, 40, Math.PI);
  mkBanner(rival.short.toUpperCase() + ' PRESENTE', rival.pri, '#101010', -36, 8.5, BZ - 0.1, 40, Math.PI);
  mkBanner('LA BARRA NUNCA SE RINDE', '#222', own.pri, HX - 0.1, 7.5, 24, 40, -Math.PI / 2);
  mkBanner('DE LOCAL SIEMPRE', '#222', rival.pri, -HX + 0.1, 7.5, 24, 40, Math.PI / 2);

  // Humo de bengalas de las barras
  [[52, 10], [30, 50], [62, 36], [14, 24]].forEach(p => W.emitters.push({ kind: 'smoke', x: p[0], y: 3.2, z: p[1], color: own.pri, rate: 12 }));
  [[-52, 10], [-30, 50], [-62, 36], [-14, 24]].forEach(p => W.emitters.push({ kind: 'smoke', x: p[0], y: 3.2, z: p[1], color: rival.pri, rate: 12 }));

  W.pickSpots = [
    [0, 3, 10], [-30, 3, 22], [30, 3, 22], [-55, 3, 30], [55, 3, 30], [-15, 3, 38], [15, 3, 38], [0, 3, 50], [-45, 3, 6], [45, 3, 6], [-60, 3, 46], [60, 3, 46],
    [0, 1.8, -16], [-30, 1.8, -16], [30, 1.8, -16], [0, 0, -60], [-40, 0, -100], [40, 0, -100], [0, 0, -140], [-40, 0, -170], [40, 0, -170]
  ];
  W.playerStart = { x: 38, y: 3, z: 14, yaw: Math.PI / 2 };
  W.bounds = { minx: -HX - 4, maxx: HX + 4, minz: PZ1 + 0.6, maxz: BZ - 0.8 };
  W.sky = 'estadio';
  return W;
}

// ───────────────────────── AFUERAS ─────────────────────────
function buildStreet(scene, own, rival) {
  const W = newWorld(scene);
  const HX = 74, ZF = -35.5, ZB = 80;
  scene.background = new THREE.Color(0x2a1b3d);
  scene.fog = new THREE.FogExp2(0x2a1b3d, 0.008);
  stars(scene);

  scene.add(new THREE.HemisphereLight(0xc0a8ff, 0x3a2d40, 1.05));
  const sun = new THREE.DirectionalLight(0xffa56a, 0.75);
  sun.position.set(-60, 25, 30); scene.add(sun);

  plane(scene, 600, 600, L('#ffffff', Tex.asphalt([80, 80])), 0, 0, 0);
  // Marcas viales
  for (let x = -HX; x < HX; x += 6) { plane(scene, 3, 0.25, L('#e8e1a0'), x, 0.01, 6); plane(scene, 3, 0.25, L('#e8e1a0'), x, 0.01, 52); }
  plane(scene, HX * 2, 0.2, L('#dddddd'), 0, 0.01, 17);
  plane(scene, HX * 2, 0.2, L('#dddddd'), 0, 0.01, 63);

  const conc = L('#ffffff', Tex.concrete([30, 2]));
  const win = L('#ffffff', Tex.windows([4, 1]));

  // Andén frente al estadio
  solid(W, { x: 0, z: -33, y: 0, w: 170, d: 8, h: 0.18, mat: conc });
  // Fachada del estadio con cinco puertas
  const facade = L('#ffffff', Tex.graffiti(2));
  solid(W, { x: 0, z: -40, y: 0, w: 190, d: 4, h: 16, mat: facade });
  const gateMat = new THREE.MeshBasicMaterial({ color: 0x050508 });
  const gateNames = ['OCCIDENTAL', 'SUR', 'NORTE', 'ORIENTAL', 'ESTE'];
  [-60, -30, 0, 30, 60].forEach((gx, gi) => {
    solid(W, { x: gx, z: -37.8, y: 0, w: 9, d: 0.3, h: 6, mat: gateMat, collide: false });
    for (let i = -4; i <= 4; i += 1) solid(W, { x: gx + i * 0.95, z: -37.6, y: 0, w: 0.12, d: 0.12, h: 6, mat: L('#555'), collide: false });
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(9, 2.2), new THREE.MeshBasicMaterial({ map: Tex.sign('PUERTA ' + gateNames[gi], '#101216', '#f5c518') }));
    sign.position.set(gx, 8, -37.8); scene.add(sign);
  });
  const big = new THREE.Mesh(new THREE.PlaneGeometry(50, 9), new THREE.MeshBasicMaterial({ map: Tex.banner('ESTADIO · DE LOCAL', own.pri, '#101010') }));
  big.position.set(-15, 12.2, -37.8); scene.add(big);
  const big2 = new THREE.Mesh(new THREE.PlaneGeometry(40, 8), new THREE.MeshBasicMaterial({ map: Tex.banner('AGUANTE ' + own.short.toUpperCase(), '#222', own.pri) }));
  big2.position.set(52, 12.2, -37.8); scene.add(big2);
  solid(W, { x: 0, z: -70, y: 0, w: 220, d: 40, h: 26, mat: L('#3a3a42'), collide: false });
  lightTower(scene, -80, -56, 38); lightTower(scene, 80, -56, 38); lightTower(scene, 0, -56, 40);

  // Edificios laterales y del fondo
  [-30, -6, 18, 42, 66, 90].forEach((bz, i) => {
    solid(W, { x: -86, z: bz, y: 0, w: 14, d: 22, h: 16 + (i * 7) % 12, mat: win });
    solid(W, { x: 86, z: bz, y: 0, w: 14, d: 22, h: 18 + (i * 5) % 10, mat: win });
  });
  [-66, -42, -18, 6, 30, 54, 78].forEach((bx, i) => solid(W, { x: bx, z: 93, y: 0, w: 22, d: 16, h: 16 + (i % 3) * 7, mat: win }));

  // Casetas
  const kiosk = (x, z, label, col) => {
    solid(W, { x, z, y: 0, w: 4, d: 3, h: 3.2, mat: L(col) });
    const s = new THREE.Mesh(new THREE.PlaneGeometry(4, 1), new THREE.MeshBasicMaterial({ map: Tex.sign(label, '#101216', '#f5c518') }));
    s.position.set(x, 2.6, z + 1.52); scene.add(s);
  };
  kiosk(-45, -30, 'BOLETERÍA', '#6b7280'); kiosk(-15, -30, 'EMPANADAS', '#b45309'); kiosk(15, -30, 'BOLETERÍA', '#6b7280');
  kiosk(45, -30, 'CERVEZA', '#2f6b3a'); kiosk(-70, -30, 'TIENDA', '#1e5aa8'); kiosk(70, -30, 'CHUZOS', '#9a3412');

  // Buses
  let busLights = 0;
  const bus = (x, z, ry, col, burning) => {
    const along = ry ? [2.8, 12] : [12, 2.8];
    solid(W, { x, z, y: 0.5, w: along[0], d: along[1], h: 2.8, mat: L(col) });
    const band = new THREE.Mesh(new THREE.BoxGeometry(along[0] + 0.05, 0.9, along[1] + 0.05), new THREE.MeshLambertMaterial({ color: burning ? 0x1a0e08 : 0x223344, emissive: burning ? 0x331100 : 0x0a141f }));
    band.position.set(x, 2.5, z); scene.add(band);
    for (let i = -1; i <= 1; i += 2) for (let j = -1; j <= 1; j += 2) {
      const wm = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.4, 10), L('#111'));
      if (ry) wm.rotation.x = Math.PI / 2; else wm.rotation.z = Math.PI / 2;
      wm.position.set(x + (ry ? i * 1.4 : j * 3.6), 0.55, z + (ry ? j * 3.6 : i * 1.4));
      scene.add(wm);
    }
    if (burning) {
      W.emitters.push({ kind: 'fire', x: x - (ry ? 0 : 2), y: 3.2, z, color: '#ff8a1e', rate: 36 });
      W.emitters.push({ kind: 'fire', x: x + (ry ? 0 : 2.5), y: 3.0, z: z + (ry ? 2 : 0), color: '#ff6a00', rate: 26 });
      W.emitters.push({ kind: 'smoke', x, y: 3.5, z, color: '#222222', rate: 14 });
      if (busLights < 2) { busLights++; const fl = new THREE.PointLight(0xff7a20, 1.4, 34); fl.position.set(x, 3, z); scene.add(fl); W.flickers.push(fl); }
    }
  };
  bus(-30, -8, 0, '#c1121f', true);
  bus(40, 26, 90, '#1f45a8', false);
  bus(-58, 38, 90, '#e2a400', true);
  bus(58, -8, 0, '#2f6b3a', false);
  bus(10, 66, 0, '#cc5a1a', false);

  // Vallas de la policía
  const vallaMat = L('#f2c500');
  for (let x = -48; x <= 48; x += 4) if (Math.abs(x) >= 3) solid(W, { x, z: -24, y: 0, w: 3, d: 0.3, h: 1.1, mat: vallaMat });
  for (let x = -66; x <= 66; x += 4) if (Math.abs(x) >= 22) solid(W, { x, z: 30, y: 0, w: 3, d: 0.3, h: 1.1, mat: vallaMat });
  // Bloques de concreto, contenedores y carros
  [[-12, 4], [14, -6], [48, -14], [-52, 14], [8, 44], [-40, 54], [30, 58], [-20, 36], [62, 44], [-66, 60], [22, 12], [-6, 70]]
    .forEach(c => solid(W, { x: c[0], z: c[1], y: 0, w: 2.4, d: 1, h: 1.1, mat: conc }));
  [[-6, -16], [-46, -22], [52, 36], [-30, 72], [66, 20], [24, 46]].forEach(c => solid(W, { x: c[0], z: c[1], y: 0, w: 3, d: 1.6, h: 1.5, mat: L('#2b6a4a') }));
  const car = (x, z, col, ry) => {
    const w = ry ? 1.9 : 4.2, d = ry ? 4.2 : 1.9;
    solid(W, { x, z, y: 0.25, w, d, h: 1.0, mat: L(col) });
    solid(W, { x, z, y: 1.25, w: ry ? 1.7 : 2.2, d: ry ? 2.2 : 1.7, h: 0.7, mat: L('#202a35'), collide: false });
  };
  car(12, 14, '#e8e8e8', 0); car(-48, -6, '#e2c04b', 90); car(60, 8, '#3a3a40', 90); car(-6, 56, '#9b2226', 0);
  car(-20, 24, '#2563eb', 0); car(34, 44, '#e8e8e8', 90); car(-62, 22, '#16a34a', 0); car(70, 54, '#9b2226', 90);

  // Postes de luz
  [[-50, 8], [50, -10], [0, 22], [-60, -26], [60, 34], [-20, 60], [30, 70], [-70, 40]].forEach((p, i) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 8, 6), L('#333')); pole.position.set(p[0], 4, p[1]); scene.add(pole);
    const head = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.3, 0.6), new THREE.MeshBasicMaterial({ color: 0xffd9a0 })); head.position.set(p[0], 8, p[1]); scene.add(head);
    if (i < 2) { const l = new THREE.PointLight(0xffc880, 1.0, 50); l.position.set(p[0], 7.5, p[1]); scene.add(l); }
    W.obs.push({ minx: p[0] - 0.2, maxx: p[0] + 0.2, minz: p[1] - 0.2, maxz: p[1] + 0.2, base: 0, top: 8 });
  });
  // Árboles
  [[-72, -30], [72, -30], [-72, 76], [72, 76], [-30, -30], [30, -30], [0, 76]].forEach(p => {
    const tr = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.35, 3, 6), L('#4a3320')); tr.position.set(p[0], 1.5, p[1]); scene.add(tr);
    const lf = new THREE.Mesh(new THREE.SphereGeometry(2.4, 8, 6), L('#2f6b34')); lf.position.set(p[0], 4.4, p[1]); scene.add(lf);
    W.obs.push({ minx: p[0] - 0.4, maxx: p[0] + 0.4, minz: p[1] - 0.4, maxz: p[1] + 0.4, base: 0, top: 6 });
  });
  // Llantas quemadas
  [[4, -20, true], [-40, 50, false], [50, 60, false]].forEach(t => {
    W.emitters.push({ kind: 'fire', x: t[0], y: 0.6, z: t[1], color: '#ff8a1e', rate: 20 });
    W.emitters.push({ kind: 'smoke', x: t[0], y: 1.2, z: t[1], color: '#222222', rate: 9 });
    if (t[2]) { const tf = new THREE.PointLight(0xff7a20, 1.0, 24); tf.position.set(t[0], 1.6, t[1]); scene.add(tf); W.flickers.push(tf); }
    [[-0.6, -0.4], [0.6, 0.3], [0, -0.5]].forEach(o => { const tm = new THREE.Mesh(new THREE.TorusGeometry(0.4, 0.17, 6, 12), L('#111')); tm.rotation.x = Math.PI / 2; tm.position.set(t[0] + o[0], 0.2, t[1] + o[1]); scene.add(tm); });
  });

  // Camionetas de la policía
  const van = (x, lights) => {
    solid(W, { x, z: 76, y: 0.4, w: 6, d: 2.6, h: 2.2, mat: L('#e8ecef') });
    solid(W, { x, z: 76, y: 1.4, w: 6.05, d: 2.65, h: 0.5, mat: L('#1d3a8a'), collide: false });
    if (!lights) return;
    const rl = new THREE.PointLight(0xff2020, 0, 44); rl.position.set(x - 1, 3.4, 76);
    const bl = new THREE.PointLight(0x2050ff, 0, 44); bl.position.set(x + 1, 3.4, 76);
    scene.add(rl, bl); W.alarmLights.push(rl, bl);
  };
  van(-20, true); van(0, false); van(20, false);

  W.spawnRival.push({ x: -73, y: 0, z: 20 }, { x: -73, y: 0, z: -12 }, { x: -70, y: 0, z: 60 }, { x: 73, y: 0, z: 62 }, { x: 73, y: 0, z: -14 });
  W.spawnPolice.push({ x: -10, y: 0, z: 73 }, { x: 10, y: 0, z: 73 }, { x: -35, y: 0, z: 74 }, { x: 35, y: 0, z: 74 });
  W.spawnAlly.push({ x: 72, y: 0, z: 10 }, { x: 72, y: 0, z: 40 }, { x: 60, y: 0, z: -20 });
  W.pickSpots = [[0, 0, 0], [-28, 0, 12], [14, 0, -12], [-6, 0, -30], [30, 0, -20], [-56, 0, -14], [8, 0, 24], [-10, 0, 40], [56, 0, 20], [-4, 0, -10],
    [16, 0, 58], [-45, 0, 62], [60, 0, 70], [-66, 0, 30], [40, 0, 6], [-30, 0, 56], [66, 0, -22], [0, 0, 36]];
  W.playerStart = { x: 44, y: 0, z: 4, yaw: Math.PI / 2 };
  W.bounds = { minx: -HX, maxx: HX, minz: ZF, maxz: ZB };
  W.sky = 'afueras';
  return W;
}
