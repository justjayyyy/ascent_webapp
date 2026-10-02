import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Loader2, Mail, ShieldCheck, UserX } from 'lucide-react';
import { toast } from 'sonner';
import { ascent } from '@/api/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/AuthContext';
import { rememberWorkspace } from '@/lib/session';
import { forgetInvite, forgetJoined, joinedThrough, rememberInvite } from '@/lib/pendingInvite';
import { isLanguage, translate, useLanguage } from '@/lib/translations';
import { fmt, roleLabel } from '@/components/workspace/utils';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

const pickLanguage = (userLanguage) => {
  if (isLanguage(userLanguage)) return userLanguage;
  const browser = (navigator.language || 'en').slice(0, 2);
  return isLanguage(browser) ? browser : 'en';
};

export default function AcceptInvitation() {
  const { token } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated, logout, refreshWorkspaces, workspaces, switchWorkspace } = useAuth();
  const [invitation, setInvitation] = useState(null);
  const [failed, setFailed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const language = pickLanguage(user?.language);
  const strings = useLanguage(language);
  const t = useMemo(() => (key) => translate(language, key), [language, strings]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await ascent.workspaces.invitation(token);
        if (!(data?.invitedEmail || data?.kind === 'link')) throw new Error('not_an_invitation');
        if (!cancelled) setInvitation(data);
      } catch {
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  const signedIn = isAuthenticated && !!user;
  const isLink = invitation?.kind === 'link';

  // Signed out: keep the invitation through sign-in (or sign-up), which joins it before anything else
  useEffect(() => {
    if (invitation && !signedIn && !(invitation.kind === 'link' && invitation.expired)) rememberInvite(token);
  }, [invitation, signedIn, token]);

  // Back here after signing in, already joined through this invitation: open that workspace
  const joinedWorkspace = useMemo(() => {
    const id = signedIn ? joinedThrough(token) : null;
    return id ? (workspaces || []).find((w) => String(w.id || w._id) === String(id)) || null : null;
  }, [signedIn, token, workspaces]);
  const handled = useRef(false); // accepting on this page shows its own confirmation
  useEffect(() => {
    if (!joinedWorkspace || handled.current) return;
    handled.current = true;
    forgetJoined();
    switchWorkspace(joinedWorkspace.id || joinedWorkspace._id);
    toast.success(fmt(t('wsJoined'), { workspace: joinedWorkspace.name }));
    navigate('/', { replace: true });
  }, [joinedWorkspace, switchWorkspace, navigate, t]);
  const emailMatches = signedIn && (isLink || user.email?.toLowerCase() === invitation?.invitedEmail?.toLowerCase());

  const handleGoogleCallback = async (response) => {
    if (!response.credential) return;
    setBusy(true);
    handled.current = true;
    forgetInvite();
    try {
      await ascent.auth.googleLogin(response.credential);
      rememberWorkspace(null);
      // Signing in alone only creates her own workspace: actually join the one she was invited to.
      try {
        await ascent.workspaces.acceptInvitation(token);
      } catch (acceptError) {
        if (acceptError?.status !== 409) throw acceptError; // already a member: just open it
      }
      rememberWorkspace(invitation.workspaceId);
      toast.success(fmt(t('wsJoined'), { workspace: invitation.workspaceName }));
      setTimeout(() => { window.location.href = '/'; }, 100);
    } catch (error) {
      toast.error(error.message || t('wsFailed'));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (!invitation || signedIn || !GOOGLE_CLIENT_ID) return undefined;
    const init = () => {
      const container = document.getElementById('google-signin-button');
      if (!window.google?.accounts?.id || !container) return;
      window.google.accounts.id.initialize({ client_id: GOOGLE_CLIENT_ID, callback: handleGoogleCallback, auto_select: false });
      container.innerHTML = '';
      window.google.accounts.id.renderButton(container, { type: 'standard', theme: 'filled_black', size: 'large', text: 'continue_with', shape: 'rectangular' });
    };
    if (window.google?.accounts?.id) {
      init();
      return undefined;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = init;
    document.body.appendChild(script);
    return () => script.remove();
  }, [invitation, signedIn]);

  const respond = async (accept) => {
    setBusy(true);
    handled.current = true;
    forgetInvite();
    try {
      if (accept) {
        await ascent.workspaces.acceptInvitation(token);
        rememberWorkspace(invitation.workspaceId);
        toast.success(fmt(t('wsJoined'), { workspace: invitation.workspaceName }));
        await refreshWorkspaces();
        window.location.href = '/';
      } else {
        await ascent.workspaces.declineInvitation(token);
        toast.success(t('wsInviteDeclined'));
        navigate('/');
      }
    } catch (error) {
      toast.error(error.message || t('wsFailed'));
      setBusy(false);
    }
  };

  const shell = (children) => (
    <div
      dir={language === 'he' ? 'rtl' : 'ltr'}
      className="flex min-h-dvh items-center justify-center bg-background p-4 pt-[calc(1rem+var(--safe-top))] pb-[calc(1rem+env(safe-area-inset-bottom))]"
    >
      <Card className="w-full max-w-md border-border bg-card">{children}</Card>
    </div>
  );

  if (isLoading || (joinedWorkspace && !busy)) {
    return shell(
      <CardContent className="p-6 text-center">
        <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-primary" aria-hidden="true" />
        <p className="text-muted-foreground">{t('wsAcceptLoading')}</p>
      </CardContent>
    );
  }

  if (failed || !invitation) {
    return shell(
      <CardContent className="space-y-4 p-6 text-center">
        <UserX className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-foreground text-pretty">{t('wsAcceptInvalid')}</p>
        <Button asChild className="h-11 rounded-xl"><Link to="/login">{t('wsContinueEmail')}</Link></Button>
      </CardContent>
    );
  }

  if (isLink && invitation.expired) {
    return shell(
      <CardContent className="space-y-4 p-6 text-center">
        <UserX className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
        <p className="text-foreground text-pretty">{t('wsInviteExpired')}</p>
        <Button asChild className="h-11 rounded-xl"><Link to="/">OK</Link></Button>
      </CardContent>
    );
  }

  const loginHref = `/login?redirect=${encodeURIComponent(`/accept-invitation/${token}`)}`;

  return shell(
    <>
      <CardHeader className="text-center">
        <div className="mb-2 flex items-center justify-center">
          <ShieldCheck className="h-12 w-12 text-primary" aria-hidden="true" />
        </div>
        <CardTitle className="text-2xl font-bold text-foreground">{t('wsAcceptTitle')}</CardTitle>
        <CardDescription className="text-pretty">
          {fmt(t('wsAcceptFrom'), { name: invitation.invitedByName || t('wsSomeone'), workspace: invitation.workspaceName })}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="space-y-2 rounded-2xl bg-muted/50 p-4">
          {!isLink && (
            <p className="flex items-center gap-2 text-sm text-foreground" dir="ltr">
              <Mail className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {invitation.invitedEmail}
            </p>
          )}
          <p className="text-sm text-muted-foreground">{fmt(t('wsJoinAs'), { role: roleLabel(t, invitation.role) })}</p>
        </div>

        {signedIn && emailMatches && (
          <div className="flex gap-2">
            <Button variant="ghost" className="h-11 flex-1 rounded-xl" disabled={busy} onClick={() => respond(false)}>{t('wsDecline')}</Button>
            <Button className="h-11 flex-1 rounded-xl" disabled={busy} onClick={() => respond(true)}>
              {busy && <Loader2 className="me-1.5 h-4 w-4 animate-spin" aria-hidden="true" />}
              {t('wsAccept')}
            </Button>
          </div>
        )}

        {signedIn && !emailMatches && (
          <div className="space-y-3 text-center">
            <p className="text-sm text-muted-foreground text-pretty">{fmt(t('wsSignedInAs'), { email: user.email })}</p>
            <p className="text-sm text-foreground text-pretty">{fmt(t('wsWrongAccount'), { email: invitation.invitedEmail })}</p>
            <Button variant="secondary" className="h-11 w-full rounded-xl" onClick={() => logout()}>{t('wsSignOut')}</Button>
          </div>
        )}

        {!signedIn && (
          <div className="space-y-3">
            <p className="text-center text-sm text-muted-foreground text-pretty">{isLink ? t('wsSignInToJoin') : fmt(t('wsUseEmail'), { email: invitation.invitedEmail })}</p>
            {GOOGLE_CLIENT_ID && <div id="google-signin-button" className="flex min-h-11 w-full justify-center" />}
            {busy && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />{t('wsSigningIn')}
              </p>
            )}
            <Button asChild variant="outline" className="h-11 w-full rounded-xl">
              <Link to={loginHref}>{t('wsContinueEmail')}</Link>
            </Button>
          </div>
        )}
      </CardContent>
    </>
  );
}
