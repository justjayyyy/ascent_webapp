import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;

// Hebrew test user credentials
const TEST_USER = {
  email: 'demo-he@ascent.com',
  password: 'Demo123!',
  full_name: 'משתמש דמו',
};

async function seedHebrewTestData() {
  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;

  // Clean up existing test data
  console.log('🧹 Cleaning up existing test data...');
  await db.collection('users').deleteMany({ email: TEST_USER.email });
  await db.collection('accounts').deleteMany({ created_by: TEST_USER.email });
  await db.collection('positions').deleteMany({ created_by: TEST_USER.email });
  await db.collection('expensetransactions').deleteMany({ created_by: TEST_USER.email });
  await db.collection('categories').deleteMany({ created_by: TEST_USER.email });
  await db.collection('cards').deleteMany({ created_by: TEST_USER.email });
  await db.collection('financialgoals').deleteMany({ created_by: TEST_USER.email });
  await db.collection('dashboardwidgets').deleteMany({ created_by: TEST_USER.email });
  await db.collection('budgets').deleteMany({ created_by: TEST_USER.email });
  console.log('✅ Cleaned up!\n');

  // Create user with Hebrew language preference
  console.log('👤 Creating Hebrew test user...');
  const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);
  const userResult = await db.collection('users').insertOne({
    email: TEST_USER.email,
    password: hashedPassword,
    full_name: TEST_USER.full_name,
    language: 'he', // Hebrew language
    currency: 'ILS', // Israeli Shekel
    theme: 'dark',
    blurValues: false,
    created_date: new Date(),
    updated_date: new Date(),
  });
  console.log(`✅ Created user: ${TEST_USER.email} / ${TEST_USER.password}\n`);

  // Create accounts with Hebrew names
  console.log('🏦 Creating accounts...');
  const accounts = [
    { name: 'קופת גמל מגדל', type: 'Retirement', institution: 'מגדל', currency: 'ILS' },
    { name: 'תיק השקעות בנק הפועלים', type: 'Investment', institution: 'בנק הפועלים', currency: 'ILS' },
    { name: 'חשבון חיסכון לאומי', type: 'Savings', institution: 'בנק לאומי', currency: 'ILS' },
    { name: 'קרן פנסיה הראל', type: 'Retirement', institution: 'הראל', currency: 'ILS' },
  ];

  const accountIds = [];
  for (const acc of accounts) {
    const result = await db.collection('accounts').insertOne({
      ...acc,
      created_by: TEST_USER.email,
      created_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000),
      updated_date: new Date(),
    });
    accountIds.push({ id: result.insertedId.toString(), name: acc.name, type: acc.type });
    console.log(`  ✅ ${acc.name}`);
  }
  console.log('');

  // Create positions with Israeli and international stocks
  console.log('📈 Creating positions...');
  const positions = [
    // קופת גמל מגדל
    { accountId: accountIds[0].id, symbol: 'TEVA', name: 'טבע תעשיות פרמצבטיות', assetType: 'Stock', quantity: 500, averageBuyPrice: 35, currentPrice: 52 },
    { accountId: accountIds[0].id, symbol: 'NICE', name: 'נייס מערכות', assetType: 'Stock', quantity: 100, averageBuyPrice: 180, currentPrice: 210 },
    { accountId: accountIds[0].id, symbol: 'CHKP', name: 'צ\'ק פוינט', assetType: 'Stock', quantity: 80, averageBuyPrice: 120, currentPrice: 155 },
    
    // תיק השקעות בנק הפועלים
    { accountId: accountIds[1].id, symbol: 'TA125', name: 'תעודת סל תא 125', assetType: 'ETF', quantity: 200, averageBuyPrice: 450, currentPrice: 520 },
    { accountId: accountIds[1].id, symbol: 'AAPL', name: 'אפל', assetType: 'Stock', quantity: 30, averageBuyPrice: 150, currentPrice: 195 },
    { accountId: accountIds[1].id, symbol: 'MSFT', name: 'מיקרוסופט', assetType: 'Stock', quantity: 25, averageBuyPrice: 280, currentPrice: 430 },
    
    // חשבון חיסכון לאומי (Cash)
    { accountId: accountIds[2].id, symbol: 'ILS', name: 'שקלים', assetType: 'Cash', quantity: 75000, averageBuyPrice: 1, currentPrice: 1 },
    
    // קרן פנסיה הראל
    { accountId: accountIds[3].id, symbol: 'BONDS', name: 'אג"ח ממשלתי', assetType: 'Bond', quantity: 100, averageBuyPrice: 1000, currentPrice: 1020 },
    { accountId: accountIds[3].id, symbol: 'INTL', name: 'מניות בינלאומיות', assetType: 'ETF', quantity: 150, averageBuyPrice: 200, currentPrice: 235 },
  ];

  for (const pos of positions) {
    await db.collection('positions').insertOne({
      ...pos,
      created_by: TEST_USER.email,
      created_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${pos.symbol} - ${pos.quantity} יחידות @ ₪${pos.currentPrice}`);
  }
  console.log('');

  // Create categories (will use translated names in UI)
  console.log('🏷️ Creating categories...');
  const categories = [
    { name: 'Food & Dining', type: 'Expense', icon: '🍽️', color: '#FF6347' },
    { name: 'Groceries', type: 'Expense', icon: '🛒', color: '#3CB371' },
    { name: 'Transportation', type: 'Expense', icon: '🚗', color: '#4682B4' },
    { name: 'Utilities', type: 'Expense', icon: '💡', color: '#FFD700' },
    { name: 'Rent & Housing', type: 'Expense', icon: '🏠', color: '#8A2BE2' },
    { name: 'Entertainment', type: 'Expense', icon: '🎬', color: '#FF4500' },
    { name: 'Shopping', type: 'Expense', icon: '🛍️', color: '#DA70D6' },
    { name: 'Healthcare', type: 'Expense', icon: '🏥', color: '#DC143C' },
    { name: 'Salary', type: 'Income', icon: '💰', color: '#32CD32' },
    { name: 'Freelance', type: 'Income', icon: '💻', color: '#FFD700' },
    { name: 'Investment Income', type: 'Income', icon: '📈', color: '#008000' },
  ];

  const categoryIds = {};
  for (const cat of categories) {
    const result = await db.collection('categories').insertOne({
      ...cat,
      isDefault: true,
      created_by: TEST_USER.email,
      created_date: new Date(),
      updated_date: new Date(),
    });
    categoryIds[cat.name] = result.insertedId.toString();
  }
  console.log(`  ✅ נוצרו ${categories.length} קטגוריות\n`);

  // Create cards with Hebrew names
  console.log('💳 Creating cards...');
  const cards = [
    { name: 'ויזה כאל זהב', type: 'credit', last4: '1234', network: 'Visa' },
    { name: 'מסטרקארד לאומי', type: 'credit', last4: '5678', network: 'Mastercard' },
    { name: 'דביט פועלים', type: 'debit', last4: '9012', network: 'Visa' },
  ];

  const cardIds = [];
  for (const card of cards) {
    const result = await db.collection('cards').insertOne({
      ...card,
      created_by: TEST_USER.email,
      created_date: new Date(),
      updated_date: new Date(),
    });
    cardIds.push(result.insertedId.toString());
    console.log(`  ✅ ${card.name} (****${card.last4})`);
  }
  console.log('');

  // Create transactions with Hebrew descriptions (last 90 days)
  console.log('💸 Creating transactions...');
  const transactionTemplates = [
    { description: 'סופרמרקט רמי לוי', category: 'Groceries', type: 'expense', minAmount: 200, maxAmount: 800 },
    { description: 'נטפליקס', category: 'Entertainment', type: 'expense', minAmount: 50, maxAmount: 60 },
    { description: 'דלק פז', category: 'Transportation', type: 'expense', minAmount: 150, maxAmount: 400 },
    { description: 'חשבון חשמל', category: 'Utilities', type: 'expense', minAmount: 300, maxAmount: 600 },
    { description: 'שכירות דירה', category: 'Rent & Housing', type: 'expense', minAmount: 5000, maxAmount: 5000 },
    { description: 'מסעדת שייקס', category: 'Food & Dining', type: 'expense', minAmount: 100, maxAmount: 350 },
    { description: 'קניון עזריאלי', category: 'Shopping', type: 'expense', minAmount: 100, maxAmount: 500 },
    { description: 'קופת חולים מכבי', category: 'Healthcare', type: 'expense', minAmount: 50, maxAmount: 300 },
    { description: 'משכורת חודשית', category: 'Salary', type: 'income', minAmount: 18000, maxAmount: 18000 },
    { description: 'פרויקט פרילנס', category: 'Freelance', type: 'income', minAmount: 2000, maxAmount: 5000 },
    { description: 'דיבידנד מהשקעות', category: 'Investment Income', type: 'income', minAmount: 500, maxAmount: 2000 },
  ];

  let transactionCount = 0;
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    
    const numTransactions = Math.floor(Math.random() * 5);
    
    for (let i = 0; i < numTransactions; i++) {
      const template = transactionTemplates[Math.floor(Math.random() * transactionTemplates.length)];
      const amount = Math.floor(Math.random() * (template.maxAmount - template.minAmount + 1)) + template.minAmount;
      
      await db.collection('expensetransactions').insertOne({
        description: template.description,
        amount: amount,
        type: template.type,
        category: categoryIds[template.category],
        categoryName: template.category,
        date: date.toISOString().split('T')[0],
        paymentMethod: Math.random() > 0.5 ? 'card' : 'cash',
        cardId: Math.random() > 0.5 ? cardIds[Math.floor(Math.random() * cardIds.length)] : null,
        created_by: TEST_USER.email,
        created_date: date,
        updated_date: date,
      });
      transactionCount++;
    }
    
    // Monthly salary on 10th
    if (date.getDate() === 10) {
      await db.collection('expensetransactions').insertOne({
        description: 'משכורת חודשית',
        amount: 18000,
        type: 'income',
        category: categoryIds['Salary'],
        categoryName: 'Salary',
        date: date.toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        created_by: TEST_USER.email,
        created_date: date,
        updated_date: date,
      });
      transactionCount++;
    }
    
    // Rent on 1st
    if (date.getDate() === 1) {
      await db.collection('expensetransactions').insertOne({
        description: 'שכירות דירה',
        amount: 5000,
        type: 'expense',
        category: categoryIds['Rent & Housing'],
        categoryName: 'Rent & Housing',
        date: date.toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        created_by: TEST_USER.email,
        created_date: date,
        updated_date: date,
      });
      transactionCount++;
    }
  }
  console.log(`  ✅ נוצרו ${transactionCount} עסקאות\n`);

  // Create financial goals with Hebrew names
  console.log('🎯 Creating financial goals...');
  const goals = [
    { name: 'קרן חירום', targetAmount: 100000, currentAmount: 75000, targetDate: '2024-06-01', category: 'Savings' },
    { name: 'חופשה ביפן', targetAmount: 20000, currentAmount: 8000, targetDate: '2024-09-01', category: 'Travel' },
    { name: 'מקדמה לרכב', targetAmount: 50000, currentAmount: 25000, targetDate: '2025-01-01', category: 'Purchase' },
    { name: 'מקדמה לדירה', targetAmount: 500000, currentAmount: 150000, targetDate: '2027-01-01', category: 'Real Estate' },
  ];

  for (const goal of goals) {
    await db.collection('financialgoals').insertOne({
      ...goal,
      created_by: TEST_USER.email,
      created_date: new Date(),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${goal.name}: ₪${goal.currentAmount.toLocaleString()} / ₪${goal.targetAmount.toLocaleString()}`);
  }
  console.log('');

  // Create budgets
  console.log('📊 Creating budgets...');
  const budgets = [
    { category: 'Food & Dining', amount: 2000, period: 'monthly', currency: 'ILS' },
    { category: 'Groceries', amount: 1500, period: 'monthly', currency: 'ILS' },
    { category: 'Transportation', amount: 1000, period: 'monthly', currency: 'ILS' },
    { category: 'Entertainment', amount: 800, period: 'monthly', currency: 'ILS' },
    { category: 'Shopping', amount: 1000, period: 'monthly', currency: 'ILS' },
  ];

  for (const budget of budgets) {
    await db.collection('budgets').insertOne({
      ...budget,
      categoryId: categoryIds[budget.category],
      created_by: TEST_USER.email,
      created_date: new Date(),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${budget.category}: ₪${budget.amount}/חודש`);
  }
  console.log('');

  // Summary
  console.log('═'.repeat(50));
  console.log('🎉 נתוני הבדיקה נוצרו בהצלחה!');
  console.log('═'.repeat(50));
  console.log(`\n📧 התחברות: ${TEST_USER.email}`);
  console.log(`🔑 סיסמה: ${TEST_USER.password}`);
  console.log(`🌐 שפה: עברית`);
  console.log(`💱 מטבע: שקל (ILS)`);
  console.log('\nנתונים שנוצרו:');
  console.log(`  • 1 משתמש`);
  console.log(`  • ${accounts.length} חשבונות`);
  console.log(`  • ${positions.length} פוזיציות`);
  console.log(`  • ${categories.length} קטגוריות`);
  console.log(`  • ${cards.length} כרטיסים`);
  console.log(`  • ${transactionCount} עסקאות`);
  console.log(`  • ${goals.length} יעדים פיננסיים`);
  console.log(`  • ${budgets.length} תקציבים`);
  console.log('\n');

  await mongoose.disconnect();
  console.log('✅ הסתיים!');
}

seedHebrewTestData().catch(err => {
  console.error('❌ שגיאה:', err);
  process.exit(1);
});

