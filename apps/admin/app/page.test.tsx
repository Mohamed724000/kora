import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

const adminStyles = readFileSync(resolve(process.cwd(), 'app', 'globals.css'), 'utf8');

function cssColorToken(token: string): string {
  const match = new RegExp(`--${token}:\\s*(#[0-9a-f]{6})`, 'i').exec(adminStyles);
  if (match?.[1] === undefined) {
    throw new Error(`Token CSS introuvable : --${token}`);
  }

  return match[1];
}

function relativeLuminance(color: string): number {
  const channels = color
    .slice(1)
    .match(/.{2}/g)
    ?.map((channel) => Number.parseInt(channel, 16) / 255);
  const [red, green, blue] = channels ?? [];
  if (red === undefined || green === undefined || blue === undefined) {
    throw new Error(`Couleur hexadécimale invalide : ${color}`);
  }

  const linearize = (channel: number): number =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  return 0.2126 * linearize(red) + 0.7152 * linearize(green) + 0.0722 * linearize(blue);
}

function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

describe('fondation du back-office', () => {
  it('déclare exactement les treize zones officielles dans la sidebar', () => {
    expect(adminAreas.map(({ label }) => label)).toEqual(expectedAreas);
    expect(adminMenuItems).toHaveLength(13);
    expect(adminMenuItems.every((item) => item.type === 'item')).toBe(true);
  });

  it('relie chaque fragment de navigation à une cible DOM unique', () => {
    const { container } = render(<AdminFoundationPage />);
    const fragmentHrefs = adminMenuItems.flatMap((item) =>
      item.type === 'item' && item.href.startsWith('#') ? [item.href] : [],
    );

    expect(fragmentHrefs).toHaveLength(adminMenuItems.length);
    expect(fragmentHrefs).toEqual(adminAreas.map(({ href }) => href));
    for (const href of fragmentHrefs) {
      const targets = container.querySelectorAll(href);
      expect(targets).toHaveLength(1);
      expect(targets[0]).toHaveAttribute('id', href.slice(1));
    }
  });

  it('garantit un contraste AA déterministe pour le petit texte accentué', () => {
    const accentText = cssColorToken('admin-accent-text');
    const surface = cssColorToken('admin-surface');
    const canvas = cssColorToken('admin-canvas');

    expect(adminStyles).toMatch(/\.admin-eyebrow\s*\{[^}]*color:\s*var\(--admin-accent-text\);/s);
    expect(contrastRatio(accentText, surface)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(accentText, canvas)).toBeGreaterThanOrEqual(4.5);
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
