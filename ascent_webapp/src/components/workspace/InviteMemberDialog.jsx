import React, { useEffect, useState } from 'react';
import { Loader2, MailWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTheme } from '../ThemeProvider';
import ResponsiveModal from './ResponsiveModal';
import PermissionEditor from './PermissionEditor';
import InviteShare from './InviteShare';
import { fmt, isValidEmail, presetFor } from './utils';

const initialAccess = () => ({ role: 'editor', permissions: presetFor('editor') });

export default function InviteMemberDialog({ open, onOpenChange, workspaceName, canGrantAdmin, onInvite }) {
  const { t } = useTheme();
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState(initialAccess);
  const [error, setError] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(null);

  useEffect(() => {
    if (!open) return;
    setEmail('');
    setAccess(initialAccess());
    setError('');
    setSending(false);
    setSent(null);
  }, [open]);

  const submit = async (e) => {
    e?.preventDefault();
    const value = email.trim().toLowerCase();
    if (!isValidEmail(value)) {
      setError(t('wsInvalidEmail'));
      return;
    }
    setError('');
    setSending(true);
    try {
      const result = await onInvite({ email: value, role: access.role, permissions: access.permissions });
      if (result?.inviteLink) setSent({ link: result.inviteLink, email: value, emailSent: result.emailSent !== false });
      else onOpenChange(false);
    } catch (err) {
      setError(err?.message || t('wsFailed'));
    } finally {
      setSending(false);
    }
  };

  const title = fmt(t('wsInviteTitle'), { workspace: workspaceName || '' });

  if (sent) {
    return (
      <ResponsiveModal
        open={open}
        onOpenChange={onOpenChange}
        title={t('wsInviteSent')}
        footer={<Button className="h-11 rounded-xl sm:h-10" onClick={() => onOpenChange(false)}>OK</Button>}
      >
        {!sent.emailSent && (
          <p className="mb-4 flex items-start gap-2 text-sm text-danger text-pretty">
            <MailWarning className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            {t('wsInviteEmailFailed')}
          </p>
        )}
        <InviteShare
          link={sent.link}
          email={sent.email}
          intro={sent.emailSent ? fmt(t('wsEmailSentTo'), { email: sent.email }) : undefined}
        />
      </ResponsiveModal>
    );
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={t('wsInviteDesc')}
      footer={
        <>
          <Button variant="ghost" className="h-11 rounded-xl sm:h-10" onClick={() => onOpenChange(false)} disabled={sending}>
            {t('wsCancel')}
          </Button>
          <Button className="h-11 rounded-xl sm:h-10" onClick={submit} disabled={sending || !email.trim()}>
            {sending && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('wsSendInvite')}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-5" noValidate>
        <div className="space-y-2">
          <Label htmlFor="invite-email">{t('wsEmailLabel')}</Label>
          <Input
            id="invite-email"
            type="email"
            inputMode="email"
            autoComplete="off"
            dir="ltr"
            autoFocus
            value={email}
            onChange={(e) => { setEmail(e.target.value); if (error) setError(''); }}
            aria-invalid={!!error}
            aria-describedby={error ? 'invite-email-error' : undefined}
            placeholder="name@example.com"
            className="h-11 rounded-[14px]"
          />
          {error && <p id="invite-email-error" role="alert" className="text-sm text-danger">{error}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t('wsRoleLabel')}</Label>
          <PermissionEditor value={access} onChange={setAccess} canGrantAdmin={canGrantAdmin} />
        </div>
        <button type="submit" className="hidden" aria-hidden="true" tabIndex={-1} />
      </form>
    </ResponsiveModal>
  );
}
