// Generative backgrounds. Five original styles, each drawn from a seed, so the
// app looks a little different every time it opens. Three ways to show it:
// Still (drawn once), Motion (slowly alive) or Fidget (also reacts to touch).
// Kept to the PX palette: graphite with an ember accent, low contrast behind content.

export type BgStyle = 'embers' | 'contours' | 'constellation' | 'pulse' | 'orbits';
export type BgMode = 'still' | 'motion' | 'fidget';
export const BG_STYLES: { id: BgStyle; name: string }[] = [
  { id: 'embers', name: 'Ember drift' }, { id: 'contours', name: 'Contours' }, { id: 'constellation', name: 'Constellation' },
  { id: 'pulse', name: 'Pulse grid' }, { id: 'orbits', name: 'Orbits' },
];

export interface BgPrefs { mode: BgMode; style: BgStyle | 'auto' }
const KEY = 'px:bg', SEED = 'px:bg-seed';
export function bgPrefs(): BgPrefs { try { return { mode: 'motion', style: 'auto', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }; } catch { return { mode: 'motion', style: 'auto' }; } }
export function setBgPrefs(p: Partial<BgPrefs>) { try { localStorage.setItem(KEY, JSON.stringify({ ...bgPrefs(), ...p })); } catch { /* ignore */ } window.dispatchEvent(new Event('px:bg')); }

/** A new seed each time the app is opened (kept for the whole visit). */
export function sessionSeed(): number {
  try {
    const cur = sessionStorage.getItem(SEED);
    if (cur) return Number(cur);
    const prev = Number(localStorage.getItem(SEED) ?? 0);
    let s = (Math.random() * 2 ** 31) | 0;
    if (styleFor(s) === styleFor(prev)) s = (s + 1) % 2 ** 31; // never the same style twice in a row
    sessionStorage.setItem(SEED, String(s)); localStorage.setItem(SEED, String(s));
    return s;
  } catch { return 7; }
}
export const styleFor = (seed: number): BgStyle => BG_STYLES[Math.abs(seed) % BG_STYLES.length].id;

export function rng(seed: number) {
  let a = seed >>> 0 || 1;
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// Smooth value noise (enough for flow fields and contours).
function noise2(seed: number) {
  const r = rng(seed), P = new Uint8Array(512), G = Array.from({ length: 256 }, () => r() * Math.PI * 2);
  const p = Array.from({ length: 256 }, (_, i) => i); for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) P[i] = p[i & 255];
  const g = (ix: number, iy: number, x: number, y: number) => { const a = G[P[(ix & 255) + P[iy & 255]]]; return Math.cos(a) * (x - ix) + Math.sin(a) * (y - iy); };
  const f = (t: number) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x: number, y: number) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), sx = f(x - x0), sy = f(y - y0);
    const a = g(x0, y0, x, y) + (g(x0 + 1, y0, x, y) - g(x0, y0, x, y)) * sx;
    const b = g(x0, y0 + 1, x, y) + (g(x0 + 1, y0 + 1, x, y) - g(x0, y0 + 1, x, y)) * sx;
    return a + (b - a) * sy; // about -0.7..0.7
  };
}

export interface Scene { draw(ctx: CanvasRenderingContext2D, t: number, dt: number): void; resize(w: number, h: number): void }
export interface Touch { x: number; y: number; on: boolean; v: number }

const EMBER = [255, 90, 31], AMBER = [255, 150, 90], ASH = [200, 192, 184];
// Ash lines are lifted more than the accent so the texture reads on a phone without fighting the content.
const rgba = (c: number[], a: number) => `rgba(${c[0]},${c[1]},${c[2]},${Math.min(1, a * (c === ASH ? 1.9 : 1.35))})`;

export function makeScene(style: BgStyle, seed: number, touch: Touch): Scene {
  const r = rng(seed), n = noise2(seed);
  const warm = r() < 0.5 ? EMBER : AMBER;
  let W = 1, H = 1;
  switch (style) {
    case 'embers': {
      const scale = 0.0016 + r() * 0.0012;
      let ps: { x: number; y: number; px: number; py: number; life: number; hot: boolean }[] = [];
      const spawn = () => ({ x: r() * W, y: r() * H, px: 0, py: 0, life: 200 + r() * 400, hot: r() < 0.18 });
      return {
        resize(w, h) { W = w; H = h; ps = Array.from({ length: Math.round((w * h) / 1500) }, spawn).map((p) => ({ ...p, px: p.x, py: p.y })); },
        draw(c, t, dt) {
          c.fillStyle = 'rgba(10,10,11,0.06)'; c.fillRect(0, 0, W, H);
          c.lineWidth = 1.4;
          for (const p of ps) {
            const a = n(p.x * scale, p.y * scale + t * 0.00004) * Math.PI * 3;
            let vx = Math.cos(a) * 0.9, vy = Math.sin(a) * 0.9 - 0.15;
            if (touch.on) { const dx = p.x - touch.x, dy = p.y - touch.y, d2 = dx * dx + dy * dy; if (d2 < 22000) { const k = (1 - d2 / 22000) * 4; vx += (dx / Math.sqrt(d2 + 1)) * k; vy += (dy / Math.sqrt(d2 + 1)) * k; } }
            p.px = p.x; p.py = p.y; p.x += vx * dt * 0.06; p.y += vy * dt * 0.06; p.life -= dt * 0.06;
            c.strokeStyle = p.hot ? rgba(warm, 0.55) : rgba(ASH, 0.14);
            c.beginPath(); c.moveTo(p.px, p.py); c.lineTo(p.x, p.y); c.stroke();
            if (p.life < 0 || p.x < -5 || p.x > W + 5 || p.y < -5 || p.y > H + 5) Object.assign(p, spawn(), { px: NaN });
            if (Number.isNaN(p.px)) { p.px = p.x; p.py = p.y; }
          }
        },
      };
    }
    case 'contours': {
      const scale = 0.0022 + r() * 0.0015, levels = 9 + ((r() * 5) | 0), step = 14;
      return {
        resize(w, h) { W = w; H = h; },
        draw(c, t) {
          c.fillStyle = '#0a0a0b'; c.fillRect(0, 0, W, H);
          const z = t * 0.00002, cols = Math.ceil(W / step) + 1, rows = Math.ceil(H / step) + 1;
          const v = new Float32Array(cols * rows);
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const x = i * step, y = j * step; let val = n(x * scale + z, y * scale - z);
            if (touch.on) { const d = Math.hypot(x - touch.x, y - touch.y); val += Math.max(0, 1 - d / 160) * 0.35 * Math.sin(d * 0.08 - t * 0.006); }
            v[j * cols + i] = val;
          }
          for (let L = 0; L < levels; L++) {
            const th = -0.55 + (1.1 * (L + 0.5)) / levels;
            c.strokeStyle = L === ((levels / 2) | 0) ? rgba(warm, 0.35) : rgba(ASH, 0.07 + (L % 3 === 0 ? 0.05 : 0));
            c.lineWidth = L % 3 === 0 ? 1.3 : 1; c.beginPath();
            for (let j = 0; j < rows - 1; j++) for (let i = 0; i < cols - 1; i++) {
              const a = v[j * cols + i], b = v[j * cols + i + 1], d = v[(j + 1) * cols + i], e = v[(j + 1) * cols + i + 1];
              const pts: [number, number][] = []; const x = i * step, y = j * step;
              const edge = (p: number, q: number, x1: number, y1: number, x2: number, y2: number) => { if ((p < th) !== (q < th)) { const k = (th - p) / (q - p); pts.push([x1 + (x2 - x1) * k, y1 + (y2 - y1) * k]); } };
              edge(a, b, x, y, x + step, y); edge(b, e, x + step, y, x + step, y + step); edge(d, e, x, y + step, x + step, y + step); edge(a, d, x, y, x, y + step);
              if (pts.length >= 2) { c.moveTo(pts[0][0], pts[0][1]); c.lineTo(pts[1][0], pts[1][1]); if (pts.length === 4) { c.moveTo(pts[2][0], pts[2][1]); c.lineTo(pts[3][0], pts[3][1]); } }
            }
            c.stroke();
          }
        },
      };
    }
    case 'constellation': {
      let ns: { x: number; y: number; vx: number; vy: number; hot: boolean }[] = [];
      const link = 110 + r() * 40;
      return {
        resize(w, h) { W = w; H = h; ns = Array.from({ length: Math.round((w * h) / 9000) }, () => ({ x: r() * w, y: r() * h, vx: (r() - 0.5) * 0.25, vy: (r() - 0.5) * 0.25, hot: r() < 0.12 })); },
        draw(c, _t, dt) {
          c.fillStyle = '#0a0a0b'; c.fillRect(0, 0, W, H);
          for (const p of ns) {
            if (touch.on) { const dx = touch.x - p.x, dy = touch.y - p.y, d = Math.hypot(dx, dy); if (d < 200 && d > 1) { p.vx += (dx / d) * 0.02; p.vy += (dy / d) * 0.02; } }
            p.vx *= 0.995; p.vy *= 0.995; p.x += p.vx * dt * 0.06; p.y += p.vy * dt * 0.06;
            if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1;
          }
          c.lineWidth = 1;
          for (let i = 0; i < ns.length; i++) for (let j = i + 1; j < ns.length; j++) {
            const a = ns[i], b = ns[j], d = Math.hypot(a.x - b.x, a.y - b.y);
            if (d < link) { c.strokeStyle = (a.hot || b.hot) ? rgba(warm, 0.28 * (1 - d / link)) : rgba(ASH, 0.12 * (1 - d / link)); c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke(); }
          }
          for (const p of ns) { c.fillStyle = p.hot ? rgba(warm, 0.8) : rgba(ASH, 0.35); c.beginPath(); c.arc(p.x, p.y, p.hot ? 2.2 : 1.4, 0, 7); c.fill(); }
        },
      };
    }
    case 'pulse': {
      const gap = 26 + ((r() * 10) | 0), ox = r() * W, waves: { x: number; y: number; t: number }[] = [];
      let lastWave = 0;
      return {
        resize(w, h) { W = w; H = h; },
        draw(c, t) {
          c.fillStyle = '#0a0a0b'; c.fillRect(0, 0, W, H);
          if (t - lastWave > 4200) { waves.push({ x: r() * W, y: r() * H, t }); lastWave = t; }
          if (touch.on && (!waves.length || t - waves[waves.length - 1].t > 260)) waves.push({ x: touch.x, y: touch.y, t });
          while (waves.length && t - waves[0].t > 5000) waves.shift();
          for (let y = gap / 2; y < H; y += gap) for (let x = ((ox % gap) + gap) % gap; x < W; x += gap) {
            let k = 0;
            for (const wv of waves) { const d = Math.hypot(x - wv.x, y - wv.y), rad = (t - wv.t) * 0.22; k = Math.max(k, Math.max(0, 1 - Math.abs(d - rad) / 40) * Math.max(0, 1 - (t - wv.t) / 5000)); }
            const base = 0.09 + (n(x * 0.004, y * 0.004 + t * 0.00003) + 0.7) * 0.06;
            c.fillStyle = k > 0.05 ? rgba(warm, 0.2 + k * 0.6) : rgba(ASH, base);
            c.beginPath(); c.arc(x, y, 1.6 + k * 2.6, 0, 7); c.fill();
          }
        },
      };
    }
    default: { // orbits
      const cx = 0.2 + r() * 0.6, cy = 0.15 + r() * 0.5, rings = 7 + ((r() * 5) | 0);
      const dots = Array.from({ length: rings * 3 }, (_, i) => ({ ring: i % rings, a: r() * Math.PI * 2, sp: (0.00006 + r() * 0.00012) * (r() < 0.5 ? -1 : 1), hot: r() < 0.25 }));
      let spin = 0;
      return {
        resize(w, h) { W = w; H = h; },
        draw(c, t, dt) {
          c.fillStyle = '#0a0a0b'; c.fillRect(0, 0, W, H);
          const X = W * cx, Y = H * cy, gapR = Math.max(W, H) / (rings + 2);
          if (touch.on) spin += touch.v * 0.00004 * dt; spin *= 0.97;
          c.lineWidth = 1;
          for (let i = 1; i <= rings; i++) { c.strokeStyle = rgba(ASH, i % 3 === 0 ? 0.1 : 0.06); c.beginPath(); c.arc(X, Y, i * gapR, 0, 7); c.stroke(); }
          for (const d of dots) {
            d.a += (d.sp + spin) * dt; const R = (d.ring + 1) * gapR;
            const x = X + Math.cos(d.a) * R, y = Y + Math.sin(d.a) * R;
            c.fillStyle = d.hot ? rgba(warm, 0.75) : rgba(ASH, 0.3); c.beginPath(); c.arc(x, y, d.hot ? 2.6 : 1.6, 0, 7); c.fill();
            if (d.hot) { c.strokeStyle = rgba(warm, 0.18); c.beginPath(); c.arc(X, Y, R, d.a - 0.5 * Math.sign(d.sp || 1), d.a, d.sp < 0); c.stroke(); }
          }
          void t;
        },
      };
    }
  }
}
