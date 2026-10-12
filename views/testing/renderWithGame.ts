/* Renders a whole screen (JokeMaker, QualityControl, Instructor) to static
   markup inside a fake game, for the view tests. Effects never run under
   renderToStaticMarkup, so nothing polls or fetches. Instructor reads
   `window.location` while rendering: tests that render it stub `window` first
   (vi.stubGlobal('window', { location: { search: '' } })). */
import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { GameContext, type GameContextType } from '../../context';
import { Role, type GameConfig, type User } from '../../types';

/** A running Round 1 at the default Lean fees. */
export const TEST_CONFIG: GameConfig = {
  status: 'PLAYING', round: 1, isActive: true, showTeamPopup: false, startTime: 0, elapsedTime: 60,
  customerBudget: 3, round1BatchSize: 5, round2BatchLimit: 10, marketPrice: 1, costOfPublishing: 0.1, costOfDiscard: 0.01,
  marketingNudge1Seconds: 60, marketingNudge2Seconds: 45, idealProfile: {},
  marketMode: 'LEAN', arrivalWindowSeconds: 900, setupCostPerBatch: 0, carryingCostPerJokeMinute: 0, wipLimit: 0,
  shippingFeeSmall: 1, shippingFeeStandard: 2, shippingFeeLarge: 3, storageFeePerJokeMinute: 0.05, hostingFeePerJokeMinute: 0.05, customersPerTeam: 18,
};

/** A signed-in user; teamId null for the instructor. */
export function testUser(role: Role, teamId: number | null = 1): User {
  return {
    user_id: 7, display_name: 'Pat', role, team_id: teamId, id: '7', name: 'Pat',
    team: teamId == null ? 'N/A' : String(teamId), wallet: 0, purchasedJokes: [],
  };
}

export function fakeGame(over: Partial<GameContextType> = {}): GameContextType {
  const done = async () => {};
  return {
    user: null, roster: [], login: done, instructorLogin: done, logout: () => {},
    config: TEST_CONFIG, updateConfig: async () => ({ saved: true, feeRounds: [] }), setRound: () => {}, setGameActive: done, endRound: done,
    toggleTeamPopup: done, resetGame: async () => true, formTeams: done, resetToLobby: () => {},
    teamNames: {}, updateTeamName: () => {}, updateUser: done, deleteUser: done,
    batches: [], addBatch: done, submitRawBatch: async () => true, splitBatch: done, unsplitBatch: done,
    publishBatch: async () => true, sales: {},
    roundId: 1, roundIds: { 1: 1, 2: 2 }, roundStatuses: { 1: 'ACTIVE', 2: 'CONFIGURED' },
    marketItems: [], teamSummary: null, teamFeedback: null, instructorLobby: null, instructorStats: null,
    instructorStatsRound1: null, instructorStatsRound2: null, qcQueue: null,
    ...over,
  };
}

export function renderWithGame(view: ComponentType, over: Partial<GameContextType> = {}): string {
  return renderToStaticMarkup(createElement(GameContext.Provider, { value: fakeGame(over) }, createElement(view)));
}
