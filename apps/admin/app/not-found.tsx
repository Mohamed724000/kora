import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="admin-session-gate" id="contenu-principal" tabIndex={-1}>
      <section className="admin-status-card">
        <p className="admin-eyebrow">Administration KORA+</p>
        <h1>Page introuvable</h1>
        <p>Cette adresse ne correspond à aucun parcours d’administration disponible.</p>
        <Link className="admin-return-link" href="/login">
          Aller à la connexion
        </Link>
      </section>
    </main>
  );
}
