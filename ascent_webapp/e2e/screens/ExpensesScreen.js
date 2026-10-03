// Expenses (/Expenses) and Income (/Income): the list, a row's drawer, and the add/edit dialog.
import { expect } from '@playwright/test';
import { L as translate } from '../support/i18n.js';

export class ExpensesScreen {
  /** `language`: the app's language for this person ('en', 'he' or 'ru'); the labels are looked up in it */
  constructor(page, { language = 'en' } = {}) {
    this.page = page;
    const L = (key, vars) => translate(key, vars, language);
    this.L = L;
    this.dialog = page.getByRole('dialog');
    this.amount = page.getByLabel(new RegExp(`^${L('amount')}`));
    this.description = page.getByLabel(new RegExp(`^${L('description')}`));
  }

  /** Opens "Add expense" (or income) and waits for its category chips: until a new account's categories have
   *  loaded there is no category to save with, and saving says "Select a category". */
  async openAdd(kind = 'expense') {
    await this.page.getByRole('button', { name: this.L(kind === 'income' ? 'addIncome' : 'addExpense') }).first().click();
    await this.dialog.getByRole('radiogroup', { name: this.L('category') }).getByRole('radio', { checked: true }).waitFor();
  }

  /** Picks a category by its name on screen, from the quick chips or the "more" list behind them. */
  async chooseCategory(name) {
    const group = this.dialog.getByRole('radiogroup', { name: this.L('category') });
    // A category added a moment ago can take a refetch to be offered, so look again until it is
    await expect(async () => {
      const chip = group.getByRole('radio', { name, exact: true });
      if (await chip.count()) { await chip.click(); return; }
      const more = this.dialog.getByRole('combobox', { name: this.L('category') });
      await more.click();
      const option = this.page.getByRole('option', { name, exact: true });
      if (await option.isVisible({ timeout: 1000 }).catch(() => false)) { await option.click(); return; }
      await this.page.keyboard.press('Escape');
      throw new Error(`"${name}" is not offered yet`);
    }).toPass({ timeout: 15_000 });
  }

  /** Opens "Add expense" (or income), fills it and saves. Category stays as the dialog picks it unless given. */
  async addExpense({ amount, description, category, kind = 'expense' }) {
    await this.openAdd(kind);
    await this.amount.fill(String(amount));
    // Category before description: a description makes the app suggest a category (moving chips around), and
    // a category picked by hand is never replaced by a suggestion
    if (category) await this.chooseCategory(category);
    if (description) await this.description.fill(description);
    await this.page.getByRole('button', { name: this.L('addTransaction'), exact: true }).click();
  }

  /** A big purchase paid in `payments` monthly installments. */
  async addInstallments({ amount, description, payments }) {
    await this.openAdd();
    await this.amount.fill(String(amount));
    await this.description.fill(description);
    await this.dialog.getByLabel(this.L('bigPurchase'), { exact: true }).check();
    await this.dialog.getByRole('spinbutton', { name: this.L('installments') }).fill(String(payments));
    await this.page.getByRole('button', { name: this.L('addInstallments', { count: payments }) }).click();
  }

  row(text) {
    return this.page.getByText(text).first();
  }

  /** Taps a transaction in the list; its drawer has Edit, Duplicate and Delete. */
  async openRow(description) {
    await this.page.getByRole('button', { name: new RegExp(description) }).first().click();
    return this.page.getByRole('dialog', { name: description });
  }

  async edit(description, { amount }) {
    const drawer = await this.openRow(description);
    await drawer.getByRole('button', { name: this.L('edit') }).click();
    await this.amount.fill(String(amount));
    await this.page.getByRole('button', { name: this.L('updateTransaction') }).click();
  }

  async delete(description) {
    const drawer = await this.openRow(description);
    await drawer.getByRole('button', { name: this.L('delete') }).click();
    await this.page.getByRole('alertdialog').getByRole('button', { name: this.L('delete'), exact: true }).click();
  }
}
