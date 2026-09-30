import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { cn } from '@/lib/utils';
import { memberName } from './utils';

const initialsOf = (label) => {
  const parts = label.trim().split(/[\s._-]+/).filter(Boolean);
  return ((parts[0]?.[0] || '?') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
};

export default function MemberAvatar({ member, online = false, pending = false, className }) {
  const label = memberName(member);
  return (
    <span className={cn('relative inline-flex shrink-0', className)}>
      <Avatar className={cn('h-10 w-10', pending && 'opacity-60')}>
        {member.avatar && <AvatarImage src={member.avatar} alt="" referrerPolicy="no-referrer" />}
        <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">{initialsOf(label)}</AvatarFallback>
      </Avatar>
      {online && (
        <span className="absolute -bottom-0.5 -end-0.5 h-3 w-3 rounded-full bg-success ring-2 ring-card" aria-hidden="true" />
      )}
    </span>
  );
}
