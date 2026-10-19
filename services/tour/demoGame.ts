/* The demo game the guided tour's stage puts in GameContext.

   It is the real GameContextType with every action replaced by a no-op, so the
   student views run unchanged against sample data and nothing they could call
   reaches the backend or the live game: no submit, split, publish, login,
   logout or config write. The data half (DemoGameData) comes from the tour's
   script (services/tour/demoScript.ts). Adding an action to GameContextType
   without listing it here is a type error, so a new action can never slip
   through to the network. */
import type { GameContextType } from '../../context';

type DemoActionKey =
  | 'login' | 'instructorLogin' | 'logout'
  | 'updateConfig' | 'setRound' | 'setGameActive' | 'endRound' | 'toggleTeamPopup' | 'resetGame'
  | 'formTeams' | 'resetToLobby' | 'swapTeamRoles' | 'movePair' | 'exchangePairs'
  | 'updateTeamName' | 'updateUser' | 'deleteUser'
  | 'addBatch' | 'submitRawBatch' | 'splitBatch' | 'unsplitBatch' | 'publishBatch';

/** Everything in the game context except the actions. */
export type DemoGameData = Omit<GameContextType, DemoActionKey>;

const done = async (): Promise<void> => undefined;
const refused = async (): Promise<boolean> => false;

/** Every action, as a no-op. The ones that report success report failure. */
export const DEMO_ACTIONS: Pick<GameContextType, DemoActionKey> = {
  login: done,
  instructorLogin: done,
  logout: () => undefined,
  updateConfig: async () => ({ saved: false, feeRounds: [] }),
  setRound: () => undefined,
  setGameActive: done,
  endRound: done,
  toggleTeamPopup: done,
  resetGame: refused,
  formTeams: done,
  resetToLobby: () => undefined,
  swapTeamRoles: done,
  movePair: done,
  exchangePairs: done,
  updateTeamName: () => undefined,
  updateUser: done,
  deleteUser: done,
  addBatch: done,
  submitRawBatch: refused,
  splitBatch: done,
  unsplitBatch: done,
  publishBatch: refused,
};

export function demoGameContext(data: DemoGameData): GameContextType {
  return { ...data, ...DEMO_ACTIONS };
}
