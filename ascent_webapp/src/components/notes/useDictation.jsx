import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Mic, MicOff } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

const SPEECH_LANG = { he: 'he-IL', ru: 'ru-RU', en: 'en-US' };

const Recognition = () => (typeof window === 'undefined' ? null : window.SpeechRecognition || window.webkitSpeechRecognition || null);

/**
 * Speak instead of type. Finished phrases are handed to `onText`; the words still being heard
 * are in `interim`. Uses the browser's own speech recognition, so it only exists where the
 * browser offers it (Chrome, Edge, Safari).
 */
export function useDictation({ language, onText, t }) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const rec = useRef(null);
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  const supported = !!Recognition();

  const stop = useCallback(() => { rec.current?.stop(); }, []);

  const start = useCallback(() => {
    const R = Recognition();
    if (!R || rec.current) return;
    const r = new R();
    r.lang = SPEECH_LANG[language] || navigator.language || 'en-US';
    r.interimResults = true;
    r.continuous = true;
    r.onresult = (e) => {
      let live = '';
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const res = e.results[i];
        if (res.isFinal) onTextRef.current?.(res[0].transcript.trim());
        else live += res[0].transcript;
      }
      setInterim(live);
    };
    r.onerror = (e) => {
      if (e.error === 'not-allowed' || e.error === 'service-not-allowed') toast.error(t ? t('ntMicBlocked') : 'Microphone blocked');
    };
    r.onend = () => { rec.current = null; setListening(false); setInterim(''); };
    rec.current = r;
    try {
      r.start();
      setListening(true);
      if (navigator.vibrate) navigator.vibrate(10);
    } catch {
      rec.current = null;
    }
  }, [language, t]);

  useEffect(() => () => { rec.current?.abort(); }, []);

  return { supported, listening, interim, start, stop, toggle: listening ? stop : start };
}

export function DictateButton({ dictation, t, className }) {
  if (!dictation.supported) return null;
  const { listening, toggle } = dictation;
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggle}
      aria-pressed={listening}
      aria-label={listening ? t('ntStopDictation') : t('ntDictate')}
      title={listening ? t('ntStopDictation') : t('ntDictate')}
      className={cn('relative', listening && 'text-danger', className)}
    >
      {listening && <span aria-hidden className="absolute inset-1.5 animate-ping rounded-full bg-danger/25" />}
      {listening ? <MicOff /> : <Mic />}
    </Button>
  );
}
