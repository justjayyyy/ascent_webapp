// An in-memory stand-in for the Ascent API at the fetch level, so tests run the real client, auth,
// hooks and offline queue. Seed it with rows; it answers like the server (envelope, filters).
import { applyEntryChange } from '@/lib/listEntries';

const today = new Date();
const day = (offset = 0) => {
  const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** A household with a bit of everything: income, foreign currency, someone else paying, a plan, installments, a loan, a note. */
export function seedData({ language = 'en' } = {}) {
  const me = { id: 'u1', _id: 'u1', email: 'dana@x.test', full_name: 'Dana', language, currency: 'ILS', theme: 'dark', passkeyCount: 0 };
  const workspace = {
    id: 'w1', _id: 'w1', name: 'Home', ownerId: 'u1', settings: {},
    members: [
      { _id: 'm1', userId: 'u1', email: 'dana@x.test', name: 'Dana', status: 'accepted', role: 'owner' },
      { _id: 'm2', userId: 'u2', email: 'sam@x.test', name: 'Sam', status: 'accepted', role: 'editor', permissions: { viewExpenses: true, editExpenses: true, viewNotes: true, editNotes: true } },
    ],
  };
  const tx = (id, extra) => ({ id, _id: id, type: 'Expense', currency: 'ILS', category: 'groceries', description: 'Shufersal', date: day(0), created_by: 'dana@x.test', status: 'confirmed', ...extra });
  return {
    me,
    workspaces: [workspace],
    entities: {
      transactions: [
        tx('t1', { amount: 120 }),
        tx('t2', { amount: 3000, type: 'Income', category: 'salary', description: 'Salary', date: day(0) }),
        tx('t3', { amount: 18, currency: 'USD', amountInGlobalCurrency: null, description: 'Coffee NYC' }),
        tx('t4', { amount: 400, description: 'Dinner', paidBy: 'dana@x.test' }),
        tx('t5', { amount: 250, planId: 'p1', planItemId: 'i1', description: 'Flights' }),
        tx('t6', { amount: 100, isBigPurchase: true, installmentGroupId: 'g1', installmentIndex: 1, installmentCount: 3, installmentTotal: 300, description: 'TV' }),
        tx('t7', { amount: 55, status: 'pending', source: 'wallet', merchant: 'Cafe', description: 'Cafe' }),
      ],
      categories: [
        { id: 'c1', name: 'groceries', nameKey: 'groceries', type: 'Expense', icon: '🛒', isDefault: true },
        { id: 'c2', name: 'salary', nameKey: 'salary', type: 'Income', icon: '💰', isDefault: true },
      ],
      budgets: [{ id: 'b1', category: 'groceries', monthlyLimit: 1500, currency: 'ILS', year: today.getFullYear(), month: today.getMonth() + 1, isActive: true }],
      cards: [{ id: 'k1', name: 'Max', lastFourDigits: '1234', type: 'credit', isActive: true }],
      plans: [{
        id: 'p1', name: 'Rome', kind: 'vacation', currency: 'ILS', budget: 8000, startDate: day(60), status: 'active',
        items: [{ id: 'i1', name: 'Flights', amount: 250, status: 'paid', transactionId: 't5' }, { id: 'i2', name: 'Hotel', amount: 2000, status: 'planned', dueDate: day(20) }],
      }],
      commitments: [{ id: 'cm1', name: 'Car loan', kind: 'car', direction: 'borrowed', currency: 'ILS', principal: 60000, annualRate: 5, termMonths: 48, firstPaymentDate: day(-200), payments: [], status: 'active' }],
      accounts: [],
      tasks: [
        { id: 'tk1', title: 'Car insurance', kind: 'car', dueDate: day(3), repeat: 'yearly', amount: 2400, currency: 'ILS', remindDays: 7, status: 'open', history: [] },
        { id: 'tk2', title: 'Passport', kind: 'documents', dueDate: null, repeat: 'none', amount: 0, currency: 'ILS', remindDays: 7, status: 'open', history: [] },
      ],
      groceries: [
        { id: 'g1', name: 'Milk', emoji: '🥛', aisle: 'dairy', onList: true, purchases: [{ id: 'q1', date: day(-20), price: 6.9, currency: 'ILS', store: 'Shufersal' }, { id: 'q2', date: day(-5), price: 5.9, currency: 'ILS', store: 'Rami Levy' }] },
        { id: 'g2', name: 'Eggs', emoji: '🥚', aisle: 'dairy', onList: false, purchases: [{ id: 'q3', date: day(-20), price: 14, currency: 'ILS', store: 'Shufersal' }, { id: 'q4', date: day(-5), price: 12, currency: 'ILS', store: 'Rami Levy' }] },
      ],
      notes: [{ id: 'n1', title: 'Groceries', type: 'checklist', items: [{ id: 'a', text: 'milk', done: false }], tags: [], isShared: true, myAccess: 'owner', collaborators: [], attachments: [], createdBy: 'u1' }],
    },
  };
}

const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const ok = (data, status = 200) => json(status, { success: true, data });
const fail = (status, error) => json(status, { success: false, error });

/** A fetch implementation backed by `data`. Records every API call in `calls`. */
export function fakeFetch(data) {
  const calls = [];
  const fetchImpl = async (input, init = {}) => {
    const url = new URL(String(input), 'http://app.test');
    const method = (init.method || 'GET').toUpperCase();
    if (url.hostname === 'api.exchangerate-api.com') return json(200, { rates: { USD: 1, ILS: 3.7, EUR: 0.9 } });
    if (!url.pathname.startsWith('/api/')) return new Response('', { status: 404 });
    const body = init.body ? JSON.parse(init.body) : undefined;
    const q = Object.fromEntries(url.searchParams);
    calls.push({ method, path: url.pathname, query: q, body, workspace: init.headers?.['x-workspace-id'] ?? null });
    const path = url.pathname.replace(/^\/api/, '');

    if (path === '/auth/me') {
      if (method === 'PUT') Object.assign(data.me, body);
      if (method === 'DELETE') return body?.confirm === data.me.email ? ok({ deleted: true }) : fail(400, 'Type your email to confirm');
      return ok(data.me);
    }
    if (path === '/auth/password') {
      if (q.action === 'forgot') return ok({ sent: true });
      if (q.action === 'reset') return body.token === 'bad'.padEnd(43, 'x') ? fail(400, 'This link is invalid or has expired') : ok({ user: data.me, token: 'fresh-token' });
    }
    if (path === '/auth/logout') return ok(q.scope === 'others' ? { signedOutOthers: true } : { signedOut: true });
    if (path === '/auth/verify-email') return ok(q.action === 'send' ? { sent: true } : { verified: true });
    if (path === '/workspaces' && (q.action === 'claim' || q.action === 'release')) {
      const ws = data.workspaces.find((w) => w.id === q.id);
      if (!ws?.ownerLeft) return fail(409, 'This workspace already has an owner');
      ws.ownerLeft = null;
      if (q.action === 'claim') ws.ownerId = data.me.id;
      else data.workspaces.splice(data.workspaces.indexOf(ws), 1);
      return ok(q.action === 'claim' ? ws : { left: true });
    }
    if (path === '/workspaces') {
      if (q.action === 'invitations') return ok([]);
      if (q.action === 'heartbeat') return ok({ ok: true });
      if (q.action === 'pulse') return ok({ dataRev: 0, updated: 'start' });
      return ok(data.workspaces);
    }
    if (path === '/assist') return ok({ ai: { configured: false, enabled: false } });
    if (path === '/push') return ok({ enabled: false, publicKey: null });
    if (path === '/ingest-tokens' || path === '/auth/passkey') return ok([]);

    const entity = path.match(/^\/entities\/([\w-]+)$/)?.[1];
    if (entity) {
      const rows = (data.entities[entity] ||= []);
      if (method === 'GET') {
        if (q.id && q._single) return ok(rows.find((r) => r.id === q.id) || null);
        let list = rows;
        if (q.from) list = list.filter((r) => String(r.date) >= q.from);
        if (q.to) list = list.filter((r) => String(r.date).slice(0, 10) <= q.to);
        if (q.has) list = list.filter((r) => r[q.has] !== undefined && r[q.has] !== null && r[q.has] !== '');
        if (q.sort === 'date') list = [...list].sort((a, b) => String(a.date).localeCompare(String(b.date)));
        return ok(list.slice(0, Number(q.limit) || 1000));
      }
      if (method === 'POST') {
        const make = (r, i) => ({ ...r, created_by: data.me.email, id: `new${rows.length + i}`, _id: `new${rows.length + i}` }); // the server stamps the author
        const created = Array.isArray(body) ? body.map(make) : make(body, 0);
        rows.push(...[].concat(created));
        return ok(created, 201);
      }
      const row = rows.find((r) => r.id === q.id);
      if (!row) return fail(404, 'Item not found');
      if (method === 'PATCH' && q.list) {
        if (body.op === 'patch' && !(row[q.list] || []).some((e) => e.id === body.id)) return fail(404, 'Item not found');
        row[q.list] = applyEntryChange(row[q.list], body);
        return ok(row);
      }
      if (method === 'PUT' || method === 'PATCH') {
        Object.assign(row, body);
        return ok(row);
      }
      if (method === 'DELETE') {
        rows.splice(rows.indexOf(row), 1);
        return ok({ deleted: true, id: q.id });
      }
    }
    return method === 'GET' ? ok([]) : fail(404, 'Not found');
  };
  return { fetchImpl, calls, data };
}
