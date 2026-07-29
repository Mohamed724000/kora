import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { ActionButton, BrandMark, SkipLink, StatusPanel } from './index';

describe('primitives partagées', () => {
  it('expose une signature KORA+ lisible par un lecteur d’écran', () => {
    render(<BrandMark context="Administration" />);

    expect(screen.getByText('KORA plus')).toBeInTheDocument();
    expect(screen.getByText('Administration')).toBeInTheDocument();
  });

  it('annonce les états de chargement sans minuterie', () => {
    render(
      <StatusPanel
        description="Le contenu est en cours de préparation."
        title="Chargement"
        variant="loading"
      />,
    );

    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
  });

  it('annonce immédiatement une erreur', () => {
    render(
      <StatusPanel
        description="La page ne peut pas être affichée."
        title="Erreur"
        variant="error"
      />,
    );

    expect(screen.getByRole('alert')).toBeInTheDocument();
  });

  it('conserve les comportements natifs des actions et liens', () => {
    const onClick = vi.fn();

    render(
      <>
        <ActionButton onClick={onClick}>Réessayer</ActionButton>
        <SkipLink href="#contenu">Aller au contenu</SkipLink>
      </>,
    );

    screen.getByRole('button', { name: 'Réessayer' }).click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.getByRole('link', { name: 'Aller au contenu' })).toHaveAttribute(
      'href',
      '#contenu',
    );
  });
});
