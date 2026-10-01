import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { CheckCircle2, Loader2, MailX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CardContent } from '@/components/ui/card';
import { PublicCard, usePublicLanguage } from '@/components/auth/PublicCard';
import { ascent } from '@/api/client';
import { useAuth } from '@/lib/AuthContext';

// Reached from the emailed confirmation link; works signed in or out, since it may open on another device.
export default function VerifyEmail() {
  const { token } = useParams();
  const { user, setUser, isAuthenticated } = useAuth();
  const { t } = usePublicLanguage(user?.language);
  const [state, setState] = useState('checking');
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // a token works once; a second run would report it as used
    started.current = true;
    ascent.auth.confirmEmail(token)
      .then(() => {
        setState('done');
        setUser((u) => (u ? { ...u, emailVerified: true } : u));
      })
      .catch(() => setState('failed'));
  }, [token, setUser]);

  return (
    <PublicCard>
      <CardContent className="space-y-4 p-6 text-center">
        {state === 'checking' && (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" aria-hidden="true" />
            <p className="text-muted-foreground" role="status">{t('verifyChecking')}</p>
          </>
        )}
        {state === 'done' && (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-success" aria-hidden="true" />
            <h1 className="text-xl font-semibold text-foreground">{t('verifyDone')}</h1>
            <p className="text-pretty text-sm text-muted-foreground">{t('verifyDoneBody')}</p>
          </>
        )}
        {state === 'failed' && (
          <>
            <MailX className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
            <p className="text-pretty text-foreground">{t('verifyFailed')}</p>
          </>
        )}
        {state !== 'checking' && (
          <Button asChild className="h-11 rounded-xl">
            <Link to={isAuthenticated ? '/Dashboard' : '/login'}>{t('verifyOpenApp')}</Link>
          </Button>
        )}
      </CardContent>
    </PublicCard>
  );
}
