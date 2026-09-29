import React, { useRef } from 'react';
import './AscentLogo.css';

// Layered 3D Ascent hiker logo, coloured from the active theme (--primary).
// Size comes from the className width (e.g. "w-24"); height follows the artwork.
//   motion="full"  – continuous float/rotate, pulsing bars + arrow, shine sweep, pointer tilt
//   motion="hover" – still until hovered, then tilts and animates
//   motion="none"  – flat
const DEPTH_STEPS = Array.from({ length: 16 }, (_, i) => i + 1);

export default function AscentLogo({ motion = 'full', className = '', alt = '' }) {
  const rootRef = useRef(null);

  const handleMove = (e) => {
    const el = rootRef.current;
    if (!el || motion === 'none') return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty('--al-ry', `${(x * 60).toFixed(2)}deg`);
    el.style.setProperty('--al-rx', `${(-y * 45).toFixed(2)}deg`);
  };

  const handleLeave = () => {
    const el = rootRef.current;
    if (!el) return;
    el.style.setProperty('--al-ry', '0deg');
    el.style.setProperty('--al-rx', '0deg');
  };

  return (
    <div
      ref={rootRef}
      className={`ascent-logo ${className}`}
      data-motion={motion}
      role={alt ? 'img' : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
    >
      <div className="al-glow" />
      <div className="al-stage">
        <div className="al-float">
          {DEPTH_STEPS.map((k) => (
            <div key={k} className="al-layer al-depth" style={{ '--k': k }} />
          ))}
          <div className="al-layer al-outline" />
          <div className="al-layer al-mountain" />
          <div className="al-layer al-hiker" />
          <div className="al-layer al-accent" />
          <div className="al-layer al-shine" />
          <div className="al-layer al-bar al-bar1" />
          <div className="al-layer al-bar al-bar2" />
          <div className="al-layer al-arrow-outline" />
          <div className="al-layer al-arrow" />
        </div>
      </div>
    </div>
  );
}
