/* Node only: reads the committed trait corpus (spec §3). The pilot and the tests
   hand the parsed corpus to the bot engine (EngineDeps.traitCorpus); the browser
   worker never loads it. */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseTraitCorpus, type TraitCorpus } from '../../services/shared/traitCorpus';

export const TRAIT_CORPUS_PATH = fileURLToPath(new URL('./trait-corpus.json', import.meta.url));

export function loadTraitCorpus(path = TRAIT_CORPUS_PATH): TraitCorpus {
  return parseTraitCorpus(JSON.parse(readFileSync(path, 'utf8')));
}
