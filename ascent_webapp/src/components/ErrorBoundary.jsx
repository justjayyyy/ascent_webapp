import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });
    // Log error to console in development
    console.error('ErrorBoundary caught:', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleGoHome = () => {
    window.location.href = '/';
  };

  handleRetry = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      const { fallback } = this.props;
      
      if (fallback) {
        return fallback;
      }

      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <Card className="max-w-lg w-full bg-card border-primary/30">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-danger/20 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-danger" />
              </div>
              <CardTitle className="text-muted-foreground text-xl">
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-primary">
                We encountered an unexpected error. Please try again or return to the home page.
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-start bg-background rounded-lg p-3 text-sm">
                  <summary className="text-danger cursor-pointer mb-2">
                    Error Details
                  </summary>
                  <pre className="text-muted-foreground whitespace-pre-wrap overflow-auto max-h-40">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button
                  onClick={this.handleRetry}
                  className="bg-primary hover:bg-primary/80 text-primary-foreground"
                >
                  <RefreshCw className="w-4 h-4 me-2" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="border-primary text-muted-foreground hover:bg-primary/20"
                >
                  <Home className="w-4 h-4 me-2" />
                  Go Home
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// Inline error display for smaller sections
export function InlineError({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center p-8 text-center">
      <AlertTriangle className="w-12 h-12 text-danger mb-4" />
      <p className="text-muted-foreground mb-4">{message || 'Failed to load data'}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          size="sm"
          className="bg-primary hover:bg-primary/80"
        >
          <RefreshCw className="w-4 h-4 me-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

export default ErrorBoundary;

