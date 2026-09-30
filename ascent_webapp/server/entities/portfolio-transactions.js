import PortfolioTransaction from '../models/PortfolioTransaction.js';
import { createEntityHandler } from '../lib/entityHandler.js';

export default createEntityHandler(PortfolioTransaction, { permission: { read: 'viewPortfolio', write: 'editPortfolio' } });
