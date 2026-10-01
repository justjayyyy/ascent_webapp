import connectDB from '../lib/mongodb.js';
import { cronAuthorized } from '../lib/cronAuth.js';
import { summaryHandler } from '../lib/summaryJob.js';

// Vercel Cron (see vercel.json)
export default summaryHandler('weekly', { authorized: (req) => cronAuthorized(req), connect: connectDB });
