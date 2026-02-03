import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDB } from '../lib/mongodb.js';
import User from '../models/User.js';
import Account from '../models/Account.js';
import Position from '../models/Position.js';
import ExpenseTransaction from '../models/ExpenseTransaction.js';
import { sendEmail } from '../lib/email-helper.js';
import { getEmailTemplate } from '../lib/email-templates.js';

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

    // Get all users with dailySummary enabled and emailNotifications enabled
    const users = await User.find({
      dailySummary: true,
      emailNotifications: true,
      email: { $exists: true, $ne: '' }
    });

    console.log(`Found ${users.length} users to send daily summary to`);

    let successCount = 0;
    let errorCount = 0;

    for (const user of users) {
      try {
        // Get user's accounts and positions
        const accounts = await Account.find({ created_by: user.email });
        const positions = await Position.find({ created_by: user.email });
        const todayTransactions = await ExpenseTransaction.find({
          created_by: user.email,
          date: {
            $gte: new Date(new Date().setHours(0, 0, 0, 0)),
            $lt: new Date(new Date().setHours(23, 59, 59, 999))
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

        // Calculate today's expenses/income
        let todayExpenses = 0;
        let todayIncome = 0;
        for (const tx of todayTransactions) {
          if (tx.type === 'Expense') {
            todayExpenses += tx.amount || 0;
          } else if (tx.type === 'Income') {
            todayIncome += tx.amount || 0;
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

        const emailBody = `Hello ${user.full_name || 'User'},

Here's your daily portfolio summary for ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}:

📊 Portfolio Overview:
• Total Value: ${formatCurrency(totalValue)}
• Total Cost: ${formatCurrency(totalCost)}
• Total P&L: ${formatCurrency(totalPnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent}%)
• Accounts: ${accounts.length}
• Positions: ${positions.length}

💰 Today's Activity:
• Expenses: ${formatCurrency(todayExpenses)}
• Income: ${formatCurrency(todayIncome)}
• Net: ${formatCurrency(todayIncome - todayExpenses)}
• Transactions: ${todayTransactions.length}

Best regards,
Ascent Team`;

        const summaryContent = `
          <p>Hello <strong>${user.full_name || 'User'}</strong>,</p>
          <p>Here's your daily portfolio summary for ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</p>
          
          <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #4caf50;">
            <h2 style="color: #092635; margin-top: 0; font-size: 18px;">📊 Portfolio Overview</h2>
            <p style="margin: 5px 0;"><strong>Total Value:</strong> ${formatCurrency(totalValue)}</p>
            <p style="margin: 5px 0;"><strong>Total Cost:</strong> ${formatCurrency(totalCost)}</p>
            <p style="margin: 5px 0;"><strong>Total P&L:</strong> <span style="color: ${totalPnl >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${formatCurrency(totalPnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent}%)</span></p>
            <p style="margin: 5px 0;"><strong>Accounts:</strong> ${accounts.length}</p>
            <p style="margin: 5px 0;"><strong>Positions:</strong> ${positions.length}</p>
          </div>
          
          <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #ff9800;">
            <h2 style="color: #092635; margin-top: 0; font-size: 18px;">💰 Today's Activity</h2>
            <p style="margin: 5px 0;"><strong>Expenses:</strong> ${formatCurrency(todayExpenses)}</p>
            <p style="margin: 5px 0;"><strong>Income:</strong> ${formatCurrency(todayIncome)}</p>
            <p style="margin: 5px 0;"><strong>Net:</strong> <span style="color: ${(todayIncome - todayExpenses) >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${formatCurrency(todayIncome - todayExpenses)}</span></p>
            <p style="margin: 5px 0;"><strong>Transactions:</strong> ${todayTransactions.length}</p>
          </div>
        `;

        const emailHtml = getEmailTemplate({
          language: user.language || 'en',
          title: 'Daily Portfolio Summary',
          body: summaryContent,
          cta: {
            text: 'View Dashboard',
            link: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'
          }
        });

        // Send email using the send-email integration
        const emailResult = await sendEmail({
          to: user.email,
          subject: `Daily Portfolio Summary - ${new Date().toLocaleDateString()}`,
          body: emailBody,
          html: emailHtml
        });

        if (emailResult && emailResult.sent) {
          successCount++;
          console.log(`Daily summary sent to ${user.email}`);
        } else {
          errorCount++;
          console.error(`Failed to send daily summary to ${user.email}`);
        }
      } catch (userError) {
        errorCount++;
        console.error(`Error processing user ${user.email}:`, userError);
      }
    }

    return res.status(200).json({
      success: true,
      message: `Daily summaries sent: ${successCount} successful, ${errorCount} failed`,
      successCount,
      errorCount
    });
  } catch (error) {
    console.error('Daily summary error:', error);
    return res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}
