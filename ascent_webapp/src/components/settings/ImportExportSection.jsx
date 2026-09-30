import { PORTFOLIO_ENABLED } from '@/lib/features';
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Database, Loader2, Receipt, StickyNote, PieChart, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../ThemeProvider';
import { Section, Group, Row } from './SettingsShell';
import StatementImportDialog from './StatementImportDialog';
import { useAuth } from '@/lib/AuthContext';

export default function ImportExportSection({ accounts, positions, transactions, notes, budgets, categories, cards, index }) {
  const { t } = useTheme();
  const { hasPermission } = useAuth();
  const [exporting, setExporting] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

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
    setExporting(page);
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
      setExporting(null);
    }
  };


  const datasets = [
    PORTFOLIO_ENABLED && {
      key: 'portfolio', label: t('portfolio'), icon: PieChart,
      count: (accounts?.length || 0) + (positions?.length || 0),
    },
    {
      key: 'expenses', label: t('expenses'), icon: Receipt,
      count: (transactions?.length || 0) + (budgets?.length || 0) + (categories?.length || 0) + (cards?.length || 0),
    },
    { key: 'notes', label: t('notes'), icon: StickyNote, count: notes?.length || 0 },
  ].filter(Boolean);

  return (
    <Section id="data" index={index} icon={Database} title={t('setNavData')} description={t('setDataDesc')}>
      {hasPermission('editExpenses') && (
        <Group className="mb-4">
          <Row
            label={<span className="flex items-center gap-2"><FileSpreadsheet className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{t('impRow')}</span>}
            description={t('impRowDesc')}
          >
            <Button onClick={() => setImportOpen(true)} variant="secondary" aria-label={t('impTitle')} className="h-11 rounded-xl sm:h-9">
              <Upload className="h-4 w-4 sm:me-1.5" aria-hidden="true" />
              <span className="max-sm:sr-only">{t('impChoose')}</span>
            </Button>
          </Row>
        </Group>
      )}
      <StatementImportDialog open={importOpen} onOpenChange={setImportOpen} />
      <Group>
        {datasets.map(({ key, label, icon: Icon, count }) => (
          <Row
            key={key}
            label={<span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{label}</span>}
            description={count ? <><span className="tabular-nums">{count}</span> {t('setItems')}</> : t('setNothingToExport')}
          >
            <Button
              onClick={() => handleExport(key)}
              disabled={!!exporting || !count}
              variant="secondary"
              aria-label={`${t('setDownloadCsv')}: ${label}`}
              className="h-11 rounded-xl sm:h-9"
            >
              {exporting === key ? <Loader2 className="h-4 w-4 animate-spin sm:me-1.5" aria-hidden="true" /> : <Download className="h-4 w-4 sm:me-1.5" aria-hidden="true" />}
              <span className="max-sm:sr-only">{t('setDownloadCsv')}</span>
            </Button>
          </Row>
        ))}
      </Group>
    </Section>
  );
}
