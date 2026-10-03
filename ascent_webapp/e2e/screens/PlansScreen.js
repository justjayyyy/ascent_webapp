// Plans (/Plans) and a plan's own page.
import { L } from '../support/i18n.js';

export class PlansScreen {
  constructor(page) {
    this.page = page;
  }

  /** From the empty page: pick a kind of plan (its suggested costs come with it), name it and create it. */
  async createFromKind(kind, { name, date, budget } = {}) {
    await this.page.getByRole('button', { name: L(`planKind_${kind}`) }).click();
    await this.page.getByLabel(L('planName'), { exact: true }).fill(name);
    if (date) await this.page.getByLabel(L('planDate'), { exact: true }).fill(date);
    if (budget) await this.page.getByLabel(new RegExp(`^${L('planBudget')}`)).fill(String(budget));
    await this.page.getByRole('button', { name: L('createPlan') }).click();
  }

  /** Opens a plan from the list. */
  open(name) {
    return this.page.getByRole('button', { name: new RegExp(name) }).first().click();
  }

  async addCost({ name, amount, dueDate }) {
    await this.page.getByRole('button', { name: L('addPlanItem') }).click();
    await this.page.getByLabel(L('planItemName')).fill(name);
    await this.page.getByLabel(new RegExp(`^${L('amount')}`)).fill(String(amount));
    if (dueDate) await this.page.getByLabel(L('dueDate'), { exact: true }).fill(dueDate);
    await this.page.getByRole('button', { name: L('save'), exact: true }).click();
  }
}
