/* The Instructor's Teams tab (spec 6b): the lobby panel and the team cards.
   Moved from views/Instructor.tsx unchanged; the screen keeps the state and the
   handlers, and the restyle comes later. */
import React from 'react';
import { CheckCircle, GripVertical, Trash2, Users } from 'lucide-react';
import { useGame } from '../../context';
import { Button, Card } from '../../components';
import { Role, type User } from '../../types';

export interface TeamsTabProps {
  connectedPairs: number;
  assignableCount: number;
  handleFormTeams: () => void;
  visibleTeamIds: string[];
  rosterByTeam: Record<string, User[]>;
  deletingUserIds: string[];
  handleDeleteUser: (userId: string, displayName?: string) => void;
  handleDragStart: (e: React.DragEvent, userId: string) => void;
  handleDragOver: (e: React.DragEvent) => void;
  handleDrop: (e: React.DragEvent, targetType: 'TEAM' | 'LOBBY', targetId?: string) => void;
  toggleUserRole: (userId: string, currentRole: Role) => void;
}

export const TeamsTab: React.FC<TeamsTabProps> = ({
  connectedPairs, assignableCount, handleFormTeams, visibleTeamIds, rosterByTeam, deletingUserIds,
  handleDeleteUser, handleDragStart, handleDragOver, handleDrop, toggleUserRole,
}) => {
  const { config, roster, teamNames, updateTeamName } = useGame();
  return (
    <>
      {/* Lobby Management Panel */}
      {config.status === 'LOBBY' && (
          <Card>
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
                  <div>
                      <h2 className="text-xl font-bold text-gray-800 flex items-center">
                          <Users className="mr-2" /> Lobby Management
                      </h2>
                      <p className="text-sm text-gray-600 mt-1">Wait for all participants to join before forming teams.</p>
                      <div className="flex gap-4 mt-4">
                          <div className="bg-white px-4 py-3 rounded-lg border shadow-sm text-center min-w-[140px]">
                              <span className="block text-4xl font-extrabold text-blue-600">{connectedPairs}</span>
                              <span className="text-xs uppercase font-bold text-gray-500 tracking-wider">Total Pairs</span>
                          </div>
                      </div>
                  </div>

                  <div className="flex flex-col gap-3 w-full md:w-auto bg-white p-4 rounded shadow-sm border border-gray-200 min-w-[300px]">
                      <span className="text-sm font-semibold text-gray-700">
                          {Math.floor(assignableCount / 2)} team{Math.floor(assignableCount / 2) === 1 ? '' : 's'} from {assignableCount} participant{assignableCount === 1 ? '' : 's'}
                      </span>
                      {assignableCount % 2 === 1 && (
                        <p className="text-xs text-amber-700">
                          {assignableCount} participants — one will be left unassigned. Each team seats 1 Joke
                          Maker and 1 Marketing.
                        </p>
                      )}
                      <Button
                          onClick={handleFormTeams}
                          disabled={assignableCount < 2}
                          className="w-full flex justify-center items-center gap-2"
                      >
                          <CheckCircle size={16} /> Auto-Assign
                      </Button>
                  </div>
              </div>
          </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        {/* Team Management (full width) */}
        <Card className="xl:col-span-2" title="Team Management (Drag to Move, Click to Switch Role)">
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Two columns of production teams (JM/Marketing) */}
                {[0, 1].map((colIdx) => {
                  const colTeamIds = visibleTeamIds.filter((_, idx) => idx % 2 === colIdx);
                  return (
                    <div key={colIdx} className="space-y-3">
                      {colTeamIds.map((teamId) => (
                        <div
                          key={teamId}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, 'TEAM', teamId)}
                          className="rounded-lg border border-gray-200 bg-white p-3 hover:bg-blue-50/30 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <input
                                type="text"
                                value={teamNames[teamId]}
                                onChange={(e) => updateTeamName(teamId, e.target.value)}
                                className="font-bold text-gray-800 bg-transparent border-b border-dashed border-gray-300 focus:border-blue-500 outline-none w-full"
                              />
                              <span className="text-xs text-gray-400 block mt-1">ID: {teamId}</span>
                            </div>
                            {/* JM/QC Team label removed for cleaner UI */}
                          </div>

                          <div className="mt-3 flex flex-wrap gap-2">
                            {(rosterByTeam[teamId]?.length ?? 0) > 0 ? (
                              rosterByTeam[teamId]!.map((u) => (
                                <div
                                  key={u.id}
                                  draggable
                                  onDragStart={(e) => handleDragStart(e, u.id)}
                                  onClick={() => toggleUserRole(u.id, u.role)}
                                  title="Drag to move, Click to toggle Role"
                                  className={`cursor-pointer inline-flex items-center px-2 py-1 rounded text-xs border hover:shadow-md transition-all active:scale-95 select-none ${
                                    u.role === Role.JOKE_MAKER
                                      ? 'bg-blue-50 text-blue-700 border-blue-100'
                                      : 'bg-purple-50 text-purple-700 border-purple-100'
                                  }`}
                                >
                                  <GripVertical size={10} className="mr-1 opacity-50" />
                                  <span className="font-bold">{u.name}</span>
                                  <span className="ml-1 opacity-70">({u.role === Role.JOKE_MAKER ? 'JM' : 'Marketing'})</span>
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      handleDeleteUser(u.id, u.name);
                                    }}
                                    onMouseDown={(e) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                    }}
                                    disabled={deletingUserIds.includes(u.id)}
                                    className="ml-2 p-1 rounded hover:bg-white/60 text-gray-500 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                                    title="Delete user"
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </div>
                              ))
                            ) : (
                              <span className="text-gray-400 text-xs italic">No members. Drag users here.</span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  );
                })}

            </div>

            {/* Lobby / Unassigned (full width) */}
            <div
              className="rounded-lg border border-gray-200 bg-gray-100/50 p-3"
              onDragOver={handleDragOver}
              onDrop={(e) => handleDrop(e, 'LOBBY')}
            >
              <div className="flex items-center justify-between">
                <div className="font-bold text-gray-600">Unassigned (Lobby)</div>
                <div className="text-xs font-bold text-gray-500">{roster.filter(u => u.role === Role.UNASSIGNED).length}</div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {roster.filter(u => u.role === Role.UNASSIGNED).map(u => (
                  <div
                    key={u.id}
                    draggable
                    onDragStart={(e) => handleDragStart(e, u.id)}
                    className="cursor-move inline-flex items-center px-2 py-1 rounded text-xs bg-gray-200 text-gray-800 border border-gray-300 hover:shadow-md"
                  >
                    <GripVertical size={10} className="mr-1 opacity-50" />
                    {u.name}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        handleDeleteUser(u.id, u.name);
                      }}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                      }}
                      disabled={deletingUserIds.includes(u.id)}
                      className="ml-2 p-1 rounded hover:bg-white/60 text-gray-600 hover:text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
                {roster.filter(u => u.role === Role.UNASSIGNED).length === 0 && (
                  <span className="text-gray-400 text-xs italic">All users assigned</span>
                )}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </>
  );
};
