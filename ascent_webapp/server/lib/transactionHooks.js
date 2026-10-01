// Side effects of saving a transaction, attached to the model so every path (the app, Apple Pay,
// SMS, scripts) behaves the same:
//   - a category someone chose is remembered for that merchant (merchantRules.js)
//   - a large expense by one member pings the others, when the workspace turned that on
// Bulk inserts (recurring runs, statement imports) fire neither, on purpose. Nothing here throws.
import { learnRule, ruleKeyFor } from './merchantRules.js';
import { notifyUser } from './push.js';
import { amountInCurrency } from '../../shared/money.js';

const COPY = {
  en: { spent: '{name} spent {amount}', someone: 'Someone' },
  he: { spent: '{name} הוציא/ה {amount}', someone: 'מישהו' },
  ru: { spent: '{name}: расход {amount}', someone: 'Кто-то' },
};

function formatMoney(amount, currency, language) {
  const locale = language === 'he' ? 'he-IL' : language === 'ru' ? 'ru-RU' : 'en-US';
  try {
    return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(amount);
  } catch {
    return `${Math.round(amount)} ${currency}`;
  }
}

/** The member-alert push for a large expense, in the reader's language. */
export function largeExpensePush(tx, payerName, language = 'en') {
  const c = COPY[language] || COPY.en;
  const title = c.spent.replace('{name}', payerName || c.someone).replace('{amount}', formatMoney(tx.amount, tx.currency || 'USD', language));
  return { title, body: tx.merchant || tx.description || tx.category || '', url: '/Expenses', tag: `large-${tx._id}` };
}

/** The amount in the alert's currency, or null when it cannot be compared without a rate. */
export function amountIn(tx, currency) {
  if (!currency) return tx.amount;
  return amountInCurrency(tx, currency, null);
}

/** Who should hear about a member's expense: accepted members who may see expenses, except the payer. */
export function alertRecipients(workspace, payerId) {
  return (workspace?.members || []).filter((m) =>
    m.userId &&
    String(m.userId) !== String(payerId) &&
    (m.status === 'accepted' || m.status == null) &&
    (m.role === 'owner' || m.role === 'admin' || String(workspace.ownerId) === String(m.userId) || m.permissions?.viewExpenses));
}

async function alertMembers(doc) {
  if (doc.type !== 'Expense') return;
  const { default: Workspace } = await import('../models/Workspace.js');
  const workspace = await Workspace.findById(doc.workspaceId).select('ownerId members settings').lean();
  const threshold = workspace?.settings?.largeExpenseAlert;
  if (!(threshold > 0)) return;
  const value = amountIn(doc, workspace.settings.largeExpenseCurrency);
  if (value === null || value < threshold) return;

  const recipients = alertRecipients(workspace, doc.createdBy);
  if (!recipients.length) return;
  const { default: User } = await import('../models/User.js');
  const people = await User.find({ _id: { $in: [doc.createdBy, ...recipients.map((m) => m.userId)] } }).select('full_name email language').lean();
  const byId = new Map(people.map((u) => [String(u._id), u]));
  const payer = byId.get(String(doc.createdBy));
  const payerName = payer?.full_name || payer?.email?.split('@')[0];
  await Promise.all(recipients.map((m) => notifyUser(m.userId, largeExpensePush(doc, payerName, byId.get(String(m.userId))?.language))));
}

export function installTransactionHooks(schema) {
  schema.pre('save', function markNew() {
    this.$locals.wasNew = this.isNew;
  });

  schema.post('save', async function afterCreate(doc) {
    if (!doc.$locals?.wasNew) return;
    try {
      await Promise.all([
        doc.category && (!doc.source || doc.source === 'manual')
          ? learnRule({ workspaceId: doc.workspaceId, key: ruleKeyFor(doc), type: doc.type, category: doc.category, by: doc.created_by })
          : null,
        alertMembers(doc),
      ]);
    } catch (err) {
      console.error('[TransactionHooks] after create:', err?.message);
    }
  });

  // An edit that sets the category is the clearest signal there is: remember it for the merchant
  schema.post('findOneAndUpdate', async function afterUpdate(doc) {
    try {
      const update = this.getUpdate() || {};
      const category = update.category ?? update.$set?.category;
      if (!doc || !category) return;
      await learnRule({ workspaceId: doc.workspaceId, key: ruleKeyFor(doc), type: doc.type, category: doc.category, by: doc.created_by });
    } catch (err) {
      console.error('[TransactionHooks] after update:', err?.message);
    }
  });
}
