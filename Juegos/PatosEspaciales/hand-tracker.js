const VISION_PACKAGE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.21';
const HAND_MODEL = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';
const MAX_FRAME_SIDE = 352;
const FALLBACK_INTERVAL = 32;

export async function createDetector(canvas) {
    const { FilesetResolver, HandLandmarker } = await import(VISION_PACKAGE + '/vision_bundle.mjs');
    const vision = await FilesetResolver.forVisionTasks(VISION_PACKAGE + '/wasm');
    return HandLandmarker.createFromOptions(vision, {
        baseOptions: { modelAssetPath: HAND_MODEL, delegate: 'CPU' },
        canvas,
        runningMode: 'VIDEO',
        numHands: 1
    });
}

export function detectHand(detector, image, timestamp) {
    const [landmarks] = detector.detectForVideo(image, timestamp).landmarks;
    if (!landmarks) return null;

    const { width, height } = image;
    const distance = (a, b) => Math.hypot(
        (landmarks[a].x - landmarks[b].x) * width,
        (landmarks[a].y - landmarks[b].y) * height,
        (landmarks[a].z - landmarks[b].z) * width
    );
    // A straight index finger spans nearly the full length of its three segments.
    const indexLength = distance(5, 6) + distance(6, 7) + distance(7, 8);
    if (indexLength <= 1) return null;
    return { x: landmarks[8].x, y: landmarks[8].y, extension: distance(5, 8) / indexLength };
}

function createWorkerDetector() {
    return new Promise((resolve, reject) => {
        const worker = new Worker(new URL('./hand-tracker-worker.js', import.meta.url));
        let pending = null;
        let stopped = false;
        const timeout = setTimeout(fail, 30_000);

        function fail() {
            if (stopped) return;
            stopped = true;
            clearTimeout(timeout);
            worker.terminate();
            const error = new Error('El proceso de reconocimiento no pudo terminar.');
            pending?.reject(error);
            pending = null;
            reject(error);
        }

        worker.addEventListener('error', (event) => {
            event.preventDefault();
            fail();
        });
        worker.addEventListener('messageerror', fail);
        worker.addEventListener('message', ({ data }) => {
            if (data.type === 'ready') {
                clearTimeout(timeout);
                resolve({
                    detect(image, timestamp) {
                        return new Promise((resolveFrame, rejectFrame) => {
                            if (stopped) {
                                image.close();
                                rejectFrame(new Error('El proceso de reconocimiento está cerrado.'));
                                return;
                            }
                            pending = { resolve: resolveFrame, reject: rejectFrame };
                            try {
                                worker.postMessage({ image, timestamp }, [image]);
                            } catch {
                                image.close();
                                fail();
                            }
                        });
                    },
                    close: fail
                });
            } else if (data.type === 'result') {
                const frame = pending;
                pending = null;
                frame?.resolve(data.sample);
            } else {
                fail();
            }
        });
    });
}

export async function createHandTracker(video, onSample, onError) {
    const offscreen = typeof OffscreenCanvas === 'function' ? new OffscreenCanvas(1, 1) : null;
    let capture = offscreen ?? document.createElement('canvas');
    let surface = capture.getContext('2d', { alpha: false });
    if (!surface && offscreen) {
        capture = document.createElement('canvas');
        surface = capture.getContext('2d', { alpha: false });
    }
    if (!surface) throw new Error('La cámara no puede preparar imágenes.');

    let worker = null;
    if (typeof Worker === 'function' && typeof capture.transferToImageBitmap === 'function') {
        try {
            worker = await createWorkerDetector();
        } catch {
            // Some browsers only provide WebGL on the main thread.
        }
    }
    let detector = worker ? null : await createDetector(document.createElement('canvas'));
    const videoFrames = typeof video.requestVideoFrameCallback === 'function';
    let running = false;
    let pending = false;
    let revision = 0;
    let callback = null;
    let lastVideoTime = -1;
    let lastFrameAt = -Infinity;

    function schedule() {
        if (!running || pending || callback !== null) return;
        callback = videoFrames ? video.requestVideoFrameCallback(processFrame) : requestAnimationFrame(processFrame);
    }

    function stop() {
        running = false;
        revision += 1;
        if (callback === null) return;
        if (videoFrames) video.cancelVideoFrameCallback(callback);
        else cancelAnimationFrame(callback);
        callback = null;
    }

    async function processFrame(now) {
        callback = null;
        if (!running) return;
        const { videoWidth, videoHeight, currentTime } = video;
        if (video.readyState < 2 || !videoWidth || !videoHeight
            || (!videoFrames && currentTime === lastVideoTime)
            || (!worker && now - lastFrameAt < FALLBACK_INTERVAL)) {
            schedule();
            return;
        }
        lastVideoTime = currentTime;
        lastFrameAt = now;
        const frameRevision = revision;
        pending = true;

        try {
            const scale = Math.min(1, MAX_FRAME_SIDE / Math.max(videoWidth, videoHeight));
            const width = Math.max(1, Math.round(videoWidth * scale));
            const height = Math.max(1, Math.round(videoHeight * scale));
            if (capture.width !== width) capture.width = width;
            if (capture.height !== height) capture.height = height;
            surface.drawImage(video, 0, 0, width, height);

            let sample;
            if (worker) {
                try {
                    sample = await worker.detect(capture.transferToImageBitmap(), now);
                } catch {
                    worker.close();
                    worker = null;
                    detector = await createDetector(document.createElement('canvas'));
                    return;
                }
            } else {
                sample = detectHand(detector, capture, now);
            }
            if (running && frameRevision === revision && videoWidth === video.videoWidth && videoHeight === video.videoHeight) {
                onSample(sample, videoWidth, videoHeight);
            }
        } catch {
            if (running) {
                stop();
                onError();
            }
        } finally {
            // Capture the newest frame once inference finishes. Keep no queue of old frames.
            pending = false;
            schedule();
        }
    }

    return {
        start() {
            running = true;
            lastVideoTime = -1;
            lastFrameAt = -Infinity;
            schedule();
        },
        stop,
        close() {
            stop();
            worker?.close();
            detector?.close();
        }
    };
}
