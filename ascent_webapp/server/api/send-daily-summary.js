import connectDB from '../lib/mongodb.js';
import { cronAuthorized } from '../lib/cronAuth.js';
import { summaryHandler } from '../lib/summaryJob.js';
import { runTaskReminders } from '../lib/taskReminders.js';
import { runKitchenReminders } from '../lib/kitchenReminders.js';

// Vercel Cron (see vercel.json), once a day: the daily summary emails, household task reminders and the
// kitchen check reminder
export default summaryHandler('daily', {
  authorized: (req) => cronAuthorized(req),
  connect: connectDB,
  // Each runs even when the other fails
  also: async () => {
    const [tasks, kitchen] = await Promise.allSettled([runTaskReminders(), runKitchenReminders()]);
    const outcome = (r) => (r.status === 'fulfilled' ? r.value : { failed: true });
    return { tasks: outcome(tasks), kitchen: outcome(kitchen) };
  },
});
