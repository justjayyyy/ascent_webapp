// The app's animation library. `motion` here is Motion's lightweight `m` component: it carries no
// animation code itself, so the first screen downloads less. <MotionFeatures> (App.jsx) loads the
// animation, gesture and layout code right after start-up, and only then do things move.
export * from 'motion/react';
export { m as motion } from 'motion/react';
