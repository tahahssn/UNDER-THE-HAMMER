import { useEffect, useState, useCallback } from 'react';
import { useSocket } from './useSocket';

export interface SquadRuleProgress {
  id: string;
  type: string;
  description: string;
  currentCount: number;
  minCount?: number;
  maxCount?: number;
  satisfied: boolean;
}

export interface SquadValidation {
  valid: boolean;
  progress: SquadRuleProgress[];
  violations: Array<{
    ruleId: string;
    type: string;
    violationType: 'BELOW_MIN' | 'ABOVE_MAX' | 'MISSING_REQUIREMENT';
    currentCount: number;
    requiredMinCount?: number;
    requiredMaxCount?: number;
  }>;
}

/**
 * Hook to fetch and track squad progress for a team.
 * Updates when acquisitions change or squad validation completes.
 * Handles: squad:requirement-updated, squad:validation-complete
 */
export const useSquadProgress = (auctionId: string, auctionTeamId?: string) => {
  const socket = useSocket();
  const [progress, setProgress] = useState<SquadRuleProgress[]>([]);
  const [validation, setValidation] = useState<SquadValidation | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch initial squad progress
  const fetchSquadProgress = useCallback(async () => {
    if (!auctionTeamId) return;
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/api/v1/auctions/${auctionId}/squads/${auctionTeamId}/progress`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch squad progress');
      }

      const data: SquadRuleProgress[] = await response.json();
      setProgress(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error');
    } finally {
      setIsLoading(false);
    }
  }, [auctionId, auctionTeamId]);

  // Fetch validation record
  const fetchValidation = useCallback(async () => {
    if (!auctionTeamId) return;

    try {
      const response = await fetch(
        `/api/v1/auctions/${auctionId}/squads/${auctionTeamId}/validation`,
        {
          headers: {
            Authorization: `Bearer ${localStorage.getItem('token')}`,
          },
        }
      );

      if (response.ok) {
        const data: SquadValidation = await response.json();
        setValidation(data);
      }
    } catch (err) {
      console.error('Failed to fetch validation:', err);
    }
  }, [auctionId, auctionTeamId]);

  // Initial fetch
  useEffect(() => {
    fetchSquadProgress();
    fetchValidation();
  }, [fetchSquadProgress, fetchValidation]);

  // Subscribe to squad events
  useEffect(() => {
    if (!socket || !auctionTeamId) return;

    // Requirement updated (player acquired)
    socket.on(
      `auction:${auctionId}:squad:requirement-updated`,
      (data: any) => {
        if (data.auctionTeamId === auctionTeamId) {
          fetchSquadProgress();
        }
      }
    );

    // Validation complete
    socket.on(
      `auction:${auctionId}:squad:validation-complete`,
      (data: any) => {
        if (data.auctionTeamId === auctionTeamId) {
          fetchValidation();
        }
      }
    );

    return () => {
      socket.off(`auction:${auctionId}:squad:requirement-updated`);
      socket.off(`auction:${auctionId}:squad:validation-complete`);
    };
  }, [socket, auctionId, auctionTeamId, fetchSquadProgress, fetchValidation]);

  return {
    progress,
    validation,
    isLoading,
    error,
    refetch: fetchSquadProgress,
  };
};
