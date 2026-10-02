// Plans (/Plans) and a plan's own page.
import { L } from '../support/i18n.js';

export class PlansScreen {
  constructor(page) {
    this.page = page;
  }

  /** From the empty page: pick a kind of plan (its suggested costs come with it), name it and create it. */
  async createFromKind(kind, { name }) {
    await this.page.getByRole('button', { name: L(`planKind_${kind}`) }).click();
    await this.page.getByLabel(L('planName'), { exact: true }).fill(name);
    await this.page.getByRole('button', { name: L('createPlan') }).click();
  }

  async addCost({ name, amount }) {
    await this.page.getByRole('button', { name: L('addPlanItem') }).click();
    await this.page.getByLabel(L('planItemName')).fill(name);
    await this.page.getByLabel(new RegExp(`^${L('amount')}`)).fill(String(amount));
    await this.page.getByRole('button', { name: L('save'), exact: true }).click();
  }
}
