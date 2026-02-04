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

    // Translations for email content
    const translations = {
      en: {
        weeklySummaryTitle: 'Weekly Portfolio Summary',
        portfolioOverview: '📊 Portfolio Overview',
        totalValue: 'Total Value',
        totalCost: 'Total Cost',
        totalPnL: 'Total P&L',
        accounts: 'Accounts',
        positions: 'Positions',
        thisWeekActivity: "💰 This Week's Activity",
        expenses: 'Expenses',
        income: 'Income',
        net: 'Net',
        transactions: 'Transactions',
        topExpenseCategories: '📈 Top Expense Categories',
        actionRequiredOptions: '🔔 Action Required: Update Option Prices',
        optionsNotice: 'We noticed you have options in your portfolio. Since real-time option data is limited, please ensure your option prices are up to date to maintain accurate portfolio valuation.',
        updatePricesNow: 'Update Prices Now',
        viewDashboard: 'View Dashboard',
        hello: 'Hello',
        emailIntro: "Here's your weekly portfolio summary for the week ending",
        weekEnding: 'Week ending',
        bestRegards: 'Best regards,',
        ascentTeam: 'Ascent Team'
      },
      he: {
        weeklySummaryTitle: 'סיכום תיק שבועי',
        portfolioOverview: '📊 סקירה כללית של התיק',
        totalValue: 'שווי כולל',
        totalCost: 'עלות כוללת',
        totalPnL: 'רווח/הפסד כולל',
        accounts: 'חשבונות',
        positions: 'פוזיציות',
        thisWeekActivity: "💰 פעילות השבוע",
        expenses: 'הוצאות',
        income: 'הכנסות',
        net: 'נטו',
        transactions: 'עסקאות',
        topExpenseCategories: '📈 קטגוריות הוצאה מובילות',
        actionRequiredOptions: '🔔 פעולה נדרשת: עדכון מחירי אופציות',
        optionsNotice: 'שמנו לב שיש לך אופציות בתיק. מכיוון שנתוני אופציות בזמן אמת מוגבלים, אנא וודא שמחירי האופציות שלך מעודכנים כדי לשמור על הערכת שווי מדויקת.',
        updatePricesNow: 'עדכן מחירים עכשיו',
        viewDashboard: 'צפה בלוח הבקרה',
        hello: 'שלום',
        emailIntro: 'הנה סיכום התיק השבועי שלך לשבוע המסתייים ב-',
        weekEnding: 'שבוע מסתיים ב-',
        bestRegards: 'בברכה,',
        ascentTeam: 'צוות Ascent'
      },
      ru: {
        weeklySummaryTitle: 'Еженедельная сводка портфеля',
        portfolioOverview: '📊 Обзор портфеля',
        totalValue: 'Общая стоимость',
        totalCost: 'Общая стоимость покупки',
        totalPnL: 'Общий P&L',
        accounts: 'Счета',
        positions: 'Позиции',
        thisWeekActivity: "💰 Активность за неделю",
        expenses: 'Расходы',
        income: 'Доходы',
        net: 'Личный доход',
        transactions: 'Транзакции',
        topExpenseCategories: '📈 Топ категорий расходов',
        actionRequiredOptions: '🔔 Требуется действие: Обновите цены опционов',
        optionsNotice: 'Мы заметили, что в вашем портфеле есть опционы. Поскольку данные об опционах в реальном времени ограничены, пожалуйста, убедитесь, что цены актуальны.',
        updatePricesNow: 'Обновить цены сейчас',
        viewDashboard: 'Перейти к панели',
        hello: 'Здравствуйте',
        emailIntro: 'Вот ваша еженедельная сводка портфеля за неделю, заканчивающуюся',
        weekEnding: 'Неделя заканчивается',
        bestRegards: 'С уважением,',
        ascentTeam: 'Команда Ascent'
      }
    };

    for (const user of users) {
      try {
        const lang = user.language || 'en';
        const t = (key) => translations[lang][key] || translations['en'][key];

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
          return new Intl.NumberFormat(lang === 'he' ? 'he-IL' : (lang === 'ru' ? 'ru-RU' : 'en-US'), {
            style: 'currency',
            currency: currency,
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
          }).format(amount || 0);
        };

        // Format date based on locale
        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const formattedDate = new Date().toLocaleDateString(lang === 'he' ? 'he-IL' : (lang === 'ru' ? 'ru-RU' : 'en-US'), dateOptions);

        const topCategories = Object.entries(expensesByCategory)
          .sort(([, a], [, b]) => b - a)
          .slice(0, 5)
          .map(([cat, amount]) => `• ${cat}: ${formatCurrency(amount)}`)
          .join('\n');

        const emailBody = `${t('hello')} ${user.full_name || 'User'},

${t('emailIntro')} ${formattedDate}:

${t('portfolioOverview')}:
• ${t('totalValue')}: ${formatCurrency(totalValue)}
• ${t('totalCost')}: ${formatCurrency(totalCost)}
• ${t('totalPnL')}: ${formatCurrency(totalPnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent}%)
• ${t('accounts')}: ${accounts.length}
• ${t('positions')}: ${positions.length}

${t('thisWeekActivity')}:
• ${t('expenses')}: ${formatCurrency(weekExpenses)}
• ${t('income')}: ${formatCurrency(weekIncome)}
• ${t('net')}: ${formatCurrency(weekIncome - weekExpenses)}
• ${t('transactions')}: ${weekTransactions.length}

${topCategories ? `\n${t('topExpenseCategories')}:\n${topCategories}` : ''}
${positions.some(p => p.assetType === 'Option') ? `
${t('actionRequiredOptions')}
${t('optionsNotice')}
${process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}/portfolio
` : ''}

${t('bestRegards')}
${t('ascentTeam')}`;

        const summaryContent = `
          <div dir="${lang === 'he' ? 'rtl' : 'ltr'}" style="text-align: ${lang === 'he' ? 'right' : 'left'}">
            <p>${t('hello')} <strong>${user.full_name || 'User'}</strong>,</p>
            <p>${t('emailIntro')} ${formattedDate}</p>
            
            <div style="background: #e8f5e9; padding: 20px; border-radius: 8px; margin: 20px 0; border-${lang === 'he' ? 'right' : 'left'}: 4px solid #4caf50;">
              <h2 style="color: #092635; margin-top: 0; font-size: 18px;">${t('portfolioOverview')}</h2>
              <p style="margin: 5px 0;"><strong>${t('totalValue')}:</strong> ${formatCurrency(totalValue)}</p>
              <p style="margin: 5px 0;"><strong>${t('totalCost')}:</strong> ${formatCurrency(totalCost)}</p>
              <p style="margin: 5px 0;"><strong>${t('totalPnL')}:</strong> <span style="color: ${totalPnl >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${formatCurrency(totalPnl)} (${pnlPercent > 0 ? '+' : ''}${pnlPercent}%)</span></p>
              <p style="margin: 5px 0;"><strong>${t('accounts')}:</strong> ${accounts.length}</p>
              <p style="margin: 5px 0;"><strong>${t('positions')}:</strong> ${positions.length}</p>
            </div>
            
            <div style="background: #fff3e0; padding: 20px; border-radius: 8px; margin: 20px 0; border-${lang === 'he' ? 'right' : 'left'}: 4px solid #ff9800;">
              <h2 style="color: #092635; margin-top: 0; font-size: 18px;">${t('thisWeekActivity')}</h2>
              <p style="margin: 5px 0;"><strong>${t('expenses')}:</strong> ${formatCurrency(weekExpenses)}</p>
              <p style="margin: 5px 0;"><strong>${t('income')}:</strong> ${formatCurrency(weekIncome)}</p>
              <p style="margin: 5px 0;"><strong>${t('net')}:</strong> <span style="color: ${(weekIncome - weekExpenses) >= 0 ? '#4caf50' : '#f44336'}; font-weight: bold;">${formatCurrency(weekIncome - weekExpenses)}</span></p>
              <p style="margin: 5px 0;"><strong>${t('transactions')}:</strong> ${weekTransactions.length}</p>
            </div>
            
            ${topCategories ? `
            <div style="background: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0; border-${lang === 'he' ? 'right' : 'left'}: 4px solid #2196f3;">
              <h2 style="color: #092635; margin-top: 0; font-size: 18px;">${t('topExpenseCategories')}</h2>
              <pre style="margin: 10px 0; font-family: inherit; white-space: pre-wrap;">${topCategories}</pre>
            </div>
            ` : ''}

            ${positions.some(p => p.assetType === 'Option') ? `
            <div style="background: #fff8e1; padding: 20px; border-radius: 8px; margin: 20px 0; border-${lang === 'he' ? 'right' : 'left'}: 4px solid #ffc107;">
              <h2 style="color: #092635; margin-top: 0; font-size: 18px;">${t('actionRequiredOptions')}</h2>
              <p style="margin: 5px 0;">${t('optionsNotice')}</p>
              <div style="margin-top: 15px;">
                <a href="${process.env.NEXT_PUBLIC_APP_URL || process.env.FRONTEND_URL || 'http://localhost:5173'}/portfolio" style="background-color: #ffc107; color: #000; padding: 8px 16px; text-decoration: none; border-radius: 4px; font-weight: bold; font-size: 14px; display: inline-block;">${t('updatePricesNow')}</a>
              </div>
            </div>
            ` : ''}
          </div>
        `;

        const emailHtml = getEmailTemplate({
          language: lang,
          title: t('weeklySummaryTitle'),
          body: summaryContent,
          cta: {
            text: t('viewDashboard'),
            link: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'
          }
        });

        // Send email using the send-email integration
        const emailResult = await sendEmail({
          to: user.email,
          subject: `${t('weeklySummaryTitle')} - ${formattedDate}`,
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
