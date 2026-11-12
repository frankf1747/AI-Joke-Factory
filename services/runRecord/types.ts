/* The run record: one JSON file per class, raw facts only
   (docs/superpowers/specs/2026-11-12-experiment-records-design.md §3).
   Every measure is computed when a record is loaded. */

export const RUN_RECORD_FORMAT = 'jf-run-record';
export const RUN_RECORD_VERSION = 1;

export type PlayedBy = 'students' | 'bots' | 'mixed';

/** What a bot team was created with; only `persona` is always known. */
export interface RunBot {
  persona: string;
  use_feedback?: boolean;
  round2_batch_size?: number;
  release_all?: boolean;
  seed?: string;
}

export interface RunBatch {
  seq: number;
  sent_s: number;
  jokes: number;
  released: number;
  sold: number;
  first_sale_s: number | null;
}

export interface RunFees { listing: number; hosting: number; shipping: number; storage: number; discard: number; total: number }

export interface RunTeam {
  team_id: number;
  team: string;
  profit: number;
  sold: number;
  released: number;
  made: number;
  never_sold: number | null;
  discarded: number;
  fees: RunFees;
  sent_to_released_s: number | null;
  to_first_sale_s: number | null;
  /** Absent in a Classic round. */
  batches?: RunBatch[];
  /** Pilot only: mean fit of each batch's released jokes. */
  fit_by_batch?: Array<{ seq: number; fit: number | null }>;
  bot?: RunBot;
}

export type SettingValue = number | string;

export interface RunRound {
  round: 1 | 2;
  round_id: number;
  status: string;
  started_at: string | null;
  ended_at: string | null;
  settings: Record<string, SettingValue>;
  ideal_profile?: Record<string, string>;
  teams: RunTeam[];
}

export interface RunRecord {
  format: typeof RUN_RECORD_FORMAT;
  version: number;
  name: string;
  notes?: string;
  played_by: PlayedBy;
  exported_at: string;
  rounds: RunRound[];
}

/** Every setting a record keeps, in display order: [snake_case key on InstructorRound, label]. */
export const SETTING_FIELDS: ReadonlyArray<readonly [string, string]> = [
  ['market_mode', 'Market mode'],
  ['batch_size', 'Batch size'],
  ['max_batch_size', 'Largest batch'],
  ['arrival_window_seconds', 'Customer arrival window (s)'],
  ['market_price', 'Price'],
  ['customer_budget', 'Customer budget'],
  ['customers_per_team', 'Customers per team'],
  ['customer_count', 'Customers'],
  ['buy_threshold', 'Buy threshold'],
  ['jitter', 'Jitter'],
  ['preference_base', 'Preference base'],
  ['swap_margin', 'Swap margin'],
  ['feedback_pass_threshold', 'Feedback pass threshold'],
  ['feedback_joke_count', 'Feedback jokes shown'],
  ['wip_limit', 'WIP limit'],
  ['cost_of_publishing', 'Listing'],
  ['hosting_fee_per_joke_minute', 'Hosting per joke-minute'],
  ['shipping_fee_small', 'Shipping, small'],
  ['shipping_fee_standard', 'Shipping, standard'],
  ['shipping_fee_large', 'Shipping, large'],
  ['storage_fee_per_joke_minute', 'Storage per joke-minute'],
  ['cost_of_discard', 'Discard'],
];
