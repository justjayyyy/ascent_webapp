import Commitment from '../models/Commitment.js';
import { createEntityHandler } from '../lib/entityHandler.js';

// Loans are part of the household's money, so they follow the expenses permissions
export default createEntityHandler(Commitment, { permission: { read: 'viewExpenses', write: 'editExpenses' }, lists: ['payments'] });
