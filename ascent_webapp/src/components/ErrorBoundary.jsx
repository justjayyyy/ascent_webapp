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
        <div className="min-h-screen bg-[#092635] flex items-center justify-center p-4">
          <Card className="max-w-lg w-full bg-[#1B4242] border-[#5C8374]/30">
            <CardHeader className="text-center pb-2">
              <div className="mx-auto mb-4 w-16 h-16 rounded-full bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-8 h-8 text-red-400" />
              </div>
              <CardTitle className="text-[#9EC8B9] text-xl">
                Something went wrong
              </CardTitle>
            </CardHeader>
            <CardContent className="text-center space-y-4">
              <p className="text-[#5C8374]">
                We encountered an unexpected error. Please try again or return to the home page.
              </p>
              
              {process.env.NODE_ENV === 'development' && this.state.error && (
                <details className="text-left bg-[#092635] rounded-lg p-3 text-sm">
                  <summary className="text-red-400 cursor-pointer mb-2">
                    Error Details
                  </summary>
                  <pre className="text-[#9EC8B9] whitespace-pre-wrap overflow-auto max-h-40">
                    {this.state.error.toString()}
                    {this.state.errorInfo?.componentStack}
                  </pre>
                </details>
              )}
              
              <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
                <Button
                  onClick={this.handleRetry}
                  className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
                >
                  <RefreshCw className="w-4 h-4 mr-2" />
                  Try Again
                </Button>
                <Button
                  onClick={this.handleGoHome}
                  variant="outline"
                  className="border-[#5C8374] text-[#9EC8B9] hover:bg-[#5C8374]/20"
                >
                  <Home className="w-4 h-4 mr-2" />
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
      <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
      <p className="text-[#9EC8B9] mb-4">{message || 'Failed to load data'}</p>
      {onRetry && (
        <Button
          onClick={onRetry}
          size="sm"
          className="bg-[#5C8374] hover:bg-[#5C8374]/80"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      )}
    </div>
  );
}

export default ErrorBoundary;

