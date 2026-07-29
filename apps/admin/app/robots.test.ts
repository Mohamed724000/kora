import { describe, expect, it } from 'vitest';

import robots from './robots';

describe('robots.txt du back-office', () => {
  it('refuse tout parcours aux robots', () => {
    expect(robots()).toEqual({
      rules: {
        disallow: '/',
        userAgent: '*',
      },
    });
  });
});
