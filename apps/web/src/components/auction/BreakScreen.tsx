'use client';

import React, { useEffect, useState } from 'react';
import { BreakTimer } from './BreakTimer';
import { SquadTable } from './SquadTable';
import { RequirementProgress } from './RequirementProgress';
import { BreakControls } from './BreakControls';

interface BreakScreenProps {
  auctionId: string;
  userId: string;
  isHost: boolean;
  breakStatus: {
    id: string;
    startedAt: Date;
    deadline: Date;
    secondsRemaining: number;
    originalDurationSeconds: number;
    reason?: string;
    isExpired: boolean;
  };
  teams: any[];
  squadRequirements: Array<{
    id: string;
    type: string;
    description: string;
    currentCount: number;
    minCount?: number;
    maxCount?: number;
    satisfied: boolean;
  }>;
  onBreakEnded: () => void;
  onExtendBreak: (extensionSeconds: number) => Promise<void>;
  onReduceBreak: (reductionSeconds: number) => Promise<void>;
  onEndBreak: () => Promise<void>;
}

/**
 * Break overlay screen shown during auction breaks.
 * Server-driven countdown, squad tables by team, requirement progress,
 * purse comparison, and host-only controls.
 * 
 * Features:
 * - Full-screen modal overlay
 * - Server-authoritative countdown
 * - Dynamic team count (not hard-coded to 8)
 * - Squad progress by role, domestic/overseas, category
 * - Host extend/reduce/end controls (spectators see read-only)
 * - Chat remains available during break
 */
export const BreakScreen: React.FC<BreakScreenProps> = ({
  auctionId,
  userId,
  isHost,
  breakStatus,
  teams,
  squadRequirements,
  onBreakEnded,
  onExtendBreak,
  onReduceBreak,
  onEndBreak,
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [extensionSeconds, setExtensionSeconds] = useState(60);
  const [reductionSeconds, setReductionSeconds] = useState(60);

  const handleExtend = async () => {
    setIsLoading(true);
    try {
      await onExtendBreak(extensionSeconds);
    } finally {
      setIsLoading(false);
    }
  };

  const handleReduce = async () => {
    setIsLoading(true);
    try {
      await onReduceBreak(reductionSeconds);
    } finally {
      setIsLoading(false);
    }
  };

  const handleEndBreak = async () => {
    setIsLoading(true);
    try {
      await onEndBreak();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center overflow-auto">
      <div className="bg-white dark:bg-gray-900 rounded-lg shadow-xl max-w-6xl w-full mx-4 my-4 max-h-[90vh] overflow-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-4 flex items-center justify-between">
          <h2 className="text-2xl font-bold">Break Time</h2>
          {breakStatus.reason && (
            <span className="text-sm opacity-90">{breakStatus.reason}</span>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-8">
          {/* Break Timer - Center Stage */}
          <div className="flex justify-center">
            <BreakTimer
              deadline={new Date(breakStatus.deadline)}
              isExpired={breakStatus.isExpired}
              onExpired={onBreakEnded}
            />
          </div>

          {/* Two-Column Layout: Squad Requirements (left) + Host Controls (right) */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Squad Requirements Progress */}
            <div className="lg:col-span-2">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                Squad Requirements
              </h3>
              <div className="space-y-4">
                {squadRequirements.map((req) => (
                  <div key={req.id}>
                    <RequirementProgress
                      requirements={[req]}
                      compact={false}
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Host Controls & Summary */}
            <div className="space-y-4">
              <BreakControls
                isHost={isHost}
                isBreakActive={!breakStatus.isExpired}
                canExtend={breakStatus.secondsRemaining > 0}
                canReduce={breakStatus.secondsRemaining > 60}
                onExtend={handleExtend}
                onReduce={handleReduce}
                onEnd={handleEndBreak}
                isLoading={isLoading}
              />

              {/* Break Info Summary */}
              <div className="bg-gray-50 dark:bg-gray-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700">
                <div className="text-sm text-gray-600 dark:text-gray-400 space-y-2">
                  <div className="flex justify-between">
                    <span>Original Duration:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {breakStatus.originalDurationSeconds}s
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Participants:</span>
                    <span className="font-semibold text-gray-900 dark:text-white">
                      {teams.length} teams
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Squad Tables by Team */}
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
              Squad Composition by Team
            </h3>
            <SquadTable teams={teams} maxRows={15} />
          </div>

          {/* Chat Availability Notice */}
          <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4 rounded-lg">
            <p className="text-sm text-blue-800 dark:text-blue-200">
              💬 Room chat remains available during the break. Use it to discuss strategy or ask questions.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
