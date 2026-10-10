import { describe, expect, test } from 'vitest';
import { amountTotals, lineNumbers, noteToHtml, parseHtml, readPaste } from './noteDocument';
import { formatAmount, noteToText, parseAmount, parseLines } from './noteUtils';

const shape = (lines) => lines.map(({ text, kind, done, amount, currency, src }) => [
  kind || (done ? 'done' : 'item'), kind === 'image' ? src : text,
  ...(amount !== undefined ? [amount] : []), ...(currency ? [currency] : []),
]);

describe('amounts', () => {
  test('an amount is read with its currency, and nothing else passes for one', () => {
    expect(parseAmount('₪8,000')).toEqual({ amount: 8000, currency: 'ILS' });
    expect(parseAmount('8,000 ש"ח')).toEqual({ amount: 8000, currency: 'ILS' });
    expect(parseAmount('‏₪73,440')).toEqual({ amount: 73440, currency: 'ILS' });
    expect(parseAmount('$12.50')).toEqual({ amount: 12.5, currency: 'USD' });
    expect(parseAmount('12,5')).toEqual({ amount: 12.5, currency: null });
    expect(parseAmount('1 200 ₽')).toEqual({ amount: 1200, currency: 'RUB' });
    expect(parseAmount('19:00')).toBeNull();
    expect(parseAmount('DJ 8,000')).toBeNull();
  });

  test('a run of two or more lines with amounts gets a total per currency; a lone one does not', () => {
    const lines = [
      { text: 'Suppliers', kind: 'title' },
      { text: 'DJ', kind: 'number', amount: 8000, currency: 'ILS' },
      { text: 'Hall', kind: 'number', amount: 73440, currency: 'ILS' },
      { text: 'Flights', amount: 600, currency: 'USD' },
      { text: 'between', kind: 'text' },
      { text: 'Tip', kind: 'text', amount: 200 },
    ];
    expect([...amountTotals(lines, 'ILS')]).toEqual([[3, [{ currency: 'ILS', amount: 81440 }, { currency: 'USD', amount: 600 }]]]);
  });

  test('numbered lines count within their run and start again after anything else', () => {
    const k = (kind) => ({ text: kind, kind });
    expect(lineNumbers([k('number'), k('number'), k('text'), k('number')])).toEqual([1, 2, null, 1]);
  });

  test('an amount is written in the reader\'s language', () => {
    expect(formatAmount(8000, 'ILS', 'en')).toBe('₪8,000');
    expect(formatAmount(12.5, 'USD', 'en')).toBe('$12.50');
    expect(formatAmount(3, null, 'en')).toBe('3');
  });
});

describe('pasted text', () => {
  test('numbered lines, boxes and spreadsheet amounts in a document', () => {
    const doc = '# Suppliers\n1. DJ\t₪8,000\nNo contract yet\n2. Hall\t73,440\n> What is not settled\n> Payment dates\n\nTip\t2000';
    expect(shape(parseLines(doc))).toEqual([
      ['title', 'Suppliers'],
      ['number', 'DJ\nNo contract yet', 8000, 'ILS'],
      ['number', 'Hall', 73440],
      ['callout', 'What is not settled\nPayment dates'],
      ['item', 'Tip', 2000],
    ]);
  });

  test('a plain numbered list with no titles or boxes stays a list of items, as before', () => {
    expect(shape(parseLines('1. milk\n2. eggs'))).toEqual([['item', '1. milk'], ['item', '2. eggs']]);
  });
});

describe('pasted HTML', () => {
  test('a web page keeps its headings, tasks, numbered entries with prices, boxes and pictures', () => {
    const html = `<meta charset="utf-8"><b id="docs-internal-guid-1">
      <h1>Before the wedding</h1>
      <p>Version 3.</p>
      <figure><img src="data:image/png;base64,AAAA" alt="rings"><figcaption>For illustration only</figcaption></figure>
      <aside class="callout"><strong>What is not settled</strong><br>Payment dates are missing.</aside>
      <ol><li><b>DJ</b><br>Paid ₪0 · balance ₪8,000 <span>₪8,000</span></li><li>Hall <span>₪73,440</span></li></ol>
      <ul><li><input type="checkbox" checked> Book the hall</li><li>☐ Buy the rings</li><li>Plain bullet</li></ul>
      <table><tr><th>Item</th><th>Cost</th></tr><tr><td>Suit</td><td>estimated</td><td>1,500</td></tr></table>
    </b>`;
    expect(shape(parseHtml(html))).toEqual([
      ['title', 'Before the wedding'],
      ['text', 'Version 3.'],
      ['image', 'data:image/png;base64,AAAA'],
      ['callout', 'What is not settled\nPayment dates are missing.'],
      ['number', 'DJ\nPaid ₪0 · balance ₪8,000', 8000, 'ILS'],
      ['number', 'Hall', 73440, 'ILS'],
      ['done', 'Book the hall'],
      ['item', 'Buy the rings'],
      ['item', 'Plain bullet'],
      ['text', 'Suit\nestimated', 1500],
    ]);
    expect(parseHtml(html)[2].text).toBe('For illustration only');
  });

  test('Google Docs and Notion checklists come in ticked as they were', () => {
    const html = '<ul><li role="checkbox" aria-checked="true">Done thing</li><li role="checkbox" aria-checked="false">Open thing</li></ul>'
      + '<div class="notion-to_do-block"><div class="checkbox checkbox-on"></div><span>Notion done</span></div>';
    expect(shape(parseHtml(html))).toEqual([['done', 'Done thing'], ['item', 'Open thing'], ['done', 'Notion done']]);
  });

  test('a paste uses the HTML when it says more than the text, and stays out of the way for one line', () => {
    const html = '<h2>Shop</h2><ul><li>milk</li><li>eggs</li></ul>';
    expect(shape(readPaste({ html, text: 'Shop\nmilk\neggs' }))).toEqual([['title', 'Shop'], ['item', 'milk'], ['item', 'eggs']]);
    expect(shape(readPaste({ html: '<p>a</p><p>b</p>', text: '☐ a\n☐ b' }))).toEqual([['item', 'a'], ['item', 'b']]);
    expect(readPaste({ html: '<span>just this</span>', text: 'just this' })).toBeNull();
    expect(shape(readPaste({ html: '<img src="https://x.test/a.png">', text: '' }))).toEqual([['image', 'https://x.test/a.png']]);
  });
});

describe('copying a note out', () => {
  const note = {
    title: 'Wedding',
    type: 'checklist',
    items: [
      { id: '1', text: 'Suppliers', kind: 'title' },
      { id: '2', text: 'DJ', kind: 'number', amount: 8000, currency: 'ILS' },
      { id: '3', text: 'Hall', kind: 'number', amount: 73440, currency: 'ILS' },
      { id: '4', text: 'Not settled', kind: 'callout' },
      { id: '5', text: 'cover', kind: 'image', fileId: 'f1' },
      { id: '6', text: 'Book the hall', done: true },
    ],
  };

  test('as HTML that pastes back into the same note, picture and amounts included', () => {
    const html = noteToHtml(note, { images: { f1: 'data:image/jpeg;base64,BBBB' }, language: 'en' });
    expect(html).toContain('<p data-note-total="1"><strong>Total</strong> ₪81,440</p>');
    expect(shape(parseHtml(html))).toEqual([
      ['title', 'Wedding'],
      ['title', 'Suppliers'],
      ['number', 'DJ', 8000, 'ILS'],
      ['number', 'Hall', 73440, 'ILS'],
      ['callout', 'Not settled'],
      ['image', 'data:image/jpeg;base64,BBBB'],
      ['done', 'Book the hall'],
    ]);
  });

  test('as plain text, numbered and with the amounts written out', () => {
    expect(noteToText(note)).toBe('Wedding\nSuppliers\n1. DJ · ₪8,000\n2. Hall · ₪73,440\nNot settled\n[x] Book the hall');
  });
});
