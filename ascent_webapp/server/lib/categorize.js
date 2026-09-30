import { categoryTranslations } from './categoryTranslations.js';
import { merchantKey as toMerchantKey } from './ingest/text.js';

// Words that point at a default category, in English, Hebrew and Russian. Matching is on
// the description only, so nothing leaves the device.
const KEYWORDS = {
  groceries: [
    'supermarket', 'grocery', 'groceries', 'shufersal', 'rami levy', 'victory', 'yochananof', 'tiv taam', 'carrefour', 'walmart', 'aldi', 'lidl', 'costco', 'supermarket', 'minimarket',
    'סופר', 'שופרסל', 'רמי לוי', 'ויקטורי', 'יוחננוף', 'טיב טעם', 'מכולת', 'מינימרקט', 'ירקות', 'פירות', 'מאפייה', 'אושר עד',
    'продукт', 'супермаркет', 'пятёрочка', 'пятерочка', 'перекрёсток', 'магнит', 'овощи', 'фрукты',
  ],
  food_dining: [
    'restaurant', 'cafe', 'coffee', 'pizza', 'burger', 'sushi', 'lunch', 'dinner', 'breakfast', 'mcdonald', 'starbucks', 'wolt', 'uber eats', 'ubereats', 'deliveroo', 'falafel', 'shawarma', 'bakery', 'takeaway', 'takeout', 'pub', 'brunch', 'ice cream', 'dessert',
    'מסעדה', 'קפה', 'ארומה', 'פיצה', 'המבורגר', 'סושי', 'ארוחה', 'וולט', 'תן ביס', 'שווארמה', 'פלאפל', 'גלידה', 'בורגר', 'מקדונלד', 'קונדיטוריה', 'ארוחת',
    'ресторан', 'кафе', 'кофе', 'пицца', 'обед', 'ужин', 'завтрак', 'доставка еды', 'бургер', 'суши', 'мороженое', 'столовая',
  ],
  transportation: [
    'uber', 'taxi', 'gett', 'bus', 'train', 'fuel', 'petrol', 'gasoline', 'parking', 'toll', 'rav kav', 'ravkav', 'bolt', 'metro', 'sonol', 'delek', 'paz ', 'dor alon', 'highway 6', 'car wash', 'pango', 'cellopark', 'car repair', 'mechanic',
    'דלק', 'פז', 'סונול', 'חניה', 'רב קו', 'רב-קו', 'מונית', 'גט', 'אוטובוס', 'רכבת', 'כביש 6', 'פנגו', 'סלופארק', 'מוסך', 'טסט', 'רישוי', 'תחבורה',
    'бензин', 'такси', 'парковка', 'метро', 'автобус', 'проезд', 'заправка', 'электричка', 'мойка', 'автосервис',
  ],
  utilities: [
    'electric', 'electricity', 'water bill', 'internet', 'phone bill', 'cellcom', 'partner', 'pelephone', 'bezeq', 'arnona', 'gas bill', 'utility', 'utilities', 'wifi', 'cellular',
    'חשמל', 'ארנונה', 'אינטרנט', 'סלקום', 'פרטנר', 'פלאפון', 'בזק', 'הוט', 'חברת החשמל', 'תאגיד מים', 'חשבון מים', 'גז', 'סלולר', 'ועד בית',
    'электричество', 'коммунал', 'интернет', 'газ ', 'водоснабжение', 'мобильная связь', 'связь',
  ],
  rent_housing: [
    'rent', 'mortgage', 'landlord', 'hoa', 'apartment', 'repairs', 'plumber', 'furniture',
    'שכירות', 'שכר דירה', 'משכנתא', 'משכנתה', 'דירה', 'אינסטלטור', 'תיקון בית',
    'аренда', 'ипотека', 'квартплата', 'съём', 'съем', 'ремонт',
  ],
  healthcare: [
    'pharmacy', 'doctor', 'dentist', 'clinic', 'hospital', 'super-pharm', 'superpharm', 'super pharm', 'medical', 'medicine', 'therapy', 'physio', 'optician', 'glasses', 'lab test',
    'רופא', 'בית מרקחת', 'סופר פארם', 'סופרפארם', 'מרפאה', 'קופת חולים', 'שיניים', 'תרופות', 'כללית', 'מכבי', 'מאוחדת', 'לאומית', 'פיזיותרפיה', 'משקפיים', 'טיפול', 'בדיקת דם', 'פסיכולוג',
    'аптека', 'врач', 'стоматолог', 'клиника', 'лекарств', 'больница', 'анализы', 'массаж', 'очки', 'психолог',
  ],
  entertainment: [
    'cinema', 'movie', 'concert', 'theater', 'theatre', 'game', 'steam', 'bowling', 'club', 'ticket', 'museum', 'festival', 'party', 'escape room', 'amusement',
    'קולנוע', 'סרט', 'הצגה', 'הופעה', 'בילוי', 'משחק', 'באולינג', 'מוזיאון', 'פסטיבל', 'מסיבה', 'כרטיסים', 'סינמה', 'יס פלנט',
    'кино', 'театр', 'концерт', 'игра', 'развлеч', 'музей', 'билеты на', 'фестиваль', 'вечеринка',
  ],
  shopping: [
    'amazon', 'aliexpress', 'zara', 'h&m', 'ikea', 'clothes', 'clothing', 'shoes', 'mall', 'castro', 'fox', 'ksp', 'ivory', 'shein', 'ebay', 'electronics', 'laptop', 'phone case', 'store', 'shopping',
    'בגדים', 'נעליים', 'קניון', 'איקאה', 'קסטרו', 'פוקס', 'שיין', 'עלי אקספרס', 'אמזון', 'חולצה', 'מכנסיים', 'אלקטרוניקה', 'קניות', 'רשת', 'זארה',
    'одежда', 'обувь', 'торговый центр', 'покупк', 'электроника', 'алиэкспресс', 'магазин',
  ],
  insurance: [
    'insurance', 'harel', 'migdal', 'clal', 'phoenix', 'menora', 'policy',
    'ביטוח', 'הראל', 'מגדל', 'כלל', 'הפניקס', 'מנורה', 'פוליסה',
    'страхов', 'полис',
  ],
  education: [
    'school', 'tuition', 'course', 'university', 'college', 'udemy', 'books', 'kindergarten', 'daycare', 'lesson', 'tutor', 'coursera', 'textbook', 'exam',
    'לימודים', 'קורס', 'אוניברסיטה', 'גן ', 'צהרון', 'בית ספר', 'ספרים', 'שכר לימוד', 'חוג', 'שיעור', 'מורה פרטי', 'מכללה', 'בגרות',
    'школа', 'курс', 'университет', 'обучение', 'детский сад', 'книг', 'репетитор', 'урок', 'кружок',
  ],
  personal_care: [
    'haircut', 'barber', 'salon', 'spa', 'nails', 'cosmetics', 'gym', 'fitness', 'yoga', 'pilates', 'massage', 'beauty', 'manicure', 'perfume',
    'מספרה', 'תספורת', 'קוסמטיקה', 'ספא', 'ציפורניים', 'חדר כושר', 'מכון כושר', 'יוגה', 'פילאטיס', 'קוסמטיקאית', 'מניקור', 'בושם', 'ספורט',
    'парикмахер', 'стрижка', 'салон', 'маникюр', 'спортзал', 'фитнес', 'йога', 'косметик', 'парфюм',
  ],
  subscriptions: [
    'netflix', 'spotify', 'youtube', 'disney', 'icloud', 'google one', 'prime', 'chatgpt', 'openai', 'subscription', 'hbo', 'adobe', 'apple music', 'dropbox', 'membership', 'patreon', 'notion',
    'מנוי', 'נטפליקס', 'ספוטיפיי', 'דיסני', 'יוטיוב', 'אפל', 'חברות',
    'подписк', 'нетфликс', 'спотифай', 'ютуб', 'членство',
  ],
  travel: [
    'flight', 'hotel', 'airbnb', 'booking', 'airline', 'el al', 'ryanair', 'vacation', 'trip', 'hostel', 'visa fee', 'airport', 'luggage', 'holiday', 'cruise', 'car rental',
    'טיסה', 'מלון', 'אל על', 'חופשה', 'בוקינג', 'איירביאנבי', 'נמל תעופה', 'צימר', 'טיול', 'נסיעה לחו', 'השכרת רכב', 'ישראייר', 'ארקיע',
    'авиа', 'отель', 'отпуск', 'путешеств', 'аэропорт', 'гостиница', 'перелёт', 'перелет', 'тур ', 'виза',
  ],
  gifts: [
    'gift', 'present', 'birthday', 'flowers', 'wedding', 'bouquet', 'anniversary', 'donation', 'charity',
    'מתנה', 'יום הולדת', 'פרחים', 'חתונה', 'זר ', 'נדבה', 'תרומה', 'אירוע',
    'подарок', 'день рождения', 'цветы', 'свадьб', 'букет', 'пожертвование', 'благотвор',
  ],
  taxes: [
    'tax', 'irs', 'vat', 'municipal', 'fine', 'penalty', 'national insurance',
    'מס הכנסה', 'ביטוח לאומי', 'מע"מ', 'מיסים', 'מס ', 'קנס', 'דוח', 'אגרה',
    'налог', 'штраф', 'пошлина',
  ],
};

const INCOME_KEYWORDS = {
  salary: ['salary', 'payroll', 'paycheck', 'wage', 'bonus', 'משכורת', 'שכר', 'תלוש', 'בונוס', 'зарплата', 'оклад', 'премия', 'аванс'],
  freelance: ['freelance', 'invoice', 'client', 'project', 'gig', 'consulting', 'פרילנס', 'חשבונית', 'לקוח', 'פרויקט', 'ייעוץ', 'фриланс', 'заказ', 'клиент', 'консультац'],
  investments: ['dividend', 'interest', 'stock', 'etf', 'crypto', 'capital gain', 'bond', 'דיבידנד', 'ריבית', 'מניות', 'קרן', 'קריפטו', 'дивиденд', 'проценты', 'акции', 'облигаци'],
  rental_income: ['tenant', 'rent received', 'rental income', 'שוכר', 'דמי שכירות', 'הכנסה משכירות', 'арендатор', 'сдача квартиры', 'доход от аренды'],
  refunds: ['refund', 'return', 'cashback', 'cash back', 'reimbursement', 'reimburse', 'החזר', 'זיכוי', 'ביטול', 'кэшбэк', 'кешбэк', 'возврат', 'компенсаци'],
  gifts_received: ['gift', 'present', 'birthday', 'מתנה', 'יום הולדת', 'подарок', 'день рождения'],
};

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .replace(/[֑-ׇ]/g, '') // Hebrew niqqud
    .replace(/[_\-–—./\\,;:!?()[\]{}"'`~@#$%^&*+=|<>]+/g, ' ')
    .replace(/\d+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const isLatin = (s) => /^[\x00-\x7f]+$/.test(s);

function hasKeyword(text, keyword) {
  const k = keyword.toLowerCase();
  const padded = ` ${text} `;
  if (isLatin(k)) {
    // Latin words match from a word start: "cafe" matches "cafe latte" and "cafeteria"
    return new RegExp(`(^|[^a-z0-9])${k.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(padded);
  }
  return padded.includes(k.trim()) || text.includes(k.trim());
}

/** The default category key a category name stands for, if any ('Groceries' -> 'groceries'). */
function canonicalKey(name) {
  if (categoryTranslations[name]) return name;
  const lower = String(name || '').toLowerCase();
  for (const [key, tr] of Object.entries(categoryTranslations)) {
    if (Object.values(tr).some(v => String(v).toLowerCase() === lower)) return key;
  }
  return null;
}

function categoryWords(category) {
  const words = new Set([norm(category.name)]);
  const key = canonicalKey(category.nameKey || category.name);
  if (key) Object.values(categoryTranslations[key]).forEach(v => words.add(norm(v)));
  return [...words].filter(w => w.length >= 3);
}

/**
 * Score history: the category the user has already used for similar descriptions.
 * Exact repeat > one contains the other > shared meaningful words.
 */
function fromHistory(text, type, categories, history) {
  const words = text.split(' ').filter(w => w.length >= 3);
  const votes = new Map();
  let seen = 0;
  for (const tx of history) {
    if (tx.type !== type || !tx.description) continue;
    const d = norm(tx.description);
    if (!d || d.length < 3) continue;
    let score = 0;
    if (d === text) score = 4;
    else if (text.length >= 4 && (d.includes(text) || text.includes(d))) score = 3;
    else {
      const shared = words.filter(w => d.split(' ').includes(w)).length;
      if (shared >= 1 && words.length && shared >= Math.min(2, words.length)) score = shared;
    }
    if (!score) continue;
    // Newer transactions (the list is newest first) count slightly more
    score *= 1 + Math.max(0, 1 - seen / 200) * 0.25;
    seen += 1;
    votes.set(tx.category, (votes.get(tx.category) || 0) + score);
  }
  let best = null;
  for (const [name, score] of votes) {
    if (!categories.some(c => c.name === name)) continue; // deleted or wrong type
    if (!best || score > best.score) best = { name, score };
  }
  return best && best.score >= 2 ? best.name : null;
}

function fromKeywords(text, type, categories) {
  // A category named in the description wins ("pets food" -> a custom "Pets" category)
  for (const c of categories) {
    if (categoryWords(c).some(w => hasKeyword(text, w))) return c.name;
  }
  const table = type === 'Income' ? INCOME_KEYWORDS : KEYWORDS;
  const byKey = new Map();
  categories.forEach(c => {
    const k = canonicalKey(c.nameKey || c.name);
    if (k && !byKey.has(k)) byKey.set(k, c.name);
  });
  let best = null;
  for (const [key, list] of Object.entries(table)) {
    if (!byKey.has(key)) continue;
    let hits = 0;
    for (const kw of list) if (hasKeyword(text, kw)) hits += kw.length >= 5 ? 2 : 1;
    if (hits && (!best || hits > best.hits)) best = { name: byKey.get(key), hits };
  }
  return best?.name || null;
}

/**
 * Work out which category a transaction belongs to from its description.
 * `rules` are the workspace's learned merchant rules (see merchantRules.js), `history` is the user's
 * earlier transactions (newest first), `categories` are the ones they can pick from.
 * A rule for this exact merchant wins, then history, then keywords.
 * Returns { name, source: 'rule' | 'history' | 'keywords' } or null.
 */
export function suggestCategory({ description, merchantKey, type = 'Expense', categories = [], history = [], rules = [] }) {
  const usable = categories.filter(c => c.type === type || c.type === 'Both');
  if (!usable.length) return null;
  const key = merchantKey || toMerchantKey(description || '');
  const rule = key && rules.find(r => r.merchantKey === key && (r.type || 'Expense') === type && usable.some(c => c.name === r.category));
  if (rule) return { name: rule.category, source: 'rule' };
  const text = norm(description);
  if (text.length < 3) return null;
  const fromPast = fromHistory(text, type, usable, history);
  if (fromPast) return { name: fromPast, source: 'history' };
  const fromWords = fromKeywords(text, type, usable);
  return fromWords ? { name: fromWords, source: 'keywords' } : null;
}
