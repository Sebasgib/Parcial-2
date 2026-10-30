// Lógica principal del juego: jugador, enemigos, proyectiles, oleadas y HUD
(function () {
  'use strict';
  const T = THREE;
  const $ = id => document.getElementById(id);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const params = new URLSearchParams(location.search || location.hash.slice(1));

  let renderer, scene, camera, W, own, rival, levelDef, levelId;
  const clock = new T.Clock();
  const keys = {};
  let mouseDown = false;

  const P = {
    pos: new T.Vector3(), vel: new T.Vector3(), vy: 0, yaw: 0, pitch: 0, hp: 100, onGround: true,
    wep: 0, last: 1, ammo: [], cd: 0, swing: -1, swingHit: false, bob: 0, r: 0.4, kills: 0, score: 0, dead: false, swapT: 0
  };
  const S = {
    state: 'menu', paused: false, wave: -1, queue: [], spawnT: 0, nextWaveT: 2.5, policeMode: false, time: 0, shake: 0,
    dmgFlash: 0, gasT: 0, hurtSnd: 0, pickT: 8, msgT: 0, hitT: 0, noLock: false, flareT: 0, finished: false
  };
  let enemies = [], allies = [], projs = [], areas = [], pickups = [];
  const ALLY_MAX = 5, MAX_ALIVE = 22;
  let vm, vmWeapon, flareLight, pickSpots = [];

  // ─────────── Partículas ───────────
  const FX = (() => {
    let pool = [], idx = 0;
    function init() {
      pool = [];
      for (let i = 0; i < 700; i++) {
        const mat = new T.SpriteMaterial({ map: Tex.smoke(), transparent: true, depthWrite: false, opacity: 0 });
        const s = new T.Sprite(mat);
        s.visible = false;
        scene.add(s);
        pool.push({ s, life: 0, max: 1, vx: 0, vy: 0, vz: 0, grow: 0, size: 1, op: 1, grav: 0 });
      }
    }
    function emit(x, y, z, vx, vy, vz, o) {
      const p = pool[idx++ % pool.length];
      p.life = p.max = o.life || 1; p.vx = vx; p.vy = vy; p.vz = vz;
      p.size = o.size || 0.5; p.grow = o.grow || 0; p.op = o.op === undefined ? 0.8 : o.op; p.grav = o.grav || 0;
      p.s.position.set(x, y, z);
      p.s.material.color.set(o.color || '#ffffff');
      p.s.material.blending = o.add ? T.AdditiveBlending : T.NormalBlending;
      p.s.visible = true;
    }
    function update(dt) {
      for (const p of pool) {
        if (p.life <= 0) continue;
        p.life -= dt;
        if (p.life <= 0) { p.s.visible = false; continue; }
        const k = p.life / p.max;
        p.vy -= p.grav * dt;
        p.s.position.x += p.vx * dt; p.s.position.y += p.vy * dt; p.s.position.z += p.vz * dt;
        const sz = p.size + p.grow * (1 - k);
        p.s.scale.set(sz, sz, 1);
        p.s.material.opacity = p.op * Math.min(1, k * 2);
      }
    }
    function burst(pos, n, color, speed, size, life, add, grav) {
      for (let i = 0; i < n; i++) {
        const a = Math.random() * 6.28, e = Math.random() * 3.14 - 1.57, sp = speed * (0.4 + Math.random() * 0.6);
        emit(pos.x, pos.y, pos.z, Math.cos(a) * Math.cos(e) * sp, Math.sin(e) * sp + 1, Math.sin(a) * Math.cos(e) * sp,
          { life: life * (0.6 + Math.random() * 0.6), size, grow: size * 1.5, color, add, op: 0.9, grav: grav || 0 });
      }
    }
    return { init, emit, update, burst };
  })();

  // ─────────── Colisiones ───────────
  function groundAt(x, z, r, feetY, step) {
    let gy = 0;
    const o = W.obs;
    for (let i = 0; i < o.length; i++) {
      const b = o[i];
      if (b.top <= feetY + step && b.top > gy && x + r > b.minx && x - r < b.maxx && z + r > b.minz && z - r < b.maxz) gy = b.top;
    }
    return gy;
  }
  function pushOut(pos, r, feetY, step) {
    const bd = W.bounds;
    pos.x = clamp(pos.x, bd.minx, bd.maxx); pos.z = clamp(pos.z, bd.minz, bd.maxz);
    const o = W.obs;
    for (let i = 0; i < o.length; i++) {
      const b = o[i];
      if (b.top <= feetY + step || b.base >= feetY + 1.7) continue;
      const cx = clamp(pos.x, b.minx, b.maxx), cz = clamp(pos.z, b.minz, b.maxz);
      const dx = pos.x - cx, dz = pos.z - cz, d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        if (d2 > 1e-8) { const d = Math.sqrt(d2), k = (r - d) / d; pos.x += dx * k; pos.z += dz * k; }
        else {
          const l = pos.x - b.minx, rr = b.maxx - pos.x, t = pos.z - b.minz, bm = b.maxz - pos.z, m = Math.min(l, rr, t, bm);
          if (m === l) pos.x = b.minx - r; else if (m === rr) pos.x = b.maxx + r; else if (m === t) pos.z = b.minz - r; else pos.z = b.maxz + r;
        }
      }
    }
  }

  // ─────────── Mensajes / HUD ───────────
  function showMsg(text, sub, dur) {
    $('msg-main').textContent = text; $('msg-sub').textContent = sub || '';
    $('msg').classList.add('show'); S.msgT = dur || 3;
  }
  function buildSlots() {
    const el = $('slots'); el.innerHTML = '';
    WEAPONS.forEach((w, i) => {
      const d = document.createElement('div');
      d.className = 'slot'; d.id = 'slot' + i;
      d.innerHTML = '<b>' + (i + 1) + '</b><span>' + w.name + '</span><i id="sa' + i + '"></i>';
      el.appendChild(d);
    });
  }
  function updateHud() {
    $('hp-fill').style.width = clamp(P.hp, 0, 100) + '%';
    $('hp-text').textContent = Math.ceil(Math.max(0, P.hp));
    const w = WEAPONS[P.wep];
    $('wname').textContent = w.name;
    $('wammo').textContent = w.type === 'melee' ? '∞' : P.ammo[P.wep];
    WEAPONS.forEach((ww, i) => {
      $('slot' + i).classList.toggle('on', i === P.wep);
      $('slot' + i).classList.toggle('empty', ww.type !== 'melee' && P.ammo[i] <= 0);
      $('sa' + i).textContent = ww.type === 'melee' ? '' : P.ammo[i];
    });
    const alive = enemies.filter(e => !e.dead).length + S.queue.length;
    $('wave-info').textContent = 'OLEADA ' + Math.max(1, S.wave + 1) + '/' + levelDef.waves.length + '  ·  ENEMIGOS ' + alive;
    $('kills').textContent = 'KO ' + P.kills + '   PUNTOS ' + P.score;
    $('dmg').style.opacity = clamp(S.dmgFlash, 0, 1);
    $('gasfx').style.opacity = clamp(S.gasT, 0, 1) * 0.75;
    $('policefx').classList.toggle('on', S.policeMode && S.state === 'play');
    $('hitmark').style.opacity = S.hitT > 0 ? 1 : 0;
    if (S.msgT > 0) { S.msgT -= 0.016; if (S.msgT <= 0) $('msg').classList.remove('show'); }
    drawRadar();
  }
  const radar = $('radar'), rctx = radar.getContext('2d');
  function drawRadar() {
    const w = radar.width, c = w / 2, range = 32;
    rctx.clearRect(0, 0, w, w);
    rctx.fillStyle = 'rgba(0,0,0,0.45)'; rctx.beginPath(); rctx.arc(c, c, c - 1, 0, 7); rctx.fill();
    rctx.strokeStyle = 'rgba(255,255,255,0.25)'; rctx.beginPath(); rctx.arc(c, c, c / 2, 0, 7); rctx.stroke();
    const cs = Math.cos(P.yaw), sn = Math.sin(P.yaw);
    for (const e of enemies) {
      if (e.dead) continue;
      const dx = e.pos.x - P.pos.x, dz = e.pos.z - P.pos.z;
      // rotar a coordenadas de pantalla (arriba = hacia donde miro)
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      let px = c + rx / range * c, py = c + rz / range * c;
      const dd = Math.hypot(px - c, py - c);
      if (dd > c - 4) { px = c + (px - c) / dd * (c - 4); py = c + (py - c) / dd * (c - 4); }
      rctx.fillStyle = e.def.police ? '#4aa3ff' : (e.type === 'jefe' ? '#ffd24a' : '#ff4a4a');
      rctx.beginPath(); rctx.arc(px, py, e.type === 'jefe' ? 4 : 3, 0, 7); rctx.fill();
    }
    for (const a of allies) {
      if (a.dead) continue;
      const dx = a.pos.x - P.pos.x, dz = a.pos.z - P.pos.z;
      const rx = dx * cs - dz * sn, rz = dx * sn + dz * cs;
      let px = c + rx / range * c, py = c + rz / range * c;
      const dd = Math.hypot(px - c, py - c);
      if (dd > c - 4) { px = c + (px - c) / dd * (c - 4); py = c + (py - c) / dd * (c - 4); }
      rctx.fillStyle = '#4aff7a';
      rctx.beginPath(); rctx.arc(px, py, 3, 0, 7); rctx.fill();
    }
    rctx.fillStyle = '#fff'; rctx.beginPath(); rctx.moveTo(c, c - 6); rctx.lineTo(c - 4, c + 4); rctx.lineTo(c + 4, c + 4); rctx.fill();
  }

  // ─────────── Viewmodel (arma en primera persona) ───────────
  const VMCFG = {
    bate:      { s: 1.0, r: [-0.55, 0, -0.2], p: [0, 0, 0] },
    cadena:    { s: 1.0, r: [-0.4, 0, -0.1], p: [0, 0, 0] },
    botella:   { s: 1.6, r: [-0.8, 0, 0], p: [0, 0, 0] },
    bengala:   { s: 1.5, r: [-0.9, 0, 0], p: [0, 0, 0] },
    papa:      { s: 1.9, r: [-0.7, 0, 0], p: [0, 0, 0] },
    resortera: { s: 1.5, r: [-1.25, 0, 0], p: [0, 0, 0] }
  };
  function buildViewmodel() {
    vm.clear();
    const skin = lamb('#d9a273');
    const arm = addBox(vm, 0.075, 0.075, 0.5, skin, 0, -0.03, 0.3);
    arm.rotation.x = 0.3;
    const sl = addBox(vm, 0.1, 0.1, 0.28, lamb(own.sleeve), 0, 0.03, 0.5);
    sl.rotation.x = 0.3;
    const id = WEAPONS[P.wep].id;
    vmWeapon = makeWeaponMesh(id, own);
    const c = VMCFG[id];
    vmWeapon.scale.setScalar(c.s);
    vmWeapon.rotation.set(c.r[0], c.r[1], c.r[2]);
    vmWeapon.position.set(c.p[0], c.p[1] + 0.02, c.p[2] - 0.02);
    vm.add(vmWeapon);
  }
  function setWeapon(i) {
    if (i === P.wep || i < 0 || i >= WEAPONS.length || P.dead) return;
    P.last = P.wep; P.wep = i; P.swing = -1; P.swapT = 1; P.cd = 0.18;
    buildViewmodel();
  }

  // ─────────── Enemigos ───────────
  function spawnEnemy(type) {
    const def = ENEMY_TYPES[type];
    const list = def.police ? W.spawnPolice : W.spawnRival;
    const dp = p => Math.hypot(p.x - P.pos.x, p.z - P.pos.z);
    // preferir puntos cercanos para que la hinchada llegue rápido
    let cands = list.filter(p => dp(p) > 14 && dp(p) < 75);
    if (!cands.length) cands = list.filter(p => dp(p) > 14);
    if (!cands.length) cands = list;
    const pt = cands[(Math.random() * cands.length) | 0];
    const root = def.police ? randomPolice(type) : randomBarrista(rival, type);
    root.rotation.order = 'YXZ';
    const sc = def.scale || 1;
    const e = {
      type, def, root, sc, r: 0.42 * sc, pos: new T.Vector3(pt.x + rand(-1.2, 1.2), 0, pt.z + rand(-1.2, 1.2)), y: pt.y,
      hp: def.hp, max: def.hp, yaw: 0, t: Math.random() * 10, cd: rand(0.5, 1.5), atkT: 0, didHit: false, kbx: 0, kbz: 0,
      flash: 0, dead: false, deathT: 0, target: null, retarget: 0, strafe: Math.random() < 0.5 ? 1 : -1, strafeT: rand(1, 3), moving: 0
    };
    pushOut(e.pos, e.r, e.y, 0.6);
    e.yaw = Math.atan2(P.pos.x - e.pos.x, P.pos.z - e.pos.z);
    root.position.set(e.pos.x, e.y, e.pos.z);
    scene.add(root);
    enemies.push(e);
    return e;
  }

  function pickTarget(e) {
    e.target = null;
    if (e.def.ranged) return;
    let best = null, bd = e.def.police ? 16 : 12;
    const pd = Math.hypot(e.pos.x - P.pos.x, e.pos.z - P.pos.z);
    for (const o of enemies) {
      if (o === e || o.dead || !!o.def.police === !!e.def.police) continue;
      const d = Math.hypot(e.pos.x - o.pos.x, e.pos.z - o.pos.z);
      if (d < bd && d < pd) { bd = d; best = o; }
    }
    for (const a of allies) {
      if (a.dead) continue;
      const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
      if (d < bd && d < pd * 1.1) { bd = d; best = a; }
    }
    e.target = best;
  }

  function lerpAngle(a, b, t) {
    let d = b - a;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return a + d * Math.min(1, t);
  }

  function updateEnemy(e, dt) {
    if (e.dead) {
      e.deathT += dt;
      const k = Math.min(1, e.deathT / 0.5);
      e.root.rotation.x = -k * Math.PI / 2;
      e.root.position.y = e.y + k * 0.18 * e.sc;
      e.root.userData.shadow.material.opacity = 0.35 * (1 - e.deathT / 4);
      if (e.deathT > 4) { scene.remove(e.root); disposeObject(e.root); e.gone = true; }
      return;
    }
    e.t += dt;
    e.cd -= dt;
    e.retarget -= dt;
    if (e.retarget <= 0) { e.retarget = 0.6 + Math.random() * 0.5; pickTarget(e); }
    if (e.target && e.target.dead) e.target = null;
    const tgt = e.target;
    const tp = tgt ? tgt.pos : P.pos;
    const dx = tp.x - e.pos.x, dz = tp.z - e.pos.z, dist = Math.hypot(dx, dz) || 0.001;
    const nx = dx / dist, nz = dz / dist;
    e.yaw = lerpAngle(e.yaw, Math.atan2(dx, dz), dt * 8);

    let mx = 0, mz = 0, speed = e.def.speed;
    const m = e.def.melee, rg = e.def.ranged;
    let atkAnim = -1;

    if (e.atkT > 0) {
      const dur = (m ? m.wind : 0.6) + 0.25;
      e.atkT += dt;
      const prog = e.atkT / dur;
      atkAnim = prog;
      if (prog >= 0.6 && !e.didHit) {
        e.didHit = true;
        if (m) {
          if (tgt) {
            if (dist < m.range * 1.4) damageTarget(tgt, m.dmg, { player: false, fromDir: { x: nx, z: nz }, kb: 4 });
          } else if (dist < m.range * 1.4 && Math.abs(P.pos.y - e.y) < 1.6) hurtPlayer(m.dmg, e.pos);
        } else if (rg) fireEnemyProjectile(e, rg);
      }
      if (prog >= 1) { e.atkT = 0; e.cd = (m || rg).cd * rand(0.9, 1.3); }
    } else if (m) {
      if (dist > m.range * 0.85) { mx = nx; mz = nz; }
      else if (e.cd <= 0) { e.atkT = 0.001; e.didHit = false; }
      else { mx = -nz * e.strafe * 0.4; mz = nx * e.strafe * 0.4; }
    } else if (rg) {
      e.strafeT -= dt;
      if (e.strafeT <= 0) { e.strafe = -e.strafe; e.strafeT = rand(1.5, 3.5); }
      if (dist < rg.min) { mx = -nx; mz = -nz; speed *= 0.9; }
      else if (dist > rg.range) { mx = nx; mz = nz; }
      else {
        mx = -nz * e.strafe * 0.5; mz = nx * e.strafe * 0.5;
        if (e.cd <= 0) { e.atkT = 0.001; e.didHit = false; }
      }
    }

    // separación entre enemigos
    let sx = 0, sz = 0;
    for (const o of enemies) {
      if (o === e || o.dead) continue;
      const ox = e.pos.x - o.pos.x, oz = e.pos.z - o.pos.z, od = Math.hypot(ox, oz);
      if (od < 1.0 && od > 0.001) { sx += ox / od * (1 - od); sz += oz / od * (1 - od); }
    }
    e.kbx *= Math.pow(0.02, dt); e.kbz *= Math.pow(0.02, dt);
    e.pos.x += (mx * speed + sx * 2) * dt + e.kbx * dt;
    e.pos.z += (mz * speed + sz * 2) * dt + e.kbz * dt;
    pushOut(e.pos, e.r, e.y, 0.6);
    const gy = groundAt(e.pos.x, e.pos.z, 0.25, e.y, 0.6);
    if (gy > e.y) e.y = gy; else e.y = Math.max(gy, e.y - 12 * dt);

    e.moving = Math.hypot(mx, mz) > 0.1 ? 1 : 0;
    animateChar(e.root, e.t, e.moving, atkAnim, rg && e.atkT > 0);
    e.root.position.set(e.pos.x, e.y, e.pos.z);
    e.root.rotation.y = e.yaw;
    if (e.flash > 0) { e.flash -= dt * 4; flashChar(e.root, Math.max(0, e.flash)); }
  }

  function fireEnemyProjectile(e, rg) {
    const o = new T.Vector3(e.pos.x + Math.sin(e.yaw) * 0.5, e.y + 1.5 * e.sc, e.pos.z + Math.cos(e.yaw) * 0.5);
    const dist = Math.hypot(P.pos.x - o.x, P.pos.z - o.z);
    const tFlight = Math.max(0.15, dist / rg.speed);
    const aim = new T.Vector3(P.pos.x + P.vel.x * tFlight * 0.6 + rand(-1, 1) * dist * 0.03, P.pos.y + 1.1, P.pos.z + P.vel.z * tFlight * 0.6 + rand(-1, 1) * dist * 0.03);
    const grav = rg.proj === 'flare' ? 3 : 14;
    const vel = new T.Vector3((aim.x - o.x) / tFlight, (aim.y - o.y) / tFlight + 0.5 * grav * tFlight, (aim.z - o.z) / tFlight);
    spawnProj({ type: rg.proj, pos: o, vel, grav, dmg: rg.dmg, owner: 'enemy' });
    if (rg.proj === 'flare') Sfx.flare(); else Sfx.throw();
  }

  function damageEnemy(e, dmg, o) {
    if (e.dead) return;
    o = o || {};
    if (e.def.shield && !o.pierce && o.fromDir) {
      const fx = Math.sin(e.yaw), fz = Math.cos(e.yaw);
      // fromDir apunta de atacante hacia enemigo; el atacante está al frente si fromDir se opone a la mirada
      if (-(fx * o.fromDir.x + fz * o.fromDir.z) > 0.35) { dmg *= 0.2; if (!o.quiet) Sfx.clang(); }
    }
    if (o.head) dmg *= 2;
    e.hp -= dmg;
    if (!o.quiet) { e.flash = 1; if (o.player !== false) { S.hitT = 0.18; $('hitmark').classList.toggle('head', !!o.head); } }
    if (o.kb && o.fromDir) { e.kbx += o.fromDir.x * o.kb; e.kbz += o.fromDir.z * o.kb; }
    if (e.hp <= 0) killEnemy(e, o.player !== false);
  }

  function killEnemy(e, byPlayer) {
    e.dead = true; e.deathT = 0;
    Sfx.die();
    if (byPlayer) {
      P.kills++; P.score += e.def.score;
      if (Math.random() < 0.3) dropPickup(e.pos.x, e.y, e.pos.z, Math.random() < 0.5 ? 'health' : 'ammo');
    }
  }

  // ─────────── Compañeras (aliadas de tu barra) ───────────
  function spawnAlly(near) {
    let x, z, y;
    if (near) {
      const ang = Math.random() * 6.28, r = rand(3, 6);
      x = P.pos.x + Math.cos(ang) * r; z = P.pos.z + Math.sin(ang) * r; y = P.pos.y;
    } else {
      const pt = W.spawnAlly[(Math.random() * W.spawnAlly.length) | 0];
      x = pt.x + rand(-1.5, 1.5); z = pt.z + rand(-1.5, 1.5); y = pt.y;
    }
    const ranged = Math.random() < 0.35;
    const root = randomAlly(own, ranged);
    root.rotation.order = 'YXZ';
    const a = {
      isAlly: true, ranged, root, sc: 1, r: 0.42, pos: new T.Vector3(x, 0, z), y, hp: 90, max: 90, speed: 4.4, yaw: 0,
      t: Math.random() * 10, cd: rand(0.3, 1), atkT: 0, didHit: false, kbx: 0, kbz: 0, flash: 0, dead: false, deathT: 0,
      target: null, retarget: 0, strafe: Math.random() < 0.5 ? 1 : -1, moving: 0
    };
    pushOut(a.pos, a.r, a.y, 0.6);
    a.y = Math.max(groundAt(a.pos.x, a.pos.z, 0.25, a.y + 0.6, 0.6), 0);
    root.position.set(a.pos.x, a.y, a.pos.z);
    scene.add(root);
    allies.push(a);
  }

  function damageAlly(a, dmg, o) {
    if (a.dead) return;
    a.hp -= dmg;
    if (!(o && o.quiet)) a.flash = 1;
    if (o && o.kb && o.fromDir) { a.kbx += o.fromDir.x * o.kb; a.kbz += o.fromDir.z * o.kb; }
    if (a.hp <= 0) { a.dead = true; a.deathT = 0; }
  }
  function damageTarget(t, dmg, o) { if (t.isAlly) damageAlly(t, dmg, o); else damageEnemy(t, dmg, o); }

  function lobBottle(a, tgt) {
    const o = new T.Vector3(a.pos.x + Math.sin(a.yaw) * 0.5, a.y + 1.5, a.pos.z + Math.cos(a.yaw) * 0.5);
    const dist = Math.hypot(tgt.pos.x - o.x, tgt.pos.z - o.z);
    const tf = Math.max(0.15, dist / 22), grav = 14;
    const aim = new T.Vector3(tgt.pos.x, tgt.y + 1.1, tgt.pos.z);
    const vel = new T.Vector3((aim.x - o.x) / tf, (aim.y - o.y) / tf + 0.5 * grav * tf, (aim.z - o.z) / tf);
    spawnProj({ type: 'bottle', pos: o, vel, grav, dmg: 14, owner: 'player' });
    Sfx.throw();
  }

  function updateAlly(a, dt) {
    if (a.dead) {
      a.deathT += dt;
      const k = Math.min(1, a.deathT / 0.5);
      a.root.rotation.x = -k * Math.PI / 2;
      a.root.position.y = a.y + k * 0.18;
      a.root.userData.shadow.material.opacity = 0.35 * Math.max(0, 1 - a.deathT / 3);
      if (a.deathT > 3) { scene.remove(a.root); disposeObject(a.root); a.gone = true; }
      return;
    }
    a.t += dt; a.cd -= dt; a.retarget -= dt;
    if (a.retarget <= 0) {
      a.retarget = 0.4 + Math.random() * 0.3;
      let best = null, bd = 55;
      for (const e of enemies) {
        if (e.dead) continue;
        const d = Math.hypot(e.pos.x - a.pos.x, e.pos.z - a.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      a.target = best;
    }
    if (a.target && a.target.dead) a.target = null;
    const tgt = a.target;
    const pdx = P.pos.x - a.pos.x, pdz = P.pos.z - a.pos.z, pd = Math.hypot(pdx, pdz) || 0.001;
    let mx = 0, mz = 0, atkAnim = -1, face = a.yaw;

    if (tgt) {
      const dx = tgt.pos.x - a.pos.x, dz = tgt.pos.z - a.pos.z, dist = Math.hypot(dx, dz) || 0.001, nx = dx / dist, nz = dz / dist;
      face = Math.atan2(dx, dz);
      if (a.atkT > 0) {
        a.atkT += dt;
        const prog = a.atkT / 0.65;
        atkAnim = prog;
        if (prog >= 0.6 && !a.didHit) {
          a.didHit = true;
          if (a.ranged) lobBottle(a, tgt);
          else if (dist < 2.5) { damageEnemy(tgt, 16, { player: true, fromDir: { x: nx, z: nz }, kb: 4 }); Sfx.hit(); }
        }
        if (prog >= 1) { a.atkT = 0; a.cd = a.ranged ? 1.8 : 1.0; }
      } else if (a.ranged) {
        if (dist < 7) { mx = -nx; mz = -nz; }
        else if (dist > 16) { mx = nx; mz = nz; }
        else { mx = -nz * a.strafe * 0.4; mz = nx * a.strafe * 0.4; if (a.cd <= 0) { a.atkT = 0.001; a.didHit = false; } }
      } else if (dist > 1.7) { mx = nx; mz = nz; }
      else if (a.cd <= 0) { a.atkT = 0.001; a.didHit = false; }
      if (pd > 50) { mx = pdx / pd; mz = pdz / pd; } // no alejarse demasiado de ti
    } else {
      face = Math.atan2(pdx, pdz);
      if (pd > 7) { mx = pdx / pd; mz = pdz / pd; } else if (pd < 2.5) { mx = -pdx / pd; mz = -pdz / pd; }
    }
    a.yaw = lerpAngle(a.yaw, face, dt * 8);

    let sx = 0, sz = 0;
    for (const o of allies) {
      if (o === a || o.dead) continue;
      const ox = a.pos.x - o.pos.x, oz = a.pos.z - o.pos.z, od = Math.hypot(ox, oz);
      if (od < 1.0 && od > 0.001) { sx += ox / od * (1 - od); sz += oz / od * (1 - od); }
    }
    if (pd < 1.1) { sx -= pdx / pd * (1.1 - pd); sz -= pdz / pd * (1.1 - pd); }
    a.kbx *= Math.pow(0.02, dt); a.kbz *= Math.pow(0.02, dt);
    a.pos.x += (mx * a.speed + sx * 2) * dt + a.kbx * dt;
    a.pos.z += (mz * a.speed + sz * 2) * dt + a.kbz * dt;
    pushOut(a.pos, a.r, a.y, 0.6);
    const gy = groundAt(a.pos.x, a.pos.z, 0.25, a.y, 0.6);
    if (gy > a.y) a.y = gy; else a.y = Math.max(gy, a.y - 12 * dt);
    a.moving = Math.hypot(mx, mz) > 0.1 ? 1 : 0;
    animateChar(a.root, a.t, a.moving, atkAnim, a.ranged && a.atkT > 0);
    a.root.position.set(a.pos.x, a.y, a.pos.z);
    a.root.rotation.y = a.yaw;
    if (a.flash > 0) { a.flash -= dt * 4; flashChar(a.root, Math.max(0, a.flash)); }
  }

  // ─────────── Proyectiles ───────────
  function projMesh(type) {
    if (type === 'bottle') return makeWeaponMesh('botella');
    if (type === 'flare') return makeWeaponMesh('bengala');
    if (type === 'bomb') return makeWeaponMesh('papa');
    if (type === 'stone') return makeWeaponMesh('piedra');
    const g = new T.Group();
    addCyl(g, 0.06, 0.06, 0.28, lamb('#6b7a6b'), 0, 0, 0, 8);
    addCyl(g, 0.062, 0.062, 0.05, lamb('#e8e8e8'), 0, 0.08, 0, 8);
    return g;
  }
  function spawnProj(o) {
    const mesh = projMesh(o.type);
    mesh.position.copy(o.pos);
    scene.add(mesh);
    projs.push(Object.assign({ mesh, life: 6, spin: rand(8, 16), bounces: 0, fuse: o.type === 'bomb' ? (o.fuse || 1.5) : 0, trail: 0 }, o));
  }
  function removeProj(p) { scene.remove(p.mesh); disposeObject(p.mesh); p.gone = true; }

  function impact(p, wall) {
    const pos = p.pos;
    if (p.type === 'bottle') {
      Sfx.glass(); FX.burst(pos, 10, '#9be3ad', 4, 0.18, 0.6, false, 12);
      const w = WEAPONS[2];
      if (p.owner === 'player') for (const e of enemies) if (!e.dead && Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z) < w.splash && Math.abs(e.y - pos.y) < 2.2) damageEnemy(e, p.dmg * 0.5, { quiet: false, fromDir: dirFrom(pos, e.pos), kb: 2 });
      removeProj(p);
    } else if (p.type === 'stone') {
      FX.burst(pos, 4, '#bbbbbb', 3, 0.12, 0.4, false, 10); removeProj(p);
    } else if (p.type === 'flare') {
      addArea('fire', pos.x, wall ? Math.max(pos.y - 0.3, 0) : pos.y, pos.z, 1.7, 4.5, 9);
      Sfx.flare(); removeProj(p);
    } else if (p.type === 'gas') {
      addArea('gas', pos.x, pos.y, pos.z, 4.8, 8, 6);
      Sfx.gas(); removeProj(p);
    } else if (p.type === 'bomb') {
      explode(pos, WEAPONS[4].splash, p.dmg, true); removeProj(p);
    }
  }
  function dirFrom(a, b) {
    const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz) || 1;
    return { x: dx / d, z: dz / d };
  }

  function explode(pos, radius, dmg, fromPlayer) {
    Sfx.boom();
    S.shake = Math.max(S.shake, clamp(1 - Math.hypot(pos.x - P.pos.x, pos.z - P.pos.z) / 30, 0.1, 0.8));
    FX.burst(pos, 26, '#ffb030', 9, 0.9, 0.7, true);
    FX.burst(pos, 16, '#444444', 5, 1.4, 1.6, false);
    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
      if (d < radius && Math.abs(e.y - pos.y) < 3) {
        const f = 1 - d / radius;
        damageEnemy(e, dmg * f + 8, { pierce: true, fromDir: dirFrom(pos, e.pos), kb: 12 * f + 3, player: fromPlayer });
      }
    }
    for (const a of allies) {
      if (a.dead) continue;
      const d = Math.hypot(a.pos.x - pos.x, a.pos.z - pos.z);
      if (d < radius && Math.abs(a.y - pos.y) < 3) damageAlly(a, dmg * (1 - d / radius) * 0.4, { fromDir: dirFrom(pos, a.pos), kb: 6 });
    }
    const dp = Math.hypot(P.pos.x - pos.x, P.pos.z - pos.z);
    if (dp < radius && Math.abs(P.pos.y - pos.y) < 3) hurtPlayer((dmg * (1 - dp / radius)) * 0.45, pos);
  }

  function updateProjectiles(dt) {
    for (const p of projs) {
      if (p.gone) continue;
      p.life -= dt;
      if (p.life <= 0) { removeProj(p); continue; }
      if (p.fuse > 0) { p.fuse -= dt; if (p.fuse <= 0) { explode(p.pos, WEAPONS[4].splash, p.dmg, p.owner === 'player'); removeProj(p); continue; } }
      const sp = p.vel.length();
      const steps = Math.max(1, Math.ceil(sp * dt / 0.45)), h = dt / steps;
      let done = false;
      for (let s = 0; s < steps && !done; s++) {
        p.vel.y -= p.grav * h;
        p.pos.x += p.vel.x * h; p.pos.y += p.vel.y * h; p.pos.z += p.vel.z * h;
        // objetivos
        if (p.owner === 'player') {
          for (const e of enemies) {
            if (e.dead) continue;
            if (Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < e.r + 0.15 && p.pos.y > e.y && p.pos.y < e.y + 1.9 * e.sc) {
              const head = p.pos.y > e.y + 1.5 * e.sc;
              const fd = dirFrom(e.pos, p.pos); // hacia el atacante
              if (p.type !== 'bomb') damageEnemy(e, p.dmg, { head, fromDir: { x: -fd.x, z: -fd.z }, kb: 3 });
              if (p.type === 'bomb' || p.type === 'bottle' || p.type === 'flare') impact(p, false); else removeProj(p);
              done = true; break;
            }
          }
        } else if (Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) < P.r + 0.2 && p.pos.y > P.pos.y && p.pos.y < P.pos.y + 1.8) {
          if (p.dmg > 0) hurtPlayer(p.dmg, p.pos);
          impact(p, false); done = true;
        }
        if (done) break;
        // suelo
        const gy = groundAt(p.pos.x, p.pos.z, 0, p.pos.y, 0.05);
        if (p.pos.y <= gy + 0.03) {
          if (p.type === 'bomb') {
            p.pos.y = gy + 0.04; p.vel.y = Math.abs(p.vel.y) * 0.4; p.vel.x *= 0.6; p.vel.z *= 0.6;
            if (p.vel.y < 1) p.vel.y = 0;
          } else { p.pos.y = gy + 0.03; impact(p, false); done = true; }
          continue;
        }
        // paredes y obstáculos
        for (const b of W.obs) {
          if (p.pos.x > b.minx && p.pos.x < b.maxx && p.pos.z > b.minz && p.pos.z < b.maxz && p.pos.y < b.top && p.pos.y > b.base) {
            if (p.type === 'bomb') {
              p.pos.x -= p.vel.x * h; p.pos.z -= p.vel.z * h; p.vel.x *= -0.35; p.vel.z *= -0.35;
            } else { impact(p, true); done = true; }
            break;
          }
        }
      }
      if (p.gone) continue;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += p.spin * dt; p.mesh.rotation.z += p.spin * 0.6 * dt;
      if (p.type === 'flare') {
        p.trail -= dt;
        if (p.trail <= 0) { p.trail = 0.03; FX.emit(p.pos.x, p.pos.y, p.pos.z, rand(-0.5, 0.5), rand(0.2, 1), rand(-0.5, 0.5), { life: 0.5, size: 0.35, grow: 0.3, color: '#ff7a1a', add: true, op: 0.9 }); }
      }
      if (p.type === 'bomb' && Math.random() < 0.5) FX.emit(p.pos.x, p.pos.y + 0.1, p.pos.z, rand(-0.3, 0.3), 0.8, rand(-0.3, 0.3), { life: 0.3, size: 0.18, color: '#ffd34a', add: true });
    }
    projs = projs.filter(p => !p.gone);
  }

  // ─────────── Áreas (fuego / gas) ───────────
  function addArea(kind, x, y, z, r, t, dps) {
    areas.push({ kind, x, y, z, r, t, max: t, dps, acc: 0, snd: 0 });
  }
  function updateAreas(dt) {
    for (const a of areas) {
      a.t -= dt;
      a.acc += dt;
      const rate = a.kind === 'fire' ? 30 : 16;
      let n = Math.floor(a.acc * rate);
      a.acc -= n / rate;
      while (n-- > 0) {
        const ang = Math.random() * 6.28, rr = Math.sqrt(Math.random()) * a.r;
        const px = a.x + Math.cos(ang) * rr, pz = a.z + Math.sin(ang) * rr;
        if (a.kind === 'fire') FX.emit(px, a.y + 0.1, pz, 0, rand(1.2, 2.4), 0, { life: rand(0.4, 0.8), size: 0.55, grow: 0.5, color: '#ff8a1e', add: true, op: 0.85 });
        else FX.emit(px, a.y + rand(0.2, 1.4), pz, rand(-0.4, 0.4), rand(0.2, 0.6), rand(-0.4, 0.4), { life: rand(1.5, 2.5), size: 1.6, grow: 1.5, color: '#c9e8b0', op: 0.45 });
      }
      for (const e of enemies) {
        if (e.dead) continue;
        if (a.kind === 'gas' && e.def.police) continue;
        if (Math.hypot(e.pos.x - a.x, e.pos.z - a.z) < a.r && Math.abs(e.y - a.y) < 2.5) damageEnemy(e, a.dps * dt, { quiet: true, player: true });
      }
      for (const al of allies) {
        if (al.dead) continue;
        if (Math.hypot(al.pos.x - a.x, al.pos.z - a.z) < a.r && Math.abs(al.y - a.y) < 2.5) damageAlly(al, a.dps * dt * 0.5, { quiet: true });
      }
      if (Math.hypot(P.pos.x - a.x, P.pos.z - a.z) < a.r && Math.abs(P.pos.y - a.y) < 2.5) {
        hurtPlayer(a.dps * dt * (a.kind === 'gas' ? 0.55 : 0.6), null, true);
        if (a.kind === 'gas') S.gasT = Math.min(1.2, S.gasT + dt * 4);
      }
    }
    areas = areas.filter(a => a.t > 0);
  }

  // ─────────── Jugador ───────────
  function hurtPlayer(d, src, quiet) {
    if (P.dead || S.state !== 'play') return;
    P.hp -= d;
    S.dmgFlash = Math.min(1, S.dmgFlash + (quiet ? d * 0.4 : d / 28));
    if (!quiet) { S.shake = Math.max(S.shake, 0.25); Sfx.hurt(); }
    else if (S.hurtSnd <= 0) { Sfx.hurt(); S.hurtSnd = 0.5; }
    if (P.hp <= 0) endGame(false);
  }

  function updatePlayer(dt) {
    const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
    let ix = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0), iz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0);
    const len = Math.hypot(ix, iz) || 1; ix /= len; iz /= len;
    const sprint = keys.ShiftLeft && iz > 0;
    const sp = sprint ? 9.2 : 6.2;
    const tx = (fx * iz + rx * ix) * sp, tz = (fz * iz + rz * ix) * sp;
    const acc = P.onGround ? 12 : 3;
    P.vel.x += (tx - P.vel.x) * Math.min(1, acc * dt);
    P.vel.z += (tz - P.vel.z) * Math.min(1, acc * dt);
    P.pos.x += P.vel.x * dt; P.pos.z += P.vel.z * dt;
    pushOut(P.pos, P.r, P.pos.y, 0.4);
    if (keys.Space && P.onGround) { P.vy = 8.2; P.onGround = false; }
    P.vy -= 22 * dt;
    P.pos.y += P.vy * dt;
    const gy = groundAt(P.pos.x, P.pos.z, P.r * 0.8, P.pos.y, 0.4);
    if (P.pos.y <= gy) {
      if (P.vy < -9) S.shake = Math.max(S.shake, 0.15);
      P.pos.y = gy; P.vy = 0; P.onGround = true;
    } else P.onGround = P.pos.y - gy < 0.04 && P.vy <= 0;
    const spd = Math.hypot(P.vel.x, P.vel.z);
    if (P.onGround) P.bob += spd * dt * 1.5;

    // por si algo falla: nunca quedar fuera del mapa
    if (P.pos.y < -3 || !isFinite(P.pos.x + P.pos.y + P.pos.z)) {
      P.pos.set(W.playerStart.x, W.playerStart.y, W.playerStart.z); P.vy = 0; P.vel.set(0, 0, 0);
    }
    P.cd -= dt;
    if (P.swapT > 0) P.swapT = Math.max(0, P.swapT - dt * 4);
    if (mouseDown) playerAttack();
    if (P.swing >= 0) {
      const w = WEAPONS[P.wep];
      P.swing += dt / (w.type === 'melee' ? 0.42 : 0.3);
      if (w.type === 'melee' && !P.swingHit && P.swing >= 0.45) { P.swingHit = true; meleeHit(w); }
      if (P.swing >= 1) P.swing = -1;
    }
    // cámara
    const shake = S.shake;
    camera.position.set(P.pos.x + (Math.random() - 0.5) * shake * 0.2, P.pos.y + 1.65 + Math.sin(P.bob * 2) * 0.035 * Math.min(1, spd / 5) + (Math.random() - 0.5) * shake * 0.2, P.pos.z);
    camera.rotation.set(P.pitch, P.yaw, 0, 'YXZ');
    // viewmodel
    let rotx = 0, offy = 0, offz = 0;
    if (P.swing >= 0) {
      const p = P.swing, w = WEAPONS[P.wep];
      if (w.type === 'melee') rotx = p < 0.3 ? (p / 0.3) * 0.9 : 0.9 - ((p - 0.3) / 0.7) * 2.1;
      else { rotx = p < 0.25 ? (p / 0.25) * 0.5 : 0.5 - ((p - 0.25) / 0.75) * 0.9; offz = p > 0.25 ? 0.1 * (1 - p) : 0; }
    }
    vm.position.set(0.34 + Math.sin(P.bob) * 0.008 * Math.min(1, spd / 5), -0.42 + Math.abs(Math.sin(P.bob)) * 0.012 * Math.min(1, spd / 5) - P.swapT * 0.45 + offy, -0.55 + offz);
    vm.rotation.set(rotx, 0.12, sprint ? 0.12 : 0.02);
    // luz y chispas de bengala
    const isFlare = WEAPONS[P.wep].id === 'bengala';
    flareLight.intensity = isFlare ? 1.1 + Math.random() * 0.4 : 0;
    if (isFlare) {
      S.flareT -= dt;
      const tip = vmWeapon.getObjectByName('tip');
      if (tip && S.flareT <= 0) {
        S.flareT = 0.035;
        const wp = new T.Vector3(); tip.getWorldPosition(wp);
        FX.emit(wp.x, wp.y, wp.z, rand(-0.4, 0.4), rand(0.3, 1.2), rand(-0.4, 0.4), { life: 0.5, size: 0.14, grow: 0.25, color: '#ff6a1a', add: true, op: 0.95 });
        flareLight.position.copy(wp);
      }
    }
  }

  function playerAttack() {
    if (P.cd > 0 || P.dead) return;
    const w = WEAPONS[P.wep];
    if (w.type === 'melee') { P.cd = w.cd; P.swing = 0; P.swingHit = false; Sfx.swing(); return; }
    if (P.ammo[P.wep] <= 0) { Sfx.empty(); P.cd = 0.3; showMsg('SIN MUNICIÓN', 'Cambia de arma o busca una caja', 1.2); return; }
    P.ammo[P.wep]--;
    P.cd = w.cd; P.swing = 0;
    const fwd = new T.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const right = new T.Vector3(1, 0, 0).applyEuler(camera.rotation);
    const o = camera.position.clone().addScaledVector(fwd, 0.6).addScaledVector(right, 0.2); o.y -= 0.12;
    const vel = fwd.clone().multiplyScalar(w.speed);
    if (w.grav >= 10) vel.y += 1.6;
    if (w.id === 'resortera') { vel.x += rand(-0.6, 0.6); vel.y += rand(-0.6, 0.6); vel.z += rand(-0.6, 0.6); }
    const type = { botella: 'bottle', bengala: 'flare', papa: 'bomb', resortera: 'stone' }[w.id];
    spawnProj({ type, pos: o, vel, grav: w.grav, dmg: w.dmg, owner: 'player', fuse: w.fuse });
    if (w.id === 'resortera') Sfx.shot(); else if (w.id === 'bengala') Sfx.flare(); else Sfx.throw();
  }

  function meleeHit(w) {
    const eye = camera.position;
    const fwd = new T.Vector3(0, 0, -1).applyEuler(camera.rotation);
    const hits = [];
    for (const e of enemies) {
      if (e.dead) continue;
      const c = new T.Vector3(e.pos.x, e.y + 1.0 * e.sc, e.pos.z).sub(eye);
      const dist = c.length();
      if (dist - e.r > w.range) continue;
      c.normalize();
      if (c.dot(fwd) < (w.wide ? 0.3 : 0.72)) continue;
      hits.push({ e, dist, head: eye.y + fwd.y * dist > e.y + 1.5 * e.sc });
    }
    hits.sort((a, b) => a.dist - b.dist);
    const list = w.wide ? hits : hits.slice(0, 1);
    for (const h of list) {
      const fd = dirFrom(P.pos, h.e.pos);
      damageEnemy(h.e, w.dmg, { head: h.head, fromDir: { x: fd.x, z: fd.z }, kb: w.wide ? 5 : 8 });
      Sfx.hit();
    }
    if (list.length) S.shake = Math.max(S.shake, 0.18);
  }

  // ─────────── Recogibles ───────────
  function dropPickup(x, y, z, kind) {
    const g = new T.Group();
    if (kind === 'health') {
      const em = new T.Mesh(new T.SphereGeometry(0.28, 10, 8), lamb('#d9993a')); em.scale.set(1.3, 0.55, 0.9); g.add(em);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: Tex.glow('rgba(80,255,120,1)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending })); sp.scale.set(1.8, 1.8, 1); g.add(sp);
    } else {
      addBox(g, 0.5, 0.35, 0.4, lamb('#6b4a2a'));
      addBox(g, 0.52, 0.08, 0.42, lamb(own.pri), 0, 0.12, 0);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: Tex.glow('rgba(255,210,60,1)'), transparent: true, depthWrite: false, blending: T.AdditiveBlending })); sp.scale.set(1.8, 1.8, 1); g.add(sp);
    }
    g.position.set(x, y + 0.6, z);
    scene.add(g);
    pickups.push({ kind, mesh: g, base: y + 0.6, t: Math.random() * 6, x, y, z, life: 30 });
  }
  function updatePickups(dt) {
    S.pickT -= dt;
    if (S.pickT <= 0) {
      S.pickT = 9;
      if (pickups.length < 6) {
        const sp = pickSpots[(Math.random() * pickSpots.length) | 0];
        if (!pickups.some(p => p.x === sp[0] && p.z === sp[2])) dropPickup(sp[0], sp[1], sp[2], Math.random() < 0.5 ? 'health' : 'ammo');
      }
    }
    for (const p of pickups) {
      p.t += dt; p.life -= dt;
      p.mesh.rotation.y += dt * 2;
      p.mesh.position.y = p.base + Math.sin(p.t * 3) * 0.1;
      if (Math.hypot(p.x - P.pos.x, p.z - P.pos.z) < 1.4 && Math.abs(p.y - P.pos.y) < 2) {
        if (p.kind === 'health') {
          if (P.hp >= 100) continue;
          P.hp = Math.min(100, P.hp + 35); showMsg('+35 EMPANADA', 'Aguante, parce', 1.2);
        } else {
          let msg = '';
          for (let k = 0; k < 2; k++) {
            const i = 2 + ((Math.random() * 4) | 0), w = WEAPONS[i];
            const add = Math.ceil(w.max * 0.3);
            P.ammo[i] = Math.min(w.max, P.ammo[i] + add); msg += (msg ? ' · ' : '') + '+' + add + ' ' + w.name;
          }
          showMsg('MUNICIÓN', msg, 1.5);
        }
        Sfx.pickup(); p.life = 0;
      }
    }
    for (const p of pickups) if (p.life <= 0) { scene.remove(p.mesh); disposeObject(p.mesh); }
    pickups = pickups.filter(p => p.life > 0);
  }

  // ─────────── Oleadas ───────────
  function startWave(i) {
    const wv = levelDef.waves[i];
    S.wave = i; S.queue = []; S.spawnT = 0.3;
    wv.spawns.forEach(s => { for (let k = 0; k < s[1]; k++) S.queue.push(s[0]); });
    for (let k = S.queue.length - 1; k > 0; k--) { const j = (Math.random() * (k + 1)) | 0; [S.queue[k], S.queue[j]] = [S.queue[j], S.queue[k]]; }
    S.policeMode = !!wv.police;
    showMsg(wv.msg, wv.sub, 4);
    Sfx.wave();
    if (wv.police) { Sfx.siren(4); Sfx.setCrowd(0.12); }
  }
  function updateWaves(dt) {
    const alive = enemies.filter(e => !e.dead).length;
    if (S.wave < 0 || (S.queue.length === 0 && alive === 0)) {
      if (S.finished) return;
      S.nextWaveT -= dt;
      if (S.nextWaveT <= 0) {
        if (S.wave + 1 >= levelDef.waves.length) { S.finished = true; endGame(true); return; }
        if (S.wave >= 0) {
          P.hp = Math.min(100, P.hp + 25);
          for (let i = 2; i < WEAPONS.length; i++) P.ammo[i] = Math.min(WEAPONS[i].max, P.ammo[i] + Math.ceil(WEAPONS[i].max * 0.25));
        }
        S.policeMode = false;
        startWave(S.wave + 1);
        S.nextWaveT = 2.5;
      }
      return;
    }
    S.nextWaveT = 2.5;
    if (S.queue.length) {
      S.spawnT -= dt;
      if (S.spawnT <= 0 && alive < MAX_ALIVE) {
        // salen de a dos para que la hinchada llegue fluida
        for (let k = 0; k < 2 && S.queue.length; k++) spawnEnemy(S.queue.pop());
        S.spawnT = 0.25;
      }
    }
  }

  // ─────────── Inicio / fin ───────────
  function init3D() {
    renderer = new T.WebGLRenderer({ canvas: $('c'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(window.innerWidth, window.innerHeight);
    window.addEventListener('resize', () => {
      renderer.setSize(window.innerWidth, window.innerHeight);
      if (camera) { camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix(); }
    });
  }

  function startGame(teamId, rivalId, lvl) {
    if (!renderer) init3D();
    own = TEAMS[teamId]; rival = TEAMS[rivalId]; levelId = lvl; levelDef = LEVELS[lvl];
    scene = new T.Scene();
    camera = new T.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.08, 700);
    scene.add(camera);
    W = lvl === 'estadio' ? buildStadium(scene, own, rival) : buildStreet(scene, own, rival);
    FX.init();
    flareLight = new T.PointLight(0xff7a30, 0, 12); scene.add(flareLight);
    vm = new T.Group(); camera.add(vm);

    pickSpots = W.pickSpots;

    enemies = []; allies = []; projs = []; areas = []; pickups = [];
    Object.assign(P, { hp: 100, vy: 0, wep: 0, last: 1, cd: 0, swing: -1, kills: 0, score: 0, dead: false, swapT: 0, onGround: true, bob: 0 });
    P.vel.set(0, 0, 0);
    P.pos.set(W.playerStart.x, W.playerStart.y, W.playerStart.z);
    P.yaw = W.playerStart.yaw; P.pitch = -0.1;
    P.ammo = WEAPONS.map(w => w.start);
    Object.assign(S, { state: 'play', paused: false, wave: -1, queue: [], nextWaveT: 1.0, policeMode: false, shake: 0, dmgFlash: 0, gasT: 0, pickT: 5, finished: false, time: 0, allyT: 0 });
    for (let i = 0; i < ALLY_MAX - 1; i++) spawnAlly(true);
    setTimeout(() => { if (S.state === 'play') showMsg('¡TUS COMPAÑERAS TE AYUDAN!', 'La barra de ' + own.short + ' defiende contigo', 3); }, 3200);
    buildViewmodel(); buildSlots();
    for (let i = 0; i < 3; i++) { const sp = pickSpots[(Math.random() * pickSpots.length) | 0]; dropPickup(sp[0], sp[1], sp[2], i % 2 ? 'health' : 'ammo'); }

    document.body.classList.add('playing');
    $('menu').classList.add('hidden'); $('end').classList.add('hidden'); $('pause').classList.add('hidden'); $('hud').classList.remove('hidden');
    document.documentElement.style.setProperty('--team', own.pri);
    Sfx.init(); Sfx.drumLoop(true); Sfx.setCrowd(0.07);
    showMsg(own.cheer, levelDef.name.toUpperCase(), 3);
    if (!S.noLock) $('c').requestPointerLock();
    clock.getDelta();
  }

  function endGame(win) {
    if (S.state !== 'play') return;
    S.state = 'over'; P.dead = !win;
    Sfx.drumLoop(false); mouseDown = false;
    if (document.exitPointerLock) document.exitPointerLock();
    $('end-title').textContent = win ? '¡VICTORIA! ' + own.cheer : 'TE CAYERON, PARCE';
    $('end-title').className = win ? 'win' : 'lose';
    $('end-stats').innerHTML = 'Oleadas: <b>' + Math.max(0, S.wave + (win ? 1 : 0)) + '/' + levelDef.waves.length + '</b> · KO: <b>' + P.kills + '</b> · Puntos: <b>' + P.score + '</b>';
    $('end').classList.remove('hidden');
    $('policefx').classList.remove('on');
  }

  // ─────────── Bucle ───────────
  function update(dt) {
    S.time += dt;
    S.shake = Math.max(0, S.shake - dt * 2.5);
    S.dmgFlash = Math.max(0, S.dmgFlash - dt * 1.5);
    S.gasT = Math.max(0, S.gasT - dt * 0.8);
    S.hurtSnd -= dt; S.hitT -= dt;
    if (S.state === 'play') {
      updatePlayer(dt);
      updateWaves(dt);
      updateProjectiles(dt);
      updateAreas(dt);
      updatePickups(dt);
    }
    for (const e of enemies) updateEnemy(e, dt);
    enemies = enemies.filter(e => !e.gone);
    if (S.state === 'play') {
      for (const a of allies) updateAlly(a, dt);
      allies = allies.filter(a => !a.gone);
      S.allyT -= dt;
      if (allies.length < ALLY_MAX && S.allyT <= 0) { spawnAlly(); S.allyT = 5; }
    }
    // emisores del escenario
    for (const em of W.emitters) {
      em.acc = (em.acc || 0) + dt * em.rate;
      while (em.acc >= 1) {
        em.acc -= 1;
        const jx = rand(-0.5, 0.5), jz = rand(-0.5, 0.5);
        if (em.kind === 'fire') FX.emit(em.x + jx, em.y, em.z + jz, rand(-0.3, 0.3), rand(1.5, 3), rand(-0.3, 0.3), { life: rand(0.5, 1.0), size: 0.9, grow: 0.8, color: em.color, add: true, op: 0.85 });
        else FX.emit(em.x + jx, em.y, em.z + jz, rand(-0.3, 0.3), rand(1.2, 2.4), rand(-0.3, 0.3), { life: rand(2.5, 4), size: 1.2, grow: 4, color: em.color, op: 0.45 });
      }
    }
    for (const f of W.flickers) f.intensity = 1.0 + Math.random() * 0.7;
    // luces de la policía
    const al = W.alarmLights;
    if (al.length) {
      const on = S.policeMode && S.state === 'play';
      const ph = Math.sin(S.time * 9) > 0;
      for (let i = 0; i < al.length; i++) al[i].intensity = on ? (((i % 2 === 0) === ph) ? 2.6 : 0) : 0;
    }
    FX.update(dt);
    updateHud();
  }

  function loop() {
    requestAnimationFrame(loop);
    if (!renderer || !scene) return;
    const dt = Math.min(clock.getDelta(), 0.033);
    if (!S.paused) update(dt);
    renderer.render(scene, camera);
  }

  // ─────────── Entrada ───────────
  document.addEventListener('keydown', e => {
    keys[e.code] = true;
    if (S.state !== 'play') return;
    if (e.code.startsWith('Digit')) { const n = +e.code.slice(5) - 1; if (n >= 0 && n < WEAPONS.length) setWeapon(n); }
    if (e.code === 'KeyQ') setWeapon(P.last);
    if (e.code === 'KeyM') showMsg(Sfx.toggleMute() ? 'SONIDO OFF' : 'SONIDO ON', '', 1);
    if (e.code === 'Space') e.preventDefault();
  });
  document.addEventListener('keyup', e => { keys[e.code] = false; });
  document.addEventListener('mousedown', e => {
    if (e.button === 0 && S.state === 'play' && (document.pointerLockElement || S.noLock)) mouseDown = true;
  });
  document.addEventListener('mouseup', e => { if (e.button === 0) mouseDown = false; });
  document.addEventListener('mousemove', e => {
    if (S.state !== 'play' || !document.pointerLockElement) return;
    P.yaw -= e.movementX * 0.0022;
    P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.5, 1.5);
  });
  document.addEventListener('wheel', e => {
    if (S.state !== 'play') return;
    setWeapon((P.wep + (e.deltaY > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length);
  });
  document.addEventListener('pointerlockchange', () => {
    if (S.noLock || S.state !== 'play') return;
    const locked = !!document.pointerLockElement;
    S.paused = !locked;
    $('pause').classList.toggle('hidden', locked);
    Sfx.drumLoop(locked);
    mouseDown = false;
    for (const k in keys) keys[k] = false;
  });
  $('pause').addEventListener('click', () => { $('c').requestPointerLock(); });

  // ─────────── Menú ───────────
  let selTeam = 'nacional', selRival = 'millonarios', selLevel = 'estadio';
  function buildMenu() {
    const mk = (cont, onPick, get) => {
      cont.innerHTML = '';
      Object.keys(TEAMS).forEach(id => {
        const t = TEAMS[id], b = document.createElement('button');
        b.className = 'team'; b.dataset.id = id;
        b.style.setProperty('--c1', t.pri); b.style.setProperty('--c2', t.sec);
        b.innerHTML = '<span class="shirt"></span><b>' + t.short + '</b>';
        b.addEventListener('click', () => { onPick(id); refresh(); });
        cont.appendChild(b);
      });
    };
    mk($('teams-own'), id => { selTeam = id; if (selRival === id) selRival = Object.keys(TEAMS).find(k => k !== id); });
    mk($('teams-rival'), id => { selRival = id; if (selTeam === id) selTeam = Object.keys(TEAMS).find(k => k !== id); });
    const lv = $('levels'); lv.innerHTML = '';
    Object.keys(LEVELS).forEach(id => {
      const b = document.createElement('button');
      b.className = 'level'; b.dataset.id = id;
      b.innerHTML = '<b>' + LEVELS[id].name + '</b><span>' + LEVELS[id].desc + '</span>';
      b.addEventListener('click', () => { selLevel = id; refresh(); });
      lv.appendChild(b);
    });
    refresh();
  }
  function refresh() {
    document.querySelectorAll('#teams-own .team').forEach(b => b.classList.toggle('sel', b.dataset.id === selTeam));
    document.querySelectorAll('#teams-rival .team').forEach(b => b.classList.toggle('sel', b.dataset.id === selRival));
    document.querySelectorAll('#levels .level').forEach(b => b.classList.toggle('sel', b.dataset.id === selLevel));
    document.querySelectorAll('#teams-own .team').forEach(b => b.classList.toggle('dis', b.dataset.id === selRival));
    document.querySelectorAll('#teams-rival .team').forEach(b => b.classList.toggle('dis', b.dataset.id === selTeam));
  }
  $('play').addEventListener('click', () => startGame(selTeam, selRival, selLevel));
  $('retry').addEventListener('click', () => startGame(selTeam, selRival, selLevel));
  $('tomenu').addEventListener('click', () => {
    S.state = 'menu'; document.body.classList.remove('playing');
    $('end').classList.add('hidden'); $('hud').classList.add('hidden'); $('menu').classList.remove('hidden');
  });

  buildMenu();
  loop();

  // Modo de prueba: ?auto=estadio&team=nacional&rival=junior
  if (params.get('auto')) {
    S.noLock = true;
    selTeam = params.get('team') || selTeam; selRival = params.get('rival') || selRival;
    startGame(selTeam, selRival, params.get('auto'));
    const aw = parseInt(params.get('wave') || '0', 10);
    if (aw > 0) { S.wave = aw - 1; S.nextWaveT = 0.1; }
    if (params.get('look')) P.yaw = parseFloat(params.get('look'));
    if (params.get('show')) {
      // vitrina de personajes para revisar el aspecto
      const types = Object.keys(ENEMY_TYPES).concat(['barrista', 'barrista', 'barrista', 'barrista', 'barrista']);
      types.forEach((t, i) => {
        const e = spawnEnemy(t);
        const row = i < 6 ? 0 : 1, col = (i < 6 ? i : i - 6) - 3 + (row ? 0.5 : 0);
        const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
        e.pos.set(P.pos.x + fx * (5 + row * 3) + rx * col * 1.6, 0, P.pos.z + fz * (5 + row * 3) + rz * col * 1.6);
        e.y = P.pos.y; e.cd = 999; e.retarget = 999;
      });
      S.queue = [];
    }
  }
  window.__G = { P, S, step: update, get enemies() { return enemies; }, get projs() { return projs; }, get allies() { return allies; } };
})();
