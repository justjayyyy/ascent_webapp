import { describe, expect, test } from 'vitest';
import {
  clearMarks, drawRich, joinRich, marksAt, parseRich, plainText, readRich, replaceRich, richHtml, sliceRich, toggleMark, writeRich,
} from './richText';

describe('formatted text', () => {
  test('text without formatting stays as it is', () => {
    expect(writeRich(parseRich('Call Yossi <3 a < b'))).toBe('Call Yossi <3 a < b');
    expect(plainText('Call Yossi')).toBe('Call Yossi');
  });

  test('reads and writes nested formatting', () => {
    const text = 'a <b>bold <i>both</i></b> <u>under</u> <s>gone</s>';
    expect(parseRich(text)).toEqual([
      { text: 'a ', marks: '' }, { text: 'bold ', marks: 'b' }, { text: 'both', marks: 'bi' }, { text: ' ', marks: '' },
      { text: 'under', marks: 'u' }, { text: ' ', marks: '' }, { text: 'gone', marks: 's' },
    ]);
    expect(writeRich(parseRich(text))).toBe(text);
    expect(plainText(text)).toBe('a bold both under gone');
  });

  test('typed text that looks like a tag is kept as text, backslashes too', () => {
    for (const plain of ['<b>not bold</b>', 'C:\\', 'a \\<b> b', '\\\\<i>']) {
      const pieces = [{ text: plain, marks: '' }, { text: 'x', marks: 'b' }, { text: plain, marks: 'i' }];
      expect(parseRich(writeRich(pieces))).toEqual(pieces);
    }
  });

  test('a closing tag with nothing open is text', () => {
    expect(plainText('a </b> b')).toBe('a </b> b');
  });

  test('bold on and off over part of a line', () => {
    const bold = toggleMark('Buy milk today', 4, 8, 'b');
    expect(bold).toBe('Buy <b>milk</b> today');
    expect(marksAt(bold, 4, 8)).toBe('b');
    expect(toggleMark(bold, 4, 8, 'b')).toBe('Buy milk today');
    // Part bold, part not: all of it becomes bold
    expect(toggleMark(bold, 0, 8, 'b')).toBe('<b>Buy milk</b> today');
    expect(clearMarks('<b><i>all</i></b>', 0, 3)).toBe('all');
  });

  test('slices keep their formatting whole', () => {
    const text = 'one <b>two three</b> four';
    expect(sliceRich(text, 0, 7)).toBe('one <b>two</b>');
    expect(sliceRich(text, 7)).toBe('<b> three</b> four');
    expect(joinRich(sliceRich(text, 0, 7), sliceRich(text, 7))).toBe(text);
    expect(joinRich('C:\\', '<b>x</b>')).toBe('C:\\\\<b>x</b>');
    expect(plainText(joinRich('C:\\', '<b>x</b>'))).toBe('C:\\x');
  });

  test('typing goes on in the formatting of the letter before', () => {
    expect(replaceRich('<b>bold</b> plain', 4, 4, '!')).toBe('<b>bold!</b> plain');
    expect(replaceRich('<b>bold</b>', 0, 0, '>')).toBe('<b>>bold</b>');
    expect(replaceRich('<b>bold</b>', 4, 4, '!', '')).toBe('<b>bold</b>!');
  });

  test('as HTML', () => {
    expect(richHtml('a <b>b & c</b>\nd')).toBe('a <strong>b &amp; c</strong><br>d');
  });
});

describe('formatted text on the page', () => {
  test('drawn and read back the same, with an empty last line', () => {
    const root = document.createElement('div');
    for (const text of ['', 'plain', 'a <b>b <i>c</i></b>\n', 'two\nlines\n\n']) {
      drawRich(root, text);
      expect(readRich(root)).toBe(text);
    }
  });

  test('pasted HTML keeps bold and italic, not the Google Docs wrapper', () => {
    const root = document.createElement('div');
    root.innerHTML = '<b style="font-weight:normal" id="docs-internal-guid-1"><span style="font-weight:700">Bold</span> and <span style="font-style:italic">slanted</span></b><div>next</div>';
    expect(readRich(root)).toBe('<b>Bold</b> and <i>slanted</i>\nnext');
  });
});

describe('pasted HTML', () => {
  const read = (html) => {
    const root = document.createElement('div');
    root.innerHTML = html;
    return readRich(root, undefined, { html: true });
  };

  test('runs its spaces and lines together as the page shows them, keeping the formatting', () => {
    expect(read('<p>One <b>two</b></p>\n  <p>  three   <i>four</i> </p>\n')).toBe('One <b>two</b>\nthree <i>four</i>');
  });
});
