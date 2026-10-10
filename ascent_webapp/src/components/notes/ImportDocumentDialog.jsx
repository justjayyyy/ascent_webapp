import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import { FileUp, Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { fmt } from './noteUtils';
import { MAX_IMPORT_PAGES } from './importDocument';

const STAGES = { pages: 'ntImportPreparing', reading: 'ntImportReading', pictures: 'ntImportPictures' };

/**
 * "Import a PDF or photo": pick a PDF, or photos of paper, and the assistant copies it into a new note, with
 * its titles, tasks, numbered entries, boxes, amounts and pictures. Without the assistant it says how to turn it on.
 * The ref's start() begins it (from a button or a menu); `onImported(id)` opens the new note.
 */
const ImportDocumentDialog = forwardRef(function ImportDocumentDialog({ importDocument, aiOff, isOwner, onImported, language, t }, ref) {
  const input = useRef(null);
  const [state, setState] = useState(null); // null | { kind: 'off' } | { kind: 'working', stage, done, total } | { kind: 'failed', message }

  const start = () => {
    // Known to be off: say so. Not known yet (still loading): try, and the server's answer decides
    if (aiOff) { setState({ kind: 'off' }); return; }
    input.current?.click();
  };
  useImperativeHandle(ref, () => ({ start }));

  const run = async (files) => {
    if (!files?.length) return;
    setState({ kind: 'working', stage: 'pages', done: 0, total: 0 });
    try {
      const result = await importDocument(files, {
        language,
        onProgress: (p) => setState({ kind: 'working', ...p }),
      });
      setState(null);
      onImported(result.id);
      if (result.cut) toast.message(fmt(t('ntImportCut'), { n: MAX_IMPORT_PAGES }));
      if (result.missingPictures) toast.error(fmt(t('ntPicturesSkipped'), { n: result.missingPictures }));
    } catch (err) {
      console.error('[Notes] import failed:', err);
      const message = err?.message === 'ai_disabled' ? null
        : err?.status === 429 ? t('ntImportTooMany')
          : err?.isNetworkError ? t('ntNeedOnline')
            : t('ntImportFailed');
      setState(message ? { kind: 'failed', message } : { kind: 'off' });
    }
  };

  const working = state?.kind === 'working';
  return (
    <>
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf,image/*"
        multiple
        hidden
        aria-label={t('ntImportDocument')}
        onChange={(e) => { const files = [...(e.target.files || [])]; e.target.value = ''; run(files); }}
      />
      <Dialog open={!!state} onOpenChange={(o) => { if (!o && !working) setState(null); }}>
        <DialogContent
          className="max-w-md"
          onEscapeKeyDown={(e) => { if (working) e.preventDefault(); }}
          onPointerDownOutside={(e) => { if (working) e.preventDefault(); }}
        >
          <DialogTitle className="flex items-center gap-2">
            <FileUp className="h-5 w-5 text-primary" /> {t('ntImportDocument')}
          </DialogTitle>
          {state?.kind === 'off' && (
            <>
              <DialogDescription>{isOwner ? t('ntImportNeedsAssistantOwner') : t('ntImportNeedsAssistant')}</DialogDescription>
              <div className="flex justify-end">
                <Button variant="outline" onClick={() => setState(null)}>{t('ntDone')}</Button>
              </div>
            </>
          )}
          {working && (
            <div className="space-y-3" aria-live="polite">
              <DialogDescription className="flex items-center gap-2">
                {state.stage === 'reading' ? <Sparkles className="h-4 w-4 shrink-0 text-primary" /> : <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
                {fmt(t(STAGES[state.stage] || 'ntImportPreparing'), { done: Math.min(state.done + 1, state.total || 1), total: state.total || 1 })}
              </DialogDescription>
              <div className="h-1.5 overflow-hidden rounded-full bg-foreground/10" role="progressbar" aria-valuemin={0} aria-valuemax={state.total || 1} aria-valuenow={state.done}>
                <div
                  className="h-full rounded-full bg-primary transition-[width] duration-500"
                  style={{ width: `${Math.round(((state.stage === 'pictures' ? 0.9 : state.stage === 'reading' ? 0.2 : 0) + (state.total ? state.done / state.total : 0) * (state.stage === 'reading' ? 0.7 : state.stage === 'pictures' ? 0.1 : 0.2)) * 100)}%` }}
                />
              </div>
              <p className="text-xs text-muted-foreground">{t('ntImportKeepOpen')}</p>
            </div>
          )}
          {state?.kind === 'failed' && (
            <>
              <DialogDescription>{state.message}</DialogDescription>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setState(null)}>{t('ntClose')}</Button>
                <Button onClick={() => { setState(null); input.current?.click(); }}>{t('ntTryAgain')}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
});

export default ImportDocumentDialog;
