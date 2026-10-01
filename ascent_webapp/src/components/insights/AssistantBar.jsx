import React, { useRef, useState } from 'react';
import { useAssistStatus, useCategories } from '@/hooks/useWorkspaceData';
import { AnimatePresence, motion } from 'motion/react';
import { Sparkles, ArrowUp, Loader2, X, Check, Pencil } from 'lucide-react';
import { ascent } from '@/api/client';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { translateCategory } from '@/lib/translations';
import { cn } from '@/lib/utils';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { useMoneyFormat, localDay } from './useInsights';

const looksLikeQuestion = (text) => /[?？؟]\s*$/.test(text) || /^(how|what|why|when|which|can|should|did|do|are|is|כמה|מה|למה|מתי|איזה|האם|אפשר|сколько|что|почему|когда|какие|какой|можем|можно)(?=\s|$)/iu.test(text.trim()); // \b only knows Latin letters

function errorKey(err) {
  if (err?.status === 429) return 'askLimited';
  if (err?.data?.error === 'ai_declined') return 'askDeclined';
  return 'askFailed';
}

/**
 * One box for both jobs: "coffee 18 with Max" becomes a transaction to confirm, and a question gets
 * a short answer from the household's own numbers. Shown only when the household turned the assistant on.
 */
export default function AssistantBar() {
  const { t, language } = useTheme();
  const { hasPermission } = useAuth();
  const { money, shortDate, currency } = useMoneyFormat();
  const { save, saving } = useSaveTransaction();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null); // { kind: 'answer', text } | { kind: 'draft', draft } | { kind: 'error', key }
  const [editing, setEditing] = useState(null);
  const inputRef = useRef(null);

  const { data: status } = useAssistStatus();
  const canEdit = hasPermission('editExpenses');
  const { data: categories = [] } = useCategories({ enabled: canEdit });

  if (!status?.ai?.configured || !status?.ai?.enabled || !hasPermission('viewExpenses')) return null;

  const ask = async (question) => {
    try {
      const { answer } = await ascent.assist.ask(question);
      setResult({ kind: 'answer', question, text: answer });
    } catch (err) {
      setResult({ kind: 'error', key: errorKey(err) });
    }
  };

  const submit = async (value = text) => {
    const input = value.trim();
    if (!input || busy) return;
    setBusy(true);
    setResult(null);
    try {
      if (looksLikeQuestion(input) || !canEdit) {
        await ask(input);
      } else {
        const draft = await ascent.assist.parse(input);
        if (draft.kind === 'question') await ask(input);
        else setResult({ kind: 'draft', draft });
      }
    } catch (err) {
      setResult({ kind: 'error', key: errorKey(err) });
    } finally {
      setBusy(false);
    }
  };

  const toTransaction = (d) => {
    const type = d.type === 'Income' ? 'Income' : 'Expense';
    const fallback = categories.find((c) => c.type === type || c.type === 'Both')?.name || '';
    const cur = d.currency || currency;
    return {
      type,
      amount: d.amount,
      currency: cur,
      amountInGlobalCurrency: cur === currency ? d.amount : null,
      globalCurrency: cur === currency ? currency : null,
      category: d.category || fallback,
      description: d.description || '',
      date: d.date || localDay(),
      paymentMethod: d.paymentMethod || '',
      cardId: d.cardId || '',
    };
  };

  const add = async () => {
    const ok = await save(toTransaction(result.draft));
    if (ok) {
      setResult(null);
      setText('');
    }
  };

  const reset = () => {
    setResult(null);
    setText('');
    inputRef.current?.focus();
  };

  const draft = result?.kind === 'draft' ? result.draft : null;

  return (
    <div className="relative overflow-hidden rounded-3xl border border-primary/25 bg-card/70 backdrop-blur-xl">
      <form
        onSubmit={(e) => { e.preventDefault(); submit(); }}
        className="flex items-center gap-2 p-2 ps-4"
      >
        <Sparkles className="h-5 w-5 shrink-0 text-primary" aria-hidden />
        <label htmlFor="assistant-input" className="sr-only">{t('askTitle')}</label>
        <input
          ref={inputRef}
          id="assistant-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          maxLength={300}
          autoComplete="off"
          placeholder={t('askPlaceholder')}
          className="h-11 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
        />
        {result && !busy && (
          <button type="button" onClick={reset} aria-label={t('askNew')} className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-foreground/10">
            <X className="h-4 w-4" />
          </button>
        )}
        <button
          type="submit"
          disabled={busy || !text.trim()}
          aria-label={t('askSend')}
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground transition active:scale-95 disabled:opacity-40"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUp className="h-4 w-4" />}
        </button>
      </form>

      <AnimatePresence initial={false}>
        {(result || busy || !text) && (
          <motion.div
            key={busy ? 'busy' : result?.kind || 'hint'}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border/50"
            aria-live="polite"
          >
            <div className="px-4 py-3">
              {busy && <p className="text-sm text-muted-foreground">{t('askThinking')}</p>}

              {!busy && !result && (
                <div className="flex flex-wrap gap-2">
                  <p className="w-full text-xs text-muted-foreground">{t('askExamples')}</p>
                  {['askSuggest1', 'askSuggest2', 'askSuggest3'].map((k) => (
                    <button key={k} type="button" onClick={() => { setText(t(k)); submit(t(k)); }}
                      className="min-h-9 rounded-full bg-foreground/[0.06] px-3 text-xs font-medium text-muted-foreground transition-colors hover:bg-primary/10 hover:text-primary">
                      {t(k)}
                    </button>
                  ))}
                </div>
              )}

              {!busy && result?.kind === 'answer' && (
                <div>
                  <p className="whitespace-pre-line text-sm leading-relaxed text-foreground" dir="auto">{result.text}</p>
                  <p className="mt-3 text-[11px] text-muted-foreground">{t('askAiNote')}</p>
                </div>
              )}

              {!busy && result?.kind === 'error' && <p className="text-sm text-danger">{t(result.key)}</p>}

              {!busy && draft && (
                <div className="flex flex-wrap items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium uppercase tracking-wide text-primary">{t('askDraft')}</p>
                    <p className="mt-1 truncate text-sm">
                      <span className={cn('text-lg font-semibold tabular-nums', draft.type === 'Income' && 'text-success')} dir="ltr">
                        {draft.amount ? money(draft.amount, draft.currency || currency) : '—'}
                      </span>
                      {' · '}{draft.description || translateCategory(draft.category, language)}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {draft.category ? translateCategory(draft.category, language) : ''}
                      {' · '}{shortDate(draft.date || localDay())}
                      {draft.paymentMethod ? ` · ${draft.paymentMethod}` : ''}
                    </p>
                    {!draft.amount && <p className="mt-1 text-xs text-danger">{t('askNeedAmount')}</p>}
                  </div>
                  <div className="flex gap-2">
                    <button type="button" onClick={() => setEditing(toTransaction(draft))}
                      className="inline-flex h-11 items-center gap-1.5 rounded-full border border-border px-4 text-sm font-medium hover:bg-foreground/5">
                      <Pencil className="h-4 w-4" aria-hidden />{t('askEdit')}
                    </button>
                    <button type="button" onClick={add} disabled={!draft.amount || saving}
                      className="inline-flex h-11 items-center gap-1.5 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground disabled:opacity-40">
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" aria-hidden />}{t('askAdd')}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {editing && (
        <AddTransactionDialog
          open={!!editing}
          onClose={() => setEditing(null)}
          categories={categories}
          editTransaction={{ ...editing, amount: editing.amount || '' }}
          isLoading={saving}
          onSubmit={async (data) => {
            if (await save(data)) {
              setEditing(null);
              setResult(null);
              setText('');
            }
          }}
        />
      )}
    </div>
  );
}
