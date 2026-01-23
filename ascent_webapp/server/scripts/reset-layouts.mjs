import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env from the ascent_webapp root
dotenv.config({ path: join(__dirname, '../../.env') });

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not found in environment variables');
  process.exit(1);
}

// Define schemas inline for the script
const dashboardWidgetSchema = new mongoose.Schema({
  widgetType: String,
  x: Number,
  y: Number,
  w: Number,
  h: Number,
  enabled: Boolean,
  created_by: String,
}, { timestamps: true });

const pageLayoutSchema = new mongoose.Schema({
  pageName: String,
  widgetType: String,
  x: Number,
  y: Number,
  w: Number,
  h: Number,
  enabled: Boolean,
  created_by: String,
}, { timestamps: true });

const DashboardWidget = mongoose.models.DashboardWidget || mongoose.model('DashboardWidget', dashboardWidgetSchema);
const PageLayout = mongoose.models.PageLayout || mongoose.model('PageLayout', pageLayoutSchema);

async function resetLayouts() {
  console.log('Connecting to MongoDB...');
  
  try {
    await mongoose.connect(MONGODB_URI);
    console.log('Connected to MongoDB');

    // Delete all dashboard widgets
    const deletedWidgets = await DashboardWidget.deleteMany({});
    console.log(`Deleted ${deletedWidgets.deletedCount} dashboard widgets`);

    // Delete all page layouts
    const deletedLayouts = await PageLayout.deleteMany({});
    console.log(`Deleted ${deletedLayouts.deletedCount} page layouts`);

    console.log('\n✅ App layouts have been reset!');
    console.log('The default layouts will be applied on next page load.');

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

resetLayouts();

