// Texturas procedurales generadas con canvas
const Tex = (() => {
  const cache = {};

  function make(w, h, fn, repeat) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    fn(c.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = 4;
    return t;
  }
  const rnd = (a, b) => a + Math.random() * (b - a);
  const speckle = (ctx, w, h, n, colors, size) => {
    for (let i = 0; i < n; i++) {
      ctx.fillStyle = colors[(Math.random() * colors.length) | 0];
      ctx.fillRect(rnd(0, w), rnd(0, h), size, size);
    }
  };
  const cached = (k, fn) => cache[k] || (cache[k] = fn());

  function jersey(team) {
    return cached('j' + team.name, () => make(64, 64, (ctx, w, h) => {
      ctx.fillStyle = team.pri; ctx.fillRect(0, 0, w, h);
      if (team.pattern === 'vstripes') {
        ctx.fillStyle = team.sec;
        for (let x = 0; x < w; x += 16) ctx.fillRect(x, 0, 8, h);
      } else if (team.pattern === 'band') {
        ctx.fillStyle = team.sec; ctx.fillRect(0, 22, w, 12);
      } else if (team.pattern === 'solid') {
        ctx.fillStyle = team.sec; ctx.fillRect(0, 0, w, 6);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.18)'; ctx.fillRect(0, 58, w, 6);
      ctx.fillStyle = 'rgba(255,255,255,0.9)'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(team.short.slice(0, 3).toUpperCase(), 32, 52);
    }));
  }

  function policeVest() {
    return cached('police', () => make(64, 64, (ctx, w, h) => {
      ctx.fillStyle = '#1d2630'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#10161d'; ctx.fillRect(4, 4, 56, 56);
      ctx.fillStyle = '#e6d84a'; ctx.font = 'bold 9px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('POLICÍA', 32, 36);
      ctx.fillRect(4, 8, 56, 2);
    }));
  }

  function concrete(rep) {
    return make(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#7d7d80'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 2500, ['#6c6c70', '#8d8d91', '#757579', '#85858a'], 3);
      ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 2;
      ctx.strokeRect(0, 0, w, h);
    }, rep);
  }

  function asphalt(rep) {
    return make(256, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2b2c30'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 3500, ['#3a3b40', '#222328', '#45464b', '#303136'], 2);
    }, rep);
  }

  function pitch() {
    return make(512, 768, (ctx, w, h) => {
      for (let i = 0; i < 12; i++) {
        ctx.fillStyle = i % 2 ? '#2f7d36' : '#37893f';
        ctx.fillRect(0, i * (h / 12), w, h / 12);
      }
      ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4;
      ctx.strokeRect(20, 20, w - 40, h - 40);
      ctx.beginPath(); ctx.moveTo(20, h / 2); ctx.lineTo(w - 20, h / 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(w / 2, h / 2, 60, 0, 7); ctx.stroke();
      ctx.strokeRect(w / 2 - 110, 20, 220, 100);
      ctx.strokeRect(w / 2 - 110, h - 120, 220, 100);
      ctx.strokeRect(w / 2 - 50, 20, 100, 40);
      ctx.strokeRect(w / 2 - 50, h - 60, 100, 40);
    });
  }

  function crowd(colA, colB) {
    return make(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#16161c'; ctx.fillRect(0, 0, w, h);
      for (let y = 6; y < h; y += 9) {
        for (let x = 4; x < w; x += 8) {
          const left = x < w / 2;
          const col = Math.random() < 0.18 ? '#d9d9d9' : (left ? colA : colB);
          ctx.fillStyle = col; ctx.fillRect(x, y + 3, 6, 6);
          ctx.fillStyle = ['#e8b88a', '#b9805a', '#6a4430'][(Math.random() * 3) | 0];
          ctx.fillRect(x + 1, y - 1, 4, 4);
        }
      }
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = i % 2 ? colA : colB;
        ctx.fillRect(rnd(0, w - 50), rnd(0, h - 30), rnd(25, 50), rnd(4, 10));
      }
    });
  }

  function windows(rep) {
    return make(128, 256, (ctx, w, h) => {
      ctx.fillStyle = '#2a2a32'; ctx.fillRect(0, 0, w, h);
      for (let y = 8; y < h - 10; y += 28) {
        for (let x = 8; x < w - 10; x += 30) {
          ctx.fillStyle = Math.random() < 0.35 ? '#f2c260' : '#12121a';
          ctx.fillRect(x, y, 18, 18);
        }
      }
    }, rep);
  }

  function graffiti(seed) {
    return make(512, 256, (ctx, w, h) => {
      ctx.fillStyle = '#6f6f72'; ctx.fillRect(0, 0, w, h);
      speckle(ctx, w, h, 3000, ['#606064', '#7c7c80'], 3);
      const words = ['AGUANTE', 'NO ME ARRUGO', 'TODO O NADA', 'LA BARRA', 'SOMOS LOCALES', 'DE LOCAL', 'HASTA LA MUERTE'];
      const cols = ['#2ecc71', '#e74c3c', '#f1c40f', '#3498db', '#ecf0f1'];
      ctx.textAlign = 'center';
      for (let i = 0; i < 4; i++) {
        ctx.save();
        ctx.translate(rnd(100, w - 100), rnd(50, h - 30));
        ctx.rotate(rnd(-0.15, 0.15));
        ctx.font = 'bold ' + (24 + ((seed + i) % 3) * 8) + 'px Impact, sans-serif';
        ctx.lineWidth = 5; ctx.strokeStyle = '#111';
        const t = words[(seed * 3 + i * 2 + ((Math.random() * 3) | 0)) % words.length];
        ctx.strokeText(t, 0, 0);
        ctx.fillStyle = cols[(seed + i) % cols.length]; ctx.fillText(t, 0, 0);
        ctx.restore();
      }
    });
  }

  function banner(text, c1, c2) {
    return make(512, 160, (ctx, w, h) => {
      const g = ctx.createLinearGradient(0, 0, w, 0);
      g.addColorStop(0, c1); g.addColorStop(1, c2);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      for (let x = -h; x < w; x += 40) { ctx.beginPath(); ctx.moveTo(x, h); ctx.lineTo(x + 20, h); ctx.lineTo(x + 20 + h, 0); ctx.lineTo(x + h, 0); ctx.fill(); }
      ctx.font = 'bold 54px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.lineWidth = 8; ctx.strokeStyle = '#000'; ctx.strokeText(text, w / 2, h / 2);
      ctx.fillStyle = '#fff'; ctx.fillText(text, w / 2, h / 2);
    });
  }

  function sign(text, bg, fg) {
    return make(512, 128, (ctx, w, h) => {
      ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
      ctx.strokeStyle = fg; ctx.lineWidth = 6; ctx.strokeRect(6, 6, w - 12, h - 12);
      ctx.font = 'bold 52px Impact, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillStyle = fg; ctx.fillText(text, w / 2, h / 2 + 3);
    });
  }

  function fence() {
    return make(64, 64, (ctx, w, h) => {
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = 'rgba(200,200,210,0.85)'; ctx.lineWidth = 2;
      for (let i = -h; i < w; i += 10) {
        ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i + h, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(i + h, 0); ctx.lineTo(i, h); ctx.stroke();
      }
    });
  }

  function glow(color) {
    return cached('g' + color, () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      g.addColorStop(0, color); g.addColorStop(0.4, color.replace(/[\d.]+\)$/, '0.35)')); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    });
  }

  function smoke() {
    return cached('smoke', () => {
      const c = document.createElement('canvas'); c.width = c.height = 64;
      const ctx = c.getContext('2d');
      const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.6, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64);
      return new THREE.CanvasTexture(c);
    });
  }

  function bluePolice() {
    return make(64, 64, (ctx, w, h) => {
      ctx.fillStyle = 'rgba(120,170,255,0.35)'; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = 'rgba(255,255,255,0.8)'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('POLICÍA', 32, 36);
    });
  }

  return { make, jersey, policeVest, concrete, asphalt, pitch, crowd, windows, graffiti, banner, sign, fence, glow, smoke, bluePolice };
})();
