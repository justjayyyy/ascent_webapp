import React, { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChecklistEditor from './ChecklistEditor';
import { NoteTypeMenu } from './NoteParts';
import { lineKind } from './noteUtils';

const t = (key) => key;
let seen = [];

function Editor({ start, flow = false }) {
  const [items, setItems] = useState(start);
  seen = items;
  return <ChecklistEditor items={items} onChange={setItems} t={t} flow={flow} />;
}

const line = (id, text, kind) => ({ id, text, done: false, ...(kind ? { kind } : {}) });
const kinds = () => seen.map(lineKind);
const enterOn = (text) => fireEvent.keyDown(screen.getByDisplayValue(text), { key: 'Enter' });

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
    fireEvent.keyDown(screen.getAllByDisplayValue('')[0], { key: 'Backspace' });
    expect(kinds()).toEqual(['text']);
  });

  test('one of another kind becomes the kind above first', () => {
    render(<Editor start={[line('a', 'Some text', 'text'), line('b', '', 'number')]} />);
    fireEvent.keyDown(screen.getAllByDisplayValue('')[0], { key: 'Backspace' });
    expect(kinds()).toEqual(['text', 'text']);
  });
});

describe('continuous text', () => {
  const texts = () => seen.map(i => [lineKind(i), i.text]);
  const caretAt = (el, at) => { act(() => el.focus()); el.setSelectionRange(at, at); return el; };

  test('Enter goes on in the same text', () => {
    render(<Editor flow start={[line('a', 'Dear diary', 'text')]} />);
    expect(enterOn('Dear diary')).toBe(true); // not taken over: the text gets its new line
    expect(texts()).toEqual([['text', 'Dear diary']]);
  });

  test('"# " or "1. " at the start of a line makes that line a title or a numbered line', () => {
    render(<Editor flow start={[line('a', 'Intro\n#', 'text')]} />);
    fireEvent.change(screen.getByDisplayValue(/Intro/), { target: { value: 'Intro\n# ' } });
    expect(texts()).toEqual([['text', 'Intro'], ['title', '']]);
    fireEvent.change(screen.getByDisplayValue('Intro'), { target: { value: 'Intro\n1' } });
    fireEvent.change(screen.getByDisplayValue(/Intro/), { target: { value: 'Intro\n1.' } });
    fireEvent.change(screen.getByDisplayValue(/Intro/), { target: { value: 'Intro\n1. ' } });
    expect(texts()).toEqual([['text', 'Intro'], ['number', ''], ['title', '']]);
  });

  test('a title is put in where the cursor is, cutting the text there', () => {
    render(<Editor flow start={[line('a', 'Before\nAfter', 'text')]} />);
    caretAt(screen.getByDisplayValue(/Before/), 7);
    fireEvent.click(screen.getByRole('button', { name: /ntAddTitle/ }));
    expect(texts()).toEqual([['text', 'Before'], ['title', ''], ['text', 'After']]);
  });

  test('an empty checkbox leaves the list on Enter, and ticked ones stay in their place', () => {
    render(<Editor flow start={[line('a', 'Intro', 'text'), { ...line('b', 'Milk'), done: true }, line('c', '')]} />);
    expect(screen.queryByText(/ntCompletedCount/)).toBeNull();
    fireEvent.keyDown(screen.getAllByDisplayValue('')[0], { key: 'Enter' });
    expect(texts()).toEqual([['text', 'Intro'], ['item', 'Milk'], ['text', '']]);
  });

  test('Backspace at the start of a title makes it text again, one with the text above', () => {
    render(<Editor flow start={[line('a', 'Intro', 'text'), line('b', 'Shopping', 'title'), line('c', 'Milk and eggs', 'text')]} />);
    fireEvent.keyDown(caretAt(screen.getByDisplayValue('Shopping'), 0), { key: 'Backspace' });
    expect(texts()).toEqual([['text', 'Intro\nShopping\nMilk and eggs']]);
  });

  test('Backspace at the start of text joins it to the text above', () => {
    render(<Editor flow start={[line('a', 'Dear ', 'text'), line('b', 'diary', 'text')]} />);
    fireEvent.keyDown(caretAt(screen.getByDisplayValue('diary'), 0), { key: 'Backspace' });
    expect(texts()).toEqual([['text', 'Dear diary']]);
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
