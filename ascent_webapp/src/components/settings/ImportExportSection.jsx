import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, Database, Loader2, Receipt, StickyNote, FileSpreadsheet, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { useTheme } from '../ThemeProvider';
import { Section, Group, Row } from './SettingsShell';
import StatementImportDialog from './StatementImportDialog';
import { useAuth } from '@/lib/AuthContext';
import { DATASETS, downloadCSV } from '@/lib/exportData';

export default function ImportExportSection({ index }) {
  const { t } = useTheme();
  const { hasPermission } = useAuth();
  const [exporting, setExporting] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  // Fetched only when asked for, and complete (every transaction, not just what the app has loaded)
  const handleExport = async (key, label) => {
    setExporting(key);
    try {
      const { csv, filename, count } = await DATASETS[key].build();
      downloadCSV(csv, filename);
      toast.success(t('setExported').replace('{name}', label).replace('{count}', count));
    } catch (error) {
      console.error('Export error:', error);
      toast.error(t('exportFailed'));
    } finally {
      setExporting(null);
    }
  };

  const datasets = [
    { key: 'expenses', label: t('expenses'), icon: Receipt, description: t('setExportExpensesDesc') },
    { key: 'notes', label: t('notes'), icon: StickyNote, description: t('setExportNotesDesc') },
  ].filter((d) => d && (!DATASETS[d.key].permission || hasPermission(DATASETS[d.key].permission)));

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
        {datasets.map(({ key, label, icon: Icon, description }) => (
          <Row
            key={key}
            label={<span className="flex items-center gap-2"><Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />{label}</span>}
            description={description}
          >
            <Button
              onClick={() => handleExport(key, label)}
              disabled={!!exporting}
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
