import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

export default function WelcomeDialog({ open, onClose }) {
  const { colors, t } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-lg")}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-primary to-card rounded-full flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-foreground" />
            </div>
          </div>
          <DialogTitle className={cn("text-2xl font-bold text-center", colors.textPrimary)}>
            {t('welcomeToAscent')}
          </DialogTitle>
          <DialogDescription className={cn("text-center text-base mt-2", colors.textSecondary)}>
            {t('welcomeMessage')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          <div className={cn("p-4 rounded-lg border", colors.bgTertiary, colors.borderLight)}>
            <h3 className={cn("font-semibold mb-2", colors.textPrimary)}>
              {t('gettingStarted')}
            </h3>
            <ul className={cn("space-y-2 text-sm", colors.textSecondary)}>
              <li>• {t('welcomeStepLog')}</li>
              <li>• {t('welcomeStepBudgets')}</li>
              <li>• {t('welcomeStepPlans')}</li>
              <li>• {t('welcomeStepHousehold')}</li>
            </ul>
          </div>

          <div className={cn("p-4 rounded-lg border", colors.bgTertiary, colors.borderLight)}>
            <h3 className={cn("font-semibold mb-2", colors.textPrimary)}>
              {t('needHelp')}
            </h3>
            <p className={cn("text-sm", colors.textSecondary)}>
              {t('exploreSettings')}
            </p>
          </div>
        </div>

        <div className="flex justify-center mt-6">
          <Button
            onClick={onClose}
            className="bg-primary hover:bg-primary/80 text-primary-foreground px-8"
          >
            {t('letsGetStarted')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
