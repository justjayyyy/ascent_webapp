import { lazy } from 'react';
import Layout from './Layout';

// Lazy load pages for better performance (code splitting)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Income = lazy(() => import('./pages/Income'));
const Plans = lazy(() => import('./pages/Plans'));
const Commitments = lazy(() => import('./pages/Commitments'));
const Notes = lazy(() => import('./pages/Notes'));
const Settings = lazy(() => import('./pages/Settings'));

export const pagesConfig = {
  mainPage: 'Dashboard',
  Pages: {
    Dashboard,
    Expenses,
    Income,
    Plans,
    Commitments,
    Notes,
    Settings,
  },
  Layout
};
