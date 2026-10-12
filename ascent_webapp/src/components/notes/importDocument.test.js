import { describe, expect, test } from 'vitest';
import { joinPages } from './importDocument';

const text = (t, extra = {}) => ({ text: t, done: false, kind: 'text', ...extra });

describe('a document read a few pages at a time', () => {
  test('a paragraph cut by the page break between two readings is one line again', () => {
    const lines = joinPages([
      { lines: [text('First.'), text('The hall is booked for the')], continuesAfter: true },
      { lines: [text('evening, with the DJ.'), text('Next.')], continuesFromBefore: true },
    ]);
    expect(lines).toEqual([text('First.'), text('The hall is booked for the evening, with the DJ.'), text('Next.')]);
  });

  test('either reading seeing the cut is enough, and a word hyphenated across it is written whole', () => {
    expect(joinPages([{ lines: [text('All the infor-')], continuesAfter: true }, { lines: [text('mation is here.')] }]))
      .toEqual([text('All the information is here.')]);
    expect(joinPages([{ lines: [text('Pay the')] }, { lines: [text('deposit.')], continuesFromBefore: true }]))
      .toEqual([text('Pay the deposit.')]);
  });

  test('a numbered entry keeps the amount on either half; lines of other kinds, or not cut, stay apart', () => {
    const hall = { text: 'Hall, with the', done: false, kind: 'number' };
    expect(joinPages([{ lines: [hall], continuesAfter: true }, { lines: [{ text: 'garden', done: false, kind: 'number', amount: 73440, currency: 'ILS' }] }]))
      .toEqual([{ text: 'Hall, with the garden', done: false, kind: 'number', amount: 73440, currency: 'ILS' }]);
    const title = { text: 'Suppliers', done: false, kind: 'title' };
    expect(joinPages([{ lines: [text('Intro')], continuesAfter: true }, { lines: [title] }])).toEqual([text('Intro'), title]);
    expect(joinPages([{ lines: [text('One.')] }, { lines: [text('Two.')] }])).toEqual([text('One.'), text('Two.')]);
    // A reading with no lines passes the cut on
    expect(joinPages([{ lines: [text('Go')], continuesAfter: true }, { lines: [], continuesAfter: false }, { lines: [text('on')] }]))
      .toEqual([text('Go on')]);
  });
});
