import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

import { contractsInputDigest, prepareContractsForRoot } from './prepare-contracts.mjs';

const fixtures = [];

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'kora-contracts-inputs-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'package.json'), '{}\n');
  writeFileSync(join(root, 'tsconfig.json'), '{}\n');
  writeFileSync(join(root, 'tsconfig.build.json'), '{}\n');
  writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 1;\n');
  fixtures.push(root);
  return root;
}

afterEach(() => {
  for (const root of fixtures.splice(0)) rmSync(root, { force: true, recursive: true });
});

describe('préparation Contracts Admin', () => {
  it('calcule une empreinte déterministe et sensible aux sources', () => {
    const root = fixture();
    const first = contractsInputDigest(root);
    expect(contractsInputDigest(root)).toBe(first);
    writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 2;\n');
    expect(contractsInputDigest(root)).not.toBe(first);
  });

  it('construit depuis un dist absent et valide les deux exports', () => {
    const root = fixture();
    const digest = prepareContractsForRoot(root, () => {
      mkdirSync(join(root, 'dist'), { recursive: true });
      writeFileSync(join(root, 'dist', 'index.js'), 'export {};\n');
      writeFileSync(join(root, 'dist', 'index.d.ts'), 'export {};\n');
    });

    expect(digest).toBe(contractsInputDigest(root));
    expect(existsSync(join(root, '.prepare-contracts.lock'))).toBe(false);
  });

  it('refuse une mutation concurrente des entrées et libère le verrou', () => {
    const root = fixture();

    expect(() =>
      prepareContractsForRoot(root, () => {
        mkdirSync(join(root, 'dist'), { recursive: true });
        writeFileSync(join(root, 'dist', 'index.js'), 'export {};\n');
        writeFileSync(join(root, 'dist', 'index.d.ts'), 'export {};\n');
        writeFileSync(join(root, 'src', 'index.ts'), 'export const value = 2;\n');
      }),
    ).toThrow('Contracts inputs changed');
    expect(existsSync(join(root, '.prepare-contracts.lock'))).toBe(false);
  });

  it('refuse une préparation concurrente avant de supprimer le dist existant', () => {
    const root = fixture();
    mkdirSync(join(root, 'dist'), { recursive: true });
    writeFileSync(join(root, 'dist', 'sentinel.txt'), 'preserve\n');
    writeFileSync(join(root, '.prepare-contracts.lock'), 'locked\n');

    expect(() => prepareContractsForRoot(root, () => undefined)).toThrow(
      'Another Contracts preparation is active',
    );
    expect(existsSync(join(root, 'dist', 'sentinel.txt'))).toBe(true);
  });
});
