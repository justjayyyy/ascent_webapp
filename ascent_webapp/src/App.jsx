import './App.css'
import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { queryClientInstance } from '@/lib/query-client'
import { persistOptions } from '@/lib/offline/persist'
import AppSplash from '@/components/AppSplash'
import EntryTransition from '@/components/EntryTransition'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
const Login = React.lazy(() => import('./pages/Login'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService'));
const AcceptInvitation = React.lazy(() => import('./pages/AcceptInvitation'));
import { Toaster as SonnerToaster } from 'sonner';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SkeletonPage } from '@/components/ui/skeleton-card';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';

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

const PermissionGuard = ({ pageName, children }) => {
  const { hasPermission, permissions } = useAuth();

  const navigate = React.useMemo(() => {
    // Determine the first available page for the user
    if (!permissions) return 'Dashboard'; // Owner goes to Dashboard

    if (permissions.viewExpenses) return 'Dashboard';
    if (permissions.viewNotes) return 'Notes';
    if (permissions.viewSettings) return 'Settings';

    return null; // No access
  }, [permissions]);

  const permissionMap = {
    'Expenses': 'viewExpenses',
    'Income': 'viewExpenses',
    'Plans': 'viewExpenses',
    'Commitments': 'viewExpenses',
    // Notes is open to every member; the server only returns notes they can access
    // 'Settings': 'viewSettings', // Exposed to all authenticated users, internally gated
    // Dashboard currently only shows expense data, so it follows the expenses permission
    'Dashboard': 'viewExpenses',
  };

  const requiredPermission = permissionMap[pageName];

  // If no specific permission required or user has permission, render content
  if (!requiredPermission || hasPermission(requiredPermission)) {
    return children;
  }

  if (!navigate) {
    return <div className="p-8 text-center text-foreground">You do not have access to any pages. Please contact your workspace owner.</div>;
  }

  // Redirect to the first available page
  return <Navigate to={`/${navigate}`} replace />;
};

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // First sign-in check on a device with no saved session (a saved one opens the app at once)
  if (isLoadingPublicSettings || isLoadingAuth) {
    return <AppSplash />;
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
        <PermissionGuard pageName={mainPageKey}>
          <LayoutWrapper currentPageName={mainPageKey}>
            <MainPage />
          </LayoutWrapper>
        </PermissionGuard>
      } />
      {Object.entries(Pages).map(([path, Page]) => (
        <Route
          key={path}
          path={`/${path}`}
          element={
            <PermissionGuard pageName={path}>
              <LayoutWrapper currentPageName={path}>
                <Page />
              </LayoutWrapper>
            </PermissionGuard>
          }
        />
      ))}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};


// Sonner needs the app's theme (it defaults to light, which clashes with dark mode)
function AppSonnerToaster() {
  const { theme } = useTheme();
  return (
    <SonnerToaster
      theme={theme === 'light' ? 'light' : 'dark'}
      position="top-right"
      richColors
      offset={{ top: 'calc(var(--safe-top) + 16px)', right: 16 }}
      mobileOffset={{ top: 'calc(var(--safe-top) + 8px)', left: 12, right: 12 }}
    />
  );
}

function App() {

  return (
    <AuthProvider>
      <PersistQueryClientProvider
        client={queryClientInstance}
        persistOptions={persistOptions}
        // Restored numbers show at once; refresh everything on screen behind them
        onSuccess={() => queryClientInstance.invalidateQueries()}
      >
        <ThemeProvider>
          <Router>
            <Routes>
              <Route path="/login" element={
                <Suspense fallback={<AppSplash />}>
                  <Login />
                </Suspense>
              } />
              <Route path="/privacy-policy" element={
                <Suspense fallback={<SkeletonPage />}>
                  <PrivacyPolicy />
                </Suspense>
              } />
              <Route path="/terms-of-service" element={
                <Suspense fallback={<SkeletonPage />}>
                  <TermsOfService />
                </Suspense>
              } />
              <Route path="/accept-invitation/:token" element={
                <Suspense fallback={<SkeletonPage />}>
                  <AcceptInvitation />
                </Suspense>
              } />
              <Route path="/*" element={
                <>
                  <NavigationTracker />
                  <AuthenticatedApp />
                </>
              } />
            </Routes>
          </Router>
          <Toaster />
          <AppSonnerToaster />
          <EntryTransition />
          <Analytics />
          <SpeedInsights />
        </ThemeProvider>
      </PersistQueryClientProvider>
    </AuthProvider>
  )
}

export default App
