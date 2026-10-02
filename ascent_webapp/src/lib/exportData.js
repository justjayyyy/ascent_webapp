// What "Download CSV" in Settings exports. Everything is fetched when asked for (not on every visit),
// and transactions are paged past the API's per-request cap so the export is the whole history.
import { ascent } from '@/api/client';
import { toCSV, sections } from './csv';
import { localDay } from '@/lib/localDay';

const PAGE = 10000; // the API's largest page

/** Every transaction in the current workspace, newest first. */
export async function allTransactions(api = ascent) {
  const all = new Map();
  let to;
  for (let i = 0; i < 100; i += 1) {
    const page = await api.entities.ExpenseTransaction.filter(to ? { to } : {}, '-date', PAGE);
    page.forEach((tx) => all.set(tx.id, tx));
    if (page.length < PAGE) break;
    // The next page starts at the oldest day of this one (that day again, so none of it is lost)
    const oldest = String(page[page.length - 1].date || '').slice(0, 10);
    if (!oldest || oldest === to) break;
    to = oldest;
  }
  return [...all.values()];
}

const today = () => localDay();

export const DATASETS = {
  expenses: {
    permission: 'viewExpenses',
    async build(api = ascent) {
      const [transactions, budgets, categories, cards] = await Promise.all([
        allTransactions(api),
        api.entities.Budget.list('-created_date', 10000).catch(() => []),
        api.entities.Category.list('-created_date', 10000),
        api.entities.Card.list('-created_date', 10000).catch(() => []),
      ]);
      return {
        filename: `expenses_export_${today()}.csv`,
        count: transactions.length,
        csv: sections([
          ['TRANSACTIONS', toCSV(transactions, ['date', 'type', 'category', 'description', 'merchant', 'amount', 'currency', 'amountInGlobalCurrency', 'globalCurrency', 'paymentMethod', 'paidBy', 'created_by', 'status', 'source'])],
          ['BUDGETS', toCSV(budgets, ['category', 'monthlyLimit', 'alertThreshold', 'currency', 'year', 'month'])],
          ['CATEGORIES', toCSV(categories, ['name', 'color', 'icon', 'type'])],
          ['CARDS', toCSV(cards, ['name', 'type', 'lastFourDigits', 'walletName', 'color', 'isActive'])],
        ]),
      };
    },
  },
  notes: {
    permission: null,
    async build(api = ascent) {
      const notes = await api.entities.Note.list('-updated_date', 10000);
      const rows = notes.map((n) => ({
        ...n,
        content: n.type === 'checklist' ? (n.items || []).map((i) => `${i.done ? '[x]' : '[ ]'} ${i.text}`).join('\n') : n.content,
      }));
      return {
        filename: `notes_export_${today()}.csv`,
        count: notes.length,
        csv: toCSV(rows, ['title', 'content', 'color', 'tags', 'isPinned', 'created_date', 'updated_date']),
      };
    },
  },
  portfolio: {
    permission: 'viewPortfolio',
    async build(api = ascent) {
      const [accounts, positions] = await Promise.all([
        api.entities.Account.list('-created_date', 10000),
        api.entities.Position.list('-created_date', 10000),
      ]);
      return {
        filename: `portfolio_export_${today()}.csv`,
        count: accounts.length + positions.length,
        csv: sections([
          ['ACCOUNTS', toCSV(accounts, ['name', 'type', 'baseCurrency', 'initialInvestment', 'totalDeposits', 'totalWithdrawals', 'totalFees', 'notes'])],
          ['POSITIONS', toCSV(positions, ['accountId', 'symbol', 'assetType', 'quantity', 'averageBuyPrice', 'currentPrice', 'currency', 'notes'])],
        ]),
      };
    },
  },
};

/** Hands the file to the browser as a download. A BOM keeps Hebrew and Russian readable in Excel. */
export function downloadCSV(csv, filename) {
  const url = URL.createObjectURL(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }));
  const link = Object.assign(document.createElement('a'), { href: url, download: filename });
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
