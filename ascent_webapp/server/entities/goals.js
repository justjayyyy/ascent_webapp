import FinancialGoal from '../models/FinancialGoal.js';
import { createEntityHandler } from '../lib/entityHandler.js';

// Savings goals. Deposits and withdrawals change one entry at a time, so two members adding money at once keep both
export default createEntityHandler(FinancialGoal, { permission: { read: 'viewGoals', write: 'editGoals' }, lists: ['entries'] });
