import React, { useState } from 'react';
import { describe, expect, test } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import ChecklistEditor from './ChecklistEditor';
import { NoteTypeMenu } from './NoteParts';
import { lineKind } from './noteUtils';

const t = (key) => key;
let seen = [];

function Editor({ start }) {
  const [items, setItems] = useState(start);
  seen = items;
  return <ChecklistEditor items={items} onChange={setItems} t={t} />;
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
