import { StatusPanel } from '@kora-plus/ui';

export default function Loading() {
  return (
    <main className="state-page" id="contenu-principal">
      <div className="site-container">
        <StatusPanel
          description="La page publique est en cours de préparation."
          title="Chargement"
          variant="loading"
        />
      </div>
    </main>
  );
}
