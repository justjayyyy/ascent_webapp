import { describe, expect, test } from 'vitest';
import { joinPages, readBatch } from './importDocument';

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

describe('a batch of pages that fails to be read', () => {
  const failing = (status, extra = {}) => Object.assign(new Error('failed'), { status, ...extra });

  test('ran out of time: read again a page at a time, in order', async () => {
    const calls = [];
    const read = async (pages) => {
      calls.push(pages.map((p) => p.page));
      if (pages.length > 1) throw failing(408, { isNetworkError: true });
      return { lines: [text(`page ${pages[0].page}`)] };
    };
    expect(await readBatch([{ page: 3 }, { page: 4 }], read)).toEqual([{ lines: [text('page 3')] }, { lines: [text('page 4')] }]);
    expect(calls).toEqual([[3, 4], [3], [4]]);
  });

  test('a single page is tried once more; a refusal, a bad request or the hourly limit is not', async () => {
    let tries = 0;
    const flaky = async () => { tries += 1; if (tries === 1) throw failing(502); return { lines: [] }; };
    expect(await readBatch([{ page: 1 }], flaky)).toEqual([{ lines: [] }]);
    for (const status of [400, 403, 413, 422, 429]) {
      let n = 0;
      await expect(readBatch([{ page: 1 }, { page: 2 }], async () => { n += 1; throw failing(status); })).rejects.toThrow('failed');
      expect(n).toBe(1);
    }
  });
});
