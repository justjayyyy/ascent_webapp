import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found');
  process.exit(1);
}

const noteSchema = new mongoose.Schema({
  title: String,
  content: String,
  color: String,
  isPinned: Boolean,
  tags: [String],
  created_by: String,
}, { timestamps: { createdAt: 'created_date', updatedAt: 'updated_date' } });

const Note = mongoose.models.Note || mongoose.model('Note', noteSchema);

const demoNotes = [
  // English demo user notes
  {
    title: 'Investment Ideas',
    content: `📈 Research these stocks:
- AAPL - Apple Inc
- MSFT - Microsoft
- GOOGL - Alphabet
- AMZN - Amazon

Consider ETFs:
- VTI - Total Stock Market
- VGT - Tech Sector
- SCHD - Dividend Growth`,
    color: '#3B82F6',
    isPinned: true,
    tags: ['investing', 'research', 'stocks'],
    created_by: 'demo@ascent.com'
  },
  {
    title: 'Monthly Budget Goals',
    content: `💰 December 2024 Budget:

Housing: $1,500 (30%)
Food: $600 (12%)
Transportation: $400 (8%)
Utilities: $200 (4%)
Savings: $1,000 (20%)
Entertainment: $300 (6%)
Other: $1,000 (20%)

Total: $5,000`,
    color: '#5C8374',
    isPinned: true,
    tags: ['budget', 'monthly', 'planning'],
    created_by: 'demo@ascent.com'
  },
  {
    title: 'Tax Deductions to Remember',
    content: `📋 Tax Season Checklist:

✅ Mortgage interest
✅ Property taxes
✅ Charitable donations
✅ Medical expenses
✅ Home office deduction
✅ Student loan interest
✅ IRA contributions
✅ 401(k) contributions

Deadline: April 15th`,
    color: '#F59E0B',
    isPinned: false,
    tags: ['taxes', 'deductions', 'annual'],
    created_by: 'demo@ascent.com'
  },
  {
    title: 'Emergency Fund Plan',
    content: `🚨 Emergency Fund Goal: $15,000

Current: $8,500
Remaining: $6,500

Monthly contribution: $500
ETA: 13 months

Keep in high-yield savings account
Current APY: 4.5%`,
    color: '#EF4444',
    isPinned: false,
    tags: ['savings', 'emergency', 'goals'],
    created_by: 'demo@ascent.com'
  },
  {
    title: 'Retirement Planning Notes',
    content: `🎯 Retirement Goals:

Target retirement age: 60
Current age: 35
Years to retirement: 25

401(k) contribution: $23,000/year
IRA contribution: $7,000/year
Total annual: $30,000

Projected at 7% return:
~$2M by retirement`,
    color: '#8B5CF6',
    isPinned: false,
    tags: ['retirement', 'long-term', 'planning'],
    created_by: 'demo@ascent.com'
  },
  {
    title: 'Credit Card Strategy',
    content: `💳 Credit Card Optimization:

Primary (2% cashback):
- Everyday purchases
- Groceries
- Gas

Travel Card (3x points):
- Flights
- Hotels
- Dining

Always pay in full!
Never carry a balance.`,
    color: '#EC4899',
    isPinned: false,
    tags: ['credit', 'cashback', 'strategy'],
    created_by: 'demo@ascent.com'
  },

  // Hebrew demo user notes
  {
    title: 'רעיונות להשקעה',
    content: `📈 לחקור מניות אלו:
- TEVA - טבע
- NICE - נייס
- LUMI - לאומי
- POLI - פועלים

קרנות נאמנות:
- קרן מחקה ת"א 125
- קרן אג"ח ממשלתי
- קרן מניות ארה"ב`,
    color: '#3B82F6',
    isPinned: true,
    tags: ['השקעות', 'מחקר', 'מניות'],
    created_by: 'demo-he@ascent.com'
  },
  {
    title: 'יעדי תקציב חודשי',
    content: `💰 תקציב דצמבר 2024:

דיור: ₪5,000 (30%)
אוכל: ₪2,000 (12%)
תחבורה: ₪1,500 (9%)
חשמל ומים: ₪600 (4%)
חיסכון: ₪3,500 (21%)
בילויים: ₪1,000 (6%)
אחר: ₪3,000 (18%)

סה"כ: ₪16,600`,
    color: '#5C8374',
    isPinned: true,
    tags: ['תקציב', 'חודשי', 'תכנון'],
    created_by: 'demo-he@ascent.com'
  },
  {
    title: 'ניכויי מס לזכור',
    content: `📋 רשימת בדיקה למס:

✅ ריבית משכנתא
✅ קרן השתלמות
✅ קרן פנסיה
✅ ביטוח חיים
✅ תרומות
✅ הוצאות רפואיות

מועד הגשה: אפריל`,
    color: '#F59E0B',
    isPinned: false,
    tags: ['מיסים', 'ניכויים', 'שנתי'],
    created_by: 'demo-he@ascent.com'
  },
  {
    title: 'תוכנית קרן חירום',
    content: `🚨 יעד קרן חירום: ₪50,000

נוכחי: ₪30,000
נותר: ₪20,000

הפקדה חודשית: ₪2,000
זמן משוער: 10 חודשים

לשמור בחשבון חיסכון
ריבית נוכחית: 4%`,
    color: '#EF4444',
    isPinned: false,
    tags: ['חיסכון', 'חירום', 'יעדים'],
    created_by: 'demo-he@ascent.com'
  },
  {
    title: 'תכנון פרישה',
    content: `🎯 יעדי פרישה:

גיל פרישה מתוכנן: 67
גיל נוכחי: 35
שנים לפרישה: 32

הפקדה לפנסיה: ₪2,000/חודש
קרן השתלמות: ₪1,500/חודש
סה"כ שנתי: ₪42,000

צפי בתשואה של 5%:
~₪3 מיליון בפרישה`,
    color: '#8B5CF6',
    isPinned: false,
    tags: ['פרישה', 'ארוך-טווח', 'תכנון'],
    created_by: 'demo-he@ascent.com'
  }
];

async function seedNotes() {
  console.log('Connecting to MongoDB...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Check existing notes for each user
    for (const email of ['demo@ascent.com', 'demo-he@ascent.com']) {
      const existingCount = await Note.countDocuments({ created_by: email });
      console.log(`\n${email}: ${existingCount} existing notes`);
      
      const notesToAdd = demoNotes.filter(n => n.created_by === email);
      
      if (existingCount < 3) {
        // Add all demo notes for this user
        await Note.insertMany(notesToAdd);
        console.log(`  ✓ Added ${notesToAdd.length} demo notes`);
      } else {
        console.log(`  → Skipping (already has notes)`);
      }
    }

    console.log('\n✅ Demo notes seeding complete!');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

seedNotes();

