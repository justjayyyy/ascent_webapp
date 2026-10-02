// Expenses (/Expenses): adding and finding transactions.
import { L } from '../support/i18n.js';

export class ExpensesScreen {
  constructor(page) {
    this.page = page;
  }

  /** Opens "Add expense", fills it and saves. Category stays as the dialog picks it unless given. */
  async addExpense({ amount, description, category }) {
    await this.page.getByRole('button', { name: L('addExpense') }).first().click();
    await this.page.getByLabel(L('amount')).fill(String(amount));
    if (description) await this.page.getByLabel(new RegExp(L('description'))).fill(description);
    if (category) await this.page.getByRole('button', { name: category }).first().click();
    await this.page.getByRole('button', { name: L('addTransaction') }).click();
  }

  row(text) {
    return this.page.getByText(text).first();
  }
}
