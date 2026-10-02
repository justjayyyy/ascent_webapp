// The sign-in page (/login): language, email and password, sign-up, passkeys.
// Sign-in and sign-up panels can both be in the page while one animates out, hence `.last()`.
import { LANGUAGE_NAMES, L } from '../support/i18n.js';

export class LoginScreen {
  constructor(page) {
    this.page = page;
    this.email = page.getByPlaceholder('name@example.com');
    this.password = page.getByLabel(L('password'), { exact: true });
    this.passkey = page.getByRole('button', { name: L('passkeySignIn') });
  }

  async open({ language = 'en' } = {}) {
    await this.page.goto('/login');
    await this.chooseLanguage(language);
  }

  chooseLanguage(language) {
    return this.page.getByRole('radio', { name: LANGUAGE_NAMES[language] }).click();
  }

  continue() {
    return this.page.getByRole('button', { name: L('authContinue'), exact: true }).last().click();
  }

  async signIn({ email, password }) {
    await this.email.fill(email);
    await this.continue();
    await this.password.fill(password);
    await this.page.getByRole('button', { name: L('signIn') }).last().click();
  }

  async signUp({ email, name, password }) {
    await this.page.getByRole('button', { name: L('authCreateOne') }).click();
    await this.email.last().fill(email);
    await this.continue();
    await this.page.getByLabel(L('fullName')).fill(name);
    await this.continue();
    await this.password.fill(password);
    await this.page.getByRole('button', { name: L('createAccount') }).last().click();
  }
}
