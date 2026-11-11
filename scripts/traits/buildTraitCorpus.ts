/* Builds the trait corpus (spec §3) deterministically from a seed. Run
   scripts/traits/generate-trait-corpus.mts to write the file; a test checks the
   committed file is exactly what this builds.

   Each joke gets a hidden "quality" q = u^QUALITY_EXPONENT (u uniform), and on
   each of the 11 matched criteria lands on PILOT_IDEAL's category with
   probability q, else on a uniformly drawn category (never the catch-all). So
   most jokes sit far from the pilot's ideal and a few sit close: about 4 % clear
   the customers' bar of 8 (buildTraitCorpus.test.ts pins 2–6 %). Fit means
   something only against PILOT_IDEAL (config/dimensions DEFAULT_IDEAL_PROFILE,
   the ideal the pilot starts both rounds with; the backend's llm.PilotIdeal).

   The text is whole sentences of plain synthetic prose from a small word bank
   for the joke's topic, with a word count inside its Length category
   (scoring/length.go: Short ≤ 15 words, Medium 16–40, Long ≥ 41). */
import { DEFAULT_IDEAL_PROFILE, IDEAL_DIMENSIONS, isCatchAll, type IdealDimension } from '../../config/dimensions';
import { seededRng } from '../../services/shared/jokes';
import { TRAIT_CORPUS_VERSION, type TraitCorpus, type TraitJoke, type Traits } from '../../services/shared/traitCorpus';

export const TRAIT_CORPUS_SEED = 'trait-corpus-v1';
export const TRAIT_CORPUS_SIZE = 1000;
export const QUALITY_EXPONENT = 20;
/** The ideal the corpus is aligned to: the pilot's ideal. */
export const PILOT_IDEAL: Readonly<Record<IdealDimension, string>> = DEFAULT_IDEAL_PROFILE;

/** Word counts per Length category, inside scoring/length.go's buckets. */
export const WORD_RANGES: Readonly<Record<string, readonly [number, number]>> = {
  Short: [7, 15],
  Medium: [16, 40],
  Long: [41, 60],
};

interface Bank { stem: string; subjects: string[]; objects: string[] }

const BANKS: Readonly<Record<string, Bank>> = {
  Work: { stem: 'Office Memo', subjects: ['My boss', 'The intern', 'Our standup', 'The office printer', 'Payroll', 'The new manager'], objects: ['the meeting about meetings', 'a spreadsheet nobody reads', 'the quarterly goals', 'the shared calendar', 'my lunch break', 'the reply-all thread'] },
  Relationships: { stem: 'Date Night', subjects: ['My partner', 'My date', 'Our couples therapist', 'My ex', 'The wedding planner', 'My best friend'], objects: ['the dinner reservation', 'our anniversary', 'the shared playlist', 'the last slice of pizza', 'my texting style', 'the thermostat'] },
  Family: { stem: 'Family Dinner', subjects: ['My grandmother', 'My little brother', 'Dad', 'My aunt', 'The family group chat', 'My cousin'], objects: ['the holiday seating chart', 'the television remote', 'the family recipe', 'the road trip snacks', 'the baby photos', 'the borrowed lawnmower'] },
  Food: { stem: 'Kitchen Note', subjects: ['The chef', 'My toaster', 'The waiter', 'My smoothie', 'The food truck', 'Our pizza place'], objects: ['the secret sauce', 'a gluten-free menu', 'the last avocado', 'the dessert cart', 'the soup of the day', 'my sandwich order'] },
  Technology: { stem: 'Tech Support', subjects: ['My phone', 'The smart fridge', 'The update', 'My laptop', 'The password manager', 'The chatbot'], objects: ['the Wi-Fi password', 'my search history', 'the cloud backup', 'the terms of service', 'the loading bar', 'the printer driver'] },
  Animals: { stem: 'Pet Report', subjects: ['My cat', 'The neighbor dog', 'A pigeon', 'Our goldfish', 'The parrot', 'A raccoon'], objects: ['the sunny spot', 'the treat jar', 'my good shoes', 'the bird feeder', 'the vet appointment', 'the garden hose'] },
  School: { stem: 'Class Notes', subjects: ['My teacher', 'The principal', 'My lab partner', 'The substitute', 'The school bus', 'The cafeteria'], objects: ['the pop quiz', 'my homework', 'the group project', 'the field trip', 'the seating plan', 'the science fair'] },
  Money: { stem: 'Budget Line', subjects: ['My bank', 'The tax form', 'My budget app', 'The landlord', 'My wallet', 'The coupon'], objects: ['the late fee', 'my savings goal', 'the receipt', 'the monthly subscription', 'the rent increase', 'my credit score'] },
  Travel: { stem: 'Travel Log', subjects: ['The airline', 'My suitcase', 'The tour guide', 'The hotel', 'The GPS', 'The train'], objects: ['the boarding pass', 'the window seat', 'my packing list', 'the hotel breakfast', 'the scenic route', 'the travel pillow'] },
  Health: { stem: 'Health Check', subjects: ['My doctor', 'The gym', 'My step counter', 'The dentist', 'My yoga teacher', 'The pharmacy'], objects: ['the annual checkup', 'my water intake', 'the new diet', 'the waiting room', 'the flu shot', 'my posture'] },
  Sports: { stem: 'Game Day', subjects: ['The coach', 'The referee', 'Our goalie', 'The mascot', 'My fantasy team', 'The marathon'], objects: ['the final whistle', 'the team photo', 'the halftime snacks', 'the warm-up lap', 'the trophy case', 'the playbook'] },
  Politics: { stem: 'Town Hall', subjects: ['The mayor', 'The city council', 'The campaign', 'The committee', 'The debate moderator', 'The petition'], objects: ['the budget vote', 'the new parking rules', 'the ribbon cutting', 'the town meeting', 'the yard signs', 'the press release'] },
  Everyday: { stem: 'Daily Life', subjects: ['My alarm clock', 'The laundry', 'My neighbor', 'The mail carrier', 'The grocery list', 'My umbrella'], objects: ['the morning commute', 'the junk drawer', 'the parking spot', 'the self-checkout', 'the lost sock', 'the weekend plans'] },
  Language: { stem: 'Word Play', subjects: ['The dictionary', 'My spellchecker', 'The grammar teacher', 'A comma', 'The thesaurus', 'An apostrophe'], objects: ['the silent letter', 'the run-on sentence', 'the plural of moose', 'the semicolon', 'the long word', 'the typo'] },
  Other: { stem: 'Odd Fact', subjects: ['A ghost', 'The universe', 'A time traveler', 'The moon', 'A wizard', 'The weather'], objects: ['the full moon', 'the lucky penny', 'the mystery box', 'the old map', 'the crystal ball', 'the plot twist'] },
};

const VERBS = ['asked about', 'forgot', 'replaced', 'scheduled', 'explained', 'lost', 'renamed', 'approved', 'questioned', 'praised'];
const TAILS = [
  'and nobody noticed', 'twice before lunch', 'with a straight face', 'in the group chat', 'on a Friday afternoon',
  'for the third time', 'without asking anyone', 'and called it progress', 'right before the deadline', 'with great confidence',
];

const pick = <T,>(xs: readonly T[], rand: () => number): T => xs[Math.floor(rand() * xs.length)];
const between = (lo: number, hi: number, rand: () => number): number => lo + Math.floor(rand() * (hi - lo + 1));

/**
 * Whole sentences from the topic's bank until the text reaches a word count
 * drawn from [lo, hi]; a text that overshoots hi is drawn again.
 */
function prose(topic: string, [lo, hi]: readonly [number, number], rand: () => number): string {
  const bank = BANKS[topic];
  for (;;) {
    const target = between(lo, hi, rand);
    const words: string[] = [];
    while (words.length < target) {
      words.push(...`${pick(bank.subjects, rand)} ${pick(VERBS, rand)} ${pick(bank.objects, rand)} ${pick(TAILS, rand)}.`.split(' '));
    }
    if (words.length <= hi) return words.join(' ');
  }
}

export function buildTraitCorpus(size = TRAIT_CORPUS_SIZE, seed = TRAIT_CORPUS_SEED): TraitCorpus {
  const rand = seededRng(seed);
  const texts = new Set<string>();
  const perTopic = new Map<string, number>();
  const jokes: TraitJoke[] = [];
  for (let i = 1; i <= size; i++) {
    const q = rand() ** QUALITY_EXPONENT;
    const traits = {} as Traits;
    for (const d of IDEAL_DIMENSIONS) {
      traits[d.id as IdealDimension] = rand() < q
        ? PILOT_IDEAL[d.id as IdealDimension]
        : pick(d.categories.filter(c => !isCatchAll(c)), rand);
    }
    let text = prose(traits.TOPIC, WORD_RANGES[traits.LENGTH], rand);
    // A repeated text gets a fresh draw.
    while (texts.has(text)) text = prose(traits.TOPIC, WORD_RANGES[traits.LENGTH], rand);
    texts.add(text);
    const n = (perTopic.get(traits.TOPIC) ?? 0) + 1;
    perTopic.set(traits.TOPIC, n);
    jokes.push({ id: `T${String(i).padStart(4, '0')}`, title: `${BANKS[traits.TOPIC].stem} No. ${n}`, text, traits });
  }
  return { version: TRAIT_CORPUS_VERSION, seed, jokes };
}

/** The file's exact text: one joke per line, so a diff names the jokes that changed. */
export function serializeTraitCorpus(c: TraitCorpus): string {
  const head = JSON.stringify({ version: c.version, seed: c.seed });
  const lines = c.jokes.map(j => JSON.stringify({ id: j.id, title: j.title, text: j.text, traits: j.traits }));
  return `${head.slice(0, -1)},"jokes":[\n${lines.join(',\n')}\n]}\n`;
}
