import React, { forwardRef, useEffect, useId, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useReducedMotion } from '@/lib/motion';
import { AlertCircle, ArrowUp, Eye, EyeOff, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { passwordStrength } from './useAuthFlow';

export const EASE_OUT = [0.16, 1, 0.3, 1];

const LANG_LABELS = { he: 'עב', en: 'EN', ru: 'RU' };
const LANG_NAMES = { he: 'עברית', en: 'English', ru: 'Русский' };

/** Three-way language pill; the active language slides between options */
export function LanguageSwitch({ flow, className }) {
  const { lang, setLang, langs, t } = flow;
  const id = useId();
  return (
    <div role="radiogroup" aria-label={t('authLanguage')} className={cn('relative flex rounded-full border border-border/60 bg-card/70 p-1 backdrop-blur-md', className)}>
      {langs.map((code) => (
        <button
          key={code}
          type="button"
          role="radio"
          aria-checked={lang === code}
          aria-label={LANG_NAMES[code]}
          lang={code}
          onClick={() => setLang(code)}
          className="relative h-8 min-w-[2.75rem] rounded-full px-2.5 text-xs font-semibold tracking-wide text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring aria-checked:text-primary-foreground [@media(pointer:coarse)]:h-9"
        >
          {lang === code && (
            <motion.span layoutId={`lang-${id}`} className="absolute inset-0 rounded-full bg-primary" transition={{ type: 'spring', stiffness: 500, damping: 38 }} />
          )}
          <span className="relative">{LANG_LABELS[code]}</span>
        </button>
      ))}
    </div>
  );
}

/** Main action: spinner crossfades in place of the label so the width never jumps */
/** `quiet` steps it back to an outline when another button on the screen is the main way on */
export function PrimaryButton({ loading, children, className, icon, quiet = false, ...props }) {
  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      disabled={loading || props.disabled}
      className={cn(
        'relative flex h-[52px] w-full items-center justify-center gap-2 overflow-hidden rounded-2xl px-5 text-base font-semibold outline-none',
        quiet
          ? 'border border-border/70 bg-background/40 text-foreground transition-[background-color,border-color] hover:border-foreground/20 hover:bg-accent'
          : 'bg-primary text-primary-foreground shadow-[0_10px_28px_-12px_hsl(var(--glow)/0.75)] transition-[filter,box-shadow] hover:brightness-110',
        'focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-progress',
        className,
      )}
      {...props}
    >
      <AnimatePresence mode="popLayout" initial={false}>
        {loading ? (
          <motion.span key="spin" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }} transition={{ duration: 0.2 }}>
            <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
          </motion.span>
        ) : (
          <motion.span key="label" className="flex items-center gap-2" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.2 }}>
            {children}
            {icon}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

/** Google's four-colour G */
export function GoogleMark() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5 shrink-0" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

/** Google's own button, rendered hidden for the page's lifetime; GoogleButton clicks it */
export function GoogleHost({ flow }) {
  if (!flow.googleEnabled) return null;
  return <div ref={flow.googleHost} className="hidden" aria-hidden="true" />;
}

export function OrDivider({ flow }) {
  return (
    <div className="flex items-center gap-4 py-1 text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground" role="separator">
      <span className="h-px flex-1 bg-gradient-to-r from-transparent to-border" />
      {flow.t('authOr')}
      <span className="h-px flex-1 bg-gradient-to-l from-transparent to-border" />
    </div>
  );
}

function FieldMessage({ id, error, hint }) {
  return (
    <AnimatePresence initial={false} mode="wait">
      {error ? (
        <motion.p
          key="error"
          id={id}
          role="alert"
          className="flex items-start gap-1.5 overflow-hidden text-sm text-danger"
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: 'auto' }}
          exit={{ opacity: 0, height: 0 }}
          transition={{ duration: 0.22, ease: EASE_OUT }}
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </motion.p>
      ) : hint ? (
        <motion.p key="hint" id={id} className="text-xs leading-relaxed text-muted-foreground" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
          {hint}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

/** Labelled 52px input with inline error or hint; the whole field shakes once on a new error */
export const Field = forwardRef(function Field({ id, label, hint, error, errorKey, trailing, className, ...input }, ref) {
  const msgId = `${id}-msg`;
  const shake = useAnimationControls();
  const reduce = useReducedMotion();
  useEffect(() => {
    if (errorKey && !reduce) shake.start({ x: [0, -6, 6, -4, 4, 0], transition: { duration: 0.36 } });
  }, [errorKey, reduce, shake]);
  return (
    <div className={cn('space-y-2', className)}>
      <label htmlFor={id} className="block text-sm font-medium text-foreground/85">{label}</label>
      <motion.div className="relative" animate={shake}>
        <input
          id={id}
          ref={ref}
          aria-invalid={error ? true : undefined}
          aria-describedby={error || hint ? msgId : undefined}
          className={cn(
            'h-[52px] w-full rounded-2xl border border-input bg-background/70 px-4 text-base text-foreground outline-none',
            'transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted-foreground',
            'hover:border-foreground/25 focus:border-primary focus:bg-background focus:shadow-[0_0_0_4px_hsl(var(--primary)/0.16)]',
            'aria-[invalid=true]:border-danger aria-[invalid=true]:focus:shadow-[0_0_0_4px_hsl(var(--danger)/0.16)]',
            trailing && 'pe-12',
          )}
          {...input}
        />
        {trailing && <div className="absolute inset-y-0 end-1 flex items-center">{trailing}</div>}
      </motion.div>
      <FieldMessage id={msgId} error={error} hint={hint} />
    </div>
  );
});

const STRENGTH_TONE = ['bg-foreground/10', 'bg-danger', 'bg-chart-4', 'bg-primary', 'bg-success'];
const STRENGTH_KEY = [null, 'authStrengthWeak', 'authStrengthOkay', 'authStrengthGood', 'authStrengthStrong'];

/** Password input with reveal, a Caps Lock notice and (for new passwords) a strength meter */
export const PasswordField = forwardRef(function PasswordField({ flow, meter = false, value, hint, ...props }, ref) {
  const { t } = flow;
  const [visible, setVisible] = useState(false);
  const [caps, setCaps] = useState(false);
  const readCaps = (e) => setCaps(Boolean(e.getModifierState?.('CapsLock')));
  const score = meter ? passwordStrength(value) : 0;

  return (
    <div>
      <Field
        ref={ref}
        type={visible ? 'text' : 'password'}
        value={value}
        onKeyDown={readCaps}
        onKeyUp={readCaps}
        onBlur={() => setCaps(false)}
        hint={meter ? undefined : hint}
        spellCheck={false}
        autoCapitalize="none"
        trailing={(
          <button
            type="button"
            onClick={() => setVisible((v) => !v)}
            aria-label={visible ? t('hidePassword') : t('showPassword')}
            aria-pressed={visible}
            className="grid h-11 w-11 place-items-center rounded-xl text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visible ? <EyeOff className="h-[18px] w-[18px]" aria-hidden="true" /> : <Eye className="h-[18px] w-[18px]" aria-hidden="true" />}
          </button>
        )}
        {...props}
      />
      <AnimatePresence initial={false}>
        {caps && (
          <motion.p
            className="mt-2 flex items-center gap-1.5 overflow-hidden text-xs font-medium text-chart-4"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
            {t('authCapsLock')}
          </motion.p>
        )}
      </AnimatePresence>
      {meter && (
        <div className="mt-3" aria-live="polite">
          <div className="flex gap-1.5" aria-hidden="true">
            {[1, 2, 3, 4].map((i) => (
              <span key={i} className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10">
                <motion.span
                  className={cn('block h-full origin-left rounded-full rtl:origin-right', STRENGTH_TONE[score])}
                  initial={false}
                  animate={{ scaleX: score >= i ? 1 : 0 }}
                  transition={{ duration: 0.35, ease: EASE_OUT }}
                />
              </span>
            ))}
          </div>
          <p className="mt-2 flex justify-between gap-3 text-xs text-muted-foreground">
            <span>{hint}</span>
            {score > 0 && <span className="shrink-0 font-semibold text-foreground/85">{t(STRENGTH_KEY[score])}</span>}
          </p>
        </div>
      )}
    </div>
  );
});
