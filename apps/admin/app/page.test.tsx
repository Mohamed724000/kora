import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { adminAreas, adminMenuItems } from '../lib/admin-navigation';
import AdminFoundationPage from './page';

const expectedAreas = [
  'Tableau de bord',
  'Utilisateurs',
  'Artistes',
  'Contenus',
  'Commandes',
  'Paiements',
  'Finance artistes',
  'Fidélité',
  'Sécurité',
  'Notifications',
  'Catalogue',
  'Configuration',
  'Audit',
];

describe('fondation du back-office', () => {
  it('déclare exactement les treize zones officielles dans la sidebar', () => {
    expect(adminAreas.map(({ label }) => label)).toEqual(expectedAreas);
    expect(adminMenuItems).toHaveLength(13);
    expect(adminMenuItems.every((item) => item.type === 'item')).toBe(true);
  });

  it('rend treize repères honnêtes sans donnée opérationnelle', () => {
    const { container } = render(<AdminFoundationPage />);
    const zones = screen.getByRole('region', {
      name: 'Treize zones de navigation',
    });

    for (const area of expectedAreas) {
      expect(within(zones).getByRole('heading', { level: 3, name: area })).toBeInTheDocument();
    }

    expect(screen.getByText('Aucune donnée opérationnelle')).toBeInTheDocument();
    expect(container.querySelectorAll('.admin-zone-card')).toHaveLength(13);
  });

  it('ne rend ni graphique, ni tableau, ni formulaire, ni métrique fictive', () => {
    const { container } = render(<AdminFoundationPage />);

    expect(container.querySelector('canvas, table, form')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/\b(chiffre d’affaires|revenu total|conversion)\b/i);
  });
});
