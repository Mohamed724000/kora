import { StatusPanel } from '@kora-plus/ui';

export default function HomePage() {
  return (
    <main id="contenu-principal">
      <section aria-labelledby="titre-accueil" className="hero">
        <div className="site-container hero__grid">
          <div className="hero__content">
            <p className="eyebrow">Plateforme culturelle africaine</p>
            <h1 id="titre-accueil">Les cultures africaines au premier plan.</h1>
            <p className="hero__summary">
              KORA+ construit un espace public sobre pour découvrir des créations culturelles
              africaines.
            </p>
            <a className="primary-link" href="#catalogue-public">
              Voir l’état du catalogue
            </a>
          </div>
          <aside aria-label="Repère éditorial" className="hero__note">
            <span className="hero__note-index">K+</span>
            <p>Un point d’entrée public pensé pour une lecture simple sur tous les écrans.</p>
          </aside>
        </div>
      </section>

      <section
        aria-labelledby="titre-catalogue"
        className="catalogue-section"
        id="catalogue-public"
      >
        <div className="site-container">
          <div className="section-heading">
            <p className="eyebrow">Catalogue public</p>
            <h2 id="titre-catalogue">État de publication</h2>
          </div>
          <StatusPanel
            description="Le catalogue public n’est pas encore ouvert."
            title="Aucun contenu publié"
            variant="empty"
          />
        </div>
      </section>
    </main>
  );
}
