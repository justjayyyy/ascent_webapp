import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongodb.js';
import User from '../models/User.js';
import Account from '../models/Account.js';
import Position from '../models/Position.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import { sendEmail } from '../lib/email-helper.js';

export default async function handler(req, res) {
  // Allow both GET (for testing) and POST (for cron jobs)
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Verify cron secret if set (Vercel Cron Jobs don't send custom headers, so skip for now)
  // For manual testing, you can add: x-cron-secret header
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && req.headers['x-cron-secret'] && req.headers['x-cron-secret'] !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    await connectDB();

    // Get all users with weeklyReports enabled and emailNotifications enabled
    const users = await User.find({
      weeklyReports: true,
      emailNotifications: true,
      email: { $exists: true, $ne: '' }
    });

    console.log(`Found ${users.length} users to send weekly summary to`);

    let successCount = 0;
    let errorCount = 0;

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    for (const user of users) {
      try {
        // Get user's accounts and positions
        const accounts = await Account.find({ created_by: user.email });
        const positions = await Position.find({ created_by: user.email });
        const weekTransactions = await ExpenseTransaction.find({
          created_by: user.email,
          date: {
            $gte: weekAgo,
            $lt: new Date()
          }
        });

        // Calculate portfolio value
        let totalValue = 0;
        let totalCost = 0;
        for (const position of positions) {
          const positionValue = (position.currentPrice || 0) * (position.quantity || 0);
          const positionCost = (position.averageBuyPrice || 0) * (position.quantity || 0);
          totalValue += positionValue;
          totalCost += positionCost;
        }

        const totalPnl = totalValue - totalCost;
        const pnlPercent = totalCost > 0 ? ((totalPnl / totalCost) * 100).toFixed(2) : 0;

        // Calculate week's expenses/income
        let weekExpenses = 0;
        let weekIncome = 0;
        const expensesByCategory = {};
        for (const tx of weekTransactions) {
          if (tx.type === 'Expense') {
            weekExpenses += tx.amount || 0;
            const category = tx.category || 'Uncategorized';
            expensesByCategory[category] = (expensesByCategory[category] || 0) + (tx.amount || 0);
          } else if (tx.type === 'Income') {
            weekIncome += tx.amount || 0;
          }
        }

        const currency = user.currency || 'USD';
        const formatCurrency = (amount) => {
          return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(amount || 0);
        };

        const topCategories = Object.entries(expensesByCategory)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([cat, amount]) => `• ${cat}: ${formatCurrency(amount)}`)
          .join('\n');

        const emailBody = `Hello ${user.full_name || 'User'},

Here's your weekly portfolio summary for the week ending ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}:

📊 Portfolio Overview:
• Total Value: ${formatCurrency(totalValue)}
• Total Cost: ${formatCurrency(totalCost)}
• Total P&L: ${formatCurrency(totalPnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent}%)
• Accounts: ${accounts.length}
• Positions: ${positions.length}

💰 This Week's Activity:
• Expenses: ${formatCurrency(weekExpenses)}
• Income: ${formatCurrency(weekIncome)}
• Net: ${formatCurrency(weekIncome - weekExpenses)}
• Transactions: ${weekTransactions.length}

${topCategories ? `\nTop Expense Categories:\n${topCategories}` : ''}

Best regards,
Ascent Team`;

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Weekly Portfolio Summary</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
  <div style="background: linear-gradient(135deg, #092635 0%, #1B4242 100%); padding: 30px; border-radius: 10px 10px 0 0; text-align: center;">
    <h1 style="color: #9EC8B9; margin: 0; font-size: 28px;">Weekly Portfolio Summary</h1>
    <p style="color: #9EC8B9; margin: 5px 0 0 0;">Week ending ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
  </div>
  
  <div style="background: #ffffff; padding: 30px; border-radius: 0 0 10px 10px; border: 1px solid #e0e0e0; border-top: none;">
    <p style="font-size: 16px; margin-top: 0;">Hello <strong>${user.full_name || 'User'}</strong>,</p>
    
    <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">📊 Portfolio Overview</h2>
      <p style="margin: 5px 0;"><strong>Total Value:</strong> ${formatCurrency(totalValue)}</p>
      <p style="margin: 5px 0;"><strong>Total Cost:</strong> ${formatCurrency(totalCost)}</p>
      <p style="margin: 5px 0;"><strong>Total P&L:</strong> <span style="color: ${totalPnl >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${formatCurrency(totalPnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent}%)</span></p>
      <p style="margin: 5px 0;"><strong>Accounts:</strong> ${accounts.length}</p>
      <p style="margin: 5px 0;"><strong>Positions:</strong> ${positions.length}</p>
    </div>
    
    <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">💰 This Week's Activity</h2>
      <p style="margin: 5px 0;"><strong>Expenses:</strong> ${formatCurrency(weekExpenses)}</p>
      <p style="margin: 5px 0;"><strong>Income:</strong> ${formatCurrency(weekIncome)}</p>
      <p style="margin: 5px 0;"><strong>Net:</strong> <span style="color: ${(weekIncome - weekExpenses) >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${formatCurrency(weekIncome - weekExpenses)}</span></p>
      <p style="margin: 5px 0;"><strong>Transactions:</strong> ${weekTransactions.length}</p>
    </div>
    
    ${topCategories ? `
    <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #2196f3;">
      <h2 style="color: #092635; margin-top: 0; font-size: 18px;">📈 Top Expense Categories</h2>
      <pre style="margin: 10px 0; font-family: inherit; white-space: pre-wrap;">${topCategories}</pre>
    </div>
    ` : ''}
    
    <p style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #e0e0e0; font-size: 12px; color: #999; text-align: center;">
      Best regards,<br>
      <strong style="color: #5C8374;">Ascent Team</strong>
    </p>
  </div>
</body>
</html>`;

        // Send email using the send-email integration
        const emailResult = await sendEmail({
          to: user.email,
          subject: `Weekly Portfolio Summary - ${new Date().toLocaleDateString()}`,
          body: emailBody,
          html: emailHtml
        });

        if (emailResult && emailResult.sent) {
          successCount++;
          console.log(`Weekly summary sent to ${user.email}`);
        } else {
          errorCount++;
          console.error(`Failed to send weekly summary to ${user.email}`);
        }
      } catch (userError) {
        errorCount++;
        console.error(`Error processing user ${user.email}:`, userError);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Weekly summaries sent: ${successCount} successful, ${errorCount} failed`,
      successCount,
      errorCount
    });
  } catch (error) {
    console.error('Weekly summary error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
