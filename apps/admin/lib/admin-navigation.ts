import type { MenuNode } from '@adminlte/react';

export type AdminArea = {
  href: `#${string}`;
  icon: `bi bi-${string}`;
  id: string;
  label: string;
};

export const adminAreas: readonly AdminArea[] = [
  {
    href: '#tableau-de-bord',
    icon: 'bi bi-grid-1x2',
    id: 'tableau-de-bord',
    label: 'Tableau de bord',
  },
  {
    href: '#securite-du-compte',
    icon: 'bi bi-shield-check',
    id: 'securite-du-compte',
    label: 'Sécurité du compte',
  },
];

export const adminMenuItems: MenuNode[] = [
  { href: '/', icon: 'bi bi-grid-1x2', text: 'Tableau de bord', type: 'item' },
  {
    href: '/compte/securite',
    icon: 'bi bi-shield-check',
    text: 'Sécurité du compte',
    type: 'item',
  },
];
