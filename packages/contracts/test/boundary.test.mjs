import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the contract boundary exports no premature business surface', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

  assert.equal(source.trim(), 'export {};');
  assert.doesNotMatch(source, /auth|catalog|entitlement|ledger|media|otp|payment|user/i);
});
