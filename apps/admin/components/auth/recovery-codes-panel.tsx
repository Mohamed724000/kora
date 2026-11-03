'use client';

import type { AdminRecoveryCode } from '@kora-plus/contracts';
import { useEffect, useMemo, useState } from 'react';

type RecoveryCodesPanelProps = {
  codes: readonly AdminRecoveryCode[];
  onContinue: () => void;
};

export function RecoveryCodesPanel({ codes, onContinue }: Readonly<RecoveryCodesPanelProps>) {
  const [acknowledged, setAcknowledged] = useState(false);
  const [feedback, setFeedback] = useState<string>();
  const text = useMemo(
    () => codes.map((code) => `${code.selector}-${code.verifier}`).join('\n'),
    [codes],
  );

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (acknowledged) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [acknowledged]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setFeedback('Codes copiés à votre demande.');
    } catch {
      setFeedback(
        'Copie impossible. Utilisez le téléchargement ou copiez chaque code manuellement.',
      );
    }
  };

  const download = () => {
    const url = URL.createObjectURL(new Blob([`${text}\n`], { type: 'text/plain;charset=utf-8' }));
    try {
      const anchor = document.createElement('a');
      anchor.download = 'kora-admin-recovery-codes.txt';
      anchor.href = url;
      anchor.rel = 'noopener';
      anchor.click();
      setFeedback('Téléchargement demandé.');
    } finally {
      URL.revokeObjectURL(url);
    }
  };

  return (
    <section aria-labelledby="recovery-codes-title" className="auth-card auth-card--wide">
      <header className="auth-card__header">
        <p className="admin-eyebrow">Affichage unique</p>
        <h1 id="recovery-codes-title">Codes de récupération</h1>
        <p>Conservez ces dix codes hors ligne. Ils ne seront pas affichés de nouveau.</p>
      </header>
      <ol aria-label="Dix codes de récupération" className="recovery-code-list">
        {codes.map((code) => (
          <li key={code.selector}>
            <code>
              {code.selector}-{code.verifier}
            </code>
          </li>
        ))}
      </ol>
      <div className="auth-actions">
        <button className="auth-secondary" onClick={() => void copy()} type="button">
          Copier les codes
        </button>
        <button className="auth-secondary" onClick={download} type="button">
          Télécharger le fichier texte
        </button>
      </div>
      {feedback === undefined ? null : (
        <p aria-live="polite" className="auth-status" role="status">
          {feedback}
        </p>
      )}
      <label className="auth-confirmation">
        <input
          checked={acknowledged}
          onChange={(event) => setAcknowledged(event.currentTarget.checked)}
          type="checkbox"
        />
        J’ai sauvegardé mes dix codes dans un emplacement sûr.
      </label>
      <button className="auth-submit" disabled={!acknowledged} onClick={onContinue} type="button">
        Continuer
      </button>
    </section>
  );
}
