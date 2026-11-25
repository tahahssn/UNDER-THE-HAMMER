import React from 'react';

interface Player {
  id: string;
  displayName: string;
  role: string;
  countryCode?: string;
  categoryName?: string;
}

interface Team {
  id: string;
  name: string;
  primaryColor?: string;
  acquisitions: Array<{ player: Player; priceMinor: bigint }>;
}

interface SquadTableProps {
  teams: Team[];
  maxRows?: number;
}

/**
 * Display squad composition by team during break.
 * Shows player name, role, country, and category.
 * Dynamic team count (not hard-coded to 8).
 */
export const SquadTable: React.FC<SquadTableProps> = ({ teams, maxRows = 15 }) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {teams.map((team) => (
        <div
          key={team.id}
          className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden"
        >
          {/* Team header */}
          <div
            className="px-4 py-3 text-white font-semibold"
            style={{ backgroundColor: team.primaryColor || '#3b82f6' }}
          >
            {team.name}
          </div>

          {/* Squad list */}
          <div className="divide-y divide-gray-200 dark:divide-gray-700">
            {team.acquisitions.slice(0, maxRows).map((acq, idx) => (
              <div key={`${team.id}-${acq.player.id}`} className="px-4 py-2 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {acq.player.displayName}
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 flex gap-2 mt-1">
                    <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                      {acq.player.role}
                    </span>
                    {acq.player.countryCode && (
                      <span className="inline-block px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded">
                        {acq.player.countryCode}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}

            {team.acquisitions.length === 0 && (
              <div className="px-4 py-3 text-center text-sm text-gray-500 dark:text-gray-400">
                No players yet
              </div>
            )}

            {team.acquisitions.length > maxRows && (
              <div className="px-4 py-2 text-xs text-gray-500 dark:text-gray-400 text-center">
                +{team.acquisitions.length - maxRows} more
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};
