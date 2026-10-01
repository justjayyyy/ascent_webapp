import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/lib/AuthContext';
import { translations } from '@/lib/translations';
import { startEntry } from '@/components/EntryTransition';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;
const GSI_SRC = 'https://accounts.google.com/gsi/client';
const LANGS = ['he', 'en', 'ru'];
const LANG_KEY = 'ascent_login_lang';
const PUBLIC_PAGES = ['/terms-of-service', '/privacy-policy', '/login'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// The login page fades under the opening overlay before the route changes
const HANDOFF_MS = 380;

function initialLanguage() {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (LANGS.includes(saved)) return saved;
  } catch { /* storage unavailable */ }
  const device = (navigator.language || '').slice(0, 2).toLowerCase();
  return LANGS.includes(device) ? device : 'he';
}

/** 0 (empty) to 4, from length and character variety */
export function passwordStrength(pw) {
  if (!pw) return 0;
  if (pw.length < 6) return 1;
  let score = 1;
  if (pw.length >= 10) score += 1;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) score += 0.5;
  if (/\d/.test(pw)) score += 0.5;
  if (/[^A-Za-z0-9]/.test(pw)) score += 1;
  return Math.min(4, Math.floor(score));
}

/**
 * Everything the sign-in page does, independent of how it looks: language for the page, email and
 * password sign-in, sign-up, passkeys (button and the browser's autofill suggestion), Google, and
 * the hand-off to the opening overlay.
 */
export function useAuthFlow() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { login, register, loginWithGoogle, loginWithPasskey, isAuthenticated } = useAuth();

  // ---- language (the visitor is not signed in, so it lives on the page) ----
  const [lang, setLangState] = useState(initialLanguage);
  const setLang = useCallback((next) => {
    setLangState(next);
    try { localStorage.setItem(LANG_KEY, next); } catch { /* storage unavailable */ }
  }, []);
  const t = useCallback((key, vars) => {
    let s = translations[lang]?.[key] || translations.en[key] || key;
    if (vars) Object.entries(vars).forEach(([k, v]) => { s = s.replace(`{${k}}`, v); });
    return s;
  }, [lang]);
  const isRTL = lang === 'he';

  // The app sets <html dir/lang> from the signed-in user; put it back when this page goes away
  const htmlAttrs = useRef(null);
  useLayoutEffect(() => {
    const root = document.documentElement;
    if (!htmlAttrs.current) htmlAttrs.current = { lang: root.lang, dir: root.dir };
    root.lang = lang;
    root.dir = isRTL ? 'rtl' : 'ltr';
  }, [lang, isRTL]);
  useLayoutEffect(() => () => {
    const root = document.documentElement;
    if (htmlAttrs.current) { root.lang = htmlAttrs.current.lang; root.dir = htmlAttrs.current.dir; }
  }, []);

  // ---- where to go after signing in ----
  const rawRedirect = searchParams.get('redirect') || '/Dashboard';
  const redirectUrl = PUBLIC_PAGES.some((p) => rawRedirect.endsWith(p)) ? '/Dashboard' : rawRedirect;

  const reason = searchParams.get('reason');
  useEffect(() => {
    if (reason === 'session_replaced') toast.info(t('sessionReplaced'));
    else if (reason === 'session_expired') toast.info(t('sessionExpired'));
  }, [reason]);

  const [entering, setEntering] = useState(false);
  const enteringRef = useRef(false);

  useEffect(() => {
    if (isAuthenticated && !enteringRef.current) navigate(redirectUrl, { replace: true });
  }, [isAuthenticated, navigate, redirectUrl]);

  /** Greets the person in their own language, then lets the overlay cover the route change */
  const enter = useCallback((user, { isNew = false } = {}) => {
    enteringRef.current = true;
    setEntering(true);
    const dict = translations[user?.language] || translations[lang] || translations.en;
    const first = (user?.full_name || '').trim().split(/\s+/)[0];
    const pick = (key) => dict[key] || translations.en[key];
    const greeting = first
      ? pick(isNew ? 'authWelcomeNew' : 'authWelcomeBackName').replace('{name}', first)
      : pick(isNew ? 'welcomeToAscent' : 'welcomeBack');
    startEntry({ greeting, detail: pick('authOpening') });
    setTimeout(() => navigate(redirectUrl, { replace: true }), HANDOFF_MS);
  }, [lang, navigate, redirectUrl]);

  const offerBiometrics = () => { try { sessionStorage.setItem('ascent_offer_biometric', '1'); } catch { /* storage unavailable */ } };

  // ---- passkeys ----
  const [passkeyReady, setPasskeyReady] = useState(false);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { browserSupportsWebAuthn, browserSupportsWebAuthnAutofill } = await import('@simplewebauthn/browser');
      if (cancelled || !browserSupportsWebAuthn()) return;
      setPasskeyReady(true);
      if (!(await browserSupportsWebAuthnAutofill()) || cancelled) return;
      try {
        const result = await loginWithPasskey({ autofill: true });
        enteringRef.current = true;
        enter(result.user);
      } catch { /* dismissed, or replaced by the button's own request */ }
    })();
    return () => { cancelled = true; };
  }, []);

  const signInWithPasskey = useCallback(async () => {
    setPasskeyLoading(true);
    enteringRef.current = true;
    try {
      const result = await loginWithPasskey();
      enter(result.user);
    } catch (error) {
      enteringRef.current = false;
      if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') toast(t('secCancelled'));
      else if (error?.data?.error === 'unknown_passkey') toast.error(t('passkeyUnknown'));
      else toast.error(t('passkeySignInFailed'));
    } finally {
      setPasskeyLoading(false);
    }
  }, [loginWithPasskey, enter, t]);

  // ---- Google (Identity Services renders a hidden button; ours clicks it) ----
  const [googleLoading, setGoogleLoading] = useState(false);
  const googleHost = useRef(null);
  const handleGoogleCredential = useRef(null);
  handleGoogleCredential.current = async (response) => {
    if (!response.credential) {
      setGoogleLoading(false);
      if (response.select_by === 'user') toast.error(t('authSignInCancelled'));
      return;
    }
    setGoogleLoading(true);
    enteringRef.current = true;
    try {
      const signedIn = await loginWithGoogle(response.credential, GOOGLE_CLIENT_ID);
      offerBiometrics();
      enter(signedIn);
    } catch (error) {
      enteringRef.current = false;
      toast.error(error.message || t('googleSignInFailed'));
      setGoogleLoading(false);
    }
  };

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return undefined;
    const init = () => {
      if (!window.google || !googleHost.current) return;
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: (r) => handleGoogleCredential.current(r),
        auto_select: false,
      });
      window.google.accounts.id.renderButton(googleHost.current, { type: 'standard', size: 'large', text: 'continue_with' });
    };
    if (window.google?.accounts?.id) { init(); return undefined; }
    const script = document.createElement('script');
    script.src = GSI_SRC;
    script.async = true;
    script.onload = init;
    document.body.appendChild(script);
    return () => { script.onload = null; };
  }, []);

  const signInWithGoogle = useCallback(() => {
    if (!window.google) { toast.error(t('authGoogleUnavailable')); return; }
    const button = googleHost.current?.querySelector('div[role="button"]');
    // Loading starts once a credential arrives: closing Google's popup gives no callback
    if (button) button.click();
    else toast.error(t('authGoogleNotReady'));
  }, [t]);

  // ---- email and password ----
  const [busy, setBusy] = useState(false);

  const validateEmail = useCallback((email) => {
    if (!email.trim()) return t('authEmailRequired');
    if (!EMAIL_RE.test(email.trim())) return t('authInvalidEmail');
    return null;
  }, [t]);

  /** Resolves to an error message to show, or null after a successful sign-in */
  const signIn = useCallback(async (email, password) => {
    if (!password) return t('authPasswordRequired');
    setBusy(true);
    enteringRef.current = true;
    try {
      const user = await login(email.trim(), password);
      offerBiometrics();
      enter(user);
      return null;
    } catch (error) {
      enteringRef.current = false;
      setBusy(false);
      return error.message || t('loginFailed');
    }
  }, [login, enter, t]);

  const signUp = useCallback(async ({ email, password, name }) => {
    if (password.length < 6) return t('authPasswordShort');
    setBusy(true);
    enteringRef.current = true;
    try {
      const user = await register(email.trim(), password, name.trim());
      enter(user, { isNew: true });
      return null;
    } catch (error) {
      enteringRef.current = false;
      setBusy(false);
      return error.message || t('registrationFailed');
    }
  }, [register, enter, t]);

  // The page scrolls inside itself; stop the iOS document bounce behind it
  useEffect(() => {
    const { body, documentElement: html } = document;
    const prev = [body.style.overflow, html.style.overflow];
    body.style.overflow = 'hidden';
    html.style.overflow = 'hidden';
    return () => { [body.style.overflow, html.style.overflow] = prev; };
  }, []);

  return {
    t, lang, setLang, langs: LANGS, isRTL,
    passkeyReady, passkeyLoading, signInWithPasskey,
    googleEnabled: Boolean(GOOGLE_CLIENT_ID), googleLoading, signInWithGoogle, googleHost,
    busy, entering, validateEmail, signIn, signUp,
  };
}
