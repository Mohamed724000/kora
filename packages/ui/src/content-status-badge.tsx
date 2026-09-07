export type ContentStatus = 'archived' | 'draft' | 'error' | 'processing' | 'published' | 'ready';

const statusPresentation: Record<ContentStatus, { icon: string; label: string }> = {
  archived: { icon: '■', label: 'Archivé' },
  draft: { icon: '○', label: 'Brouillon' },
  error: { icon: '!', label: 'Erreur' },
  processing: { icon: '↻', label: 'Traitement' },
  published: { icon: '●', label: 'Publié' },
  ready: { icon: '✓', label: 'Prêt' },
};

export type ContentStatusBadgeProps = { status: ContentStatus };

export function ContentStatusBadge({ status }: ContentStatusBadgeProps) {
  const presentation = statusPresentation[status];

  return (
    <span
      aria-label={`Statut : ${presentation.label}`}
      className={`kp-content-status kp-content-status--${status}`}
    >
      <span aria-hidden="true">{presentation.icon}</span>
      {presentation.label}
    </span>
  );
}
