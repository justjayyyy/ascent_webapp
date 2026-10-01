import { Link, useLocation } from 'react-router-dom';
import { Home } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

export default function PageNotFound() {
  const { t } = useTheme();
  const { pathname } = useLocation();
  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-md space-y-6 text-center">
        <p className="text-7xl font-light text-muted-foreground/40" aria-hidden="true">404</p>
        <h1 className="text-2xl font-medium text-foreground">{t('notFoundTitle')}</h1>
        <p className="leading-relaxed text-foreground/75">
          {t('notFoundBody')} <span dir="ltr" className="font-medium">{pathname}</span>
        </p>
        <Link
          to="/"
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border bg-card px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          {t('notFoundHome')}
        </Link>
      </div>
    </main>
  );
}
