import HouseTask from '../models/HouseTask.js';
import { createEntityHandler } from '../lib/entityHandler.js';

// Household tasks are chores, like the shopping list: every member can see them and tick them off.
// Logging what one cost is an expense, and that still needs the expenses permission. The person a task
// is assigned to must be a member; each time it was done is its own entry, so two people never collide.
export default createEntityHandler(HouseTask, {
  lists: ['history'],
  people: { assignee: (v) => (v ? [v] : []) },
});
