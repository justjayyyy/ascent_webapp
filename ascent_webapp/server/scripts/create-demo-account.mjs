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

  // Create accounts
  console.log('🏦 Creating accounts...');
  const accounts = [
    { name: 'Fidelity 401k', type: 'Retirement', institution: 'Fidelity', baseCurrency: 'USD', initialInvestment: 50000 },
    { name: 'Robinhood Trading', type: 'Investment', institution: 'Robinhood', baseCurrency: 'USD', initialInvestment: 25000 },
    { name: 'Chase Savings', type: 'Savings', institution: 'Chase', baseCurrency: 'USD', initialInvestment: 25000 },
    { name: 'Schwab IRA', type: 'IRA', institution: 'Charles Schwab', baseCurrency: 'USD', initialInvestment: 40000 },
  ];

  const accountIds = [];
  for (const acc of accounts) {
    const result = await db.collection('accounts').insertOne({
      ...acc,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      updated_date: new Date(),
    });
    accountIds.push({ id: result.insertedId, name: acc.name, type: acc.type });
    console.log(`  ✅ ${acc.name}`);
  }
  console.log('');

  // Create positions
  console.log('📈 Creating positions...');
  const positions = [
    // Fidelity 401k
    { accountId: accountIds[0].id, symbol: 'VTI', name: 'Vanguard Total Stock Market ETF', assetType: 'ETF', quantity: 150, averageBuyPrice: 180, currentPrice: 245 },
    { accountId: accountIds[0].id, symbol: 'BND', name: 'Vanguard Total Bond Market ETF', assetType: 'ETF', quantity: 200, averageBuyPrice: 75, currentPrice: 72 },
    { accountId: accountIds[0].id, symbol: 'VXUS', name: 'Vanguard Total International Stock ETF', assetType: 'ETF', quantity: 100, averageBuyPrice: 52, currentPrice: 58 },
    
    // Robinhood Trading
    { accountId: accountIds[1].id, symbol: 'AAPL', name: 'Apple Inc.', assetType: 'Stock', quantity: 50, averageBuyPrice: 150, currentPrice: 195 },
    { accountId: accountIds[1].id, symbol: 'GOOGL', name: 'Alphabet Inc.', assetType: 'Stock', quantity: 25, averageBuyPrice: 120, currentPrice: 175 },
    { accountId: accountIds[1].id, symbol: 'MSFT', name: 'Microsoft Corporation', assetType: 'Stock', quantity: 30, averageBuyPrice: 280, currentPrice: 430 },
    { accountId: accountIds[1].id, symbol: 'NVDA', name: 'NVIDIA Corporation', assetType: 'Stock', quantity: 20, averageBuyPrice: 250, currentPrice: 495 },
    { accountId: accountIds[1].id, symbol: 'TSLA', name: 'Tesla Inc.', assetType: 'Stock', quantity: 15, averageBuyPrice: 200, currentPrice: 250 },
    
    // Chase Savings (Cash)
    { accountId: accountIds[2].id, symbol: 'USD', name: 'US Dollar Cash', assetType: 'Cash', quantity: 25000, averageBuyPrice: 1, currentPrice: 1 },
    
    // Schwab IRA
    { accountId: accountIds[3].id, symbol: 'SPY', name: 'SPDR S&P 500 ETF', assetType: 'ETF', quantity: 80, averageBuyPrice: 380, currentPrice: 475 },
    { accountId: accountIds[3].id, symbol: 'QQQ', name: 'Invesco QQQ Trust', assetType: 'ETF', quantity: 40, averageBuyPrice: 320, currentPrice: 435 },
  ];

  for (const pos of positions) {
    await db.collection('positions').insertOne({
      ...pos,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      updated_date: new Date(),
    });
    console.log(`  ✅ ${pos.symbol} - ${pos.quantity} shares @ $${pos.currentPrice}`);
  }
  console.log('');

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

  // Create transactions (last 90 days)
  console.log('💸 Creating transactions...');
  const transactionTemplates = [
    { description: 'Whole Foods', category: 'groceries', type: 'Expense', minAmount: 50, maxAmount: 200, frequency: 0.3 },
    { description: 'Netflix Subscription', category: 'entertainment', type: 'Expense', minAmount: 15, maxAmount: 20, frequency: 0.05 },
    { description: 'Uber Ride', category: 'transportation', type: 'Expense', minAmount: 15, maxAmount: 45, frequency: 0.2 },
    { description: 'Electric Bill', category: 'utilities', type: 'Expense', minAmount: 80, maxAmount: 150, frequency: 0.03 },
    { description: 'Rent Payment', category: 'rent_housing', type: 'Expense', minAmount: 2000, maxAmount: 2000, frequency: 0.03 },
    { description: 'Restaurant Dinner', category: 'food_dining', type: 'Expense', minAmount: 30, maxAmount: 100, frequency: 0.2 },
    { description: 'Amazon Purchase', category: 'shopping', type: 'Expense', minAmount: 20, maxAmount: 150, frequency: 0.15 },
    { description: 'Doctor Visit', category: 'healthcare', type: 'Expense', minAmount: 50, maxAmount: 200, frequency: 0.05 },
    { description: 'Gas Station', category: 'transportation', type: 'Expense', minAmount: 40, maxAmount: 70, frequency: 0.2 },
    { description: 'Coffee Shop', category: 'food_dining', type: 'Expense', minAmount: 5, maxAmount: 15, frequency: 0.3 },
    { description: 'Monthly Salary', category: 'salary', type: 'Income', minAmount: 8000, maxAmount: 8000, frequency: 0.03 },
    { description: 'Freelance Project', category: 'freelance', type: 'Income', minAmount: 500, maxAmount: 2000, frequency: 0.1 },
    { description: 'Dividend Payment', category: 'investments', type: 'Income', minAmount: 100, maxAmount: 500, frequency: 0.05 },
  ];

  let transactionCount = 0;
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Generate transactions based on frequency
    for (const template of transactionTemplates) {
      if (Math.random() < template.frequency) {
        const amount = Math.floor(Math.random() * (template.maxAmount - template.minAmount + 1)) + template.minAmount;
        const paymentMethods = ['Card', 'Cash', 'Transfer'];
        const paymentMethod = paymentMethods[Math.floor(Math.random() * paymentMethods.length)];
        
        await db.collection('expensetransactions').insertOne({
          description: template.description,
          amount: amount,
          currency: 'USD',
          amountInGlobalCurrency: amount,
          exchangeRate: 1,
          type: template.type,
          category: template.category,
          date: date.toISOString().split('T')[0],
          paymentMethod: paymentMethod,
          cardId: paymentMethod === 'Card' ? cardIds[Math.floor(Math.random() * cardIds.length)] : null,
          workspaceId: workspaceId,
          createdBy: userId,
          created_date: date,
          updated_date: date,
        });
        transactionCount++;
      }
    }
  }
  console.log(`  ✅ Created ${transactionCount} transactions\n`);

  // Create financial goals
  console.log('🎯 Creating financial goals...');
  const goals = [
    { 
      title: 'Emergency Fund', 
      targetAmount: 30000, 
      currentAmount: 25000, 
      targetDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expectedAnnualReturn: 3,
      linkedAccountIds: [accountIds[2].id.toString()]
    },
    { 
      title: 'Vacation to Japan', 
      targetAmount: 5000, 
      currentAmount: 2500, 
      targetDate: new Date(Date.now() + 240 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expectedAnnualReturn: 2,
      linkedAccountIds: []
    },
    { 
      title: 'New Car Down Payment', 
      targetAmount: 15000, 
      currentAmount: 8000, 
      targetDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      expectedAnnualReturn: 4,
      linkedAccountIds: [accountIds[2].id.toString()]
    },
  ];

  for (const goal of goals) {
    await db.collection('financialgoals').insertOne({
      ...goal,
      workspaceId: workspaceId,
      createdBy: userId,
      created_date: new Date(),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${goal.title}: $${goal.currentAmount.toLocaleString()} / $${goal.targetAmount.toLocaleString()}`);
  }
  console.log('');

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
  console.log(`  • ${accounts.length} accounts`);
  console.log(`  • ${positions.length} positions`);
  console.log(`  • ${categories.length} categories`);
  console.log(`  • ${cards.length} cards`);
  console.log(`  • ${transactionCount} transactions`);
  console.log(`  • ${goals.length} financial goals`);
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
