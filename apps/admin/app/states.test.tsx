import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from './error';
import Loading from './loading';
import NotFound from './not-found';

describe('états du back-office', () => {
  it('annonce le chargement dans un shell anonyme sans navigation protégée', () => {
    render(<Loading />);

    expect(screen.getByRole('main')).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('heading', { level: 1, name: 'Chargement sécurisé' })).toBeVisible();
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/tableau de bord/iu)).not.toBeInTheDocument();
  });

  it('masque le détail interne et limite la reprise au rendu', () => {
    const retry = vi.fn();

    render(<ErrorPage error={new Error('détail interne')} retry={retry} />);
    const main = screen.getByRole('main');
    const alert = screen.getByRole('alert');
    screen.getByRole('button', { name: 'Réessayer l’affichage' }).click();

    expect(retry).toHaveBeenCalledOnce();
    expect(main).toHaveFocus();
    expect(alert).not.toHaveTextContent('détail interne');
    expect(alert).toHaveTextContent('Aucune opération n’est relancée automatiquement.');
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
  });

  it('oriente une adresse inconnue vers la connexion sans tableau de bord', () => {
    render(<NotFound />);

    expect(screen.getByRole('heading', { level: 1, name: 'Page introuvable' })).toBeVisible();
    expect(screen.getByRole('link', { name: 'Aller à la connexion' })).toHaveAttribute(
      'href',
      '/login',
    );
    expect(screen.queryByRole('navigation')).not.toBeInTheDocument();
    expect(screen.queryByText(/tableau de bord/iu)).not.toBeInTheDocument();
  });
});
