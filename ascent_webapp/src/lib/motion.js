// The app's animation library. `motion` here is Motion's lightweight `m` component; the animation, gesture
// and layout code it needs comes from <LazyMotion features={domMax}> in App.jsx, with the first download
// (not after it: content that fades in would stay invisible until it arrived).
export * from 'motion/react';
export { m as motion } from 'motion/react';
