import { useCallback, useRef } from "react"

// The last few elements that had focus, newest last. A field with autoFocus takes focus as the dialog mounts, before
// anything here runs (and Radix then skips onOpenAutoFocus), so document.activeElement alone would be that field.
const recent = []
if (typeof document !== "undefined") {
  document.addEventListener("focusin", (e) => {
    recent.push(e.target)
    if (recent.length > 8) recent.shift()
  }, true)
}

function openerOutside(content) {
  const now = document.activeElement
  if (!content.contains(now)) return now
  for (let i = recent.length - 1; i >= 0; i -= 1) {
    if (!content.contains(recent[i])) return recent[i]
  }
  return null
}

/**
 * Focus goes back to whatever had it when a dialog opened, once the dialog closes (WCAG 2.4.3). Radix returns focus
 * only to its own Trigger, and the app opens most dialogs from ordinary buttons with controlled state, so without
 * this focus fell to the page body and keyboard and screen-reader users started again from the top.
 * Returns a ref for the content (merged with the forwarded one) and its onCloseAutoFocus; a caller's own
 * onCloseAutoFocus that prevents the default still wins.
 */
export function useReturnFocus(forwardedRef, onCloseAutoFocus) {
  const before = useRef(null)
  const content = useRef(null)
  // Radix re-attaches the ref on renders; only a new content element (the dialog opening) remembers the opener
  const ref = useCallback((node) => {
    if (node && node !== content.current) {
      content.current = node
      before.current = openerOutside(node)
    }
    if (typeof forwardedRef === "function") forwardedRef(node)
    else if (forwardedRef) forwardedRef.current = node
  }, [forwardedRef])
  const handleClose = useCallback((e) => {
    onCloseAutoFocus?.(e)
    if (e.defaultPrevented) return
    const el = before.current
    before.current = null
    if (el && el !== document.body && el.isConnected && typeof el.focus === "function") {
      e.preventDefault()
      el.focus({ preventScroll: true })
    }
  }, [onCloseAutoFocus])
  return { ref, onCloseAutoFocus: handleClose }
}
