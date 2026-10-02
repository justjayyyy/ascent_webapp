import React from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';
import { reportError } from '@/lib/monitoring';

/**
 * Catches a crash in the page below it and offers a way out. `resetKey` (the page name) clears the
 * error when the person moves to another page, so one broken screen does not take over the app.
 */
class Boundary extends React.Component {
  state = { error: null, componentStack: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ componentStack: info?.componentStack || null });
    console.error('[ErrorBoundary]', error, info?.componentStack);
    reportError(error, { componentStack: info?.componentStack });
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null, componentStack: null });
  }

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback;
    const { t } = this.props;
    return (
      <div role="alert" className="flex min-h-[60vh] items-center justify-center p-4">
        <div className="w-full max-w-lg space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-danger/20">
            <AlertTriangle className="h-8 w-8 text-danger" aria-hidden="true" />
          </div>
          <h2 className="text-xl font-semibold text-foreground">{t('errTitle')}</h2>
          <p className="text-muted-foreground">{t('errBody')}</p>
          {import.meta.env.DEV && (
            <details className="rounded-lg bg-background p-3 text-start text-sm">
              <summary className="mb-2 cursor-pointer text-danger">{String(error)}</summary>
              <pre className="max-h-40 overflow-auto whitespace-pre-wrap text-muted-foreground">{componentStack}</pre>
            </details>
          )}
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row">
            <Button onClick={() => this.setState({ error: null, componentStack: null })}>
              <RefreshCw className="me-2 h-4 w-4" aria-hidden="true" />
              {t('errRetry')}
            </Button>
            <Button variant="outline" onClick={() => { window.location.href = '/'; }}>
              <Home className="me-2 h-4 w-4" aria-hidden="true" />
              {t('errHome')}
            </Button>
          </div>
        </div>
      </div>
    );
  }
}

export default function ErrorBoundary(props) {
  const { t } = useTheme();
  return <Boundary t={t} {...props} />;
}
