import Card from '../models/Card.js';
import { createEntityHandler } from '../lib/entityHandler.js';

// Everyone who sees the money sees the cards (expenses are tagged with them); adding, changing or removing one
// is the "manage cards" permission (owners and admins, or members it is given to), as in Settings
export default createEntityHandler(Card, { permission: { read: 'viewExpenses', write: 'manageCards' } });
