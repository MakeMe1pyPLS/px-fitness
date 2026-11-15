// Kids Zone physics games. Each game is a small world: step(dt), draw(ctx),
// and pointer handlers. Simple, forgiving physics; no scores to lose, no ads,
// no links, nothing leaves the phone.

export interface Pointer { x: number; y: number; id: number }
export interface Game {
  resize(w: number, h: number): void;
  step(dt: number): void;
  draw(c: CanvasRenderingContext2D): void;
  down(p: Pointer): void;
  move(p: Pointer): void;
  up(p: Pointer): void;
  score(): number;
}
export type Fx = { pop: (pitch?: number) => void; buzz: (ms?: number | number[]) => void };

export const KID_COLORS = ['#ff5a5f', '#ffb400', '#3ec300', '#00a6ed', '#7a5cff', '#ff7ac6', '#ff8a00', '#2ad4c5'];
const pick = <T,>(a: T[]) => a[(Math.random() * a.length) | 0];
const rand = (a: number, b: number) => a + Math.random() * (b - a);

interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
function sparks(list: Spark[], x: number, y: number, color: string, n = 14, speed = 4) {
  for (let i = 0; i < n; i++) { const a = rand(0, Math.PI * 2), s = rand(1, speed); list.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 1, life: 1, color, r: rand(2, 5) }); }
}
function stepSparks(list: Spark[], dt: number, g = 0.12) {
  for (const s of list) { s.vy += g * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= 0.02 * dt; }
  for (let i = list.length - 1; i >= 0; i--) if (list[i].life <= 0) list.splice(i, 1);
}
function drawSparks(c: CanvasRenderingContext2D, list: Spark[]) {
  for (const s of list) { c.globalAlpha = Math.max(0, s.life); c.fillStyle = s.color; c.beginPath(); c.arc(s.x, s.y, s.r * (0.5 + s.life / 2), 0, 7); c.fill(); }
  c.globalAlpha = 1;
}
function star(c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) {
  c.beginPath();
  for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  c.closePath();
}

// ── Bubbles: pop the bubbles as they float up ───────────────────────────────
export function bubbles(fx: Fx): Game {
  let W = 1, H = 1, popped = 0, t = 0, next = 0;
  const bs: { x: number; y: number; r: number; vy: number; ph: number; color: string; gold: boolean }[] = [];
  const sp: Spark[] = [];
  const add = () => { const gold = Math.random() < 0.08; bs.push({ x: rand(30, W - 30), y: H + 40, r: gold ? 34 : rand(22, 44), vy: rand(0.6, 1.4), ph: rand(0, 6), color: gold ? '#ffd23f' : pick(KID_COLORS), gold }); };
  return {
    resize(w, h) { W = w; H = h; },
    step(dt) {
      t += dt; next -= dt; if (next <= 0 && bs.length < 14) { add(); next = rand(18, 40); }
      for (const b of bs) { b.y -= b.vy * dt; b.x += Math.sin(t * 0.03 + b.ph) * 0.4 * dt; }
      for (let i = bs.length - 1; i >= 0; i--) if (bs[i].y < -60) bs.splice(i, 1);
      stepSparks(sp, dt);
    },
    draw(c) {
      for (const b of bs) {
        const g = c.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.4, b.r * 0.1, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(255,255,255,0.95)'); g.addColorStop(0.25, b.color + 'cc'); g.addColorStop(1, b.color + '55');
        c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.6)'; c.lineWidth = 2; c.stroke();
        if (b.gold) { c.fillStyle = '#fff'; star(c, b.x, b.y, b.r * 0.5, t * 0.02); c.fill(); }
      }
      drawSparks(c, sp);
    },
    down(p) {
      for (let i = bs.length - 1; i >= 0; i--) { const b = bs[i]; if (Math.hypot(p.x - b.x, p.y - b.y) < b.r + 14) {
        bs.splice(i, 1); popped += b.gold ? 5 : 1; sparks(sp, b.x, b.y, b.color, b.gold ? 30 : 14); fx.pop(b.gold ? 1.6 : 0.7 + (44 - b.r) / 30); fx.buzz(b.gold ? [20, 30, 20] : 12); return; } }
    },
    move() {}, up() {}, score: () => popped,
  };
}

// ── Bounce: tap to drop balls, drag and fling them ─────────────────────────
export function bounce(fx: Fx): Game {
  let W = 1, H = 1, made = 0;
  const balls: { x: number; y: number; vx: number; vy: number; r: number; color: string; face: number }[] = [];
  const grab = new Map<number, { i: number; lx: number; ly: number; vx: number; vy: number }>();
  const G = 0.35;
  return {
    resize(w, h) { W = w; H = h; },
    step(dt) {
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i]; if ([...grab.values()].some((g) => g.i === i)) continue;
        b.vy += G * dt; b.vx *= 0.999; b.x += b.vx * dt; b.y += b.vy * dt;
        if (b.y + b.r > H) { b.y = H - b.r; if (Math.abs(b.vy) > 3) fx.pop(0.5 + 30 / b.r / 3); b.vy *= -0.72; b.vx *= 0.96; }
        if (b.y - b.r < 0) { b.y = b.r; b.vy *= -0.7; }
        if (b.x - b.r < 0) { b.x = b.r; b.vx *= -0.8; }
        if (b.x + b.r > W) { b.x = W - b.r; b.vx *= -0.8; }
      }
      for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) {
        const a = balls[i], b = balls[j], dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), m = a.r + b.r;
        if (d > 0 && d < m) {
          const nx = dx / d, ny = dy / d, o = (m - d) / 2; a.x -= nx * o; a.y -= ny * o; b.x += nx * o; b.y += ny * o;
          const ma = a.r * a.r, mb = b.r * b.r, rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) { const imp = (-1.8 * rv) / (1 / ma + 1 / mb); a.vx -= (imp / ma) * nx; a.vy -= (imp / ma) * ny; b.vx += (imp / mb) * nx; b.vy += (imp / mb) * ny; }
        }
      }
    },
    draw(c) {
      for (const b of balls) {
        c.fillStyle = b.color; c.beginPath(); c.arc(b.x, b.y, b.r, 0, 7); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.arc(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.3, 0, 7); c.fill();
        // happy face
        c.fillStyle = '#1b1b1b'; const e = b.r * 0.12;
        c.beginPath(); c.arc(b.x - b.r * 0.3, b.y - b.r * 0.05, e, 0, 7); c.arc(b.x + b.r * 0.3, b.y - b.r * 0.05, e, 0, 7); c.fill();
        c.strokeStyle = '#1b1b1b'; c.lineWidth = Math.max(2, b.r * 0.08); c.beginPath(); c.arc(b.x, b.y + b.r * 0.1, b.r * 0.35, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
      }
      if (!balls.length) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '700 22px system-ui'; c.textAlign = 'center'; c.fillText('Tap to drop a ball!', W / 2, H / 2); }
    },
    down(p) {
      const i = balls.findIndex((b) => Math.hypot(p.x - b.x, p.y - b.y) < b.r + 10);
      if (i >= 0) { grab.set(p.id, { i, lx: p.x, ly: p.y, vx: 0, vy: 0 }); fx.buzz(8); return; }
      if (balls.length >= 24) balls.shift();
      balls.push({ x: p.x, y: p.y, vx: rand(-2, 2), vy: 0, r: rand(20, 42), color: pick(KID_COLORS), face: 0 }); made++; fx.pop(1.2); fx.buzz(10);
    },
    move(p) { const g = grab.get(p.id); if (!g) return; const b = balls[g.i]; if (!b) return; g.vx = p.x - g.lx; g.vy = p.y - g.ly; g.lx = p.x; g.ly = p.y; b.x = p.x; b.y = p.y; b.vx = 0; b.vy = 0; },
    up(p) { const g = grab.get(p.id); if (!g) return; const b = balls[g.i]; if (b) { b.vx = g.vx * 0.9; b.vy = g.vy * 0.9; } grab.delete(p.id); },
    score: () => made,
  };
}

// ── Catch: slide the basket to catch falling stars ─────────────────────────
export function catcher(fx: Fx): Game {
  let W = 1, H = 1, caught = 0, bx = 0, tx = 0, next = 0, t = 0;
  const items: { x: number; y: number; vy: number; rot: number; color: string; kind: 'star' | 'heart' | 'gem' }[] = [];
  const sp: Spark[] = [];
  return {
    resize(w, h) { W = w; H = h; if (!bx) bx = tx = w / 2; },
    step(dt) {
      t += dt; next -= dt;
      if (next <= 0) { items.push({ x: rand(30, W - 30), y: -30, vy: rand(1.6, 3) + Math.min(2, caught / 25), rot: rand(0, 6), color: pick(KID_COLORS), kind: pick(['star', 'star', 'heart', 'gem'] as const) }); next = rand(28, 55); }
      bx += (tx - bx) * Math.min(1, 0.25 * dt);
      const by = H - 70;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.y += it.vy * dt; it.rot += 0.05 * dt;
        if (it.y > by - 10 && it.y < by + 25 && Math.abs(it.x - bx) < 60) { items.splice(i, 1); caught++; sparks(sp, it.x, by, it.color, 16); fx.pop(1 + (caught % 5) * 0.12); fx.buzz(14); continue; }
        if (it.y > H + 40) items.splice(i, 1); // missed: no penalty
      }
      stepSparks(sp, dt);
    },
    draw(c) {
      for (const it of items) {
        c.fillStyle = it.color;
        if (it.kind === 'star') { star(c, it.x, it.y, 20, it.rot); c.fill(); }
        else if (it.kind === 'heart') { c.save(); c.translate(it.x, it.y); c.rotate(Math.sin(it.rot) * 0.3); c.beginPath(); c.moveTo(0, 8); c.bezierCurveTo(-24, -8, -10, -24, 0, -10); c.bezierCurveTo(10, -24, 24, -8, 0, 8); c.fill(); c.restore(); }
        else { c.save(); c.translate(it.x, it.y); c.rotate(it.rot); c.beginPath(); c.moveTo(0, -18); c.lineTo(14, 0); c.lineTo(0, 18); c.lineTo(-14, 0); c.closePath(); c.fill(); c.restore(); }
      }
      const by = H - 70;
      c.fillStyle = '#c67b3c'; c.beginPath(); c.moveTo(bx - 62, by); c.lineTo(bx + 62, by); c.lineTo(bx + 48, by + 44); c.lineTo(bx - 48, by + 44); c.closePath(); c.fill();
      c.strokeStyle = '#8d5222'; c.lineWidth = 3; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(bx + k * 22, by + 2); c.lineTo(bx + k * 17, by + 42); c.stroke(); }
      c.fillStyle = '#e8a467'; c.fillRect(bx - 66, by - 6, 132, 10);
      drawSparks(c, sp);
    },
    down(p) { tx = p.x; }, move(p) { tx = p.x; }, up() {},
    score: () => caught,
  };
}

// ── Sparkle paint: draw with light, then it all rains down and bounces ─────
export function sparkle(fx: Fx): Game {
  let W = 1, H = 1, made = 0, hue = 0;
  const dots: (Spark & { settled?: boolean })[] = [];
  const last = new Map<number, Pointer>();
  const emit = (x: number, y: number) => { hue = (hue + 4) % 360; for (let i = 0; i < 3; i++) dots.push({ x: x + rand(-4, 4), y: y + rand(-4, 4), vx: rand(-0.6, 0.6), vy: rand(-0.8, 0.2), life: 1, color: `hsl(${hue},95%,62%)`, r: rand(3, 6) }); made++; if (dots.length > 1400) dots.splice(0, dots.length - 1400); };
  return {
    resize(w, h) { W = w; H = h; },
    step(dt) {
      for (const d of dots) {
        d.vy += 0.08 * dt; d.x += d.vx * dt; d.y += d.vy * dt;
        if (d.y + d.r > H) { d.y = H - d.r; d.vy *= -0.45; d.vx *= 0.9; }
        if (d.x < d.r || d.x > W - d.r) d.vx *= -1;
        d.life -= 0.0016 * dt;
      }
      for (let i = dots.length - 1; i >= 0; i--) if (dots[i].life <= 0) dots.splice(i, 1);
    },
    draw(c) {
      c.globalCompositeOperation = 'lighter';
      for (const d of dots) { c.globalAlpha = Math.max(0, Math.min(1, d.life * 1.5)); c.fillStyle = d.color; c.beginPath(); c.arc(d.x, d.y, d.r, 0, 7); c.fill(); }
      c.globalAlpha = 1; c.globalCompositeOperation = 'source-over';
      if (!dots.length) { c.fillStyle = 'rgba(255,255,255,0.8)'; c.font = '700 22px system-ui'; c.textAlign = 'center'; c.fillText('Draw with your finger!', W / 2, H / 2); }
    },
    down(p) { last.set(p.id, p); emit(p.x, p.y); fx.buzz(6); },
    move(p) {
      const l = last.get(p.id); if (!l) return;
      const d = Math.hypot(p.x - l.x, p.y - l.y), n = Math.max(1, Math.floor(d / 6));
      for (let i = 1; i <= n; i++) emit(l.x + ((p.x - l.x) * i) / n, l.y + ((p.y - l.y) * i) / n);
      if (Math.random() < 0.08) fx.pop(0.8 + Math.random());
      last.set(p.id, p);
    },
    up(p) { last.delete(p.id); },
    score: () => made,
  };
}

export const GAMES = [
  { id: 'bubbles', name: 'Bubble Pop', emoji: '🫧', make: bubbles, unit: 'popped' },
  { id: 'bounce', name: 'Bouncy Balls', emoji: '🏀', make: bounce, unit: 'balls' },
  { id: 'catch', name: 'Star Catch', emoji: '⭐', make: catcher, unit: 'caught' },
  { id: 'sparkle', name: 'Sparkle Paint', emoji: '✨', make: sparkle, unit: '' },
] as const;
export type GameId = (typeof GAMES)[number]['id'];
