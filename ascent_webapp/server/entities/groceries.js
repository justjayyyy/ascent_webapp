import GroceryItem from '../models/GroceryItem.js';
import { createEntityHandler } from '../lib/entityHandler.js';

// The shopping list is a household chore, not money: every member can see it and tick things off
export default createEntityHandler(GroceryItem, { lists: ['purchases'] });
