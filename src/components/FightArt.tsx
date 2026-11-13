// Top-down footwork and head-movement diagrams for the fight lessons.
// Orthodox stance (left foot forward). Planted foot = grey, moving foot = ember,
// where it started = dashed outline.

import React from 'react';
import type { Diagram } from '../lib/fightLessons';

const EMBER = '#ff5a1f', GREY = '#8f8780', INK = '#f4efe8';

function Foot({ x, y, r = 0, tone = 'plant', label }: { x: number; y: number; r?: number; tone?: 'plant' | 'move' | 'ghost'; label?: string }) {
  const fill = tone === 'move' ? EMBER : tone === 'plant' ? GREY : 'none';
  const stroke = tone === 'ghost' ? GREY : 'none';
  return (
    <g transform={`translate(${x} ${y}) rotate(${r})`}>
      <path d="M0 -26 C10 -26 13 -14 12 -2 C11 10 9 22 0 26 C-9 22 -11 10 -12 -2 C-13 -14 -10 -26 0 -26 Z" fill={fill} stroke={stroke} strokeWidth="2" strokeDasharray={tone === 'ghost' ? '4 4' : undefined} opacity={tone === 'ghost' ? 0.7 : 1} />
      {label && <text y="46" textAnchor="middle" fontSize="12" fontWeight="700" fill={INK} transform={`rotate(${-r})`}>{label}</text>}
    </g>
  );
}
const Arrow = ({ d, id }: { d: string; id: string }) => (
  <>
    <defs><marker id={id} viewBox="0 0 10 10" refX="7" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill={EMBER} /></marker></defs>
    <path d={d} fill="none" stroke={EMBER} strokeWidth="3" strokeLinecap="round" markerEnd={`url(#${id})`} />
  </>
);
const Them = ({ x, y }: { x: number; y: number }) => (
  <g><circle cx={x} cy={y} r="18" fill="none" stroke={INK} strokeWidth="2" /><text x={x} y={y + 4} textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>Them</text></g>
);

export function FightDiagram({ kind }: { kind: Diagram }) {
  if (kind === 'none') return null;
  const box = (title: string, children: React.ReactNode, caption: string) => (
    <figure className="fdiag" data-testid={`diagram-${kind}`}>
      <svg viewBox="0 0 320 200" role="img" aria-label={title}>{children}</svg>
      <figcaption className="small muted">{caption}</figcaption>
    </figure>
  );
  switch (kind) {
    case 'stance': return box('Stance from above', <>
      <line x1="40" y1="170" x2="280" y2="30" stroke={GREY} strokeDasharray="3 6" />
      <Them x={280} y={30} />
      <Foot x={175} y={95} r={50} tone="move" />
      <Foot x={110} y={140} r={95} tone="plant" />
      <text x="205" y="128" fontSize="12" fontWeight="700" fill={INK}>Lead (left)</text>
      <text x="40" y="182" fontSize="12" fontWeight="700" fill={INK}>Rear (right), turned out</text>
    </>, 'From above: lead foot points toward them, rear foot turned out about 45°, feet not in one line.');
    case 'step': return box('Step and drag', <>
      <Foot x={95} y={110} r={50} tone="ghost" /><Foot x={160} y={78} r={50} tone="move" />
      <Foot x={40} y={150} r={95} tone="ghost" /><Foot x={105} y={118} r={95} tone="plant" />
      <text x="185" y="112" fontSize="12" fontWeight="700" fill={INK}>1 · front foot first</text>
      <text x="70" y="172" fontSize="12" fontWeight="700" fill={INK}>2 · back foot follows</text>
      <Arrow id="a-step1" d="M102 98 L136 84" /><Arrow id="a-step2" d="M52 132 L86 116" />
      <Them x={280} y={30} />
    </>, 'Moving forward: front foot steps, back foot follows the same distance. Never cross your feet.');
    case 'pivot': return box('Pivot on the back foot', <>
      <Foot x={175} y={95} r={50} tone="plant" />
      <Foot x={110} y={140} r={95} tone="move" />
      <text x="205" y="128" fontSize="12" fontWeight="700" fill={INK}>Lead stays</text>
      <text x="40" y="190" fontSize="12" fontWeight="700" fill={INK}>Back heel turns out</text>
      <Arrow id="a-piv" d="M86 112 C 76 124, 78 150, 92 160" />
      <Them x={280} y={30} />
    </>, 'On the cross, turn the back heel out and drive the hip round: that’s where the power comes from.');
    case 'angle': return box('Step off at an angle', <>
      <Them x={250} y={60} />
      <line x1="250" y1="60" x2="110" y2="150" stroke={GREY} strokeDasharray="3 6" />
      <text x="140" y="118" fontSize="11" fill={GREY} transform="rotate(-33 140 118)">their line of attack</text>
      <Foot x={120} y={150} r={55} tone="ghost" /><Foot x={175} y={168} r={20} tone="move" />
      <text x="200" y="178" fontSize="12" fontWeight="700" fill={INK}>you, off the line</text>
      <Arrow id="a-ang" d="M128 160 C 140 172, 150 176, 158 176" />
    </>, 'Step or pivot off their line, so they have to turn to find you while you can already hit them.');
    case 'slip': return box('Slip and roll', <>
      <Them x={280} y={100} />
      <Arrow id="a-punch" d="M258 100 L140 100" />
      <circle cx="120" cy="100" r="16" fill="none" stroke={GREY} strokeWidth="2" strokeDasharray="4 4" />
      <circle cx="120" cy="134" r="16" fill={EMBER} /><text x="120" y="164" textAnchor="middle" fontSize="11" fontWeight="700" fill={INK}>head moves just off the line</text>
      <path d="M40 40 C 40 90, 80 110, 100 60" fill="none" stroke={GREY} strokeWidth="2" strokeDasharray="4 4" />
      <text x="30" y="30" fontSize="11" fill={GREY}>roll: U shape under hooks</text>
    </>, 'Slip: turn your shoulders so your head moves a few inches outside the punch. Bend the knees, not the waist.');
    default: return null;
  }
}
