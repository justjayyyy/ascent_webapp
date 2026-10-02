import React, { useMemo, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { FileSpreadsheet, Loader2, Upload, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import ResponsiveModal from '@/components/workspace/ResponsiveModal';
import { ascent } from '@/api/client';
import { useTheme } from '../ThemeProvider';
import { readSheets, guessColumns, toStatementRows, chargesLookNegative, FIELDS } from '@/lib/statementFile';

const fill = (s, vars) => Object.entries(vars).reduce((out, [k, v]) => out.replace(`{${k}}`, v), s);
const LABEL = { date: 'impColDate', description: 'impColDescription', amount: 'impColAmount', currency: 'impColCurrency', card: 'impColCard' };
const MAX_ROWS = 2000;

/**
 * Pick a statement file, check which column is which, see a preview, import. The file never leaves the
 * device; the server gets the rows and matches them against payments already recorded.
 */
export default function StatementImportDialog({ open, onOpenChange }) {
  const { t, user, language } = useTheme();
  const queryClient = useQueryClient();
  const inputRef = useRef(null);
  const [fileName, setFileName] = useState('');
  const [sheets, setSheets] = useState([]);
  const [sheetIndex, setSheetIndex] = useState(0);
  const [mapping, setMapping] = useState(null); // { headerRow, columns }
  const [order, setOrder] = useState('dmy');
  const [flip, setFlip] = useState(false);
  const [review, setReview] = useState(false);
  const [reading, setReading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const loc = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';

  const reset = () => {
    setFileName('');
    setSheets([]);
    setMapping(null);
    setResult(null);
    setFlip(false);
    if (inputRef.current) inputRef.current.value = '';
  };

  const applySheet = (list, index) => {
    const g = guessColumns(list[index].rows);
    const next = g.headerRow === -1 ? { headerRow: 0, columns: {} } : g;
    setSheetIndex(index);
    setMapping(next);
    setFlip(next.columns.amount !== undefined && chargesLookNegative(list[index].rows, next));
  };

  const onFile = async (file) => {
    if (!file) return;
    reset();
    setReading(true);
    try {
      const list = await readSheets(file);
      if (!list.length) throw new Error('empty');
      // Start on the sheet whose columns are easiest to recognise
      const best = list.map((s, i) => [guessColumns(s.rows).score, i]).sort((a, b) => b[0] - a[0])[0][1];
      setFileName(file.name);
      setSheets(list);
      applySheet(list, best);
    } catch {
      toast.error(t('impUnreadable'));
    } finally {
      setReading(false);
    }
  };

  const sheet = sheets[sheetIndex];
  const header = sheet && mapping ? sheet.rows[mapping.headerRow] || [] : [];
  const parsed = useMemo(
    () => (sheet && mapping ? toStatementRows(sheet.rows, mapping, { order, flip }) : { rows: [], skipped: 0 }),
    [sheet, mapping, order, flip]
  );
  const money = (v, c) => {
    try {
      return new Intl.NumberFormat(loc, { style: 'currency', currency: c || user?.currency || 'ILS', maximumFractionDigits: 2 }).format(v);
    } catch {
      return String(v);
    }
  };

  const setColumn = (field, value) => setMapping((m) => {
    const columns = { ...m.columns };
    if (value === 'none') delete columns[field];
    else columns[field] = Number(value);
    return { ...m, columns };
  });

  const run = async () => {
    setImporting(true);
    try {
      const res = await ascent.imports.statement(parsed.rows.slice(0, MAX_ROWS), { review });
      setResult(res);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      toast.success(fill(t('impDone'), res));
    } catch {
      toast.error(t('impFailed'));
    } finally {
      setImporting(false);
    }
  };

  const close = (o) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const footer = result ? (
    <>
      <Button variant="outline" className="h-11" onClick={reset}>{t('impAnother')}</Button>
      <Button className="h-11" onClick={() => close(false)}>{t('close')}</Button>
    </>
  ) : sheet ? (
    <>
      <Button variant="outline" className="h-11" onClick={() => close(false)}>{t('cancel')}</Button>
      <Button className="h-11" onClick={run} disabled={importing || parsed.rows.length === 0}>
        {importing && <Loader2 className="me-2 h-4 w-4 animate-spin" />}
        {fill(t('impImport'), { count: Math.min(parsed.rows.length, MAX_ROWS) })}
      </Button>
    </>
  ) : null;

  return (
    <ResponsiveModal open={open} onOpenChange={close} title={t('impTitle')} description={t('impDesc')} footer={footer}>
      <div className="space-y-4 pb-2">
        <input ref={inputRef} type="file" accept=".csv,.xls,.xlsx,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="sr-only" id="statement-file" onChange={(e) => onFile(e.target.files?.[0])} />

        {result ? (
          <div className="flex items-start gap-3 rounded-2xl bg-success/10 p-4 text-sm">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-success" aria-hidden />
            <p className="text-pretty">{fill(t('impDone'), result)}</p>
          </div>
        ) : !sheet ? (
          <label htmlFor="statement-file"
            className="flex min-h-40 cursor-pointer flex-col items-center justify-center gap-3 rounded-3xl border-2 border-dashed border-border p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.04]">
            {reading ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <Upload className="h-8 w-8 text-primary" aria-hidden />}
            <span className="text-sm font-medium">{t('impChoose')}</span>
            <span className="text-xs text-muted-foreground">.xlsx · .xls · .csv</span>
            <span className="max-w-xs text-xs text-muted-foreground text-pretty">{t('impPrivacy')}</span>
          </label>
        ) : (
          <>
            <div className="flex items-center gap-2 text-sm">
              <FileSpreadsheet className="h-4 w-4 shrink-0 text-primary" aria-hidden />
              <span className="min-w-0 flex-1 truncate font-medium" dir="auto">{fileName}</span>
              <button type="button" onClick={() => inputRef.current?.click()} className="shrink-0 text-sm font-medium text-primary hover:underline">{t('impChoose')}</button>
            </div>

            {sheets.length > 1 && (
              <div className="space-y-1.5">
                <Label htmlFor="imp-sheet">{t('impSheet')}</Label>
                <Select value={String(sheetIndex)} onValueChange={(v) => applySheet(sheets, Number(v))}>
                  <SelectTrigger id="imp-sheet" className="h-11"><SelectValue /></SelectTrigger>
                  <SelectContent>{sheets.map((s, i) => <SelectItem key={s.name} value={String(i)}>{s.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
            )}

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">{t('impColumns')}</legend>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {FIELDS.map((field) => (
                  <div key={field} className="flex items-center gap-2">
                    <Label htmlFor={`imp-col-${field}`} className="w-24 shrink-0 text-xs text-muted-foreground">{t(LABEL[field])}</Label>
                    <Select value={mapping.columns[field] === undefined ? 'none' : String(mapping.columns[field])} onValueChange={(v) => setColumn(field, v)}>
                      <SelectTrigger id={`imp-col-${field}`} className="h-10 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {field !== 'date' && field !== 'amount' && <SelectItem value="none">{t('impNone')}</SelectItem>}
                        {header.map((h, i) => (
                          <SelectItem key={i} value={String(i)}>{String(h || '').trim() || `#${i + 1}`}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-center gap-2">
              <Label className="text-xs text-muted-foreground">{t('impDateOrder')}</Label>
              {[['dmy', '31/12/2026'], ['mdy', '12/31/2026']].map(([v, sample]) => (
                <button key={v} type="button" aria-pressed={order === v} onClick={() => setOrder(v)}
                  className={`min-h-9 rounded-full px-3 text-xs font-medium tabular-nums ${order === v ? 'bg-primary text-primary-foreground' : 'bg-foreground/[0.06] text-muted-foreground'}`}>
                  {sample}
                </button>
              ))}
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox id="imp-flip" checked={flip} onCheckedChange={(c) => setFlip(!!c)} />
                <Label htmlFor="imp-flip" className="text-sm">{t('impFlipSign')}</Label>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox id="imp-review" checked={review} onCheckedChange={(c) => setReview(!!c)} />
                <Label htmlFor="imp-review" className="text-sm">{t('impSendToReview')}</Label>
              </div>
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="text-sm font-medium">{t('impPreview')}</h3>
                <p className="text-xs text-muted-foreground tabular-nums">
                  {fill(t('impRowsFound'), { count: parsed.rows.length })}
                  {parsed.skipped > 0 && ` · ${fill(t('impSkipped'), { count: parsed.skipped })}`}
                </p>
              </div>
              {parsed.rows.length > MAX_ROWS && (
                <p className="mt-2 text-sm text-yellow-600 text-pretty dark:text-yellow-400">{fill(t('impTooMany'), { max: MAX_ROWS })}</p>
              )}
              {parsed.rows.length === 0 ? (
                <p className="mt-2 text-sm text-danger">{t('impNoRows')}</p>
              ) : (
                <ul className="mt-2 divide-y divide-border/50 rounded-2xl border border-border/60 text-sm">
                  {parsed.rows.slice(0, 6).map((r, i) => (
                    <li key={i} className="flex items-center gap-3 px-3 py-2">
                      <span className="w-20 shrink-0 text-xs text-muted-foreground tabular-nums">{r.date}</span>
                      <span className="min-w-0 flex-1 truncate" dir="auto">{r.description || '—'}</span>
                      <span className={`shrink-0 font-medium tabular-nums ${r.amount < 0 ? 'text-success' : ''}`} dir="ltr">
                        {r.amount < 0 ? '+' : ''}{money(Math.abs(r.amount), r.currency)}
                      </span>
                    </li>
                  ))}
                  {parsed.rows.length > 6 && (
                    <li className="px-3 py-2 text-xs text-muted-foreground">{fill(t('impMore'), { count: parsed.rows.length - 6 })}</li>
                  )}
                </ul>
              )}
            </div>
          </>
        )}
      </div>
    </ResponsiveModal>
  );
}
