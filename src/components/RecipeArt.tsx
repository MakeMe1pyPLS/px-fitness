// Illustrated recipe covers. Each dish is drawn from its real ingredients (see lib/foods.ts)
// in one consistent PX style: top-down on a warm dark table, ember glow.
// They are illustrations, not photos; swap in real photos later by adding `photo` to a recipe.
import React, { useId } from 'react';

type El = React.ReactElement;
const W = 320, H = 200, CX = 160, CY = 102;

// ── deterministic randomness so every render looks the same ────────────────
function rng(seed: string) {
  let h = 1779033703 ^ seed.length;
  for (let i = 0; i < seed.length; i++) { h = Math.imul(h ^ seed.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  return () => { h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
}
type R = () => number;
/** Random point inside a circle, optionally limited to an angle sector (degrees). */
function pt(r: R, cx: number, cy: number, rad: number, a0 = 0, a1 = 360): [number, number] {
  const a = ((a0 + r() * (a1 - a0)) * Math.PI) / 180;
  const d = Math.sqrt(r()) * rad;
  return [cx + Math.cos(a) * d, cy + Math.sin(a) * d];
}
const wedge = (cx: number, cy: number, rad: number, a0: number, a1: number) => {
  const p = (a: number) => [cx + Math.cos((a * Math.PI) / 180) * rad, cy + Math.sin((a * Math.PI) / 180) * rad];
  const [x0, y0] = p(a0), [x1, y1] = p(a1);
  return `M${cx},${cy} L${x0},${y0} A${rad},${rad} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1},${y1} Z`;
};

// ── ingredient glyphs ──────────────────────────────────────────────────────
const C = {
  rice: '#f4efe4', riceShade: '#ddd5c4', broc: '#3f8a3a', brocLight: '#5fae4c', chicken: '#d99a5b', chickenDark: '#9b5a2b',
  bean: '#2a1b1a', yolk: '#f5b41a', white: '#fbf8f1', potato: '#e5b25a', potatoDark: '#b9832f', banana: '#f3e2a2',
  pb: '#a8662c', oats: '#d9c39a', oatsFleck: '#b89b6a', blue: '#3b3f8f', rasp: '#c2304a', yogurt: '#f7f4ee',
  sauce: '#b8382a', sauceLight: '#d4513c', pasta: '#efc76a', pastaDark: '#d5a944', tuna: '#d9b8a0', tofu: '#f1e2bf',
  tofuCrisp: '#c98b3c', spinach: '#2f7a33', chickpea: '#dfc184', beef: '#6b3a24', beefLight: '#86502f', cheese: '#f2a93b',
  pea: '#7cb342', corn: '#f6c945', carrot: '#ef8a2c', onion: '#efe6f2', curry: '#d9852b', curryLight: '#e9a246', lentil: '#b5652a',
  chili: '#8a2a1c', bread: '#f0cf93', crust: '#b8742f', tortilla: '#e4c58f', tortillaDark: '#c9a265', soy: '#5a3418',
};

const grains = (r: R, cx: number, cy: number, rad: number, n: number, a0 = 0, a1 = 360, fill = C.rice): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad, a0, a1); return <ellipse key={`g${i}`} cx={x} cy={y} rx={2.8} ry={1.25} fill={i % 5 === 0 ? C.riceShade : fill} transform={`rotate(${r() * 180} ${x} ${y})`} />; });

const floret = (x: number, y: number, s: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-2 4 L2 4 L1.5 12 L-1.5 12 Z" fill="#8fbf62" />
    <circle cx={-5} cy={0} r={5.5} fill={C.broc} /><circle cx={5} cy={0} r={5.5} fill={C.broc} /><circle cx={0} cy={-5} r={6} fill={C.brocLight} />
    <circle cx={-2} cy={-7} r={1.4} fill="#7cc062" /><circle cx={3} cy={-3} r={1.2} fill="#7cc062" />
  </g>
);
const chickenSlice = (x: number, y: number, s: number, rot: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <rect x={-13} y={-6} width={26} height={12} rx={5} fill={C.chicken} />
    <path d="M-8 -5 L-4 5 M-1 -5 L3 5 M6 -5 L10 5" stroke={C.chickenDark} strokeWidth={1.6} strokeLinecap="round" opacity={0.75} />
  </g>
);
const bean = (x: number, y: number, rot: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rot})`}><ellipse rx={4.2} ry={2.6} fill={C.bean} /><ellipse cx={-1.2} cy={-0.8} rx={1.4} ry={0.6} fill="#5a4440" /></g>
);
const friedEgg = (x: number, y: number, s: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M-16 -2 C-17 -12 -6 -17 3 -14 C13 -12 18 -4 16 4 C14 13 2 16 -6 13 C-14 11 -15 6 -16 -2 Z" fill={C.white} />
    <circle cx={1} cy={0} r={6.5} fill={C.yolk} /><circle cx={-1} cy={-2} r={2} fill="#fbd36b" />
  </g>
);
const cube = (x: number, y: number, s: number, rot: number, fill: string, edge: string, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <rect x={-6} y={-6} width={12} height={12} rx={3} fill={fill} /><path d="M-6 3 Q-6 6 -3 6 L3 6 Q6 6 6 3" fill="none" stroke={edge} strokeWidth={2} />
  </g>
);
const bananaSlice = (x: number, y: number, s: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
    <circle r={8} fill={C.banana} stroke="#e2cb7c" strokeWidth={1.2} /><circle r={3} fill="none" stroke="#d9c06c" strokeWidth={0.8} />
    {[0, 72, 144, 216, 288].map((a) => <circle key={a} cx={Math.cos((a * Math.PI) / 180) * 3} cy={Math.sin((a * Math.PI) / 180) * 3} r={0.6} fill="#8a6d2c" />)}
  </g>
);
const pbSwirl = (x: number, y: number, s: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) scale(${s})`}>
    <path d="M0 0 C4 -2 7 2 5 6 C3 10 -5 10 -8 5 C-11 -1 -6 -9 2 -10 C10 -11 15 -3 13 5" fill="none" stroke={C.pb} strokeWidth={5} strokeLinecap="round" />
    <path d="M-6 3 C-7 -2 -3 -7 2 -8" fill="none" stroke="#c9884a" strokeWidth={1.5} strokeLinecap="round" opacity={0.8} />
  </g>
);
const berry = (x: number, y: number, kind: number, k: string): El =>
  kind === 0 ? <g key={k}><circle cx={x} cy={y} r={4.6} fill={C.blue} /><circle cx={x - 1.4} cy={y - 1.5} r={1.2} fill="#7076c4" /><circle cx={x + 0.8} cy={y + 0.6} r={0.9} fill="#22244f" /></g>
  : kind === 1 ? <g key={k}>{[[0, 0], [3, 1], [-3, 1], [0, 3.2], [1.6, -2.6], [-1.6, -2.6]].map(([dx, dy], i) => <circle key={i} cx={x + dx} cy={y + dy} r={2.3} fill={i % 2 ? C.rasp : '#d6455f'} />)}</g>
  : <g key={k}>{[[0, 0], [2.6, 1], [-2.6, 1], [0, 2.8], [1.3, -2.3], [-1.3, -2.3]].map(([dx, dy], i) => <circle key={i} cx={x + dx} cy={y + dy} r={2.1} fill={i % 2 ? '#2a1830' : '#43284f'} />)}</g>;
const leaf = (x: number, y: number, s: number, rot: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rot}) scale(${s})`}>
    <path d="M-12 0 C-6 -8 6 -8 12 0 C6 8 -6 8 -12 0 Z" fill={C.spinach} /><path d="M-11 0 L11 0" stroke="#5aa85a" strokeWidth={1} />
  </g>
);
const chickpea = (x: number, y: number, k: string): El => (
  <g key={k}><circle cx={x} cy={y} r={4.4} fill={C.chickpea} /><path d={`M${x - 1} ${y - 3.5} Q${x + 1.5} ${y} ${x - 0.5} ${y + 3.5}`} fill="none" stroke="#b9975b" strokeWidth={1} /></g>
);
const crumbles = (r: R, cx: number, cy: number, rad: number, n: number, a0: number, a1: number, k: string): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad, a0, a1); const s = 2.2 + r() * 2.4; return <path key={`${k}${i}`} d={`M${x - s} ${y} Q${x - s * 0.4} ${y - s} ${x + s * 0.6} ${y - s * 0.7} Q${x + s} ${y} ${x + s * 0.3} ${y + s * 0.8} Q${x - s * 0.6} ${y + s} ${x - s} ${y} Z`} fill={i % 3 ? C.beef : C.beefLight} />; });
const shreds = (r: R, cx: number, cy: number, rad: number, n: number, a0: number, a1: number, k: string): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad, a0, a1); const a = r() * Math.PI; return <line key={`${k}${i}`} x1={x} y1={y} x2={x + Math.cos(a) * 7} y2={y + Math.sin(a) * 7} stroke={i % 2 ? C.cheese : '#f7c262'} strokeWidth={2.2} strokeLinecap="round" />; });
const mixedVeg = (r: R, cx: number, cy: number, rad: number, n: number, a0: number, a1: number, k: string): El[] =>
  Array.from({ length: n }, (_, i) => {
    const [x, y] = pt(r, cx, cy, rad, a0, a1);
    const t = i % 3;
    return t === 0 ? <circle key={`${k}${i}`} cx={x} cy={y} r={2.7} fill={C.pea} />
      : t === 1 ? <rect key={`${k}${i}`} x={x - 2.4} y={y - 2.4} width={4.8} height={4.8} rx={1} fill={C.corn} transform={`rotate(${r() * 90} ${x} ${y})`} />
      : <rect key={`${k}${i}`} x={x - 2.8} y={y - 2.8} width={5.6} height={5.6} rx={1.2} fill={C.carrot} transform={`rotate(${r() * 90} ${x} ${y})`} />;
  });
const onionBits = (r: R, cx: number, cy: number, rad: number, n: number, a0: number, a1: number, k: string): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad, a0, a1); return <path key={`${k}${i}`} d={`M${x - 4} ${y} Q${x} ${y - 4} ${x + 4} ${y}`} fill="none" stroke={C.onion} strokeWidth={1.6} strokeLinecap="round" opacity={0.85} transform={`rotate(${r() * 180} ${x} ${y})`} />; });
const tunaFlakes = (r: R, cx: number, cy: number, rad: number, n: number, a0: number, a1: number, k: string): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad, a0, a1); const s = 3 + r() * 3; return <path key={`${k}${i}`} d={`M${x - s} ${y + 1} L${x - s * 0.3} ${y - s * 0.8} L${x + s} ${y - s * 0.3} L${x + s * 0.4} ${y + s * 0.8} Z`} fill={i % 2 ? C.tuna : '#e6cbb6'} stroke="#c4a088" strokeWidth={0.6} />; });
const salsa = (r: R, cx: number, cy: number, rad: number, n: number, a0: number, a1: number, k: string): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad, a0, a1); return <rect key={`${k}${i}`} x={x - 2.5} y={y - 2.5} width={5} height={5} rx={1} fill={i % 4 === 0 ? '#4f9a3a' : i % 4 === 1 ? '#f2efe2' : C.sauceLight} transform={`rotate(${r() * 90} ${x} ${y})`} />; });
const flecks = (r: R, cx: number, cy: number, rad: number, n: number, fill: string, k: string, size = 1.1): El[] =>
  Array.from({ length: n }, (_, i) => { const [x, y] = pt(r, cx, cy, rad); return <circle key={`${k}${i}`} cx={x} cy={y} r={size * (0.6 + r())} fill={fill} />; });
const spaghetti = (r: R, cx: number, cy: number, rad: number, k: string): El[] =>
  // A twirled nest: many partial loops around the middle.
  Array.from({ length: 30 }, (_, i) => {
    const ox = cx + (r() - 0.5) * rad * 0.5, oy = cy + (r() - 0.5) * rad * 0.5;
    const rr = rad * (0.25 + r() * 0.65);
    const a0 = r() * Math.PI * 2, sweep = Math.PI * (0.7 + r() * 1.1);
    const x0 = ox + Math.cos(a0) * rr, y0 = oy + Math.sin(a0) * rr;
    const x1 = ox + Math.cos(a0 + sweep) * rr, y1 = oy + Math.sin(a0 + sweep) * rr;
    return <path key={`${k}${i}`} d={`M${x0} ${y0} A${rr} ${rr * (0.85 + r() * 0.3)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x1} ${y1}`} fill="none" stroke={i % 3 ? C.pasta : C.pastaDark} strokeWidth={2.6} strokeLinecap="round" />;
  });
const drumstick = (x: number, y: number, rot: number, k: string): El => (
  <g key={k} transform={`translate(${x} ${y}) rotate(${rot})`}>
    <rect x={10} y={-2.5} width={14} height={5} rx={2.5} fill="#f1e6d3" /><circle cx={25} cy={-3} r={3} fill="#f1e6d3" /><circle cx={25} cy={3} r={3} fill="#f1e6d3" />
    <path d="M-16 0 C-16 -13 4 -15 12 -4 L12 4 C4 15 -16 13 -16 0 Z" fill="#b8652a" /><path d="M-11 -3 C-6 -9 2 -9 7 -4" fill="none" stroke="#d98a45" strokeWidth={2.5} strokeLinecap="round" />
    {[-8, -2, 4].map((d) => <circle key={d} cx={d} cy={3} r={0.9} fill="#5e2e12" />)}
  </g>
);

// ── vessels ────────────────────────────────────────────────────────────────
const Bowl = ({ id, children, base, rad = 70 }: { id: string; children: React.ReactNode; base: string; rad?: number }) => (
  <g>
    <ellipse cx={CX + 4} cy={CY + 8} rx={rad + 16} ry={rad + 12} fill="#000" opacity={0.45} filter={`url(#${id}-blur)`} />
    <circle cx={CX} cy={CY} r={rad + 12} fill="#2b2622" /><circle cx={CX} cy={CY} r={rad + 12} fill="none" stroke="#3d3631" strokeWidth={2} />
    <circle cx={CX} cy={CY} r={rad + 4} fill="#1b1714" />
    <clipPath id={`${id}-food`}><circle cx={CX} cy={CY} r={rad} /></clipPath>
    <g clipPath={`url(#${id}-food)`}><circle cx={CX} cy={CY} r={rad} fill={base} />{children}<circle cx={CX} cy={CY} r={rad} fill={`url(#${id}-inner)`} /></g>
  </g>
);
const Plate = ({ id, children, rad = 74 }: { id: string; children: React.ReactNode; rad?: number }) => (
  <g>
    <ellipse cx={CX + 4} cy={CY + 8} rx={rad + 18} ry={rad + 14} fill="#000" opacity={0.45} filter={`url(#${id}-blur)`} />
    <circle cx={CX} cy={CY} r={rad + 14} fill="#e9e2d6" /><circle cx={CX} cy={CY} r={rad + 1} fill="#f5f1e9" stroke="#ddd3c3" strokeWidth={2} />
    {children}
  </g>
);
const Skillet = ({ id, children, rad = 70 }: { id: string; children: React.ReactNode; rad?: number }) => (
  <g>
    <ellipse cx={CX + 4} cy={CY + 8} rx={rad + 30} ry={rad + 12} fill="#000" opacity={0.45} filter={`url(#${id}-blur)`} />
    <rect x={CX + rad + 4} y={CY - 7} width={70} height={14} rx={7} fill="#1a1a1a" stroke="#333" strokeWidth={1.5} />
    <circle cx={CX} cy={CY} r={rad + 10} fill="#222" stroke="#3a3a3a" strokeWidth={3} /><circle cx={CX} cy={CY} r={rad} fill="#2d2b29" />
    <clipPath id={`${id}-food`}><circle cx={CX} cy={CY} r={rad} /></clipPath><g clipPath={`url(#${id}-food)`}>{children}</g>
  </g>
);
const Tray = ({ id, children }: { id: string; children: React.ReactNode }) => (
  <g>
    <rect x={40} y={26} width={248} height={160} rx={16} fill="#000" opacity={0.45} filter={`url(#${id}-blur)`} />
    <rect x={34} y={18} width={252} height={164} rx={14} fill="#5b5f63" /><rect x={42} y={26} width={236} height={148} rx={10} fill="#3d4044" />
    <clipPath id={`${id}-food`}><rect x={42} y={26} width={236} height={148} rx={10} /></clipPath><g clipPath={`url(#${id}-food)`}>{children}</g>
  </g>
);

// ── one composition per recipe ─────────────────────────────────────────────
type Draw = (r: R, id: string) => El;
const DISHES: Record<string, Draw> = {
  'overnight-oats': (r, id) => (
    <Bowl id={id} base={C.oats}>
      {flecks(r, CX, CY, 68, 90, C.oatsFleck, 'of', 1.3)}
      {Array.from({ length: 7 }, (_, i) => { const a = (-150 + i * 26) * (Math.PI / 180); return bananaSlice(CX + Math.cos(a) * 42, CY + Math.sin(a) * 42, 1.05, `b${i}`); })}
      {pbSwirl(CX + 4, CY + 14, 1.35, 'pb')}
    </Bowl>
  ),
  'egg-potato-hash': (r, id) => (
    <Skillet id={id}>
      {Array.from({ length: 26 }, (_, i) => { const [x, y] = pt(r, CX, CY, 62); return cube(x, y, 0.9 + r() * 0.3, r() * 90, C.potato, C.potatoDark, `p${i}`); })}
      {mixedVeg(r, CX, CY, 64, 24, 0, 360, 'mv')}
      {onionBits(r, CX, CY, 60, 10, 0, 360, 'on')}
      {friedEgg(CX - 22, CY - 10, 1.15, 'e1')}{friedEgg(CX + 24, CY + 14, 1.05, 'e2')}
      {shreds(r, CX, CY, 58, 10, 0, 360, 'ch')}
    </Skillet>
  ),
  'yogurt-berry-bowl': (r, id) => (
    <Bowl id={id} base={C.yogurt}>
      <path d={`M${CX - 50} ${CY + 10} C${CX - 20} ${CY - 20} ${CX + 20} ${CY + 30} ${CX + 52} ${CY - 6}`} stroke="#ebe5da" strokeWidth={6} fill="none" strokeLinecap="round" />
      {Array.from({ length: 22 }, (_, i) => { const [x, y] = pt(r, CX - 14, CY - 6, 36, 160, 380); return berry(x, y, i % 3, `be${i}`); })}
      {flecks(r, CX + 30, CY + 26, 26, 40, C.oats, 'oa', 1.6)}
      {pbSwirl(CX + 32, CY + 2, 0.9, 'pb')}
    </Bowl>
  ),
  'chicken-rice-broccoli': (r, id) => (
    <Bowl id={id} base={C.rice}>
      {grains(r, CX, CY, 70, 230, 150, 270)}
      <path d={wedge(CX, CY, 72, 270, 390)} fill="#3a6b30" />
      {Array.from({ length: 9 }, (_, i) => { const [x, y] = pt(r, CX, CY, 58, 275, 385); return floret(x, y, 1 + r() * 0.25, `f${i}`); })}
      <path d={wedge(CX, CY, 72, 30, 150)} fill="#c58a51" />
      {Array.from({ length: 6 }, (_, i) => { const a = (40 + i * 20) * (Math.PI / 180); return chickenSlice(CX + Math.cos(a) * 40, CY + Math.sin(a) * 40, 1.05, (40 + i * 20) + 90, `c${i}`); })}
    </Bowl>
  ),
  'beef-bean-chili': (r, id) => (
    <Bowl id={id} base={C.chili}>
      <circle cx={CX - 10} cy={CY - 12} r={40} fill={C.sauce} opacity={0.55} />
      {crumbles(r, CX, CY, 66, 60, 0, 360, 'bf')}
      {Array.from({ length: 40 }, (_, i) => { const [x, y] = pt(r, CX, CY, 64); return bean(x, y, r() * 180, `bn${i}`); })}
      {onionBits(r, CX, CY, 60, 10, 0, 360, 'on')}
      {flecks(r, CX, CY, 64, 30, '#d4513c', 'tm', 2)}
    </Bowl>
  ),
  'lentil-potato-curry': (r, id) => (
    <Bowl id={id} base={C.curry}>
      <circle cx={CX + 12} cy={CY - 10} r={38} fill={C.curryLight} opacity={0.6} />
      {flecks(r, CX, CY, 66, 120, C.lentil, 'le', 1.5)}
      {Array.from({ length: 14 }, (_, i) => { const [x, y] = pt(r, CX, CY, 56); return cube(x, y, 1, r() * 90, '#efc77a', '#c99a45', `p${i}`); })}
      {Array.from({ length: 7 }, (_, i) => { const [x, y] = pt(r, CX, CY, 54); return leaf(x, y, 0.9, r() * 180, `sp${i}`); })}
      {flecks(r, CX, CY, 64, 20, C.sauceLight, 'tm', 1.8)}
    </Bowl>
  ),
  'black-bean-rice-bowls': (r, id) => (
    <Bowl id={id} base={C.rice}>
      {grains(r, CX, CY, 70, 140, 180, 300)}
      <path d={wedge(CX, CY, 72, 300, 400)} fill="#1f1515" />
      {Array.from({ length: 34 }, (_, i) => { const [x, y] = pt(r, CX, CY, 64, 302, 398); return bean(x, y, r() * 180, `b${i}`); })}
      <path d={wedge(CX, CY, 72, 40, 120)} fill="#3d3a2a" />
      {mixedVeg(r, CX, CY, 64, 40, 42, 118, 'mv')}
      <path d={wedge(CX, CY, 72, 120, 180)} fill="#7a2a1e" />
      {salsa(r, CX, CY, 64, 26, 122, 178, 'sa')}
      {onionBits(r, CX, CY, 30, 6, 0, 360, 'on')}
    </Bowl>
  ),
  'tuna-tomato-pasta': (r, id) => (
    <Plate id={id}>
      <circle cx={CX} cy={CY} r={52} fill={C.sauce} opacity={0.9} />
      {spaghetti(r, CX, CY, 54, 'sp')}
      <circle cx={CX + 4} cy={CY - 2} r={22} fill={C.sauceLight} opacity={0.9} />
      {tunaFlakes(r, CX + 4, CY - 2, 20, 12, 0, 360, 'tu')}
      {Array.from({ length: 4 }, (_, i) => { const a = (i * 90 + 20) * (Math.PI / 180); return floret(CX + Math.cos(a) * 46, CY + Math.sin(a) * 46, 0.9, `f${i}`); })}
    </Plate>
  ),
  'tofu-stir-fry': (r, id) => (
    <Bowl id={id} base={C.rice}>
      {grains(r, CX, CY, 70, 160)}
      <path d={`M${CX - 44} ${CY - 6} C${CX - 40} ${CY - 44} ${CX + 36} ${CY - 50} ${CX + 46} ${CY - 6} C${CX + 52} ${CY + 34} ${CX - 30} ${CY + 52} ${CX - 44} ${CY - 6} Z`} fill="#7a4a22" opacity={0.85} />
      {Array.from({ length: 11 }, (_, i) => { const [x, y] = pt(r, CX, CY, 36); return cube(x, y, 1.45, r() * 90, C.tofu, C.tofuCrisp, `t${i}`); })}
      {Array.from({ length: 4 }, (_, i) => { const [x, y] = pt(r, CX, CY, 40); return floret(x, y, 0.85, `tf${i}`); })}
      {mixedVeg(r, CX, CY, 46, 34, 0, 360, 'mv')}
      {flecks(r, CX, CY, 40, 18, '#f3ead7', 'se', 0.9)}
    </Bowl>
  ),
  'egg-fried-rice': (r, id) => (
    <Bowl id={id} base="#ecdcb6">
      {grains(r, CX, CY, 70, 260, 0, 360, '#f3e6c4')}
      {Array.from({ length: 16 }, (_, i) => { const [x, y] = pt(r, CX, CY, 60); return <path key={`eg${i}`} d={`M${x - 5} ${y} Q${x - 2} ${y - 5} ${x + 4} ${y - 2} Q${x + 6} ${y + 3} ${x} ${y + 4} Q${x - 5} ${y + 3} ${x - 5} ${y} Z`} fill={i % 2 ? '#f6cc4a' : '#f9de86'} />; })}
      {mixedVeg(r, CX, CY, 64, 44, 0, 360, 'mv')}
      {onionBits(r, CX, CY, 60, 8, 0, 360, 'on')}
    </Bowl>
  ),
  'sheet-pan-chicken': (r, id) => (
    <Tray id={id}>
      {Array.from({ length: 38 }, (_, i) => cube(52 + r() * 216, 36 + r() * 128, 1.45, r() * 90, C.potato, C.potatoDark, `p${i}`))}
      {Array.from({ length: 10 }, (_, i) => floret(56 + r() * 208, 40 + r() * 120, 1.3, `f${i}`))}
      {[[100, 66, -20], [210, 60, 25], [118, 142, 15], [226, 134, -30]].map(([x, y, a], i) => <g key={`dd${i}`} transform={`translate(${x} ${y}) scale(1.7) translate(${-x} ${-y})`}>{drumstick(x, y, a, `d${i}`)}</g>)}
      {Array.from({ length: 30 }, (_, i) => <circle key={`sz${i}`} cx={50 + r() * 220} cy={34 + r() * 132} r={0.9} fill="#2c1a10" />)}
    </Tray>
  ),
  'pb-banana-toast': (r, id) => (
    <Plate id={id} rad={70}>
      <g transform={`translate(${CX} ${CY + 4}) rotate(-8)`}>
        <path d="M-46 -34 C-50 -62 -14 -70 0 -58 C14 -70 50 -62 46 -34 L42 46 Q42 52 36 52 L-36 52 Q-42 52 -42 46 Z" fill={C.crust} />
        <path d="M-40 -30 C-42 -54 -12 -60 0 -50 C12 -60 42 -54 40 -30 L37 42 Q37 46 33 46 L-33 46 Q-37 46 -37 42 Z" fill={C.bread} />
        <path d="M-34 -26 C-36 -46 -10 -52 0 -43 C10 -52 36 -46 34 -26 L31 38 L-31 38 Z" fill={C.pb} />
        {[[-16, -24], [10, -22], [-18, 2], [8, 4], [-14, 26], [12, 26]].map(([x, y], i) => bananaSlice(x, y, 1.2, `b${i}`))}
      </g>
    </Plate>
  ),
  'chickpea-spinach-pasta': (r, id) => (
    <Plate id={id}>
      <circle cx={CX} cy={CY} r={54} fill={C.sauce} />
      {spaghetti(r, CX, CY, 54, 'sp')}
      {Array.from({ length: 16 }, (_, i) => { const [x, y] = pt(r, CX, CY, 44); return chickpea(x, y, `c${i}`); })}
      {Array.from({ length: 8 }, (_, i) => { const [x, y] = pt(r, CX, CY, 46); return leaf(x, y, 0.85, r() * 180, `l${i}`); })}
    </Plate>
  ),
  'beef-taco-bowls': (r, id) => (
    <Bowl id={id} base={C.rice}>
      {grains(r, CX, CY, 70, 120, 200, 320)}
      <path d={wedge(CX, CY, 72, 320, 420)} fill="#4a2a1a" />
      {crumbles(r, CX, CY, 64, 34, 322, 418, 'bf')}
      <path d={wedge(CX, CY, 72, 60, 140)} fill="#1f1515" />
      {Array.from({ length: 22 }, (_, i) => { const [x, y] = pt(r, CX, CY, 62, 62, 138); return bean(x, y, r() * 180, `b${i}`); })}
      <path d={wedge(CX, CY, 72, 140, 200)} fill="#7a2a1e" />
      {salsa(r, CX, CY, 62, 22, 142, 198, 'to')}
      {shreds(r, CX, CY, 26, 14, 0, 360, 'ch')}
    </Bowl>
  ),
  'yogurt-pb-snack': (r, id) => (
    <Bowl id={id} base={C.yogurt} rad={58}>
      <path d={`M${CX - 40} ${CY} C${CX - 10} ${CY - 26} ${CX + 12} ${CY + 24} ${CX + 42} ${CY - 4}`} stroke="#ebe5da" strokeWidth={5} fill="none" strokeLinecap="round" />
      {pbSwirl(CX - 6, CY + 2, 1.5, 'pb')}
      {Array.from({ length: 12 }, (_, i) => { const [x, y] = pt(r, CX + 20, CY - 18, 18); return berry(x, y, i % 3, `be${i}`); })}
    </Bowl>
  ),
  'tuna-chickpea-wraps': (r, id) => (
    <Plate id={id}>
      {[[-34, -6, -18], [36, 8, 14]].map(([dx, dy, rot], w) => (
        <g key={`w${w}`} transform={`translate(${CX + dx} ${CY + dy}) rotate(${rot}) scale(1.3)`}>
          <ellipse rx={30} ry={30} fill={C.tortillaDark} /><ellipse rx={26} ry={26} fill={C.tortilla} /><ellipse rx={21} ry={21} fill="#efe8db" />
          {tunaFlakes(r, 0, 0, 16, 8, 0, 360, `t${w}`)}
          {Array.from({ length: 5 }, (_, i) => { const [x, y] = pt(r, 0, 0, 15); return chickpea(x, y, `c${w}${i}`); })}
          {Array.from({ length: 3 }, (_, i) => { const [x, y] = pt(r, 0, 0, 14); return leaf(x, y, 0.55, r() * 180, `l${w}${i}`); })}
          <path d="M-26 0 A26 26 0 0 1 26 0" fill="none" stroke="#d8b77d" strokeWidth={1.5} opacity={0.6} />
        </g>
      ))}
    </Plate>
  ),
};

export const hasArt = (id: string) => id in DISHES;

/** Recipe cover. `variant` sets the frame: hero (16:10 card), thumb (square). */
export function RecipeArt({ id, name, variant = 'hero', className }: { id: string; name: string; variant?: 'hero' | 'thumb'; className?: string }) {
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');
  const draw = DISHES[id];
  const r = rng(id);
  return (
    <svg className={`recipe-art recipe-art-${variant} ${className ?? ''}`} viewBox={variant === 'thumb' ? `${CX - 92} ${CY - 92} 184 184` : `0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice" role="img" aria-label={`Illustration of ${name}`} data-testid="recipe-art">
      <defs>
        <radialGradient id={`${uid}-bg`} cx="45%" cy="40%" r="75%"><stop offset="0%" stopColor="#2b2019" /><stop offset="100%" stopColor="#100c09" /></radialGradient>
        <radialGradient id={`${uid}-glow`} cx="90%" cy="0%" r="60%"><stop offset="0%" stopColor="#ff5a1f" stopOpacity="0.28" /><stop offset="100%" stopColor="#ff5a1f" stopOpacity="0" /></radialGradient>
        <radialGradient id={`${uid}-inner`}><stop offset="70%" stopColor="#000" stopOpacity="0" /><stop offset="100%" stopColor="#000" stopOpacity="0.35" /></radialGradient>
        <filter id={`${uid}-blur`} x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="9" /></filter>
      </defs>
      <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-bg)`} />
      <rect x={0} y={0} width={W} height={H} fill={`url(#${uid}-glow)`} />
      {variant === 'hero' && <g opacity={0.5}>{[0, 1, 2, 3, 4].map((i) => <line key={i} x1={0} y1={40 * i + 12} x2={W} y2={40 * i + 4} stroke="#ffffff" strokeOpacity={0.025} strokeWidth={1} />)}</g>}
      {draw ? draw(r, uid) : <Plate id={uid}><circle cx={CX} cy={CY} r={40} fill="#d9c39a" /></Plate>}
    </svg>
  );
}
