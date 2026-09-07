import type { ReactNode } from 'react';

import { ContentStatusBadge } from './content-status-badge';

export type MediaProcessingState = 'error' | 'processing' | 'ready';

export type MediaProcessingStatusProps = {
  action?: ReactNode;
  detail: string;
  progress?: number;
  state: MediaProcessingState;
};

export function MediaProcessingStatus({
  action,
  detail,
  progress,
  state,
}: MediaProcessingStatusProps) {
  const normalizedProgress =
    progress === undefined ? undefined : Math.min(100, Math.max(0, progress));

  return (
    <section
      aria-label="État du média privé"
      aria-live={state === 'processing' ? 'polite' : undefined}
      className="kp-media-status"
    >
      <div className="kp-media-status__heading">
        <h2>Préparation du média</h2>
        <ContentStatusBadge status={state} />
      </div>
      <p>{detail}</p>
      {normalizedProgress !== undefined ? (
        <div
          aria-label={`Traitement effectué à ${normalizedProgress} %`}
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={normalizedProgress}
          className="kp-media-status__progress"
          role="progressbar"
        >
          <span style={{ width: `${normalizedProgress}%` }} />
        </div>
      ) : null}
      {action ? <div className="kp-media-status__action">{action}</div> : null}
    </section>
  );
}
