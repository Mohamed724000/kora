import { useId } from 'react';

export type PublicationCheck = {
  complete: boolean;
  detail?: string;
  id: string;
  label: string;
};

export type PublicationChecklistProps = { items: PublicationCheck[] };

export function PublicationChecklist({ items }: PublicationChecklistProps) {
  const completed = items.filter((item) => item.complete).length;
  const titleId = `kp-publication-checklist-title-${useId()}`;

  return (
    <section aria-labelledby={titleId} className="kp-publication-checklist">
      <div className="kp-publication-checklist__heading">
        <h2 id={titleId}>Checklist de publication</h2>
        <p aria-live="polite">
          {completed} sur {items.length} étapes terminées
        </p>
      </div>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            <span aria-hidden="true" className={item.complete ? 'is-complete' : 'is-pending'}>
              {item.complete ? '✓' : '○'}
            </span>
            <div>
              <strong>{item.label}</strong>
              <span className="kp-visually-hidden">
                {item.complete ? ' — terminé' : ' — à terminer'}
              </span>
              {item.detail ? <p>{item.detail}</p> : null}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
