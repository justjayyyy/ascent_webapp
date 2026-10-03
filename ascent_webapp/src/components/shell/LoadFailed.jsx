import React from 'react';
import { CloudAlert, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';

/**
 * Said when a page's transactions could not be loaded and nothing is cached: without it the page drew an empty
 * month ("No transactions this month", "This week: $0") as if that were the household's money.
 */
export default function LoadFailed({ onRetry, retrying = false }) {
  const { t } = useTheme();
  return (
    <div role="alert" className="mb-4 flex flex-col gap-3 rounded-3xl border border-danger/30 bg-danger/5 p-4 sm:flex-row sm:items-center">
      <span className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-danger/10 text-danger sm:flex">
        <CloudAlert className="h-5 w-5" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-pretty text-sm text-foreground">{t('loadFailedTransactions')}</p>
      <Button variant="secondary" className="h-11 rounded-xl sm:h-9" disabled={retrying} onClick={onRetry}>
        {retrying && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
        {t('loadFailedRetry')}
      </Button>
    </div>
  );
}
