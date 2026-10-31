import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { adminMenuItems } from '../../lib/admin-navigation';
import AdminHomePage from './page';

describe('tableau de bord C3 protégé', () => {
  it('n’expose que les deux destinations réellement livrées', () => {
    expect(adminMenuItems).toEqual([
      expect.objectContaining({ href: '/', text: 'Tableau de bord' }),
      expect.objectContaining({ href: '/compte/securite', text: 'Sécurité du compte' }),
    ]);
  });

  it('reste honnête et sans donnée métier fictive', () => {
    const { container } = render(<AdminHomePage />);

    expect(screen.getByRole('heading', { level: 1, name: 'Tableau de bord' })).toBeInTheDocument();
    expect(screen.getByText('Session d’administration active')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ouvrir la sécurité du compte' })).toHaveAttribute(
      'href',
      '/compte/securite',
    );
    expect(container.querySelector('canvas, table, form')).not.toBeInTheDocument();
  });
});
