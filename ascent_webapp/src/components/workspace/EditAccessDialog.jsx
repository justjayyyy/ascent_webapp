import React, { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '../ThemeProvider';
import ResponsiveModal from './ResponsiveModal';
import PermissionEditor from './PermissionEditor';
import MemberAvatar from './MemberAvatar';
import { memberName } from './utils';

export default function EditAccessDialog({ member, open, onOpenChange, canGrantAdmin, onSave }) {
  const { t } = useTheme();
  const [access, setAccess] = useState({ role: 'viewer', permissions: {} });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open && member) setAccess({ role: member.role, permissions: member.permissions || {} });
  }, [open, member]);

  if (!member) return null;

  const save = async () => {
    setSaving(true);
    try {
      await onSave(member, access);
      onOpenChange(false);
    } catch {
      // The caller already said what went wrong; the dialog stays open to try again
    } finally {
      setSaving(false);
    }
  };

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={t('wsEditAccess')}
      footer={
        <>
          <Button variant="ghost" className="h-11 rounded-xl sm:h-10" onClick={() => onOpenChange(false)} disabled={saving}>
            {t('wsCancel')}
          </Button>
          <Button className="h-11 rounded-xl sm:h-10" onClick={save} disabled={saving}>
            {saving && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('wsSave')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <MemberAvatar member={member} />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-foreground">{memberName(member)}</p>
            <p className="truncate text-sm text-muted-foreground" dir="ltr">{member.email}</p>
          </div>
        </div>
        <PermissionEditor value={access} onChange={setAccess} canGrantAdmin={canGrantAdmin} />
      </div>
    </ResponsiveModal>
  );
}
