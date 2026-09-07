import type { ReactNode } from 'react';

export type ActionableErrorProps = {
  action: ReactNode;
  detail: string;
  title: string;
};

export function ActionableError({ action, detail, title }: ActionableErrorProps) {
  return (
    <section className="kp-actionable-error" role="alert">
      <span aria-hidden="true" className="kp-actionable-error__icon">
        !
      </span>
      <div>
        <h2>{title}</h2>
        <p>{detail}</p>
        <div className="kp-actionable-error__action">{action}</div>
      </div>
    </section>
  );
}
