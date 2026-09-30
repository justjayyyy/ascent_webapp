import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle, DrawerDescription, DrawerFooter } from '@/components/ui/drawer';
import { useIsMobile } from '@/hooks/use-mobile';

// Bottom sheet on phones, centred dialog elsewhere.
export default function ResponsiveModal({ open, onOpenChange, title, description, footer, children }) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent>
          <DrawerHeader className="text-start">
            <DrawerTitle>{title}</DrawerTitle>
            {description && <DrawerDescription>{description}</DrawerDescription>}
          </DrawerHeader>
          <div className="max-h-[60dvh] overflow-y-auto px-4 pb-2">{children}</div>
          {footer && <DrawerFooter className="pb-[calc(1rem+env(safe-area-inset-bottom))]">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-lg overflow-y-auto">
        <DialogHeader className="text-start">
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {children}
        {footer && <DialogFooter className="gap-2 sm:gap-2">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  );
}
