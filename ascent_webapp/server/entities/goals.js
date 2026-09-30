import FinancialGoal from '../models/FinancialGoal.js';
import { createEntityHandler } from '../lib/entityHandler.js';

export default createEntityHandler(FinancialGoal, { permission: { read: 'viewGoals', write: 'editGoals' } });

