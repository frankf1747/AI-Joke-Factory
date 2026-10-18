/* The guided tour's scripted screen state (components/tour/DemoStage.tsx).

   Most of what the tour shows is game data, which reaches the student views
   through a demo GameContext (services/tour/demoGame.ts). A few things on those
   screens are the views' own local state instead: the Joke Maker's textbox, its
   certify box and which Value stream batches are open; Marketing's picks,
   Topics, titles and note; whether "Fees and wait times" is open; and the clock the
   Next step line reads. Inside the demo stage the views read these from a
   DemoUi (context.tsx useDemoUi) in place of their own state, so the script can
   "type" jokes and tick boxes without touching the real game or the student's
   remembered preferences. Outside the stage there is no DemoUi and the views
   behave exactly as before. */
export interface DemoUi {
  /** Joke Maker: the production textbox. */
  jmDraft: string;
  /** Joke Maker: "I certify these jokes are not offensive." */
  jmCertified: boolean;
  /** Joke Maker: Value stream batches shown expanded, by Batch.id. */
  jmOpenBatchIds: string[];
  /** Marketing: joke ids picked to sell. */
  mkSelectedIds: number[];
  /** Marketing: Topic per joke id. */
  mkTopics: Record<number, string>;
  /** Marketing: market title per joke id. */
  mkTitles: Record<number, string>;
  /** Marketing: the "Note to your Joke Maker" box. */
  mkNote: string;
  /** Both: the "Fees and wait times" disclosure under the Scoreboard is open. Never read
      from or written to the student's own remembered choice. */
  feesOpen: boolean;
  /** Both: the demo's "now" (ms epoch) for the Next step line, so its sentence
      follows the script's timeline instead of the wall clock. */
  clockMs: number;
}

export const EMPTY_DEMO_UI: DemoUi = {
  jmDraft: '',
  jmCertified: false,
  jmOpenBatchIds: [],
  mkSelectedIds: [],
  mkTopics: {},
  mkTitles: {},
  mkNote: '',
  feesOpen: false,
  clockMs: 0,
};
