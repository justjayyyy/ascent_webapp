import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { KeyRound, Loader2, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PasswordField } from '@/components/auth/AuthParts';
import { PublicCard, usePublicLanguage } from '@/components/auth/PublicCard';
import { useAuth } from '@/lib/AuthContext';
import { isCoarsePointer } from '@/lib/pointer';

// Reached from the emailed "choose a new password" link. Saving signs in (and signs out other devices).
export default function ResetPassword() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { resetPassword } = useAuth();
  const { t } = usePublicLanguage();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [errorKey, setErrorKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [invalid, setInvalid] = useState(false);

  const fail = (message) => { setError(message); setErrorKey((k) => k + 1); };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (password.length < 6) return fail(t('authPasswordShort'));
    setBusy(true);
    try {
      await resetPassword(token, password);
      navigate('/Dashboard', { replace: true });
    } catch (err) {
      setBusy(false);
      if (err?.status === 400 && /link/i.test(err.message || '')) setInvalid(true);
      else fail(err?.message || t('olFailed'));
    }
  };

  if (invalid) {
    return (
      <PublicCard>
        <CardContent className="space-y-4 p-6 text-center">
          <UserX className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="text-pretty text-foreground">{t('resetInvalid')}</p>
          <Button asChild className="h-11 rounded-xl"><Link to="/login">{t('resetBackToSignIn')}</Link></Button>
        </CardContent>
      </PublicCard>
    );
  }

  return (
    <PublicCard>
      <CardHeader className="text-center">
        <KeyRound className="mx-auto mb-2 h-10 w-10 text-primary" aria-hidden="true" />
        <CardTitle className="text-2xl font-bold text-foreground">{t('resetTitle')}</CardTitle>
        <CardDescription className="text-pretty">{t('resetBody')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={submit} noValidate className="space-y-5">
          <PasswordField
            flow={{ t }}
            id="reset-password"
            label={t('resetNewPassword')}
            autoComplete="new-password"
            meter
            hint={t('authPasswordHint')}
            value={password}
            onChange={(e) => { setPassword(e.target.value); if (error) setError(null); }}
            error={error}
            errorKey={errorKey}
            autoFocus={!isCoarsePointer()}
          />
          <Button type="submit" disabled={busy} className="h-11 w-full rounded-xl">
            {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
            {t('resetSave')}
          </Button>
          <p className="text-center text-sm">
            <Link to="/login" className="inline-flex min-h-11 items-center font-medium text-primary underline-offset-4 hover:underline">{t('resetBackToSignIn')}</Link>
          </p>
        </form>
      </CardContent>
    </PublicCard>
  );
}
