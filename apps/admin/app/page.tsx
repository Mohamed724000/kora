import { AppContent } from '@adminlte/react';
import { StatusPanel } from '@kora-plus/ui';

import { adminAreas } from '../lib/admin-navigation';

export default function AdminFoundationPage() {
  return (
    <AppContent
      breadcrumbs={[{ label: 'Administration' }, { label: 'Tableau de bord' }]}
      title="Tableau de bord"
    >
      <section aria-label="État du back-office" className="admin-foundation-state">
        <StatusPanel
          description="Cette fondation ne se connecte à aucune API et n’affiche aucune métrique."
          title="Aucune donnée opérationnelle"
          variant="empty"
        />
      </section>

      <section aria-labelledby="admin-zones-title" className="admin-zones">
        <div className="admin-zones__heading">
          <p className="admin-eyebrow">Structure du back-office</p>
          <h2 id="admin-zones-title">Treize zones de navigation</h2>
          <p>
            Ces repères structurent uniquement le shell. Aucun outil opérationnel n’est activé dans
            ce lot.
          </p>
        </div>

        <div className="admin-zones__grid">
          {adminAreas.map((area, index) => (
            <article className="admin-zone-card" id={area.id} key={area.id}>
              <div className="admin-zone-card__header">
                <i aria-hidden="true" className={area.icon} />
                <span>{String(index + 1).padStart(2, '0')}</span>
              </div>
              <h3>{area.label}</h3>
              <p>Zone présente pour la navigation de fondation.</p>
            </article>
          ))}
        </div>
      </section>
    </AppContent>
  );
}
