'use strict';

const ROUND_TIME = 30_000;
const AFRAME_URL = 'https://aframe.io/releases/1.7.1/aframe.min.js';
const SHOWROOM_DEPTH = 3;
const TARGET_MIN_DEPTH = 22;
const TARGET_MAX_DEPTH = 34;
const TARGET_SIZES = [0.72, 1, 1.34];
const AIM_TIME = 200;
const BEST_KEY = 'space_ducks_best';
const METRICS_KEY = 'ar_metrics';
const DUCK_COLORS = ['#ffcb39', '#6ef5bf', '#f8a5ee', '#79caff'];
const POINTS = { duck: 100, crystal: 250, bottle: -150 };
const TARGET_SLOTS = [[0.5, 0.45], [0.26, 0.2], [0.74, 0.2], [0.31, 0.82], [0.69, 0.82]];
const $ = (id) => document.getElementById(id);

const stage = $('stage');
const viewport = $('viewport');
const cameraButton = $('camera-toggle');
const cameraFeed = $('camera-feed');
const orientationControl = $('camera-orientation');
const status = $('status');
const playButton = $('play');
const replayButton = $('replay');
const showroomButton = $('showroom');
const screens = { menu: $('menu'), game: $('hud'), studio: $('studio'), results: $('results') };
const modelColor = $('model-color');
const modelSize = $('model-size');
const spinSpeed = $('spin-speed');

let cameraStream = null;
let cameraRequest = 0;
let cameraOpening = null;
let facingMode = '';
let cameraOrientation = { x: 1, y: 1 };
let arcade;
let motionPermission;

function updateCameraOrientation() {
    const mode = orientationControl.value;
    const mirror = mode === 'mirror' || (mode === 'auto' && facingMode === 'user');
    const rotate = mode === 'rotate';
    cameraOrientation = { x: mirror || rotate ? -1 : 1, y: rotate || mode === 'flip-vertical' ? -1 : 1 };
    cameraFeed.style.setProperty('--camera-x', cameraOrientation.x);
    cameraFeed.style.setProperty('--camera-y', cameraOrientation.y);
    stage.dispatchEvent(new Event('camera-orientation-changed'));
}

function stopCamera(message = '') {
    cameraRequest += 1;
    cameraOpening = null;
    if (cameraStream) cameraStream.getTracks().forEach((track) => track.stop());
    cameraStream = null;
    cameraFeed.srcObject = null;
    stage.classList.remove('has-camera');
    orientationControl.hidden = true;
    cameraButton.textContent = 'Activar cámara';
    cameraButton.setAttribute('aria-pressed', 'false');
    cameraButton.disabled = false;
    status.textContent = message;
    stage.dispatchEvent(new Event('camera-stopped'));
}

async function requestCamera() {
    if (!window.isSecureContext) {
        status.textContent = 'Abre el juego por HTTPS para permitir el uso de la cámara.';
        return false;
    }
    if (!navigator.mediaDevices?.getUserMedia) {
        status.textContent = 'La cámara no está disponible en este navegador.';
        return false;
    }

    const request = ++cameraRequest;
    cameraButton.disabled = true;
    status.textContent = 'Esperando permiso para usar la cámara…';
    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: { ideal: 'environment' },
                width: { ideal: 640 },
                height: { ideal: 480 },
                frameRate: { ideal: 30, max: 30 }
            },
            audio: false
        });
        if (request !== cameraRequest) {
            stream.getTracks().forEach((track) => track.stop());
            return false;
        }

        cameraStream = stream;
        cameraFeed.srcObject = stream;
        await cameraFeed.play();
        if (request !== cameraRequest) return false;

        const track = stream.getVideoTracks()[0];
        track.addEventListener('ended', () => {
            if (cameraStream !== stream) return;
            stopCamera('La cámara se desconectó. Vuelve a activarla para jugar.');
        }, { once: true });
        facingMode = track.getSettings().facingMode;
        updateCameraOrientation();
        stage.classList.add('has-camera');
        orientationControl.hidden = false;
        cameraButton.textContent = 'Desactivar cámara';
        cameraButton.setAttribute('aria-pressed', 'true');
        cameraButton.disabled = false;
        status.textContent = '';
        return true;
    } catch (error) {
        if (request !== cameraRequest) return false;
        stopCamera(error.name === 'NotAllowedError'
            ? 'Permite el acceso a la cámara en tu navegador para jugar con la mano.'
            : 'No se pudo abrir la cámara. Comprueba que esté disponible y vuelve a intentarlo.');
        return false;
    }
}

function openCamera() {
    if (cameraOpening) return cameraOpening;
    if (cameraStream) return Promise.resolve(true);
    const pending = requestCamera().finally(() => {
        if (cameraOpening === pending) cameraOpening = null;
    });
    cameraOpening = pending;
    return pending;
}

cameraButton.addEventListener('click', () => {
    if (cameraStream) stopCamera('Cámara desactivada.');
    else openCamera();
});

window.addEventListener('pagehide', () => stopCamera());
orientationControl.addEventListener('change', updateCameraOrientation);

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

function initializeArcade(scene) {
    const { THREE } = window.AFRAME;
    const { templates, showroom, showroomFeathers } = createModels(THREE);
    const targetLayer = $('targets').object3D;
    const showroomRoot = $('showroom-object');
    const spinButton = $('spin');
    const handHint = $('hand-hint');
    const reticle = $('hand-reticle');
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
    const deviceEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    const deviceRotation = new THREE.Quaternion();
    const motionReference = new THREE.Quaternion();
    const relativeRotation = new THREE.Quaternion();
    const screenRotation = new THREE.Quaternion();
    const deviceToCamera = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
    const screenAxis = new THREE.Vector3(0, 0, 1);
    const forward = new THREE.Vector3();
    let best = readBest();
    let score = 0;
    let hits;
    let endTime = 0;
    let nextSpawn = 0;
    let spawnBag = [];
    let frameId = 0;
    let previousFrame = 0;
    let spinProgress = 1;
    let spinFrom = 0;
    let screenRevision = 0;
    let handTracker = null;
    let advanceDetector = null;
    let lastHandFrameAt = -Infinity;
    let lastHitAt = -Infinity;
    let lockedTarget = null;
    let lockStarted = 0;
    let hasMotionReference = false;
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
            -SHOWROOM_DEPTH
        );
        showroom.scale.setScalar(scale * Number(modelSize.value) / 100);
    }

    function updateView() {
        const { width, height, top } = viewport.getBoundingClientRect();
        if (!width || !height) return;
        const playing = stage.dataset.screen === 'game';
        const resized = width !== view.width || height !== view.height;
        const halfHeight = Math.tan(THREE.MathUtils.degToRad(scene.camera.fov / 2)) * SHOWROOM_DEPTH;
        const fieldTop = playing ? Math.max(height * 0.23, screens.game.getBoundingClientRect().bottom - top + 16) : 0;
        const fieldBottom = playing ? height * 0.64 : height;
        view = {
            width, height, halfHeight, halfWidth: halfHeight * width / height,
            fieldTop, fieldBottom,
            targetScale: THREE.MathUtils.clamp(Math.min(width, height) / 460, 0.7, 1.15)
        };
        if (stage.dataset.screen === 'studio') layoutShowroom();
        else if (resized && playing) loseHand();
    }

    function pointView(yaw, pitch = 0) {
        scene.camera.rotation.set(pitch, yaw, 0, 'YXZ');
        scene.camera.updateMatrixWorld(true);
    }

    function deviceMoved(event) {
        if (stage.dataset.screen !== 'game' || facingMode === 'user') return;
        const { alpha, beta, gamma } = event;
        if (![alpha, beta, gamma].every(Number.isFinite)) return;

        const radians = THREE.MathUtils.degToRad;
        const screenAngle = window.screen.orientation?.angle ?? window.orientation ?? 0;
        deviceEuler.set(radians(beta), radians(alpha), -radians(gamma));
        deviceRotation.setFromEuler(deviceEuler).multiply(deviceToCamera);
        deviceRotation.multiply(screenRotation.setFromAxisAngle(screenAxis, -radians(screenAngle)));
        if (!hasMotionReference) {
            motionReference.copy(deviceRotation).invert();
            hasMotionReference = true;
        }
        relativeRotation.multiplyQuaternions(motionReference, deviceRotation);
        forward.set(0, 0, -1).applyQuaternion(relativeRotation);
        const yaw = Math.atan2(-forward.x, -forward.z);
        const pitch = Math.asin(THREE.MathUtils.clamp(forward.y, -0.43, 0.43));
        pointView(yaw, pitch);
    }

    function setScreen(screen, focusId) {
        screenRevision += 1;
        handTracker?.stop();
        advanceDetector?.reset();
        cancelAnimationFrame(frameId);
        frameId = 0;
        previousFrame = 0;
        for (const { model } of targets.values()) model.removeFromParent();
        targets.clear();
        effects.replaceChildren();
        resetHandAim();
        pointView(0);

        stage.dataset.screen = screen;
        for (const [name, panel] of Object.entries(screens)) panel.hidden = name !== screen;
        handHint.hidden = screen !== 'game';
        showroomRoot.setAttribute('visible', screen === 'studio');
        updateView();

        if (screen === 'game') handTracker.start();
        if (screen === 'game' || screen === 'studio') frameId = requestAnimationFrame(update);
        $(focusId).focus({ preventScroll: true });
    }

    function startGame() {
        score = 0;
        hits = { duck: 0, crystal: 0, bottle: 0 };
        endTime = 0;
        spawnBag = Math.random() < 0.5 ? ['bottle', 'crystal', 'duck'] : ['crystal', 'bottle', 'duck'];
        hasMotionReference = false;
        scoreLabel.textContent = '0';
        bestLabel.textContent = best;
        timeLabel.textContent = '30 s';
        timeLabel.classList.remove('is-low');
        setHandHint('Muestra el índice extendido para apuntar.');
        setScreen('game', 'quit');
    }

    async function prepareGame(motion) {
        const request = screenRevision;
        const stream = cameraStream;
        void motion.then((granted) => {
            if (granted) window.addEventListener('deviceorientation', deviceMoved);
        });
        try {
            if (!handTracker) {
                status.textContent = 'Cargando el reconocimiento de manos…';
                const [{ createHandTracker }, { createAdvanceDetector }] = await Promise.all([
                    import('./Juegos/PatosEspaciales/hand-tracker.js'),
                    import('./Juegos/PatosEspaciales/scene-motion.js')
                ]);
                handTracker = await createHandTracker(cameraFeed, updateHandAim, trackingFailed);
                advanceDetector = createAdvanceDetector(cameraFeed);
            }
            if (request !== screenRevision || stream !== cameraStream) return;
            status.textContent = '';
            startGame();
        } catch {
            if (request === screenRevision && stream === cameraStream) {
                status.textContent = 'No se pudo cargar el reconocimiento de manos. Comprueba tu conexión y vuelve a intentar.';
            }
        }
    }

    function finishGame() {
        best = Math.max(best, readBest());
        const newRecord = score > best;
        if (newRecord) {
            best = score;
            saveBest(best);
        }
        HistorialJuego.registrar('patos-espaciales', {
            marcador: `${score} puntos`,
            resultado: newRecord ? 'Nuevo récord' : 'Ronda completada',
            duracion: ROUND_TIME / 1000,
            metricas: { Patos: hits.duck, Cristales: hits.crystal, Botellas: hits.bottle }
        });
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
        const camera = scene.camera.rotation;
        const occupied = [...targets.values()]
            .filter((target) => Math.cos(target.viewYaw - camera.y) > 0.96 && Math.abs(target.viewPitch - camera.x) < 0.24);
        if (occupied.length >= 3) return;
        const freeSlots = TARGET_SLOTS.map((_, index) => index).filter((index) => !occupied.some((target) => target.slot === index));
        const slot = freeSlots[Math.floor(Math.random() * freeSlots.length)];
        const availableSizes = TARGET_SIZES.filter((size) => !occupied.some((target) => target.size === size));
        const size = availableSizes[Math.floor(Math.random() * availableSizes.length)];
        const [x, y] = TARGET_SLOTS[slot];
        // Use the current viewport to keep new targets inside the comfortable aiming area.
        aimRay(x * view.width, THREE.MathUtils.lerp(view.fieldTop, view.fieldBottom, y));
        const { direction } = raycaster.ray;
        const yaw = Math.atan2(-direction.x, -direction.z);
        const depth = THREE.MathUtils.lerp(TARGET_MIN_DEPTH, TARGET_MAX_DEPTH, Math.random());
        const type = nextTargetType();
        const scale = size * (type === 'duck' ? 1 : 1.32);
        const model = templates[type].clone();
        const hitbox = type === 'duck' ? collider(model, 1.21, 1.04, 0.78) : collider(model, 0.75, 0.88, 0.62);
        raycaster.ray.at(depth, model.position);
        model.rotation.y = yaw;
        model.scale.setScalar(view.targetScale * scale);
        targets.set(hitbox, {
            model, type, slot, size, scale, yaw, height: model.position.y, born: now, viewYaw: camera.y, viewPitch: camera.x,
            life: 10_000 + Math.random() * 3800
        });
        targetLayer.add(model);
    }

    function refreshTargets(now) {
        for (const { model } of targets.values()) model.removeFromParent();
        targets.clear();
        for (let i = 0; i < 3; i += 1) spawnTarget(now);
        nextSpawn = now + 1450;
    }

    function moveTargets(now) {
        for (const [hitbox, target] of targets) {
            const age = now - target.born;
            const { model, scale, height, yaw } = target;
            if (age >= target.life) {
                model.removeFromParent();
                targets.delete(hitbox);
                continue;
            }
            const sway = reducedMotion.matches ? 0 : Math.sin(age / 510);
            model.position.y = height + sway * 0.26;
            model.rotation.y = yaw + sway * 0.23;
            model.scale.setScalar(view.targetScale * scale);
        }
    }

    function update(now) {
        frameId = 0;
        const elapsed = previousFrame ? Math.min(now - previousFrame, 50) : 0;
        previousFrame = now;
        if (stage.dataset.screen === 'game') {
            if (endTime) {
                const seconds = Math.max(0, Math.ceil((endTime - now) / 1000));
                const timeText = seconds + ' s';
                if (timeLabel.textContent !== timeText) timeLabel.textContent = timeText;
                timeLabel.classList.toggle('is-low', seconds <= 5);
                if (now >= endTime) {
                    finishGame();
                    return;
                }
                if (facingMode !== 'user' && advanceDetector?.advanced(now)) refreshTargets(now);
                moveTargets(now);
                if (now >= nextSpawn) {
                    spawnTarget(now);
                    nextSpawn = now + 1450;
                }
            }
            if (!reticle.hidden && now - lastHandFrameAt > 300) loseHand();
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

    function aimRay(x, y) {
        pointer.set(x / view.width * 2 - 1, 1 - y / view.height * 2);
        raycaster.setFromCamera(pointer, scene.camera);
    }

    function targetAt(x, y) {
        aimRay(x, y);
        const hitboxes = [...targets.keys()];
        for (const hitbox of hitboxes) hitbox.updateWorldMatrix(true, false);
        return raycaster.intersectObjects(hitboxes, false)[0]?.object ?? null;
    }

    function hitTarget(hitbox, x, y) {
        const target = targets.get(hitbox);
        const points = POINTS[target.type];
        score += points;
        hits[target.type] += 1;
        scoreLabel.textContent = score;
        targets.delete(hitbox);
        target.model.removeFromParent();
        showHit(x, y, target.type, points);
    }

    function setHandHint(message) {
        if (handHint.textContent !== message) handHint.textContent = message;
    }

    function clearAimLock() {
        lockedTarget = null;
        reticle.classList.remove('is-locking');
    }

    function resetHandAim() {
        lastHandFrameAt = -Infinity;
        lastHitAt = -Infinity;
        clearAimLock();
        reticle.hidden = true;
        reticle.classList.remove('is-fired');
    }

    function loseHand() {
        resetHandAim();
        setHandHint('Muestra el índice extendido para apuntar.');
    }

    function trackingFailed() {
        handTracker.close();
        handTracker = null;
        setScreen('menu', 'play');
        status.textContent = 'Se interrumpió el reconocimiento de manos. Pulsa Jugar para volver a intentarlo.';
    }

    function updateHandAim(sample, videoWidth, videoHeight) {
        if (!sample) {
            loseHand();
            return;
        }

        const fit = Math.max(view.width / videoWidth, view.height / videoHeight);
        // Match the camera crop and reflect the aim when the video is reflected.
        const x = view.width / 2 + (sample.x - 0.5) * videoWidth * fit * cameraOrientation.x;
        const y = view.height / 2 + (sample.y - 0.5) * videoHeight * fit * cameraOrientation.y;
        if (x < 0 || x > view.width || y < 0 || y > view.height) {
            loseHand();
            return;
        }

        const now = performance.now();
        if (!endTime) {
            endTime = now + ROUND_TIME;
            refreshTargets(now);
        }
        lastHandFrameAt = now;
        reticle.style.transform = 'translate3d(' + x + 'px, ' + y + 'px, 0) translate(-50%, -50%)';
        reticle.classList.toggle('is-fired', now - lastHitAt < AIM_TIME);
        reticle.hidden = false;
        setHandHint('Mantén el círculo sobre un blanco.');
        if (now >= endTime) return;
        const target = targetAt(x, y);
        if (!target) {
            clearAimLock();
            return;
        }
        if (target !== lockedTarget) {
            lockedTarget = target;
            lockStarted = now;
        }
        const progress = (now - lockStarted) / AIM_TIME;
        if (progress < 1) {
            reticle.style.setProperty('--aim-progress', progress * 360 + 'deg');
            reticle.classList.add('is-locking');
            return;
        }
        hitTarget(target, x, y);
        clearAimLock();
        lastHitAt = now;
        reticle.classList.add('is-fired');
    }

    viewport.addEventListener('pointerup', (event) => {
        if (stage.dataset.screen !== 'studio' || !event.isPrimary || event.button !== 0) return;
        const bounds = viewport.getBoundingClientRect();
        aimRay(event.clientX - bounds.left, event.clientY - bounds.top);
        showroomCollider.updateWorldMatrix(true, false);
        if (raycaster.intersectObject(showroomCollider, false).length) activateModel();
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

    stage.addEventListener('camera-stopped', () => {
        if (stage.dataset.screen === 'game') setScreen('menu', 'play');
    });
    stage.addEventListener('camera-orientation-changed', () => {
        if (stage.dataset.screen === 'game') loseHand();
    });
    $('quit').addEventListener('click', () => setScreen('menu', 'play'));
    $('studio-back').addEventListener('click', () => setScreen('menu', 'showroom'));
    $('result-back').addEventListener('click', () => setScreen('menu', 'play'));
    new ResizeObserver(updateView).observe(viewport);
    new ResizeObserver(() => {
        if (stage.dataset.screen === 'studio') layoutShowroom();
    }).observe(panel);
    return { prepareGame, showStudio: () => setScreen('studio', 'studio-back') };
}

async function requestMotionPermission() {
    const sensors = window.DeviceOrientationEvent;
    if (!sensors || !window.matchMedia('(any-pointer: coarse)').matches) return false;
    try {
        return typeof sensors.requestPermission !== 'function' || await sensors.requestPermission() === 'granted';
    } catch {
        return false;
    }
}

async function loadArcade() {
    if (arcade) return arcade;
    const loading = 'Cargando escena 3D…';
    status.textContent = loading;
    try {
        if (!window.AFRAME) {
            await new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = AFRAME_URL;
                script.addEventListener('load', resolve, { once: true });
                script.addEventListener('error', () => {
                    script.remove();
                    reject(new Error('A-Frame no está disponible.'));
                }, { once: true });
                document.head.append(script);
            });
        }

        const scene = $('scene-template').content.firstElementChild.cloneNode(true);
        try {
            await new Promise((resolve, reject) => {
                const ready = () => {
                    clearTimeout(timeout);
                    resolve();
                };
                const timeout = setTimeout(() => {
                    scene.removeEventListener('renderstart', ready);
                    reject(new Error('La escena 3D no inició.'));
                }, 8000);
                scene.addEventListener('renderstart', ready, { once: true });
                viewport.append(scene);
            });
            arcade = initializeArcade(scene);
            return arcade;
        } catch (error) {
            scene.remove();
            throw error;
        }
    } finally {
        if (status.textContent === loading) status.textContent = '';
    }
}

async function openArcade(event) {
    if (playButton.disabled) return;
    const playing = event.currentTarget !== showroomButton;
    const screen = stage.dataset.screen;
    playButton.disabled = replayButton.disabled = showroomButton.disabled = true;
    let request = cameraRequest;
    try {
        if (playing) {
            const camera = openCamera();
            request = cameraRequest;
            // El permiso de movimiento debe solicitarse durante el clic, antes de cargar la escena.
            motionPermission ??= requestMotionPermission();
            if (!(await camera) || request !== cameraRequest || stage.dataset.screen !== screen) return;
        }

        const instance = await loadArcade();
        if (stage.dataset.screen !== screen) return;
        if (!playing) instance.showStudio();
        else if (request === cameraRequest && cameraStream) await instance.prepareGame(motionPermission);
    } catch {
        if (!playing || request === cameraRequest) {
            status.textContent = 'No se pudo abrir la escena 3D. Comprueba tu conexión y que el navegador admita WebGL.';
        }
    } finally {
        playButton.disabled = replayButton.disabled = showroomButton.disabled = false;
    }
}

for (const button of [playButton, replayButton, showroomButton]) button.addEventListener('click', openArcade);
