// Text helpers for automation input (Apple Wallet taps, later SMS alerts).

// Direction marks Hebrew/Arabic UIs put around numbers and names.
const BIDI = /[‎‏؜‪-‮⁦-⁩]/g;

export function stripBidi(input) {
  return String(input ?? '').replace(BIDI, '');
}

/** Display-safe text: NFC, no direction/control characters, single spaces, capped length. */
export function cleanText(input, max = 120) {
  return stripBidi(input)
    .normalize('NFC')
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

const PROCESSOR_PREFIX = /^(?:paypal|sq|tst|pp|sumup|zettle)\s*\*\s*/;
const LEGAL_SUFFIX = /(?<![\p{L}\p{N}])(?:ltd|inc|llc|co|בעמ)(?![\p{L}\p{N}])/gu;

/**
 * Stable key for "same merchant" comparisons and for remembering categories.
 * "Aroma Espresso Bar", "AROMA ESPRESSO BAR #1234" and "aroma espresso bar 0042" all give the same key.
 */
export function merchantKey(input) {
  let s = cleanText(input, 200).toLowerCase();
  s = s.replace(/[֑-ׇ]/g, '');            // Hebrew niqqud / cantillation
  s = s.replace(PROCESSOR_PREFIX, '');              // "PAYPAL *SPOTIFY" -> "spotify"
  s = s.replace(/["'`´״׳]/g, '');                   // quotes, geresh / gershayim (בע"מ -> בעמ)
  s = s.replace(LEGAL_SUFFIX, ' ');
  s = s.replace(/[#*]\s*\d+/g, ' ');                // "#1234", "*8842"
  s = s.replace(/(?<![\p{L}\p{N}])\d{2,}(?![\p{L}\p{N}])/gu, ' '); // branch / terminal numbers
  s = s.replace(/[^\p{L}\p{N}]+/gu, ' ');
  return s.replace(/\s+/g, ' ').trim();
}
