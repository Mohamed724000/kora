import type { AdminRecoveryCode, AdminSessionSummary } from '@kora-plus/contracts';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AccountSecurityPanel } from './account-security-panel';
import { AuthCard } from './auth-card';
import { AdminRetryAfterStatus } from './auth-form-field';
import { RecoveryCodesPanel } from './recovery-codes-panel';
import { TotpInput } from './totp-input';

const codes: readonly AdminRecoveryCode[] = Array.from({ length: 10 }, (_, index) => ({
  selector: `ABCDEFG${String(index + 2).padStart(1, '2')}`,
  verifier: `ABCDEFGHJKLMNPQRSTUVWXYZ23${String(index + 2).padStart(2, '4')}`,
}));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('écrans d’authentification C3', () => {
  it('conserve un seul titre principal dans la carte', () => {
    render(
      <AuthCard description="Description" title="Connexion">
        <p>Contenu</p>
      </AuthCard>,
    );
    expect(screen.getByRole('heading', { level: 1, name: 'Connexion' })).toBeVisible();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('filtre le TOTP à six chiffres dans un seul champ accessible', () => {
    render(<TotpInput aria-label="TOTP" defaultValue="" />);
    const input = screen.getByRole('textbox', { name: 'TOTP' });
    fireEvent.change(input, { target: { value: '12a34 567' } });
    expect(input).toHaveValue('123456');
    expect(input).toHaveAttribute('autocomplete', 'one-time-code');
  });

  it('n’autorise copie et téléchargement que sur geste puis exige confirmation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const createObjectURL = vi.fn(() => 'blob:recovery-codes');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { ...URL, createObjectURL, revokeObjectURL });
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const onContinue = vi.fn();

    render(<RecoveryCodesPanel codes={codes} onContinue={onContinue} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    const continueButton = screen.getByRole('button', { name: 'Continuer' });
    expect(continueButton).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Copier les codes' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Télécharger le fichier texte' }));
    expect(createObjectURL).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:recovery-codes');

    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalledOnce();
  });

  it('rend un refus de presse-papiers explicite sans prétendre avoir copié', async () => {
    const writeText = vi.fn().mockRejectedValue(new Error('clipboard denied'));
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });

    render(<RecoveryCodesPanel codes={codes} onContinue={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Copier les codes' }));

    expect(await screen.findByText(/Copie impossible/iu)).toBeVisible();
    expect(screen.queryByText(/Codes copiés/iu)).not.toBeInTheDocument();
  });

  it('rend les sessions personnelles en lecture seule et la rotation TOTP inline', async () => {
    const sessions: readonly AdminSessionSummary[] = [
      {
        absoluteExpiresAt: '2026-10-27T11:00:00.000Z',
        createdAt: '2026-10-26T20:00:00.000Z',
        current: true,
        idleExpiresAt: '2026-10-26T23:30:00.000Z',
        lastSeenAt: '2026-10-26T22:00:00.000Z',
        sessionId: '00000000-0000-4000-8000-000000000002',
      },
    ];
    const onRotate = vi.fn().mockResolvedValue(undefined);
    render(
      <AccountSecurityPanel
        loading={false}
        onLogout={vi.fn().mockResolvedValue(undefined)}
        onRefresh={vi.fn().mockResolvedValue(undefined)}
        onRotate={onRotate}
        rotationBlocked={false}
        rotationRateLimited={false}
        rotationRetryAfterSeconds={0}
        sessions={sessions}
      />,
    );
    expect(screen.getByRole('listitem')).toHaveTextContent('Session actuelle');
    expect(screen.queryByRole('button', { name: /révoquer/iu })).not.toBeInTheDocument();
    const input = screen.getByRole('textbox', { name: 'Code à six chiffres' });
    fireEvent.change(input, { target: { value: '123456' } });
    fireEvent.click(screen.getByRole('button', { name: 'Créer dix nouveaux codes' }));
    await waitFor(() => expect(onRotate).toHaveBeenCalledWith('123456'));
  });

  it('annonce Retry-After seulement au début et lors de la réactivation', async () => {
    const { rerender } = render(<AdminRetryAfterStatus remainingSeconds={3} />);
    const live = screen.getByRole('status');
    await waitFor(() =>
      expect(live).toHaveTextContent('Nouvelle tentative possible dans 3 secondes.'),
    );

    rerender(<AdminRetryAfterStatus remainingSeconds={2} />);
    expect(live).toHaveTextContent('Nouvelle tentative possible dans 3 secondes.');
    expect(screen.getByText('Nouvelle tentative possible dans 2 secondes.')).toHaveAttribute(
      'aria-hidden',
      'true',
    );

    rerender(<AdminRetryAfterStatus remainingSeconds={0} />);
    await waitFor(() =>
      expect(live).toHaveTextContent('Vous pouvez effectuer une nouvelle tentative.'),
    );
  });

  it('distingue le rate limit du résultat inconnu lors de la rotation', () => {
    const base = {
      loading: false,
      onLogout: vi.fn().mockResolvedValue(undefined),
      onRefresh: vi.fn().mockResolvedValue(undefined),
      onRotate: vi.fn().mockResolvedValue(undefined),
      rotationRetryAfterSeconds: 17,
      sessions: [] as readonly AdminSessionSummary[],
    };
    const { rerender } = render(
      <AccountSecurityPanel {...base} rotationBlocked={false} rotationRateLimited />,
    );
    expect(screen.getByRole('button', { name: 'Veuillez patienter' })).toBeDisabled();
    expect(screen.queryByText(/Résultat inconnu/iu)).not.toBeInTheDocument();

    rerender(
      <AccountSecurityPanel
        {...base}
        rotationBlocked
        rotationRateLimited={false}
        rotationRetryAfterSeconds={0}
      />,
    );
    expect(
      screen.getByRole('button', { name: 'Résultat inconnu — rotation bloquée' }),
    ).toBeDisabled();
  });
});
