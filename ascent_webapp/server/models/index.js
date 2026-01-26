// Models index with MongoDB indexes for better performance
import mongoose from 'mongoose';

// Account Model with indexes
const AccountSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { 
    type: String, 
    enum: ['Investment', 'Brokerage', 'IRA', 'Pension', 'Savings', 'Checking', 'Credit Card', 'Loan', 'Other'], 
    required: true 
  },
  baseCurrency: { type: String, required: true, default: 'USD' },
  institution: { type: String },
  initialInvestment: { type: Number, default: 0 },
  totalDeposits: { type: Number, default: 0 },
  totalWithdrawals: { type: Number, default: 0 },
  totalFees: { type: Number, default: 0 },
  notes: { type: String },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now, index: true },
  updated_date: { type: Date, default: Date.now },
});
AccountSchema.index({ created_by: 1, created_date: -1 });

// Position Model with indexes
const PositionSchema = new mongoose.Schema({
  accountId: { type: String, required: true, index: true },
  symbol: { type: String, required: true, index: true },
  name: { type: String },
  quantity: { type: Number, required: true, default: 0 },
  averageBuyPrice: { type: Number, required: true, default: 0 },
  currentPrice: { type: Number },
  lastPriceUpdate: { type: Date },
  assetType: { 
    type: String, 
    enum: ['Stock', 'ETF', 'Bond', 'Mutual Fund', 'Crypto', 'Cash', 'Option', 'Other'],
    default: 'Stock'
  },
  strikePrice: { type: Number, default: null },
  expirationDate: { type: String, default: null },
  optionType: { type: String, enum: ['Call', 'Put'], default: null },
  optionAction: { type: String, enum: ['Buy', 'Sell'], default: null },
  premiumPrice: { type: Number, default: null },
  stockPriceAtPurchase: { type: Number, default: null },
  sector: { type: String },
  currency: { type: String, default: 'USD' },
  notes: { type: String },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});
PositionSchema.index({ created_by: 1, accountId: 1 });
PositionSchema.index({ symbol: 1, created_by: 1 });

// DayTrade Model with indexes
const DayTradeSchema = new mongoose.Schema({
  accountId: { type: String, required: true, index: true },
  symbol: { type: String, required: true },
  date: { type: Date, required: true, index: true },
  side: { type: String, enum: ['Long', 'Short'], required: true },
  entryPrice: { type: Number, required: true },
  exitPrice: { type: Number, required: true },
  quantity: { type: Number, required: true },
  profitLoss: { type: Number, required: true },
  fees: { type: Number, default: 0 },
  notes: { type: String },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});
DayTradeSchema.index({ created_by: 1, date: -1 });

// ExpenseTransaction Model with indexes
const ExpenseTransactionSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  amount: { type: Number, required: true },
  description: { type: String },
  category: { type: String, index: true },
  type: { type: String, enum: ['Expense', 'Income'], required: true, index: true },
  paymentMethod: { type: String },
  cardId: { type: String },
  recurring: { type: Boolean, default: false },
  recurringFrequency: { type: String },
  tags: [String],
  notes: { type: String },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});
ExpenseTransactionSchema.index({ created_by: 1, date: -1 });
ExpenseTransactionSchema.index({ created_by: 1, category: 1, date: -1 });

// Budget Model
const BudgetSchema = new mongoose.Schema({
  category: { type: String, required: true },
  monthlyLimit: { type: Number, required: true },
  alertThreshold: { type: Number, default: 80, min: 1, max: 100 },
  currency: { type: String, default: 'USD' },
  year: { type: Number, required: true, index: true },
  month: { type: Number, required: true, min: 1, max: 12, index: true },
  period: { type: String, enum: ['monthly', 'weekly', 'yearly'], default: 'monthly' },
  isActive: { type: Boolean, default: true },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});
BudgetSchema.index({ created_by: 1, category: 1 });
BudgetSchema.index({ created_by: 1, year: 1, month: 1, category: 1 });

// Category Model
const CategorySchema = new mongoose.Schema({
  name: { type: String, required: true },
  color: { type: String, default: '#5C8374' },
  icon: { type: String },
  type: { type: String, enum: ['expense', 'income', 'both'], default: 'expense' },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});

// Card Model
const CardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  type: { type: String, enum: ['Credit', 'Debit', 'Prepaid'], default: 'Credit' },
  lastFourDigits: { type: String },
  bank: { type: String },
  color: { type: String, default: '#5C8374' },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});

// FinancialGoal Model
const FinancialGoalSchema = new mongoose.Schema({
  name: { type: String, required: true },
  targetAmount: { type: Number, required: true },
  currentAmount: { type: Number, default: 0 },
  targetDate: { type: Date },
  category: { type: String },
  linkedAccountIds: [String],
  priority: { type: String, enum: ['low', 'medium', 'high'], default: 'medium' },
  status: { type: String, enum: ['active', 'completed', 'paused'], default: 'active' },
  notes: { type: String },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});

// DashboardWidget Model
const DashboardWidgetSchema = new mongoose.Schema({
  widgetType: { type: String, required: true },
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  w: { type: Number, default: 1 },
  h: { type: Number, default: 1 },
  enabled: { type: Boolean, default: true },
  config: { type: mongoose.Schema.Types.Mixed },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});

// PageLayout Model
const PageLayoutSchema = new mongoose.Schema({
  pageName: { type: String, required: true },
  layout: { type: mongoose.Schema.Types.Mixed },
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});

// SharedUser Model
const SharedUserSchema = new mongoose.Schema({
  ownerEmail: { type: String, required: true, index: true },
  invitedEmail: { type: String, required: true, index: true },
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  permissions: {
    viewPortfolio: { type: Boolean, default: true },
    viewDashboard: { type: Boolean, default: true },
    viewExpenses: { type: Boolean, default: false },
    viewSettings: { type: Boolean, default: false },
    editData: { type: Boolean, default: false },
  },
  created_by: { type: String, required: true },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
});
SharedUserSchema.index({ ownerEmail: 1, invitedEmail: 1 });

// PortfolioSnapshot Model
const PortfolioSnapshotSchema = new mongoose.Schema({
  date: { type: Date, required: true, index: true },
  totalValue: { type: Number, required: true },
  totalPnL: { type: Number },
  accountBreakdown: [{ 
    accountId: String, 
    value: Number 
  }],
  created_by: { type: String, required: true, index: true },
  created_date: { type: Date, default: Date.now },
});
PortfolioSnapshotSchema.index({ created_by: 1, date: -1 });

// User Model
const UserSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true, index: true },
  password: { type: String },
  full_name: { type: String },
  googleId: { type: String, sparse: true },
  currency: { type: String, default: 'USD' },
  language: { type: String, default: 'en' },
  theme: { type: String, default: 'dark' },
  blurValues: { type: Boolean, default: false },
  created_date: { type: Date, default: Date.now },
  updated_date: { type: Date, default: Date.now },
  lastLogin: { type: Date },
});

// Pre-save middleware for updated_date
const schemas = [
  AccountSchema, PositionSchema, DayTradeSchema, ExpenseTransactionSchema,
  BudgetSchema, CategorySchema, CardSchema, FinancialGoalSchema,
  DashboardWidgetSchema, PageLayoutSchema, SharedUserSchema, UserSchema
];

schemas.forEach(schema => {
  if (schema.paths.updated_date) {
    schema.pre('save', function(next) {
      this.updated_date = Date.now();
      next();
    });
  }
});

// Export models (with caching for serverless)
export const Account = mongoose.models.Account || mongoose.model('Account', AccountSchema);
export const Position = mongoose.models.Position || mongoose.model('Position', PositionSchema);
export const DayTrade = mongoose.models.DayTrade || mongoose.model('DayTrade', DayTradeSchema);
export const ExpenseTransaction = mongoose.models.ExpenseTransaction || mongoose.model('ExpenseTransaction', ExpenseTransactionSchema);
export const Budget = mongoose.models.Budget || mongoose.model('Budget', BudgetSchema);
export const Category = mongoose.models.Category || mongoose.model('Category', CategorySchema);
export const Card = mongoose.models.Card || mongoose.model('Card', CardSchema);
export const FinancialGoal = mongoose.models.FinancialGoal || mongoose.model('FinancialGoal', FinancialGoalSchema);
export const DashboardWidget = mongoose.models.DashboardWidget || mongoose.model('DashboardWidget', DashboardWidgetSchema);
export const PageLayout = mongoose.models.PageLayout || mongoose.model('PageLayout', PageLayoutSchema);
export const SharedUser = mongoose.models.SharedUser || mongoose.model('SharedUser', SharedUserSchema);
export const PortfolioSnapshot = mongoose.models.PortfolioSnapshot || mongoose.model('PortfolioSnapshot', PortfolioSnapshotSchema);
export const User = mongoose.models.User || mongoose.model('User', UserSchema);

export default {
  Account,
  Position,
  DayTrade,
  ExpenseTransaction,
  Budget,
  Category,
  Card,
  FinancialGoal,
  DashboardWidget,
  PageLayout,
  SharedUser,
  PortfolioSnapshot,
  User,
};
