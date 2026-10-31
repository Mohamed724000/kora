'use client';

import { forwardRef, type ChangeEvent, type InputHTMLAttributes } from 'react';

import { AuthFormField } from './auth-form-field';

type TotpInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'autoComplete' | 'inputMode' | 'maxLength' | 'minLength' | 'pattern' | 'type'
> & {
  error?: string | undefined;
  label?: string;
};

export const TotpInput = forwardRef<HTMLInputElement, TotpInputProps>(function TotpInput(
  { error, label = 'Code à six chiffres', onChange, ...input },
  ref,
) {
  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    event.currentTarget.value = event.currentTarget.value.replaceAll(/\D/gu, '').slice(0, 6);
    onChange?.(event);
  };

  return (
    <AuthFormField
      {...input}
      autoComplete="one-time-code"
      error={error}
      inputMode="numeric"
      label={label}
      maxLength={6}
      minLength={6}
      onChange={handleChange}
      pattern="[0-9]{6}"
      ref={ref}
      type="text"
    />
  );
});
