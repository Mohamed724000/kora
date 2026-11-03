'use client';

import {
  forwardRef,
  type InputHTMLAttributes,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';

import { AdminAuthRequestError } from '../../lib/auth/admin-auth-errors';

type AuthFormFieldProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> & {
  error?: string | undefined;
  hint?: string | undefined;
  label: string;
};

export const AuthFormField = forwardRef<HTMLInputElement, AuthFormFieldProps>(
  function AuthFormField({ className, error, hint, label, ...input }, ref) {
    const generated = useId();
    const fieldId = `auth-field-${generated}`;
    const hintId = hint === undefined ? undefined : `${fieldId}-hint`;
    const errorId = error === undefined ? undefined : `${fieldId}-error`;
    const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="auth-field">
        <label htmlFor={fieldId}>{label}</label>
        {hint === undefined ? null : (
          <p className="auth-field__hint" id={hintId}>
            {hint}
          </p>
        )}
        <input
          {...input}
          aria-describedby={describedBy}
          aria-invalid={error === undefined ? undefined : true}
          className={['form-control', className].filter(Boolean).join(' ')}
          id={fieldId}
          ref={ref}
        />
        {error === undefined ? null : (
          <p className="auth-field__error" id={errorId}>
            {error}
          </p>
        )}
      </div>
    );
  },
);

export function AdminRetryAfterStatus({
  remainingSeconds,
}: Readonly<{ remainingSeconds: number }>) {
  const blocked = remainingSeconds > 0;
  const wasBlocked = useRef(false);
  const [announcement, setAnnouncement] = useState('');

  useEffect(() => {
    if (blocked && !wasBlocked.current) {
      setAnnouncement(`Nouvelle tentative possible dans ${remainingSeconds} secondes.`);
    } else if (!blocked && wasBlocked.current) {
      setAnnouncement('Vous pouvez effectuer une nouvelle tentative.');
    }
    wasBlocked.current = blocked;
  }, [blocked, remainingSeconds]);

  return (
    <>
      {blocked ? (
        <p aria-hidden="true" className="auth-status">
          Nouvelle tentative possible dans {remainingSeconds} secondes.
        </p>
      ) : null}
      <span aria-atomic="true" aria-live="polite" className="visually-hidden" role="status">
        {announcement}
      </span>
    </>
  );
}

export function useAdminRetryAfter(): Readonly<{
  blocked: boolean;
  observe: (error: unknown) => void;
  remainingSeconds: number;
}> {
  const [deadline, setDeadline] = useState<number>();
  const [remainingSeconds, setRemainingSeconds] = useState(0);

  useEffect(() => {
    if (deadline === undefined) return;
    const update = (): void => {
      const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
      setRemainingSeconds(remaining);
      if (remaining === 0) setDeadline(undefined);
    };
    const initial = window.setTimeout(update, 0);
    const interval = window.setInterval(update, 1000);
    return () => {
      window.clearTimeout(initial);
      window.clearInterval(interval);
    };
  }, [deadline]);

  const observe = useCallback((error: unknown): void => {
    if (
      error instanceof AdminAuthRequestError &&
      error.retryAfterSeconds !== undefined &&
      error.retryAfterSeconds > 0
    ) {
      setDeadline(Date.now() + error.retryAfterSeconds * 1000);
      setRemainingSeconds(error.retryAfterSeconds);
    }
  }, []);

  return { blocked: remainingSeconds > 0, observe, remainingSeconds };
}
