import { useEffect, useState } from 'react';
import { ascent } from '@/api/client';

/**
 * The category this household usually uses for a description ("Shufersal" -> Groceries), asked for
 * once typing pauses. Learned merchant rules come first, then past transactions, then keywords.
 */
export function useCategorySuggestion(description, type, enabled) {
  const [suggestion, setSuggestion] = useState(null);

  useEffect(() => {
    const text = (description || '').trim();
    if (!enabled || text.length < 2) {
      setSuggestion(null);
      return undefined;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      ascent.assist.suggestCategory(text, type)
        .then((s) => { if (!cancelled) setSuggestion(s?.name ? s : null); })
        .catch(() => { if (!cancelled) setSuggestion(null); });
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [description, type, enabled]);

  return suggestion;
}
