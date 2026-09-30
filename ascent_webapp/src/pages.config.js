import { lazy } from 'react';
import Layout from './Layout';

// Lazy load pages for better performance (code splitting)
const Dashboard = lazy(() => import('./pages/Dashboard'));
// Portfolio and AccountDetail are hidden for now (files kept in ./pages).
// To bring them back: re-add the lazy imports and the entries in Pages below.
const Expenses = lazy(() => import('./pages/Expenses'));
const Income = lazy(() => import('./pages/Income'));
const Plans = lazy(() => import('./pages/Plans'));
const Notes = lazy(() => import('./pages/Notes'));
const Settings = lazy(() => import('./pages/Settings'));

export const pagesConfig = {
  mainPage: 'Dashboard',
  Pages: {
    Dashboard,
    Expenses,
    Income,
    Plans,
    Notes,
    Settings,
  },
  Layout
};
