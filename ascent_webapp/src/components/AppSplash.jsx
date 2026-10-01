import React from 'react';
import AscentLogo from '@/components/AscentLogo';

/**
 * The climbing logo on the page colour with a sweeping progress line. Used as the first frame of the
 * app while it checks the sign-in, and (with a greeting) as the moment between signing in and the
 * dashboard, so both feel like the same app opening.
 */
export function SplashScene({ greeting, detail }) {
  return (
    <div className="relative flex flex-col items-center px-6 text-center">
      <AscentLogo motion="full" className="w-28 sm:w-32" />
      {greeting && (
        <p className="mt-6 text-balance text-xl font-semibold tracking-tight text-foreground sm:text-2xl">{greeting}</p>
      )}
      {detail && <p className="mt-1.5 text-sm text-muted-foreground">{detail}</p>}
      <span className={`${greeting ? 'mt-6' : 'mt-5'} h-1 w-24 overflow-hidden rounded-full bg-foreground/10`}>
        <span className="block h-full w-1/3 rounded-full bg-primary [animation:splash-sweep_1.1s_cubic-bezier(0.65,0,0.35,1)_infinite] motion-reduce:[animation:none]" />
      </span>
    </div>
  );
}

export function SplashGlow() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_32%_at_50%_46%,hsl(var(--glow)/0.16),transparent_70%)]"
    />
  );
}

export default function AppSplash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background" role="status" aria-label="Ascent">
      <SplashGlow />
      <div className="animate-in fade-in zoom-in-95 duration-500 ease-out motion-reduce:animate-none">
        <SplashScene />
      </div>
    </div>
  );
}
