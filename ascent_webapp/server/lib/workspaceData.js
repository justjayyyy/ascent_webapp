// Everything stored per workspace, so deleting a workspace removes its data too.
// workspaceData.test.mjs fails when a model with a workspaceId is missing from this list.
import Account from '../models/Account.js';
import Budget from '../models/Budget.js';
import Card from '../models/Card.js';
import Category from '../models/Category.js';
import Commitment from '../models/Commitment.js';
import DashboardWidget from '../models/DashboardWidget.js';
import DayTrade from '../models/DayTrade.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import FinancialGoal from '../models/FinancialGoal.js';
import GroceryItem from '../models/GroceryItem.js';
import IngestEvent from '../models/IngestEvent.js';
import IngestToken from '../models/IngestToken.js';
import MerchantRule from '../models/MerchantRule.js';
import Note from '../models/Note.js';
import NoteFile from '../models/NoteFile.js';
import PageLayout from '../models/PageLayout.js';
import Plan from '../models/Plan.js';
import PortfolioSnapshot from '../models/PortfolioSnapshot.js';
import PortfolioTransaction from '../models/PortfolioTransaction.js';
import Position from '../models/Position.js';
import User from '../models/User.js';

export const WORKSPACE_MODELS = [
  Account, Budget, Card, Category, Commitment, DashboardWidget, DayTrade, ExpenseTransaction,
  FinancialGoal, GroceryItem, IngestEvent, IngestToken, MerchantRule, Note, NoteFile, PageLayout, Plan,
  PortfolioSnapshot, PortfolioTransaction, Position,
];

/** Removes every row that belongs to the workspace and clears users' pointers to it. */
export async function deleteWorkspaceData(workspaceId) {
  await Promise.all(WORKSPACE_MODELS.map((Model) => Model.deleteMany({ workspaceId })));
  await Promise.all([
    User.updateMany({ defaultWorkspace: workspaceId }, { $unset: { defaultWorkspace: 1 } }),
    User.updateMany({ shortcutWorkspaceId: workspaceId }, { $set: { shortcutWorkspaceId: null } }),
  ]);
}
