'use strict';

async function start() {
    const { createDetector, detectHand } = await import('./hand-tracker.js');
    const detector = await createDetector(new OffscreenCanvas(1, 1));

    self.addEventListener('message', ({ data: { image, timestamp } }) => {
        try {
            self.postMessage({ type: 'result', sample: detectHand(detector, image, timestamp) });
        } catch {
            self.postMessage({ type: 'error' });
        } finally {
            image.close();
        }
    });
    self.postMessage({ type: 'ready' });
}

start().catch(() => self.postMessage({ type: 'error' }));
