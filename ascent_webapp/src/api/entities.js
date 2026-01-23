import { ascent } from './client';

// Export entities for direct import
export const Account = ascent.entities.Account;
export const Position = ascent.entities.Position;
export const DayTrade = ascent.entities.DayTrade;
export const ExpenseTransaction = ascent.entities.ExpenseTransaction;
export const Budget = ascent.entities.Budget;
export const Category = ascent.entities.Category;
export const Card = ascent.entities.Card;
export const FinancialGoal = ascent.entities.FinancialGoal;
export const DashboardWidget = ascent.entities.DashboardWidget;
export const PageLayout = ascent.entities.PageLayout;
export const SharedUser = ascent.entities.SharedUser;
export const PortfolioSnapshot = ascent.entities.PortfolioSnapshot;

// Auth SDK
export const User = ascent.auth;

// Query helper (for compatibility)
export const Query = {
  async run(queryString) {
    console.warn('Query.run not implemented - use specific entity methods');
    return [];
  }
};
