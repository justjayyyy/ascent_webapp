// Script to add default categories to all existing users
import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Category from '../models/Category.js';

// Load .env from the correct path
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in environment variables');
  console.log('Looking for .env at:', join(__dirname, '../../.env'));
  process.exit(1);
}

// Default categories with translation keys and colors
const DEFAULT_CATEGORIES = [
  // Expense categories
  { nameKey: 'food_dining', type: 'Expense', icon: '🍽️', color: '#EF4444' },
  { nameKey: 'groceries', type: 'Expense', icon: '🛒', color: '#F59E0B' },
  { nameKey: 'transportation', type: 'Expense', icon: '🚗', color: '#3B82F6' },
  { nameKey: 'utilities', type: 'Expense', icon: '💡', color: '#8B5CF6' },
  { nameKey: 'rent_housing', type: 'Expense', icon: '🏠', color: '#EC4899' },
  { nameKey: 'healthcare', type: 'Expense', icon: '🏥', color: '#10B981' },
  { nameKey: 'entertainment', type: 'Expense', icon: '🎬', color: '#F97316' },
  { nameKey: 'shopping', type: 'Expense', icon: '🛍️', color: '#06B6D4' },
  { nameKey: 'insurance', type: 'Expense', icon: '🛡️', color: '#6366F1' },
  { nameKey: 'education', type: 'Expense', icon: '📚', color: '#14B8A6' },
  { nameKey: 'personal_care', type: 'Expense', icon: '💅', color: '#D946EF' },
  { nameKey: 'subscriptions', type: 'Expense', icon: '📱', color: '#0EA5E9' },
  { nameKey: 'travel', type: 'Expense', icon: '✈️', color: '#22C55E' },
  { nameKey: 'gifts', type: 'Expense', icon: '🎁', color: '#E11D48' },
  { nameKey: 'taxes', type: 'Expense', icon: '📋', color: '#64748B' },
  { nameKey: 'other_expense', type: 'Expense', icon: '📦', color: '#78716C' },
  
  // Income categories
  { nameKey: 'salary', type: 'Income', icon: '💰', color: '#22C55E' },
  { nameKey: 'freelance', type: 'Income', icon: '💻', color: '#3B82F6' },
  { nameKey: 'investments', type: 'Income', icon: '📈', color: '#10B981' },
  { nameKey: 'rental_income', type: 'Income', icon: '🏢', color: '#8B5CF6' },
  { nameKey: 'gifts_received', type: 'Income', icon: '🎁', color: '#EC4899' },
  { nameKey: 'refunds', type: 'Income', icon: '↩️', color: '#06B6D4' },
  { nameKey: 'other_income', type: 'Income', icon: '💵', color: '#78716C' },
];

async function addDefaultCategoriesToUsers() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Get all users
    const users = await User.find({});
    console.log(`Found ${users.length} users`);

    let totalAdded = 0;

    for (const user of users) {
      console.log(`\nProcessing user: ${user.email}`);
      
      // Get existing categories for this user
      const existingCategories = await Category.find({ 
        created_by: { $regex: new RegExp(`^${user.email}$`, 'i') } 
      });
      
      const existingKeys = existingCategories
        .filter(c => c.nameKey)
        .map(c => c.nameKey);
      
      console.log(`  Existing categories: ${existingCategories.length}`);
      console.log(`  Existing default keys: ${existingKeys.join(', ') || 'none'}`);

      // Find missing default categories
      const missingCategories = DEFAULT_CATEGORIES.filter(
        dc => !existingKeys.includes(dc.nameKey)
      );

      if (missingCategories.length === 0) {
        console.log(`  All default categories already exist`);
        continue;
      }

      console.log(`  Adding ${missingCategories.length} missing categories...`);

      // Create missing categories
      const categoriesToCreate = missingCategories.map(cat => ({
        name: cat.nameKey,
        nameKey: cat.nameKey,
        type: cat.type,
        icon: cat.icon,
        color: cat.color,
        isDefault: true,
        created_by: user.email,
      }));

      await Category.insertMany(categoriesToCreate);
      totalAdded += missingCategories.length;
      console.log(`  ✓ Added ${missingCategories.length} categories`);
    }

    console.log(`\n========================================`);
    console.log(`Total categories added: ${totalAdded}`);
    console.log(`========================================`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

addDefaultCategoriesToUsers();

