// Kids Zone: calm, musical physics games with a score and a saved best.
// Short rounds that end with "Play again" — never a fail screen. Sounds are
// soft notes from one pentatonic scale, so anything a child does sounds nice.
// Nothing leaves the phone: no ads, no links, no data.

export interface Pointer { x: number; y: number; id: number }
export interface Fx { note: (step: number, vol?: number) => void; buzz: (ms?: number | number[]) => void }
export interface RoundState { score: number; over: boolean; info: string }
export interface Game {
  resize(w: number, h: number): void;
  step(dt: number): void;
  draw(c: CanvasRenderingContext2D): void;
  down(p: Pointer): void;
  move(p: Pointer): void;
  up(p: Pointer): void;
  state(): RoundState;
}

const rand = (a: number, b: number) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;

// ── shared bits: floating "+10" labels and soft sparkles ────────────────────
interface Float { x: number; y: number; text: string; life: number; color: string }
interface Spark { x: number; y: number; vx: number; vy: number; life: number; color: string; r: number }
class Juice {
  floats: Float[] = []; sparks: Spark[] = [];
  plus(x: number, y: number, n: number, color = '#fff') { this.floats.push({ x, y, text: `+${n}`, life: 1, color }); }
  burst(x: number, y: number, color: string, n = 12, sp = 3) { for (let i = 0; i < n; i++) { const a = rand(0, TAU), s = rand(0.5, sp); this.sparks.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 1, color, r: rand(1.5, 4) }); } }
  step(dt: number) {
    for (const f of this.floats) { f.y -= 0.6 * dt; f.life -= 0.016 * dt; }
    for (const s of this.sparks) { s.vx *= 0.97; s.vy = s.vy * 0.97 + 0.03 * dt; s.x += s.vx * dt; s.y += s.vy * dt; s.life -= 0.022 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0); this.sparks = this.sparks.filter((s) => s.life > 0);
  }
  draw(c: CanvasRenderingContext2D) {
    c.globalCompositeOperation = 'lighter';
    for (const s of this.sparks) { c.globalAlpha = s.life; c.fillStyle = s.color; c.beginPath(); c.arc(s.x, s.y, s.r, 0, TAU); c.fill(); }
    c.globalCompositeOperation = 'source-over';
    c.textAlign = 'center'; c.font = '800 20px system-ui, sans-serif';
    for (const f of this.floats) { c.globalAlpha = Math.min(1, f.life * 1.6); c.fillStyle = f.color; c.fillText(f.text, f.x, f.y); }
    c.globalAlpha = 1;
  }
}
function glowOrb(c: CanvasRenderingContext2D, x: number, y: number, r: number, color: string, glow = 1) {
  c.save();
  c.shadowColor = color; c.shadowBlur = 18 * glow;
  const g = c.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, '#ffffff'); g.addColorStop(0.28, color); g.addColorStop(1, shade(color, -0.35));
  c.fillStyle = g; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill();
  c.restore();
}
function shade(hex: string, k: number) {
  const n = parseInt(hex.slice(1), 16); const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + (k < 0 ? v * k : (255 - v) * k))));
  return `rgb(${f(n >> 16)},${f((n >> 8) & 255)},${f(n & 255)})`;
}
function face(c: CanvasRenderingContext2D, x: number, y: number, r: number, sleepy = false) {
  if (r < 14) return;
  c.strokeStyle = 'rgba(20,16,50,0.75)'; c.fillStyle = 'rgba(20,16,50,0.75)'; c.lineWidth = Math.max(1.5, r * 0.07); c.lineCap = 'round';
  const ex = r * 0.3, ey = -r * 0.08, er = r * 0.09;
  if (sleepy) { c.beginPath(); c.arc(x - ex, y + ey, er, 0, Math.PI); c.stroke(); c.beginPath(); c.arc(x + ex, y + ey, er, 0, Math.PI); c.stroke(); }
  else { c.beginPath(); c.arc(x - ex, y + ey, er, 0, TAU); c.arc(x + ex, y + ey, er, 0, TAU); c.fill(); }
  c.beginPath(); c.arc(x, y + r * 0.12, r * 0.22, 0.15 * Math.PI, 0.85 * Math.PI); c.stroke();
}

// ── Moon Merge: drop moons in the jar; two the same size become one bigger ──
const MOONS = [
  { r: 14, color: '#7ad7ff' }, { r: 19, color: '#8affc1' }, { r: 25, color: '#ffe17a' }, { r: 32, color: '#ffa86b' },
  { r: 40, color: '#ff7aa8' }, { r: 49, color: '#c58aff' }, { r: 59, color: '#7a9bff' }, { r: 70, color: '#ffd23f' },
];
export function merge(fx: Fx): Game {
  let W = 1, H = 1, score = 0, over = false, aimX = 0, next = 0, cool = 0, overT = 0, wob = 0;
  const balls: { x: number; y: number; vx: number; vy: number; lv: number; born: number; id: number }[] = [];
  const j = new Juice(); let ids = 0, time = 0;
  const jar = () => ({ l: 18, r: W - 18, b: H - 16, top: 120 });
  const pickNext = () => (Math.random() * 4) | 0;
  const restart = () => { balls.length = 0; score = 0; over = false; next = pickNext(); overT = 0; };
  restart();
  return {
    resize(w, h) { W = w; H = h; if (!aimX) aimX = w / 2; },
    step(dt) {
      time += dt; cool -= dt; wob += dt; j.step(dt);
      if (over) return;
      const J = jar(), G = 0.28;
      for (const b of balls) { b.vy += G * dt; b.vx *= 0.995; b.x += b.vx * dt; b.y += b.vy * dt; }
      for (let it = 0; it < 6; it++) {
        for (const b of balls) {
          const r = MOONS[b.lv].r;
          if (b.y + r > J.b) { b.y = J.b - r; b.vy *= -0.2; b.vx *= 0.92; }
          if (b.x - r < J.l) { b.x = J.l + r; b.vx *= -0.3; }
          if (b.x + r > J.r) { b.x = J.r - r; b.vx *= -0.3; }
        }
        for (let i = 0; i < balls.length; i++) for (let k = i + 1; k < balls.length; k++) {
          const a = balls[i], b = balls[k]; const ra = MOONS[a.lv].r, rb = MOONS[b.lv].r;
          const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01, m = ra + rb;
          if (d >= m) continue;
          if (a.lv === b.lv && a.lv < MOONS.length - 1 && time - a.born > 8 && time - b.born > 8) {
            const lv = a.lv + 1, x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
            balls.splice(k, 1); balls.splice(i, 1);
            balls.push({ x, y, vx: 0, vy: -1.5, lv, born: time, id: ids++ });
            const pts = (lv + 1) * (lv + 1) * 5; score += pts;
            j.plus(x, y - MOONS[lv].r, pts, MOONS[lv].color); j.burst(x, y, MOONS[lv].color, 10 + lv * 3);
            fx.note(lv + 2, 0.9); fx.buzz(lv > 4 ? [15, 30, 15] : 12);
            if (lv === MOONS.length - 1) { fx.note(9); fx.note(11); }
            break;
          }
          const nx = dx / d, ny = dy / d, o = (m - d) / 2, wa = rb * rb / (ra * ra + rb * rb), wb = 1 - wa;
          a.x -= nx * o * 2 * wa; a.y -= ny * o * 2 * wa; b.x += nx * o * 2 * wb; b.y += ny * o * 2 * wb;
          const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
          if (rv < 0) { const imp = -rv * 0.6; a.vx -= nx * imp * wa; a.vy -= ny * imp * wa; b.vx += nx * imp * wb; b.vy += ny * imp * wb; }
        }
      }
      // Jar full: something resting above the line for a moment ends the round, gently.
      const high = balls.some((b) => time - b.born > 60 && b.y - MOONS[b.lv].r < J.top && Math.abs(b.vy) < 0.6);
      overT = high ? overT + dt : 0;
      if (overT > 90) { over = true; fx.note(4); fx.note(6); }
    },
    draw(c) {
      const J = jar();
      c.strokeStyle = 'rgba(255,255,255,0.18)'; c.lineWidth = 3;
      c.beginPath(); c.moveTo(J.l, J.top - 20); c.lineTo(J.l, J.b); c.lineTo(J.r, J.b); c.lineTo(J.r, J.top - 20); c.stroke();
      c.setLineDash([6, 8]); c.strokeStyle = overT > 0 ? `rgba(255,120,120,${0.4 + 0.4 * Math.sin(wob * 0.2)})` : 'rgba(255,255,255,0.15)';
      c.beginPath(); c.moveTo(J.l, J.top); c.lineTo(J.r, J.top); c.stroke(); c.setLineDash([]);
      for (const b of balls) { const m = MOONS[b.lv]; glowOrb(c, b.x, b.y, m.r, m.color, 0.6); face(c, b.x, b.y, m.r, b.lv % 2 === 1); }
      if (!over) {
        const m = MOONS[next], x = Math.max(J.l + m.r, Math.min(J.r - m.r, aimX));
        c.strokeStyle = 'rgba(255,255,255,0.12)'; c.setLineDash([2, 8]); c.beginPath(); c.moveTo(x, 70); c.lineTo(x, J.b); c.stroke(); c.setLineDash([]);
        glowOrb(c, x, 70, m.r, m.color, cool > 0 ? 0.3 : 1); face(c, x, 70, m.r);
      }
      j.draw(c);
    },
    down(p) { if (over) { restart(); return; } aimX = p.x; },
    move(p) { aimX = p.x; },
    up(p) {
      if (over || cool > 0) return;
      const J = jar(), m = MOONS[next];
      balls.push({ x: Math.max(J.l + m.r, Math.min(J.r - m.r, p.x)), y: 70, vx: 0, vy: 0, lv: next, born: time, id: ids++ });
      next = pickNext(); cool = 22; fx.note(0, 0.4); fx.buzz(6);
    },
    state: () => ({ score, over, info: over ? 'Jar full!' : 'Drop moons. Two the same size merge!' }),
  };
}

// ── Glow Plinko: drop orbs through musical pegs into the slots ─────────────
export function plinko(fx: Fx): Game {
  let W = 1, H = 1, score = 0, left = 10, over = false;
  let pegs: { x: number; y: number; row: number; lit: number }[] = [];
  let slots: { x0: number; x1: number; pts: number; lit: number }[] = [];
  const orbs: { x: number; y: number; vx: number; vy: number; color: string; done: boolean }[] = [];
  const j = new Juice(); const COLORS = ['#ffd23f', '#7ad7ff', '#ff7aa8', '#8affc1', '#c58aff'];
  const PTS = [50, 20, 10, 5, 10, 20, 50];
  const build = () => {
    pegs = []; const rows = 9, top = 130, bottom = H - 120, gap = (bottom - top) / rows, cols = 7, sx = W / (cols + 1);
    for (let r = 0; r < rows; r++) for (let k = 0; k < cols + (r % 2 ? 0 : 1); k++) { const x = (r % 2 ? sx : sx / 2) + k * sx; if (x > 12 && x < W - 12) pegs.push({ x, y: top + r * gap, row: r, lit: 0 }); }
    const n = PTS.length, w = W / n; slots = PTS.map((pts, i) => ({ x0: i * w, x1: (i + 1) * w, pts, lit: 0 }));
  };
  return {
    resize(w, h) { W = w; H = h; build(); },
    step(dt) {
      j.step(dt);
      for (const p of pegs) p.lit = Math.max(0, p.lit - 0.04 * dt);
      for (const s of slots) s.lit = Math.max(0, s.lit - 0.02 * dt);
      for (const o of orbs) {
        if (o.done) continue;
        o.vy += 0.18 * dt; o.vx *= 0.995; o.x += o.vx * dt; o.y += o.vy * dt;
        if (o.x < 10) { o.x = 10; o.vx = Math.abs(o.vx) * 0.6; } if (o.x > W - 10) { o.x = W - 10; o.vx = -Math.abs(o.vx) * 0.6; }
        for (const p of pegs) {
          const dx = o.x - p.x, dy = o.y - p.y, d = Math.hypot(dx, dy), m = 10 + 5;
          if (d < m && d > 0) {
            const nx = dx / d, ny = dy / d; o.x = p.x + nx * m; o.y = p.y + ny * m;
            const vn = o.vx * nx + o.vy * ny; if (vn < 0) { o.vx -= 1.55 * vn * nx; o.vy -= 1.55 * vn * ny; o.vx += rand(-0.25, 0.25); }
            if (p.lit < 0.5) { fx.note(8 - p.row, 0.35); } p.lit = 1;
          }
        }
        if (o.y > H - 70) {
          o.done = true; const s = slots.find((q) => o.x >= q.x0 && o.x < q.x1) ?? slots[3];
          s.lit = 1; score += s.pts; j.plus((s.x0 + s.x1) / 2, H - 90, s.pts, o.color); j.burst(o.x, H - 70, o.color, s.pts >= 50 ? 26 : 12, s.pts >= 50 ? 4 : 2.5);
          fx.note(s.pts >= 50 ? 12 : s.pts >= 20 ? 9 : 6); fx.buzz(s.pts >= 50 ? [20, 30, 20] : 10);
        }
      }
      for (let i = orbs.length - 1; i >= 0; i--) if (orbs[i].done) orbs.splice(i, 1);
      if (left === 0 && !orbs.length && !over) over = true;
    },
    draw(c) {
      for (const p of pegs) { c.fillStyle = p.lit > 0 ? `rgba(255,255,255,${0.4 + p.lit * 0.6})` : 'rgba(255,255,255,0.35)'; c.shadowColor = '#fff'; c.shadowBlur = p.lit * 16; c.beginPath(); c.arc(p.x, p.y, 5 + p.lit * 2, 0, TAU); c.fill(); }
      c.shadowBlur = 0;
      for (const s of slots) {
        const hot = s.pts >= 50 ? '#ffd23f' : s.pts >= 20 ? '#ff7aa8' : s.pts >= 10 ? '#7ad7ff' : '#8affc1';
        c.fillStyle = s.lit > 0 ? hot : 'rgba(255,255,255,0.07)'; c.globalAlpha = s.lit > 0 ? 0.35 + s.lit * 0.5 : 1;
        c.fillRect(s.x0 + 3, H - 70, s.x1 - s.x0 - 6, 54); c.globalAlpha = 1;
        c.fillStyle = hot; c.font = '800 16px system-ui'; c.textAlign = 'center'; c.fillText(String(s.pts), (s.x0 + s.x1) / 2, H - 36);
      }
      for (const o of orbs) glowOrb(c, o.x, o.y, 10, o.color);
      if (!over && left > 0) { c.fillStyle = 'rgba(255,255,255,0.55)'; c.font = '700 15px system-ui'; c.textAlign = 'center'; c.fillText('Tap up here to drop an orb', W / 2, 96); }
      j.draw(c);
    },
    down(p) {
      if (over) { score = 0; left = 10; over = false; return; }
      if (left <= 0) return;
      orbs.push({ x: Math.max(14, Math.min(W - 14, p.x)) + rand(-0.5, 0.5), y: 60, vx: 0, vy: 0, color: COLORS[left % COLORS.length], done: false });
      left--; fx.note(10, 0.3); fx.buzz(6);
    },
    move() {}, up() {},
    state: () => ({ score, over, info: over ? 'All orbs dropped!' : `${left} orb${left === 1 ? '' : 's'} left` }),
  };
}

// ── Bubble Float: 60 seconds; big bubbles split, pops play a melody ────────
export function bubbles(fx: Fx): Game {
  let W = 1, H = 1, score = 0, t = 0, next = 0, over = false, streak = 0, lastPop = -99, note = 0;
  const bs: { x: number; y: number; r: number; vx: number; vy: number; ph: number; color: string }[] = [];
  const j = new Juice(); const COLORS = ['#7ad7ff', '#8affc1', '#ffe17a', '#ff7aa8', '#c58aff'];
  const ROUND = 60 * 60;
  const add = (x = rand(40, W - 40), y = H + 50, r = rand(28, 50), vx = 0) => bs.push({ x, y, r, vx, vy: rand(0.5, 1.1), ph: rand(0, 6), color: COLORS[(Math.random() * COLORS.length) | 0] });
  return {
    resize(w, h) { W = w; H = h; },
    step(dt) {
      j.step(dt); if (over) return;
      t += dt; next -= dt; if (t >= ROUND) { over = true; fx.note(4); fx.note(7); return; }
      if (next <= 0 && bs.length < 12) { add(); next = rand(22, 42); }
      for (const b of bs) { b.y -= b.vy * dt; b.x += (Math.sin(t * 0.02 + b.ph) * 0.35 + b.vx) * dt; b.vx *= 0.97; }
      for (let i = bs.length - 1; i >= 0; i--) if (bs[i].y < -70) bs.splice(i, 1);
      if (t - lastPop > 90) streak = 0;
    },
    draw(c) {
      for (const b of bs) {
        c.save(); c.globalAlpha = 0.9;
        const g = c.createRadialGradient(b.x - b.r * 0.35, b.y - b.r * 0.35, b.r * 0.05, b.x, b.y, b.r);
        g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(0.3, b.color + '66'); g.addColorStop(0.92, b.color + '33'); g.addColorStop(1, b.color + 'cc');
        c.fillStyle = g; c.beginPath(); c.arc(b.x, b.y, b.r, 0, TAU); c.fill();
        c.strokeStyle = 'rgba(255,255,255,0.5)'; c.lineWidth = 1.5; c.stroke(); c.restore();
      }
      const left = Math.max(0, Math.ceil((ROUND - t) / 60));
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '700 14px system-ui'; c.textAlign = 'center'; c.fillText(over ? '' : `${left}s`, W / 2, 26);
      if (streak >= 3) { c.fillStyle = '#ffd23f'; c.font = '800 18px system-ui'; c.fillText(`Streak ×${Math.min(5, 1 + Math.floor(streak / 3))}`, W / 2, 50); }
      j.draw(c);
    },
    down(p) {
      if (over) { score = 0; t = 0; over = false; bs.length = 0; streak = 0; return; }
      for (let i = bs.length - 1; i >= 0; i--) {
        const b = bs[i]; if (Math.hypot(p.x - b.x, p.y - b.y) > b.r + 12) continue;
        bs.splice(i, 1); streak++; lastPop = t;
        const mult = Math.min(5, 1 + Math.floor(streak / 3)), pts = (b.r < 20 ? 3 : b.r < 32 ? 2 : 1) * mult;
        score += pts; j.plus(b.x, b.y - b.r, pts, b.color); j.burst(b.x, b.y, b.color, 10);
        fx.note([0, 2, 4, 5, 7, 9, 7, 5, 4, 2][note++ % 10] + (b.r < 20 ? 7 : 0), 0.7); fx.buzz(10);
        if (b.r > 22) { const r = b.r * 0.62; add(b.x - r * 0.6, b.y, r, -1.4); add(b.x + r * 0.6, b.y, r, 1.4); bs[bs.length - 1].vy = bs[bs.length - 2].vy = 1.1; }
        return;
      }
    },
    move() {}, up() {},
    state: () => ({ score, over, info: over ? 'Time!' : 'Pop! Big bubbles split in two' }),
  };
}

// ── Star Catch: 60 seconds; slide the basket, streaks multiply ─────────────
export function catcher(fx: Fx): Game {
  let W = 1, H = 1, score = 0, bx = 0, tx = 0, next = 0, t = 0, over = false, streak = 0;
  const items: { x: number; y: number; vy: number; rot: number; color: string; gold: boolean }[] = [];
  const j = new Juice(); const COLORS = ['#7ad7ff', '#8affc1', '#ff7aa8', '#c58aff'];
  const ROUND = 60 * 60;
  const star = (c: CanvasRenderingContext2D, x: number, y: number, r: number, rot: number) => { c.beginPath(); for (let i = 0; i < 10; i++) { const a = rot + (i * Math.PI) / 5 - Math.PI / 2, rr = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } c.closePath(); };
  return {
    resize(w, h) { W = w; H = h; if (!bx) bx = tx = w / 2; },
    step(dt) {
      j.step(dt); if (over) return;
      t += dt; next -= dt; if (t >= ROUND) { over = true; fx.note(4); fx.note(7); return; }
      if (next <= 0) { const gold = Math.random() < 0.1; items.push({ x: rand(30, W - 30), y: -20, vy: rand(1.3, 2.3) + t / ROUND, rot: rand(0, 6), color: gold ? '#ffd23f' : COLORS[(Math.random() * 4) | 0], gold }); next = rand(26, 46); }
      bx += (tx - bx) * Math.min(1, 0.22 * dt);
      const by = H - 80;
      for (let i = items.length - 1; i >= 0; i--) {
        const it = items[i]; it.y += it.vy * dt; it.rot += 0.03 * dt;
        if (it.y > by - 12 && it.y < by + 22 && Math.abs(it.x - bx) < 58) {
          items.splice(i, 1); streak++;
          const mult = Math.min(5, 1 + Math.floor(streak / 4)), pts = (it.gold ? 5 : 1) * mult; score += pts;
          j.plus(it.x, by - 20, pts, it.color); j.burst(it.x, by, it.color, it.gold ? 22 : 10);
          fx.note((streak % 8) + (it.gold ? 5 : 0), 0.7); fx.buzz(it.gold ? [15, 25, 15] : 10); continue;
        }
        if (it.y > H + 30) { items.splice(i, 1); streak = 0; }
      }
    },
    draw(c) {
      for (const it of items) { c.save(); c.shadowColor = it.color; c.shadowBlur = it.gold ? 22 : 12; c.fillStyle = it.color; star(c, it.x, it.y, it.gold ? 22 : 17, it.rot); c.fill(); c.restore(); }
      const by = H - 80;
      c.save(); c.shadowColor = '#ffd23f'; c.shadowBlur = streak >= 4 ? 18 : 0;
      c.fillStyle = '#5b4fd6'; c.beginPath(); c.moveTo(bx - 60, by); c.lineTo(bx + 60, by); c.lineTo(bx + 44, by + 42); c.lineTo(bx - 44, by + 42); c.closePath(); c.fill(); c.restore();
      c.fillStyle = '#8f85ff'; c.fillRect(bx - 64, by - 6, 128, 9);
      const left = Math.max(0, Math.ceil((ROUND - t) / 60));
      c.fillStyle = 'rgba(255,255,255,0.5)'; c.font = '700 14px system-ui'; c.textAlign = 'center'; c.fillText(over ? '' : `${left}s`, W / 2, 26);
      if (streak >= 4) { c.fillStyle = '#ffd23f'; c.font = '800 18px system-ui'; c.fillText(`Streak ×${Math.min(5, 1 + Math.floor(streak / 4))}`, W / 2, 50); }
      j.draw(c);
    },
    down(p) { if (over) { score = 0; t = 0; over = false; items.length = 0; streak = 0; return; } tx = p.x; },
    move(p) { tx = p.x; }, up() {},
    state: () => ({ score, over, info: over ? 'Time!' : 'Slide the basket. Catch them in a row!' }),
  };
}

export const GAMES = [
  { id: 'merge', name: 'Moon Merge', emoji: '🌙', make: merge },
  { id: 'plinko', name: 'Glow Plinko', emoji: '✨', make: plinko },
  { id: 'bubbles', name: 'Bubble Float', emoji: '🫧', make: bubbles },
  { id: 'catch', name: 'Star Catch', emoji: '⭐', make: catcher },
] as const;
export type GameId = (typeof GAMES)[number]['id'];
