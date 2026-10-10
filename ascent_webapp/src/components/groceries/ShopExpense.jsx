// After a shop: whether to add it as an expense, saying so when the payment seems to be there already
// (from Apple Pay or the bank), and the expense form filled in from the receipt. Used after a shopping trip
// and after a receipt is scanned on its own.
import React, { useState } from 'react';
import { CircleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/components/ThemeProvider';
import { useAuth } from '@/lib/AuthContext';
import { useCategories, useMoney, usePlans } from '@/hooks/useWorkspaceData';
import { useTransactions } from '@/lib/offline/txOutbox';
import AddTransactionDialog from '@/components/expenses/AddTransactionDialog';
import { useSaveTransaction } from '@/components/expenses/useTransactionMutations';
import { localDay } from '@/lib/localDay';
import { cn } from '@/lib/utils';
import { localeOf, money } from './GroceryParts';
import { findLoggedExpense } from './groceryUtils';

export const groceriesCategory = (categories) =>
  categories.find((c) => c.nameKey === 'groceries' || c.name === 'groceries')
  || categories.find((c) => /grocer|מכולת|продукт/i.test(c.name))
  || categories.find((c) => c.type === 'Expense');

/**
 * `date`: the shop's day (the payments a week around it are checked); `currency`: the receipt's. Returns
 * { canLog, loggedFor(read), open(read, fallback), isOpen, dialog }: render `dialog`, hide your own while isOpen.
 */
export function useShopExpense({ enabled, date, currency, onDone }) {
  const { t, user } = useTheme();
  const { hasPermission } = useAuth();
  const canLog = hasPermission('editExpenses');
  const on = !!enabled && canLog;
  const { data: categories = [] } = useCategories({ enabled: on });
  const { data: plans = [] } = usePlans({ enabled: on });
  const since = date ? localDay(new Date(Date.parse(`${date}T12:00:00`) - 7 * 86_400_000)) : undefined;
  const { data: transactions = [] } = useTransactions({ from: since, enabled: on && hasPermission('viewExpenses') });
  const { save, saving } = useSaveTransaction();
  const { convert } = useMoney(currency || user?.currency || 'ILS');
  const [expense, setExpense] = useState(null);
  const mine = user?.currency || 'ILS';

  const loggedFor = (read) => (read && canLog
    ? findLoggedExpense(transactions, { total: read.total, currency: read.currency || mine, date: read.date || date }, convert)
    : null);

  const open = (read, { store = '' } = {}) => {
    const category = groceriesCategory(categories);
    setExpense({
      type: 'Expense',
      category: category?.name || '',
      description: read?.store || store || t('grExpenseDescription'),
      amount: read?.total || '',
      currency: read?.currency || mine,
      date: read?.date || date || localDay(),
      paymentMethod: '',
    });
  };

  const close = () => { setExpense(null); onDone?.(); };
  const dialog = (
    <AddTransactionDialog
      open={!!expense}
      onClose={close}
      onSubmit={async (data) => { if (await save(data, null)) close(); }}
      isLoading={saving}
      categories={categories}
      editTransaction={expense}
      defaultType="Expense"
      plans={plans}
    />
  );
  return { canLog, loggedFor, open, isOpen: !!expense, dialog };
}

/** "Add it as an expense?", warning when a payment of the same amount is there already. */
export function ExpenseQuestion({ logged, onNo, onYes }) {
  const { t, language, user } = useTheme();
  const loc = localeOf(language);
  const day = (d) => new Intl.DateTimeFormat(loc, { day: 'numeric', month: 'short' }).format(new Date(`${String(d).slice(0, 10)}T12:00:00`));
  return (
    <section aria-labelledby="gr-expense-q" className={cn('rounded-2xl p-3.5', logged ? 'bg-warning/10' : 'bg-foreground/[0.04]')}>
      <h3 id="gr-expense-q" className="text-base font-semibold text-foreground">{t('grExpenseQ')}</h3>
      {logged ? (
        <p className="mt-1 flex gap-1.5 text-sm text-foreground">
          <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden />
          <span>
            {t('grExpenseAlreadyThere', {
              what: logged.description || logged.merchant || t('grExpenseDescription'),
              amount: money(loc, logged.currency || user?.currency || 'ILS')(logged.amount),
              date: day(logged.date),
            })}
          </span>
        </p>
      ) : (
        <p className="mt-1 text-sm text-muted-foreground">{t('grExpenseQHint')}</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant={logged ? 'default' : 'secondary'} onClick={onNo} className="h-12 rounded-xl text-base">{t('grExpenseNo')}</Button>
        <Button variant={logged ? 'secondary' : 'default'} onClick={onYes} className="h-12 rounded-xl text-base">
          {t(logged ? 'grExpenseAddAnyway' : 'grExpenseYes')}
        </Button>
      </div>
    </section>
  );
}
