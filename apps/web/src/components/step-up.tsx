'use client';

import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { hasMessage } from '@/lib/messages';
import { confirmStepUp, requestStepUpCode } from '@/lib/staff-data';
import { useLocale } from './locale-provider';

interface Pending {
  challengeId: string;
  resolve: () => void;
  reject: (reason: unknown) => void;
}

function StepUpDialog({ pending, onDone }: { pending: Pending; onDone: () => void }) {
  const { t } = useLocale();
  const ref = useRef<HTMLDialogElement>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  const cancel = () => {
    pending.reject(new ApiError(403, 'STEP_UP_CANCELLED'));
    onDone();
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await confirmStepUp(pending.challengeId, code);
      pending.resolve();
      onDone();
    } catch (caught) {
      const key = `error.${caught instanceof ApiError ? caught.code : ''}`;
      setError(hasMessage(key) ? t(key) : t('stepUp.wrongCode'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={ref} className="modal" aria-labelledby="step-up-title" onCancel={(event) => { event.preventDefault(); cancel(); }}>
      <form onSubmit={submit} noValidate>
        <h2 id="step-up-title" style={{ marginBottom: 6 }}>{t('stepUp.title')}</h2>
        <p className="muted" style={{ marginTop: 0 }}>{t('stepUp.intro')}</p>
        {error && <p role="alert" className="alert err">{error}</p>}
        <div className="field">
          <label htmlFor="step-up-code">{t('stepUp.code')}</label>
          <input
            id="step-up-code"
            className="input"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            autoFocus
            value={code}
            onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
          />
        </div>
        <div className="row end" style={{ marginTop: 16 }}>
          <button type="button" className="btn" onClick={cancel}>{t('action.cancel')}</button>
          <button type="submit" className="btn btn-primary" disabled={busy || code.length !== 6}>{t('stepUp.confirm')}</button>
        </div>
      </form>
    </dialog>
  );
}

export function useStepUp(): { guard: <T>(action: () => Promise<T>) => Promise<T>; dialog: ReactNode } {
  const [pending, setPending] = useState<Pending | null>(null);

  const guard = useCallback(async <T,>(action: () => Promise<T>): Promise<T> => {
    try {
      return await action();
    } catch (caught) {
      if (!(caught instanceof ApiError && caught.code === 'STEP_UP_REQUIRED')) throw caught;
      const challenge = await requestStepUpCode();
      await new Promise<void>((resolve, reject) => setPending({ challengeId: challenge.challengeId, resolve, reject }));
      return action();
    }
  }, []);

  return { guard, dialog: pending ? <StepUpDialog pending={pending} onDone={() => setPending(null)} /> : null };
}
