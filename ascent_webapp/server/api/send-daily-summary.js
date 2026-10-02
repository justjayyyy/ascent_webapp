import connectDB from '../lib/mongodb.js';
import { cronAuthorized } from '../lib/cronAuth.js';
import { summaryHandler } from '../lib/summaryJob.js';
import { runTaskReminders } from '../lib/taskReminders.js';

// Vercel Cron (see vercel.json), once a day: the daily summary emails, and household task reminders
export default summaryHandler('daily', { authorized: (req) => cronAuthorized(req), connect: connectDB, also: () => runTaskReminders() });
