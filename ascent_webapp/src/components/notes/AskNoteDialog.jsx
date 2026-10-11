import React, { useEffect, useRef, useState } from 'react';
import { ArrowUp, Copy, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { lineKind } from './noteUtils';

const MAX_TURNS = 6; // earlier questions and answers sent along, so a follow-up knows what "it" is

function errorKey(err) {
  if (err?.isNetworkError) return 'ntAskOffline';
  if (err?.status === 429) return 'askLimited';
  if (err?.data?.error === 'ai_declined' || err?.message === 'ai_declined') return 'askDeclined';
  return 'askFailed';
}

/**
 * "Ask about this note": questions about the note in front of you, answered by the assistant from its text
 * as it stands (unsaved edits included). The conversation lasts while the note is open.
 * Without the assistant it says how to turn it on (or that the server is not set up for it).
 */
export default function AskNoteDialog({ open, onOpenChange, note, text, notSetUp, aiOff, isOwner, online, t }) {
  const [question, setQuestion] = useState('');
  const [turns, setTurns] = useState([]); // [{ question, answer }]
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const listRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    const list = listRef.current;
    if (list) list.scrollTop = list.scrollHeight;
  }, [turns, busy]);

  const hasTasks = note.type === 'checklist' && (note.items || []).some(i => lineKind(i) === 'item' && i.text);
  const suggestions = ['ntAskSummarize', hasTasks ? 'ntAskLeft' : 'ntAskKeyPoints', 'ntAskNext'];

  const ask = async (value = question) => {
    const q = value.trim();
    if (!q || busy) return;
    if (!online) { setFailed('ntAskOffline'); return; }
    setBusy(true);
    setFailed(null);
    setQuestion('');
    try {
      const { answer } = await ascent.entities.Note.ask(note.id, {
        title: note.title || '',
        text,
        question: q,
        history: turns.slice(-MAX_TURNS),
      });
      setTurns(list => [...list, { question: q, answer }]);
    } catch (err) {
      if (err?.message === 'ai_disabled') setFailed('off');
      else setFailed(errorKey(err));
      setQuestion(q);
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const copy = async (answer) => {
    try {
      await navigator.clipboard.writeText(answer);
      toast.success(t('ntCopied'));
    } catch {
      toast.error(t('ntCopyFailed'));
    }
  };

  const off = notSetUp || aiOff || failed === 'off';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="flex max-h-[85dvh] max-w-lg flex-col gap-3"
        // Keys typed here are not the note's shortcuts (undo, close) in the editor underneath
        onKeyDown={(e) => e.stopPropagation()}
      >
        <DialogTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" /> {t('ntAskTitle')}
        </DialogTitle>

        {off ? (
          <>
            <DialogDescription>{notSetUp ? t('ntAskNotSetUp') : isOwner ? t('ntAskNeedsAssistantOwner') : t('ntAskNeedsAssistant')}</DialogDescription>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => onOpenChange(false)}>{t('ntDone')}</Button>
            </div>
          </>
        ) : (
          <>
            <DialogDescription className="truncate">{note.title || t('ntAskDesc')}</DialogDescription>

            <div ref={listRef} className="-mx-1 min-h-0 flex-1 space-y-3 overflow-y-auto overscroll-contain px-1" aria-live="polite">
              {!turns.length && !busy && (
                <div className="flex flex-wrap gap-2">
                  {suggestions.map(k => (
                    <button
                      key={k}
                      type="button"
                      onClick={() => ask(t(k))}
                      className="min-h-11 rounded-full bg-foreground/[0.06] px-3.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary"
                    >
                      {t(k)}
                    </button>
                  ))}
                </div>
              )}
              {turns.map((turn, i) => (
                <div key={i} className="space-y-2">
                  <p dir="auto" className="ms-auto w-fit max-w-[85%] whitespace-pre-line rounded-2xl rounded-ee-md bg-primary/15 px-3.5 py-2 text-sm">
                    {turn.question}
                  </p>
                  <div className="group/answer relative rounded-2xl rounded-es-md bg-foreground/[0.06] px-3.5 py-2.5 pe-11">
                    <p dir="auto" className="whitespace-pre-line text-sm leading-relaxed">{turn.answer}</p>
                    <button
                      type="button"
                      onClick={() => copy(turn.answer)}
                      aria-label={t('ntCopyAnswer')}
                      title={t('ntCopyAnswer')}
                      className="absolute end-1 top-1 grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10 hover:text-foreground"
                    >
                      <Copy className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
              {busy && (
                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" /> {t('askThinking')}
                </p>
              )}
              {failed && <p className="text-sm text-danger">{t(failed)}</p>}
            </div>

            <form
              onSubmit={(e) => { e.preventDefault(); ask(); }}
              className="flex items-center gap-2 rounded-full border border-input bg-background/60 p-1 ps-4"
            >
              <label htmlFor="ask-note-input" className="sr-only">{t('ntAskTitle')}</label>
              <input
                ref={inputRef}
                id="ask-note-input"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                maxLength={1000}
                autoComplete="off"
                dir="auto"
                placeholder={t('ntAskPlaceholder')}
                className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                disabled={busy || !question.trim()}
                aria-label={t('askSend')}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
              </button>
            </form>
            <p className="text-[11px] text-muted-foreground">{t('ntAskAiNote')}</p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
