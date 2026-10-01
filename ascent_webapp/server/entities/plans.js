import Plan from '../models/Plan.js';
import { createEntityHandler } from '../lib/entityHandler.js';

// Plans are part of the household's spending, so they follow the expenses permissions
export default createEntityHandler(Plan, { permission: { read: 'viewExpenses', write: 'editExpenses' }, lists: ['items'] });
