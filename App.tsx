import React from 'react';
import { GameProvider, useGame } from './context';
import { Role } from './types';
import JokeMaker from './views/JokeMaker';
import QualityControl from './views/QualityControl';
import Customer from './views/Customer';
import Instructor from './views/Instructor';
import Login from './views/Login';
import WaitingRoom from './views/WaitingRoom';
import DevRoleSwitcher from './components/DevRoleSwitcher';
import { WatchShell } from './components/WatchShell';
import { isWatchMode } from './services/watchMode';

const GameRouter: React.FC = () => {
  const { user } = useGame();

  if (!user) return <Login />;
  
  // If instructor, always show instructor view
  if (user.role === Role.INSTRUCTOR) return <Instructor />;

  // If user is explicitly UNASSIGNED, show waiting room
  if (user.role === Role.UNASSIGNED) {
      return <WaitingRoom />;
  }
  
  // Fallback for team N/A if role is assigned but something glitched, though formTeams handles this.
  if (user.team === 'N/A' && user.role !== Role.CUSTOMER) {
      return <WaitingRoom />;
  }

  switch (user.role) {
    case Role.JOKE_MAKER:
      return <JokeMaker />;
    case Role.QUALITY_CONTROL:
      return <QualityControl />;
    case Role.CUSTOMER:
      return <Customer />;
    default:
      return <div>Unknown Role</div>;
  }
};

const App: React.FC = () => {
  const watching = isWatchMode();
  return (
    <GameProvider>
      {watching ? <WatchShell><GameRouter /></WatchShell> : <GameRouter />}
      {!watching && <DevRoleSwitcher />}
    </GameProvider>
  );
};

export default App;