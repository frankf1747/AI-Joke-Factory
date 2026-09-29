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
 */
export type PersonaId = 'CAREFUL' | 'BALANCED' | 'SPRAY';

export interface Persona {
  readonly id: PersonaId;
  readonly label: string;
  /** The Joke Maker's gap between batches, at 1× speed. */
  readonly submitIntervalMs: number;
  /** Careful holds its next batch until the previous one has customer feedback. */
  readonly waitForFeedback: boolean;
  /** How many of `jokeCount` to publish, before round rules are applied. */
  readonly publish: (jokeCount: number, rand: () => number) => number;
}

export const PERSONAS: Readonly<Record<PersonaId, Persona>> = {
  CAREFUL: {
    id: 'CAREFUL', label: 'Careful', submitIntervalMs: 150_000, waitForFeedback: true,
    publish: n => Math.min(2, n),
  },
  BALANCED: {
    id: 'BALANCED', label: 'Balanced', submitIntervalMs: 90_000, waitForFeedback: false,
    publish: (n, rand) => Math.min(rand() < 0.5 ? 3 : 4, n),
  },
  SPRAY: {
    id: 'SPRAY', label: 'Spray', submitIntervalMs: 45_000, waitForFeedback: false,
    publish: n => n,
  },
};

export const PERSONA_ORDER: readonly PersonaId[] = ['CAREFUL', 'BALANCED', 'SPRAY'];

/** Marketing's pause after each stage, at 1×, so a watched screen shows every state. */
export const DWELL_MS = { claim: 10_000, split: 15_000, decide: 10_000 } as const;
/** Careful's longest wait for feedback, at 1×. Divided by speed like every other wait. */
export const FEEDBACK_WAIT_MS = 180_000;
export const QUEUE_POLL_MS = 3_000;
export const IDLE_POLL_MS = 5_000;
/** Each classification is a paid Azure LLM call, so each bot team is capped per round. */
export const BATCH_CAP_PER_ROUND = 8;
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
