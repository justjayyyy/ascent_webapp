// The daily and weekly summary emails: what a period's money looked like, and how to say it in the
// reader's language. Pure (no database, no mail), so it is tested directly; summaryJob.js does the I/O.
import { getEmailTemplate } from './email-templates.js';
import { categoryTranslations } from './categoryTranslations.js';
import { escapeHtml } from '../../shared/workspaceAccess.js';
import { amountInCurrency } from '../../shared/money.js';

const COPY = {
  en: {
    daily: { title: 'Your day in money', intro: 'Here is what happened on {period}.' },
    weekly: { title: 'Your week in money', intro: 'Here is your week, {period}.' },
    hello: 'Hello {name},',
    expenses: 'Spent', income: 'Received', net: 'Net', count: 'Transactions',
    top: 'Where it went', unconverted: '{n} transactions in other currencies are not included.',
    open: 'Open Ascent',
  },
  he: {
    daily: { title: 'היום שלך בכסף', intro: 'זה מה שקרה ב-{period}.' },
    weekly: { title: 'השבוע שלך בכסף', intro: 'הנה השבוע שלך, {period}.' },
    hello: 'שלום {name},',
    expenses: 'הוצאות', income: 'הכנסות', net: 'נטו', count: 'עסקאות',
    top: 'לאן זה הלך', unconverted: '{n} עסקאות במטבעות אחרים לא נכללו.',
    open: 'פתיחת Ascent',
  },
  ru: {
    daily: { title: 'Ваш день в деньгах', intro: 'Вот что произошло {period}.' },
    weekly: { title: 'Ваша неделя в деньгах', intro: 'Ваша неделя: {period}.' },
    hello: 'Здравствуйте, {name}!',
    expenses: 'Расходы', income: 'Доходы', net: 'Итог', count: 'Операций',
    top: 'На что ушли деньги', unconverted: 'Не учтено операций в других валютах: {n}.',
    open: 'Открыть Ascent',
  },
};

const LOCALES = { en: 'en-US', he: 'he-IL', ru: 'ru-RU' };
const fill = (text, values) => text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');

/** 'YYYY-MM-DD' for a Date, in UTC. */
export const isoDay = (date) => date.toISOString().slice(0, 10);

/** The days a summary covers: yesterday for the daily one, the seven days ending yesterday for the weekly one. */
export function periodFor(kind, now = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const to = isoDay(new Date(now.getTime() - day));
  const from = kind === 'weekly' ? isoDay(new Date(now.getTime() - 7 * day)) : to;
  return { from, to };
}

/** A transaction's amount in `currency`, or null when it was recorded in another one with no conversion. */
export const amountIn = (tx, currency) => amountInCurrency(tx, currency, null);

/**
 * Totals for confirmed transactions dated within [from, to] (inclusive, 'YYYY-MM-DD').
 * Amounts that cannot be shown in `currency` are counted in `unconverted` instead of being added wrongly.
 */
export function periodSummary(transactions, { from, to, currency }) {
  let expenses = 0;
  let income = 0;
  let count = 0;
  let unconverted = 0;
  const byCategory = new Map();
  for (const tx of transactions) {
    const date = String(tx.date || '').slice(0, 10);
    if (date < from || date > to || tx.status === 'pending') continue;
    const amount = amountIn(tx, currency);
    if (amount === null) { unconverted += 1; continue; }
    count += 1;
    if (tx.type === 'Income') income += amount;
    else if (tx.type === 'Expense') {
      expenses += amount;
      const key = tx.category || 'other_expense';
      byCategory.set(key, (byCategory.get(key) || 0) + amount);
    }
  }
  const topCategories = [...byCategory].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([category, amount]) => ({ category, amount }));
  return { expenses, income, net: income - expenses, count, unconverted, topCategories };
}

/** The email for one person: { subject, text, html }. */
export function renderSummaryEmail({ kind, user, summary, period, appUrl }) {
  const language = COPY[user.language] ? user.language : 'en';
  const c = COPY[language];
  const locale = LOCALES[language];
  const currency = user.currency || 'USD';
  const money = (n) => {
    try {
      return new Intl.NumberFormat(locale, { style: 'currency', currency, maximumFractionDigits: 0 }).format(n);
    } catch {
      return `${Math.round(n)} ${currency}`;
    }
  };
  const day = (iso) => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T12:00:00Z`));
  const periodText = period.from === period.to ? day(period.to) : `${day(period.from)} – ${day(period.to)}`;
  const category = (key) => categoryTranslations[key]?.[language] || key;
  const name = user.full_name || String(user.email || '').split('@')[0];

  const rows = [
    [c.expenses, money(summary.expenses)],
    [c.income, money(summary.income)],
    [c.net, money(summary.net)],
    [c.count, String(summary.count)],
  ];
  const top = summary.topCategories.map((t) => [category(t.category), money(t.amount)]);
  const note = summary.unconverted ? fill(c.unconverted, { n: summary.unconverted }) : '';
  const intro = fill(c[kind].intro, { period: periodText });

  const text = [
    fill(c.hello, { name }),
    '',
    intro,
    '',
    ...rows.map(([k, v]) => `• ${k}: ${v}`),
    ...(top.length ? ['', `${c.top}:`, ...top.map(([k, v]) => `• ${k}: ${v}`)] : []),
    ...(note ? ['', note] : []),
    '',
    `${c.open}: ${appUrl}`,
  ].join('\n');

  const table = (list) => `<table role="presentation" style="width:100%;border-collapse:collapse;margin:12px 0">${list
    .map(([k, v]) => `<tr><td style="padding:6px 0">${escapeHtml(k)}</td><td style="padding:6px 0;text-align:end;font-weight:600">${escapeHtml(v)}</td></tr>`)
    .join('')}</table>`;
  const body = [
    `<p>${escapeHtml(fill(c.hello, { name }))}</p>`,
    `<p>${escapeHtml(intro)}</p>`,
    table(rows),
    top.length ? `<h2 style="font-size:16px;margin:24px 0 4px">${escapeHtml(c.top)}</h2>${table(top)}` : '',
    note ? `<p style="font-size:13px;opacity:.75">${escapeHtml(note)}</p>` : '',
  ].join('');

  return {
    subject: `${c[kind].title} · ${periodText}`,
    text,
    html: getEmailTemplate({ language, title: c[kind].title, body, cta: { text: c.open, link: appUrl } }),
  };
}
