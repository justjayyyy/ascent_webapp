// True on touch-first devices (phones, tablets). On these, focusing a text field opens the on-screen
// keyboard, so nothing should take focus unless the person tapped into a field themselves.
export const isCoarsePointer = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(pointer: coarse)').matches;

// For Radix onOpenAutoFocus: on touch, focus the surface itself instead of its first field, so opening
// a dialog or popover doesn't pop the keyboard. Focus still moves into it for screen readers.
export function keepKeyboardDown(e) {
  if (!isCoarsePointer()) return;
  e.preventDefault();
  e.currentTarget?.focus?.({ preventScroll: true });
}
