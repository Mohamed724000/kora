import { cloneElement, useId } from 'react';
import type { FormEventHandler, ReactElement, ReactNode } from 'react';

export type ContentFormProps = {
  actions: ReactNode;
  children: ReactNode;
  description: string;
  onSubmit: FormEventHandler<HTMLFormElement>;
  title: string;
};

export function ContentForm({ actions, children, description, onSubmit, title }: ContentFormProps) {
  const titleId = useId();

  return (
    <form aria-labelledby={titleId} className="kp-content-form" onSubmit={onSubmit}>
      <header className="kp-content-form__header">
        <h1 id={titleId}>{title}</h1>
        <p>{description}</p>
      </header>
      <div className="kp-content-form__fields">{children}</div>
      <footer aria-label="Actions du formulaire" className="kp-content-form__actions">
        {actions}
      </footer>
    </form>
  );
}

export type ContentFormFieldProps = {
  children: ReactElement<ContentFieldControlProps>;
  description?: string;
  error?: string;
  inputId: string;
  label: string;
  required?: boolean;
};

type ContentFieldControlProps = {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean | 'false' | 'true';
  'aria-required'?: boolean | 'false' | 'true';
  id?: string;
  required?: boolean;
};

export function ContentFormField({
  children,
  description,
  error,
  inputId,
  label,
  required = false,
}: ContentFormFieldProps) {
  const descriptionId = description ? `${inputId}-description` : undefined;
  const errorId = error ? `${inputId}-error` : undefined;
  const describedBy = [children.props['aria-describedby'], descriptionId, errorId]
    .filter(Boolean)
    .join(' ');
  const control = cloneElement(children, {
    ...(describedBy ? { 'aria-describedby': describedBy } : {}),
    ...(error ? { 'aria-invalid': true } : {}),
    ...(required ? { 'aria-required': true } : {}),
    id: inputId,
    required,
  });

  return (
    <div className="kp-content-field" data-invalid={error ? 'true' : undefined}>
      <label htmlFor={inputId}>
        {label}
        {required ? <span aria-label="obligatoire"> *</span> : null}
      </label>
      {description ? <p id={descriptionId}>{description}</p> : null}
      {control}
      {error ? (
        <p className="kp-content-field__error" id={errorId} role="alert">
          <span aria-hidden="true">!</span> {error}
        </p>
      ) : null}
    </div>
  );
}
