// Application constants and theme configuration

// Brand colors
export const COLORS = {
  primary: '#5C8374',
  primaryLight: '#9EC8B9',
  primaryDark: '#1B4242',
  background: '#092635',
  success: '#10B981',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#60A5FA',
};

// Chart colors palette
export const CHART_COLORS = [
  '#5C8374',
  '#9EC8B9', 
  '#60A5FA',
  '#A78BFA',
  '#F59E0B',
  '#EF4444',
  '#10B981',
  '#EC4899',
  '#8B5CF6',
  '#14B8A6',
];

// Theme configurations
export const THEMES = {
  dark: {
    bgPrimary: 'bg-[#092635]',
    bgSecondary: 'bg-[#1B4242]',
    bgTertiary: 'bg-[#092635]',
    textPrimary: 'text-white',
    textSecondary: 'text-[#9EC8B9]',
    textTertiary: 'text-[#5C8374]',
    accentText: 'text-[#9EC8B9]',
    border: 'border-[#5C8374]/30',
    borderLight: 'border-[#5C8374]/20',
    cardBg: 'bg-[#1B4242]',
    cardBorder: 'border-[#5C8374]/30',
    inputBg: 'bg-[#092635]',
    inputBorder: 'border-[#5C8374]/50',
  },
  light: {
    bgPrimary: 'bg-slate-50',
    bgSecondary: 'bg-white',
    bgTertiary: 'bg-slate-100',
    textPrimary: 'text-slate-900',
    textSecondary: 'text-slate-700',
    textTertiary: 'text-slate-500',
    accentText: 'text-[#5C8374]',
    border: 'border-slate-200',
    borderLight: 'border-slate-100',
    cardBg: 'bg-white',
    cardBorder: 'border-slate-200',
    inputBg: 'bg-white',
    inputBorder: 'border-slate-300',
  },
};

// Currency configuration
export const CURRENCIES = [
  { code: 'USD', symbol: '$', name: 'US Dollar' },
  { code: 'EUR', symbol: '€', name: 'Euro' },
  { code: 'GBP', symbol: '£', name: 'British Pound' },
  { code: 'ILS', symbol: '₪', name: 'Israeli Shekel' },
  { code: 'JPY', symbol: '¥', name: 'Japanese Yen' },
  { code: 'CHF', symbol: 'CHF', name: 'Swiss Franc' },
  { code: 'CAD', symbol: 'C$', name: 'Canadian Dollar' },
  { code: 'AUD', symbol: 'A$', name: 'Australian Dollar' },
];

// Account types
export const ACCOUNT_TYPES = [
  'Investment',
  'Brokerage',
  'IRA',
  'Pension',
  'Savings',
  'Checking',
  'Credit Card',
  'Loan',
  'Other',
];

// Asset types
export const ASSET_TYPES = [
  'Stock',
  'ETF',
  'Bond',
  'Mutual Fund',
  'Crypto',
  'Cash',
  'Option',
  'Other',
];

// Transaction types
export const TRANSACTION_TYPES = ['Expense', 'Income'];

// Time range options
export const TIME_RANGES = [
  { value: '7d', label: '7 Days' },
  { value: '30d', label: '30 Days' },
  { value: '90d', label: '90 Days' },
  { value: '1y', label: '1 Year' },
  { value: 'all', label: 'All Time' },
];

// Dashboard widget types
export const WIDGET_TYPES = [
  { id: 'portfolio_value', name: 'Portfolio Value', icon: 'TrendingUp' },
  { id: 'net_worth', name: 'Net Worth', icon: 'Wallet' },
  { id: 'account_allocation', name: 'Account Allocation', icon: 'PieChart' },
  { id: 'asset_allocation', name: 'Asset Allocation', icon: 'BarChart' },
  { id: 'savings_rate', name: 'Savings Rate', icon: 'Percent' },
  { id: 'benchmark_comparison', name: 'Benchmark Comparison', icon: 'Target' },
  { id: 'financial_goals', name: 'Financial Goals', icon: 'Flag' },
  { id: 'account_summary', name: 'Account Summary', icon: 'List' },
];

// API configuration
export const API_CONFIG = {
  timeout: 30000,
  retries: 3,
  retryDelay: 1000,
};

// Query client defaults
export const QUERY_CONFIG = {
  staleTime: 5 * 60 * 1000,      // 5 minutes
  cacheTime: 30 * 60 * 1000,     // 30 minutes
  retryDelay: 1000,
  retries: 2,
};

// Format currency helper
export function formatCurrency(value, currency = 'USD', options = {}) {
  const { compact = false, showSign = false } = options;
  
  const formatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits: compact ? 0 : 2,
    maximumFractionDigits: compact ? 0 : 2,
    notation: compact && Math.abs(value) >= 10000 ? 'compact' : 'standard',
  });
  
  const formatted = formatter.format(Math.abs(value));
  
  if (showSign && value !== 0) {
    return value > 0 ? `+${formatted}` : `-${formatted}`;
  }
  
  return value < 0 ? `-${formatted}` : formatted;
}

// Format percentage helper
export function formatPercent(value, options = {}) {
  const { showSign = true, decimals = 2 } = options;
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

// Format date helper
export function formatDate(date, format = 'short') {
  const d = new Date(date);
  
  if (format === 'short') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (format === 'medium') {
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }
  if (format === 'long') {
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }
  if (format === 'relative') {
    const now = new Date();
    const diff = now - d;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    
    if (days === 0) return 'Today';
    if (days === 1) return 'Yesterday';
    if (days < 7) return `${days} days ago`;
    if (days < 30) return `${Math.floor(days / 7)} weeks ago`;
    return formatDate(date, 'medium');
  }
  
  return d.toLocaleDateString();
}

export default {
  COLORS,
  CHART_COLORS,
  THEMES,
  CURRENCIES,
  ACCOUNT_TYPES,
  ASSET_TYPES,
  formatCurrency,
  formatPercent,
  formatDate,
};

