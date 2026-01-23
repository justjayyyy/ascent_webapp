import { lazy } from 'react';
import Layout from './Layout';

// Lazy load pages for better performance (code splitting)
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Portfolio = lazy(() => import('./pages/Portfolio'));
const AccountDetail = lazy(() => import('./pages/AccountDetail'));
const Expenses = lazy(() => import('./pages/Expenses'));
const Notes = lazy(() => import('./pages/Notes'));
const Settings = lazy(() => import('./pages/Settings'));

export const pagesConfig = {
  mainPage: 'Portfolio',
  Pages: {
    Dashboard,
    Portfolio,
    AccountDetail,
    Expenses,
    Notes,
    Settings,
  },
  Layout
};
