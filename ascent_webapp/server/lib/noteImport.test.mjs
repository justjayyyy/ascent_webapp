// Claude's reading of a document, cleaned into the note's lines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toNoteLines, IMPORT_SYSTEM } from './noteImport.js';

const line = (over) => ({ kind: 'text', text: 'x', done: false, amount: null, currency: null, picture: null, ...over });

test('each kind becomes the note line it stands for, with its amount only where a line may carry one', () => {
  const { title, lines } = toNoteLines({
    title: '  לפני החתונה  ',
    lines: [
      line({ kind: 'title', text: '1. ספקים' }),
      line({ kind: 'numbered', text: 'דיג׳יי\nשולם ₪0', amount: 8000, currency: 'ils' }),
      line({ kind: 'task', text: 'להזמין פרחים', done: true }),
      line({ kind: 'callout', text: 'מה לא סגור\nסכומים מהאפליקציה', amount: 5 }),
      line({ kind: 'text', text: 'סה״כ שולם ₪23,211' }),
      line({ kind: 'text', text: '   ' }),
      line({ kind: 'banner', text: 'unknown kind' }),
    ],
  });
  assert.equal(title, 'לפני החתונה');
  assert.deepEqual(lines, [
    { text: '1. ספקים', done: false, kind: 'title' },
    { text: 'דיג׳יי\nשולם ₪0', done: false, kind: 'number', amount: 8000, currency: 'ILS' },
    { text: 'להזמין פרחים', done: true },
    { text: 'מה לא סגור\nסכומים מהאפליקציה', done: false, kind: 'callout' },
    { text: 'סה״כ שולם ₪23,211', done: false, kind: 'text' },
    { text: 'unknown kind', done: false, kind: 'text' },
  ]);
});

test('a picture is placed once, and only one that was sent', () => {
  const { lines } = toNoteLines({
    title: null,
    lines: [
      line({ kind: 'picture', text: 'איור להמחשה בלבד', picture: 1 }),
      line({ kind: 'picture', text: '', picture: 1 }),
      line({ kind: 'picture', text: '', picture: 7 }),
    ],
  }, [1, 2]);
  assert.deepEqual(lines, [{ kind: 'image', text: 'איור להמחשה בלבד', done: false, picture: 1 }]);
});

test('the instructions start the way the test servers recognise them', () => {
  assert.ok(IMPORT_SYSTEM.startsWith('You copy documents into a notes app'));
});
