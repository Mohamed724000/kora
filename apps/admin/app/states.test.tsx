import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from './error';
import Loading from './loading';
import NotFound from './not-found';

describe('états du back-office', () => {
  it('annonce le chargement', () => {
    render(<Loading />);

    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
  });

  it('masque le détail interne et propose une reprise', () => {
    const reset = vi.fn();

    render(<ErrorPage error={new Error('détail interne')} reset={reset} />);
    screen.getByRole('button', { name: 'Réessayer' }).click();

    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).not.toHaveTextContent('détail interne');
  });

  it('ramène une adresse inconnue vers le seul écran disponible', () => {
    render(<NotFound />);

    expect(screen.getByRole('link', { name: 'Revenir au tableau de bord' })).toHaveAttribute(
      'href',
      '/',
    );
  });
});
