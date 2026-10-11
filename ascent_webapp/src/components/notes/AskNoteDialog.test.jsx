// Asking about a note: the note's text and the conversation so far go along; off and offline say so.
import React from 'react';
import { beforeEach, expect, test, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const api = vi.hoisted(() => ({ ask: vi.fn() }));
vi.mock('@/api/client', () => ({ ascent: { entities: { Note: api } } }));

const { default: AskNoteDialog } = await import('./AskNoteDialog');

const t = (key) => key;
const note = { id: 'n1', title: 'Trip', type: 'checklist', items: [{ id: 'a', text: 'Passports', done: false }] };
const open = (props = {}) => render(
  <AskNoteDialog open onOpenChange={() => {}} note={note} text="[ ] Passports" online t={t} {...props} />,
);

beforeEach(() => api.ask.mockReset());

test('a suggestion asks straight away, and a follow-up carries the earlier turn', async () => {
  const user = userEvent.setup();
  api.ask.mockResolvedValueOnce({ answer: 'Pack the passports.' }).mockResolvedValueOnce({ answer: 'Yes.' });
  open();
  await user.click(screen.getByRole('button', { name: 'ntAskLeft' }));
  expect(await screen.findByText('Pack the passports.')).toBeTruthy();
  expect(api.ask).toHaveBeenCalledWith('n1', { title: 'Trip', text: '[ ] Passports', question: 'ntAskLeft', history: [] });

  await user.type(screen.getByPlaceholderText('ntAskPlaceholder'), 'Only that?{Enter}');
  expect(await screen.findByText('Yes.')).toBeTruthy();
  expect(api.ask).toHaveBeenLastCalledWith('n1', expect.objectContaining({
    question: 'Only that?',
    history: [{ question: 'ntAskLeft', answer: 'Pack the passports.' }],
  }));
});

test('a failed question stays in the box to send again', async () => {
  const user = userEvent.setup();
  api.ask.mockRejectedValueOnce(Object.assign(new Error('rate_limited'), { status: 429 }));
  open();
  await user.type(screen.getByPlaceholderText('ntAskPlaceholder'), 'When do we leave?{Enter}');
  expect(await screen.findByText('askLimited')).toBeTruthy();
  expect(screen.getByPlaceholderText('ntAskPlaceholder').value).toBe('When do we leave?');
});

test('with the assistant off it says how to turn it on; offline it does not call out', async () => {
  const { unmount } = open({ aiOff: true, isOwner: true });
  expect(screen.getByText('ntAskNeedsAssistantOwner')).toBeTruthy();
  expect(screen.queryByPlaceholderText('ntAskPlaceholder')).toBeNull();
  unmount();

  const notSetUp = open({ notSetUp: true, aiOff: true, isOwner: true });
  expect(screen.getByText('ntAskNotSetUp')).toBeTruthy();
  notSetUp.unmount();

  const user = userEvent.setup();
  open({ online: false });
  await user.click(screen.getByRole('button', { name: 'ntAskSummarize' }));
  expect(screen.getByText('ntAskOffline')).toBeTruthy();
  expect(api.ask).not.toHaveBeenCalled();
});
