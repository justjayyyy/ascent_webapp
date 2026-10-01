// Loans and other commitments: the payment schedule, where the balance stands today and what paying
// more would change. Pure and dependency free (shared by the Loans page, the Dashboard and tests).
//
// A commitment with a monthly payment (given, or worked out from its term) follows a schedule: each
// payment due on or before today counts as made. One without either is flexible (money lent to or
// borrowed from family): its balance is the amount minus the payments recorded against it.
// Extra payments always go straight to the principal.

const MAX_MONTHS = 600; // 50 years: anything longer is a payment that never catches up with the interest
const round2 = (n) => Math.round(n * 100) / 100;
const pad = (n) => String(n).padStart(2, '0');

/** 'YYYY-MM-DD' plus whole months, keeping the day (clamped to the month's last day). */
export function addMonthsISO(date, months) {
  const [y, m, d] = date.slice(0, 10).split('-').map(Number);
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${pad(month)}-${pad(Math.min(d, last))}`;
}

/** Months from one 'YYYY-MM' (or date) to another, by calendar month. */
export const monthsBetween = (from, to) => {
  const [y1, m1] = from.slice(0, 7).split('-').map(Number);
  const [y2, m2] = to.slice(0, 7).split('-').map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
};

/** The fixed monthly payment that clears `principal` in `months` at `annualRate` percent. */
export function annuityPayment(principal, annualRate, months) {
  if (!(principal > 0) || !(months > 0)) return 0;
  const r = (annualRate || 0) / 1200;
  if (r === 0) return round2(principal / months);
  return round2((principal * r) / (1 - (1 + r) ** -months));
}

/** The monthly payment of a commitment: the one entered, or the one its term implies. */
export function paymentOf(c) {
  if (c.payment > 0) return c.payment;
  if (c.termMonths > 0) return annuityPayment(c.principal, c.annualRate, c.termMonths);
  return 0;
}

export const isScheduled = (c) => paymentOf(c) > 0 && !!c.firstPaymentDate && c.principal > 0;

/**
 * Month-by-month rows until the balance reaches zero:
 * { n, date, payment, interest, principal, extra, balance }.
 * `extraMonthly` simulates paying that much more with every payment.
 */
export function buildSchedule(c, { extraMonthly = 0 } = {}) {
  if (!isScheduled(c)) return [];
  const payment = paymentOf(c);
  const r = (c.annualRate || 0) / 1200;
  const extras = (c.payments || [])
    .filter((p) => p.amount > 0 && p.date)
    .map((p) => ({ date: p.date.slice(0, 10), amount: p.amount }))
    .sort((a, b) => a.date.localeCompare(b.date));
  let balance = c.principal;
  let e = 0;
  const rows = [];
  for (let n = 1; balance > 0.005 && n <= MAX_MONTHS; n += 1) {
    const date = addMonthsISO(c.firstPaymentDate, n - 1);
    // Extra payments made since the previous payment lower the balance before this month's interest
    let extra = 0;
    while (e < extras.length && extras[e].date <= date) {
      extra += extras[e].amount;
      e += 1;
    }
    extra = Math.min(extra, balance);
    balance -= extra;
    const interest = round2(balance * r);
    let toPrincipal = Math.min(balance, Math.max(0, payment + extraMonthly - interest));
    if (balance - toPrincipal < 0.005) toPrincipal = balance;
    balance = round2(balance - toPrincipal);
    rows.push({
      n, date,
      payment: round2(interest + toPrincipal),
      interest,
      principal: round2(toPrincipal),
      extra: round2(extra),
      balance,
    });
  }
  return rows;
}

/**
 * Where a commitment stands on `today` ('YYYY-MM-DD'):
 * balance, paid, progress (0..1), monthly payment, next payment, payoff date, interest paid and ahead.
 */
export function commitmentStatus(c, today) {
  const principal = c.principal || 0;
  const payments = (c.payments || []).filter((p) => p.amount > 0 && p.date);
  if (!isScheduled(c)) {
    const repaid = payments.filter((p) => p.date.slice(0, 10) <= today).reduce((s, p) => s + p.amount, 0);
    const balance = round2(Math.max(0, principal - repaid));
    return {
      mode: 'flexible', principal, balance, paid: round2(principal - balance),
      progress: principal > 0 ? Math.min(1, (principal - balance) / principal) : 0,
      payment: 0, next: null, payoffDate: null, paymentsLeft: null, paymentsMade: payments.length,
      interestPaid: 0, interestAhead: 0, neverEnds: false, schedule: [],
      done: principal > 0 && balance <= 0.005,
    };
  }
  const schedule = buildSchedule(c);
  const made = schedule.filter((row) => row.date <= today);
  const ahead = schedule.slice(made.length);
  const last = made[made.length - 1];
  let balance = last ? last.balance : principal;
  // Extra payments since the last scheduled one already count today
  const since = last ? last.date : '0000-00-00';
  balance -= payments.filter((p) => p.date.slice(0, 10) > since && p.date.slice(0, 10) <= today).reduce((s, p) => s + p.amount, 0);
  balance = round2(Math.max(0, balance));
  const neverEnds = schedule.length >= MAX_MONTHS && schedule[schedule.length - 1].balance > 0;
  const nextRow = ahead.find((row) => row.payment > 0) || null;
  return {
    mode: 'scheduled', principal, balance, paid: round2(principal - balance),
    progress: principal > 0 ? Math.min(1, (principal - balance) / principal) : 0,
    payment: paymentOf(c),
    next: nextRow && balance > 0 ? { date: nextRow.date, amount: nextRow.payment, interest: nextRow.interest, principal: nextRow.principal } : null,
    payoffDate: neverEnds ? null : schedule[schedule.length - 1]?.date || null,
    paymentsLeft: balance > 0 ? ahead.length : 0,
    paymentsMade: made.length,
    interestPaid: round2(made.reduce((s, row) => s + row.interest, 0)),
    interestAhead: round2(ahead.reduce((s, row) => s + row.interest, 0)),
    neverEnds, schedule,
    done: balance <= 0.005,
  };
}

/** What paying `extraMonthly` more each month (from the next payment on) changes. */
export function simulateExtra(c, extraMonthly, today) {
  const base = scheduleFrom(c, 0, today);
  const faster = scheduleFrom(c, extraMonthly, today);
  const interest = (rows) => rows.reduce((s, row) => s + row.interest, 0);
  return {
    monthsSooner: Math.max(0, base.length - faster.length),
    interestSaved: round2(Math.max(0, interest(base) - interest(faster))),
    payoffDate: faster[faster.length - 1]?.date || null,
    rows: faster,
  };
}

// The schedule from today on with a bigger payment, starting from today's real balance
function scheduleFrom(c, extraMonthly, today) {
  const status = commitmentStatus(c, today);
  if (!status.next || status.balance <= 0) return [];
  const futureExtras = (c.payments || []).filter((p) => p.date && p.date.slice(0, 10) > today);
  return buildSchedule({
    ...c,
    principal: status.balance,
    firstPaymentDate: status.next.date,
    payment: paymentOf(c),
    payments: futureExtras,
  }, { extraMonthly });
}

/** Scheduled payments that fall between two dates (inclusive), for forecasts and "this month". */
export function duesBetween(c, from, to) {
  if (!isScheduled(c) || c.status === 'closed') return [];
  return buildSchedule(c)
    .filter((row) => row.date >= from && row.date <= to && row.payment > 0)
    .map((row) => ({ date: row.date, amount: row.payment }));
}

/**
 * Remaining balance at the start of each month from `fromMonth` until it is paid off, as
 * [{ key: 'YYYY-MM', balance }]. Used to draw the road to debt free.
 */
export function balanceByMonth(c, fromMonth, today) {
  const status = commitmentStatus(c, today);
  if (status.balance <= 0) return [];
  if (status.mode === 'flexible') return [{ key: fromMonth, balance: status.balance }];
  const out = [{ key: fromMonth, balance: status.balance }];
  status.schedule.filter((row) => row.date > today).forEach((row) => {
    const key = row.date.slice(0, 7);
    const lastRow = out[out.length - 1];
    if (lastRow.key === key) lastRow.balance = row.balance;
    else out.push({ key, balance: row.balance });
  });
  return out;
}

/**
 * Everything the household owes (and is owed), in one currency. `toCurrency(amount, from)`
 * converts; rows are the active commitments.
 */
export function commitmentsSummary(list, today, toCurrency = (v) => v) {
  const active = list.filter((c) => c.status !== 'closed');
  const rows = active.map((c) => ({ c, s: commitmentStatus(c, today) }));
  const owe = rows.filter(({ c }) => c.direction !== 'lent');
  const lent = rows.filter(({ c }) => c.direction === 'lent');
  const sum = (items, pick) => round2(items.reduce((s, item) => s + toCurrency(pick(item), item.c.currency), 0));
  const live = owe.filter(({ s }) => !s.done);
  const payoffs = live.map(({ s }) => s.payoffDate);
  const nexts = live.filter(({ s }) => s.next).sort((a, b) => a.s.next.date.localeCompare(b.s.next.date));
  const principal = sum(owe, ({ c }) => c.principal || 0);
  const balance = sum(owe, ({ s }) => s.balance);
  return {
    count: live.length,
    balance,
    principal,
    progress: principal > 0 ? Math.min(1, (principal - balance) / principal) : 0,
    monthly: sum(live, ({ s }) => s.payment),
    interestAhead: sum(live, ({ s }) => s.interestAhead),
    // Debt free when the last scheduled loan ends; unknown while a flexible one is still open
    debtFreeDate: live.length && payoffs.every(Boolean) ? payoffs.sort().pop() : null,
    next: nexts[0] ? { commitment: nexts[0].c, ...nexts[0].s.next } : null,
    lentBalance: sum(lent.filter(({ s }) => !s.done), ({ s }) => s.balance),
    lentCount: lent.filter(({ s }) => !s.done).length,
  };
}
