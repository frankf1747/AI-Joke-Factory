// services/bots/deck.ts
import type { JokeFixture } from '../shared/jokes';

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
