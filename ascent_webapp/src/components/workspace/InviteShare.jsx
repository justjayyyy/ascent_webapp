import React from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { Copy } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { useTheme } from '../ThemeProvider';
import { fmt } from './utils';

// QR code and copyable link for one invitation. The QR stays black on white so phone cameras can read it in any palette.
export default function InviteShare({ link, email, intro }) {
  const { t } = useTheme();

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
      toast.success(t('wsLinkCopied'));
    } catch {
      toast.error(t('wsFailed'));
    }
  };

  return (
    <div className="space-y-4">
      {intro && <p className="text-sm text-muted-foreground text-pretty">{intro}</p>}
      <div className="mx-auto w-fit rounded-2xl bg-white p-4">
        <QRCodeSVG value={link} size={176} level="M" fgColor="#000000" bgColor="#ffffff" role="img" aria-label={t('wsShowQr')} />
      </div>
      <p className="text-center text-sm text-muted-foreground text-pretty">{fmt(t('wsQrHint'), { email })}</p>
      <Button variant="secondary" className="h-11 w-full rounded-xl sm:h-10" onClick={copy}>
        <Copy className="me-1.5 h-4 w-4" aria-hidden="true" />
        {t('wsCopyLink')}
      </Button>
    </div>
  );
}
