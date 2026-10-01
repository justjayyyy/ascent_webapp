import { expect, test } from 'vitest';
import { csvCell, toCSV, sections } from './csv';

test('cells are quoted only when needed, quotes doubled', () => {
  expect(csvCell('plain')).toBe('plain');
  expect(csvCell('a,b')).toBe('"a,b"');
  expect(csvCell('say "hi"')).toBe('"say ""hi"""');
  expect(csvCell('two\nlines')).toBe('"two\nlines"');
  expect(csvCell(null)).toBe('');
  expect(csvCell(-12.5)).toBe('-12.5');
  expect(csvCell(['a', 'b'])).toBe('a;b');
  expect(csvCell('קפה')).toBe('קפה');
});

test('text a spreadsheet would run as a formula is neutralised', () => {
  for (const evil of ['=HYPERLINK("http://x","click")', '+1+1', '-2+3', '@SUM(A1)', '\tcmd']) {
    expect(csvCell(evil).replace(/^"/, '')).toMatch(/^'/);
  }
  expect(csvCell('=1,2')).toBe('"\'=1,2"');
});

test('tables with headers, several in one file', () => {
  expect(toCSV([{ a: 1, b: 'x' }, { a: 2 }], ['a', 'b'])).toBe('a,b\n1,x\n2,');
  expect(sections([['ONE', 'a\n1'], ['TWO', 'b\n2']])).toBe('ONE\na\n1\n\nTWO\nb\n2');
});
