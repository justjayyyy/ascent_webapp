import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue, useMotionValueEvent, useTransform } from 'framer-motion';
import { ArrowLeft, ArrowRight, Loader2, ScanFace } from 'lucide-react';
import { cn } from '@/lib/utils';
import AscentLogo from '@/components/AscentLogo';
import { Link } from 'react-router-dom';
import {
  EASE_OUT, Field, GoogleMark, LanguageSwitch, OrDivider, PasswordField, PrimaryButton,
} from './AuthParts';
import './auth.css';

// Sign-in as a climb up one mountain, on one screen that never scrolls: the ridgeline night, the
// tagline, and a hero peak whose left edge carries the route. Each step of signing in is a camp on
// that edge; the climbed stretch lights up as you go, and signing in reaches the flag.

// ---- the far ridges (whole screen) -----------------------------------------------------------------
function ridgePath(seed, base, amp, peaks) {
  const pts = [];
  for (let x = -40; x <= 1480; x += 8) {
    let y = base
      + Math.sin(x / 210 + seed) * amp * 0.5
      + Math.sin(x / 97 + seed * 2.3) * amp * 0.22
      + Math.sin(x / 41 + seed * 5.1) * amp * 0.16
      + Math.sin(x / 17 + seed * 9.7) * amp * 0.06;
    peaks.forEach(([px, h, w]) => { y -= h * Math.max(0, 1 - Math.abs(x - px) / w) ** 1.15; });
    pts.push(`${x} ${y.toFixed(1)}`);
  }
  return `M-40 560 L${pts.join(' L')} L1480 560 Z`;
}
const FAR_RIDGES = [
  { d: ridgePath(0.4, 250, 70, [[1080, 150, 260], [300, 90, 200]]), fill: 'var(--ridge-1)' },
  { d: ridgePath(1.7, 320, 60, [[180, 110, 230], [1260, 100, 200]]), fill: 'var(--ridge-2)' },
];
const STARS = Array.from({ length: 60 }, (_, i) => {
  const r = (n) => { const v = Math.sin(i * 12.9898 + n * 78.233) * 43758.5453; return v - Math.floor(v); };
  return { x: r(1) * 100, y: r(2) * 55, s: 0.6 + r(3) * 1.3, tw: 2.5 + r(4) * 4, td: r(5) * -6 };
});

function Backdrop() {
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[linear-gradient(to_bottom,hsl(var(--background))_10%,var(--ridge-sky)_75%)]" />
      <div className="absolute inset-x-0 top-0 hidden h-[60%] dark:block">
        {STARS.map((s, i) => (
          <span
            key={i}
            className="ridge-star absolute rounded-full bg-foreground"
            style={{ left: `${s.x}%`, top: `${s.y / 0.55}%`, width: s.s * 1.6, height: s.s * 1.6, '--tw': `${s.tw}s`, '--td': `${s.td}s` }}
          />
        ))}
      </div>
      <svg className="absolute inset-x-0 bottom-0 h-[72%] w-full" viewBox="0 0 1440 520" preserveAspectRatio="xMidYMax slice">
        {FAR_RIDGES.map((r) => <path key={r.d.length} d={r.d} fill={r.fill} />)}
      </svg>
    </div>
  );
}

// ---- the hero mountain (drawn in a 400 x 260 stage; its flanks run on past the stage) -------------
const crest = (x) => 252
  - 222 * Math.max(0, 1 - Math.abs(x - 200) / 230) ** 1.2
  - 70 * Math.max(0, 1 - Math.abs(x - 312) / 90) ** 1.3
  + 2.5 * Math.sin(x / 7.3) + 3.5 * Math.sin(x / 17 + 1);
const near = (x) => 238 + 9 * Math.sin(x / 40) + 5 * Math.sin(x / 13 + 2);

function silhouette(fn) {
  const pts = [];
  for (let x = -1600; x <= 2000; x += (x > -120 && x < 520 ? 2 : 24)) pts.push(`${x} ${fn(x).toFixed(1)}`);
  return `M-1600 3000 L${pts.join(' L')} L2000 3000 Z`;
}
const MOUNTAIN = silhouette(crest);
const FOREGROUND = silhouette(near);
const PEAK_X = 200;
const FOOT_X = 34;

// The route is the mountain's left edge itself, from the foot to the peak
const ROUTE = (() => {
  const pts = [];
  for (let x = FOOT_X; x <= PEAK_X; x += 1) pts.push([x, crest(x) - 1.5]);
  const lengths = [0];
  for (let i = 1; i < pts.length; i += 1) lengths.push(lengths[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]));
  const total = lengths[lengths.length - 1];
  const at = (f) => pts[Math.max(0, lengths.findIndex((l) => l >= f * total))] || pts[pts.length - 1];
  return { d: `M${pts.map((p) => `${p[0]} ${p[1].toFixed(1)}`).join(' L')}`, at };
})();

// ---- the artwork ------------------------------------------------------------------------------------
// The mountain is painted once, in layers: a hazy middle range, the hero peak with faceted lit and
// shadowed faces, rock grain, snow with streaks down the gullies, then mist, the near ridge and a
// treeline. Only the route, the climber marker and the champion move, on their own layer.
const pathOf = (pts) => `M${pts.map((p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(' L')}`;
const jag = (x) => 4 * Math.sin(x / 2.9) + 3 * Math.sin(x / 1.6 + 1.3) + 2.5 * Math.sin(x / 6.1);

// A spine falls from a crest point towards the viewer; faces meet along it
function spine(fromX, toX, wobble = 3) {
  const top = crest(fromX);
  return Array.from({ length: 31 }, (_, i) => {
    const u = i / 30;
    return [fromX + (toX - fromX) * u ** 0.8 + wobble * Math.sin(u * 9 + fromX), top + (262 - top) * u];
  });
}
const between = (a, b) => `${pathOf(a)} L${pathOf([...b].reverse()).slice(1)} Z`;
const rightOf = (s) => `${pathOf(s)} L2000 262 L2000 -200 L${s[0][0].toFixed(1)} -200 Z`;

const SPINES = {
  a: spine(70, 48, 2), b: spine(112, 94, 3), c: spine(148, 132, 3), d: spine(176, 168, 2),
  main: spine(200, 246, 4), saddle: spine(266, 274, 3), shoulder: spine(312, 300, 2),
};
const FACETS_LIGHT = [between(SPINES.a, SPINES.b), between(SPINES.c, SPINES.d)];
const FACETS_DARK = [between(SPINES.b, SPINES.c), between(SPINES.d, SPINES.main)];
const SHADOW = rightOf(SPINES.main);
const SHADOW_DEEP = [between(SPINES.main, SPINES.saddle), rightOf(SPINES.shoulder)];

const midRange = (x) => 168 + 10 * Math.sin(x / 31) + 6 * Math.sin(x / 11 + 1)
  - 70 * Math.max(0, 1 - Math.abs(x + 30) / 130) ** 1.2
  - 64 * Math.max(0, 1 - Math.abs(x - 430) / 140) ** 1.2;
const MID = silhouette(midRange);

// Snow on the main peak, reaching further down the sheltered gullies
const snowline = (x) => 64 + jag(x) + 9 * Math.max(0, Math.sin((x - 150) / 7)) ** 3 + Math.abs(x - 200) * 0.12;
const SNOW = (() => {
  const pts = [];
  for (let x = 140; x <= 262; x += 1) pts.push([x, snowline(x)]);
  return `${pathOf(pts)} L262 -200 L140 -200 Z`;
})();
const STREAKS = [[156, 22, 4], [170, 30, 5], [183, 18, 3], [194, 26, 4], [214, 24, 4], [230, 16, 3], [244, 12, 2.5]]
  .map(([x, len, w]) => {
    const y = snowline(x) - 3;
    return `M${x - w} ${y.toFixed(1)} Q${x - w * 0.3} ${(y + len * 0.6).toFixed(1)} ${x + 1.5} ${(y + len).toFixed(1)} Q${x + w * 0.4} ${(y + len * 0.5).toFixed(1)} ${x + w} ${y.toFixed(1)} Z`;
  });
// Rock ledges: short strokes that tilt with the slope, each with a faint lit lip beneath it
const LEDGES = (() => {
  let dark = '';
  let lit = '';
  for (let i = 0; i < 140; i += 1) {
    const r = (n) => { const v = Math.sin(i * 12.73 + n * 4.11) * 24634.6345; return v - Math.floor(v); };
    const x = 20 + r(1) * 360;
    const top = crest(x) + 6;
    if (top > 236) continue;
    const y = top + r(2) ** 0.8 * (240 - top);
    if (y < snowline(x) + 4 && x > 140 && x < 262) continue;
    const len = 3 + r(3) * 9;
    const tilt = (x < 200 ? 0.28 : -0.24) + (r(4) - 0.5) * 0.3;
    const x2 = x + len;
    const y2 = y + len * tilt;
    dark += `M${x.toFixed(1)} ${y.toFixed(1)} L${x2.toFixed(1)} ${y2.toFixed(1)}`;
    lit += `M${x.toFixed(1)} ${(y + 0.9).toFixed(1)} L${x2.toFixed(1)} ${(y2 + 0.9).toFixed(1)}`;
  }
  return { dark, lit };
})();
// Cliff bands: ragged darker strata across the faces, each with a lit lip above it
const CLIFFS = [[118, 3.5], [158, 4.5], [196, 3]].map(([y0, thick], k) => {
  const top = [];
  const bottom = [];
  for (let x = -40; x <= 420; x += 3) {
    const y = y0 + 4 * Math.sin(x / 13 + k * 2) + 2.2 * Math.sin(x / 4.3 + k) + 1.4 * Math.sin(x / 1.9 + k * 5) + (x - 200) * 0.05;
    top.push([x, y]);
    bottom.push([x, y + thick * (0.6 + 0.4 * Math.sin(x / 7 + k * 3)) + 1]);
  }
  return { band: between(top, bottom), lip: pathOf(top.map(([x, y]) => [x, y - 0.8])) };
});
const ALPENGLOW = pathOf(Array.from({ length: 91 }, (_, i) => [20 + i * 2, crest(20 + i * 2)]));

// A lower foothill in front of the shadowed side
const foothill = (x) => 262 - 92 * Math.max(0, 1 - Math.abs(x - 392) / 122) ** 1.25 + 1.6 * Math.sin(x / 3.7) + 2 * Math.sin(x / 9 + 2);
const FOOTHILL = silhouette(foothill);
const FOOTHILL_SNOW = (() => {
  const pts = [];
  for (let x = 360; x <= 424; x += 1) pts.push([x, 186 + jag(x) * 0.7 + Math.abs(x - 392) * 0.25]);
  return `${pathOf(pts)} L424 -200 L360 -200 Z`;
})();
const FOOTHILL_SHADOW = rightOf(Array.from({ length: 31 }, (_, i) => {
  const u = i / 30;
  return [392 + 18 * u ** 0.8 + 2 * Math.sin(u * 8), foothill(392) + (262 - foothill(392)) * u];
}));
const CREST_LEFT = pathOf(Array.from({ length: 36 }, (_, i) => [165 + i, crest(165 + i)]));
const RIM = pathOf(Array.from({ length: 91 }, (_, i) => [200 + i * 2, crest(200 + i * 2)]));

// Pines along the near ridge, deterministic
const TREES = (() => {
  let d = '';
  let x = -320;
  let i = 0;
  while (x < 720) {
    const r = (n) => { const v = Math.sin(i * 7.31 + n * 3.17) * 9137.13; return v - Math.floor(v); };
    const h = 6 + r(1) * 11;
    const w = h * (0.42 + r(2) * 0.12);
    const y = near(x) + 1.5;
    d += `M${x.toFixed(1)} ${(y - h).toFixed(1)} L${(x + w / 2).toFixed(1)} ${(y - h * 0.38).toFixed(1)} L${(x - w / 2).toFixed(1)} ${(y - h * 0.38).toFixed(1)} Z`;
    d += `M${x.toFixed(1)} ${(y - h * 0.62).toFixed(1)} L${(x + w * 0.62).toFixed(1)} ${y.toFixed(1)} L${(x - w * 0.62).toFixed(1)} ${y.toFixed(1)} Z`;
    x += 3 + r(3) * 9 + (r(4) > 0.86 ? 14 : 0);
    i += 1;
  }
  return d;
})();

const STAGE = {
  viewBox: '0 0 400 260',
  preserveAspectRatio: 'xMidYMax meet',
  className: 'absolute inset-0 h-full w-full',
  style: { overflow: 'visible' },
  'aria-hidden': true,
};

/** Painted once and never re-rendered */
const MountainArt = React.memo(function MountainArt() {
  return (
    <svg {...STAGE}>
      <defs>
        <radialGradient id="sm-glow" cx="200" cy="46" r="210" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'hsl(var(--glow))', stopOpacity: 0.36 }} />
          <stop offset="0.45" style={{ stopColor: 'hsl(var(--glow))', stopOpacity: 0.12 }} />
          <stop offset="1" style={{ stopColor: 'hsl(var(--glow))', stopOpacity: 0 }} />
        </radialGradient>
        <linearGradient id="sm-mid" x1="0" y1="90" x2="0" y2="250" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'color-mix(in oklch, var(--ridge-2) 55%, hsl(var(--background)))' }} />
          <stop offset="1" style={{ stopColor: 'var(--ridge-sky)' }} />
        </linearGradient>
        <linearGradient id="sm-lit" x1="40" y1="30" x2="230" y2="262" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'color-mix(in oklch, hsl(var(--primary)) 70%, var(--ridge-3))' }} />
          <stop offset="0.5" style={{ stopColor: 'color-mix(in oklch, hsl(var(--primary)) 34%, var(--ridge-3))' }} />
          <stop offset="1" style={{ stopColor: 'color-mix(in oklch, var(--ridge-3) 80%, hsl(var(--background)))' }} />
        </linearGradient>
        <linearGradient id="sm-shadow" x1="0" y1="30" x2="0" y2="262" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'hsl(var(--background))', stopOpacity: 0.58 }} />
          <stop offset="1" style={{ stopColor: 'hsl(var(--background))', stopOpacity: 0.34 }} />
        </linearGradient>
        <linearGradient id="sm-snow" x1="150" y1="30" x2="240" y2="110" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'color-mix(in oklch, hsl(var(--foreground)) 96%, hsl(var(--primary)))' }} />
          <stop offset="1" style={{ stopColor: 'color-mix(in oklch, hsl(var(--foreground)) 68%, hsl(var(--primary)))' }} />
        </linearGradient>
        <linearGradient id="sm-rim" x1="200" y1="0" x2="380" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'hsl(var(--foreground))', stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: 'hsl(var(--foreground))', stopOpacity: 0 }} />
        </linearGradient>
        <linearGradient id="sm-haze" x1="0" y1="140" x2="0" y2="250" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'var(--ridge-sky)', stopOpacity: 0 }} />
          <stop offset="1" style={{ stopColor: 'var(--ridge-sky)', stopOpacity: 0.8 }} />
        </linearGradient>
        <clipPath id="sm-clip"><path d={MOUNTAIN} /></clipPath>
      </defs>

      <rect x="-400" y="-200" width="1200" height="600" fill="url(#sm-glow)" />
      <path d={MID} fill="url(#sm-mid)" />
      <path d={MID} fill="url(#sm-haze)" />

      <g clipPath="url(#sm-clip)">
        <rect x="-1600" y="-200" width="3600" height="3200" fill="url(#sm-lit)" />
        {FACETS_LIGHT.map((d) => <path key={d} d={d} fill="hsl(var(--foreground))" fillOpacity="0.045" />)}
        {FACETS_DARK.map((d) => <path key={d} d={d} fill="hsl(var(--background))" fillOpacity="0.12" />)}
        <path d={ALPENGLOW} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.22" strokeWidth="12" strokeLinejoin="round" />
        <path d={ALPENGLOW} fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.4" strokeWidth="3.5" strokeLinejoin="round" />
        {CLIFFS.map((c) => (
          <g key={c.lip}>
            <path d={c.band} fill="hsl(var(--background))" fillOpacity="0.14" />
            <path d={c.lip} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.06" strokeWidth="0.7" />
          </g>
        ))}
        <path d={LEDGES.dark} fill="none" stroke="hsl(var(--background))" strokeOpacity="0.32" strokeWidth="0.9" strokeLinecap="round" />
        <path d={LEDGES.lit} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.1" strokeWidth="0.6" strokeLinecap="round" />
        <path d={SNOW} fill="url(#sm-snow)" />
        {STREAKS.map((d) => <path key={d} d={d} fill="url(#sm-snow)" fillOpacity="0.8" />)}
        <path d={SHADOW} fill="url(#sm-shadow)" />
        {SHADOW_DEEP.map((d) => <path key={d} d={d} fill="hsl(var(--background))" fillOpacity="0.16" />)}
        <path d={pathOf(SPINES.main)} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.1" strokeWidth="0.8" />
        <rect x="-1600" y="140" width="3600" height="3000" fill="url(#sm-haze)" />
      </g>
      <path d={CREST_LEFT} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.85" strokeWidth="0.9" strokeLinecap="round" />
      <path d={RIM} fill="none" stroke="url(#sm-rim)" strokeWidth="1" strokeLinecap="round" />
    </svg>
  );
});

/** Low mist drifting across the foot of the mountain, in front of it and behind the trees */
const Mist = React.memo(function Mist() {
  return (
    <svg {...STAGE}>
      <defs>
        <radialGradient id="sm-mist">
          <stop offset="0" style={{ stopColor: 'var(--ridge-sky)', stopOpacity: 0.75 }} />
          <stop offset="1" style={{ stopColor: 'var(--ridge-sky)', stopOpacity: 0 }} />
        </radialGradient>
      </defs>
      <g className="ridge-mist">
        <ellipse cx="110" cy="214" rx="190" ry="16" fill="url(#sm-mist)" />
        <ellipse cx="330" cy="222" rx="170" ry="14" fill="url(#sm-mist)" />
      </g>
    </svg>
  );
});

const Front = React.memo(function Front() {
  return (
    <svg {...STAGE}>
      <defs>
        <linearGradient id="sm-foothill" x1="300" y1="170" x2="420" y2="262" gradientUnits="userSpaceOnUse">
          <stop offset="0" style={{ stopColor: 'color-mix(in oklch, hsl(var(--primary)) 26%, var(--ridge-3))' }} />
          <stop offset="1" style={{ stopColor: 'var(--ridge-4)' }} />
        </linearGradient>
        <clipPath id="sm-foothill-clip"><path d={FOOTHILL} /></clipPath>
      </defs>
      <path d={FOOTHILL} fill="url(#sm-foothill)" />
      <g clipPath="url(#sm-foothill-clip)">
        <path d={FOOTHILL_SNOW} fill="color-mix(in oklch, hsl(var(--foreground)) 80%, hsl(var(--primary)))" />
        <path d={FOOTHILL_SHADOW} fill="hsl(var(--background))" fillOpacity="0.45" />
      </g>
      <path d={FOREGROUND} fill="var(--ridge-4)" />
      <path d={TREES} fill="var(--ridge-4)" />
    </svg>
  );
});

// ---- the champion at the top ------------------------------------------------------------------------
// A small jointed figure. Each frame works out where every joint wants to be, then eases toward it,
// so moves blend into each other instead of snapping. At rest he breathes, shifts his weight and now
// and then shades his eyes to look down the route. When the top camp lights he celebrates: a crouch,
// a jump with arms flung up in a V and a little confetti, a soft landing, then fists pumping in turn,
// round again for as long as the celebration lasts.
// It always plays: it is a few pixels of figure, not a sweep across the screen.
const CHAMP_X = 186;
const CONFETTI = Array.from({ length: 14 }, (_, i) => {
  const r = (n) => { const v = Math.sin(i * 5.17 + n * 2.71) * 7351.31; return v - Math.floor(v); };
  return {
    vx: (r(1) - 0.5) * 22,
    vy: 14 + r(2) * 12,
    spin: (r(3) - 0.5) * 360,
    w: 1 + r(4) * 0.8,
    color: ['--primary', '--chart-2', '--chart-3', '--chart-5', '--foreground'][i % 5],
  };
});

const v2 = {
  add: (a, b) => [a[0] + b[0], a[1] + b[1]],
  dir: (deg) => { const r = (deg * Math.PI) / 180; return [Math.sin(r), -Math.cos(r)]; }, // 0 = straight up
  mul: (a, k) => [a[0] * k, a[1] * k],
};
const f2 = (n) => n.toFixed(2);
const smooth = (x) => x * x * (3 - 2 * x);
const span = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// Knee between hip and foot (two equal bones), bent outwards on its own side
function kneeOf(hip, foot, side) {
  const L = 4.3;
  const dx = foot[0] - hip[0];
  const dy = foot[1] - hip[1];
  const d = Math.min(Math.hypot(dx, dy), L * 2 - 0.05);
  const h = Math.sqrt(Math.max(L * L - (d / 2) ** 2, 0));
  const nx = -dy / (d || 1);
  const ny = dx / (d || 1);
  const s = Math.sign(nx * side) || side;
  return [hip[0] + dx / 2 + nx * h * s, hip[1] + dy / 2 + ny * h * s];
}

const JUMP_LOOP = 4.2; // seconds per round of the celebration
const JUMP_AT = 0.45; // lift-off, seconds into a round
const JUMP_TIME = 0.5;

/** Where the joints want to be: `t` is the clock, `cs` seconds into a celebration (or -1 at rest) */
function targetPose(t, cs) {
  const p = {
    lift: 0, crouch: 0, bounce: 0, tilt: 0, tuck: 0,
    armL: 162, armR: 162, bendL: -8, bendR: -8,
    breathe: 0.2 * Math.sin(t * 1.7),
  };
  if (cs < 0) {
    // At rest: weight shifting from foot to foot, and every so often a look down the route
    p.tilt = 1.2 * Math.sin(t * 0.55);
    const look = t % 8;
    const shade = smooth(span(look, 4.5, 5)) * (1 - smooth(span(look, 6.6, 7.1)));
    p.armL += (78 - 162) * shade;
    p.bendL += (138 + 8) * shade;
    p.tilt += -4 * shade;
    return p;
  }
  const r = cs % JUMP_LOOP;
  const air = span(r, JUMP_AT, JUMP_AT + JUMP_TIME);
  const inAir = r > JUMP_AT && r < JUMP_AT + JUMP_TIME;
  // Anticipation: sink and swing the arms back
  const sink = smooth(span(r, 0.05, JUMP_AT)) * (1 - smooth(span(r, JUMP_AT, JUMP_AT + 0.08)));
  // Landing: absorb and come back up
  const land = r > JUMP_AT + JUMP_TIME ? Math.sin(Math.PI * span(r, JUMP_AT + JUMP_TIME, JUMP_AT + JUMP_TIME + 0.3)) : 0;
  p.crouch = 1.6 * sink + 1.3 * land;
  p.lift = inAir ? 7 * Math.sin(Math.PI * air) : 0;
  p.tuck = inAir ? 2.2 * Math.sin(Math.PI * air) : 0;

  if (r < JUMP_AT) {
    p.armL = 150 - 20 * sink; p.armR = 150 - 20 * sink; p.bendL = -6; p.bendR = -6;
  } else if (r < JUMP_AT + JUMP_TIME + 0.5) {
    p.armL = 30; p.armR = 30; p.bendL = 2; p.bendR = 2; // the V
  } else {
    // Fists pumping in turn, bouncing on the toes, then easing back towards the V
    const k = r - (JUMP_AT + JUMP_TIME + 0.5);
    const fade = 1 - smooth(span(r, JUMP_LOOP - 0.7, JUMP_LOOP));
    const beat = Math.sin(k * Math.PI * 2 * 1.1);
    p.armL = 30 + (16 + 8 * beat - 30) * fade;
    p.armR = 30 + (16 - 8 * beat - 30) * fade;
    p.bendL = 2 + (20 + 34 * Math.max(0, beat) - 2) * fade;
    p.bendR = 2 + (20 + 34 * Math.max(0, -beat) - 2) * fade;
    p.bounce = 0.55 * Math.abs(beat) * fade;
    p.tilt = 2.5 * Math.sin(k * Math.PI * 1.1) * fade;
  }
  return p;
}

// How quickly each joint follows its target (per second); the jump itself follows closely
const FOLLOW = { lift: 30, crouch: 16, tuck: 20, bounce: 18, tilt: 6, armL: 9, armR: 9, bendL: 10, bendR: 10, breathe: 20 };

function jointsOf(p) {
  const pelvis = [0, -8.6 - p.lift + p.crouch - p.bounce + p.breathe];
  const along = (len) => v2.add(pelvis, v2.mul(v2.dir(p.tilt), len));
  const shoulder = along(5.8);
  const arm = (side, a, bend) => {
    const root = v2.add(shoulder, [side * 1.1, 0.3]);
    const elbow = v2.add(root, v2.mul(v2.dir(p.tilt + side * a), 3.4));
    const fist = v2.add(elbow, v2.mul(v2.dir(p.tilt + side * (a - bend)), 3.4));
    return [root, elbow, fist];
  };
  const footY = -(p.lift * 0.85) - p.tuck;
  const spread = 2.5 - 0.7 * Math.min(1, p.lift / 4);
  const hipL = v2.add(pelvis, [-1, 0]);
  const hipR = v2.add(pelvis, [1, 0]);
  const footL = [-spread, Math.min(0, footY)];
  const footR = [spread, Math.min(0, footY)];
  return {
    torso: [pelvis, along(6.6)], head: along(8.95),
    L: arm(-1, p.armL, p.bendL), R: arm(1, p.armR, p.bendR),
    legL: [hipL, kneeOf(hipL, footL, -1), footL], legR: [hipR, kneeOf(hipR, footR, 1), footR],
  };
}

function Champion({ celebrating }) {
  const refs = useRef({});
  const since = useRef(-1);
  const clock = useRef(0);
  useEffect(() => { since.current = celebrating ? clock.current : -1; }, [celebrating]);
  const set = (key) => (node) => { refs.current[key] = node; };

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let pose = targetPose(0, -1);
    const attr = (key, name, value) => refs.current[key]?.setAttribute(name, value);
    const line = (pts) => `M${pts.map((q) => `${f2(q[0])} ${f2(q[1])}`).join(' L')}`;
    const draw = (now) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      clock.current += dt;
      const t = clock.current;
      const cs = since.current < 0 ? -1 : t - since.current;
      const target = targetPose(t, cs);
      const next = {};
      Object.keys(target).forEach((k) => {
        const follow = 1 - Math.exp(-dt * (FOLLOW[k] || 10));
        next[k] = pose[k] + (target[k] - pose[k]) * follow;
      });
      pose = next;
      const j = jointsOf(pose);
      attr('torso', 'd', line(j.torso));
      attr('head', 'cx', f2(j.head[0]));
      attr('head', 'cy', f2(j.head[1]));
      attr('band', 'transform', `translate(${f2(j.head[0])} ${f2(j.head[1])}) rotate(${f2(pose.tilt)})`);
      attr('armL', 'd', line(j.L));
      attr('armR', 'd', line(j.R));
      attr('fistL', 'cx', f2(j.L[2][0])); attr('fistL', 'cy', f2(j.L[2][1]));
      attr('fistR', 'cx', f2(j.R[2][0])); attr('fistR', 'cy', f2(j.R[2][1]));
      attr('legL', 'd', line(j.legL));
      attr('legR', 'd', line(j.legR));
      const shadow = Math.max(0.4, 1 - pose.lift / 12);
      attr('shadow', 'rx', f2(3.8 * shadow));
      attr('shadow', 'fill-opacity', f2(0.5 * shadow));
      // Confetti from the top of each jump
      const age = cs < 0 ? -1 : (cs % JUMP_LOOP) - (JUMP_AT + JUMP_TIME / 2);
      CONFETTI.forEach((c, i) => {
        const el = refs.current[`c${i}`];
        if (!el) return;
        if (age < 0 || age > 1.4) { el.setAttribute('opacity', '0'); return; }
        el.setAttribute('opacity', f2(Math.min(1, (1.4 - age) * 2)));
        el.setAttribute('transform', `translate(${f2(c.vx * age)} ${f2(-14 - c.vy * age + 16 * age * age)}) rotate(${f2(c.spin * age)})`);
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const suit = 'color-mix(in oklch, hsl(var(--foreground)) 78%, hsl(var(--primary)))';
  const skin = 'hsl(var(--foreground))';
  return (
    <g transform={`translate(${CHAMP_X} ${crest(CHAMP_X).toFixed(1)}) scale(1.5)`}>
      <ellipse ref={set('shadow')} cx="0" cy="0.4" rx="3.8" ry="0.8" fill="hsl(var(--background))" fillOpacity="0.5" />
      {CONFETTI.map((c, i) => (
        <rect key={i} ref={set(`c${i}`)} x={-c.w / 2} y="-0.45" width={c.w} height="0.9" rx="0.2" fill={`hsl(var(${c.color}))`} opacity="0" />
      ))}
      <g fill="none" strokeLinecap="round" strokeLinejoin="round">
        <path ref={set('legL')} stroke={suit} strokeWidth="1.6" />
        <path ref={set('legR')} stroke={suit} strokeWidth="1.6" />
        <path ref={set('torso')} stroke={suit} strokeWidth="2.8" />
        <path ref={set('armL')} stroke={suit} strokeWidth="1.45" />
        <path ref={set('armR')} stroke={suit} strokeWidth="1.45" />
      </g>
      <circle ref={set('fistL')} r="1.05" fill={skin} />
      <circle ref={set('fistR')} r="1.05" fill={skin} />
      <circle ref={set('head')} r="1.85" fill={skin} />
      <path ref={set('band')} d="M-1.8 -0.5 L1.8 -0.5" stroke="hsl(var(--primary))" strokeWidth="0.75" strokeLinecap="round" />
    </g>
  );
}

// ---- the route, the camps, and the light that climbs between them -------------------------------------
const wait = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
const CLIMB = { duration: 1.1, ease: [0.65, 0, 0.35, 1] };
const FADE_OUT = { duration: 1.2, ease: 'easeInOut' };
const FADE_IN = { duration: 0.9, ease: 'easeOut' };
const CHEER_MS = 4200;
const REST_MS = 3500;

/**
 * A loop while the page is open: from the camp you are at, the light climbs camp by camp to the
 * summit and the champion celebrates; then the light fades away, comes back at your camp, rests a
 * few seconds, and climbs again. Moving between steps moves the light; signing in takes it to the
 * top for good.
 */
function RouteLayer({ camps, current }) {
  const fractions = useMemo(() => Array.from({ length: camps }, (_, i) => i / (camps - 1)), [camps]);
  const target = fractions[Math.min(current, camps - 1)];
  const won = current === camps - 1;
  const progress = useMotionValue(0);
  const glow = useMotionValue(1);
  const [lit, setLit] = useState(1);
  const [cheering, setCheering] = useState(false);

  // The loop reads the latest step through refs, so it never restarts when the step changes
  const live = useRef({ fractions, target, won, resting: true });
  live.current = { ...live.current, fractions, target, won };

  useMotionValueEvent(progress, 'change', (v) => {
    const n = live.current.fractions.filter((f) => f <= v + 0.003).length;
    setLit((prev) => (prev === n ? prev : n));
  });

  useEffect(() => {
    let cancelled = false;
    const stop = () => cancelled || live.current.won;
    (async () => {
      await wait(700);
      while (!stop()) {
        live.current.resting = false;
        const steps = live.current.fractions;
        for (let i = 0; i < steps.length; i += 1) {
          if (steps[i] <= progress.get() + 0.003) continue;
          await animate(progress, steps[i], CLIMB);
          if (stop()) return;
          await wait(380);
          if (stop()) return;
        }
        setCheering(true);
        await wait(CHEER_MS);
        if (stop()) return;
        setCheering(false);
        // Fade away, and come back at the camp you are at
        await animate(glow, 0, FADE_OUT);
        if (stop()) return;
        progress.set(live.current.target);
        await animate(glow, 1, FADE_IN);
        live.current.resting = true;
        await wait(REST_MS);
      }
    })();
    return () => { cancelled = true; };
  }, [progress, glow]);

  // Between climbs the light follows the steps
  useEffect(() => {
    if (won || !live.current.resting) return undefined;
    const run = animate(progress, target, CLIMB);
    return () => run.stop();
  }, [target, won, progress]);

  // Signing in: straight to the top, and celebrate there
  useEffect(() => {
    if (!won) return undefined;
    let cancelled = false;
    (async () => {
      setCheering(false);
      animate(glow, 1, FADE_IN);
      await animate(progress, 1, { duration: 1.3, ease: [0.65, 0, 0.35, 1] });
      if (!cancelled) setCheering(true);
    })();
    return () => { cancelled = true; };
  }, [won, progress, glow]);

  const mx = useTransform(progress, (f) => ROUTE.at(f)[0]);
  const my = useTransform(progress, (f) => ROUTE.at(f)[1]);
  const [sx, sy] = ROUTE.at(1);
  const summitLit = lit >= camps;
  const check = 'M-1.9 0.1 L-0.5 1.6 L2 -1.3';

  return (
    <svg {...STAGE}>
      <path d={ROUTE.d} fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.45" strokeWidth="1.6" strokeDasharray="0.5 5" strokeLinecap="round" />

      <g transform={`translate(${sx.toFixed(1)} ${sy.toFixed(1)})`}>
        <path d="M0 -1 V-24" stroke="hsl(var(--foreground))" strokeOpacity="0.85" strokeWidth="1.4" strokeLinecap="round" />
        <path d="M0 -24 L15 -19.5 L0 -15 Z" fill="hsl(var(--foreground) / 0.6)">
          <animateTransform attributeName="transform" type="skewY" values="0;-6;0;5;0" dur="1.8s" repeatCount="indefinite" />
        </path>
      </g>

      {/* Unlit camps */}
      {fractions.map((f, i) => {
        const [x, y] = ROUTE.at(f);
        return <circle key={i} cx={x} cy={y} r="4.2" fill="hsl(var(--background))" stroke="hsl(var(--foreground) / 0.65)" strokeWidth="1.6" />;
      })}

      {/* Everything the climbing light touches, faded as one when a climb resets */}
      <motion.g style={{ opacity: glow }}>
        <motion.path d={ROUTE.d} fill="none" stroke="hsl(var(--primary))" strokeWidth="2.6" strokeLinecap="round" style={{ pathLength: progress }} />
        <g transform={`translate(${sx.toFixed(1)} ${sy.toFixed(1)})`}>
          <path d="M0 -24 L15 -19.5 L0 -15 Z" fill="hsl(var(--primary))" style={{ opacity: summitLit ? 1 : 0, transition: 'opacity 0.5s' }}>
            <animateTransform attributeName="transform" type="skewY" values="0;-6;0;5;0" dur="1.8s" repeatCount="indefinite" />
          </path>
        </g>
        {fractions.map((f, i) => {
          const [x, y] = ROUTE.at(f);
          const on = i < lit;
          return (
            <g key={i} transform={`translate(${x.toFixed(1)} ${y.toFixed(1)})`} style={{ opacity: on ? 1 : 0, transition: 'opacity 0.45s' }}>
              {/* A ring spreads out from each camp as it lights */}
              {on && (
                <motion.circle
                  fill="none"
                  stroke="hsl(var(--primary))"
                  strokeWidth="1.4"
                  initial={{ r: 4.5, opacity: 0.9 }}
                  animate={{ r: 15, opacity: 0 }}
                  transition={{ duration: 1.1, ease: 'easeOut' }}
                />
              )}
              <circle r="4.2" fill="hsl(var(--primary))" stroke="hsl(var(--primary))" strokeWidth="1.6" />
              <path d={check} fill="none" stroke="hsl(var(--primary-foreground))" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
            </g>
          );
        })}
        <motion.g style={{ x: mx, y: my }}>
          <circle r="6" fill="hsl(var(--primary))">
            <animate attributeName="r" values="5;14" dur="1.8s" repeatCount="indefinite" />
            <animate attributeName="opacity" values="0.5;0" dur="1.8s" repeatCount="indefinite" />
          </circle>
          <circle r="5.6" fill="hsl(var(--primary))" stroke="hsl(var(--background))" strokeWidth="1.2" />
          <circle r="1.9" fill="hsl(var(--primary-foreground))" />
        </motion.g>
      </motion.g>

      <Champion celebrating={cheering} />
    </svg>
  );
}

function Mountain({ camps, current }) {
  return (
    <>
      <MountainArt />
      <Mist />
      <RouteLayer camps={camps} current={current} />
      <Front />
    </>
  );
}

// ---- layout helpers --------------------------------------------------------------------------------
/** The visible height, which shrinks when the on-screen keyboard opens, so the page never scrolls */
function useViewportHeight() {
  const [height, setHeight] = useState(() => window.visualViewport?.height || window.innerHeight);
  useEffect(() => {
    const vv = window.visualViewport;
    const update = () => {
      setHeight(vv ? vv.height : window.innerHeight);
      if (window.scrollY) window.scrollTo(0, 0);
    };
    (vv || window).addEventListener('resize', update);
    vv?.addEventListener('scroll', update);
    return () => {
      (vv || window).removeEventListener('resize', update);
      vv?.removeEventListener('scroll', update);
    };
  }, []);
  return height;
}

/** Animates its height to fit what is inside, so the mountain above eases instead of jumping */
function AutoHeight({ children }) {
  const inner = useRef(null);
  const [height, setHeight] = useState('auto');
  useLayoutEffect(() => {
    const el = inner.current;
    if (!el) return undefined;
    const ro = new ResizeObserver(() => setHeight(el.offsetHeight));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <motion.div animate={{ height }} transition={{ duration: 0.4, ease: EASE_OUT }} className="-mx-1 overflow-hidden px-1">
      <div ref={inner} className="py-1">{children}</div>
    </motion.div>
  );
}

const pill = cn(
  'flex h-[52px] min-w-0 flex-1 items-center justify-center gap-2.5 rounded-2xl border border-border/70 bg-background/40 px-3 text-[15px] font-semibold text-foreground outline-none',
  'transition-[background-color,border-color,transform] hover:border-foreground/20 hover:bg-accent active:scale-[0.98] motion-reduce:active:scale-100',
  'focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60',
);

/** Passkey and Google side by side, so the first step fits on a small phone */
function QuickWays({ flow, signin }) {
  const { t, passkeyReady, passkeyLoading, signInWithPasskey, googleEnabled, googleLoading, signInWithGoogle } = flow;
  const passkey = signin && passkeyReady;
  if (!passkey && !googleEnabled) return null;
  return (
    <>
      <div className="flex gap-3">
        {passkey && (
          <button type="button" onClick={signInWithPasskey} disabled={passkeyLoading} aria-label={t('passkeySignIn')} className={pill}>
            {passkeyLoading ? <Loader2 className="h-5 w-5 animate-spin text-primary" aria-hidden="true" /> : <ScanFace className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />}
            <span className="truncate">{t('authPasskeyShort')}</span>
          </button>
        )}
        {googleEnabled && (
          <button type="button" onClick={signInWithGoogle} disabled={googleLoading} aria-label={t('continueWithGoogle')} className={pill}>
            {googleLoading ? <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" /> : <GoogleMark />}
            <span className="truncate">Google</span>
          </button>
        )}
      </div>
      <div className="my-3.5"><OrDivider flow={flow} /></div>
    </>
  );
}

/** One sentence with the two documents linked inside it, worded per language */
function LegalLine({ t, className }) {
  const link = 'rounded font-medium text-foreground/85 underline decoration-foreground/30 underline-offset-[3px] outline-none transition-colors hover:text-foreground hover:decoration-primary focus-visible:ring-2 focus-visible:ring-ring';
  const parts = t('authLegalLine').split(/(\{terms\}|\{privacy\})/);
  return (
    <p className={cn('text-balance text-center text-xs leading-relaxed text-muted-foreground', className)}>
      {parts.map((part, i) => {
        if (part === '{terms}') return <Link key={i} to="/terms-of-service" className={link}>{t('authLegalTerms')}</Link>;
        if (part === '{privacy}') return <Link key={i} to="/privacy-policy" className={link}>{t('authLegalPrivacy')}</Link>;
        return <React.Fragment key={i}>{part}</React.Fragment>;
      })}
    </p>
  );
}

// ---- the page --------------------------------------------------------------------------------------
const STEPS = { signin: ['email', 'password'], signup: ['email', 'name', 'password'] };
const coarse = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches;

export default function SummitLogin({ flow }) {
  const { t, isRTL, busy, entering, validateEmail, signIn, signUp } = flow;
  const height = useViewportHeight();
  const compact = height < 620; // keyboard open or a small phone: the tagline steps aside
  const short = height < 720; // small phones: the step title gives its room to the mountain

  const [mode, setMode] = useState('signin');
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [errorKey, setErrorKey] = useState(0);

  const signin = mode === 'signin';
  const steps = STEPS[mode];
  const current = steps[step];
  const camps = steps.length + 1;
  const camp = entering ? camps - 1 : step;

  const go = (next) => { setDir(next > step ? 1 : -1); setStep(next); setError(null); };
  const fail = (msg) => { setError(msg); setErrorKey((k) => k + 1); };
  const switchMode = () => {
    setDir(-1);
    setMode((m) => (m === 'signin' ? 'signup' : 'signin'));
    setStep(0);
    setPassword('');
    setError(null);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy || entering) return;
    if (current === 'email') {
      const problem = validateEmail(email);
      if (problem) fail(problem); else go(step + 1);
    } else if (current === 'name') {
      go(step + 1);
    } else {
      const problem = signin ? await signIn(email, password) : await signUp({ email, password, name });
      if (problem) fail(problem);
    }
  };

  const title = {
    email: signin ? 'authTitleSignIn' : 'authTitleSignUp',
    name: 'authNameTitle',
    password: signin ? 'authPasswordTitle' : 'authNewPasswordTitle',
  }[current];

  const flip = isRTL ? -1 : 1;
  const slide = {
    enter: (d) => ({ opacity: 0, x: 28 * d * flip, filter: 'blur(4px)' }),
    center: { opacity: 1, x: 0, filter: 'blur(0px)', transition: { duration: 0.4, ease: EASE_OUT } },
    exit: (d) => ({ opacity: 0, x: -28 * d * flip, filter: 'blur(4px)', transition: { duration: 0.18, ease: 'easeIn' } }),
  };
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const NextIcon = isRTL ? ArrowLeft : ArrowRight;

  return (
    <div className="ridge-scene fixed inset-x-0 top-0 overflow-hidden bg-background" style={{ height }}>
      <Backdrop />

      <motion.div
        className="relative flex h-full flex-col lg:grid lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]"
        animate={{ opacity: entering ? 0 : 1 }}
        transition={{ duration: 0.35, ease: EASE_OUT }}
      >
        {/* Brand, tagline and the mountain */}
        <div className="relative flex min-h-0 flex-1 flex-col">
          <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-[max(0.75rem,var(--safe-top))] lg:px-10 lg:pt-9">
            <div className="flex items-center gap-2.5">
              <AscentLogo motion="hover" className="w-10 lg:w-12" />
              <span className="text-lg font-bold tracking-tight text-foreground lg:text-xl">Ascent</span>
            </div>
            <LanguageSwitch flow={flow} className="lg:hidden" />
          </header>

          <AnimatePresence initial={false}>
            {!compact && (
              <motion.h1
                className="shrink-0 text-balance px-5 pt-[clamp(0.75rem,3vh,2.5rem)] text-[clamp(1.75rem,4.2vh,2.5rem)] font-bold leading-[1.08] tracking-tight text-foreground lg:max-w-xl lg:px-10 lg:pt-[8vh] lg:text-5xl"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.3, ease: EASE_OUT }}
              >
                {t('ascendTagline')}
              </motion.h1>
            )}
          </AnimatePresence>

          <div className="relative min-h-0 flex-1 lg:mb-[6vh] lg:me-[-8%]">
            <Mountain camps={camps} current={camp} />
          </div>
        </div>

        {/* The step: a sheet on phones, a floating panel beside the mountain on desktop */}
        <div className="relative shrink-0 lg:flex lg:items-center lg:justify-center lg:p-10">
          <div className="absolute end-10 top-9 hidden lg:block">
            <LanguageSwitch flow={flow} />
          </div>

          <div className="rounded-t-[28px] border-t border-border/60 bg-card/85 px-5 pb-[max(1rem,env(safe-area-inset-bottom))] pt-5 shadow-[0_-16px_40px_-20px_hsl(0_0%_0%/0.6)] backdrop-blur-xl lg:w-full lg:max-w-[420px] lg:rounded-[28px] lg:border lg:p-7 lg:shadow-[inset_0_1px_0_0_hsl(var(--foreground)/0.06),0_24px_60px_-24px_hsl(0_0%_0%/0.6)]">
            <div className="mx-auto max-w-[420px]">
              <AutoHeight>
                <AnimatePresence mode="popLayout" custom={dir} initial={false}>
                  <motion.form
                    key={`${mode}-${current}`}
                    custom={dir}
                    variants={slide}
                    initial="enter"
                    animate="center"
                    exit="exit"
                    onSubmit={submit}
                    noValidate
                  >
                    {(step > 0 || !short) && (
                    <div className={cn('flex min-h-11 items-center gap-1', short ? 'mb-2' : 'mb-4')}>
                      {step > 0 && (
                        <button
                          type="button"
                          onClick={() => go(step - 1)}
                          aria-label={t('authBack')}
                          className="-ms-2.5 grid h-11 w-11 shrink-0 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <BackIcon className="h-5 w-5" aria-hidden="true" />
                        </button>
                      )}
                      {short
                        ? <h2 className="sr-only">{t(title)}</h2>
                        : <h2 className="text-balance text-xl font-semibold tracking-tight text-foreground">{t(title)}</h2>}
                    </div>
                    )}

                    {current === 'email' && (
                      <>
                        <QuickWays flow={flow} signin={signin} />
                        <Field
                          id="summit-email"
                          label={t('email')}
                          type="email"
                          inputMode="email"
                          dir="ltr"
                          autoComplete={signin ? 'username webauthn' : 'email'}
                          autoCapitalize="none"
                          spellCheck={false}
                          enterKeyHint="next"
                          placeholder="name@example.com"
                          value={email}
                          onChange={(e) => { setEmail(e.target.value); if (error) setError(null); }}
                          error={error}
                          errorKey={errorKey}
                          autoFocus={!coarse}
                        />
                      </>
                    )}

                    {current === 'name' && (
                      <Field
                        id="summit-name"
                        label={t('fullName')}
                        hint={t('authNameHint')}
                        type="text"
                        autoComplete="name"
                        enterKeyHint="next"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        autoFocus
                      />
                    )}

                    {current === 'password' && (
                      <>
                        <button
                          type="button"
                          onClick={() => go(0)}
                          className="group mb-4 inline-flex max-w-full items-center gap-2.5 rounded-full border border-border/70 bg-background/50 py-1.5 pe-3 ps-1.5 text-sm outline-none transition-colors hover:border-foreground/25 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold uppercase text-primary-foreground">{email.trim()[0]}</span>
                          <span className="truncate font-medium text-foreground" dir="ltr">{email.trim()}</span>
                          <span className="shrink-0 text-primary group-hover:underline">{t('authChangeEmail')}</span>
                        </button>
                        {/* Lets password managers file the password under the right account */}
                        <input type="email" name="username" autoComplete="username" value={email} readOnly tabIndex={-1} aria-hidden="true" className="sr-only" />
                        <PasswordField
                          flow={flow}
                          id="summit-password"
                          label={t('password')}
                          autoComplete={signin ? 'current-password' : 'new-password'}
                          enterKeyHint="go"
                          meter={!signin}
                          hint={!signin ? t('authPasswordHint') : undefined}
                          value={password}
                          onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
                          error={error}
                          errorKey={errorKey}
                          autoFocus
                        />
                      </>
                    )}

                    <PrimaryButton
                      type="submit"
                      loading={busy || entering}
                      className="mt-5"
                      icon={current !== 'password' ? <NextIcon className="h-[18px] w-[18px]" aria-hidden="true" /> : null}
                    >
                      {current !== 'password' ? t('authContinue') : signin ? t('signIn') : t('createAccount')}
                    </PrimaryButton>
                  </motion.form>
                </AnimatePresence>
              </AutoHeight>

              <p className="mt-4 text-center text-sm text-muted-foreground">
                {signin ? t('authNewHere') : t('authHaveAccount')}{' '}
                <button
                  type="button"
                  onClick={switchMode}
                  className="rounded font-semibold text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {signin ? t('authCreateOne') : t('authSignInInstead')}
                </button>
              </p>
              {step === 0 && !compact && <LegalLine t={t} className="mt-2" />}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
