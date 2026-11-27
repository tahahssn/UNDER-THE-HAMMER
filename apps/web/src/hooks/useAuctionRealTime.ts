'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import {
  AuctionPlayer,
  BidRecord,
  BreakState,
  LeadingTeam,
  TeamStanding,
} from '@/lib/auction-live';
import { OptimisticBid } from './useBidPlacement';

/** Logical event type surfaced to consumers (normalized from socket names). */
export type AuctionEventType =
  | 'BID_ACCEPTED'
  | 'BID_REJECTED'
  | 'PLAYER_INTRODUCED'
  | 'PLAYER_SOLD'
  | 'PLAYER_UNSOLD'
  | 'BREAK_STARTED'
  | 'BREAK_ENDED'
  | 'SQUAD_UPDATED'
  | 'PRESENCE_UPDATE';

export interface AuctionEvent {
  type: AuctionEventType;
  payload: unknown;
  receivedAt: number;
}

export interface UseAuctionRealTimeOptions {
  initialPlayer?: (AuctionPlayer & { leadingTeam?: LeadingTeam | null }) | null;
  initialTeams?: TeamStanding[];
  /** Called when a reconnect snapshot should reconcile server-side state. */
  onReconcile?: () => void;
}

export interface UseAuctionRealTimeResult {
  events: AuctionEvent[];
  currentPlayer: (AuctionPlayer & { leadingTeam?: LeadingTeam | null }) | null;
  bids: BidRecord[];
  teams: TeamStanding[];
  breakState: BreakState;
  isConnected: boolean;
  error: string | null;
  /** Register an optimistic (pending) bid keyed by idempotency key. */
  addOptimisticBid: (bid: OptimisticBid, teamName: string) => void;
}

/** Socket.IO event name → normalized logical type. */
const EVENT_MAP: Record<string, AuctionEventType> = {
  'bid:accepted': 'BID_ACCEPTED',
  'bid:rejected': 'BID_REJECTED',
  'player:introduced': 'PLAYER_INTRODUCED',
  'player:sold': 'PLAYER_SOLD',
  'player:unsold': 'PLAYER_UNSOLD',
  'break:started': 'BREAK_STARTED',
  'break:ended': 'BREAK_ENDED',
  'squad:updated': 'SQUAD_UPDATED',
  'room:presence:update': 'PRESENCE_UPDATE',
};

const MAX_BIDS = 50;
const MAX_EVENTS = 100;

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
}

/**
 * useAuctionRealTime: subscribe to live auction events over the room socket.
 *
 * Normalizes Phase I/G socket events into a single stream and derived state
 * (current player, bid feed, team standings, break state). On reconnect it
 * requests a fresh snapshot so local state is reconciled with the server.
 * Optimistic bids registered via {@link addOptimisticBid} are deduplicated
 * against accepted/rejected events by idempotency key.
 */
export function useAuctionRealTime(
  auctionId: string,
  options: UseAuctionRealTimeOptions = {}
): UseAuctionRealTimeResult {
  const { initialPlayer = null, initialTeams = [], onReconcile } = options;

  const socket = useSocket();
  const [events, setEvents] = useState<AuctionEvent[]>([]);
  const [currentPlayer, setCurrentPlayer] = useState(initialPlayer);
  const [bids, setBids] = useState<BidRecord[]>([]);
  const [teams, setTeams] = useState<TeamStanding[]>(initialTeams);
  const [breakState, setBreakState] = useState<BreakState>('inactive');
  const [isConnected, setIsConnected] = useState<boolean>(
    socket?.connected ?? false
  );
  const [error, setError] = useState<string | null>(null);

  // Track accepted bid IDs to ignore duplicate delivery.
  const seenBidIdsRef = useRef<Set<string>>(new Set());
  const onReconcileRef = useRef(onReconcile);
  onReconcileRef.current = onReconcile;

  const addOptimisticBid = useCallback(
    (bid: OptimisticBid, teamName: string) => {
      setBids((prev) => {
        const record: BidRecord = {
          id: `pending-${bid.idempotencyKey}`,
          teamId: bid.teamId,
          teamName,
          amount: bid.amountMinor,
          timestamp: new Date().toISOString(),
          status: 'pending',
          idempotencyKey: bid.idempotencyKey,
        };
        return [...prev, record].slice(-MAX_BIDS);
      });
    },
    []
  );

  const pushEvent = useCallback((type: AuctionEventType, payload: unknown) => {
    setEvents((prev) =>
      [...prev, { type, payload, receivedAt: Date.now() }].slice(-MAX_EVENTS)
    );
  }, []);

  useEffect(() => {
    if (!socket || !auctionId) return;

    setIsConnected(socket.connected);

    const reconcileFromSnapshot = (snapshot: unknown) => {
      const snap = asRecord(snapshot);
      if (snap.currentPlayer && typeof snap.currentPlayer === 'object') {
        setCurrentPlayer(
          snap.currentPlayer as AuctionPlayer & {
            leadingTeam?: LeadingTeam | null;
          }
        );
      }
      if (Array.isArray(snap.teams)) {
        setTeams(snap.teams as TeamStanding[]);
      }
      if (typeof snap.breakActive === 'boolean') {
        setBreakState(snap.breakActive ? 'active' : 'inactive');
      }
      onReconcileRef.current?.();
    };

    const handleBidAccepted = (payload: unknown) => {
      pushEvent('BID_ACCEPTED', payload);
      const data = asRecord(payload);
      const bidId = typeof data.bidId === 'string' ? data.bidId : undefined;
      const idempotencyKey =
        typeof data.idempotencyKey === 'string'
          ? data.idempotencyKey
          : undefined;

      if (bidId && seenBidIdsRef.current.has(bidId)) return;
      if (bidId) seenBidIdsRef.current.add(bidId);

      const amount =
        typeof data.amountMinor === 'string'
          ? Number(data.amountMinor)
          : typeof data.amountMinor === 'number'
            ? data.amountMinor
            : 0;
      const teamId =
        typeof data.teamId === 'string'
          ? data.teamId
          : typeof data.auctionTeamId === 'string'
            ? data.auctionTeamId
            : '';

      setBids((prev) => {
        // Reconcile optimistic pending bid by idempotency key.
        const matchIndex = idempotencyKey
          ? prev.findIndex(
              (b) => b.status === 'pending' && b.idempotencyKey === idempotencyKey
            )
          : -1;

        const accepted: BidRecord = {
          id: bidId ?? `accepted-${idempotencyKey ?? Date.now()}`,
          teamId,
          teamName:
            matchIndex >= 0
              ? prev[matchIndex].teamName
              : typeof data.teamName === 'string'
                ? data.teamName
                : teamId,
          amount,
          timestamp:
            typeof data.timestamp === 'string'
              ? data.timestamp
              : new Date().toISOString(),
          status: 'accepted',
          idempotencyKey,
        };

        if (matchIndex >= 0) {
          const next = [...prev];
          next[matchIndex] = accepted;
          return next;
        }
        return [...prev, accepted].slice(-MAX_BIDS);
      });

      // Update leading team on the current player.
      setCurrentPlayer((prev) =>
        prev
          ? {
              ...prev,
              leadingTeam: {
                id: teamId,
                name:
                  typeof data.teamName === 'string' ? data.teamName : teamId,
                amountMinor: amount,
              },
            }
          : prev
      );
    };

    const handleBidRejected = (payload: unknown) => {
      pushEvent('BID_REJECTED', payload);
      const data = asRecord(payload);
      const idempotencyKey =
        typeof data.idempotencyKey === 'string'
          ? data.idempotencyKey
          : undefined;
      if (!idempotencyKey) return;
      setBids((prev) =>
        prev.map((b) =>
          b.status === 'pending' && b.idempotencyKey === idempotencyKey
            ? { ...b, status: 'rejected' }
            : b
        )
      );
    };

    const handlePlayerIntroduced = (payload: unknown) => {
      pushEvent('PLAYER_INTRODUCED', payload);
      const data = asRecord(payload);
      const id =
        typeof data.auctionPlayerId === 'string'
          ? data.auctionPlayerId
          : typeof data.playerId === 'string'
            ? data.playerId
            : '';
      setCurrentPlayer({
        id,
        name: typeof data.playerName === 'string' ? data.playerName : 'Unknown',
        role: typeof data.role === 'string' ? data.role : '',
        category: typeof data.category === 'string' ? data.category : '',
        basePriceMinor:
          typeof data.basePrice === 'number'
            ? data.basePrice
            : typeof data.basePriceMinor === 'number'
              ? data.basePriceMinor
              : 0,
        currency: typeof data.currency === 'string' ? data.currency : 'PKR',
        leadingTeam: null,
      });
      // A new player clears the previous bid feed.
      setBids([]);
      seenBidIdsRef.current.clear();
    };

    const handlePlayerSold = (payload: unknown) => {
      pushEvent('PLAYER_SOLD', payload);
    };
    const handlePlayerUnsold = (payload: unknown) => {
      pushEvent('PLAYER_UNSOLD', payload);
    };
    const handleBreakStarted = (payload: unknown) => {
      pushEvent('BREAK_STARTED', payload);
      setBreakState('active');
    };
    const handleBreakEnded = (payload: unknown) => {
      pushEvent('BREAK_ENDED', payload);
      setBreakState('inactive');
    };
    const handleSquadUpdated = (payload: unknown) => {
      pushEvent('SQUAD_UPDATED', payload);
      const data = asRecord(payload);
      const teamId =
        typeof data.auctionTeamId === 'string' ? data.auctionTeamId : undefined;
      if (!teamId) return;
      setTeams((prev) =>
        prev.map((t) =>
          t.id === teamId
            ? {
                ...t,
                squadCount:
                  typeof data.totalAcquisitions === 'number'
                    ? data.totalAcquisitions
                    : t.squadCount,
              }
            : t
        )
      );
    };
    const handlePresenceUpdate = (payload: unknown) => {
      pushEvent('PRESENCE_UPDATE', payload);
    };
    const handleError = (payload: unknown) => {
      const data = asRecord(payload);
      setError(typeof data.error === 'string' ? data.error : 'Auction error');
    };

    const handlers: Array<[string, (p: unknown) => void]> = [
      ['bid:accepted', handleBidAccepted],
      ['bid:rejected', handleBidRejected],
      ['player:introduced', handlePlayerIntroduced],
      ['player:sold', handlePlayerSold],
      ['player:unsold', handlePlayerUnsold],
      ['break:started', handleBreakStarted],
      ['break:ended', handleBreakEnded],
      ['squad:updated', handleSquadUpdated],
      ['room:presence:update', handlePresenceUpdate],
      ['room:snapshot', reconcileFromSnapshot],
      ['bid:error', handleError],
    ];

    handlers.forEach(([name, handler]) => socket.on(name, handler));

    // Reconnect: request a fresh snapshot to reconcile.
    const handleConnect = () => {
      setIsConnected(true);
      socket.emit('auction:request-snapshot', { auctionId });
    };
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      handlers.forEach(([name, handler]) => socket.off(name, handler));
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, auctionId, pushEvent]);

  return {
    events,
    currentPlayer,
    bids,
    teams,
    breakState,
    isConnected,
    error,
    addOptimisticBid,
  };
}

export default useAuctionRealTime;
