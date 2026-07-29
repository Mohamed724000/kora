import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import HomePage from './page';

describe('accueil public', () => {
  it('présente un contenu structuré et un état vide honnête', () => {
    render(<HomePage />);

    expect(
      screen.getByRole('heading', {
        level: 1,
        name: 'Les cultures africaines au premier plan.',
      }),
    ).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Aucun contenu publié' })).toBeInTheDocument();
    expect(screen.getByText('Le catalogue public n’est pas encore ouvert.')).toBeInTheDocument();
  });

  it('n’expose aucune surface de commerce ou de média', () => {
    const { container } = render(<HomePage />);
    const renderedText = container.textContent ?? '';

    expect(renderedText).not.toMatch(/\b(acheter|achat|paiement|télécharger|preview|aperçu)\b/i);
    expect(container.querySelector('audio, video, form')).not.toBeInTheDocument();
  });

  it('offre une navigation d’ancre utilisable au clavier', () => {
    render(<HomePage />);

    expect(screen.getByRole('link', { name: 'Voir l’état du catalogue' })).toHaveAttribute(
      'href',
      '#catalogue-public',
    );
  });
});
