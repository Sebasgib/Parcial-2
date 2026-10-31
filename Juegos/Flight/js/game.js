/* Cielo en disputa: juego 3D (Three.js). Lo carga index.html bajo demanda: ver el cargador al final de ese archivo. */
(() => {
      'use strict';
      const T = window.THREE;
      const canvas = document.querySelector('#sky');
      const overlay = document.querySelector('#overlay');
      const startButton = document.querySelector('#start');
      const healthElement = document.querySelector('#health');
      const scoreElement = document.querySelector('#score');
      const timerElement = document.querySelector('#timer');
      const objectiveElement = document.querySelector('#objective');
      const fireButton = document.querySelector('#fire');
      const flashElement = document.querySelector('#flash');
      const pauseButton = document.querySelector('#pause-btn');
      const pauseOverlay = document.querySelector('#pause-overlay');
      const resumeButton = document.querySelector('#resume-btn');
      const restartButton = document.querySelector('#restart-btn');
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

      /* ================================================================
         0. COMPROBACIÓN DE WEBGL
         ================================================================ */
      let renderer = null;
      try {
        if (!T) throw new Error('three.js no cargó');
        renderer = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
      } catch (error) {
        document.querySelector('#copy').textContent = 'Este juego es en 3D y necesita WebGL. Activa la aceleración por hardware o prueba con otro navegador.';
        startButton.disabled = true;
        return;
      }

      /* ================================================================
         1. UTILIDADES Y ESTADO DEL JUEGO
         ================================================================ */
      const TAU = Math.PI * 2;
      const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
      const lerp = (a, b, t) => a + (b - a) * t;
      const rand = (a, b) => a + Math.random() * (b - a);
      const pick = list => list[Math.floor(Math.random() * list.length)];
      const MISSION_TIME = 150;
      const KILLS_TO_WIN = 12;
      const MAX_HEALTH = 8;
      const SEA_Y = -16;

      const keys = new Set();
      const player = { x: 0, y: 0, vx: 0, vy: 0, health: MAX_HEALTH, invulnerable: 0, targetX: 0, targetY: 0 };
      const bullets = [];
      const enemies = [];
      const wrecks = [];
      let mode = 'ready';
      let score = 0;
      let timeLeft = MISSION_TIME;
      let spawnClock = 0;
      let lastShot = -10;
      let gunSide = 1;
      let pointerActive = false;
      let firing = false;
      let paused = false;
      let needsRedraw = false;
      let clockT = 0;
      let flight = 1;
      let shake = 0;
      let lastFrame = 0;

      /* ================================================================
         2. ESCENA, CÁMARA Y LUCES
         ================================================================ */
      renderer.setClearColor(0xf0b98a);
      renderer.toneMapping = T.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.85;
      const scene = new T.Scene();
      scene.fog = new T.Fog(0xf0b98a, 110, 520);
      const camera = new T.PerspectiveCamera(38, 16 / 9, 0.5, 1800);
      const camBase = new T.Vector3(-5, 3, 64);
      const camLook = new T.Vector3(7, 8, 0);

      const hemi = new T.HemisphereLight(0xcfe6f2, 0xb8a08c, 0.85);
      scene.add(hemi);
      const sunLight = new T.DirectionalLight(0xffe2a8, 0.8);
      scene.add(sunLight);
      // Luz de relleno desde el lado de la cámara: evita que aviones y barcos queden a contraluz
      const fillLight = new T.DirectionalLight(0xbcd6ff, 0.5);
      fillLight.position.set(-60, 28, 90);
      scene.add(fillLight);
      const boomLight = new T.PointLight(0xff9a4a, 0, 70, 1.6);
      scene.add(boomLight);

      // Dirección del sol (a la derecha, baja sobre el horizonte)
      const sunDir = new T.Vector3(0.474, 0.208, -0.856).normalize();

      /* Límites del campo de juego: se obtienen proyectando las esquinas de la pantalla sobre el plano z = 0 */
      const bounds = { minX: -40, maxX: 40, minY: -14, maxY: 30, halfW: 40, cx: 0 };
      const ray = new T.Raycaster();
      const planeZ0 = new T.Plane(new T.Vector3(0, 0, 1), 0);
      const hitPoint = new T.Vector3();
      const pointOnPlane = (nx, ny, out) => {
        ray.setFromCamera({ x: nx, y: ny }, camera);
        ray.ray.intersectPlane(planeZ0, out);
        return out;
      };
      const worldX = f => bounds.minX + f * (bounds.maxX - bounds.minX);
      const worldY = f => bounds.maxY - f * (bounds.maxY - bounds.minY);

      const setSize = () => {
        const rect = canvas.getBoundingClientRect();
        const w = Math.max(1, rect.width), h = Math.max(1, rect.height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        renderer.setSize(w, h, false);
        needsRedraw = true;
        camera.aspect = w / h;
        // En pantallas estrechas la cámara se aleja para que el campo siga siendo jugable
        camBase.z = 64 * Math.max(1, Math.pow(1.5 / camera.aspect, 0.9));
        camera.position.copy(camBase);
        camera.lookAt(camLook);
        camera.updateProjectionMatrix();
        camera.updateMatrixWorld(true);
        const bl = pointOnPlane(-1, -1, new T.Vector3());
        const tr = pointOnPlane(1, 1, new T.Vector3());
        bounds.minX = bl.x; bounds.maxX = tr.x; bounds.minY = bl.y; bounds.maxY = tr.y;
        bounds.halfW = (tr.x - bl.x) / 2; bounds.cx = (tr.x + bl.x) / 2;
        particleScale.value = h * renderer.getPixelRatio() / (2 * Math.tan(T.MathUtils.degToRad(camera.fov / 2)));
      };

      /** Límites horizontales visibles a una profundidad z (la perspectiva ensancha el campo con la distancia). */
      const edgeAt = z => {
        const k = (camBase.z - z) / camBase.z;
        return { left: bounds.cx - bounds.halfW * k, right: bounds.cx + bounds.halfW * k };
      };

      /* ================================================================
         3. ATMÓSFERA: CIELO, SOL Y MAR (cambia de la tarde al ocaso)
         ================================================================ */
      const pal = (a, b) => [new T.Color(a), new T.Color(b)];
      const PAL = {
        top: pal('#2f7db0', '#1d2d63'),
        mid: pal('#f2d39f', '#c4607c'),
        horizon: pal('#ffbb80', '#f2704e'),
        sun: pal('#ffe6b0', '#ff8c5a'),
        deep: pal('#0d6a82', '#0a2c4f'),
        shallow: pal('#3cc0b4', '#2b7090'),
        hemiSky: pal('#d4e9f4', '#a5aad8'),
        hemiGround: pal('#b8a08c', '#6e5a7a'),
      };
      const mixed = {};
      for (const key of Object.keys(PAL)) mixed[key] = new T.Color();
      const applyAtmosphere = progress => {
        for (const key of Object.keys(PAL)) mixed[key].copy(PAL[key][0]).lerp(PAL[key][1], progress);
        skyUniforms.uTop.value.copy(mixed.top);
        skyUniforms.uMid.value.copy(mixed.mid);
        skyUniforms.uHorizon.value.copy(mixed.horizon);
        skyUniforms.uSunColor.value.copy(mixed.sun);
        seaUniforms.uDeep.value.copy(mixed.deep);
        seaUniforms.uShallow.value.copy(mixed.shallow);
        seaUniforms.uSky.value.copy(mixed.horizon);
        seaUniforms.uFog.value.copy(mixed.horizon);
        seaUniforms.uSunColor.value.copy(mixed.sun);
        scene.fog.color.copy(mixed.horizon);
        renderer.setClearColor(mixed.horizon);
        hemi.color.copy(mixed.hemiSky);
        hemi.groundColor.copy(mixed.hemiGround);
        sunLight.color.copy(mixed.sun);
        sunDir.y = lerp(0.208, 0.085, progress);
        sunDir.normalize();
        skyUniforms.uSunDir.value.copy(sunDir);
        seaUniforms.uSunDir.value.copy(sunDir);
        sunLight.position.copy(sunDir).multiplyScalar(120);
      };

      const skyUniforms = {
        uTop: { value: new T.Color() }, uMid: { value: new T.Color() }, uHorizon: { value: new T.Color() },
        uSunColor: { value: new T.Color() }, uSunDir: { value: sunDir.clone() },
      };
      const sky = new T.Mesh(
        new T.SphereGeometry(1000, 24, 16),
        new T.ShaderMaterial({
          uniforms: skyUniforms, side: T.BackSide, depthWrite: false, fog: false,
          vertexShader: 'varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
          fragmentShader: `
            uniform vec3 uTop, uMid, uHorizon, uSunColor, uSunDir; varying vec3 vDir;
            void main(){
              vec3 d = normalize(vDir);
              float h = max(d.y, 0.0);
              vec3 col = mix(uHorizon, mix(uMid, uTop, smoothstep(0.12, 0.75, h)), smoothstep(0.0, 0.3, h));
              float s = max(dot(d, uSunDir), 0.0);
              col += uSunColor * (pow(s, 6.0) * 0.22 + pow(s, 48.0) * 0.45);
              col = mix(col, vec3(1.0, 0.96, 0.82), smoothstep(0.9986, 0.9993, s));
              if (d.y < 0.0) col = uHorizon;
              gl_FragColor = vec4(col, 1.0);
            }`,
        }),
      );
      sky.renderOrder = -10;
      sky.frustumCulled = false;
      scene.add(sky);

      // Halo del sol
      const glowTexture = (() => {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const g = c.getContext('2d');
        const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
        grad.addColorStop(0, 'rgba(255,255,255,1)');
        grad.addColorStop(.25, 'rgba(255,255,255,.55)');
        grad.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = grad;
        g.fillRect(0, 0, 128, 128);
        return new T.CanvasTexture(c);
      })();
      const sunGlow = new T.Sprite(new T.SpriteMaterial({ map: glowTexture, color: 0xffd9a0, blending: T.AdditiveBlending, depthWrite: false, fog: false, transparent: true, opacity: .4 }));
      sunGlow.scale.set(520, 520, 1);
      scene.add(sunGlow);

      /* Mar: olas con facetas planas animadas en el vertex shader */
      const seaUniforms = {
        uTime: { value: 0 }, uScroll: { value: 0 },
        uDeep: { value: new T.Color() }, uShallow: { value: new T.Color() }, uSky: { value: new T.Color() }, uFog: { value: new T.Color() },
        uSunColor: { value: new T.Color() }, uSunDir: { value: sunDir.clone() },
        uFogNear: { value: 110 }, uFogFar: { value: 520 },
      };
      const sea = new T.Mesh(
        new T.PlaneGeometry(1100, 760, 220, 152).rotateX(-Math.PI / 2),
        new T.ShaderMaterial({
          uniforms: seaUniforms,
          vertexShader: `
            uniform float uTime, uScroll; varying vec3 vPos; varying float vH;
            float wave(vec2 p){
              return sin(p.x * 0.34 + uTime * 1.3) * 0.5 + sin(p.y * 0.47 - uTime * 1.05) * 0.38
                   + sin((p.x + p.y) * 0.21 + uTime * 0.8) * 0.55 + sin(p.x * 0.9 - p.y * 0.6 + uTime * 2.0) * 0.12;
            }
            void main(){
              vec4 wp = modelMatrix * vec4(position, 1.0);
              float h = wave(vec2(wp.x + uScroll, wp.z));
              wp.y += h;
              vH = h;
              vPos = wp.xyz;
              gl_Position = projectionMatrix * viewMatrix * wp;
            }`,
          fragmentShader: `
            uniform vec3 uDeep, uShallow, uSky, uFog, uSunColor, uSunDir; uniform float uFogNear, uFogFar;
            varying vec3 vPos; varying float vH;
            void main(){
              vec3 n = normalize(cross(dFdx(vPos), dFdy(vPos)));
              if (n.y < 0.0) n = -n;
              vec3 V = normalize(cameraPosition - vPos);
              float ndl = max(dot(n, uSunDir), 0.0);
              vec3 col = mix(uDeep, uShallow, clamp(ndl * 0.9 + (vH + 0.8) * 0.18, 0.0, 1.0));
              float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
              col = mix(col, uSky, fres * 0.55);
              vec3 R = reflect(-uSunDir, n);
              col += uSunColor * pow(max(dot(R, V), 0.0), 90.0) * 0.8;
              col = mix(col, vec3(0.92, 0.97, 1.0), smoothstep(1.0, 1.5, vH) * 0.45);
              float d = length(cameraPosition - vPos);
              col = mix(col, uFog, smoothstep(uFogNear, uFogFar, d));
              gl_FragColor = vec4(col, 1.0);
            }`,
        }),
      );
      sea.position.set(0, SEA_Y, -260);
      sea.frustumCulled = false;
      scene.add(sea);

      /* ================================================================
         4. GEOMETRÍA LOW POLY: sólidos convexos, pintura por caras y hélices
         ================================================================ */
      const mat = (color, extra = {}) => new T.MeshStandardMaterial(Object.assign({ color, flatShading: true, roughness: .8, metalness: .05 }, extra));
      const vcMat = (extra = {}) => new T.MeshStandardMaterial(Object.assign({ vertexColors: true, flatShading: true, roughness: .7, metalness: .1 }, extra));

      /** Sólido convexo a partir de vértices y caras (polígonos); orienta las normales hacia fuera. */
      const convexSolid = (verts, faces) => {
        const center = new T.Vector3();
        verts.forEach(v => center.add(new T.Vector3(v[0], v[1], v[2])));
        center.divideScalar(verts.length);
        const pos = [];
        const a = new T.Vector3(), b = new T.Vector3(), d = new T.Vector3(), n = new T.Vector3(), cen = new T.Vector3();
        for (const f of faces) {
          for (let i = 1; i < f.length - 1; i++) {
            a.fromArray(verts[f[0]]); b.fromArray(verts[f[i]]); d.fromArray(verts[f[i + 1]]);
            n.subVectors(b, a).cross(d.clone().sub(a));
            cen.copy(a).add(b).add(d).divideScalar(3).sub(center);
            if (n.dot(cen) < 0) pos.push(a.x, a.y, a.z, d.x, d.y, d.z, b.x, b.y, b.z);
            else pos.push(a.x, a.y, a.z, b.x, b.y, b.z, d.x, d.y, d.z);
          }
        }
        const geo = new T.BufferGeometry();
        geo.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
        geo.computeVertexNormals();
        return geo;
      };

      /** Pinta cada cara con un color según su centroide (aspecto facetado). */
      const paint = (geometry, fn) => {
        const geo = geometry.index ? geometry.toNonIndexed() : geometry;
        const p = geo.attributes.position;
        const colors = new Float32Array(p.count * 3);
        const c = new T.Color();
        for (let i = 0; i < p.count; i += 3) {
          const cx = (p.getX(i) + p.getX(i + 1) + p.getX(i + 2)) / 3;
          const cy = (p.getY(i) + p.getY(i + 1) + p.getY(i + 2)) / 3;
          const cz = (p.getZ(i) + p.getZ(i + 1) + p.getZ(i + 2)) / 3;
          fn(c, cx, cy, cz);
          for (let k = 0; k < 3; k++) { colors[(i + k) * 3] = c.r; colors[(i + k) * 3 + 1] = c.g; colors[(i + k) * 3 + 2] = c.b; }
        }
        geo.setAttribute('color', new T.BufferAttribute(colors, 3));
        geo.computeVertexNormals();
        return geo;
      };

      /** Ala trapezoidal con el eje del vano en z (side = ±1 para cada lado); el borde de ataque mira a +x. */
      const wingSolid = (span, rootC, tipC, thick, tipThick, sweep, side = 1) => {
        const r = rootC / 2, t = tipC / 2, s = side;
        const verts = [
          [r, thick / 2, 0], [-r, thick / 2, 0], [-r, -thick / 2, 0], [r, -thick / 2, 0],
          [t - sweep, tipThick / 2, span * s], [-t - sweep, tipThick / 2, span * s], [-t - sweep, -tipThick / 2, span * s], [t - sweep, -tipThick / 2, span * s],
        ];
        return convexSolid(verts, [[0, 1, 5, 4], [3, 2, 6, 7], [0, 4, 7, 3], [1, 2, 6, 5], [4, 5, 6, 7], [0, 1, 2, 3]]);
      };

      const lathe = (profile, segments) => new T.LatheGeometry(profile.map(([r, y]) => new T.Vector2(r, y)), segments)
        .rotateY(Math.PI / segments).rotateZ(-Math.PI / 2);

      const makeProp = (radius, blades, color) => {
        const group = new T.Group();
        const bladeGeo = new T.BoxGeometry(0.05, radius, 0.2).translate(0, radius / 2, 0);
        const bladeMat = mat(color, { roughness: .6 });
        for (let i = 0; i < blades; i++) {
          const blade = new T.Mesh(bladeGeo, bladeMat);
          blade.rotation.x = (i / blades) * TAU;
          group.add(blade);
        }
        const disc = new T.Mesh(
          new T.CircleGeometry(radius, 14).rotateY(Math.PI / 2),
          new T.MeshBasicMaterial({ color: 0x1b2326, transparent: true, opacity: .13, side: T.DoubleSide, depthWrite: false }),
        );
        return { group, disc };
      };

      const starGeometry = radius => {
        const shape = new T.Shape();
        for (let i = 0; i < 10; i++) {
          const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? radius * 0.42 : radius;
          if (i) shape.lineTo(Math.cos(a) * r, Math.sin(a) * r); else shape.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        }
        return new T.ShapeGeometry(shape);
      };

      const decalMat = color => new T.MeshBasicMaterial({ color, side: T.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });

      /* ---------- Caza del jugador (estilo Zero) ---------- */
      const buildPlayer = () => {
        const root = new T.Group(), pivot = new T.Group();
        root.add(pivot);
        const green = new T.Color('#587a52'), belly = new T.Color('#dcd7c0'), cream = new T.Color('#eadfb8');
        const body = vcMat();
        const dark = mat('#2c3438', { roughness: .5, metalness: .3 });
        const add = (mesh, x = 0, y = 0, z = 0, parent = pivot) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

        const fuselage = paint(lathe([[0, -3.9], [.14, -3.8], [.3, -2.9], [.52, -1.7], [.68, -.4], [.76, .8], [.74, 1.8], [.68, 2.4], [0, 2.45]], 8),
          (c, x, y) => c.copy(x < -3.0 ? cream : y > 0.06 ? green : belly));
        add(new T.Mesh(fuselage, body));
        add(new T.Mesh(new T.CylinderGeometry(.74, .7, .95, 10).rotateZ(-Math.PI / 2), dark), 2.8);
        add(new T.Mesh(new T.ConeGeometry(.3, .75, 8).rotateZ(-Math.PI / 2), mat('#d2492f', { roughness: .5 })), 3.65);
        const prop = makeProp(1.55, 3, '#1d2124');
        prop.group.position.x = 3.3; prop.disc.position.x = 3.3;
        pivot.add(prop.group, prop.disc);

        // Cabina con piloto
        const glass = mat('#9ad9ea', { transparent: true, opacity: .62, roughness: .15, emissive: '#1a5668', emissiveIntensity: .35 });
        add(new T.Mesh(new T.SphereGeometry(.55, 8, 5).scale(1.7, .85, .85), glass), .15, .76);
        add(new T.Mesh(new T.IcosahedronGeometry(.2, 0), mat('#e8c9a4')), .2, .7);
        add(new T.Mesh(new T.IcosahedronGeometry(.2, 0).scale(1, .6, 1), mat('#3b2f28')), .2, .82);

        // Alas bajas con diedro, tanque auxiliar y escarapelas
        for (const side of [1, -1]) {
          const wing = new T.Mesh(paint(wingSolid(4.9, 1.95, .95, .24, .08, .35, side), (c, x, y) => c.copy(y > 0.02 ? green : belly)), body);
          add(wing, .35, -.22, 0);
          wing.rotation.x = -0.07 * side;
          const white = new T.Mesh(new T.CircleGeometry(.72, 12).rotateX(-Math.PI / 2), decalMat(0xf2ead0));
          const red = new T.Mesh(new T.CircleGeometry(.5, 12).rotateX(-Math.PI / 2), decalMat(0xd1332a));
          add(white, .05, .135, 2.0 * side, wing); add(red, .05, .14, 2.0 * side, wing);
          const stab = new T.Mesh(paint(wingSolid(1.7, 1.15, .5, .12, .05, .35, side), (c, x, y) => c.copy(y > 0 ? green : belly)), body);
          add(stab, -3.25, .08, 0); stab.rotation.x = -0.04 * side;
          // Escarapela en el fuselaje
          const fusW = new T.Mesh(new T.CircleGeometry(.36, 10), decalMat(0xf2ead0));
          const fusR = new T.Mesh(new T.CircleGeometry(.25, 10), decalMat(0xd1332a));
          add(fusW, -1.7, .0, .5 * side); add(fusR, -1.7, 0, .505 * side);
          fusW.rotation.y = fusR.rotation.y = side > 0 ? 0 : Math.PI;
          // Escapes
          for (let i = 0; i < 3; i++) add(new T.Mesh(new T.CylinderGeometry(.06, .08, .35, 5).rotateZ(-Math.PI / 2 + .2), dark), 1.9 + i * .28, .02 - i * .05, .76 * side);
        }
        const fin = new T.Mesh(paint(wingSolid(1.55, 1.35, .55, .13, .05, .65), (c, x) => c.copy(x < -.25 ? cream : green)).rotateX(-Math.PI / 2), body);
        add(fin, -3.15, .22);
        add(new T.Mesh(new T.SphereGeometry(1, 8, 5).scale(1.15, .3, .3), mat('#e3dcc0')), .5, -.78);
        add(new T.Mesh(new T.CylinderGeometry(.05, .05, .9, 5).rotateZ(-Math.PI / 2), dark), 2.9, .8, .2);
        add(new T.Mesh(new T.CylinderGeometry(.05, .05, .9, 5).rotateZ(-Math.PI / 2), dark), 2.9, .8, -.2);
        return { root, pivot, prop, glass };
      };

      /* ---------- Bombardero cuatrimotor ---------- */
      const buildBomber = () => {
        const root = new T.Group(), pivot = new T.Group(), body = new T.Group();
        root.add(pivot); pivot.add(body);
        body.rotation.y = Math.PI; // el modelo mira a +x; el bombardero vuela hacia -x
        const mats = [];
        const track = m => { mats.push(m); return m; };
        const metal = track(vcMat({ roughness: .4, metalness: .25 }));
        const dark = track(mat('#2d3438', { roughness: .5, metalness: .3 }));
        const glass = mat('#a5dcea', { transparent: true, opacity: .6, roughness: .15, emissive: '#1a5668', emissiveIntensity: .3 });
        const top = new T.Color('#dfe4e6'), under = new T.Color('#9aa5ac'), band = new T.Color('#b64a3a');
        const add = (mesh, x = 0, y = 0, z = 0, parent = body) => { mesh.position.set(x, y, z); parent.add(mesh); return mesh; };

        add(new T.Mesh(paint(lathe([[0, -7.2], [.3, -7], [.6, -5.8], [1.0, -3.8], [1.3, -1.6], [1.45, 1], [1.4, 3.6], [1.15, 5.3], [.75, 6.3], [.2, 6.7]], 10),
          (c, x, y) => c.copy(x < -6.0 ? band : y > 0.15 ? top : under)), metal));
        add(new T.Mesh(new T.SphereGeometry(.95, 8, 6).scale(1.15, .9, .9), glass), 6.15, -.05);
        add(new T.Mesh(new T.SphereGeometry(.7, 8, 5).scale(1.7, .7, .8), glass), 3.9, 1.3);
        for (const side of [1, -1]) {
          const wing = add(new T.Mesh(paint(wingSolid(9.8, 3.7, 1.7, .6, .22, .9, side), (c, x, y) => c.copy(y > 0.03 ? top : under)), metal), .8, -.15, 0);
          wing.rotation.x = -0.05 * side;
          const stab = add(new T.Mesh(paint(wingSolid(3.7, 2.3, 1.0, .24, .1, .55, side), (c, x, y) => c.copy(y > 0.02 ? top : under)), metal), -6.0, .15, 0);
          stab.rotation.x = -0.03 * side;
          // Insignia estadounidense (círculo azul con estrella) en ala y fuselaje
          const disc = new T.Mesh(new T.CircleGeometry(.95, 12).rotateX(-Math.PI / 2), decalMat(0x233c78));
          const star = new T.Mesh(starGeometry(.7).rotateX(-Math.PI / 2), decalMat(0xf5f1e3));
          add(disc, .2, .33, 5.0 * side, wing); add(star, .2, .345, 5.0 * side, wing);
          const fd = new T.Mesh(new T.CircleGeometry(.62, 12), decalMat(0x233c78));
          const fs = new T.Mesh(starGeometry(.48), decalMat(0xf5f1e3));
          add(fd, 2.4, .1, 1.33 * side); add(fs, 2.4, .1, 1.335 * side);
          fd.rotation.y = fs.rotation.y = side > 0 ? 0 : Math.PI;
        }
        add(new T.Mesh(paint(wingSolid(4.1, 3.3, 1.3, .32, .12, 1.3), (c, x, y, z) => c.copy(x < -.2 ? band : top)).rotateX(-Math.PI / 2), metal), -5.7, 1.2);

        // Cuatro motores con hélices de cuatro palas
        const props = [];
        for (const side of [1, -1]) for (const zz of [3.2, 6.4]) {
          add(new T.Mesh(paint(new T.CylinderGeometry(.58, .5, 2.8, 8).rotateZ(-Math.PI / 2), (c, x, y) => c.copy(y > 0 ? top : under)), metal), 1.6, -.4, zz * side);
          add(new T.Mesh(new T.CylinderGeometry(.5, .5, .35, 8).rotateZ(-Math.PI / 2), dark), 3.15, -.4, zz * side);
          const p = makeProp(1.4, 4, '#1b2023');
          p.group.position.set(3.45, -.4, zz * side); p.disc.position.set(3.45, -.4, zz * side);
          body.add(p.group, p.disc);
          props.push(p.group);
        }
        // Torretas
        add(new T.Mesh(new T.SphereGeometry(.4, 6, 4), glass), 2.2, 1.45);
        add(new T.Mesh(new T.SphereGeometry(.4, 6, 4), glass), .6, -1.4);
        add(new T.Mesh(new T.ConeGeometry(.3, .8, 6).rotateZ(Math.PI / 2), dark), -7.3, .1);
        return { root, pivot, props, mats, body };
      };

      /* ---------- Buque de guerra (decorado) ---------- */
      const buildShip = () => {
        const g = new T.Group();
        const hull = paint(convexSolid(
          [[-7, 1, -1.4], [-7, 1, 1.4], [4.5, 1, 1.6], [8, 1, 0], [4.5, 1, -1.6], [-6.5, -.8, -1], [-6.5, -.8, 1], [4, -.8, 1], [7, -.8, 0], [4, -.8, -1]],
          [[0, 1, 2, 3, 4], [5, 9, 8, 7, 6], [0, 1, 6, 5], [1, 2, 7, 6], [2, 3, 8, 7], [3, 4, 9, 8], [4, 0, 5, 9]]),
          (c, x, y) => c.set(y > 0.5 ? '#8f948f' : '#6b7782'));
        g.add(new T.Mesh(hull, vcMat({ roughness: .8 })));
        const light = mat('#aeb4b0'), darkM = mat('#3a4248');
        const place = (mesh, x, y, z) => { mesh.position.set(x, y, z); g.add(mesh); return mesh; };
        place(new T.Mesh(new T.BoxGeometry(3.6, 1.3, 2.2), light), -2.2, 1.65, 0);
        place(new T.Mesh(new T.BoxGeometry(2.0, 1.0, 1.6), light), -2.6, 2.7, 0);
        place(new T.Mesh(new T.BoxGeometry(.1, .35, 1.7), mat('#26323a', { emissive: '#1e3f55', emissiveIntensity: .6 })), -1.58, 2.7, 0);
        const funnel = place(new T.Mesh(new T.CylinderGeometry(.55, .65, 1.9, 6), darkM), .6, 2.3, 0);
        place(new T.Mesh(new T.CylinderGeometry(.57, .57, .3, 6), mat('#a33a2e')), .6, 2.75, 0);
        place(new T.Mesh(new T.CylinderGeometry(.06, .08, 3, 4), darkM), -2.6, 4.7, 0);
        place(new T.Mesh(new T.BoxGeometry(.08, .08, 1.6), darkM), -2.6, 5.1, 0);
        for (const x of [3.8, -5.2]) {
          place(new T.Mesh(new T.CylinderGeometry(.55, .65, .5, 6), darkM), x, 1.3, 0);
          place(new T.Mesh(new T.BoxGeometry(1.6, .12, .12), darkM), x + .9 * Math.sign(x), 1.45, 0);
        }
        const wake = new T.Mesh(new T.BufferGeometry(), new T.MeshBasicMaterial({ color: 0xf2fbff, transparent: true, opacity: .4, depthWrite: false, fog: true, side: T.DoubleSide }));
        wake.geometry.setAttribute('position', new T.Float32BufferAttribute([-6.8, 0, -1.2, -6.8, 0, 1.2, -30, 0, 5.5, -6.8, 0, -1.2, -30, 0, 5.5, -30, 0, -5.5], 3));
        wake.position.y = -.75;
        g.add(wake);
        g.userData.funnel = funnel;
        g.userData.wake = wake;
        return g;
      };

      /* ---------- Isla con palmeras, rocas, espuma y (a veces) un faro ---------- */
      const buildIsland = (radius, withLighthouse) => {
        const g = new T.Group();
        const sand = new T.Mesh(new T.CylinderGeometry(radius * 1.02, radius * 1.3, 4, 11), mat('#e6d19c'));
        sand.position.y = SEA_Y;
        g.add(sand);
        const hillGeo = new T.IcosahedronGeometry(radius * .8, 1);
        const hp = hillGeo.attributes.position;
        for (let i = 0; i < hp.count; i++) {
          const hx = hp.getX(i), hy = hp.getY(i), hz = hp.getZ(i);
          const k = 1 + Math.sin(hx * 1.7 + hy * 2.3 + hz * 3.1) * .13; // mismo desplazamiento para vértices coincidentes
          hp.setXYZ(i, hx * k, hy * k * .6, hz * k);
        }
        const hill = new T.Mesh(paint(hillGeo, (c, x, y) => c.set(y > radius * .3 ? '#6aa456' : y > radius * .12 ? '#4f9250' : '#3e7a45')), vcMat({ roughness: .9 }));
        hill.position.y = SEA_Y + 2;
        g.add(hill);
        const rock = new T.Mesh(new T.IcosahedronGeometry(radius * .26, 0), mat('#7f8480'));
        rock.position.set(radius * .35, SEA_Y + 2 + radius * .38, -radius * .1);
        g.add(rock);
        const hillTop = r => SEA_Y + 2 + Math.sqrt(Math.max(0, 1 - (r / (radius * .8)) ** 2)) * radius * .8 * .6 * .92;
        const palmCount = Math.round(radius / 2.6) + 3;
        for (let i = 0; i < palmCount; i++) {
          const a = rand(0, TAU), r = rand(.1, .62) * radius;
          const palm = new T.Group();
          const h = rand(2.2, 3.8);
          const trunk = new T.Mesh(new T.CylinderGeometry(.1, .2, h, 5).translate(0, h / 2, 0), mat('#8a6a46'));
          palm.add(trunk);
          for (let l = 0; l < 6; l++) {
            const leaf = new T.Mesh(new T.ConeGeometry(.32, 2.1, 4).rotateZ(Math.PI / 2).translate(1.0, 0, 0), mat(l % 2 ? '#3f9a52' : '#56b05a', { side: T.DoubleSide }));
            leaf.position.y = h;
            leaf.rotation.y = (l / 6) * TAU;
            leaf.rotation.z = -.35;
            palm.add(leaf);
          }
          palm.position.set(Math.cos(a) * r, hillTop(r) - .2, Math.sin(a) * r);
          palm.rotation.z = rand(-.12, .12);
          palm.userData.sway = rand(0, TAU);
          g.add(palm);
        }
        if (withLighthouse) {
          const tower = new T.Group();
          const stripeA = mat('#f4f0e4'), stripeB = mat('#c4443a');
          for (let i = 0; i < 4; i++) {
            const seg = new T.Mesh(new T.CylinderGeometry(.9 - i * .1, 1.0 - i * .1, 1.6, 8), i % 2 ? stripeB : stripeA);
            seg.position.y = .8 + i * 1.6;
            tower.add(seg);
          }
          const lamp = new T.Mesh(new T.CylinderGeometry(.55, .55, .8, 8), new T.MeshBasicMaterial({ color: 0xfff1b8 }));
          lamp.position.y = 6.8;
          tower.add(lamp);
          const roof = new T.Mesh(new T.ConeGeometry(.9, .9, 8), stripeB);
          roof.position.y = 7.65;
          tower.add(roof);
          const beam = new T.Group();
          const cone = new T.Mesh(
            new T.ConeGeometry(2.4, 34, 10, 1, true).translate(0, -17, 0).rotateZ(Math.PI / 2),
            new T.MeshBasicMaterial({ color: 0xfff0b0, transparent: true, opacity: .18, blending: T.AdditiveBlending, depthWrite: false, side: T.DoubleSide, fog: true }),
          );
          beam.add(cone);
          beam.position.y = 6.8;
          tower.add(beam);
          tower.position.set(-radius * .2, hillTop(radius * .2) - .3, radius * .1);
          g.add(tower);
          g.userData.beam = beam;
          g.userData.beamMat = cone.material;
        }
        const foam = new T.Mesh(new T.RingGeometry(radius * 1.08, radius * 1.5, 24).rotateX(-Math.PI / 2), new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .4, depthWrite: false, fog: true }));
        foam.position.y = SEA_Y + .35;
        g.add(foam);
        g.userData.foam = foam;
        g.userData.radius = radius;
        return g;
      };

      /* ---------- Nubes ---------- */
      const cloudMat = mat('#ecdfd6', { emissive: '#ffc9b0', emissiveIntensity: .1, roughness: 1 });
      const buildCloud = size => {
        const g = new T.Group();
        const puffs = 5 + Math.floor(Math.random() * 4);
        for (let i = 0; i < puffs; i++) {
          const r = size * rand(.5, 1);
          const puff = new T.Mesh(new T.IcosahedronGeometry(r, 1), cloudMat);
          puff.scale.set(1.25, .62, .9);
          puff.position.set((i - puffs / 2) * size * .8 + rand(-.3, .3) * size, rand(-.2, .35) * size, rand(-.5, .5) * size);
          g.add(puff);
        }
        return g;
      };

      /* ---------- Gaviotas ---------- */
      const gullBody = new T.IcosahedronGeometry(.28, 0).scale(1.9, .8, .8);
      const gullWing = new T.BufferGeometry();
      gullWing.setAttribute('position', new T.Float32BufferAttribute([0, 0, 0, -.35, 0, 1.0, .5, 0, .1, 0, 0, 0, .5, 0, .1, -.1, 0, .9], 3));
      gullWing.computeVertexNormals();
      const gullMat = mat('#f6f2ea', { side: T.DoubleSide, roughness: 1 });
      const buildGull = () => {
        const g = new T.Group();
        g.add(new T.Mesh(gullBody, gullMat));
        const wings = [];
        for (const side of [1, -1]) {
          const pivot = new T.Group();
          const w = new T.Mesh(gullWing, gullMat);
          w.scale.z = side;
          pivot.add(w);
          g.add(pivot);
          wings.push(pivot);
        }
        g.userData.wings = wings;
        return g;
      };

      /* ---------- Delfín saltarín ---------- */
      const buildDolphin = () => {
        const g = new T.Group();
        const m = mat('#7f95a4', { roughness: .6 });
        const belly = mat('#e1e8ec', { roughness: .6 });
        g.add(new T.Mesh(new T.SphereGeometry(.6, 7, 5).scale(2.6, .8, .8), m));
        const snout = new T.Mesh(new T.ConeGeometry(.2, .9, 6).rotateZ(-Math.PI / 2), m);
        snout.position.x = 1.9; g.add(snout);
        const fin = new T.Mesh(new T.ConeGeometry(.28, .7, 4), m);
        fin.position.set(.1, .65, 0); fin.rotation.z = -.5; g.add(fin);
        const tail = new T.Mesh(new T.ConeGeometry(.55, 1.0, 4).scale(1, 1, .25), m);
        tail.position.x = -2.1; tail.rotation.z = Math.PI / 2; g.add(tail);
        const under = new T.Mesh(new T.SphereGeometry(.5, 6, 4).scale(2.3, .5, .7), belly);
        under.position.y = -.25; g.add(under);
        return g;
      };

      /* ================================================================
         5. PARTÍCULAS (humo, fuego, espuma): dos sistemas con un solo draw call cada uno
         ================================================================ */
      const particleScale = { value: 800 };
      class ParticleSystem {
        constructor(max, additive) {
          this.max = max;
          this.list = [];
          this.pos = new Float32Array(max * 3);
          this.col = new Float32Array(max * 4);
          this.size = new Float32Array(max);
          const geo = new T.BufferGeometry();
          geo.setAttribute('position', new T.BufferAttribute(this.pos, 3).setUsage(T.DynamicDrawUsage));
          geo.setAttribute('aColor', new T.BufferAttribute(this.col, 4).setUsage(T.DynamicDrawUsage));
          geo.setAttribute('aSize', new T.BufferAttribute(this.size, 1).setUsage(T.DynamicDrawUsage));
          this.geo = geo;
          this.points = new T.Points(geo, new T.ShaderMaterial({
            uniforms: { uScale: particleScale },
            transparent: true, depthWrite: false, blending: additive ? T.AdditiveBlending : T.NormalBlending,
            vertexShader: `
              uniform float uScale; attribute vec4 aColor; attribute float aSize; varying vec4 vColor;
              void main(){ vColor = aColor; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uScale / -mv.z; gl_Position = projectionMatrix * mv; }`,
            fragmentShader: `
              varying vec4 vColor;
              void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.18, d) * vColor.a; if (a < 0.01) discard; gl_FragColor = vec4(vColor.rgb, a); }`,
          }));
          this.points.frustumCulled = false;
          scene.add(this.points);
        }

        emit(x, y, z, vx, vy, vz, life, s0, s1, c0, c1, a0 = 1, drag = 0, grav = 0) {
          if (this.list.length >= this.max) this.list.shift();
          this.list.push({ x, y, z, vx, vy, vz, life, max: life, s0, s1, c0: new T.Color(c0), c1: new T.Color(c1), a0, drag, grav });
        }

        update(dt) {
          const list = this.list;
          const tmp = new T.Color();
          for (let i = list.length - 1; i >= 0; i--) {
            const p = list[i];
            p.life -= dt;
            if (p.life <= 0) { list[i] = list[list.length - 1]; list.pop(); continue; }
            p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
            const k = Math.max(0, 1 - p.drag * dt);
            p.vx *= k; p.vy = p.vy * k + p.grav * dt; p.vz *= k;
          }
          for (let i = 0; i < list.length; i++) {
            const p = list[i], t = 1 - p.life / p.max;
            tmp.copy(p.c0).lerp(p.c1, t);
            this.pos[i * 3] = p.x; this.pos[i * 3 + 1] = p.y; this.pos[i * 3 + 2] = p.z;
            this.col[i * 4] = tmp.r; this.col[i * 4 + 1] = tmp.g; this.col[i * 4 + 2] = tmp.b; this.col[i * 4 + 3] = p.a0 * (1 - t * t);
            this.size[i] = lerp(p.s0, p.s1, t);
          }
          this.geo.setDrawRange(0, list.length);
          this.geo.attributes.position.needsUpdate = true;
          this.geo.attributes.aColor.needsUpdate = true;
          this.geo.attributes.aSize.needsUpdate = true;
        }

        clear() { this.list.length = 0; }
      }
      const smokeFx = new ParticleSystem(1400, false);
      const fireFx = new ParticleSystem(900, true);

      /* ================================================================
         6. SONIDO PROCEDURAL (se activa al iniciar la misión)
         ================================================================ */
      const audio = (() => {
        let ctx = null, master = null, engineOsc = null, engineOsc2 = null, engineGain = null, noiseBuffer = null, muted = false;
        const init = () => {
          if (ctx) { ctx.resume(); return; }
          try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (error) { ctx = null; return; }
          master = ctx.createGain(); master.gain.value = muted ? 0 : .55; master.connect(ctx.destination);
          noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
          const data = noiseBuffer.getChannelData(0);
          for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
          // Oleaje y viento
          const sea = ctx.createBufferSource(); sea.buffer = noiseBuffer; sea.loop = true;
          const seaFilter = ctx.createBiquadFilter(); seaFilter.type = 'lowpass'; seaFilter.frequency.value = 480;
          const seaGain = ctx.createGain(); seaGain.gain.value = .07;
          const lfo = ctx.createOscillator(); lfo.frequency.value = .13;
          const lfoGain = ctx.createGain(); lfoGain.gain.value = .04;
          lfo.connect(lfoGain).connect(seaGain.gain);
          sea.connect(seaFilter).connect(seaGain).connect(master);
          sea.start(); lfo.start();
          // Motor
          engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth'; engineOsc.frequency.value = 64;
          engineOsc2 = ctx.createOscillator(); engineOsc2.type = 'sawtooth'; engineOsc2.frequency.value = 65.6;
          const engineFilter = ctx.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 300;
          engineGain = ctx.createGain(); engineGain.gain.value = .045;
          engineOsc.connect(engineFilter); engineOsc2.connect(engineFilter);
          engineFilter.connect(engineGain).connect(master);
          engineOsc.start(); engineOsc2.start();
        };
        const burst = (dur, freq, vol, type = 'lowpass', sweepTo = null) => {
          if (!ctx) return;
          const src = ctx.createBufferSource(); src.buffer = noiseBuffer;
          const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, ctx.currentTime);
          if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
          const g = ctx.createGain(); g.gain.setValueAtTime(vol, ctx.currentTime); g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + dur);
          src.connect(f).connect(g).connect(master);
          src.start(ctx.currentTime, Math.random()); src.stop(ctx.currentTime + dur);
        };
        return {
          init,
          shot() { burst(.07, 2400, .16, 'highpass'); burst(.09, 600, .12, 'lowpass'); },
          hit() { burst(.2, 900, .3, 'lowpass', 120); },
          boom(big) { burst(big ? 1.1 : .5, 1400, big ? .55 : .3, 'lowpass', 70); },
          splash() { burst(.5, 3000, .18, 'bandpass', 500); },
          engine(speed) {
            if (!ctx) return;
            const f = 62 + speed * 11;
            engineOsc.frequency.setTargetAtTime(f, ctx.currentTime, .08);
            engineOsc2.frequency.setTargetAtTime(f * 1.025, ctx.currentTime, .08);
          },
          toggle() { muted = !muted; if (master) master.gain.value = muted ? 0 : .55; },
          suspend() { if (ctx) ctx.suspend(); },
          resume() { if (ctx) ctx.resume(); },
        };
      })();

      /* ================================================================
         7. MUNDO VIVO: islas, buques, nubes, gaviotas, delfines, faro y ráfagas de viento
         ================================================================ */
      const scenery = [];
      const addScenery = (obj, speed, respawn, update) => {
        scene.add(obj);
        scenery.push({ obj, speed, respawn, update });
        respawn(obj, true);
      };

      for (let i = 0; i < 9; i++) {
        const size = rand(6, 15);
        addScenery(buildCloud(size), rand(4, 10), (o, first) => {
          const z = rand(-190, -45), e = edgeAt(z);
          o.position.set(first ? rand(e.left, e.right) : e.right + size * 5 + rand(0, 40), rand(8, 36) - z * .05, z);
        }, (s, dt) => { s.obj.position.y += Math.sin(clockT * .3 + s.obj.id) * .3 * dt; });
      }

      const islandPlan = [[12, true], [9, false], [15, false], [7, false], [11, false]];
      for (const [radius, lighthouse] of islandPlan) {
        addScenery(buildIsland(radius, lighthouse), rand(7, 9.5), (o, first) => {
          const z = rand(-130, -52), e = edgeAt(z);
          o.position.set(first ? rand(e.left, e.right) : e.right + radius * 2.5 + rand(0, 60), 0, z);
          o.rotation.y = rand(0, TAU);
        }, (s, dt) => {
          const u = s.obj.userData;
          u.foam.scale.setScalar(1 + Math.sin(clockT * 1.6 + s.obj.id) * .05);
          u.foam.material.opacity = .32 + Math.sin(clockT * 1.6 + s.obj.id) * .1;
          if (u.beam) {
            u.beam.rotation.y += dt * 1.1;
            u.beamMat.opacity = .08 + .22 * clamp((missionProgress() - .25) * 1.5, 0, 1) + .08;
          }
          s.obj.children.forEach(child => { if (child.userData.sway !== undefined) child.rotation.x = Math.sin(clockT * 1.5 + child.userData.sway) * .05; });
        });
      }

      // Cordillera lejana, casi velada por la bruma (picos irregulares)
      for (let i = 0; i < 5; i++) {
        const rock = new T.IcosahedronGeometry(rand(20, 30), 1);
        const rp = rock.attributes.position;
        for (let v = 0; v < rp.count; v++) {
          const x = rp.getX(v), y = rp.getY(v), z = rp.getZ(v);
          const k = 1 + Math.sin(x * .31 + y * .47 + z * .23) * .24;
          rp.setXYZ(v, x * k * 1.15, (y > 0 ? y * 1.9 : y * .5) * k, z * k);
        }
        const peak = new T.Mesh(
          paint(rock, (c, x, y) => c.set(y > 22 ? '#a3b2b0' : y > 6 ? '#718c88' : '#5f7a78')),
          vcMat({ roughness: 1 }),
        );
        addScenery(peak, 1.6, (o, first) => {
          const z = -rand(300, 380), e = edgeAt(z);
          o.position.set(first ? rand(e.left, e.right) : e.right + 80, SEA_Y + 8, z);
        });
      }

      // Buques de guerra con humo y estela
      for (let i = 0; i < 3; i++) {
        const ship = buildShip();
        const dir = i === 1 ? 1 : -1;
        if (dir === -1) ship.rotation.y = Math.PI; // la proa mira hacia donde navega
        const speed = dir === 1 ? 4.5 : 12; // los que navegan contra la corriente de la escena pasan más rápido
        addScenery(ship, speed, (o, first) => {
          const z = rand(-75, -38), e = edgeAt(z);
          o.position.set(first ? rand(e.left, e.right) : e.right + 40 + rand(0, 40), SEA_Y + 1, z);
        }, (s, dt) => {
          s.obj.rotation.z = Math.sin(clockT * .9 + s.obj.id) * .02;
          s.obj.position.y = SEA_Y + 1 + Math.sin(clockT * 1.1 + s.obj.id) * .15;
          if (Math.random() < dt * 9) {
            const p = new T.Vector3();
            s.obj.userData.funnel.getWorldPosition(p);
            smokeFx.emit(p.x, p.y + 1.1, p.z, -3 + rand(-.4, .4), rand(1.4, 2.4), 0, 3.4, 1.0, 3.6, 0x4a4f52, 0x8b9094, .55, .2);
          }
        });
      }

      // Bandadas de gaviotas
      for (let i = 0; i < 3; i++) {
        const flock = new T.Group();
        const gulls = [];
        const count = 5 + i * 2;
        for (let k = 0; k < count; k++) {
          const gull = buildGull();
          gull.position.set(-k * 1.8 + rand(-.4, .4), rand(-1, 1) + Math.abs(k - count / 2) * -.5, (k % 2 ? 1 : -1) * k * .9);
          gull.userData.phase = rand(0, TAU);
          flock.add(gull);
          gulls.push(gull);
        }
        flock.userData.gulls = gulls;
        addScenery(flock, rand(-7, -2), (o, first) => {
          const z = rand(-34, -12), e = edgeAt(z);
          o.position.set(first ? rand(e.left, e.right) : e.left - 30 - rand(0, 40), rand(-8, 14), z);
          o.userData.baseY = o.position.y;
        }, (s, dt) => {
          s.obj.position.y = s.obj.userData.baseY + Math.sin(clockT * .8 + s.obj.id) * 1.2;
          for (const gull of s.obj.userData.gulls) {
            const flap = Math.sin(clockT * 7 + gull.userData.phase);
            gull.userData.wings[0].rotation.x = flap * .6;
            gull.userData.wings[1].rotation.x = -flap * .6;
          }
        });
        // Las gaviotas vuelan hacia la derecha (contra el avance): aparecen por la izquierda
        const entry = scenery[scenery.length - 1];
        entry.reverse = true;
      }

      // Delfines que saltan del agua de vez en cuando
      const dolphins = [];
      for (let i = 0; i < 2; i++) {
        const mesh = buildDolphin();
        mesh.visible = false;
        scene.add(mesh);
        dolphins.push({ mesh, active: false, t: 0, vx: 0, vy: 0, wait: rand(2, 6) });
      }
      const updateDolphins = dt => {
        for (const d of dolphins) {
          if (!d.active) {
            d.wait -= dt;
            if (d.wait > 0) continue;
            const z = rand(-34, -16), e = edgeAt(z);
            d.active = true;
            d.mesh.visible = true;
            d.mesh.position.set(rand(e.left * .5, e.right * .8), SEA_Y - .5, z);
            d.vx = -rand(5, 9) * flight;
            d.vy = rand(13, 17);
            d.mesh.scale.setScalar(rand(.95, 1.35));
            for (let k = 0; k < 12; k++) fireFx.emit(d.mesh.position.x, SEA_Y + .2, z, rand(-2, 2), rand(3, 8), rand(-1, 1), .8, .8, .3, 0xffffff, 0xcfeaf4, .7, .5, -14);
            continue;
          }
          d.vy -= 24 * dt;
          d.mesh.position.x += d.vx * dt;
          d.mesh.position.y += d.vy * dt;
          d.mesh.rotation.z = Math.atan2(d.vy, -d.vx) * -1 + Math.PI;
          d.mesh.rotation.y = Math.PI;
          if (d.vy < 0 && d.mesh.position.y < SEA_Y - .2) {
            for (let k = 0; k < 14; k++) fireFx.emit(d.mesh.position.x, SEA_Y + .2, d.mesh.position.z, rand(-3, 3), rand(3, 9), rand(-1, 1), .9, .9, .3, 0xffffff, 0xcfeaf4, .7, .5, -16);
            d.active = false;
            d.mesh.visible = false;
            d.wait = rand(5, 10);
          }
        }
      };

      // Ráfagas de viento cerca de la cámara: dan sensación de velocidad
      const streakCount = 36;
      const streakGeo = new T.BufferGeometry();
      const streakPos = new Float32Array(streakCount * 6);
      streakGeo.setAttribute('position', new T.BufferAttribute(streakPos, 3));
      const streaks = new T.LineSegments(streakGeo, new T.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .22, fog: false }));
      streaks.frustumCulled = false;
      scene.add(streaks);
      const streakData = Array.from({ length: streakCount }, () => ({ x: 0, y: 0, z: 0, len: 0, speed: 0 }));
      const resetStreak = (s, first) => {
        const z = rand(8, 40), e = edgeAt(z);
        s.x = first ? rand(e.left, e.right) : e.right + rand(0, 30);
        s.y = rand(bounds.minY - 4, bounds.maxY);
        s.z = z; s.len = rand(3, 9); s.speed = rand(45, 85);
      };
      streakData.forEach(s => resetStreak(s, true));
      const updateStreaks = dt => {
        for (let i = 0; i < streakCount; i++) {
          const s = streakData[i];
          s.x -= s.speed * flight * dt;
          if (s.x + s.len < edgeAt(s.z).left) resetStreak(s, false);
          streakPos.set([s.x, s.y, s.z, s.x + s.len, s.y, s.z], i * 6);
        }
        streakGeo.attributes.position.needsUpdate = true;
      };

      const missionProgress = () => (mode === 'playing' || mode === 'won' || mode === 'lost') ? clamp(1 - timeLeft / MISSION_TIME, 0, 1) : 0;

      const updateScenery = dt => {
        for (const s of scenery) {
          const o = s.obj;
          o.position.x -= s.speed * flight * dt;
          const e = edgeAt(o.position.z);
          if (s.reverse) {
            if (o.position.x > e.right + 40) s.respawn(o, false);
          } else if (o.position.x < e.left - 70 - (o.userData.radius || 0) * 2) {
            s.respawn(o, false);
          }
          if (s.update) s.update(s, dt);
        }
        updateDolphins(dt);
        updateStreaks(dt);
      };

      /* ================================================================
         8. AVIONES, BALAS Y EFECTOS DE COMBATE
         ================================================================ */
      const playerModel = buildPlayer();
      playerModel.root.scale.setScalar(1.35);
      scene.add(playerModel.root);

      const bulletGeo = new T.BoxGeometry(2.2, .16, .16);
      const friendlyMat = new T.MeshBasicMaterial({ color: 0xffe3a0 });
      const hostileMat = new T.MeshBasicMaterial({ color: 0xff6a3d });

      const debris = [];
      const debrisGeo = new T.TetrahedronGeometry(.4, 0);
      const debrisMats = [mat('#2f3538'), mat('#6a6f72'), mat('#a8aeb0')];

      const hitEnemyFlash = enemy => { enemy.flash = 1; };

      const explode = (x, y, z, scale, big) => {
        for (let i = 0; i < 26 * scale; i++) {
          const a = rand(0, TAU), b = rand(-1, 1), sp = rand(2, 14) * scale;
          fireFx.emit(x, y, z, Math.cos(a) * sp, b * sp * .8, Math.sin(a) * sp * .5, rand(.35, .8), rand(1.6, 3.2) * scale, .4, 0xffd27a, 0xe0401c, .95, 1.8);
        }
        for (let i = 0; i < 16 * scale; i++) {
          const a = rand(0, TAU), sp = rand(1, 6) * scale;
          smokeFx.emit(x, y, z, Math.cos(a) * sp, rand(-1, 4), Math.sin(a) * sp * .4, rand(1.2, 2.4), rand(1.4, 2.6) * scale, rand(4, 7) * scale, 0x3a3d3f, 0x8a8e90, .8, 1.1);
        }
        if (big) {
          for (let i = 0; i < 9; i++) {
            const m = new T.Mesh(debrisGeo, pick(debrisMats));
            m.position.set(x, y, z);
            m.scale.setScalar(rand(.6, 1.6));
            scene.add(m);
            debris.push({ m, vx: rand(-14, 8), vy: rand(2, 14), vz: rand(-6, 6), sx: rand(-9, 9), sy: rand(-9, 9), life: rand(1.2, 2.2) });
          }
        }
        boomLight.position.set(x, y, z + 6);
        boomLight.intensity = big ? 90 : 30;
        shake = Math.max(shake, big ? 1.1 : .35);
        audio.boom(big);
      };

      const updateDebris = dt => {
        for (let i = debris.length - 1; i >= 0; i--) {
          const d = debris[i];
          d.life -= dt;
          d.vy -= 20 * dt;
          d.m.position.x += d.vx * dt; d.m.position.y += d.vy * dt; d.m.position.z += d.vz * dt;
          d.m.rotation.x += d.sx * dt; d.m.rotation.y += d.sy * dt;
          if (Math.random() < dt * 20) smokeFx.emit(d.m.position.x, d.m.position.y, d.m.position.z, 0, 1, 0, .8, .6, 1.6, 0x4a4d4f, 0x8b8f91, .6, 1);
          if (d.life <= 0 || d.m.position.y < SEA_Y) { scene.remove(d.m); debris.splice(i, 1); }
        }
        boomLight.intensity = Math.max(0, boomLight.intensity - 160 * dt);
      };

      const shootDelay = () => Math.max(1.3, 2 - score * .06) + rand(0, 1.2);

      const spawnEnemy = () => {
        const model = buildBomber();
        const z = rand(-3.5, 3.5);
        const e = edgeAt(0);
        const enemy = {
          model, x: e.right + 16, y: lerp(worldY(.24), worldY(.72), Math.random()), z,
          // Cada bombardero derribado endurece un poco la misión: más rápidos y con disparos más frecuentes
          health: 3, speed: 5.4 + rand(0, 1.8) + score * .15, shoot: shootDelay(), phase: rand(0, 6), flash: 0, dying: false,
        };
        scene.add(model.root);
        enemies.push(enemy);
      };

      const fireBullet = (x, y, z, vx, vy, friendly) => {
        const mesh = new T.Mesh(bulletGeo, friendly ? friendlyMat : hostileMat);
        mesh.position.set(x, y, z);
        scene.add(mesh);
        bullets.push({ x, y, z, vx, vy, friendly, mesh });
      };

      const setHealthFlash = () => {
        if (reducedMotion) return;
        flashElement.classList.add('on');
        requestAnimationFrame(() => requestAnimationFrame(() => flashElement.classList.remove('on')));
      };

      /* ================================================================
         9. HUD, ESTADO Y REGLAS DE LA MISIÓN (idénticas al juego original)
         ================================================================ */
      const updateHud = () => {
        healthElement.replaceChildren(...Array.from({ length: MAX_HEALTH }, (_, index) => {
          const dot = document.createElement('i');
          if (index >= player.health) dot.className = 'off';
          return dot;
        }));
        healthElement.setAttribute('aria-label', `${player.health} de ${MAX_HEALTH} puntos de blindaje`);
        scoreElement.textContent = `${String(score).padStart(2, '0')} / ${String(KILLS_TO_WIN).padStart(2, '0')}`;
        const seconds = Math.max(0, Math.ceil(timeLeft));
        timerElement.textContent = `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
      };

      const clearEntities = () => {
        for (const b of bullets) scene.remove(b.mesh);
        for (const e of enemies) scene.remove(e.model.root);
        for (const w of wrecks) scene.remove(w.enemy.model.root);
        for (const d of debris) scene.remove(d.m);
        bullets.length = enemies.length = wrecks.length = debris.length = 0;
        smokeFx.clear();
        fireFx.clear();
      };

      const resetGame = () => {
        clearEntities();
        player.x = worldX(.17); player.y = worldY(.52);
        player.targetX = player.x; player.targetY = player.y;
        player.vx = player.vy = 0;
        player.health = MAX_HEALTH;
        player.invulnerable = 0;
        score = 0;
        timeLeft = MISSION_TIME;
        spawnClock = 1.1;
        lastShot = -10;
        firing = false;
        objectiveElement.textContent = 'Intercepta doce bombarderos antes de que alcancen su objetivo.';
        updateHud();
      };

      const beginGame = () => {
        audio.init();
        resetGame();
        mode = 'playing';
        overlay.hidden = true;
        pauseButton.hidden = false;
        setPaused(false);
        lastFrame = performance.now();
      };

      /* ---------- Pausa: congela misión, escena y sonido; se reanuda con el botón, P o Esc ---------- */
      function setPaused(value) {
        if (value && mode !== 'playing') return;
        paused = value;
        pauseOverlay.hidden = !paused;
        pauseButton.textContent = paused ? '▶ Reanudar' : '❚❚ Pausa';
        pauseButton.setAttribute('aria-label', paused ? 'Reanudar la misión' : 'Pausar la misión');
        keys.clear();
        firing = false;
        pointerActive = false;
        if (paused) { audio.suspend(); resumeButton.focus(); } else { audio.resume(); lastFrame = performance.now(); }
      }
      const togglePause = () => setPaused(!paused);

      const finishGame = victory => {
        if (mode !== 'playing') return;
        mode = victory ? 'won' : 'lost';
        pauseButton.hidden = true;
        overlay.hidden = false;
        document.querySelector('#eyebrow').textContent = victory ? 'Final alternativo · misión cumplida' : 'Final histórico · defensa superada';
        document.querySelector('#title').innerHTML = victory ? 'La ruta<br>cambia' : 'Cielo<br>en llamas';
        document.querySelector('#copy').textContent = victory
          ? 'En esta línea temporal ficticia, Japón repele la incursión y después lanza bombardeos de represalia sobre objetivos militares en Estados Unidos. La guerra se prolonga; el desenlace también deja víctimas civiles.'
          : 'La defensa cede. En la historia real, Estados Unidos lanzó bombas atómicas sobre Hiroshima el 6 de agosto y Nagasaki el 9 de agosto de 1945. Esta misión y su desenlace jugable son ficción.';
        startButton.textContent = 'Volver a jugar';
        document.querySelector('#fineprint').textContent = victory
          ? 'La victoria es una historia alternativa, no una recreación de hechos reales.'
          : 'Los bombardeos atómicos ocurrieron en la historia real; esta misión no.';
        objectiveElement.textContent = victory ? 'Formación interceptada. La historia toma otro rumbo.' : 'La formación ha alcanzado las islas.';
      };

      const killEnemy = (enemy, index) => {
        enemies.splice(index, 1);
        enemy.dying = true;
        enemy.vx = -enemy.speed * .5;
        enemy.vy = 1.5;
        enemy.spin = rand(2, 4) * (Math.random() < .5 ? -1 : 1);
        wrecks.push({ enemy });
        explode(enemy.x, enemy.y, enemy.z, 1.5, true);
        score += 1;
        updateHud();
        if (score >= KILLS_TO_WIN) finishGame(true);
      };

      const updateGame = dt => {
        if (mode !== 'playing' || paused) return;
        timeLeft -= dt;
        spawnClock -= dt;
        // La presión sube con los derribos: más bombarderos a la vez y menos tiempo entre oleadas
        if (spawnClock <= 0 && enemies.length < Math.min(5, 3 + Math.floor(score / 4))) {
          spawnEnemy();
          spawnClock = Math.max(1.8, 3.4 - score * .14) + Math.random();
        }

        // Movimiento del jugador con aceleración suave
        const speed = 17;
        let ix = (keys.has('arrowright') || keys.has('d') ? 1 : 0) - (keys.has('arrowleft') || keys.has('a') ? 1 : 0);
        let iy = (keys.has('arrowup') || keys.has('w') ? 1 : 0) - (keys.has('arrowdown') || keys.has('s') ? 1 : 0);
        if (ix && iy) { ix *= .7071; iy *= .7071; }
        let tvx = ix * speed, tvy = iy * speed;
        if (pointerActive) {
          tvx = clamp((player.targetX - player.x) * 5, -speed * 1.4, speed * 1.4);
          tvy = clamp((player.targetY - player.y) * 5, -speed * 1.4, speed * 1.4);
        }
        const accel = Math.min(1, dt * 8);
        player.vx += (tvx - player.vx) * accel;
        player.vy += (tvy - player.vy) * accel;
        player.x = clamp(player.x + player.vx * dt, worldX(.055), worldX(.66));
        player.y = clamp(player.y + player.vy * dt, worldY(.83), worldY(.13));
        player.invulnerable = Math.max(0, player.invulnerable - dt);

        // Disparo alternado desde cada ala
        if ((keys.has(' ') || firing) && clockT - lastShot > .17) {
          gunSide *= -1;
          fireBullet(player.x + 2.4, player.y - .1, gunSide * 1.5, 62, 0, true);
          lastShot = clockT;
          audio.shot();
          fireFx.emit(player.x + 2.6, player.y - .1, gunSide * 1.5, 4, 0, 0, .1, 1.2, .3, 0xfff1b8, 0xff9a4a, .9);
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          b.x += b.vx * dt; b.y += b.vy * dt;
          b.mesh.position.set(b.x, b.y, b.z);
          if (b.vy) b.mesh.rotation.z = Math.atan2(b.vy, b.vx);
          if (b.friendly) fireFx.emit(b.x - 1, b.y, b.z, 0, 0, 0, .18, .55, .15, 0xffe3a0, 0xff9a4a, .7);
          else fireFx.emit(b.x + 1, b.y, b.z, 0, 0, 0, .22, .7, .2, 0xff8a52, 0xd8381f, .7);
          const e = edgeAt(0);
          if (b.x < e.left - 14 || b.x > e.right + 14 || b.y < bounds.minY - 14 || b.y > bounds.maxY + 14) { scene.remove(b.mesh); bullets.splice(i, 1); }
        }

        for (let ei = enemies.length - 1; ei >= 0; ei--) {
          const enemy = enemies[ei];
          enemy.x -= enemy.speed * dt;
          enemy.phase += dt;
          enemy.y += Math.sin(enemy.phase * 2) * 1.6 * dt;
          enemy.shoot -= dt;
          if (enemy.shoot <= 0) {
            fireBullet(enemy.x - 8, enemy.y, 0, -24, (player.y - enemy.y) * .14, false);
            enemy.shoot = shootDelay();
          }
          if (enemy.x < edgeAt(0).left - 14) {
            enemies.splice(ei, 1);
            scene.remove(enemy.model.root);
            player.health -= 1;
            shake = Math.max(shake, .6);
            setHealthFlash();
            audio.hit();
            updateHud();
            continue;
          }
          // Humo del motor dañado
          if (enemy.health <= 1 && Math.random() < dt * 30) {
            smokeFx.emit(enemy.x - 1, enemy.y + .6, enemy.z + 3, 3, 1, 0, 1.6, 1.0, 3.2, 0x2a2d2f, 0x6b6f71, .8, .5);
            fireFx.emit(enemy.x - 1, enemy.y + .5, enemy.z + 3, 2, .5, 0, .35, 1.1, .3, 0xffc46a, 0xd8381f, .8);
          }
          for (let bi = bullets.length - 1; bi >= 0; bi--) {
            const b = bullets[bi];
            if (b.friendly && Math.abs(b.x - enemy.x) < 7 && Math.abs(b.y - enemy.y) < 3.2) {
              scene.remove(b.mesh);
              bullets.splice(bi, 1);
              enemy.health -= 1;
              hitEnemyFlash(enemy);
              for (let k = 0; k < 8; k++) fireFx.emit(b.x, b.y, b.z, rand(-6, 6), rand(-6, 6), rand(-3, 3), rand(.15, .4), .9, .2, 0xffe9a8, 0xff7a38, 1, 2);
              audio.hit();
              if (enemy.health <= 0) killEnemy(enemy, ei);
              break;
            }
          }
        }

        for (let i = bullets.length - 1; i >= 0; i--) {
          const b = bullets[i];
          if (!b.friendly && Math.hypot(b.x - player.x, b.y - player.y) < 2.4) {
            scene.remove(b.mesh);
            bullets.splice(i, 1);
            if (player.invulnerable === 0) {
              player.health -= 1;
              player.invulnerable = 1.05;
              explode(player.x, player.y, 0, .5, false);
              setHealthFlash();
              updateHud();
            }
          }
        }

        if (player.health <= 0 || timeLeft <= 0) finishGame(false);
        updateHud();
      };

      /** Bombarderos derribados: caen girando, con humo y fuego, hasta estrellarse en el mar. */
      const updateWrecks = dt => {
        for (let i = wrecks.length - 1; i >= 0; i--) {
          const w = wrecks[i], e = w.enemy;
          e.vy -= 11 * dt;
          e.x += e.vx * dt; e.y += e.vy * dt;
          e.model.root.position.set(e.x, e.y, e.z);
          e.model.pivot.rotation.x += e.spin * dt;
          e.model.pivot.rotation.z = lerp(e.model.pivot.rotation.z, .9, dt * .8);
          if (Math.random() < dt * 60) {
            smokeFx.emit(e.x + rand(-2, 4), e.y + rand(-.5, .8), e.z, 2, rand(.5, 2), 0, 2.2, 1.4, 4.4, 0x24272a, 0x74787a, .85, .4);
            fireFx.emit(e.x + rand(-1, 3), e.y, e.z, 3, rand(0, 1.5), 0, .45, 1.8, .4, 0xffc46a, 0xd8381f, .9);
          }
          for (const prop of e.model.props) prop.rotation.x += 6 * dt;
          if (e.y < SEA_Y + .8) {
            for (let k = 0; k < 40; k++) fireFx.emit(e.x + rand(-3, 3), SEA_Y + .4, e.z + rand(-2, 2), rand(-6, 6), rand(6, 18), rand(-3, 3), rand(.7, 1.3), rand(1.4, 2.6), .4, 0xffffff, 0xcfeaf4, .8, .6, -22);
            explode(e.x, SEA_Y + 1, e.z, 1.1, false);
            audio.splash();
            scene.remove(e.model.root);
            wrecks.splice(i, 1);
          }
        }
      };

      /* ================================================================
         10. BUCLE DE RENDER
         ================================================================ */
      const poseEntities = dt => {
        // Jugador: cabeceo y alabeo según la maniobra, balanceo en reposo y hélice
        const p = playerModel;
        const visible = mode === 'playing' || mode === 'ready' || mode === 'won';
        p.root.visible = visible && (player.invulnerable === 0 || Math.floor(clockT * 10) % 2 === 0);
        const px = mode === 'ready' ? worldX(.17) : player.x;
        const py = mode === 'ready' ? worldY(.52) + Math.sin(clockT * 1.1) * .8 : player.y;
        p.root.position.set(px, py, 0);
        p.pivot.rotation.z = lerp(p.pivot.rotation.z, clamp(player.vy * .03 + Math.sin(clockT * 1.3) * .02, -.55, .55), Math.min(1, dt * 7));
        p.pivot.rotation.x = lerp(p.pivot.rotation.x, clamp(-player.vy * .035, -.7, .7) + Math.sin(clockT * 1.7) * .05, Math.min(1, dt * 6));
        p.prop.group.rotation.x += 55 * dt;
        p.prop.disc.visible = true;
        if (visible && Math.random() < dt * 40) {
          smokeFx.emit(px - 3.8, py - .1, 0, -9, rand(-.3, .3), rand(-.3, .3), 1.8, .35, 1.5, 0xffffff, 0xd9e2e6, .35, .3);
        }

        for (const enemy of enemies) {
          const m = enemy.model;
          m.root.position.set(enemy.x, enemy.y, enemy.z);
          m.pivot.rotation.x = Math.sin(enemy.phase * 1.2) * .06;
          m.pivot.rotation.z = Math.cos(enemy.phase * 2) * .035;
          for (const prop of m.props) prop.rotation.x += 32 * dt;
          enemy.flash = Math.max(0, enemy.flash - dt * 4);
          for (const mt of m.mats) {
            mt.emissive.setRGB(enemy.flash * .9, enemy.flash * .35, enemy.flash * .1);
          }
          if (Math.random() < dt * 22) {
            smokeFx.emit(enemy.x + 3.5, enemy.y - .2, enemy.z + 3.2, 4, 0, 0, 1.4, .5, 1.8, 0x70767a, 0xb9bfc2, .28, .3);
            smokeFx.emit(enemy.x + 3.5, enemy.y - .2, enemy.z - 3.2, 4, 0, 0, 1.4, .5, 1.8, 0x70767a, 0xb9bfc2, .28, .3);
          }
        }
      };

      const render = dt => {
        clockT += dt;
        flight = 1 + clamp(player.vx, -10, 10) * .018;
        seaUniforms.uTime.value = clockT;
        seaUniforms.uScroll.value += 8.5 * flight * dt;

        applyAtmosphere(missionProgress());
        updateScenery(dt);
        poseEntities(dt);
        updateWrecks(dt);
        updateDebris(dt);
        smokeFx.update(dt);
        fireFx.update(dt);
        audio.engine(mode === 'playing' ? 1 + Math.abs(player.vx) * .06 : .6);

        // Cámara: ligera deriva, seguimiento vertical suave y sacudida al recibir impactos
        shake = Math.max(0, shake - dt * 2.2);
        const s = reducedMotion || paused ? 0 : shake;
        const driftX = Math.sin(clockT * .21) * 1.4, driftY = Math.sin(clockT * .33) * .5;
        const follow = mode === 'ready' ? 0 : (player.y - worldY(.52)) * .1;
        camera.position.set(camBase.x + driftX + rand(-s, s) * .6, camBase.y + driftY + follow + rand(-s, s) * .6, camBase.z);
        camera.lookAt(camLook.x + driftX * .5, camLook.y + follow * .6, 0);
        sky.position.copy(camera.position);
        sunGlow.position.copy(camera.position).addScaledVector(sunDir, 900);
        sunGlow.material.color.copy(mixed.sun);
        sunLight.target.position.set(0, 0, 0);
        renderer.render(scene, camera);
      };

      let sceneShown = false;
      const frame = now => {
        const dt = Math.min((now - lastFrame) / 1000 || 0, .05);
        lastFrame = now;
        if (paused) {
          // En pausa no se vuelve a dibujar (la imagen queda congelada y la GPU descansa), salvo tras un cambio de tamaño
          if (needsRedraw) { needsRedraw = false; render(0); }
        } else {
          updateGame(dt);
          render(reducedMotion ? dt * .5 : dt);
        }
        if (!sceneShown) { sceneShown = true; document.body.classList.add('scene-ready'); }
        requestAnimationFrame(frame);
      };

      /* ================================================================
         11. ENTRADA
         ================================================================ */
      const moveWithPointer = event => {
        if (!pointerActive || mode !== 'playing') return;
        const rect = canvas.getBoundingClientRect();
        const nx = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        const ny = -(((event.clientY - rect.top) / rect.height) * 2 - 1);
        pointOnPlane(nx, ny, hitPoint);
        player.targetX = clamp(hitPoint.x, worldX(.055), worldX(.66));
        player.targetY = clamp(hitPoint.y, worldY(.83), worldY(.13));
      };

      // El botón "Iniciar misión" lo atiende el cargador de index.html, que llama a esta función cuando el juego ya está listo
      window.__flightStart = beginGame;
      window.addEventListener('resize', setSize);
      window.addEventListener('keydown', event => {
        const key = event.key.toLowerCase();
        if ([' ', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(key)) event.preventDefault();
        if ((key === 'p' || key === 'escape') && !event.repeat && mode === 'playing') { event.preventDefault(); togglePause(); return; }
        if (key === 'm' && !event.repeat) audio.toggle();
        if (!paused) keys.add(key);
      });
      window.addEventListener('keyup', event => keys.delete(event.key.toLowerCase()));
      // Al perder el foco o cambiar de pestaña la misión se pausa sola
      window.addEventListener('blur', () => { keys.clear(); firing = false; pointerActive = false; setPaused(true); });
      document.addEventListener('visibilitychange', () => { if (document.hidden) setPaused(true); });
      pauseButton.addEventListener('click', togglePause);
      resumeButton.addEventListener('click', () => setPaused(false));
      restartButton.addEventListener('click', beginGame);
      canvas.addEventListener('pointerdown', event => { if (paused) return; pointerActive = true; canvas.setPointerCapture(event.pointerId); moveWithPointer(event); });
      canvas.addEventListener('pointermove', moveWithPointer);
      canvas.addEventListener('pointerup', () => { pointerActive = false; });
      fireButton.addEventListener('pointerdown', event => { event.preventDefault(); if (!paused) firing = true; });
      fireButton.addEventListener('pointerup', () => { firing = false; });
      fireButton.addEventListener('pointerleave', () => { firing = false; });
      fireButton.addEventListener('pointercancel', () => { firing = false; });

      // Gancho de depuración (solo con #debug en la URL): permite inspeccionar modelos y efectos de cerca
      if (location.hash === '#debug') window.__dbg = { sim: dt => { clockT += dt; updateGame(dt); }, step: dt => { updateGame(dt); render(dt); }, state: () => ({ mode, score, timeLeft, hp: player.health, enemies: enemies.length, wrecks: wrecks.length }), hemi, sunLight, boomLight, scene, sunGlow, cloudMat, scenery, smokeFx, fireFx, camBase, camLook, spawnEnemy, enemies, player, explode, bullets, fireBullet, bounds, worldX, worldY, killEnemy, wrecks };

      setSize();
      scenery.forEach(s => s.respawn(s.obj, true)); // reparte el decorado ahora que se conocen los límites de pantalla
      applyAtmosphere(0);
      player.x = worldX(.17); player.y = worldY(.52);
      updateHud();
      lastFrame = performance.now();
      requestAnimationFrame(frame);
    })();
