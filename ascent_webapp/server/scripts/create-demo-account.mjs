import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;

// Demo user credentials
const DEMO_USER = {
  email: 'demo@ascent.com',
  password: 'Demo123!',
  full_name: 'Demo User',
  language: 'en',
  currency: 'USD',
  theme: 'dark',
};

async function createDemoAccount() {
  console.log('🚀 Connecting to MongoDB...');
  await mongoose.connect(MONGODB_URI);
  console.log('✅ Connected!\n');

  const db = mongoose.connection.db;

  // Clean up existing demo data
  console.log('🧹 Cleaning up existing demo data...');
  const existingUser = await db.collection('users').findOne({ email: DEMO_USER.email });
  
  if (existingUser) {
    const userId = existingUser._id;
    
    // Delete all workspaces owned by demo user
    const demoWorkspaces = await db.collection('workspaces').find({ ownerId: userId }).toArray();
    const workspaceIds = demoWorkspaces.map(w => w._id);
    
    // Delete all entities in demo workspaces
    if (workspaceIds.length > 0) {
      await db.collection('accounts').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('positions').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('expensetransactions').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('categories').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('cards').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('financialgoals').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('dashboardwidgets').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('budgets').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('notes').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('portfoliosnapshots').deleteMany({ workspaceId: { $in: workspaceIds } });
      await db.collection('workspaces').deleteMany({ ownerId: userId });
    }
    
    // Delete user
    await db.collection('users').deleteOne({ _id: userId });
  }
  console.log('✅ Cleaned up!\n');

  // Create user
  console.log('👤 Creating demo user...');
  const hashedPassword = await bcrypt.hash(DEMO_USER.password, 10);
  const userResult = await db.collection('users').insertOne({
    email: DEMO_USER.email,
    password: hashedPassword,
    full_name: DEMO_USER.full_name,
    language: DEMO_USER.language,
    currency: DEMO_USER.currency,
    theme: DEMO_USER.theme,
    blurValues: false,
    priceAlerts: true,
    dailySummary: true,
    weeklyReports: true,
    emailNotifications: true,
    created_date: new Date(),
    updated_date: new Date(),
  });
  const userId = userResult.insertedId;
  console.log(`✅ Created user: ${DEMO_USER.email} / ${DEMO_USER.password}\n`);

  // Create workspace
  console.log('🏢 Creating workspace...');
  const workspaceResult = await db.collection('workspaces').insertOne({
    name: 'Demo Workspace',
    ownerId: userId,
    members: [{
      userId: userId,
      email: DEMO_USER.email,
      role: 'owner',
      status: 'accepted',
      permissions: {
        viewPortfolio: true,
        editPortfolio: true,
        viewExpenses: true,
        editExpenses: true,
        viewNotes: true,
        editNotes: true,
        viewGoals: true,
        editGoals: true,
        viewBudgets: true,
        editBudgets: true,
        viewSettings: true,
        manageUsers: true
      }
    }],
    created_date: new Date(),
    updated_date: new Date(),
  });
  const workspaceId = workspaceResult.insertedId;
  console.log(`✅ Created workspace: Demo Workspace\n`);

  // Create categories
  console.log('🏷️ Creating categories...');
  const categories = [
    { name: 'food_dining', nameKey: 'food_dining', type: 'Expense', icon: '🍽️', color: '#FF6347' },
    { name: 'groceries', nameKey: 'groceries', type: 'Expense', icon: '🛒', color: '#3CB371' },
    { name: 'transportation', nameKey: 'transportation', type: 'Expense', icon: '🚗', color: '#4682B4' },
    { name: 'utilities', nameKey: 'utilities', type: 'Expense', icon: '💡', color: '#FFD700' },
    { name: 'rent_housing', nameKey: 'rent_housing', type: 'Expense', icon: '🏠', color: '#8A2BE2' },
    { name: 'entertainment', nameKey: 'entertainment', type: 'Expense', icon: '🎬', color: '#FF4500' },
    { name: 'shopping', nameKey: 'shopping', type: 'Expense', icon: '🛍️', color: '#DA70D6' },
    { name: 'healthcare', nameKey: 'healthcare', type: 'Expense', icon: '🏥', color: '#DC143C' },
    { name: 'salary', nameKey: 'salary', type: 'Income', icon: '💰', color: '#32CD32' },
    { name: 'freelance', nameKey: 'freelance', type: 'Income', icon: '💻', color: '#FFD700' },
    { name: 'investments', nameKey: 'investments', type: 'Income', icon: '📈', color: '#008000' },
  ];

  const categoryIds = {};
  for (const cat of categories) {
    const result = await db.collection('categories').insertOne({
      ...cat,
      isDefault: true,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(),
      updated_date: new Date(),
    });
    categoryIds[cat.name] = result.insertedId;
  }
  console.log(`  ✅ Created ${categories.length} categories\n`);

  // Create cards
  console.log('💳 Creating cards...');
  const cards = [
    { name: 'Chase Sapphire', type: 'credit', lastFourDigits: '4242', network: 'visa', color: '#0066CC', isActive: true },
    { name: 'Amex Gold', type: 'credit', lastFourDigits: '1234', network: 'amex', color: '#D4AF37', isActive: true },
    { name: 'Chase Debit', type: 'debit', lastFourDigits: '5678', network: 'visa', color: '#1E88E5', isActive: true },
  ];

  const cardIds = [];
  for (const card of cards) {
    const result = await db.collection('cards').insertOne({
      ...card,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(),
      updated_date: new Date(),
    });
    cardIds.push(result.insertedId);
    console.log(`  ✅ ${card.name} (****${card.lastFourDigits})`);
  }
  console.log('');

  // Create transactions (last 6 months)
  console.log('💸 Creating transactions...');
  const dailyTemplates = [
    { description: 'Whole Foods', category: 'groceries', minAmount: 50, maxAmount: 200, frequency: 0.15 },
    { description: 'Uber Ride', category: 'transportation', minAmount: 15, maxAmount: 45, frequency: 0.1 },
    { description: 'Restaurant Dinner', category: 'food_dining', minAmount: 30, maxAmount: 100, frequency: 0.12 },
    { description: 'Amazon Purchase', category: 'shopping', minAmount: 20, maxAmount: 150, frequency: 0.08 },
    { description: 'Gas Station', category: 'transportation', minAmount: 40, maxAmount: 70, frequency: 0.1 },
    { description: 'Coffee Shop', category: 'food_dining', minAmount: 5, maxAmount: 15, frequency: 0.25 },
    { description: 'Doctor Visit', category: 'healthcare', minAmount: 50, maxAmount: 200, frequency: 0.02 },
    { description: 'Freelance Project', category: 'freelance', type: 'Income', minAmount: 500, maxAmount: 2000, frequency: 0.03 },
  ];
  // Fixed monthly items: [day of month, template]
  const monthlyItems = [
    { day: 1, description: 'Monthly Salary', category: 'salary', type: 'Income', amount: 8000 },
    { day: 1, description: 'Rent Payment', category: 'rent_housing', type: 'Expense', amount: 2000 },
    { day: 5, description: 'Netflix Subscription', category: 'entertainment', type: 'Expense', amount: 18 },
    { day: 12, description: 'Electric Bill', category: 'utilities', type: 'Expense', amount: 110 },
    { day: 20, description: 'Dividend Payment', category: 'investments', type: 'Income', amount: 250 },
  ];

  const paymentMethods = ['Card', 'Cash', 'Transfer'];
  const toDateStr = (d) => d.toISOString().split('T')[0];
  const today = new Date();
  const transactions = [];
  const pushTx = (t, date) => {
    const paymentMethod = t.fixedPayment || paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
    transactions.push({
      description: t.description,
      amount: t.amount,
      currency: 'USD',
      amountInGlobalCurrency: t.amount,
      exchangeRate: 1,
      type: t.type || 'Expense',
      category: t.category,
      date: toDateStr(date),
      paymentMethod,
      cardId: paymentMethod === 'Card' ? cardIds[Math.floor(Math.random() * cardIds.length)].toString() : null,
      workspaceId,
      createdBy: userId,
      created_date: date,
      updated_date: date,
    });
  };

  for (let daysAgo = 180; daysAgo >= 0; daysAgo--) {
    const date = new Date(today.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    for (const tpl of dailyTemplates) {
      if (Math.random() < tpl.frequency) {
        const amount = Math.floor(Math.random() * (tpl.maxAmount - tpl.minAmount + 1)) + tpl.minAmount;
        pushTx({ ...tpl, amount }, date);
      }
    }
    for (const item of monthlyItems) {
      if (date.getDate() === item.day) {
        pushTx({ ...item, fixedPayment: item.type === 'Income' || item.category === 'rent_housing' ? 'Transfer' : 'Card' }, date);
      }
    }
  }
  await db.collection('expensetransactions').insertMany(transactions);
  const transactionCount = transactions.length;
  console.log(`  ✅ Created ${transactionCount} transactions
`);

  // Create budgets for current month
  console.log('📊 Creating budgets...');
  const currentDate = new Date();
  const currentYear = currentDate.getFullYear();
  const currentMonth = currentDate.getMonth() + 1;
  
  const budgets = [
    { category: 'food_dining', monthlyLimit: 600, alertThreshold: 80 },
    { category: 'groceries', monthlyLimit: 400, alertThreshold: 80 },
    { category: 'transportation', monthlyLimit: 300, alertThreshold: 80 },
    { category: 'entertainment', monthlyLimit: 200, alertThreshold: 80 },
    { category: 'shopping', monthlyLimit: 300, alertThreshold: 80 },
  ];

  for (const budget of budgets) {
    await db.collection('budgets').insertOne({
      ...budget,
      currency: 'USD',
      year: currentYear,
      month: currentMonth,
      period: 'monthly',
      isActive: true,
      isShared: true,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${budget.category}: $${budget.monthlyLimit}/month (${budget.alertThreshold}%)`);
  }
  console.log('');

  // Create notes
  console.log('📝 Creating notes...');
  const notes = [
    {
      title: 'Investment Strategy 2026',
      content: 'Focus on diversified ETFs with 70% stocks, 20% bonds, 10% international. Rebalance quarterly.',
      color: '#5C8374',
      isPinned: true,
      isShared: true,
      tags: ['strategy', 'investment']
    },
    {
      title: 'Tax Deductions Checklist',
      content: '- 401k contributions\n- HSA contributions\n- Charitable donations\n- Home office expenses',
      color: '#3B82F6',
      isPinned: false,
      isShared: true,
      tags: ['taxes', 'planning']
    },
    {
      title: 'Budget Review Notes',
      content: 'Need to reduce dining expenses next month. Target: $500 instead of $600.',
      color: '#F59E0B',
      isPinned: false,
      isShared: false,
      tags: ['budget', 'personal']
    },
  ];

  for (const note of notes) {
    await db.collection('notes').insertOne({
      ...note,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${note.title}`);
  }
  console.log('');

  // Summary
  console.log('═'.repeat(50));
  console.log('🎉 DEMO ACCOUNT CREATED SUCCESSFULLY!');
  console.log('═'.repeat(50));
  console.log(`\n📧 Email: ${DEMO_USER.email}`);
  console.log(`🔑 Password: ${DEMO_USER.password}`);
  console.log('\nData created:');
  console.log(`  • 1 user`);
  console.log(`  • 1 workspace`);
  console.log(`  • ${categories.length} categories`);
  console.log(`  • ${cards.length} cards`);
  console.log(`  • ${transactionCount} transactions`);
  console.log(`  • ${budgets.length} budgets`);
  console.log(`  • ${notes.length} notes`);
  console.log('\n');

  await mongoose.disconnect();
  console.log('✅ Done!');
}

createDemoAccount().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
