// The frame around every signed-in page: navigation on a phone (Menu) and on a computer (sidebar).
import { L } from '../support/i18n.js';

export class Shell {
  constructor(page) {
    this.page = page;
    this.nav = page.getByRole('navigation', { name: L('mainNavigation') });
    this.menuButton = page.getByRole('button', { name: L('menu') });
  }

  /** Phone: opens the menu and taps a page in it. `key` is the page's translation key ('expenses', 'notes'...) */
  async goByMenu(key) {
    await this.menuButton.tap();
    await this.nav.getByRole('link', { name: L(key) }).tap();
  }
}
