// services/bots/personas.ts
/**
 * How each bot team plays.
 *
 * Personas differ in VOLUME and PACE, not in selection quality. Bots cannot see
 * fit — no route serves it to any client — and the corpus has no structured
 * dimension tags, so a bot has nothing to judge quality with. That bounds what
 * this feature can answer: "under the current cost structure, does publishing
 * less ever beat publishing more?" It cannot answer whether well-chosen jokes
 * beat more jokes; that needs a quality-aware persona, which fits this table
 * without changing the engine.
 *
 * The one exception is the Learner, which still cannot see fit but can see
 * sales: a human Marketing seat reads its own team's batch list with each
 * joke's sold_count, and the Learner reads exactly that and nothing more.
 */
export type PersonaId = 'CAREFUL' | 'BALANCED' | 'SPRAY' | 'LEARNER';

export interface Persona {
  readonly id: PersonaId;
  readonly label: string;
  /** The Joke Maker's gap between batches, at 1× speed. */
  readonly submitIntervalMs: number;
  /** Careful holds its next batch until the previous one has customer feedback. */
  readonly waitForFeedback: boolean;
  /** How many of `jokeCount` to publish, before round rules are applied. */
  readonly publish: (jokeCount: number, rand: () => number) => number;
  /**
   * The Joke Maker's batch size from round 2 on, capped at the round's
   * batch_size (10 after Reset Game). Round 1 always uses batch_size (5),
   * because Marketing must split a round-1 batch into exactly that many jokes
   * (usecase/marketing.go Split).
   */
  readonly round2BatchSize: number;
  /** Marketing remembers which joke texts sold and chooses with chooseWithMemory. */
  readonly learns?: boolean;
}

export const PERSONAS: Readonly<Record<PersonaId, Persona>> = {
  CAREFUL: {
    id: 'CAREFUL', label: 'Careful', submitIntervalMs: 150_000, waitForFeedback: true,
    publish: n => Math.min(2, n), round2BatchSize: 5,
  },
  BALANCED: {
    id: 'BALANCED', label: 'Balanced', submitIntervalMs: 90_000, waitForFeedback: false,
    publish: (n, rand) => Math.min(rand() < 0.5 ? 3 : 4, n), round2BatchSize: 5,
  },
  /** Spray pushes the biggest batch the round allows: 10 jokes from round 2. */
  SPRAY: {
    id: 'SPRAY', label: 'Spray', submitIntervalMs: 45_000, waitForFeedback: false,
    publish: n => n, round2BatchSize: 10,
  },
  /**
   * The Learner closes the loop on both seats. Its Joke Maker resubmits texts
   * the team has seen sell (about half of each batch, rotating) and avoids
   * texts it has seen not sell; its Marketing keeps every joke it has seen
   * sell, drops ones it has seen fail, and fills the rest at random. Batches
   * are 3 jokes from round 2. It is honest: all it knows is the sold_count on
   * its own team's batch list, which every team can see. It never sees fit.
   */
  LEARNER: {
    id: 'LEARNER', label: 'Learner', submitIntervalMs: 60_000, waitForFeedback: true,
    publish: n => Math.min(2, n), round2BatchSize: 3, learns: true,
  },
};

/** Panel and team-number order. New personas go at the end so existing ones keep their slots. */
export const PERSONA_ORDER: readonly PersonaId[] = ['CAREFUL', 'BALANCED', 'SPRAY', 'LEARNER'];

/** Marketing's pause after each stage, at 1×, so a watched screen shows every state. */
export const DWELL_MS = { claim: 10_000, split: 15_000, decide: 10_000 } as const;
/** Careful's longest wait for feedback, at 1×. Divided by speed like every other wait. */
export const FEEDBACK_WAIT_MS = 180_000;
export const QUEUE_POLL_MS = 3_000;
export const IDLE_POLL_MS = 5_000;
/**
 * Each classification is a paid Azure LLM call, so each bot team is capped per
 * round, in JOKES: 40 in both rounds, whatever the batch size, so a persona
 * that sends batches of 10 gets no more jokes than one that sends batches of 3.
 */
export const JOKE_CAP_PER_ROUND = 40;
export const MAX_BOT_TEAMS = 12;

export function publishCount(
  persona: Persona, jokeCount: number, roundNumber: number, rand: () => number,
): number {
  if (jokeCount <= 0) return 0;
  const wanted = Math.max(0, Math.min(persona.publish(jokeCount, rand), jokeCount));
  // Round 1 refuses a batch with nothing published (usecase/marketing.go:218).
  // Every persona already clears it; this guards a future one that would not.
  return roundNumber === 1 ? Math.max(1, wanted) : wanted;
}

/** Which jokes to keep. Seeded random: personas choose volume, not quality. */
export function choosePublished(
  jokeIds: readonly number[], count: number, rand: () => number,
): Set<number> {
  const pool = jokeIds.slice();
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return new Set(pool.slice(0, Math.max(0, Math.min(count, pool.length))));
}

/** What the Learner has seen happen to each joke text it published. */
export type JokeMemory = Map<string, 'sold' | 'unsold'>;

/**
 * The Learner's decision: keep jokes it has seen sell (at most `count` of
 * them, first in batch order), drop every one it has seen fail, and fill the
 * remaining slots from jokes it has not seen —
 * chosen at random, because it has nothing else to go on. It sees only what a
 * human Marketing seat sees (sold counts on its own team's batches).
 *
 * Round 1 refuses a batch with nothing published (usecase/marketing.go:218),
 * so there it publishes at least one joke, a known dud if that is all it has.
 */
export function chooseWithMemory(
  jokes: readonly { joke_id: number; joke_text: string }[],
  memory: JokeMemory, count: number, rand: () => number, roundNumber = 2,
): Set<number> {
  const keep = new Set<number>();
  const unknown: number[] = [];
  const want = Math.max(roundNumber === 1 ? 1 : 0, count);
  for (const j of jokes) {
    const seen = memory.get(j.joke_text.trim());
    // Never more than the persona's count: the first `want` known sellers.
    if (seen === 'sold') {
      if (keep.size < want) keep.add(j.joke_id);
    } else if (seen === undefined) unknown.push(j.joke_id);
  }
  for (const id of choosePublished(unknown, Math.max(0, want - keep.size), rand)) keep.add(id);
  if (keep.size === 0 && roundNumber === 1 && jokes.length > 0) keep.add(jokes[0].joke_id);
  return keep;
}

/** Spread a duration by ±`spread` so bots never move in lockstep. */
export function jitter(ms: number, rand: () => number, spread = 0.25): number {
  return Math.round(ms * (1 - spread + 2 * spread * rand()));
}

/** Persona per bot team, interleaved so each persona spans the team numbers. */
export function personaSequence(counts: Readonly<Record<PersonaId, number>>): PersonaId[] {
  const left: Record<PersonaId, number> = { ...counts };
  const out: PersonaId[] = [];
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const id of PERSONA_ORDER) {
      if (left[id] > 0) {
        out.push(id);
        left[id]--;
        progressed = true;
      }
    }
  }
  return out;
}
