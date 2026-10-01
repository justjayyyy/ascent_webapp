import ExpenseTransaction from '../models/ExpenseTransaction.js';
import { createEntityHandler } from '../lib/entityHandler.js';

export default createEntityHandler(ExpenseTransaction, { permission: { read: 'viewExpenses', write: 'editExpenses' }, dateField: 'date' });

