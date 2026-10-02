import React, { Suspense, useEffect } from 'react';
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { Toaster as SonnerToaster } from 'sonner';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { queryClientInstance } from '@/lib/query-client';
import { persistOptions } from '@/lib/offline/persist';
import AppSplash from '@/components/AppSplash';
import EntryTransition from '@/components/EntryTransition';
import ErrorBoundary from '@/components/ErrorBoundary';
import { SkeletonPage } from '@/components/ui/skeleton-card';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import { ThemeProvider, useTheme } from '@/components/ThemeProvider';
import { pagesConfig } from './pages.config';
import { LazyMotion } from '@/lib/motion';
import PageNotFound from './lib/PageNotFound';
import { firstAllowedPage, PAGE_PERMISSIONS } from './lib/pageAccess';

const Login = React.lazy(() => import('./pages/Login'));
const PrivacyPolicy = React.lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = React.lazy(() => import('./pages/TermsOfService'));
const AcceptInvitation = React.lazy(() => import('./pages/AcceptInvitation'));
const ResetPassword = React.lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = React.lazy(() => import('./pages/VerifyEmail'));

const { Pages, Layout, mainPage } = pagesConfig;

const PageFrame = ({ name, children }) => (
  <Layout currentPageName={name}>
    <ErrorBoundary resetKey={name}>
      <Suspense fallback={<SkeletonPage />}>{children}</Suspense>
    </ErrorBoundary>
  </Layout>
);

function PermissionGuard({ pageName, children }) {
  const { hasPermission } = useAuth();
  const { t } = useTheme();
  const needed = PAGE_PERMISSIONS[pageName];
  if (!needed || hasPermission(needed)) return children;
  const fallback = firstAllowedPage(hasPermission);
  if (!fallback) return <div className="p-8 text-center text-foreground">{t('noAccessAnyPage')}</div>;
  return <Navigate to={`/${fallback}`} replace />;
}

// A full page load to /login, so the sign-in page starts clean, with this address to come back to
function GoToLogin() {
  const { navigateToLogin } = useAuth();
  useEffect(() => { navigateToLogin(); }, [navigateToLogin]);
  return <AppSplash />;
}

function AuthenticatedApp() {
  const { isLoadingAuth, isAuthenticated, isSigningOut } = useAuth();
  // First sign-in check on a device with no saved session (a saved one opens the app at once), or signing out
  // (which goes to /login itself once the session has ended)
  if (isLoadingAuth || isSigningOut) return <AppSplash />;
  if (!isAuthenticated) return <GoToLogin />;

  const page = (name, Page) => (
    <PermissionGuard pageName={name}>
      <PageFrame name={name}><Page /></PageFrame>
    </PermissionGuard>
  );
  return (
    <Routes>
      <Route path="/" element={page(mainPage, Pages[mainPage])} />
      {Object.entries(Pages).map(([name, Page]) => <Route key={name} path={`/${name}`} element={page(name, Page)} />)}
      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
}

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

// Animation code arrives after start-up, so the first screen does not wait for it
const motionFeatures = () => import('@/lib/motionFeatures').then((m) => m.default);

const lazyPage = (Page, fallback = <SkeletonPage />) => <Suspense fallback={fallback}><Page /></Suspense>;

export default function App() {
  return (
    <AuthProvider>
      <PersistQueryClientProvider
        client={queryClientInstance}
        persistOptions={persistOptions}
        // Restored numbers show at once; refresh everything on screen behind them
        onSuccess={() => queryClientInstance.invalidateQueries()}
      >
        <ThemeProvider>
          <LazyMotion features={motionFeatures}>
            <Router>
              <Routes>
                <Route path="/login" element={lazyPage(Login, <AppSplash />)} />
                <Route path="/privacy-policy" element={lazyPage(PrivacyPolicy)} />
                <Route path="/terms-of-service" element={lazyPage(TermsOfService)} />
                <Route path="/accept-invitation/:token" element={lazyPage(AcceptInvitation)} />
                <Route path="/reset-password/:token" element={lazyPage(ResetPassword)} />
                <Route path="/verify-email/:token" element={lazyPage(VerifyEmail)} />
                <Route path="/*" element={<AuthenticatedApp />} />
              </Routes>
            </Router>
            <AppSonnerToaster />
            <EntryTransition />
            <Analytics />
            <SpeedInsights />
          </LazyMotion>
        </ThemeProvider>
      </PersistQueryClientProvider>
    </AuthProvider>
  );
}
