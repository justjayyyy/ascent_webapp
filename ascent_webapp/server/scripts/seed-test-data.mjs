import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const MONGODB_URI = process.env.MONGODB_URI;

// Test user credentials
const TEST_USER = {
  email: 'demo@ascent.com',
  password: 'Demo123!',
  full_name: 'Demo User',
};

async function seedTestData() {
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

  // Create user
  console.log('👤 Creating test user...');
  const hashedPassword = await bcrypt.hash(TEST_USER.password, 10);
  const userResult = await db.collection('users').insertOne({
    email: TEST_USER.email,
    password: hashedPassword,
    full_name: TEST_USER.full_name,
    language: 'en',
    currency: 'USD',
    theme: 'dark',
    blurValues: false,
    created_date: new Date(),
    updated_date: new Date(),
  });
  console.log(`✅ Created user: ${TEST_USER.email} / ${TEST_USER.password}\n`);

  // Create accounts
  console.log('🏦 Creating accounts...');
  const accounts = [
    { name: 'Fidelity 401k', type: 'Retirement', institution: 'Fidelity', currency: 'USD' },
    { name: 'Robinhood Trading', type: 'Investment', institution: 'Robinhood', currency: 'USD' },
    { name: 'Chase Savings', type: 'Savings', institution: 'Chase', currency: 'USD' },
    { name: 'Schwab IRA', type: 'Retirement', institution: 'Charles Schwab', currency: 'USD' },
  ];

  const accountIds = [];
  for (const acc of accounts) {
    const result = await db.collection('accounts').insertOne({
      ...acc,
      created_by: TEST_USER.email,
      created_date: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000), // 90 days ago
      updated_date: new Date(),
    });
    accountIds.push({ id: result.insertedId.toString(), name: acc.name, type: acc.type });
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
      created_by: TEST_USER.email,
      created_date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000), // 60 days ago
      updated_date: new Date(),
    });
    console.log(`  ✅ ${pos.symbol} - ${pos.quantity} shares @ $${pos.currentPrice}`);
  }
  console.log('');

  // Create categories
  console.log('🏷️ Creating categories...');
  const categories = [
    { name: 'Food & Dining', type: 'Expense', icon: '🍽️', color: '#FF6347' },
    { name: 'Groceries', type: 'Expense', icon: '🛒', color: '#3CB371' },
    { name: 'Transportation', type: 'Expense', icon: '🚗', color: '#4682B4' },
    { name: 'Utilities', type: 'Expense', icon: '💡', color: '#FFD700' },
    { name: 'Rent', type: 'Expense', icon: '🏠', color: '#8A2BE2' },
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
  console.log(`  ✅ Created ${categories.length} categories\n`);

  // Create cards
  console.log('💳 Creating cards...');
  const cards = [
    { name: 'Chase Sapphire', type: 'credit', last4: '4242', network: 'Visa' },
    { name: 'Amex Gold', type: 'credit', last4: '1234', network: 'American Express' },
    { name: 'Chase Debit', type: 'debit', last4: '5678', network: 'Visa' },
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

  // Create transactions (last 90 days)
  console.log('💸 Creating transactions...');
  const transactionTemplates = [
    { description: 'Whole Foods', category: 'Groceries', type: 'expense', minAmount: 50, maxAmount: 200 },
    { description: 'Netflix', category: 'Entertainment', type: 'expense', minAmount: 15, maxAmount: 20 },
    { description: 'Uber', category: 'Transportation', type: 'expense', minAmount: 15, maxAmount: 45 },
    { description: 'Electric Bill', category: 'Utilities', type: 'expense', minAmount: 80, maxAmount: 150 },
    { description: 'Rent Payment', category: 'Rent', type: 'expense', minAmount: 2000, maxAmount: 2000 },
    { description: 'Restaurant', category: 'Food & Dining', type: 'expense', minAmount: 30, maxAmount: 100 },
    { description: 'Amazon', category: 'Shopping', type: 'expense', minAmount: 20, maxAmount: 150 },
    { description: 'Doctor Visit', category: 'Healthcare', type: 'expense', minAmount: 50, maxAmount: 200 },
    { description: 'Monthly Salary', category: 'Salary', type: 'income', minAmount: 8000, maxAmount: 8000 },
    { description: 'Freelance Project', category: 'Freelance', type: 'income', minAmount: 500, maxAmount: 2000 },
    { description: 'Dividend Payment', category: 'Investment Income', type: 'income', minAmount: 100, maxAmount: 500 },
  ];

  let transactionCount = 0;
  for (let daysAgo = 90; daysAgo >= 0; daysAgo--) {
    const date = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
    
    // Random number of transactions per day (0-4)
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
    
    // Monthly salary on 1st
    if (date.getDate() === 1) {
      await db.collection('expensetransactions').insertOne({
        description: 'Monthly Salary',
        amount: 8000,
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
        description: 'Rent Payment',
        amount: 2000,
        type: 'expense',
        category: categoryIds['Rent'],
        categoryName: 'Rent',
        date: date.toISOString().split('T')[0],
        paymentMethod: 'bank_transfer',
        created_by: TEST_USER.email,
        created_date: date,
        updated_date: date,
      });
      transactionCount++;
    }
  }
  console.log(`  ✅ Created ${transactionCount} transactions\n`);

  // Create financial goals
  console.log('🎯 Creating financial goals...');
  const goals = [
    { name: 'Emergency Fund', targetAmount: 30000, currentAmount: 25000, targetDate: '2024-06-01', category: 'Savings' },
    { name: 'Vacation to Japan', targetAmount: 5000, currentAmount: 2500, targetDate: '2024-09-01', category: 'Travel' },
    { name: 'New Car Down Payment', targetAmount: 15000, currentAmount: 8000, targetDate: '2025-01-01', category: 'Purchase' },
    { name: 'Home Down Payment', targetAmount: 100000, currentAmount: 45000, targetDate: '2026-01-01', category: 'Real Estate' },
  ];

  for (const goal of goals) {
    await db.collection('financialgoals').insertOne({
      ...goal,
      created_by: TEST_USER.email,
      created_date: new Date(),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${goal.name}: $${goal.currentAmount.toLocaleString()} / $${goal.targetAmount.toLocaleString()}`);
  }
  console.log('');

  // Create budgets
  console.log('📊 Creating budgets...');
  const budgets = [
    { category: 'Food & Dining', amount: 600, period: 'monthly' },
    { category: 'Groceries', amount: 400, period: 'monthly' },
    { category: 'Transportation', amount: 300, period: 'monthly' },
    { category: 'Entertainment', amount: 200, period: 'monthly' },
    { category: 'Shopping', amount: 300, period: 'monthly' },
  ];

  for (const budget of budgets) {
    await db.collection('budgets').insertOne({
      ...budget,
      categoryId: categoryIds[budget.category],
      created_by: TEST_USER.email,
      created_date: new Date(),
      updated_date: new Date(),
    });
    console.log(`  ✅ ${budget.category}: $${budget.amount}/month`);
  }
  console.log('');

  // Summary
  console.log('═'.repeat(50));
  console.log('🎉 TEST DATA CREATED SUCCESSFULLY!');
  console.log('═'.repeat(50));
  console.log(`\n📧 Login: ${TEST_USER.email}`);
  console.log(`🔑 Password: ${TEST_USER.password}`);
  console.log('\nData created:');
  console.log(`  • 1 user`);
  console.log(`  • ${accounts.length} accounts`);
  console.log(`  • ${positions.length} positions`);
  console.log(`  • ${categories.length} categories`);
  console.log(`  • ${cards.length} cards`);
  console.log(`  • ${transactionCount} transactions`);
  console.log(`  • ${goals.length} financial goals`);
  console.log(`  • ${budgets.length} budgets`);
  console.log('\n');

  await mongoose.disconnect();
  console.log('✅ Done!');
}

seedTestData().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});

