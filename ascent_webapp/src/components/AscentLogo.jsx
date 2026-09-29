import React, { useEffect, useId, useRef } from 'react';
import './AscentLogo.css';

// Layered 3D Ascent hiker logo, coloured from the active palette (--logo-* / --primary).
// Size comes from the className width (e.g. "w-24"); height follows the artwork.
//   motion="full"  – float/tilt, rising bars, the comet-trail growth line, shine, and the hiker climbing the mountain
//   motion="hover" – still until hovered
//   motion="none"  – flat, hiker at rest
//
// The hiker's upper body is the original artwork; the legs are drawn as jointed limbs (hip, knee,
// ankle) and solved with two-bone IK, so each foot stays planted on the slope while the body moves
// over it, then lifts and swings forward, like a real step.

const DEPTH_STEPS = Array.from({ length: 12 }, (_, i) => i + 1);

// ---- geometry, in the artwork's 560 x 521 space ------------------------------------------------
// Height of the mountain's left edge at x = 20, 30, ... (measured from the artwork, made monotonic).
// The hiker's feet stand on this line.
const GROUND = [
  477, 463, 450, 439, 428, 416, 408, 395, 395, 395, 389, 381, 381, 381, 376, 366, 356, 346, 324, 316, 308, 308,
  308, 301, 290, 278, 266, 254, 242, 236,
];
const groundY = (x) => {
  const f = Math.min(Math.max((x - 20) / 10, 0), GROUND.length - 1.001);
  const i = Math.floor(f);
  return GROUND[i] + (GROUND[i + 1] - GROUND[i]) * (f - i);
};
const FORWARD = [1, 0];
const SCALE = 0.78; // the whole hiker is drawn a little smaller than the artwork
const HIP0 = [188, 236]; // where the raster torso expects its hip
const SHOULDER = [232, 152];
const HAND = [304, 146]; // where the hand grips the pole in the artwork
// The far arm (behind the body) is drawn as a jointed limb
const SHOULDER2 = [234, 154];
const HAND2 = [296, 152];
const UPPER_ARM = 44;
const FOREARM = 46;
const POLE_REACH = 134; // how far ahead of the hip the pole is planted
// The growth arrow. It starts at the foot of the mountain where the hiker appears, follows the slope
// just above the hiker's path, then breaks away into a rising chart line with an arrowhead. It is drawn
// in step with the climb, so it always leads the way. (artwork units)
const SLOPE_X = [58, 88, 118, 148, 178, 208, 238, 268, 298];
const ARROW = [
  ...SLOPE_X.map((x) => [x, groundY(x) - 20]),
  [372, 206],
  [424, 224],
  [488, 80],
];
const ARROW_SEGS = ARROW.slice(1).map((pt, i) => {
  const [x0, y0] = ARROW[i];
  const length = Math.hypot(pt[0] - x0, pt[1] - y0);
  return { from: ARROW[i], length, angle: (Math.atan2(pt[1] - y0, pt[0] - x0) * 180) / Math.PI };
});
const ARROW_TOTAL = ARROW_SEGS.reduce((n, seg) => n + seg.length, 0);
const ARROW_D = `M ${ARROW.map((pt) => pt.map((v) => v.toFixed(1)).join(' ')).join(' L ')}`;
const ARROW_CENTER = [420, 170];
const easeInOut = (x) => 0.5 - 0.5 * Math.cos(Math.PI * x);
// Position and heading of the arrow tip after travelling `dist` along the polyline
function arrowTip(dist) {
  let left = dist;
  for (let i = 0; i < ARROW_SEGS.length; i += 1) {
    const seg = ARROW_SEGS[i];
    if (left <= seg.length || i === ARROW_SEGS.length - 1) {
      const r = (seg.angle * Math.PI) / 180;
      return { pt: [seg.from[0] + Math.cos(r) * left, seg.from[1] + Math.sin(r) * left], angle: seg.angle };
    }
    left -= seg.length;
  }
  return { pt: ARROW[0], angle: 0 };
}

const START_X = 40; // where the hiker appears, at the foot of the mountain
const TRAVEL_X = 194; // how far uphill they walk before the summit
const HIP_HEIGHT = 155; // straight up from the ground point: the body stands vertical, legs hang down
const THIGH = 74;
const SHIN = 74;
const ANKLE = 12;
const LIFT = 16;

// ---- timeline ------------------------------------------------------------------------------------
const STRIDE = 1.8; // seconds per full stride of one leg
const STEP = 34; // how far a foot travels between plant and lift-off (in artwork units)
const FADE_IN = 0.4;
const WALK_FROM = 0.2;
const WALK_TIME = TRAVEL_X / (STEP / (0.6 * STRIDE)); // speed follows from step length and cadence
const WALK_TO = WALK_FROM + WALK_TIME;
const FADE_OUT = 0.8; // the hiker has faded away before reaching the top
const FADE_OUT_AT = WALK_TO - FADE_OUT - 0.1;
const LOOP = WALK_TO + 1.1; // the arrow holds at its tip for a moment after the hiker has faded
const STANCE = 0.6;

const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const mul = (a, k) => [a[0] * k, a[1] * k];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const len = (a) => Math.hypot(a[0], a[1]);
const fmt = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`;
const ease = (x) => x * x * (3 - 2 * x);

// Tapered limb between two joints, with round ends.
function limb(a, b, ra, rb) {
  const d = sub(b, a);
  const l = len(d) || 1;
  const p = [-d[1] / l, d[0] / l];
  const a1 = add(a, mul(p, ra));
  const a2 = sub(a, mul(p, ra));
  const b1 = add(b, mul(p, rb));
  const b2 = sub(b, mul(p, rb));
  return `M ${fmt(a1)} L ${fmt(b1)} A ${rb} ${rb} 0 0 0 ${fmt(b2)} L ${fmt(a2)} A ${ra} ${ra} 0 0 0 ${fmt(a1)} Z`;
}

// Middle joint of a two-bone chain, bent towards `prefer`.
function joint(a, b, l1, l2, prefer) {
  const d = sub(b, a);
  const dist = Math.min(len(d) || 1, l1 + l2 - 0.5);
  const along = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(l1 * l1 - along * along, 0));
  const dir = mul(d, 1 / (len(d) || 1));
  let perp = [-dir[1], dir[0]];
  if (perp[0] * prefer[0] + perp[1] * prefer[1] < 0) perp = mul(perp, -1);
  return add(add(a, mul(dir, along)), mul(perp, h));
}

// Knee position for a hip and ankle, bent forward (uphill, the direction of travel).
function knee(hip, ankle) {
  const d = sub(ankle, hip);
  const dist = Math.min(len(d), THIGH + SHIN - 0.5);
  const mid = add(hip, mul(d, 0.5));
  const h = Math.sqrt(Math.max(THIGH * THIGH - (dist / 2) * (dist / 2), 0));
  const dir = mul(d, 1 / (len(d) || 1));
  let perp = [-dir[1], dir[0]];
  if (perp[0] * FORWARD[0] + perp[1] * FORWARD[1] < 0) perp = mul(perp, -1);
  return add(mid, mul(perp, h));
}

// One leg for a given stride phase (0..1); returns the SVG paths.
function leg(ground, hipPos, phase, stride) {
  const half = stride / 2;
  let along;
  let lift = 0;
  if (phase < STANCE) {
    along = half - stride * (phase / STANCE); // planted: the body moves over the foot
  } else {
    const x = (phase - STANCE) / (1 - STANCE);
    along = -half + stride * ease(x); // swing through
    lift = LIFT * Math.sin(Math.PI * x);
  }
  const fx = ground[0] + along;
  const ankle = [fx, groundY(fx) - ANKLE - lift];
  const k = knee(hipPos, ankle);
  const toe = add(ankle, [24, -3]);
  return {
    thigh: limb(hipPos, k, 25, 17),
    shin: limb(k, ankle, 17, 12),
    foot: limb(ankle, toe, 12, 10),
  };
}

const rot = (p, c, deg) => {
  const r = (deg * Math.PI) / 180;
  const x = p[0] - c[0];
  const y = p[1] - c[1];
  return [c[0] + x * Math.cos(r) - y * Math.sin(r), c[1] + x * Math.sin(r) + y * Math.cos(r)];
};

function pose(t, motion, hovered) {
  const still = motion === 'none' || (motion === 'hover' && !hovered);
  const time = still ? 0.42 * LOOP : t % LOOP;
  const walkT = Math.min(Math.max(time - WALK_FROM, 0), WALK_TO - WALK_FROM);
  const progress = walkT / (WALK_TO - WALK_FROM);
  const stride = STEP;
  const gx = START_X + TRAVEL_X * progress;
  const ground = [gx, groundY(gx)];
  const phase = still ? 0.18 : (walkT / STRIDE) % 1;
  const bob = still ? 0 : 2.6 * Math.cos(4 * Math.PI * phase);
  const hip = [gx + 8, ground[1] - (HIP_HEIGHT + bob)];
  const near = leg(ground, hip, phase, stride);
  const far = leg(ground, hip, (phase + 0.5) % 1, stride);
  let opacity = 1;
  if (!still) {
    if (time < FADE_IN) opacity = time / FADE_IN;
    else if (time > FADE_OUT_AT) opacity = Math.max(0, 1 - (time - FADE_OUT_AT) / FADE_OUT);
  }

  // Upper body, coordinated with the steps. Each pole works against the opposite leg: it is planted
  // ahead just as that foot lands, stays put while the body moves over it, lifts at the end of the
  // stance, and swings forward to plant again. The two poles are half a stride apart, like the legs.
  // The torso leans into each push-off.
  const speed = STEP / (STANCE * STRIDE);
  const poleFor = (off) => {
    const u = walkT / STRIDE + off;
    const kk = Math.floor(u);
    const pp = still ? 0.72 : u - kk;
    const plantX = (n) => START_X + speed * (n + 0.5 - off) * STRIDE + POLE_REACH;
    let tipX;
    let lift = 0;
    let th;
    if (pp >= 0.5) {
      tipX = still ? gx + POLE_REACH - off * 60 : plantX(kk);
      th = -5 + 10 * ((pp - 0.5) / 0.5);
    } else {
      const q = pp / 0.5;
      tipX = plantX(kk - 1) + (plantX(kk) - plantX(kk - 1)) * ease(q);
      lift = 18 * Math.sin(Math.PI * q);
      th = 5 - 10 * ease(q);
    }
    return { tip: [tipX, groundY(tipX) - lift], th };
  };
  const lean = still ? 0 : 1.5 * Math.cos(4 * Math.PI * (phase - 0.3));
  const dx = hip[0] - HIP0[0];
  const dy = hip[1] - HIP0[1];
  const place = (pt, c, deg) => add(rot(rot(pt, c, deg), HIP0, lean), [dx, dy]);

  const nearPole = poleFor(0);
  const theta = nearPole.th;
  const grip = place(HAND, SHOULDER, theta);
  const pole = `M ${fmt(grip)} L ${fmt(nearPole.tip)}`;

  const farPole = poleFor(0.5);
  const shoulder2 = place(SHOULDER2, SHOULDER2, 0);
  const hand2 = place(HAND2, SHOULDER2, farPole.th);
  const elbow = joint(shoulder2, hand2, UPPER_ARM, FOREARM, [-0.25, 1]);
  const farArm = {
    upper: limb(shoulder2, elbow, 13, 11),
    fore: limb(elbow, hand2, 11, 9),
    hand: limb(hand2, add(hand2, [0.1, 0]), 10, 10),
    pole: `M ${fmt(hand2)} L ${fmt(farPole.tip)}`,
  };
  // The arrow is drawn slowly, in step with the climb (starting when the hiker appears), reaches its
  // tip as the hiker would reach the top, holds with a very gentle pulse, then fades. It loops with them.
  const drawn = still ? 1 : easeInOut(Math.min(Math.max(progress, 0), 1));
  const pulse = !still && time > WALK_TO ? 0.5 + 0.5 * Math.sin((2 * Math.PI * (time - WALK_TO)) / 2.2) : 0;
  const arrowFadeAt = WALK_TO + 0.5;
  const arrowAlpha = still
    ? 1
    : Math.min(time / FADE_IN, 1) * (1 - Math.min(Math.max((time - arrowFadeAt) / (LOOP - arrowFadeAt), 0), 1));
  const tip = arrowTip(drawn * ARROW_TOTAL);
  return { hip, ground, near, far, opacity, theta, lean, pole, farArm, drawn, pulse, arrowAlpha, tip };
}

export default function AscentLogo({ motion = 'full', className = '', alt = '' }) {
  const rootRef = useRef(null);
  const svgRef = useRef(null);
  const trailRef = useRef(null);
  const els = useRef({});
  const hovered = useRef(false);
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '');

  // Drive the hiker
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const set = (key, attr, value) => {
      const el = els.current[key];
      if (el) el.setAttribute(attr, value);
    };
    const draw = (now) => {
      const p = pose((now - start) / 1000, motion, hovered.current);
      const dx = p.hip[0] - HIP0[0];
      const dy = p.hip[1] - HIP0[1];
      set('scale', 'transform', `translate(${p.ground[0].toFixed(1)} ${p.ground[1].toFixed(1)}) scale(${SCALE}) translate(${(-p.ground[0]).toFixed(1)} ${(-p.ground[1]).toFixed(1)})`);
      const move = `translate(${dx.toFixed(1)} ${dy.toFixed(1)}) rotate(${p.lean.toFixed(2)} ${HIP0[0]} ${HIP0[1]})`;
      set('body', 'transform', move);
      set('arm', 'transform', `${move} rotate(${p.theta.toFixed(2)} ${SHOULDER[0]} ${SHOULDER[1]})`);
      set('pole', 'd', p.pole);
      set('farUpper', 'd', p.farArm.upper);
      set('farFore', 'd', p.farArm.fore);
      set('farHand', 'd', p.farArm.hand);
      set('pole2', 'd', p.farArm.pole);
      const k = 1 + 0.014 * p.pulse;
      set('arrowGroup', 'transform', `translate(${ARROW_CENTER[0]} ${ARROW_CENTER[1]}) scale(${k.toFixed(3)}) translate(${-ARROW_CENTER[0]} ${-ARROW_CENTER[1]})`);
      set('shaft', 'stroke-dashoffset', (1 - Math.min(p.drawn, 1)).toFixed(4));
      set('shaftShine', 'stroke-dashoffset', (1 - Math.min(p.drawn, 1)).toFixed(4));
      set('shaftShine', 'stroke-opacity', (0.2 * p.pulse).toFixed(3));
      set('head', 'transform', `translate(${p.tip.pt[0].toFixed(1)} ${p.tip.pt[1].toFixed(1)}) rotate(${p.tip.angle.toFixed(1)})`);
      set('head', 'opacity', p.drawn > 0.02 ? '1' : '0');
      if (trailRef.current) trailRef.current.style.opacity = String(p.arrowAlpha);
      for (const [name, l] of [['far', p.far], ['near', p.near]]) {
        set(`${name}Thigh`, 'd', l.thigh);
        set(`${name}Shin`, 'd', l.shin);
        set(`${name}Foot`, 'd', l.foot);
      }
      if (svgRef.current) svgRef.current.style.opacity = String(p.opacity);
      if (motion !== 'none') raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [motion]);

  const handleMove = (e) => {
    const el = rootRef.current;
    if (!el || motion === 'none') return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--al-ry', `${(x * 24).toFixed(2)}deg`);
    el.style.setProperty('--al-rx', `${(-y * 18).toFixed(2)}deg`);
  };

  const handleLeave = () => {
    hovered.current = false;
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--al-ry', '0deg');
    el.style.setProperty('--al-rx', '0deg');
  };

  const ref = (key) => (node) => {
    els.current[key] = node;
  };
  const fill = `url(#hg${uid})`;

  return (
    <div
      ref={rootRef}
      className={`ascent-logo ${className}`}
      data-motion={motion}
      style={{ '--al-loop': `${LOOP.toFixed(2)}s` }}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      onPointerEnter={() => { hovered.current = true; }}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="al-glow" />
      <div className="al-stage">
        <div className="al-float">
          {DEPTH_STEPS.map((k) => (
            <div key={k} className="al-layer al-depth" style={{ '--k': k }} />
          ))}
          <div className="al-layer al-mountain" />
          <div className="al-layer al-accent" />
          <div className="al-layer al-shine" />
          <div className="al-layer al-bar al-bar1" />
          <div className="al-layer al-bar al-bar2" />
          <svg ref={trailRef} className="al-trail-svg" viewBox="0 0 560 521" aria-hidden="true">
            <defs>
              {/* Fades in from the foot of the mountain, brightens along the climb, pale highlight at the tip */}
              <linearGradient id={`ag${uid}`} gradientUnits="userSpaceOnUse" x1={ARROW[0][0]} y1={ARROW[0][1]} x2={ARROW[ARROW.length - 1][0]} y2={ARROW[ARROW.length - 1][1]}>
                <stop offset="0" style={{ stopColor: 'var(--al-accent-deep)', stopOpacity: 0 }} />
                <stop offset="0.3" style={{ stopColor: 'var(--al-bright)', stopOpacity: 0.55 }} />
                <stop offset="0.7" style={{ stopColor: 'var(--al-bright)', stopOpacity: 1 }} />
                <stop offset="0.9" style={{ stopColor: 'var(--al-tint)' }} />
                <stop offset="1" style={{ stopColor: 'var(--al-bright)' }} />
              </linearGradient>
            </defs>
            <g ref={ref('arrowGroup')}>
              <path
                ref={ref('shaft')}
                d={ARROW_D}
                pathLength="1"
                fill="none"
                stroke={`url(#ag${uid})`}
                strokeWidth="11"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="1 3"
                strokeDashoffset="1"
              />
              <path
                ref={ref('shaftShine')}
                d={ARROW_D}
                pathLength="1"
                fill="none"
                stroke="#fff"
                strokeOpacity="0"
                strokeWidth="3.5"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray="1 3"
                strokeDashoffset="1"
              />
              <g ref={ref('head')} opacity="0">
                <path d="M 3 0 L -28 -18 L -21 0 L -28 18 Z" fill={`url(#ag${uid})`} stroke={`url(#ag${uid})`} strokeWidth="5" strokeLinejoin="round" />
                <path d="M 3 0 L -28 -18 L -21 0 Z" fill="#fff" fillOpacity="0.2" />
              </g>
            </g>
          </svg>
          <svg ref={svgRef} className="al-hiker-svg" viewBox="0 0 560 521" aria-hidden="true">
            <defs>
              <linearGradient id={`hg${uid}`} gradientUnits="userSpaceOnUse" x1="0" y1="20" x2="0" y2="430">
                <stop offset="0" style={{ stopColor: 'var(--al-hiker-hi)' }} />
                <stop offset="1" style={{ stopColor: 'var(--al-hiker)' }} />
              </linearGradient>
              <mask id={`mt${uid}`} maskUnits="userSpaceOnUse" x="-200" y="-200" width="960" height="921" style={{ maskType: 'alpha' }}>
                <image href="/logo/p-torso.png" width="560" height="521" />
              </mask>
              <mask id={`ma${uid}`} maskUnits="userSpaceOnUse" x="-200" y="-200" width="960" height="921" style={{ maskType: 'alpha' }}>
                <image href="/logo/p-arm.png" width="560" height="521" />
              </mask>
              {/* Trim the artwork's pelvis, which juts forward where the old thigh started, so the hips are straight */}
              <clipPath id={`hc${uid}`}>
                <polygon points="-200,-200 760,-200 760,196 224,196 218,216 212,238 162,238 140,214 124,190 -200,190" />
              </clipPath>
            </defs>
            <g ref={ref('scale')}>
            <g>
              <g opacity="0.7">
                <path ref={ref('pole2')} fill="none" stroke={fill} strokeWidth="9" strokeLinecap="round" />
                <path ref={ref('farUpper')} fill={fill} />
                <path ref={ref('farFore')} fill={fill} />
                <path ref={ref('farHand')} fill={fill} />
              </g>
              <path ref={ref('farThigh')} fill={fill} />
              <path ref={ref('farShin')} fill={fill} />
              <path ref={ref('farFoot')} fill={fill} />
            </g>
            <g ref={ref('body')}>
              <g clipPath={`url(#hc${uid})`}>
                <rect x="-200" y="-200" width="960" height="921" fill={fill} mask={`url(#mt${uid})`} />
              </g>
            </g>
            <g ref={ref('arm')}>
              <rect x="-200" y="-200" width="960" height="921" fill={fill} mask={`url(#ma${uid})`} />
            </g>
            <path ref={ref('pole')} fill="none" stroke={fill} strokeWidth="10" strokeLinecap="round" />
            <g>
              <path ref={ref('nearThigh')} fill={fill} />
              <path ref={ref('nearShin')} fill={fill} />
              <path ref={ref('nearFoot')} fill={fill} />
            </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
