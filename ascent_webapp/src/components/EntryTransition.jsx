import React, { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { SplashScene, SplashGlow } from '@/components/AppSplash';

// The moment between signing in and the app: the login page hands off to this overlay, the route
// changes underneath it, and it lifts away once the dashboard has had time to paint.
const listeners = new Set();

/** Show the opening overlay. `greeting` is already in the signed-in user's language. */
export function startEntry({ greeting, detail }) {
  const entry = { greeting, detail, id: Date.now() };
  listeners.forEach((fn) => fn(entry));
}

const HOLD_MS = 1700;
const HOLD_REDUCED_MS = 900;
const EASE_OUT = [0.16, 1, 0.3, 1];

export default function EntryTransition() {
  const [entry, setEntry] = useState(null);
  const reduce = useReducedMotion();

  useEffect(() => {
    listeners.add(setEntry);
    return () => { listeners.delete(setEntry); };
  }, []);

  useEffect(() => {
    if (!entry) return undefined;
    const timer = setTimeout(() => setEntry(null), reduce ? HOLD_REDUCED_MS : HOLD_MS);
    return () => clearTimeout(timer);
  }, [entry, reduce]);

  return (
    <AnimatePresence>
      {entry && (
        <motion.div
          key={entry.id}
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-[200] grid place-items-center bg-background"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: reduce ? 0.15 : 0.35, ease: EASE_OUT } }}
          exit={{ opacity: 0, transition: { duration: reduce ? 0.2 : 0.6, ease: EASE_OUT, delay: reduce ? 0 : 0.08 } }}
        >
          <SplashGlow />
          <motion.div
            initial={reduce ? false : { opacity: 0, scale: 0.92, filter: 'blur(6px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)', transition: { duration: 0.6, ease: EASE_OUT } }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, scale: 1.08, filter: 'blur(10px)', transition: { duration: 0.5, ease: EASE_OUT } }}
          >
            <SplashScene greeting={entry.greeting} detail={entry.detail} />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
