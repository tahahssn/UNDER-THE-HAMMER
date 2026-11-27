'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_CONFIG } from '@/lib/constants';
import { getAuthToken } from '@/lib/api';
import {
  AuctionPlayer,
  LeadingTeam,
  TeamStanding,
} from '@/lib/auction-live';

/** Minimal auction summary surfaced to the live room. */
export interface LiveAuctionSummary {
  id: string;
  roomId: string;
  phase: string;
  status: string;
  stateVersion: number;
}

/** Minimal room summary surfaced to the live room. */
export interface LiveRoomSummary {
  id: string;
  name: string;
  /** Whether the current user is a confirmed member. Server-authoritative. */
  isMember: boolean;
  role?: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  /** The current user's team in this room, if any. */
  teamId?: string;
}

/** Shape returned by GET /api/auctions/[id]/state. */
export interface AuctionStateResponse {
  auction: LiveAuctionSummary;
  room: LiveRoomSummary;
  teams: TeamStanding[];
  currentPlayer: (AuctionPlayer & { leadingTeam?: LeadingTeam | null }) | null;
}

export interface UseAuctionStateResult {
  auction: LiveAuctionSummary | null;
  room: LiveRoomSummary | null;
  teams: TeamStanding[];
  currentPlayer: (AuctionPlayer & { leadingTeam?: LeadingTeam | null }) | null;
  isLoading: boolean;
  /** HTTP-ish status for membership gating (404/403 when not a member). */
  status: number | null;
  error: string | null;
  refetch: () => Promise<void>;
}

const STALE_TIME_MS = 5_000;

interface CacheEntry {
  data: AuctionStateResponse;
  fetchedAt: number;
}

// Module-level cache keyed by auctionId:roomId. Shared across hook instances.
const stateCache = new Map<string, CacheEntry>();

/** Exposed for tests to reset cross-test cache state. */
export function __clearAuctionStateCache(): void {
  stateCache.clear();
}

/**
 * useAuctionState: fetch and cache the current auction state.
 *
 * - Fetches `GET /api/auctions/[id]/state?roomId=[roomId]` on mount.
 * - Caches the result with a 5-second stale time; concurrent/remounted
 *   consumers within the window reuse the cached snapshot instead of refetching.
 * - `refetch()` bypasses the cache (used on reconnect reconciliation).
 */
export function useAuctionState(
  auctionId: string,
  roomId: string
): UseAuctionStateResult {
  const cacheKey = `${auctionId}:${roomId}`;

  const [data, setData] = useState<AuctionStateResponse | null>(() => {
    const cached = stateCache.get(cacheKey);
    if (cached && Date.now() - cached.fetchedAt < STALE_TIME_MS) {
      return cached.data;
    }
    return null;
  });
  const [isLoading, setIsLoading] = useState<boolean>(() => !data);
  const [status, setStatus] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const doFetch = useCallback(
    async (force: boolean): Promise<void> => {
      if (!auctionId || !roomId) return;

      if (!force) {
        const cached = stateCache.get(cacheKey);
        if (cached && Date.now() - cached.fetchedAt < STALE_TIME_MS) {
          setData(cached.data);
          setStatus(200);
          setError(null);
          setIsLoading(false);
          return;
        }
      }

      setIsLoading(true);
      setError(null);

      try {
        const token = getAuthToken();
        const url = `${API_CONFIG.baseUrl}/api/auctions/${encodeURIComponent(
          auctionId
        )}/state?roomId=${encodeURIComponent(roomId)}`;

        const response = await fetch(url, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
        });

        setStatus(response.status);

        if (!response.ok) {
          setError(
            response.status === 404 || response.status === 403
              ? 'You are not a member of this room.'
              : `Failed to load auction state (${response.status})`
          );
          setData(null);
          setIsLoading(false);
          return;
        }

        const json = (await response.json()) as AuctionStateResponse;
        stateCache.set(cacheKey, { data: json, fetchedAt: Date.now() });
        setData(json);
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to load auction state'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [auctionId, roomId, cacheKey]
  );

  useEffect(() => {
    void doFetch(false);
  }, [doFetch]);

  const refetch = useCallback(() => doFetch(true), [doFetch]);

  return {
    auction: data?.auction ?? null,
    room: data?.room ?? null,
    teams: data?.teams ?? [],
    currentPlayer: data?.currentPlayer ?? null,
    isLoading,
    status,
    error,
    refetch,
  };
}

export default useAuctionState;
