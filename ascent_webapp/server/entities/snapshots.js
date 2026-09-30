import PortfolioSnapshot from '../models/PortfolioSnapshot.js';
import { createEntityHandler } from '../lib/entityHandler.js';

export default createEntityHandler(PortfolioSnapshot, { permission: { read: 'viewPortfolio', write: 'editPortfolio' } });

