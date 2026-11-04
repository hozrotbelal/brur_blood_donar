'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { ApiError, homeFor, isMfaChallenge, setSession, signIn, verifyStaffCode, type AppRole, type StaffRole } from '@/lib/api';
import type { MessageKey } from '@/lib/messages';
import { useLocale } from './locale-provider';

const ROLES: AppRole[] = ['SUP', 'MOD', 'ADM', 'DON', 'PAT'];

const DEMO_ACCOUNTS: Partial<Record<AppRole, { phone: string; password: string }>> =
  process.env.NODE_ENV === 'production'
    ? {}
    : {
        SUP: { phone: '01700000001', password: '1234565' },
        MOD: { phone: '01900000001', password: '1234565' },
        ADM: { phone: '01700000006', password: '1234565' },
        DON: { phone: '01700000004', password: '1234565' },
        PAT: { phone: '01700000005', password: '1234565' },
      };

type Step = { kind: 'credentials' } | { kind: 'code'; challengeId: string };

const ERROR_KEYS: Record<string, MessageKey> = {
  INVALID_CREDENTIALS: 'error.invalidCredentials',
  ORIGIN_NOT_ALLOWED: 'error.originNotAllowed',
  STAFF_ONLY: 'error.staffOnly',
  CODE_INVALID: 'error.codeInvalid',
  ROLE_NOT_HELD: 'error.roleNotHeld',
  OTP_RATE_LIMITED: 'error.rateLimited',
  LOGIN_RATE_LIMITED: 'error.rateLimited',
};

export function SignInForm() {
  const { t, toggleLocale } = useLocale();
  const router = useRouter();
  const [step, setStep] = useState<Step>({ kind: 'credentials' });
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [role, setRole] = useState<AppRole | ''>('');
  const [code, setCode] = useState('');
  const [trustBrowser, setTrustBrowser] = useState(true);
  const [demoFilled, setDemoFilled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<MessageKey | null>(null);

  /**
   * Development only: choosing a role fills in that role's demo account.
   * The table is empty in production builds, so no credentials ship to users.
   */
  const chooseRole = (next: AppRole | '') => {
    setRole(next);
    const demo = next ? DEMO_ACCOUNTS[next] : undefined;
    if (demo) {
      setPhone(demo.phone);
      setPassword(demo.password);
      setDemoFilled(true);
    }
  };

  const fail = (caught: unknown) => {
    const code = caught instanceof ApiError ? caught.code : 'UNKNOWN';
    setError(ERROR_KEYS[code] ?? 'error.generic');
  };

  async function submitCredentials(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await signIn({ phone, password, role: role || undefined });
      if (isMfaChallenge(result)) {
        setStep({ kind: 'code', challengeId: result.challengeId });
      } else {
        setSession(result);
        router.replace(homeFor(result.role));
      }
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  async function submitCode(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== 'code') return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyStaffCode({
        challengeId: step.challengeId,
        code,
        role: (role || undefined) as StaffRole | undefined,
        trustBrowser,
      });
      setSession(result);
      router.replace(homeFor(result.role));
    } catch (caught) {
      fail(caught);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth">
      <aside className="auth-hero" aria-hidden="true">
        <div className="auth-logo">B</div>
        <h2 className="auth-hero-title">{t('auth.heroTitle')}</h2>
        <p>{t('auth.heroBody')}</p>
        <p className="auth-hero-note">{t('auth.staffNote')}</p>
      </aside>

      <div className="auth-panel">
        <div className="auth-top">
          <span className="muted">{t('app.staffPortal')}</span>
          <button type="button" className="btn btn-small" onClick={toggleLocale}>
            {t('language.switch')}
          </button>
        </div>
        <div className="auth-card">
          <h1>{t('signIn.title')}</h1>

          {step.kind === 'credentials' ? (
            <form onSubmit={submitCredentials} noValidate className="stack-form">
              <p className="muted">{t('signIn.intro')}</p>

              <div className="field">
                <label htmlFor="sign-phone">{t('signIn.phone')}</label>
                <div className="phone-input">
                  <span>+880</span>
                  <input
                    id="sign-phone"
                    name="phone"
                    type="tel"
                    inputMode="tel"
                    autoComplete="username"
                    placeholder="17XXXXXXXX"
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="field">
                <label htmlFor="sign-password">{t('signIn.password')}</label>
                <div className="password-input">
                  <input
                    id="sign-password"
                    name="password"
                    type={showPassword ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    required
                  />
                  <button type="button" onClick={() => setShowPassword((shown) => !shown)}>
                    {showPassword ? t('auth.hide') : t('auth.show')}
                  </button>
                </div>
              </div>

              <div className="field">
                <label htmlFor="sign-role">{t('signIn.role')}</label>
                <select id="sign-role" className="input" name="role" value={role} onChange={(event) => chooseRole(event.target.value as AppRole | '')}>
                  <option value="">{t('signIn.roleAny')}</option>
                  {ROLES.map((item) => (
                    <option key={item} value={item}>
                      {t(`role.${item}` as MessageKey)}
                    </option>
                  ))}
                </select>
              </div>
              {demoFilled && process.env.NODE_ENV !== 'production' && <p className="muted demo-hint">{t('signIn.demoFilled')}</p>}

              {error && <p role="alert" className="alert err">{t(error)}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? t('signIn.submitting') : t('signIn.submit')}
              </button>
            </form>
          ) : (
            <form onSubmit={submitCode} noValidate className="stack-form">
              <p className="muted">{t('signIn.codeIntro')}</p>

              <div className="field">
                <label htmlFor="sign-code">{t('signIn.code')}</label>
                <input
                  id="sign-code"
                  className="input code-input"
                  name="code"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  required
                />
              </div>

              <label className="check-row">
                <input type="checkbox" checked={trustBrowser} onChange={(event) => setTrustBrowser(event.target.checked)} />
                <span>{t('signIn.trustLabel')}</span>
              </label>

              {error && <p role="alert" className="alert err">{t(error)}</p>}
              <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
                {busy ? t('signIn.verifying') : t('signIn.verify')}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
