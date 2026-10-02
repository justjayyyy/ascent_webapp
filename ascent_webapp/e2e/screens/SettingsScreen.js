// Settings (/Settings): the parts the specs use so far.
import { L } from '../support/i18n.js';

export class SettingsScreen {
  constructor(page) {
    this.page = page;
    this.addPasskey = page.getByRole('button', { name: L('secAdd'), exact: true });
    this.lockSwitch = page.locator('#lock-switch');
  }

  logout() {
    return this.page.getByRole('button', { name: L('logout') }).click();
  }
}
