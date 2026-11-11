/* Writes scripts/traits/trait-corpus.json from buildTraitCorpus (deterministic).
   After regenerating: copy the file to the backend
   (jokefactory_be/src/infra/llm/traitdata/trait-corpus.json) and update
   TRAIT_CORPUS_SHA256 in both repos' parity tests.

   Usage: npx tsx scripts/traits/generate-trait-corpus.mts */
import { createHash } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { buildTraitCorpus, serializeTraitCorpus } from './buildTraitCorpus';
import { TRAIT_CORPUS_PATH } from './loadTraitCorpus';

const text = serializeTraitCorpus(buildTraitCorpus());
writeFileSync(TRAIT_CORPUS_PATH, text);
console.log(`wrote ${TRAIT_CORPUS_PATH} sha256 ${createHash('sha256').update(text).digest('hex')}`);
