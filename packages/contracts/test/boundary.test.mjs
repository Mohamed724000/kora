import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('the contract boundary exports only the generated S1.2-01 audio pilot surface', () => {
  const source = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8');

  assert.equal(source.trim(), "export * from './generated/audio-pilot.js';");
});

test('the generated boundary exposes readiness metadata without private media locations', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');

  assert.match(source, /PaymentProvider = 'SANDBOX_NEUTRAL'/);
  assert.match(source, /readonly descriptor: string/);
  assert.match(source, /readonly cover: PublicCoverImage/);
  assert.match(source, /readonly settledSalesCount: number/);
  assert.match(source, /readonly representation: 'CONTROLLED_API'/);
  assert.match(source, /readonly createdByAdminId: Identifier/);
  assert.match(source, /export type MuxMediaWebhookRequest/);
  assert.doesNotMatch(
    source,
    /\b\w*(?:Url|Uri)\b|\b(?:r2|storageObjectKey|sourceObjectKey|originKey|mediaLocator|privateProviderAssetRef|providerAssetId|muxAssetId|muxPlaybackId)\b/i,
  );
});

test('catalog provenance is response-only in the generated boundary', () => {
  const source = readFileSync(new URL('../src/generated/audio-pilot.ts', import.meta.url), 'utf8');
  const artistRequest = /export type UpsertArtistRequest = \{([\s\S]*?)\n\};/.exec(source)?.[1];
  const audioRequest = /export type UpsertAudioContentRequest = \{([\s\S]*?)\n\};/.exec(source)?.[1];

  assert.ok(artistRequest);
  assert.ok(audioRequest);
  assert.doesNotMatch(artistRequest, /createdByAdminId/);
  assert.doesNotMatch(audioRequest, /createdByAdminId/);
});
