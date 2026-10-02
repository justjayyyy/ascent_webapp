// Groceries demo data for the demo account (or the account given with --email): staples with a few
// months of purchases and prices, some running low, a list for the next shop, the matching grocery
// expenses on the days they were bought, and this month's groceries budget if there is none.
// Running it again replaces what it made before; nothing else in the workspace is touched.
//
//   npm run seed:groceries                       (demo@ascent.com)
//   npm run seed:groceries -- --email you@x.com
import 'dotenv/config';
import mongoose from 'mongoose';

const emailArg = process.argv.indexOf('--email');
const EMAIL = (emailArg > 0 ? process.argv[emailArg + 1] : 'demo@ascent.com').toLowerCase();
const SEED_KEY = 'seed:groceries';

const DAY = 24 * 60 * 60 * 1000;
const pad = (n) => String(n).padStart(2, '0');
const dayOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const ago = (n) => { const d = new Date(); d.setHours(12, 0, 0, 0); return new Date(d.getTime() - n * DAY); };

// The days the household went shopping, as days ago: roughly weekly, never exactly
const SHOPS = [1, 7, 13, 18, 25, 30, 37, 43, 49, 56, 62, 69, 76, 83, 89, 96, 103, 109, 116];

// [name, emoji, aisle, lasts (days), last bought (days ago, one of SHOPS), price, extras]
const STAPLES = [
  ['Milk 2%', '🥛', 'dairy', 5, 7, 4.29],
  ['Eggs', '🥚', 'dairy', 9, 7, 5.49, { onList: true, qty: '12' }],
  ['Greek yogurt', '🥣', 'dairy', 7, 1, 6.99],
  ['Cheddar cheese', '🧀', 'dairy', 14, 7, 5.99],
  ['Butter', '🧈', 'dairy', 21, 13, 4.79],
  ['Sourdough bread', '🍞', 'bakery', 6, 7, 5.5, { onList: true }],
  ['Bagels', '🥯', 'bakery', 10, 1, 4.99],
  ['Bananas', '🍌', 'produce', 6, 1, 1.89],
  ['Avocados', '🥑', 'produce', 7, 7, 4.5, { onList: true, qty: '3' }],
  ['Tomatoes', '🍅', 'produce', 8, 7, 3.99, { onList: true, qty: '2 lb' }],
  ['Spinach', '🥬', 'produce', 6, 1, 3.49],
  ['Lemons', '🍋', 'produce', 14, 7, 2.99],
  ['Onions', '🧅', 'produce', 18, 13, 2.49],
  ['Apples', '🍎', 'produce', 10, 1, 4.99],
  ['Chicken breast', '🍗', 'meat', 7, 1, 11.99],
  ['Salmon', '🐟', 'meat', 14, 13, 14.99],
  ['Coffee beans', '☕', 'pantry', 21, 18, 12.99],
  ['Pasta', '🍝', 'pantry', 18, 13, 2.29],
  ['Rice', '🍚', 'pantry', 30, 18, 6.49, { level: 'low', levelAgo: 1 }],
  ['Olive oil', '🫒', 'pantry', 45, 30, 9.99],
  ['Peanut butter', '🥜', 'snacks', 25, 18, 4.49],
  ['Sparkling water', '💧', 'drinks', 8, 1, 5.99],
  ['Orange juice', '🧃', 'drinks', 9, 7, 4.29, { onList: true }],
  ['Ice cream', '🍨', 'frozen', 20, 13, 5.49],
  ['Dish soap', '🧽', 'household', 30, 13, 3.99],
  ['Paper towels', '🧻', 'household', 21, 7, 8.99],
  ['Toilet paper', '🧻', 'household', 28, 25, 12.99],
  ['Trash bags', '🗑️', 'household', 40, 30, 7.99],
  ['Laundry detergent', '🧺', 'household', 35, 25, 13.99],
  ['Toothpaste', '🪥', 'personal', 40, 18, 3.49],
  ['Shampoo', '🧴', 'personal', 45, 25, 6.99],
];
// On the list, never bought: no history, no price yet
const ONE_OFFS = [
  ['Basil', '🌿', 'produce'],
  ['Birthday candles', '🕯️', 'other'],
];
const STORES = ['Whole Foods', "Trader Joe's", 'Whole Foods', 'Costco', "Trader Joe's"];

const nearestShop = (target) => SHOPS.reduce((best, s) => (Math.abs(s - target) < Math.abs(best - target) ? s : best), SHOPS[0]);
// A price that moves a little from shop to shop
const jitter = (price, i) => Math.round(price * (1 + (((i * 37) % 11) - 5) / 100) * 100) / 100;

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;

  const user = await db.collection('users').findOne({ email: EMAIL });
  if (!user) throw new Error(`No account for ${EMAIL}`);
  const workspace = await db.collection('workspaces').findOne({ ownerId: user._id }, { sort: { created_date: 1 } });
  if (!workspace) throw new Error(`${EMAIL} owns no workspace`);
  const workspaceId = workspace._id;
  const currency = user.currency || 'USD';
  console.log(`Seeding groceries for ${EMAIL} in "${workspace.name}" (${currency})`);

  // Replace only what this script made before
  const removed = await db.collection('groceryitems').deleteMany({ workspaceId });
  const removedTx = await db.collection('expensetransactions').deleteMany({ workspaceId, dedupeKey: { $regex: `^${SEED_KEY}:` } });
  console.log(`  removed ${removed.deletedCount} grocery items and ${removedTx.deletedCount} seeded grocery expenses`);

  const now = new Date();
  const spentOn = new Map(); // shop day -> money spent on tracked items
  let n = 0;
  const rows = STAPLES.map(([name, emoji, aisle, lasts, last, price, extra = {}]) => {
    const days = [];
    for (let k = 0; last + k * lasts <= 118 && days.length < 8; k += 1) {
      const shop = nearestShop(last + k * lasts);
      if (!days.includes(shop)) days.push(shop);
    }
    const purchases = days.reverse().map((d, i) => {
      const paid = jitter(price, i + name.length);
      spentOn.set(d, (spentOn.get(d) || 0) + paid);
      n += 1;
      return { id: `seed${n}`, date: dayOf(ago(d)), qty: extra.qty && /^\d+$/.test(extra.qty) ? extra.qty : '', price: paid, currency, by: EMAIL };
    });
    return {
      name, emoji, aisle, staple: null,
      onList: !!extra.onList, qty: extra.onList ? extra.qty || '' : '', note: '',
      listedAt: extra.onList ? new Date(now.getTime() - (n % 5) * 3600 * 1000) : null,
      listedBy: extra.onList ? EMAIL : '',
      inCart: false, cartBy: '',
      level: extra.level || null,
      levelAt: extra.level ? ago(extra.levelAgo || 0) : null,
      lastsDays: null,
      purchases,
    };
  });
  ONE_OFFS.forEach(([name, emoji, aisle]) => rows.push({
    name, emoji, aisle, staple: null, onList: true, qty: '', note: '', listedAt: now, listedBy: EMAIL,
    inCart: false, cartBy: '', level: null, levelAt: null, lastsDays: null, purchases: [],
  }));

  await db.collection('groceryitems').insertMany(rows.map((r) => ({
    ...r, workspaceId, createdBy: user._id, created_by: EMAIL, created_date: now, updated_date: now,
  })));
  console.log(`  added ${rows.length} grocery items (${rows.filter((r) => r.onList).length} on the list)`);

  // One grocery expense per shop in the last two months: the tracked items plus the rest of the basket
  const card = await db.collection('cards').findOne({ workspaceId, isActive: { $ne: false } });
  const category = await db.collection('categories').findOne({ workspaceId, $or: [{ nameKey: 'groceries' }, { name: 'groceries' }] });
  const shops = SHOPS.filter((d) => d <= 62).map((d, i) => {
    const amount = Math.round(((spentOn.get(d) || 0) * 1.35 + 18 + ((d * 7) % 23)) * 100) / 100;
    const date = ago(d);
    return {
      description: STORES[i % STORES.length],
      amount, currency, amountInGlobalCurrency: amount, globalCurrency: currency, exchangeRate: 1,
      type: 'Expense', category: category?.name || 'groceries', date: dayOf(date),
      paymentMethod: card ? 'Card' : 'Cash', cardId: card ? card._id.toString() : null,
      workspaceId, createdBy: user._id, created_by: EMAIL, created_date: date, updated_date: date,
      dedupeKey: `${SEED_KEY}:${d}`,
    };
  });
  if (shops.length) await db.collection('expensetransactions').insertMany(shops);
  console.log(`  added ${shops.length} grocery expenses`);

  // This month's groceries budget, unless the household already set one
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const budgetCategory = category?.name || 'groceries';
  const hasBudget = await db.collection('budgets').findOne({ workspaceId, category: budgetCategory, year, month });
  if (!hasBudget) {
    await db.collection('budgets').insertOne({
      category: budgetCategory, monthlyLimit: 600, alertThreshold: 80, currency, year, month, period: 'monthly',
      isActive: true, isShared: true, workspaceId, createdBy: user._id, created_date: now, updated_date: now,
    });
    console.log(`  added a ${currency} 600 groceries budget for ${year}-${pad(month)}`);
  }

  // Open apps pick the change up on their next pulse
  await db.collection('workspaces').updateOne({ _id: workspaceId }, { $inc: { dataRev: 1 } });
  await mongoose.disconnect();
  console.log('Done.');
}

main().catch(async (err) => {
  console.error(err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
