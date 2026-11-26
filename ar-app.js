'use strict';

const ROUND_TIME = 30_000;
const DEPTH = 6;
const BEST_KEY = 'space_ducks_best';
const METRICS_KEY = 'ar_metrics';
const DUCK_COLORS = ['#ffcb39', '#6ef5bf', '#f8a5ee', '#79caff'];
const POINTS = { duck: 100, crystal: 250, bottle: -150 };
const LANES = [-0.57, -0.24, 0.13, 0.51];
const $ = (id) => document.getElementById(id);

const stage = $('stage');
const scene = $('scene');
const viewport = $('viewport');
const cameraButton = $('camera-toggle');
const cameraFeed = $('camera-feed');
const status = $('status');
const screens = { menu: $('menu'), game: $('hud'), studio: $('studio'), results: $('results') };
const modelColor = $('model-color');
const modelSize = $('model-size');
const spinSpeed = $('spin-speed');

let cameraStream = null;
let cameraRequest = 0;

function stopCamera() {
    cameraRequest += 1;
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cameraFeed.srcObject = null;
    stage.classList.remove('has-camera');
    cameraButton.textContent = 'Activar cámara';
    cameraButton.setAttribute('aria-pressed', 'false');
    cameraButton.disabled = false;
}

cameraButton.addEventListener('click', async () => {
    if (cameraStream) {
        stopCamera();
        status.textContent = 'Cámara desactivada.';
        return;
    }
    if (!window.isSecureContext) {
        status.textContent = 'Abre esta página por HTTPS para usar la cámara.';
        return;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'La cámara no está disponible en este navegador. Puedes jugar con el fondo espacial.';
        return;
    }

    const request = ++cameraRequest;
    cameraButton.disabled = true;
    status.textContent = 'Esperando permiso para usar la cámara…';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false
        });
        if (request !== cameraRequest) {
            stream.getTracks().forEach((track) => track.stop());
            return;
        }

        cameraStream = stream;
        cameraFeed.srcObject = stream;
        await cameraFeed.play();
        if (request !== cameraRequest) return;

        stream.getVideoTracks()[0].addEventListener('ended', () => {
            if (cameraStream !== stream) return;
            stopCamera();
            status.textContent = 'La cámara se desconectó. Puedes seguir con el fondo espacial.';
        }, { once: true });
        stage.classList.add('has-camera');
        cameraButton.textContent = 'Desactivar cámara';
        cameraButton.setAttribute('aria-pressed', 'true');
        cameraButton.disabled = false;
        status.textContent = stage.dataset.screen === 'menu' ? 'Cámara activa. Elige Jugar o Showroom 3D.' : 'Cámara activa.';
    } catch (error) {
        if (request !== cameraRequest) return;
        stopCamera();
        status.textContent = error.name === 'NotAllowedError'
            ? 'Permiso de cámara denegado. Puedes jugar con el fondo espacial.'
            : 'No se pudo abrir la cámara. Puedes jugar con el fondo espacial.';
    }
});

window.addEventListener('pagehide', stopCamera);

function readBest() {
    try {
        const score = Number(localStorage.getItem(BEST_KEY));
        return Number.isFinite(score) && score > 0 ? score : 0;
    } catch {
        return 0;
    }
}

function saveBest(score) {
    try {
        localStorage.setItem(BEST_KEY, String(score));
    } catch {
        // The current record still works in this session.
    }
}

function recordModelClick(color) {
    try {
        const stored = JSON.parse(localStorage.getItem(METRICS_KEY) ?? '[]');
        const history = Array.isArray(stored) ? stored : [];
        history.push({ fecha: new Date().toISOString(), evento: 'Clic en Producto AR', detalle: color });
        localStorage.setItem(METRICS_KEY, JSON.stringify(history));
    } catch {
        // The 3D controls work independently of local storage.
    }
}

function createModels(THREE) {
    const sphere = new THREE.SphereGeometry(1, 20, 14);
    const cylinder = new THREE.CylinderGeometry(1, 1, 1, 18);
    const taper = new THREE.CylinderGeometry(0.62, 1, 1, 18);
    const ring = new THREE.TorusGeometry(1, 0.09, 10, 36);
    const box = new THREE.BoxGeometry(1, 1, 1);
    const diamond = new THREE.OctahedronGeometry(1);
    const material = (color, options = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.48, ...options });
    const feathers = material(DUCK_COLORS[0]);
    const orange = material('#ff8033');
    const dark = material('#201633');
    const metal = material('#6946ad', { metalness: 0.24 });
    const purple = material('#b88dff', { emissive: '#7541df', emissiveIntensity: 0.4 });
    const visor = material('#9fcaff', { transparent: true, opacity: 0.19, depthWrite: false, roughness: 0.15 });
    const white = material('#fff6ec');
    const lime = material('#c8ff36', { emissive: '#68a90b', emissiveIntensity: 0.32, flatShading: true });
    const coral = material('#ff526e', { emissive: '#ee244b', emissiveIntensity: 0.2 });
    const bottleCap = material('#ffb6be', { metalness: 0.35 });

    function add(parent, geometry, surface, x, y, z, sx, sy, sz) {
        const mesh = new THREE.Mesh(geometry, surface);
        mesh.position.set(x, y, z);
        mesh.scale.set(sx, sy, sz);
        parent.add(mesh);
        return mesh;
    }

    const duck = new THREE.Group();
    add(duck, sphere, dark, 0, -0.51, 0, 0.81, 0.23, 0.63);
    add(duck, sphere, metal, 0, -0.43, 0, 0.8, 0.19, 0.62);
    add(duck, ring, purple, 0, -0.46, 0, 0.76, 0.59, 0.6).rotation.x = Math.PI / 2;
    for (const x of [-0.46, 0, 0.46]) {
        add(duck, sphere, lime, x, -0.55, x === 0 ? 0.61 : 0.49, 0.058, 0.044, 0.05);
    }
    add(duck, sphere, metal, 0, -0.22, 0, 0.46, 0.33, 0.36);
    add(duck, sphere, feathers, 0, 0.27, 0.02, 0.43, 0.4, 0.37);
    add(duck, sphere, feathers, 0, 0.61, 0, 0.11, 0.14, 0.12).rotation.z = 0.42;
    add(duck, sphere, orange, 0, 0.16, 0.35, 0.28, 0.10, 0.19);
    add(duck, sphere, orange, 0, 0.11, 0.34, 0.2, 0.063, 0.16);
    add(duck, ring, metal, 0, -0.04, 0, 0.46, 0.41, 0.45).rotation.x = Math.PI / 2;
    const glass = add(duck, sphere, visor, 0, 0.31, 0.03, 0.55, 0.52, 0.49);
    glass.renderOrder = 2;
    for (const side of [-1, 1]) {
        add(duck, sphere, dark, 0.17 * side, 0.33, 0.343, 0.074, 0.095, 0.045);
        add(duck, sphere, white, 0.16 * side, 0.36, 0.382, 0.025, 0.03, 0.013);
        add(duck, sphere, metal, 0.5 * side, 0.27, 0, 0.075, 0.13, 0.13);
        add(duck, sphere, purple, 0.552 * side, 0.27, 0.006, 0.028, 0.091, 0.091);
        add(duck, sphere, feathers, 0.31 * side, -0.24, 0.29, 0.11, 0.12, 0.13);
    }

    const bottle = new THREE.Group();
    add(bottle, cylinder, coral, 0, -0.18, 0, 0.29, 0.55, 0.25);
    add(bottle, taper, coral, 0, 0.15, 0, 0.29, 0.17, 0.25);
    add(bottle, cylinder, coral, 0, 0.29, 0, 0.16, 0.18, 0.145);
    add(bottle, cylinder, bottleCap, 0, 0.41, 0, 0.19, 0.13, 0.165);
    add(bottle, cylinder, dark, 0, -0.14, 0, 0.295, 0.25, 0.255);
    add(bottle, box, white, 0, -0.14, 0.254, 0.18, 0.045, 0.015);
    add(bottle, box, white, 0, -0.14, -0.254, 0.18, 0.045, 0.015);

    const crystal = new THREE.Group();
    add(crystal, diamond, lime, 0, 0, 0, 0.35, 0.56, 0.34);
    const orbit = add(crystal, ring, lime, 0, 0, 0, 0.53, 0.53, 0.22);
    orbit.rotation.set(1.08, 0.25, 0.32);

    const showroom = duck.clone();
    const showroomFeathers = feathers.clone();
    showroom.traverse((mesh) => {
        if (mesh.material === feathers) mesh.material = showroomFeathers;
    });

    return { templates: { duck, bottle, crystal }, showroom, showroomFeathers };
}

function initializeArcade() {
    const { THREE } = window.AFRAME;
    const { templates, showroom, showroomFeathers } = createModels(THREE);
    const targetLayer = $('targets').object3D;
    const showroomRoot = $('showroom-object');
    const spinButton = $('spin');
    const panel = document.querySelector('.control-panel');
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const colliderShape = new THREE.SphereGeometry(1, 12, 8);
    const colliderMaterial = new THREE.MeshBasicMaterial({ visible: false });
    const targets = new Map();
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    const effects = $('effects');
    const timeLabel = $('timer');
    const scoreLabel = $('score');
    const bestLabel = $('best');
    let best = readBest();
    let score = 0;
    let endTime = 0;
    let nextSpawn = 0;
    let lastLane = -1;
    let spawnBag = [];
    let frameId = 0;
    let previousFrame = 0;
    let spinProgress = 1;
    let spinFrom = 0;
    let view = { width: 1, height: 1, halfHeight: 1, halfWidth: 1, targetScale: 1 };

    function collider(parent, x, y, z) {
        const mesh = new THREE.Mesh(colliderShape, colliderMaterial);
        mesh.scale.set(x, y, z);
        parent.add(mesh);
        return mesh;
    }

    const showroomCollider = collider(showroom, 0.91, 0.82, 0.69);
    showroomRoot.setObject3D('mesh', showroom);
    showroom.rotation.y = -0.24;
    showroomFeathers.color.set(modelColor.value);

    function layoutShowroom() {
        const sceneRect = viewport.getBoundingClientRect();
        const controls = panel.getBoundingClientRect();
        const header = document.querySelector('.studio-header').getBoundingClientRect();
        const mobile = window.matchMedia('(max-width: 760px)').matches;
        const availableWidth = mobile ? view.width : controls.left - sceneRect.left;
        const top = header.bottom - sceneRect.top + 10;
        const bottom = mobile ? controls.top - sceneRect.top - 8 : view.height - 16;
        const availableHeight = Math.max(1, bottom - top);
        const maxDiameter = Math.min(availableWidth * 0.69, availableHeight * 0.72, 345);
        const scale = maxDiameter * view.halfHeight / (view.height * 0.91);

        showroomRoot.object3D.position.set(
            (availableWidth / view.width - 1) * view.halfWidth,
            (1 - (bottom + top) / view.height) * view.halfHeight,
            -DEPTH
        );
        showroom.scale.setScalar(scale * Number(modelSize.value) / 100);
    }

    function updateView() {
        const { width, height } = viewport.getBoundingClientRect();
        if (!width || !height) return;
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2)) * DEPTH;
        view = {
            width, height, halfHeight, halfWidth: halfHeight * width / height,
            targetScale: THREE.MathUtils.clamp(Math.min(width, height) / 460, 0.7, 1.15)
        };
        if (stage.dataset.screen === 'studio') layoutShowroom();
    }

    function setScreen(screen, focusId) {
        cancelAnimationFrame(frameId);
        frameId = 0;
        previousFrame = 0;
        for (const { model } of targets.values()) model.removeFromParent();
        targets.clear();
        effects.replaceChildren();

        stage.dataset.screen = screen;
        for (const [name, panel] of Object.entries(screens)) panel.hidden = name !== screen;
        showroomRoot.setAttribute('visible', screen === 'studio');
        updateView();

        if (screen === 'game' || screen === 'studio') frameId = requestAnimationFrame(update);
        $(focusId).focus({ preventScroll: true });
    }

    function startGame() {
        const now = performance.now();
        score = 0;
        endTime = now + ROUND_TIME;
        nextSpawn = now;
        spawnBag = ['duck'];
        lastLane = -1;
        scoreLabel.textContent = '0';
        bestLabel.textContent = best;
        timeLabel.textContent = '30 s';
        timeLabel.classList.remove('is-low');
        setScreen('game', 'quit');
    }

    function finishGame() {
        if (score > best) {
            best = score;
            saveBest(best);
        }
        $('final-score').textContent = score;
        $('final-best').textContent = best;
        setScreen('results', 'results-title');
    }

    function nextTargetType() {
        if (spawnBag.length === 0) {
            spawnBag = ['duck', 'duck', 'duck', 'crystal', 'bottle'];
            for (let i = spawnBag.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                [spawnBag[i], spawnBag[j]] = [spawnBag[j], spawnBag[i]];
            }
        }
        return spawnBag.pop();
    }

    function spawnTarget(now) {
        const type = nextTargetType();
        const model = templates[type].clone();
        const hitbox = type === 'duck' ? collider(model, 0.91, 0.82, 0.69) : collider(model, 0.52, 0.68, 0.53);
        const lane = (lastLane + 1 + Math.floor(Math.random() * (LANES.length - 1))) % LANES.length;
        lastLane = lane;
        targets.set(hitbox, {
            model, type, lane, born: now,
            flight: 3250 + Math.random() * 1350,
            direction: Math.random() < 0.5 ? 1 : -1
        });
        targetLayer.add(model);
    }

    function moveTargets(now) {
        for (const [hitbox, target] of targets) {
            const flight = (now - target.born) / target.flight;
            const { model, direction, lane, type } = target;
            if (flight >= 1) {
                model.removeFromParent();
                targets.delete(hitbox);
                continue;
            }
            const sway = Math.sin(flight * Math.PI * 3 + lane);
            const travel = view.halfWidth + view.targetScale * 0.94;
            model.position.set((flight * 2 - 1) * direction * travel, (LANES[lane] + sway * 0.04) * view.halfHeight, -DEPTH);
            model.scale.setScalar(view.targetScale);
            model.rotation.y = type === 'duck' ? direction * 0.41 + sway * 0.13 : flight * Math.PI * 2;
            model.rotation.z = sway * 0.13;
        }
    }

    function update(now) {
        frameId = 0;
        const elapsed = previousFrame ? Math.min(now - previousFrame, 50) : 0;
        previousFrame = now;
        if (stage.dataset.screen === 'game') {
            const seconds = Math.max(0, Math.ceil((endTime - now) / 1000));
            const timeText = seconds + ' s';
            if (timeLabel.textContent !== timeText) timeLabel.textContent = timeText;
            timeLabel.classList.toggle('is-low', seconds <= 5);
            if (now >= endTime) {
                finishGame();
                return;
            }
            if (now >= nextSpawn) {
                spawnTarget(now);
                nextSpawn = now + 820;
            }
            moveTargets(now);
        } else if (spinProgress < 1) {
            spinProgress = Math.min(1, spinProgress + elapsed * Number(spinSpeed.value) / 800);
            const eased = 1 - Math.pow(1 - spinProgress, 3);
            showroom.rotation.y = spinFrom + eased * Math.PI * 2;
        }
        frameId = requestAnimationFrame(update);
    }

    function spinModel() {
        if (reducedMotion.matches) {
            showroom.rotation.y += Math.PI / 2;
            return;
        }
        spinFrom = showroom.rotation.y % (Math.PI * 2);
        spinProgress = 0;
    }

    function activateModel() {
        const nextColors = DUCK_COLORS.filter((color) => color !== modelColor.value);
        modelColor.value = nextColors[Math.floor(Math.random() * nextColors.length)];
        showroomFeathers.color.set(modelColor.value);
        spinModel();
        recordModelClick(modelColor.value);
    }

    function showHit(x, y, type, points) {
        const hit = document.createElement('span');
        hit.className = 'hit ' + type;
        hit.textContent = points > 0 ? '+' + points : '−' + Math.abs(points);
        hit.style.left = x + 'px';
        hit.style.top = y + 'px';
        hit.addEventListener('animationend', () => hit.remove(), { once: true });
        effects.append(hit);
    }

    viewport.addEventListener('pointerup', (event) => {
        const screen = stage.dataset.screen;
        if (!event.isPrimary || event.button !== 0 || (screen !== 'game' && screen !== 'studio')) return;
        const bounds = viewport.getBoundingClientRect();
        const x = event.clientX - bounds.left;
        const y = event.clientY - bounds.top;
        pointer.set(x / bounds.width * 2 - 1, 1 - y / bounds.height * 2);
        raycaster.setFromCamera(pointer, scene.camera);

        if (screen === 'studio') {
            showroomCollider.updateWorldMatrix(true, false);
            if (raycaster.intersectObject(showroomCollider, false).length) activateModel();
            return;
        }
        if (performance.now() >= endTime) return;
        for (const hitbox of targets.keys()) hitbox.updateWorldMatrix(true, false);
        const [hit] = raycaster.intersectObjects([...targets.keys()], false);
        if (!hit) return;
        const target = targets.get(hit.object);
        const points = POINTS[target.type];
        score += points;
        scoreLabel.textContent = score;
        targets.delete(hit.object);
        target.model.removeFromParent();
        showHit(x, y, target.type, points);
    });

    spinButton.addEventListener('click', spinModel);
    modelColor.addEventListener('input', () => showroomFeathers.color.set(modelColor.value));
    modelSize.addEventListener('input', () => {
        $('model-size-value').value = modelSize.value + ' %';
        layoutShowroom();
    });
    spinSpeed.addEventListener('input', () => {
        $('spin-speed-value').value = Number(spinSpeed.value).toLocaleString('es') + '×';
    });

    $('play').addEventListener('click', startGame);
    $('replay').addEventListener('click', startGame);
    $('showroom').addEventListener('click', () => setScreen('studio', 'studio-back'));
    $('quit').addEventListener('click', () => setScreen('menu', 'play'));
    $('studio-back').addEventListener('click', () => setScreen('menu', 'showroom'));
    $('result-back').addEventListener('click', () => setScreen('menu', 'play'));
    new ResizeObserver(updateView).observe(viewport);
    new ResizeObserver(() => {
        if (stage.dataset.screen === 'studio') layoutShowroom();
    }).observe(panel);
    $('play').disabled = false;
    $('showroom').disabled = false;
    if (status.textContent === 'Cargando escena 3D…') status.textContent = '';
}

if (window.AFRAME && typeof ResizeObserver !== 'undefined') {
    if (scene.renderStarted) initializeArcade();
    else {
        const loadingTimeout = setTimeout(() => {
            status.textContent = 'La escena 3D no está disponible. Comprueba que tu navegador admite WebGL.';
        }, 8000);
        scene.addEventListener('renderstart', () => {
            clearTimeout(loadingTimeout);
            if (status.textContent.startsWith('La escena 3D')) status.textContent = '';
            initializeArcade();
        }, { once: true });
    }
} else {
    status.textContent = 'No se pudo cargar la escena de A-Frame. Recarga la página en un navegador actualizado.';
}
