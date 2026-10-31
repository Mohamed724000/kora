export default function Loading() {
  return (
    <main aria-busy="true" className="admin-session-gate" id="contenu-principal" tabIndex={-1}>
      <section aria-live="polite" className="admin-status-card" role="status">
        <p className="admin-eyebrow">Administration KORA+</p>
        <h1>Chargement sécurisé</h1>
        <p>L’interface d’authentification est en cours de préparation.</p>
      </section>
    </main>
  );
}
