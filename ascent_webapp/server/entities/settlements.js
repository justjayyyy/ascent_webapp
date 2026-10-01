import Settlement from '../models/Settlement.js';
import { createEntityHandler } from '../lib/entityHandler.js';

export default createEntityHandler(Settlement, {
  permission: { read: 'viewExpenses', write: 'editExpenses' },
  people: { from: (v) => [v], to: (v) => [v] },
});
