import { describe, expect, it } from 'vitest';

import { metadata } from './layout';

describe('métadonnées d’administration', () => {
  it('interdit l’indexation et la mise en cache des extraits', () => {
    expect(metadata.applicationName).toBe('KORA+ Administration');
    expect(metadata.robots).toMatchObject({
      follow: false,
      index: false,
      noarchive: true,
      noimageindex: true,
      nosnippet: true,
    });
  });
});
