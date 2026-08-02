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
    href: '#utilisateurs',
    icon: 'bi bi-people',
    id: 'utilisateurs',
    label: 'Utilisateurs',
  },
  { href: '#artistes', icon: 'bi bi-mic', id: 'artistes', label: 'Artistes' },
  {
    href: '#contenus',
    icon: 'bi bi-collection-play',
    id: 'contenus',
    label: 'Contenus',
  },
  { href: '#commandes', icon: 'bi bi-receipt', id: 'commandes', label: 'Commandes' },
  {
    href: '#paiements',
    icon: 'bi bi-credit-card',
    id: 'paiements',
    label: 'Paiements',
  },
  {
    href: '#finance-artistes',
    icon: 'bi bi-cash-stack',
    id: 'finance-artistes',
    label: 'Finance artistes',
  },
  { href: '#fidelite', icon: 'bi bi-award', id: 'fidelite', label: 'Fidélité' },
  {
    href: '#securite',
    icon: 'bi bi-shield-check',
    id: 'securite',
    label: 'Sécurité',
  },
  {
    href: '#notifications',
    icon: 'bi bi-bell',
    id: 'notifications',
    label: 'Notifications',
  },
  {
    href: '#catalogue',
    icon: 'bi bi-journal-richtext',
    id: 'catalogue',
    label: 'Catalogue',
  },
  {
    href: '#configuration',
    icon: 'bi bi-sliders',
    id: 'configuration',
    label: 'Configuration',
  },
  { href: '#audit', icon: 'bi bi-activity', id: 'audit', label: 'Audit' },
];

export const adminMenuItems: MenuNode[] = adminAreas.map(({ href, icon, label }) => ({
  href,
  icon,
  text: label,
  type: 'item',
}));
