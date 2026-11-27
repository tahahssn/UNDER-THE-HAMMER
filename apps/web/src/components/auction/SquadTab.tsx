'use client';

import React from 'react';
import { SquadTable } from './SquadTable';
import { ExportButton } from './ExportButton';

interface SquadTabProps {
  auctionId: string;
  auctionName: string;
  roomName: string;
  teams: Array<{
    id: string;
    name: string;
    primaryColor?: string;
    acquisitions: Array<{ player: any; priceMinor: bigint }>;
  }>;
  isAuctionCompleted?: boolean;
  isAuthorized?: boolean;
  maxRows?: number;
}

/**
 * Squad tab component displayed after auction completion.
 * Shows squad composition by team and provides export functionality.
 * Export button is conditionally rendered only if authorized and auction is completed.
 */
export const SquadTab: React.FC<SquadTabProps> = ({
  auctionId,
  auctionName,
  roomName,
  teams,
  isAuctionCompleted = false,
  isAuthorized = false,
  maxRows = 15,
}) => {
  return (
    <div className="space-y-6 py-4">
      {/* Export Controls - Visible only if authorized and auction completed */}
      {isAuctionCompleted && isAuthorized && (
        <div>
          <ExportButton
            auctionId={auctionId}
            auctionName={auctionName}
            roomName={roomName}
            disabled={!isAuctionCompleted}
          />
        </div>
      )}

      {/* Squad Tables */}
      <div>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Squad Composition
        </h3>
        {teams.length > 0 ? (
          <SquadTable teams={teams} maxRows={maxRows} />
        ) : (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            No teams allocated yet.
          </div>
        )}
      </div>

      {/* Information Notice */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
        <p className="text-sm text-blue-800 dark:text-blue-200">
          Squad data is displayed in real-time as acquisitions are made during the auction.
          {isAuctionCompleted && isAuthorized && (
            <> You can download the final squad composition using the export buttons above.</>
          )}
        </p>
      </div>
    </div>
  );
};

export default SquadTab;
