// services/bots/deck.ts
import type { JokeFixture } from '../shared/jokes';
import type { JokeMemory } from './personas';

/**
 * Draws jokes WITH replacement.
 *
 * The corpus has 60 jokes. At human pace a bot team submits every one to two
 * minutes, so a ten-minute round wants 25–40 jokes per team. Each team works
 * through its own shuffle of the corpus and reshuffles when it runs dry. A
 * reshuffle never hands back a joke already in the batch being drawn, so one
 * batch never contains the same joke twice.
 */
export class Deck {
  private pile: JokeFixture[] = [];

  constructor(
    private readonly corpus: readonly JokeFixture[],
    private readonly rand: () => number,
  ) {
    if (corpus.length === 0) throw new Error('Deck needs a non-empty corpus');
    // The in-batch exclusion in reshuffle() is keyed on id, so two fixtures
    // sharing one would let a single batch repeat a joke.
    if (new Set(corpus.map(j => j.id)).size !== corpus.length) {
      throw new Error('Deck corpus has duplicate joke ids');
    }
  }

  draw(n: number): JokeFixture[] {
    if (n > this.corpus.length) {
      throw new RangeError(`cannot draw ${n} distinct jokes from ${this.corpus.length}`);
    }
    const out: JokeFixture[] = [];
    while (out.length < n) {
      if (this.pile.length === 0) this.pile = this.reshuffle(out);
      out.push(this.pile.pop() as JokeFixture);
    }
    return out;
  }

  private reshuffle(exclude: readonly JokeFixture[]): JokeFixture[] {
    const taken = new Set(exclude.map(j => j.id));
    const pile = this.corpus.filter(j => !taken.has(j.id));
    for (let i = pile.length - 1; i > 0; i--) {
      const k = Math.floor(this.rand() * (i + 1));
      [pile[i], pile[k]] = [pile[k], pile[i]];
    }
    return pile;
  }
}

/** How many fresh draws the Learner spends avoiding a known dud before it accepts one. */
export const LEARNER_MAX_REDRAWS = 12;

/**
 * The Learner's Joke Maker: "write more jokes like the ones that sold".
 *
 * It fills up to floor(size/2) slots with corpus jokes whose text the team has
 * seen sell, rotating through them from `cursor` so it does not resubmit only
 * one, then fills the rest with fresh draws, redrawing up to
 * LEARNER_MAX_REDRAWS times to avoid a text the team has seen not sell. If the
 * deck cannot avoid one, it accepts it. A batch never repeats a joke. With no
 * sold text known it is exactly `deck.draw(size)`.
 *
 * Returns the batch and the cursor for the next call.
 */
export function drawLearnerBatch(
  deck: Deck, corpus: readonly JokeFixture[], memory: JokeMemory, size: number, cursor: number,
): { jokes: JokeFixture[]; cursor: number } {
  const sold = corpus.filter(j => memory.get(j.text.trim()) === 'sold');
  if (sold.length === 0) return { jokes: deck.draw(size), cursor };

  const reuse = Math.min(Math.floor(size / 2), sold.length);
  const jokes: JokeFixture[] = [];
  for (let i = 0; i < reuse; i++) jokes.push(sold[(cursor + i) % sold.length]);
  const taken = new Set(jokes.map(j => j.id));

  // Bounded: a candidate already in the batch never counts, and a deck larger
  // than the batch yields a new one within a couple of passes.
  const safety = LEARNER_MAX_REDRAWS + 4 * corpus.length;
  while (jokes.length < size) {
    let fallback: JokeFixture | null = null;
    let chosen: JokeFixture | null = null;
    for (let attempt = 0; attempt < safety && !chosen; attempt++) {
      const [candidate] = deck.draw(1);
      if (taken.has(candidate.id)) continue;
      if (memory.get(candidate.text.trim()) !== 'unsold') chosen = candidate;
      else {
        fallback ??= candidate;
        if (attempt + 1 >= LEARNER_MAX_REDRAWS) chosen = fallback;
      }
    }
    chosen ??= fallback;
    if (!chosen) throw new RangeError(`cannot fill a batch of ${size} from ${corpus.length} jokes`);
    jokes.push(chosen);
    taken.add(chosen.id);
  }
  return { jokes, cursor: (cursor + reuse) % sold.length };
}
