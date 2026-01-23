import React from 'react';
import { cn } from '@/lib/utils';

export default function BlurValue({ children, blur = false, className = '' }) {
  if (!blur) return <>{children}</>;
  
  return (
    <span className={cn('select-none', className)}>
      ••••••
    </span>
  );
}