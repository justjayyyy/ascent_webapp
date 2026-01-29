import React, { useState } from 'react';
import { Calendar } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/components/ThemeProvider';
import CalendarModal from './CalendarModal';

/**
 * Calendar Button - Different styles for different placements
 * 
 * @param {string} variant - 'sidebar' | 'header' | 'floating' | 'icon'
 */
export default function CalendarButton({ variant = 'icon', className }) {
  const [isOpen, setIsOpen] = useState(false);
  const { colors, t, isRTL } = useTheme();

  const renderButton = () => {
    switch (variant) {
      case 'sidebar':
        // Full width button for sidebar navigation
        return (
          <button
            onClick={() => setIsOpen(true)}
            className={cn(
              "flex items-center w-full px-4 py-3 text-sm font-medium rounded-lg transition-all duration-200",
              colors.textSecondary,
              "hover:bg-[#5C8374]/20",
              className
            )}
          >
            <Calendar className={cn("w-5 h-5", !className?.includes('justify-center') && (isRTL ? "ml-3" : "mr-3"))} />
            {!className?.includes('justify-center') && (t('calendar') || 'Calendar')}
          </button>
        );

      case 'header':
        // Compact button for header/toolbar
        return (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsOpen(true)}
            className={cn(
              "flex items-center gap-2",
              colors.textSecondary,
              "hover:bg-[#5C8374]/20",
              className
            )}
          >
            <Calendar className="w-4 h-4" />
            <span className="hidden sm:inline">{t('calendar') || 'Calendar'}</span>
          </Button>
        );

      case 'floating':
        // Floating action button
        return (
          <button
            onClick={() => setIsOpen(true)}
            className={cn(
              "fixed z-50 p-4 rounded-full shadow-lg transition-all duration-200",
              "bg-[#5C8374] text-white hover:bg-[#5C8374]/90 hover:scale-110",
              "bottom-6",
              isRTL ? "left-6" : "right-6",
              className
            )}
            title={t('calendar') || 'Calendar'}
          >
            <Calendar className="w-6 h-6" />
          </button>
        );

      case 'icon':
      default:
        // Simple icon button
        return (
          <button
            onClick={() => setIsOpen(true)}
            className={cn(
              "p-2 rounded-lg transition-colors",
              colors.textSecondary,
              "hover:bg-[#5C8374]/20",
              className
            )}
            title={t('calendar') || 'Calendar'}
          >
            <Calendar className="w-5 h-5" />
          </button>
        );
    }
  };

  return (
    <>
      {renderButton()}
      {CalendarModal && <CalendarModal open={isOpen} onOpenChange={setIsOpen} />}
    </>
  );
}

// Pre-configured exports for convenience
export function SidebarCalendarButton(props) {
  return <CalendarButton variant="sidebar" {...props} />;
}

export function HeaderCalendarButton(props) {
  return <CalendarButton variant="header" {...props} />;
}

export function FloatingCalendarButton(props) {
  return <CalendarButton variant="floating" {...props} />;
}

export function IconCalendarButton(props) {
  return <CalendarButton variant="icon" {...props} />;
}

