import React from 'react';
import AscentLogo from '@/components/AscentLogo';

/**
 * The first frame of the app while it checks the sign-in on a device with no saved session: the
 * climbing logo on the page colour, so launching from the home screen looks like opening an app,
 * not like a web page loading.
 */
export default function AppSplash() {
  return (
    <div className="fixed inset-0 grid place-items-center bg-background" role="status" aria-label="Ascent">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(40%_32%_at_50%_46%,hsl(var(--glow)/0.16),transparent_70%)]"
      />
      <div className="relative flex flex-col items-center gap-5 animate-in fade-in zoom-in-95 duration-500 ease-out motion-reduce:animate-none">
        <AscentLogo motion="full" className="w-28" />
        <span className="h-1 w-24 overflow-hidden rounded-full bg-foreground/10">
          <span className="block h-full w-1/3 rounded-full bg-primary [animation:splash-sweep_1.1s_cubic-bezier(0.65,0,0.35,1)_infinite] motion-reduce:[animation:none]" />
        </span>
      </div>
    </div>
  );
}
