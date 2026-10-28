# PX-Fitness motion system

**Where the ideas came from:** the reference sites in the brief (60fps.design, beui.dev and others) couldn't be opened from the build environment, so the system follows their published descriptions:
- **beUI:** spring physics set by stiffness, damping and mass, a small set of named springs, and a reduced-motion rule that removes movement but keeps opacity and color feedback rather than turning everything off.
- **60fps.design:** every animation is described as trigger → start → move → settle.

No assets or code were copied.

## Springs (src/lib/motion.ts)
Real springs are simulated in code, then turned into CSS `linear()` easing curves at startup (`--spring-*` and `--spring-*-ms`). Browsers without `linear()` fall back to the cubic-bezier values in `app.css`.

| Token | Stiffness / damping | Used for |
|---|---|---|
| press | 520 / 30 | tap feedback (scale to 0.94) |
| snappy | 380 / 30 | sliding mood indicator, nav indicator |
| smooth | 190 / 26 | card entrances, workout-start morph |
| bouncy | 300 / 17 | numbers landing, progress ring, check tick |
| gentle | 110 / 20 | budget meter |

Unit tests confirm every spring settles, "bouncy" overshoots, and "smooth" barely does.

## Dashboard animations (trigger → start → move → settle)
| Element | Trigger | Start | Move | Settle |
|---|---|---|---|---|
| Cards | mount, or scroll into view | 18 px low, transparent | smooth spring, 55 ms stagger | resting card |
| Exercise list | card lands | 8 px left, transparent | smooth, 45 ms cascade after 240 ms | list |
| Weekly ring | data | empty arc | bouncy on the arc's length | sessions ÷ goal; one glow pulse when the goal is hit |
| Numbers (sessions, streak, budget) | value changes | previous value | bouncy, counted frame by frame | exact value (screen readers get the real number at once) |
| Mood picker | tap | old option | snappy slide and resize of one shared pill | new option |
| Bottom nav | route change | old tab | snappy slide of one shared bar | active tab |
| Start workout | tap Start | workout card | View Transition morph into the workout header | workout screen |
| Ambient glow | always (hero) | — | slow 22 s rotation, transform-only | — |

## Reduced motion
Applies when the device asks for it or the in-app toggle is on.
- Movement variables go to zero, so cards only fade in, with no slide or scale.
- The ambient glow stops, and the workout start skips the View Transition.
- The ring and numbers jump straight to their values; the picker indicator stops sliding.
- Opacity and color feedback stay.

All of this is checked by `e2e/motion.mjs`.

## Performance
- Only `transform` and `opacity` are animated; the ring animates its stroke offset.
- There's no animation library.
- A headless frame-rate check during the entrance runs at 45+ fps.
