import './App.css'
import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from './pages/Login';
import { Toaster as SonnerToaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SkeletonPage } from '@/components/ui/skeleton-card';
import { Analytics } from '@vercel/analytics/react';

const { Pages, Layout, mainPage } = pagesConfig;
const mainPageKey = mainPage ?? Object.keys(Pages)[0];
const MainPage = mainPageKey ? Pages[mainPageKey] : () => <></>;

const LayoutWrapper = React.memo(({ children, currentPageName }) => Layout ?
  <Layout currentPageName={currentPageName}>
    <ErrorBoundary>
      <Suspense fallback={<SkeletonPage />}>
        {children}
      </Suspense>
    </ErrorBoundary>
  </Layout>
  : <ErrorBoundary><Suspense fallback={<SkeletonPage />}>{children}</Suspense></ErrorBoundary>);

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Show loading spinner while checking auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-[#092635]">
        <div className="w-8 h-8 border-4 border-[#5C8374] border-t-[#9EC8B9] rounded-full animate-spin"></div>
      </div>
    );
  }

  // Handle authentication errors
  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required' && !isAuthenticated) {
      // Redirect to login automatically
      navigateToLogin();
      return null;
    }
  }

  // If not authenticated, redirect to login
  if (!isAuthenticated) {
    navigateToLogin();
    return null;
  }

  // Render the main app
  return (
    <Routes>
      <Route path="/" element={
        <LayoutWrapper currentPageName={mainPageKey}>
          <MainPage />
        </LayoutWrapper>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <LayoutWrapper currentPageName={path}>
              <Page />
            </LayoutWrapper>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/*" element={
              <>
                <NavigationTracker />
                <AuthenticatedApp />
              </>
            } />
          </Routes>
        </Router>
        <Toaster />
        <SonnerToaster position="top-right" richColors />
        <Analytics />
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
