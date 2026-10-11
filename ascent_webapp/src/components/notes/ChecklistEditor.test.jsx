import React, { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ChecklistEditor from './ChecklistEditor';
import { NoteTypeMenu } from './NoteParts';
import { lineKind } from './noteUtils';

const t = (key) => key;
let seen = [];

const queries = new QueryClient();

function Editor({ start, flow = false }) {
  const [items, setItems] = useState(start);
  seen = items;
  // Pictures load through the query client; offline here, so they show their placeholder
  return (
    <QueryClientProvider client={queries}>
      <ChecklistEditor items={items} onChange={setItems} t={t} flow={flow} online={false} />
    </QueryClientProvider>
  );
}

const line = (id, text, kind) => ({ id, text, done: false, ...(kind ? { kind } : {}) });
const kinds = () => seen.map(lineKind);
// The lines on screen whose text (without formatting) is `text`, or matches it
const linesWith = (text) => {
  const found = screen.getAllByRole('textbox').filter(el => (text instanceof RegExp ? text.test(el.value) : el.value === text));
  if (!found.length) throw new Error(`No line with ${text}`);
  return found;
};
const lineWith = (text) => linesWith(text)[0];
const enterOn = (text) => fireEvent.keyDown(lineWith(text), { key: 'Enter' });
// Typing that leaves the line holding `text`
const typeInto = (el, text) => { el.textContent = text; fireEvent.input(el); };

describe('Enter on a line', () => {
  test('text goes on as text, items as items, numbered lines as numbered lines', () => {
    render(<Editor start={[line('a', 'Some text', 'text'), line('b', 'Milk'), line('c', 'Step', 'number')]} />);
    enterOn('Some text');
    enterOn('Milk');
    enterOn('Step');
    expect(kinds()).toEqual(['text', 'text', 'item', 'item', 'number', 'number']);
  });

  test('a title leads into the lines under it, or the ones above when it is last', () => {
    render(<Editor start={[line('a', 'Intro', 'text'), line('b', 'Shopping', 'title'), line('c', 'Milk')]} />);
    enterOn('Shopping');
    expect(kinds()).toEqual(['text', 'title', 'item', 'item']);
  });

  test('a title alone starts a list', () => {
    render(<Editor start={[line('a', 'Shopping', 'title')]} />);
    enterOn('Shopping');
    expect(kinds()).toEqual(['title', 'item']);
  });
});

describe('Backspace on an empty line', () => {
  test('one like the line above is removed at once', () => {
    render(<Editor start={[line('a', 'Some text', 'text'), line('b', '', 'text')]} />);
    fireEvent.keyDown(linesWith('')[0], { key: 'Backspace' });
    expect(kinds()).toEqual(['text']);
  });

  test('one of another kind becomes the kind above first', () => {
    render(<Editor start={[line('a', 'Some text', 'text'), line('b', '', 'number')]} />);
    fireEvent.keyDown(linesWith('')[0], { key: 'Backspace' });
    expect(kinds()).toEqual(['text', 'text']);
  });
});

describe('continuous text', () => {
  const texts = () => seen.map(i => [lineKind(i), i.text]);
  const caretAt = (el, at) => { act(() => el.focus()); el.setSelectionRange(at, at); return el; };

  test('Enter goes on in the same text', () => {
    render(<Editor flow start={[line('a', 'Dear diary', 'text')]} />);
    enterOn('Dear diary');
    expect(texts()).toEqual([['text', 'Dear diary\n']]);
  });

  test('"# " or "1. " at the start of a line makes that line a title or a numbered line', () => {
    render(<Editor flow start={[line('a', 'Intro\n#', 'text')]} />);
    typeInto(lineWith(/Intro/), 'Intro\n# ');
    expect(texts()).toEqual([['text', 'Intro'], ['title', '']]);
    typeInto(lineWith('Intro'), 'Intro\n1');
    typeInto(lineWith(/Intro/), 'Intro\n1.');
    typeInto(lineWith(/Intro/), 'Intro\n1. ');
    expect(texts()).toEqual([['text', 'Intro'], ['number', ''], ['title', '']]);
  });

  test('a title is put in where the cursor is, cutting the text there', () => {
    render(<Editor flow start={[line('a', 'Before\nAfter', 'text')]} />);
    caretAt(lineWith(/Before/), 7);
    fireEvent.click(screen.getByRole('button', { name: /ntAddTitle/ }));
    expect(texts()).toEqual([['text', 'Before'], ['title', ''], ['text', 'After']]);
  });

  test('an empty checkbox leaves the list on Enter, and ticked ones stay in their place', () => {
    render(<Editor flow start={[line('a', 'Intro', 'text'), { ...line('b', 'Milk'), done: true }, line('c', '')]} />);
    expect(screen.queryByText(/ntCompletedCount/)).toBeNull();
    fireEvent.keyDown(linesWith('')[0], { key: 'Enter' });
    expect(texts()).toEqual([['text', 'Intro'], ['item', 'Milk'], ['text', '']]);
  });

  test('Backspace at the start of a title makes it text again, one with the text above', () => {
    render(<Editor flow start={[line('a', 'Intro', 'text'), line('b', 'Shopping', 'title'), line('c', 'Milk and eggs', 'text')]} />);
    fireEvent.keyDown(caretAt(lineWith('Shopping'), 0), { key: 'Backspace' });
    expect(texts()).toEqual([['text', 'Intro\nShopping\nMilk and eggs']]);
  });

  test('Backspace at the start of text joins it to the text above', () => {
    render(<Editor flow start={[line('a', 'Dear ', 'text'), line('b', 'diary', 'text')]} />);
    fireEvent.keyDown(caretAt(lineWith('diary'), 0), { key: 'Backspace' });
    expect(texts()).toEqual([['text', 'Dear diary']]);
  });
});

describe('formatting', () => {
  const texts = () => seen.map(i => [lineKind(i), i.text]);
  const caretAt = (el, from, to = from) => { act(() => el.focus()); el.setSelectionRange(from, to); return el; };

  test('Ctrl+B makes the selection bold, and again plain', () => {
    render(<Editor flow start={[line('a', 'Buy milk today', 'text')]} />);
    const el = caretAt(lineWith('Buy milk today'), 4, 8);
    fireEvent.keyDown(el, { key: 'b', ctrlKey: true });
    expect(seen[0].text).toBe('Buy <b>milk</b> today');
    expect(el.querySelector('strong')?.textContent).toBe('milk');
    expect([el.selectionStart, el.selectionEnd]).toEqual([4, 8]);
    fireEvent.keyDown(el, { key: 'b', ctrlKey: true });
    expect(seen[0].text).toBe('Buy milk today');
  });

  test('italic, underline and strikethrough stack, and Ctrl+\\ takes them off', () => {
    render(<Editor flow start={[line('a', 'word', 'text')]} />);
    const el = caretAt(lineWith('word'), 0, 4);
    fireEvent.keyDown(el, { key: 'i', ctrlKey: true });
    fireEvent.keyDown(el, { key: 'u', metaKey: true });
    fireEvent.keyDown(el, { key: 'X', ctrlKey: true, shiftKey: true });
    expect(seen[0].text).toBe('<i><u><s>word</s></u></i>');
    fireEvent.keyDown(el, { key: '\\', ctrlKey: true });
    expect(seen[0].text).toBe('word');
  });

  test('a title put in the middle of formatted text keeps the formatting on both sides', () => {
    render(<Editor flow start={[line('a', 'Before <b>bold\nstill</b> after', 'text')]} />);
    caretAt(lineWith(/Before/), 12);
    fireEvent.click(screen.getByRole('button', { name: /ntAddTitle/ }));
    expect(texts()).toEqual([['text', 'Before <b>bold</b>'], ['title', ''], ['text', '<b>still</b> after']]);
  });

  test('typed text keeps the formatting it is typed into', () => {
    render(<Editor flow start={[line('a', 'a <b>bold</b> word', 'text')]} />);
    const el = lineWith('a bold word');
    el.querySelector('strong').textContent = 'bolder';
    fireEvent.input(el);
    expect(seen[0].text).toBe('a <b>bolder</b> word');
  });
});

describe('pictures', () => {
  const picture = (extra) => ({ id: 'p', text: 'cover', done: false, kind: 'image', fileId: 'f1', ...extra });

  test('the handle on a picture makes it narrower or wider with the arrows, and full width again', () => {
    render(<Editor flow start={[picture({ width: 40 })]} />);
    const handle = screen.getByRole('button', { name: 'ntResizePicture' });
    fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect(seen[0].width).toBe(50);
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(seen[0].width).toBe(30);
    fireEvent.doubleClick(handle);
    expect('width' in seen[0]).toBe(false);
  });

  test('never narrower than a small picture, and full width is no width at all', () => {
    render(<Editor flow start={[picture({ width: 20 })]} />);
    const handle = screen.getByRole('button', { name: 'ntResizePicture' });
    fireEvent.keyDown(handle, { key: 'ArrowLeft' });
    expect(seen[0].width).toBe(15);
    for (let i = 0; i < 12; i += 1) fireEvent.keyDown(handle, { key: 'ArrowRight' });
    expect('width' in seen[0]).toBe(false);
  });
});

describe('note type menu', () => {
  test('names the current type and switches to the other', async () => {
    const picked = [];
    render(<NoteTypeMenu value="checklist" onChange={(v) => picked.push(v)} t={t} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'ntNoteType: ntTypeList' }));
    await user.click(await screen.findByRole('menuitemradio', { name: /ntTypeText/ }));
    expect(picked).toEqual(['text']);
  });
});
