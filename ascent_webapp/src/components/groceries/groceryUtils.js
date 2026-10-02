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
const dayOf = (value) => (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : value ? localDay(new Date(value)) : null);

export const LEVEL_VALUE = { full: 1, half: 0.5, low: 0.2, out: 0 };
const LOW_SHARE = 0.25;
const LOW_DAYS = 2;
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
  else if (share !== null) status = share <= 0 ? 'out' : share <= LOW_SHARE || (daysLeft !== null && daysLeft <= LOW_DAYS) ? 'low' : 'ok';

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
    .filter((i) => !i.onList && isTracked(i))
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
 * It was bought: off the list, a purchase recorded (with the receipt price when there is one), and any
 * level set by hand cleared so it counts as full from today.
 */
export function boughtChanges(item, { date = localDay(), by = '', price = null, currency = null } = {}) {
  const purchase = { id: randomId(), date, qty: item.qty || '', price: price ?? null, currency: price != null ? currency : null, by };
  return {
    ...unlistChanges(),
    level: null,
    levelAt: null,
    purchases: [...(item.purchases || []), purchase].slice(-MAX_PURCHASES),
  };
}

/** Setting the level by hand ("we're low on rice"). */
export const levelChanges = (level) => ({ level, levelAt: level ? new Date().toISOString() : null });

/** The last price paid, as { price, currency, date }, or null. */
export function lastPrice(item) {
  const priced = (item.purchases || []).filter((p) => typeof p.price === 'number');
  const p = priced.at(-1);
  return p ? { price: p.price, currency: p.currency, date: p.date } : null;
}

/**
 * The staples worth asking about ("running out?"): tracked, not on the list, and close to empty by the
 * estimate, unless someone already answered for this stretch. Emptiest first.
 */
export function checkQueue(items, today = localDay()) {
  return items
    .filter((i) => !i.onList && isTracked(i))
    .map((item) => ({ item, supply: supplyOf(item, today) }))
    .filter(({ item, supply }) => {
      if (supply.share === null) return false;
      // An answer by hand counts until the estimate says it should be checked again
      if (supply.manual && item.level !== 'out' && supply.share > 0.3) return false;
      return supply.share <= 0.3 || (supply.daysLeft !== null && supply.daysLeft <= 2);
    })
    .sort((a, b) => a.supply.share - b.supply.share);
}

/** "Still have it": it lasts longer than guessed, so it counts as half full from now. */
export const haveItChanges = () => levelChanges('half');

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
