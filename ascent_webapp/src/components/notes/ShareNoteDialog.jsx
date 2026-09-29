import React from 'react';
import { Link } from 'react-router-dom';
import { Copy, Share2, Users, Lock } from 'lucide-react';
import { toast } from 'sonner';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Button } from '@/components/ui/button';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { PersonDot } from './NoteParts';
import { fmt, noteToText } from './noteUtils';

const roleOf = (note, id) => note.collaborators?.find(c => c.userId === id)?.role || 'none';

export default function ShareNoteDialog({ open, onOpenChange, note, people, workspaceName, onChange, t }) {
  if (!note) return null;
  const isOwner = note.myAccess === 'owner';
  const others = people.list.filter(p => !p.isMe);
  const invitable = others.filter(p => !p.pending);
  const pending = others.filter(p => p.pending);
  const owner = people.byId[note.createdBy];

  const setRole = (person, role) => {
    const rest = (note.collaborators || []).filter(c => c.userId !== person.id);
    onChange({
      collaborators: role === 'none'
        ? rest
        : [...rest, { userId: person.id, email: person.email, role: role === 'editor' ? 'editor' : 'viewer' }],
    });
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(noteToText(note));
      toast.success(t('ntCopied'));
    } catch {
      toast.error(t('ntCopyFailed'));
    }
  };

  const shareVia = async () => {
    try {
      await navigator.share({ title: note.title || t('ntUntitled'), text: noteToText(note, { withTitle: false }) });
    } catch { /* dismissed */ }
  };

  const roleLabel = (r) => (r === 'editor' ? t('ntCanEdit') : r === 'viewer' ? t('ntCanView') : t('ntNoAccess'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-primary" /> {t('ntShareNote')}
          </DialogTitle>
          <DialogDescription>
            {isOwner ? t('ntShareDesc') : fmt(t('ntSharedWithYou'), { name: owner?.name || '' })}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Whole workspace */}
          <div className="flex items-start gap-3 rounded-2xl bg-foreground/5 p-3">
            <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              {note.isShared ? <Users className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium">{t('ntEveryone')}</p>
              <p className="text-xs text-muted-foreground">
                {note.isShared ? fmt(t('ntEveryoneOn'), { name: workspaceName || '' }) : t('ntEveryoneOff')}
              </p>
            </div>
            <Switch
              checked={!!note.isShared}
              disabled={!isOwner}
              onCheckedChange={(v) => onChange({ isShared: v })}
              aria-label={t('ntEveryone')}
            />
          </div>

          {/* People */}
          <div>
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{t('ntPeople')}</p>
            <ul className="space-y-1">
              {owner && (
                <li className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                  <PersonDot person={owner} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{owner.name}{owner.isMe ? ` (${t('ntYou')})` : ''}</p>
                    <p className="truncate text-xs text-muted-foreground">{owner.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('ntOwner')}</span>
                </li>
              )}
              {invitable.filter(p => p.id !== note.createdBy).map(p => {
                const role = roleOf(note, p.id);
                return (
                  <li key={p.id} className="flex items-center gap-3 rounded-xl px-1 py-1.5">
                    <PersonDot person={p} size={32} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.name}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                    </div>
                    {isOwner ? (
                      <Select value={role} onValueChange={(v) => setRole(p, v)}>
                        <SelectTrigger className="h-9 w-[7.5rem]" aria-label={`${p.name}: ${t('ntAccess')}`}>
                          <SelectValue>{roleLabel(role)}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">{t('ntNoAccess')}</SelectItem>
                          <SelectItem value="viewer">{t('ntCanView')}</SelectItem>
                          <SelectItem value="editor">{t('ntCanEdit')}</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      <span className="text-xs text-muted-foreground">{roleLabel(role === 'none' && note.isShared ? 'viewer' : role)}</span>
                    )}
                  </li>
                );
              })}
              {pending.map(p => (
                <li key={p.email} className="flex items-center gap-3 rounded-xl px-1 py-1.5 opacity-70">
                  <PersonDot person={p} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.email}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{t('ntInvitePending')}</span>
                </li>
              ))}
            </ul>

            {others.length === 0 && (
              <div className="rounded-2xl border border-dashed border-border p-4 text-center">
                <p className="text-sm text-muted-foreground">{t('ntNoMembers')}</p>
                <Button asChild variant="outline" size="sm" className="mt-3">
                  <Link to="/Settings" onClick={() => onOpenChange(false)}>{t('ntOpenSettings')}</Link>
                </Button>
              </div>
            )}
          </div>

          {!isOwner && <p className="text-xs text-muted-foreground">{t('ntOnlyOwnerShares')}</p>}

          <div className="flex flex-wrap gap-2 border-t border-border/60 pt-3">
            <Button variant="outline" size="sm" onClick={copyText}>
              <Copy /> {t('ntCopyText')}
            </Button>
            {typeof navigator !== 'undefined' && navigator.share && (
              <Button variant="outline" size="sm" onClick={shareVia}>
                <Share2 /> {t('ntShareVia')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
