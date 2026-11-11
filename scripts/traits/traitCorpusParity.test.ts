/* The trait corpus and the fit fixtures are versioned files kept byte-identical
   in both repos (spec §3). Each repo pins their SHA-256 here (the backend in
   src/infra/llm/trait_corpus_parity_test.go), so a copy that drifts fails in the
   repo where it changed; when the backend repo sits next to this one, the copies
   are also compared directly. After regenerating, update both constants. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const TRAIT_CORPUS_SHA256 = '7daeba046d24cd4b8eb0f0aaf1e7c1811d5c328209b1fae745f3a386d8fe7e33';
const FIT_FIXTURES_SHA256 = '8ebe339deb91d1b661d6f4b1c25f2aab8d67da5ff4e73f303aee3bb55c431dd9';

const here = (p: string) => new URL(p, import.meta.url);
const sha256 = (u: URL) => createHash('sha256').update(readFileSync(u)).digest('hex');

const FILES = [
  { name: 'trait corpus', mine: here('./trait-corpus.json'), sum: TRAIT_CORPUS_SHA256,
    backend: here('../../../jokefactory_be/src/infra/llm/traitdata/trait-corpus.json') },
  { name: 'fit fixtures', mine: here('../../config/fit-fixtures.json'), sum: FIT_FIXTURES_SHA256,
    backend: here('../../../jokefactory_be/src/core/domain/scoring/testdata/fit-fixtures.json') },
];

describe('shared files', () => {
  for (const f of FILES) {
    it(`the ${f.name} is the versioned copy`, () => {
      expect(sha256(f.mine)).toBe(f.sum);
    });
    it.skipIf(!existsSync(f.backend))(`the backend's ${f.name} matches byte for byte`, () => {
      expect(readFileSync(f.backend).equals(readFileSync(f.mine))).toBe(true);
    });
  }
});
