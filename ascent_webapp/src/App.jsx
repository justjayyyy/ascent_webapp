import './App.css'
import React, { Suspense } from 'react';
import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import NavigationTracker from '@/lib/NavigationTracker'
import { pagesConfig } from './pages.config'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider } from '@/components/ThemeProvider';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import Login from './pages/Login';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import AcceptInvitation from './pages/AcceptInvitation';
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
    if (!permissions) return 'Portfolio'; // Owner goes to Portfolio

    if (permissions.viewPortfolio) return 'Portfolio';
    if (permissions.viewExpenses) return 'Expenses';
    if (permissions.viewNotes) return 'Notes';
    if (permissions.viewSettings) return 'Settings';

    return null; // No access
  }, [permissions]);

  const permissionMap = {
    'Portfolio': 'viewPortfolio',
    'Expenses': 'viewExpenses',
    'Notes': 'viewNotes',
    // 'Settings': 'viewSettings', // Exposed to all authenticated users, internally gated
    'Dashboard': 'viewDashboard',
  };

  const requiredPermission = permissionMap[pageName];

  // If no specific permission required or user has permission, render content
  if (!requiredPermission || hasPermission(requiredPermission)) {
    return children;
  }

  if (!navigate) {
    return <div className="p-8 text-center text-white">You do not have access to any pages. Please contact your workspace owner.</div>;
  }

  // Redirect to the first available page
  return <Navigate to={`/${navigate}`} replace />;
};

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


function App() {

  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <ThemeProvider>
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/privacy-policy" element={<PrivacyPolicy />} />
              <Route path="/terms-of-service" element={<TermsOfService />} />
              <Route path="/accept-invitation/:token" element={<AcceptInvitation />} />
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
          <SpeedInsights />
        </ThemeProvider>
      </QueryClientProvider>
    </AuthProvider>
  )
}

export default App
