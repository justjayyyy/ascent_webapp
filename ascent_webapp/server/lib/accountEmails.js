// Password reset and email confirmation messages, sent through the same SMTP setup as the summaries.
import { sendEmail } from './email-helper.js';
import { getEmailTemplate } from './email-templates.js';

const COPY = {
  reset: {
    en: {
      subject: 'Reset your Ascent password',
      lines: ['Someone asked to reset the password for this account.', 'The link works for one hour. If it wasn\'t you, ignore this email and nothing changes.'],
      cta: 'Choose a new password',
    },
    he: {
      subject: 'איפוס הסיסמה ל-Ascent',
      lines: ['התקבלה בקשה לאפס את הסיסמה של החשבון הזה.', 'הקישור תקף לשעה אחת. אם לא ביקשת, אפשר להתעלם מההודעה ושום דבר לא ישתנה.'],
      cta: 'בחירת סיסמה חדשה',
    },
    ru: {
      subject: 'Сброс пароля Ascent',
      lines: ['Кто-то запросил сброс пароля для этого аккаунта.', 'Ссылка действует один час. Если это были не вы, просто проигнорируйте письмо — ничего не изменится.'],
      cta: 'Выбрать новый пароль',
    },
  },
  verify: {
    en: {
      subject: 'Confirm your email for Ascent',
      lines: ['Confirm this is your email address, so invitations and password resets reach you.', 'The link works for one week.'],
      cta: 'Confirm email',
    },
    he: {
      subject: 'אישור כתובת המייל ב-Ascent',
      lines: ['אשרו שזו כתובת המייל שלכם, כדי שהזמנות ואיפוס סיסמה יגיעו אליכם.', 'הקישור תקף לשבוע.'],
      cta: 'אישור המייל',
    },
    ru: {
      subject: 'Подтвердите email для Ascent',
      lines: ['Подтвердите, что это ваш адрес, чтобы приглашения и сброс пароля приходили вам.', 'Ссылка действует одну неделю.'],
      cta: 'Подтвердить email',
    },
  },
};

const PATHS = { reset: 'reset-password', verify: 'verify-email' };

/** The email for `kind` ('reset' | 'verify'), linking to `${origin}/<page>/<token>`. */
export function renderAccountEmail({ kind, language = 'en', origin, token }) {
  const c = COPY[kind][language] || COPY[kind].en;
  const link = `${origin}/${PATHS[kind]}/${token}`;
  return {
    subject: c.subject,
    body: `${c.lines.join('\n\n')}\n\n${c.cta}: ${link}`,
    html: getEmailTemplate({ language, title: c.subject, body: c.lines.map((l) => `<p>${l}</p>`).join(''), cta: { text: c.cta, link } }),
  };
}

export async function sendAccountEmail({ kind, user, origin, token }) {
  const email = renderAccountEmail({ kind, language: user.language, origin, token });
  return sendEmail({ to: user.email, ...email });
}
