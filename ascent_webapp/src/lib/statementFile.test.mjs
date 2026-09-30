import { test } from 'node:test';
import assert from 'node:assert/strict';
import { guessColumns, parseDate, parseAmount, toStatementRows, chargesLookNegative } from './statementFile.js';

test('finds the header row under a bank\'s title lines, in Hebrew', () => {
  const rows = [
    ['פירוט עסקאות לכרטיס 4580'],
    ['לתקופה 09/2026'],
    ['תאריך רכישה', 'שם בית העסק', 'סכום עסקה', 'מטבע', 'סכום חיוב', 'מטבע חיוב'],
    ['01/09/2026', 'שופרסל דיל', '120.50', '₪', '120.50', '₪'],
    ['03/09/2026', 'AMAZON', '20.00', '$', '74.10', '₪'],
    ['', 'סה"כ', '', '', '194.60', ''],
  ];
  const g = guessColumns(rows);
  assert.equal(g.headerRow, 2);
  assert.equal(g.columns.date, 0);
  assert.equal(g.columns.description, 1);
  assert.equal(g.columns.amount, 4); // the charged amount, not the original one
  const { rows: out, skipped } = toStatementRows(rows, g);
  assert.equal(out.length, 2);
  assert.equal(skipped, 1); // the total line
  assert.deepEqual(out[1], { date: '2026-09-03', description: 'AMAZON', amount: 74.1, currency: 'ILS', card: '' });
});

test('English and Russian headers', () => {
  assert.deepEqual(guessColumns([['Date', 'Description', 'Amount', 'Currency']]).columns, { date: 0, description: 1, amount: 2, currency: 3 });
  assert.deepEqual(guessColumns([['Дата', 'Описание', 'Сумма']]).columns, { date: 0, description: 1, amount: 2 });
});

test('dates in the formats statements use', () => {
  assert.equal(parseDate('03/04/2026'), '2026-04-03');
  assert.equal(parseDate('03/04/2026', 'mdy'), '2026-03-04');
  assert.equal(parseDate('3.4.26'), '2026-04-03');
  assert.equal(parseDate('2026-09-12'), '2026-09-12');
  assert.equal(parseDate(new Date(2026, 8, 12)), '2026-09-12');
  assert.equal(parseDate(46277), '2026-09-12'); // Excel serial
  assert.equal(parseDate('31/02/2026'), null);
  assert.equal(parseDate('סה"כ'), null);
});

test('amounts with symbols, separators and signs', () => {
  assert.equal(parseAmount('₪ 1,234.50'), 1234.5);
  assert.equal(parseAmount('1.234,50 €'), 1234.5);
  assert.equal(parseAmount('12.00-'), -12);
  assert.equal(parseAmount('(30.00)'), -30);
  assert.equal(parseAmount(-18), -18);
  assert.equal(parseAmount(''), null);
});

test('files that list charges as negative numbers', () => {
  const rows = [['Date', 'Description', 'Amount'], ['2026-09-01', 'Cafe', '-12.00'], ['2026-09-02', 'Refund', '5.00'], ['2026-09-03', 'Gas', '-40']];
  const g = guessColumns(rows);
  assert.equal(chargesLookNegative(rows, g), true);
  assert.deepEqual(toStatementRows(rows, g, { flip: true }).rows.map((r) => r.amount), [12, -5, 40]);
});
