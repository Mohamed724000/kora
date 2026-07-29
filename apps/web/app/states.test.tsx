import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import ErrorPage from './error';
import Loading from './loading';
import NotFound from './not-found';

describe('états du site public', () => {
  it('annonce le chargement', () => {
    render(<Loading />);

    expect(screen.getByRole('status')).toHaveTextContent('Chargement');
  });

  it('permet une reprise explicite après une erreur', () => {
    const reset = vi.fn();

    render(<ErrorPage error={new Error('indisponible')} reset={reset} />);
    screen.getByRole('button', { name: 'Réessayer' }).click();

    expect(reset).toHaveBeenCalledOnce();
    expect(screen.getByRole('alert')).not.toHaveTextContent('indisponible');
  });

  it('propose un retour sûr depuis une adresse inconnue', () => {
    render(<NotFound />);

    expect(screen.getByRole('link', { name: 'Revenir à l’accueil' })).toHaveAttribute('href', '/');
  });
});
