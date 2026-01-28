import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTheme } from './ThemeProvider';
import { cn } from '@/lib/utils';
import { Sparkles } from 'lucide-react';

export default function WelcomeDialog({ open, onClose }) {
  const { colors, t, user } = useTheme();

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className={cn(colors.cardBg, colors.cardBorder, "max-w-lg")}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="w-20 h-20 bg-gradient-to-br from-[#5C8374] to-[#1B4242] rounded-full flex items-center justify-center">
              <Sparkles className="w-10 h-10 text-white" />
            </div>
          </div>
          <DialogTitle className={cn("text-2xl font-bold text-center", colors.textPrimary)}>
            {t('welcomeToAscent') || `Welcome to Ascent, ${user?.full_name || user?.email}!`}
          </DialogTitle>
          <DialogDescription className={cn("text-center text-base mt-2", colors.textSecondary)}>
            {t('welcomeMessage') || "We're excited to have you on board. Let's help you rise above your financial goals."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 mt-6">
          <div className={cn("p-4 rounded-lg border", colors.bgTertiary, colors.borderLight)}>
            <h3 className={cn("font-semibold mb-2", colors.textPrimary)}>
              {t('gettingStarted') || '🚀 Getting Started'}
            </h3>
            <ul className={cn("space-y-2 text-sm", colors.textSecondary)}>
              <li>• {t('step1CreateAccount') || 'Create your first investment account'}</li>
              <li>• {t('step2AddPositions') || 'Add your positions and track performance'}</li>
              <li>• {t('step3SetGoals') || 'Set financial goals and budgets'}</li>
              <li>• {t('step4TrackExpenses') || 'Track your income and expenses'}</li>
            </ul>
          </div>

          <div className={cn("p-4 rounded-lg border", colors.bgTertiary, colors.borderLight)}>
            <h3 className={cn("font-semibold mb-2", colors.textPrimary)}>
              {t('needHelp') || '💡 Need Help?'}
            </h3>
            <p className={cn("text-sm", colors.textSecondary)}>
              {t('exploreSettings') || 'Visit Settings to customize your preferences, manage notifications, and invite team members to collaborate.'}
            </p>
          </div>
        </div>

        <div className="flex justify-center mt-6">
          <Button
            onClick={onClose}
            className="bg-[#5C8374] hover:bg-[#5C8374]/80 text-white px-8"
          >
            {t('letsGetStarted') || "Let's Get Started!"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
