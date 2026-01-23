import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Upload, FileText, Loader2, AlertCircle } from 'lucide-react';
import { ascent } from '@/api/client';
import { toast } from 'sonner';
import { useTheme } from '../ThemeProvider';
import { cn } from '@/lib/utils';

export default function ImportExportSection({ accounts, positions, transactions }) {
  const { colors, t } = useTheme();
  const [importType, setImportType] = useState('accounts');
  const [importing, setImporting] = useState(false);
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

  const handleExport = async (type) => {
    setExporting(true);
    try {
      let csvContent, filename;

      if (type === 'accounts') {
        const headers = ['name', 'type', 'baseCurrency', 'initialInvestment', 'totalDeposits', 'totalWithdrawals', 'totalFees', 'notes'];
        csvContent = formatCSV(accounts, headers);
        filename = `accounts_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'positions') {
        const headers = ['accountId', 'symbol', 'assetType', 'quantity', 'averageBuyPrice', 'currentPrice', 'currency', 'notes'];
        csvContent = formatCSV(positions, headers);
        filename = `positions_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'transactions') {
        const headers = ['date', 'type', 'category', 'description', 'amount', 'currency', 'relatedAccountId'];
        csvContent = formatCSV(transactions, headers);
        filename = `transactions_${new Date().toISOString().split('T')[0]}.csv`;
      } else if (type === 'all') {
        // Export all data as separate CSVs in a zip would require additional library
        // For now, export as combined file with sections
        const accountsCsv = formatCSV(accounts, ['name', 'type', 'baseCurrency', 'initialInvestment', 'totalDeposits', 'totalWithdrawals', 'totalFees', 'notes']);
        const positionsCsv = formatCSV(positions, ['accountId', 'symbol', 'assetType', 'quantity', 'averageBuyPrice', 'currentPrice', 'currency', 'notes']);
        const transactionsCsv = formatCSV(transactions, ['date', 'type', 'category', 'description', 'amount', 'currency', 'relatedAccountId']);
        
        csvContent = `ACCOUNTS\n${accountsCsv}\n\nPOSITIONS\n${positionsCsv}\n\nTRANSACTIONS\n${transactionsCsv}`;
        filename = `wealthtracker_full_export_${new Date().toISOString().split('T')[0]}.csv`;
      }

      downloadCSV(csvContent, filename);
      toast.success(`${type} data exported successfully!`);
    } catch (error) {
      console.error('Export error:', error);
      toast.error('Failed to export data');
    } finally {
      setExporting(false);
    }
  };

  const handleImport = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      // Upload file first
      const { file_url } = await ascent.integrations.Core.UploadFile({ file });

      // Define JSON schema based on import type
      let jsonSchema;
      if (importType === 'accounts') {
        jsonSchema = {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              type: { type: 'string', enum: ['Investment', 'IRA', 'Pension', 'Savings', 'Other'] },
              baseCurrency: { type: 'string' },
              initialInvestment: { type: 'number' },
              totalDeposits: { type: 'number' },
              totalWithdrawals: { type: 'number' },
              totalFees: { type: 'number' },
              notes: { type: 'string' }
            },
            required: ['name', 'type', 'baseCurrency', 'initialInvestment']
          }
        };
      } else if (importType === 'positions') {
        jsonSchema = {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              accountId: { type: 'string' },
              symbol: { type: 'string' },
              assetType: { type: 'string' },
              quantity: { type: 'number' },
              averageBuyPrice: { type: 'number' },
              currentPrice: { type: 'number' },
              currency: { type: 'string' },
              notes: { type: 'string' }
            },
            required: ['accountId', 'symbol', 'assetType', 'quantity', 'averageBuyPrice', 'currency']
          }
        };
      } else if (importType === 'transactions') {
        jsonSchema = {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              date: { type: 'string' },
              type: { type: 'string', enum: ['Expense', 'Income'] },
              category: { type: 'string' },
              description: { type: 'string' },
              amount: { type: 'number' },
              currency: { type: 'string' },
              relatedAccountId: { type: 'string' }
            },
            required: ['date', 'type', 'category', 'description', 'amount', 'currency']
          }
        };
      }

      // Extract data from uploaded file
      const result = await ascent.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: jsonSchema
      });

      if (result.status === 'error') {
        toast.error(`Import failed: ${result.details}`);
        return;
      }

      // Bulk insert the extracted data
      const data = result.output;
      if (!Array.isArray(data) || data.length === 0) {
        toast.error('No valid data found in file');
        return;
      }

      if (importType === 'accounts') {
        await ascent.entities.Account.bulkCreate(data);
      } else if (importType === 'positions') {
        await ascent.entities.Position.bulkCreate(data);
      } else if (importType === 'transactions') {
        await ascent.entities.ExpenseTransaction.bulkCreate(data);
      }

      toast.success(`Successfully imported ${data.length} ${importType}!`);
      
      // Reload page to show new data
      setTimeout(() => window.location.reload(), 1500);
    } catch (error) {
      console.error('Import error:', error);
      toast.error('Failed to import data. Please check the file format.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  };

  return (
    <Card className={cn(colors.cardBg, colors.cardBorder)}>
      <CardHeader>
        <div className="flex items-center gap-3">
          <FileText className="w-5 h-5 text-[#5C8374]" />
          <CardTitle className={colors.accentText}>{t('importExportData')}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Import Section */}
        <div className="space-y-4">
          <div className={cn("flex items-center gap-2 pb-2 border-b", colors.borderLight)}>
            <Upload className="w-4 h-4 text-[#5C8374]" />
            <h3 className={cn("font-semibold", colors.textPrimary)}>{t('importData')}</h3>
          </div>
          
          <div className={cn("rounded-lg p-4 space-y-3", colors.bgTertiary)}>
            <div className="flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-yellow-400 mt-0.5 flex-shrink-0" />
              <div className={cn("text-sm", colors.textTertiary)}>
                <p className="mb-2">{t('uploadCsvFormats')}</p>
                <ul className="list-disc list-inside space-y-1 text-xs">
                  <li><strong>Accounts:</strong> name, type, baseCurrency, initialInvestment, totalDeposits, totalWithdrawals, totalFees, notes</li>
                  <li><strong>Positions:</strong> accountId, symbol, assetType, quantity, averageBuyPrice, currentPrice, currency, notes</li>
                  <li><strong>Transactions:</strong> date, type, category, description, amount, currency, relatedAccountId</li>
                </ul>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className={colors.textSecondary}>{t('importType')}</Label>
              <Select value={importType} onValueChange={setImportType}>
                <SelectTrigger className={cn(colors.bgTertiary, colors.border, colors.textPrimary)}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className={cn(colors.cardBg, colors.cardBorder)}>
                  <SelectItem value="accounts">{t('accounts')}</SelectItem>
                  <SelectItem value="positions">{t('positions')}</SelectItem>
                  <SelectItem value="transactions">{t('transactions')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label className={colors.textSecondary}>{t('selectCsvFile')}</Label>
              <div className="relative">
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleImport}
                  disabled={importing}
                  className={cn(colors.bgTertiary, colors.border, colors.textPrimary, "file:mr-4 file:py-2 file:px-4 file:rounded file:border-0 file:bg-[#5C8374] file:text-white file:cursor-pointer hover:file:bg-[#5C8374]/80")}
                />
                {importing && (
                  <div className={cn("absolute inset-0 flex items-center justify-center rounded", colors.bgTertiary)}>
                    <Loader2 className={cn("w-5 h-5 animate-spin", colors.accentText)} />
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Export Section */}
        <div className={cn("space-y-4 pt-4 border-t", colors.borderLight)}>
          <div className="flex items-center gap-2 pb-2">
            <Download className="w-4 h-4 text-[#5C8374]" />
            <h3 className={cn("font-semibold", colors.textPrimary)}>{t('exportData')}</h3>
          </div>

          <p className={cn("text-sm", colors.textTertiary)}>
            {t('downloadDataCsv')}
          </p>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Button
              onClick={() => handleExport('accounts')}
              disabled={exporting || accounts.length === 0}
              variant="outline"
              className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {t('accounts')}
            </Button>

            <Button
              onClick={() => handleExport('positions')}
              disabled={exporting || positions.length === 0}
              variant="outline"
              className={cn(colors.bgTertiary, colors.border, colors.textSecondary, "hover:bg-[#5C8374]/20")}
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {t('positions')}
            </Button>

            <Button
              onClick={() => handleExport('transactions')}
              disabled={exporting || transactions.length === 0}
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
              onClick={() => handleExport('all')}
              disabled={exporting}
              className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white"
            >
              {exporting ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Download className="w-4 h-4 mr-2" />
              )}
              {t('exportAll')}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}