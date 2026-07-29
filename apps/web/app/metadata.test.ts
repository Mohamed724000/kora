import { describe, expect, it } from 'vitest';

import { metadata } from './layout';

describe('métadonnées publiques', () => {
  it('définit une base SEO indexable sans URL de production inventée', () => {
    expect(metadata.applicationName).toBe('KORA+');
    expect(metadata.description).toContain('cultures africaines');
    expect(metadata.metadataBase).toBeUndefined();
    expect(metadata.robots).toMatchObject({ follow: true, index: true });
    expect(metadata.title).toMatchObject({
      default: 'KORA+ — Cultures africaines',
      template: '%s — KORA+',
    });
  });
});
