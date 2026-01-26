import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Download, FileText, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

export default function ImportExportSection({ accounts, positions, transactions, notes, budgets, categories, cards }) {
  const { colors, t } = useTheme();
  const [exporting, setExporting] = useState(false);

  const formatCSV = (data, headers) => {
    const csvHeaders = headers.join(',');
    const csvRows = data.map(row => 
      headers.map(header => {
        const value = row[header];
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        return stringValue.includes(',') || stringValue.includes('"') 
          ? `"${stringValue.replace(/"/g, '""')}"` 
          : stringValue;
      }).join(',')
    );
    return [csvHeaders, ...csvRows].join('\n');
  };

  const downloadCSV = (csvContent, filename) => {
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExport = async (page) => {
    setExporting(true);
    try {
      let csvContent, filename;

      if (page === 'portfolio') {
        // Portfolio: accounts + positions
        const accountsHeaders = ['name', 'type', 'baseCurrency', 'initialInvestment', 'totalDeposits', 'totalWithdrawals', 'totalFees', 'notes'];
        const positionsHeaders = ['accountId', 'symbol', 'assetType', 'quantity', 'averageBuyPrice', 'currentPrice', 'currency', 'notes'];
        const accountsCsv = formatCSV(accounts || [], accountsHeaders);
        const positionsCsv = formatCSV(positions || [], positionsHeaders);
        csvContent = `ACCOUNTS\n${accountsCsv}\n\nPOSITIONS\n${positionsCsv}`;
        filename = `portfolio_export_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (page === 'expenses') {
        // Expenses: transactions + budgets + categories + cards
        const transactionsHeaders = ['date', 'type', 'category', 'description', 'amount', 'currency', 'paymentMethod', 'relatedAccountId'];
        const budgetsHeaders = ['category', 'monthlyLimit', 'alertThreshold', 'currency', 'year', 'month'];
        const categoriesHeaders = ['name', 'color', 'icon', 'type'];
        const cardsHeaders = ['name', 'type', 'lastFourDigits', 'bank', 'color', 'isActive'];
        const transactionsCsv = formatCSV(transactions || [], transactionsHeaders);
        const budgetsCsv = formatCSV(budgets || [], budgetsHeaders);
        const categoriesCsv = formatCSV(categories || [], categoriesHeaders);
        const cardsCsv = formatCSV(cards || [], cardsHeaders);
        csvContent = `TRANSACTIONS\n${transactionsCsv}\n\nBUDGETS\n${budgetsCsv}\n\nCATEGORIES\n${categoriesCsv}\n\nCARDS\n${cardsCsv}`;
        filename = `expenses_export_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (page === 'notes') {
        // Notes: notes
        const notesHeaders = ['title', 'content', 'color', 'tags', 'isPinned', 'created_date', 'updated_date'];
        const notesData = (notes || []).map(note => ({
          ...note,
          tags: Array.isArray(note.tags) ? note.tags.join(';') : note.tags || ''
        }));
        csvContent = formatCSV(notesData, notesHeaders);
        filename = `notes_export_${new Date().toISOString().split('T')[0]}.csv`;
      }

      downloadCSV(csvContent, filename);
      const pageName = page === 'portfolio' ? t('portfolio') : page === 'expenses' ? t('expenses') : t('notes');
      toast.success(`${pageName} ${t('exportedSuccessfully') || 'exported successfully'}!`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('exportFailed') || 'Failed to export data');
    } finally {
      setExporting(false);
    }
  };


  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-[#5C8374]" />
          <CardTitle className={colors.accentText}>{t('exportData')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <p className={cn("text-sm", colors.textTertiary)}>
          {t('downloadDataCsv')}
        </p>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Button
            onClick={() => handleExport('portfolio')}
            disabled={exporting || (!accounts?.length && !positions?.length)}
            variant="outline"
            className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {t('portfolio')}
          </Button>

          <Button
            onClick={() => handleExport('expenses')}
            disabled={exporting || (!transactions?.length && !budgets?.length && !categories?.length && !cards?.length)}
            variant="outline"
            className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {t('expenses')}
          </Button>

          <Button
            onClick={() => handleExport('notes')}
            disabled={exporting || !notes?.length}
            variant="outline"
            className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
          >
            {exporting ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-2" />
            )}
            {t('notes')}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}