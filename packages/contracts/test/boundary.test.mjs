import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the contract boundary exports only the generated S1.1 audio pilot surface', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

  assert.equal(source.trim(), "export * from './generated/audio-pilot.js';");
});

test('the generated boundary contains no raw media or production-provider field', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');

  assert.match(source, /PaymentProvider = 'SANDBOX_NEUTRAL'/);
  assert.match(source, /readonly descriptor: string/);
  assert.doesNotMatch(
    source,
    /\b(?:media|preview|playback|receipt)(?:Url|Uri)\b|\b(?:r2|mux|storageObjectKey)\b/i,
  );
});
