// Groceries as plain data: which aisle a thing belongs in, reading "milk, 2 eggs, bread" into items,
// and how much of a staple is probably left. No React here, so it is easy to test.
import { localDay } from '@/lib/localDay';

/** Aisles in the order most shops are walked; the list is grouped and sorted by this. */
export const AISLES = [
  { key: 'produce', emoji: '🥬' },
  { key: 'bakery', emoji: '🥖' },
  { key: 'dairy', emoji: '🥛' },
  { key: 'meat', emoji: '🍗' },
  { key: 'pantry', emoji: '🥫' },
  { key: 'snacks', emoji: '🍪' },
  { key: 'drinks', emoji: '🧃' },
  { key: 'frozen', emoji: '🧊' },
  { key: 'household', emoji: '🧽' },
  { key: 'personal', emoji: '🧴' },
  { key: 'baby', emoji: '🍼' },
  { key: 'pets', emoji: '🐾' },
  { key: 'other', emoji: '🛒' },
];
const AISLE_ORDER = Object.fromEntries(AISLES.map((a, i) => [a.key, i]));
export const aisleEmoji = (key) => AISLES.find((a) => a.key === key)?.emoji || '🛒';

// Everyday things in English, Hebrew and Russian: [emoji, aisle, ...words]. A new item takes the emoji and
// aisle of the first word it contains; after that it keeps whatever the household chose.
const CATALOG = [
  ['🥛', 'dairy', 'milk', 'חלב', 'молоко'],
  ['🥚', 'dairy', 'egg', 'eggs', 'ביצים', 'ביצה', 'яйца', 'яйцо'],
  ['🧀', 'dairy', 'cheese', 'גבינה', 'גבינת', 'сыр', 'творог', 'קוטג', "קוטג'", 'cottage'],
  ['🧈', 'dairy', 'butter', 'חמאה', 'масло'],
  ['🥣', 'dairy', 'yogurt', 'yoghurt', 'יוגורט', 'מעדן', 'йогурт', 'кефир', 'שמנת', 'cream', 'сметана', 'leben', 'לבן'],
  ['🍞', 'bakery', 'bread', 'לחם', 'хлеб', 'toast', 'טוסט', 'батон'],
  ['🥐', 'bakery', 'croissant', 'קרואסון', 'круассан', 'buns', 'לחמניות', 'булочки', 'pita', 'פיתות', 'פיתה', 'лаваш'],
  ['🍅', 'produce', 'tomato', 'tomatoes', 'עגבניות', 'עגבניה', 'помидоры', 'томаты'],
  ['🥒', 'produce', 'cucumber', 'cucumbers', 'מלפפון', 'מלפפונים', 'огурцы', 'огурец'],
  ['🧅', 'produce', 'onion', 'onions', 'בצל', 'лук'],
  ['🧄', 'produce', 'garlic', 'שום', 'чеснок'],
  ['🥔', 'produce', 'potato', 'potatoes', 'תפוחי אדמה', 'תפוא', 'картошка', 'картофель'],
  ['🥕', 'produce', 'carrot', 'carrots', 'גזר', 'морковь'],
  ['🫑', 'produce', 'pepper', 'peppers', 'פלפל', 'перец'],
  ['🥬', 'produce', 'lettuce', 'salad', 'חסה', 'салат', 'spinach', 'תרד', 'шпинат', 'herbs', 'פטרוזיליה', 'כוסברה', 'петрушка', 'укроп'],
  ['🥑', 'produce', 'avocado', 'אבוקדו', 'авокадо'],
  ['🍌', 'produce', 'banana', 'bananas', 'בננה', 'בננות', 'бананы', 'банан'],
  ['🍎', 'produce', 'apple', 'apples', 'תפוח', 'תפוחים', 'яблоки', 'яблоко'],
  ['🍋', 'produce', 'lemon', 'lemons', 'לימון', 'לימונים', 'лимон', 'лимоны'],
  ['🍊', 'produce', 'orange', 'oranges', 'תפוז', 'תפוזים', 'апельсины', 'клементины', 'קלמנטינות'],
  ['🍓', 'produce', 'strawberries', 'תותים', 'клубника', 'berries', 'ענבים', 'grapes', 'виноград'],
  ['🍉', 'produce', 'watermelon', 'אבטיח', 'арбуз', 'melon', 'מלון', 'дыня'],
  ['🍗', 'meat', 'chicken', 'עוף', 'חזה', 'שניצל', 'курица', 'филе'],
  ['🥩', 'meat', 'beef', 'steak', 'meat', 'בשר', 'אנטריקוט', 'טחון', 'мясо', 'говядина', 'фарш'],
  ['🐟', 'meat', 'fish', 'salmon', 'tuna', 'דג', 'סלמון', 'טונה', 'рыба', 'лосось', 'тунец'],
  ['🌭', 'meat', 'sausages', 'hot dogs', 'נקניק', 'נקניקיות', 'колбаса', 'сосиски', 'ham', 'пастрами', 'פסטרמה'],
  ['🍝', 'pantry', 'pasta', 'spaghetti', 'פסטה', 'ספגטי', 'макароны', 'паста', 'noodles', 'אטריות', 'лапша'],
  ['🍚', 'pantry', 'rice', 'אורז', 'рис', 'couscous', 'קוסקוס', 'кускус', 'гречка', 'buckwheat', 'כוסמת'],
  ['🌾', 'pantry', 'flour', 'קמח', 'мука', 'oats', 'שיבולת', 'овсянка', 'cereal', 'דגני', 'хлопья'],
  ['🧂', 'pantry', 'salt', 'מלח', 'соль', 'spices', 'תבלינים', 'специи', 'פפריקה', 'paprika'],
  ['🍬', 'pantry', 'sugar', 'סוכר', 'сахар', 'honey', 'דבש', 'мёд', 'мед'],
  ['🫒', 'pantry', 'oil', 'olive oil', 'שמן', 'זית', 'масло растительное'],
  ['🥫', 'pantry', 'tomato paste', 'רסק', 'beans', 'שעועית', 'фасоль', 'chickpeas', 'חומוס', 'нут', 'corn', 'תירס', 'кукуруза', 'canned', 'шимури', 'tahini', 'טחינה', 'тхина'],
  ['☕', 'pantry', 'coffee', 'קפה', 'кофе', 'tea', 'תה', 'чай'],
  ['🥜', 'snacks', 'peanut butter', 'nuts', 'אגוזים', 'בוטנים', 'орехи', 'שקדים', 'almonds'],
  ['🍪', 'snacks', 'cookies', 'biscuits', 'עוגיות', 'печенье', 'במבה', 'bamba', 'ביסלי', 'chips', "צ'יפס", 'чипсы', 'snacks', 'חטיפים'],
  ['🍫', 'snacks', 'chocolate', 'שוקולד', 'шоколад', 'candy', 'ממתקים', 'конфеты'],
  ['💧', 'drinks', 'water', 'מים', 'вода', 'soda', 'סודה', 'газировка'],
  ['🧃', 'drinks', 'juice', 'מיץ', 'сок', 'cola', 'קולה', 'кола'],
  ['🍷', 'drinks', 'wine', 'יין', 'вино', 'beer', 'בירה', 'пиво'],
  ['🧊', 'frozen', 'ice cream', 'גלידה', 'мороженое', 'frozen', 'קפוא', 'קפואים', 'заморож', 'пельмени', 'ice'],
  ['🧻', 'household', 'toilet paper', 'נייר טואלט', 'туалетная бумага', 'paper towels', 'מגבות נייר', 'tissues', 'טישו', 'салфетки', 'napkins', 'מפיות'],
  ['🧽', 'household', 'dish soap', 'סבון כלים', 'נוזל כלים', 'губки', 'sponges', 'ספוגים', 'средство для посуды', 'cleaner', 'אקונומיקה', 'bleach', 'מנקה', 'чистящее'],
  ['🧺', 'household', 'detergent', 'laundry', 'אבקת כביסה', 'ג׳ל כביסה', "ג'ל כביסה", 'מרכך', 'порошок', 'кондиционер'],
  ['🗑️', 'household', 'trash bags', 'garbage bags', 'שקיות זבל', 'мусорные пакеты', 'foil', 'נייר כסף', 'фольга', 'ניילון נצמד', 'baking paper', 'נייר אפייה'],
  ['🪥', 'personal', 'toothpaste', 'משחת שיניים', 'зубная паста', 'toothbrush', 'מברשת שיניים', 'щетка'],
  ['🧴', 'personal', 'shampoo', 'שמפו', 'шампунь', 'soap', 'סבון', 'мыло', 'conditioner', 'deodorant', 'דאודורנט', 'дезодорант', 'cream', 'קרם', 'крем'],
  ['🍼', 'baby', 'diapers', 'nappies', 'חיתולים', 'подгузники', 'wipes', 'מגבונים', 'салфетки влажные', 'formula', 'מטרנה', 'смесь'],
  ['🐾', 'pets', 'cat food', 'dog food', 'אוכל לחתול', 'אוכל לכלב', 'корм', 'litter', 'חול לחתול', 'наполнитель'],
];

/** How names are compared: lower case, no Hebrew vowel marks or quotes, single spaces. */
export function normalizeName(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '') // Hebrew points
    .replace(/[̀-ͯ]/g, '') // Latin accents
    .replace(/["'`׳״’]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

const words = (name) => normalizeName(name).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
// Hebrew joins "the" and "and" to the word (החלב, וחלב), and English has plurals
const variants = (w) => {
  const out = [w];
  if (/^[הו]\p{L}{2,}/u.test(w)) out.push(w.slice(1));
  if (/[a-z]{3,}s$/.test(w)) out.push(w.slice(0, -1));
  if (/[a-z]{3,}es$/.test(w)) out.push(w.slice(0, -2));
  return out;
};

/** The emoji and aisle a new item probably has, from its name: { emoji, aisle }. */
export function guessItem(name) {
  const norm = normalizeName(name);
  const own = new Set(words(name).flatMap(variants));
  for (const [emoji, aisle, ...terms] of CATALOG) {
    for (const term of terms) {
      const t = normalizeName(term);
      // Several words ("toilet paper") match as a phrase; one word must be a whole word of the name
      if (t.includes(' ') ? norm.includes(t) : own.has(t)) return { emoji, aisle };
    }
  }
  return { emoji: '', aisle: 'other' };
}

// "2", "1.5kg", "x3", "500 g", "2 יח'", "3 шт"
const UNIT = String.raw`(?:kg|g|gr|grams?|l|ml|lt|pcs?|pack|packs|x|×|ק"ג|קג|קילו|גרם|ליטר|יח'?|יחידות|חבילות?|кг|г|гр|л|мл|шт|уп)`;
const LEADING_QTY = new RegExp(String.raw`^(\d+(?:[.,]\d+)?\s*${UNIT}?|${UNIT}\s*\d+(?:[.,]\d+)?)\s+(.+)$`, 'iu');
const TRAILING_QTY = new RegExp(String.raw`^(.+?)\s+(\d+(?:[.,]\d+)?\s*${UNIT}?|[x×]\s*\d+(?:[.,]\d+)?)$`, 'iu');

/**
 * What someone typed or said, as items: "milk, 2 eggs, bread x3" -> [{ name, qty }]. Commas, new lines,
 * semicolons and the word "and" (also ו־ between words in Hebrew, и in Russian) separate items.
 */
export function parseEntries(text) {
  return String(text || '')
    .split(/[,\n;،]+|\s+(?:and|и|וגם)\s+|\s+ו(?=\S{2,}(?:\s|$))/iu)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      let name = part;
      let qty = '';
      const lead = part.match(LEADING_QTY);
      const trail = !lead && part.match(TRAILING_QTY);
      if (lead) { qty = lead[1]; name = lead[2]; } else if (trail) { name = trail[1]; qty = trail[2]; }
      qty = qty.replace(/^[x×]\s*/i, '').replace(/\s+/g, ' ').trim();
      if (qty === '1') qty = '';
      return { name: name.trim().slice(0, 120), qty: qty.slice(0, 40) };
    })
    .filter((e) => e.name);
}

/** The household's item with this name (ignoring case, marks and plurals), if there is one. */
export function findByName(items, name) {
  const target = normalizeName(name);
  if (!target) return null;
  const exact = items.find((i) => normalizeName(i.name) === target);
  if (exact) return exact;
  const loose = (s) => words(s).map((w) => variants(w).at(-1)).join(' ');
  const want = loose(name);
  return items.find((i) => loose(i.name) === want) || null;
}

// ---- supply ----

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (day) => Math.round(Date.parse(`${day}T00:00:00Z`) / DAY_MS);
/** Whole days from `a` to `b` (both 'YYYY-MM-DD'). */
export const daysBetween = (a, b) => dayNumber(b) - dayNumber(a);
// A day as written ('2026-10-06') stays as it is; a moment (a level set at 01:30 in Israel is 22:30 the day
// before in UTC) is the day it was on this device, so a level set after midnight counts from the right day
const dayOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : value ? localDay(new Date(value)) : null);

export const LEVEL_VALUE = { full: 1, half: 0.5, low: 0.2, out: 0 };
const LOW_SHARE = 0.25;
// Close to running out by the calendar too, once at most half is left. Not by the calendar alone: bread
// bought every two days is "two days left" the day it is bought, full, and is not running low then.
const LOW_DAYS = 2;
const LOW_DAYS_SHARE = 0.5;
const MAX_PURCHASES = 30;

/** The distinct days it was bought, oldest first. */
export const purchaseDays = (item) => [...new Set((item.purchases || []).map((p) => p.date).filter(Boolean))].sort();

/** The last day it was bought, or null. */
export const lastBought = (item) => purchaseDays(item).at(-1) || null;

/**
 * How many days it usually lasts, learned from the gaps between purchases: the median of the latest
 * six, so one unusual week does not throw it. Null until it has been bought on two different days.
 */
export function learnedInterval(item) {
  const days = purchaseDays(item);
  if (days.length < 2) return null;
  const gaps = days.slice(1).map((d, i) => daysBetween(days[i], d)).filter((g) => g > 0).slice(-6).sort((a, b) => a - b);
  if (!gaps.length) return null;
  const mid = gaps.length >> 1;
  return gaps.length % 2 ? gaps[mid] : Math.round((gaps[mid - 1] + gaps[mid]) / 2);
}

/** Whether its supply is followed: chosen by hand, or automatically once it has been bought twice. */
export const isTracked = (item) => item.staple === true || (item.staple !== false && purchaseDays(item).length >= 2);

/**
 * How much is probably left: { share (0-1 or null), daysLeft, interval, learned, lastBought, status }.
 * A level set by hand counts from the day it was set; otherwise it is full on the day it was bought.
 * Either way it runs down over the usual interval. status: 'out' | 'low' | 'ok' | 'unknown'.
 */
export function supplyOf(item, today = localDay()) {
  const last = lastBought(item);
  const learned = learnedInterval(item);
  const interval = item.lastsDays || learned || null;
  const levelDay = item.level ? dayOf(item.levelAt) : null;
  const manual = !!item.level && (!last || (levelDay && levelDay >= last));
  const anchor = manual ? { day: levelDay || today, value: LEVEL_VALUE[item.level] ?? 1 } : last ? { day: last, value: 1 } : null;

  let share = null;
  let daysLeft = null;
  if (anchor && interval) {
    const used = Math.max(0, daysBetween(anchor.day, today)) / interval;
    share = Math.min(1, Math.max(0, anchor.value - used));
    daysLeft = Math.round(share * interval);
  } else if (manual) {
    share = anchor.value;
  }

  let status = 'unknown';
  if (manual && item.level === 'out') status = 'out';
  else if (share !== null) {
    status = share <= 0 ? 'out'
      : share <= LOW_SHARE || (daysLeft !== null && daysLeft <= LOW_DAYS && share <= LOW_DAYS_SHARE) ? 'low' : 'ok';
  }

  return {
    share,
    daysLeft,
    interval,
    learned: !item.lastsDays && !!learned,
    manual,
    lastBought: last,
    sinceBought: last ? daysBetween(last, today) : null,
    status,
    runsOutOn: daysLeft !== null ? localDay(new Date(dayNumber(today) * DAY_MS + daysLeft * DAY_MS + 12 * 60 * 60 * 1000)) : null,
  };
}

/** Staples that are low or out and not on the list yet, most urgent first. */
export function runningLow(items, today = localDay()) {
  return items
    // Said to be low or out by hand (in the kitchen check, say) counts even before it is tracked
    .filter((i) => !i.onList && (isTracked(i) || i.level === 'low' || i.level === 'out'))
    .map((item) => ({ item, supply: supplyOf(item, today) }))
    .filter(({ supply }) => supply.status === 'low' || supply.status === 'out')
    .sort((a, b) => (a.supply.share ?? 0) - (b.supply.share ?? 0));
}

/** Items on the list grouped by aisle, in walking order; inside an aisle, newest additions last. */
export function groupByAisle(items) {
  const groups = new Map();
  [...items]
    .sort((a, b) => (AISLE_ORDER[a.aisle] ?? 99) - (AISLE_ORDER[b.aisle] ?? 99)
      || String(a.listedAt || a.created_date || '').localeCompare(String(b.listedAt || b.created_date || '')))
    .forEach((item) => {
      const key = AISLE_ORDER[item.aisle] !== undefined ? item.aisle : 'other';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    });
  return [...groups].map(([aisle, list]) => ({ aisle, items: list }));
}

// ---- changes ----

const randomId = () => (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`).replace(/-/g, '').slice(0, 16);

/** Putting an item on the list. */
export const listChanges = ({ qty = '', note, by = '' } = {}) => ({
  onList: true,
  qty,
  ...(note !== undefined && { note }),
  inCart: false,
  cartBy: '',
  listedAt: new Date().toISOString(),
  listedBy: by,
});

/** Taking it off the list without buying it. */
export const unlistChanges = () => ({ onList: false, inCart: false, cartBy: '', qty: '', note: '', listedAt: null, listedBy: '' });

/**
 * Taking it off the list without buying it says it is not needed yet: when it was running low (by the
 * estimate, or a level set by hand), it goes back to the pantry as half left instead of straight into
 * Running low. The estimate runs down from there, so it comes back when it really is running out.
 */
export function offListChanges(item, today = localDay()) {
  const { status } = supplyOf({ ...item, onList: false }, today);
  return { ...unlistChanges(), ...(status === 'low' || status === 'out' ? levelChanges('half') : {}) };
}

/**
 * It was bought: off the list, a purchase recorded (with the receipt price when there is one), and any
 * level set by hand cleared so it counts as full from today.
 */
export function boughtChanges(item, { date = localDay(), by = '', price = null, currency = null, store = '' } = {}) {
  const purchase = { id: randomId(), date, qty: item.qty || '', price: price ?? null, currency: price != null ? currency : null, by, store: cleanStore(store) };
  return {
    ...unlistChanges(),
    level: null,
    levelAt: null,
    levelBy: '',
    purchases: [...(item.purchases || []), purchase].slice(-MAX_PURCHASES),
  };
}

/** Setting the level by hand ("we're low on rice"), and who said so. */
export function levelChanges(level, by = '') { return { level, levelAt: level ? new Date().toISOString() : null, levelBy: level ? by : '' }; }

/** The last price paid, as { price, currency, date, store }, or null. */
export function lastPrice(item) {
  const priced = (item.purchases || []).filter((p) => typeof p.price === 'number');
  const p = priced.at(-1);
  return p ? { price: p.price, currency: p.currency, date: p.date, store: p.store || '' } : null;
}

/**
 * What the kitchen check goes through: everything not on the list, emptiest first by the estimate (what
 * is probably low is looked at first), then by name. [{ item, supply }]
 */
export function kitchenItems(items, today = localDay(), loc) {
  return items
    .filter((i) => !i.onList)
    .map((item) => ({ item, supply: supplyOf(item, today) }))
    .sort((a, b) => (a.supply.share ?? 2) - (b.supply.share ?? 2) || a.item.name.localeCompare(b.item.name, loc));
}

/** Whether someone said how much is left of it (or bought it) since `since` (a moment, or null for today). */
export function checkedSince(item, since, today = localDay()) {
  const after = (value) => {
    if (!value) return false;
    if (since) return new Date(value).getTime() >= new Date(since).getTime();
    return dayOf(value) === today;
  };
  const bought = lastBought(item);
  return after(item.levelAt) || (!!bought && bought >= (since ? dayOf(since) : today));
}

/** A new item from a name someone typed. */
export function newItem(name, { qty = '', by = '', onList = true } = {}) {
  const { emoji, aisle } = guessItem(name);
  return {
    name: name.trim().slice(0, 120),
    emoji,
    aisle,
    staple: null,
    ...(onList ? listChanges({ qty, by }) : { onList: false }),
    purchases: [],
  };
}

// ---- prices: what things cost, and where they cost less ----

/** A shop name as stored: trimmed, single spaces, at most 80 characters. */
export const cleanStore = (store) => String(store || '').replace(/\s+/g, ' ').trim().slice(0, 80);
const storeKey = (store) => normalizeName(store);

/**
 * Every priced purchase of an item, oldest first, in the viewer's currency: { date, price, store }.
 * `toMine(price, currency)` converts; a price it cannot convert is left out.
 */
export function pricePoints(item, toMine = (p) => p) {
  return (item.purchases || [])
    .filter((p) => typeof p.price === 'number' && p.price > 0)
    .map((p) => ({ date: p.date, price: toMine(p.price, p.currency), store: cleanStore(p.store), qty: p.qty || '', unit: unitOf(p.qty) }))
    .filter((p) => typeof p.price === 'number' && Number.isFinite(p.price))
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

const mean = (values) => values.reduce((s, v) => s + v, 0) / values.length;

/** The price of each shop that sold it: [{ store, avg, last, count }], cheapest on average first. */
function storesOf(points) {
  const by = new Map();
  for (const p of points) {
    if (!p.store) continue;
    const k = storeKey(p.store);
    const s = by.get(k) || { store: p.store, prices: [] };
    s.store = p.store; // the latest spelling
    s.prices.push(p.price);
    by.set(k, s);
  }
  return [...by.values()]
    .map((s) => ({ store: s.store, avg: mean(s.prices), last: s.prices.at(-1), count: s.prices.length }))
    .sort((a, b) => a.avg - b.avg);
}

/**
 * What an item has cost: the last price and how it moved (against the one before, and against the
 * average before it), the range, and each shop's price with the cheapest named. Movement is measured
 * against the same shop when it sold it before, so buying at a dearer shop does not read as a price rise.
 * Null until it has a price.
 */
export function priceStats(item, toMine) {
  const points = pricePoints(item, toMine);
  if (!points.length) return null;
  const last = points.at(-1);
  const before = points.slice(0, -1);
  const sameShop = last.store ? before.filter((p) => storeKey(p.store) === storeKey(last.store)) : [];
  const like = sameShop.length ? sameShop : before;
  const prev = like.at(-1) || null;
  const earlier = like.map((p) => p.price);
  const prices = points.map((p) => p.price);
  const stores = storesOf(points);
  const cheapest = stores.length >= 2 ? stores[0] : null;
  return {
    points,
    last,
    prev,
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: mean(prices),
    changeFromPrev: prev && prev.price > 0 ? (last.price - prev.price) / prev.price : null,
    changeFromAvg: earlier.length ? (last.price - mean(earlier)) / mean(earlier) : null,
    stores,
    cheapest,
    // How much less the cheapest shop usually asks than the last price paid somewhere else
    saving: cheapest && storeKey(last.store) !== storeKey(cheapest.store) && last.price > cheapest.avg ? last.price - cheapest.avg : 0,
  };
}

/** How many of something are on the list, when it says a plain number ("2"); otherwise one. */
const countOf = (qty) => (/^\d+(?:[.,]\d+)?$/.test(String(qty || '').trim()) ? parseFloat(String(qty).replace(',', '.')) : 1);

/**
 * What the list will probably cost: each item at its last price (at `store`'s last price when it was
 * bought there before), times how many are on the list when that is a plain number and the price is for
 * one. { total, priced, missing, atStore }.
 */
export function basketEstimate(items, { toMine, store = '' } = {}) {
  const want = store ? storeKey(store) : null;
  let total = 0;
  let priced = 0;
  let atStore = 0;
  for (const item of items) {
    const points = pricePoints(item, toMine);
    if (!points.length) continue;
    const here = want ? points.filter((p) => storeKey(p.store) === want).at(-1) : null;
    const point = here || points.at(-1);
    total += point.price * (point.unit ? 1 : countOf(item.qty));
    priced += 1;
    if (here) atStore += 1;
  }
  return { total, priced, missing: items.length - priced, atStore };
}

/**
 * Which shop is cheaper, on the things bought at more than one: for each shop, the average of its price
 * over the usual price of the same item. 0.94 means about 6% below usual. Shops compared on fewer than
 * `minItems` items are left out. [{ store, index, items }], cheapest first.
 */
export function storeComparison(items, { toMine, minItems = 2 } = {}) {
  const ratios = new Map();
  for (const item of items) {
    const stores = storesOf(pricePoints(item, toMine));
    if (stores.length < 2) continue;
    const usual = mean(stores.map((s) => s.avg));
    if (!(usual > 0)) continue;
    for (const s of stores) {
      const k = storeKey(s.store);
      const entry = ratios.get(k) || { store: s.store, values: [] };
      entry.values.push(s.avg / usual);
      ratios.set(k, entry);
    }
  }
  return [...ratios.values()]
    .filter((r) => r.values.length >= minItems)
    .map((r) => ({ store: r.store, index: mean(r.values), items: r.values.length }))
    .sort((a, b) => a.index - b.index);
}

/** Items whose last price moved at least `threshold` from their usual price: { up, down }, biggest moves first. */
export function priceMovers(items, { toMine, threshold = 0.08 } = {}) {
  const moved = items
    .map((item) => ({ item, stats: priceStats(item, toMine) }))
    .filter(({ stats }) => stats && stats.changeFromAvg !== null && Math.abs(stats.changeFromAvg) >= threshold)
    .map((x) => ({ ...x, change: x.stats.changeFromAvg }));
  return {
    up: moved.filter((x) => x.change > 0).sort((a, b) => b.change - a.change),
    down: moved.filter((x) => x.change < 0).sort((a, b) => a.change - b.change),
  };
}

/** The shops the household has bought at, most recent first. */
export function knownStores(items) {
  const by = new Map();
  for (const item of items) {
    for (const p of item.purchases || []) {
      const store = cleanStore(p.store);
      if (!store) continue;
      const k = storeKey(store);
      const s = by.get(k) || { store, last: '', count: 0 };
      s.count += 1;
      if (String(p.date) >= s.last) { s.last = String(p.date); s.store = store; }
      by.set(k, s);
    }
  }
  return [...by.values()].sort((a, b) => b.last.localeCompare(a.last) || b.count - a.count).map((s) => s.store);
}

/** One purchase's price (and shop) filled in by hand: the changes for the item. */
export function purchasePriceChanges(item, purchaseId, { price, currency, store }) {
  return {
    purchases: (item.purchases || []).map((p) => (p.id !== purchaseId ? p : {
      ...p,
      price: typeof price === 'number' && price > 0 ? price : null,
      currency: typeof price === 'number' && price > 0 ? currency || null : null,
      ...(store !== undefined && { store: cleanStore(store) }),
    })),
  };
}

// ---- receipts: the expense it may already be ----

/**
 * The expense already logged for this receipt, if there seems to be one (a card or Apple Pay payment that
 * came in on its own): the same amount, give or take a little, within two days of the receipt's date.
 * `convert(amount, from)` brings another currency into the receipt's (null when it cannot). Closest day first.
 */
export function findLoggedExpense(transactions, { total, currency, date }, convert = () => null) {
  if (!(total > 0) || !date) return null;
  const near = Math.max(0.05, total * 0.01);
  let best = null;
  for (const tx of transactions || []) {
    if (tx.type !== 'Expense' || !tx.date) continue;
    const days = Math.abs(daysBetween(String(tx.date).slice(0, 10), date));
    if (days > 2) continue;
    const amount = !tx.currency || tx.currency === currency ? tx.amount : convert(tx.amount, tx.currency);
    // Another currency is only roughly the same after conversion
    const slack = !tx.currency || tx.currency === currency ? near : Math.max(near, total * 0.03);
    if (typeof amount !== 'number' || Math.abs(amount - total) > slack) continue;
    if (!best || days < best.days) best = { tx, days };
  }
  return best?.tx || null;
}

/** A receipt line's quantity as kept on a purchase: "3", "1.25 kg". Null when it was one of something. */
export function receiptQty(line) {
  if (!line?.qty || (line.qty === 1 && !line.unit)) return null;
  return line.unit ? `${line.qty} ${line.unit}` : String(line.qty);
}

/** The purchase of an item a receipt from `date` is about: that day's, or the nearest within three days. -1 if none. */
export function purchaseNear(item, date) {
  let at = -1;
  let best = 4;
  (item.purchases || []).forEach((p, i) => {
    const d = p.date ? Math.abs(daysBetween(p.date, date)) : 99;
    if (d < best || (d === best && at >= 0)) { best = d; at = i; }
  });
  return at;
}

/** The unit a purchase's price is for, from its quantity: 'kg', 'g', 'l', 'ml', or null for "each". */
export const unitOf = (qty) => String(qty || '').trim().match(/\b(kg|g|l|ml)$/i)?.[1]?.toLowerCase() || null;

/** A receipt line's quantity as people say it: "3", "1.25 kg". Null when it was one of something. */
export function lineQty(line, loc) {
  if (!line?.qty) return null;
  if (line.qty === 1 && !line.unit) return null;
  const n = new Intl.NumberFormat(loc, { maximumFractionDigits: 3 }).format(line.qty);
  return line.unit ? `${n} ${line.unit}` : n;
}
