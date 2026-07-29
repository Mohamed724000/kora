import type { ReactNode } from 'react';

export type StatusPanelVariant = 'empty' | 'error' | 'loading';

export type StatusPanelProps = {
  action?: ReactNode;
  description: string;
  title: string;
  variant: StatusPanelVariant;
};

const variantIcons: Record<StatusPanelVariant, string> = {
  empty: '—',
  error: '!',
  loading: '…',
};

export function StatusPanel({ action, description, title, variant }: StatusPanelProps) {
  const role = variant === 'error' ? 'alert' : variant === 'loading' ? 'status' : 'region';

  return (
    <section
      aria-label={variant === 'empty' ? title : undefined}
      aria-live={variant === 'loading' ? 'polite' : undefined}
      className={`kp-status-panel kp-status-panel--${variant}`}
      role={role}
    >
      <span aria-hidden="true" className="kp-status-panel__icon">
        {variantIcons[variant]}
      </span>
      <div className="kp-status-panel__body">
        <h2 className="kp-status-panel__title">{title}</h2>
        <p className="kp-status-panel__description">{description}</p>
        {action ? <div className="kp-status-panel__action">{action}</div> : null}
      </div>
    </section>
  );
}
