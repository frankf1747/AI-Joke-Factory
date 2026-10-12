/* The guided tour's stage: the student's real screen, filled with sample data.

   A full-screen layer over the app that renders the role's own view
   (views/JokeMaker.tsx or views/QualityControl.tsx, inside its RoleLayout)
   under a GameContext whose value is the demo game — every action a no-op
   (services/tour/demoGame.ts) — and with demo mode on (context.tsx
   DemoModeContext), so the views read the script's textbox, picks and note
   instead of their own state and nothing they render can reach the network.

   The layer is `inert` and hidden from assistive technology: the demo is
   something to watch, not to use. The live app keeps running underneath,
   unchanged, and is what the student sees once the stage unmounts. */
import React, { useMemo } from 'react';
import { DemoModeContext, GameContext } from '../../context';
import { demoGameContext } from '../../services/tour/demoGame';
import type { DemoState } from '../../services/tour/demoScript';

export interface DemoStageProps {
  /** The student's real screen component. */
  view: React.ComponentType;
  /** What to show: demoFrame() for the current step and moment. */
  frame: DemoState;
  /** The stage's scroll container, for the spotlight to search and scroll. */
  stageRef?: React.Ref<HTMLDivElement>;
}

const DemoStageImpl: React.FC<DemoStageProps> = ({ view: View, frame, stageRef }) => {
  const game = useMemo(() => demoGameContext(frame.game), [frame.game]);
  return (
    <div
      ref={stageRef}
      data-tour-stage=""
      inert
      aria-hidden="true"
      className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-gray-50"
    >
      <DemoModeContext.Provider value={frame.ui}>
        <GameContext.Provider value={game}>
          <View />
        </GameContext.Provider>
      </DemoModeContext.Provider>
    </div>
  );
};

/** Re-renders only when the frame (or the view) changes, not on every clock tick. */
export const DemoStage = React.memo(DemoStageImpl);
export default DemoStage;
