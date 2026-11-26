const WIDTH = 96;
const HEIGHT = 72;
const SAMPLE_INTERVAL = 140;
const POINTS = [[17, 15], [48, 13], [79, 15], [14, 34], [82, 34], [17, 56], [48, 58], [79, 56]];

export function estimateExpansion(previous, current) {
    const matches = [];
    for (const [x, y] of POINTS) {
        const origin = y * WIDTH + x;
        let low = 255;
        let high = 0;
        for (let j = -2; j <= 2; j += 1) {
            for (let i = -2; i <= 2; i += 1) {
                const value = previous[origin + j * WIDTH + i];
                low = Math.min(low, value);
                high = Math.max(high, value);
            }
        }
        if (high - low < 24) continue;
        let best = Infinity;
        let alternate = Infinity;
        let matchX = 0;
        let matchY = 0;
        for (let dy = -5; dy <= 5; dy += 1) {
            for (let dx = -5; dx <= 5; dx += 1) {
                let error = 0;
                const offset = dy * WIDTH + dx;
                for (let j = -2; j <= 2; j += 1) {
                    for (let i = -2; i <= 2; i += 1) {
                        const point = origin + j * WIDTH + i;
                        error += Math.abs(previous[point] - current[point + offset]);
                    }
                }
                if (error < best) {
                    alternate = best;
                    best = error;
                    matchX = dx;
                    matchY = dy;
                } else if (error < alternate) {
                    alternate = error;
                }
            }
        }
        if (best < 260 && best < alternate * 0.85) matches.push({ x, y, dx: matchX, dy: matchY });
    }
    if (matches.length < 5) return 0;

    const mean = (key) => matches.reduce((sum, match) => sum + match[key], 0) / matches.length;
    const [cx, cy, tx, ty] = ['x', 'y', 'dx', 'dy'].map(mean);
    // Remove shared image translation. Advancing expands the background around the image.
    const expansion = matches.map(({ x, y, dx, dy }) => {
        const rx = x - cx;
        const ry = y - cy;
        return (rx * (dx - tx) + ry * (dy - ty)) / Math.max(1, rx * rx + ry * ry);
    }).sort((a, b) => a - b);
    const median = expansion[Math.floor(expansion.length / 2)];
    return expansion[1] > 0.008 && median < 0.2 ? median : 0;
}

export function createAdvanceDetector(video) {
    const canvas = document.createElement('canvas');
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const surface = canvas.getContext('2d', { willReadFrequently: true });
    let previous = null;
    let lastSample = -Infinity;
    let lastAdvance = -Infinity;
    let progress = 0;
    let frameTime = -1;

    return {
        reset() {
            previous = null;
            lastSample = lastAdvance = -Infinity;
            progress = 0;
            frameTime = -1;
        },
        advanced(now) {
            if (!surface || video.readyState < 2 || now - lastSample < SAMPLE_INTERVAL || frameTime === video.currentTime) return false;
            if (now - lastAdvance > 750) progress = 0;
            lastSample = now;
            frameTime = video.currentTime;
            surface.drawImage(video, 0, 0, WIDTH, HEIGHT);
            const pixels = surface.getImageData(0, 0, WIDTH, HEIGHT).data;
            const current = new Uint8Array(WIDTH * HEIGHT);
            for (let i = 0, pixel = 0; i < current.length; i += 1, pixel += 4) {
                current[i] = (pixels[pixel] + 2 * pixels[pixel + 1] + pixels[pixel + 2]) >> 2;
            }
            const expansion = previous ? estimateExpansion(previous, current) : 0;
            previous = current;
            if (expansion > 0) {
                progress += expansion;
                lastAdvance = now;
            }
            if (progress < 0.14) return false;
            progress = 0;
            return true;
        }
    };
}
