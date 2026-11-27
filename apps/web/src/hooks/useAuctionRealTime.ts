'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSocket } from './useSocket';
import {
  AuctionPlayer,
  BidRecord,
  BreakState,
  LeadingTeam,
  resolveCurrency,
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
  | 'BREAK_ENDED';

export interface AuctionEvent {
  type: AuctionEventType;
  payload: unknown;
  receivedAt: number;
}

export interface UseAuctionRealTimeOptions {
  initialPlayer?: (AuctionPlayer & { leadingTeam?: LeadingTeam | null }) | null;
  initialTeams?: TeamStanding[];
  /** Fallback currency used when a payload omits one. */
  currency?: string;
  /** Called when a reconnect/sold snapshot should reconcile server-side state. */
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

const MAX_BIDS = 50;
const MAX_EVENTS = 100;

function asRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === 'object'
    ? (payload as Record<string, unknown>)
    : {};
}

function asMinor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/**
 * useAuctionRealTime: subscribe to the live auction event stream over the room
 * socket and derive the UI state (current player, bid feed, team standings,
 * break state).
 *
 * Event alignment (Phase I gateway, confirmed against apps/api/src): the
 * backend emits `bid:accepted`, `bid:rejected`, `bid:error`, `player:introduced`,
 * `player:sold`, `break:started/ended`, `countdown:update`, `room:snapshot` and
 * `room:presence`. When the host introduces the next player the gateway now
 * broadcasts `player:introduced`, so the active player advances live: we react
 * by requesting a fresh `room:snapshot` (which reflects the newly set current
 * player and its leading bid). We also re-snapshot on `player:sold` and on
 * reconnect to refresh squad counts and purses. The `player:unsold` handler is
 * kept as harmless forward-compat; the backend does not emit it yet.
 *
 * Optimistic bids registered via {@link addOptimisticBid} are reconciled
 * against accepted/rejected events by idempotency key (echoed by the gateway).
 */
export function useAuctionRealTime(
  auctionId: string,
  options: UseAuctionRealTimeOptions = {}
): UseAuctionRealTimeResult {
  const {
    initialPlayer = null,
    initialTeams = [],
    currency = 'PKR',
    onReconcile,
  } = options;

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
  // Latest teams, read by handlers without re-subscribing.
  const teamsRef = useRef<TeamStanding[]>(initialTeams);
  teamsRef.current = teams;
  const onReconcileRef = useRef(onReconcile);
  onReconcileRef.current = onReconcile;
  const currencyRef = useRef(currency);
  currencyRef.current = currency;

  const teamNameFor = useCallback((teamId: string, fallback?: string) => {
    const match = teamsRef.current.find((t) => t.id === teamId);
    return match?.name ?? fallback ?? teamId;
  }, []);

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

    // Map the backend room:snapshot (and reconcile) — tolerant of both the real
    // shape (purseBalanceMinor / acquisitions) and already-normalized fields.
    const reconcileFromSnapshot = (snapshot: unknown) => {
      const snap = asRecord(snapshot);

      // Resolve the leading bid the snapshot carries (sourced from the active
      // AuctionPlayer server-side). Without this, the leading team disappears
      // after every reconnect/sold snapshot and the bid form recomputes its
      // minimum from the base price, suggesting a bid below the true leading
      // amount that the backend then rejects as INVALID_INCREMENT.
      const highBidMinor = asMinor(snap.highBidMinor);
      const highBidTeamId =
        typeof snap.highBidTeamId === 'string' ? snap.highBidTeamId : null;
      let leadingTeam: LeadingTeam | null = null;
      if (highBidTeamId && highBidMinor !== null) {
        let name = teamNameFor(highBidTeamId);
        if (Array.isArray(snap.teams)) {
          const match = (snap.teams as unknown[])
            .map(asRecord)
            .find((t) => t.id === highBidTeamId);
          if (match && typeof match.name === 'string') name = match.name;
        }
        leadingTeam = { id: highBidTeamId, name, amountMinor: highBidMinor };
      }

      const rawPlayer = asRecord(snap.currentPlayer);
      if (Object.keys(rawPlayer).length > 0) {
        const id =
          (typeof rawPlayer.id === 'string' && rawPlayer.id) ||
          (typeof snap.currentPlayerId === 'string' && snap.currentPlayerId) ||
          '';
        setCurrentPlayer({
          id,
          name:
            typeof rawPlayer.name === 'string' ? rawPlayer.name : 'Unknown',
          role: typeof rawPlayer.role === 'string' ? rawPlayer.role : '',
          category:
            typeof rawPlayer.category === 'string' ? rawPlayer.category : '',
          basePriceMinor: asMinor(rawPlayer.basePriceMinor) ?? 0,
          currency:
            typeof rawPlayer.currency === 'string'
              ? rawPlayer.currency
              : currencyRef.current,
          leadingTeam,
        });
      } else if (snap.currentPlayerId === null) {
        setCurrentPlayer(null);
      }

      if (Array.isArray(snap.teams)) {
        setTeams((prev) =>
          (snap.teams as unknown[]).map((entry) => {
            const t = asRecord(entry);
            const id = typeof t.id === 'string' ? t.id : '';
            const existing = prev.find((p) => p.id === id);
            const acquisitions = Array.isArray(t.acquisitions)
              ? t.acquisitions.length
              : asMinor(t.squadCount);
            return {
              id,
              name:
                typeof t.name === 'string'
                  ? t.name
                  : existing?.name ?? id,
              logo:
                typeof t.logo === 'string' ? t.logo : existing?.logo ?? null,
              purse:
                asMinor(t.purseBalanceMinor) ??
                asMinor(t.purse) ??
                existing?.purse ??
                0,
              squadCount: acquisitions ?? existing?.squadCount ?? 0,
              maxSquadSize:
                asMinor(t.maxSquadSize) ?? existing?.maxSquadSize ?? 0,
              currency: existing?.currency ?? currencyRef.current,
            } satisfies TeamStanding;
          })
        );
      }

      const breakActive =
        typeof snap.breakActive === 'boolean' ? snap.breakActive : undefined;
      if (breakActive !== undefined) {
        setBreakState(breakActive ? 'active' : 'inactive');
      }

      // A new player means the previous bid feed no longer applies.
      setBids([]);
      seenBidIdsRef.current.clear();

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

      const amount = asMinor(data.amountMinor) ?? 0;
      const teamId =
        typeof data.teamId === 'string'
          ? data.teamId
          : typeof data.auctionTeamId === 'string'
            ? data.auctionTeamId
            : '';
      const resolvedName =
        typeof data.teamName === 'string'
          ? data.teamName
          : teamNameFor(teamId);

      setBids((prev) => {
        // Reconcile optimistic pending bid by idempotency key.
        const matchIndex = idempotencyKey
          ? prev.findIndex(
              (b) =>
                b.status === 'pending' && b.idempotencyKey === idempotencyKey
            )
          : -1;

        const accepted: BidRecord = {
          id: bidId ?? `accepted-${idempotencyKey ?? Date.now()}`,
          teamId,
          teamName: matchIndex >= 0 ? prev[matchIndex].teamName : resolvedName,
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
                name: resolvedName,
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

    const requestSnapshot = () => socket.emit('auction:request-snapshot', { auctionId });

    const handlePlayerIntroduced = (payload: unknown) => {
      pushEvent('PLAYER_INTRODUCED', payload);
      // Host introduced the next player; pull a fresh snapshot so the active
      // player (and its base price / leading bid) advances live.
      requestSnapshot();
    };
    const handlePlayerSold = (payload: unknown) => {
      pushEvent('PLAYER_SOLD', payload);
      // Refresh squad counts / purses after a sale. The next player arrives via
      // the subsequent player:introduced broadcast.
      requestSnapshot();
    };
    const handlePlayerUnsold = (payload: unknown) => {
      pushEvent('PLAYER_UNSOLD', payload);
      requestSnapshot();
    };
    const handleBreakStarted = (payload: unknown) => {
      pushEvent('BREAK_STARTED', payload);
      setBreakState('active');
    };
    const handleBreakEnded = (payload: unknown) => {
      pushEvent('BREAK_ENDED', payload);
      setBreakState('inactive');
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
      ['room:snapshot', reconcileFromSnapshot],
      ['bid:error', handleError],
    ];

    handlers.forEach(([name, handler]) => socket.on(name, handler));

    // Reconnect: request a fresh snapshot to reconcile.
    const handleConnect = () => {
      setIsConnected(true);
      requestSnapshot();
    };
    const handleDisconnect = () => setIsConnected(false);

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      handlers.forEach(([name, handler]) => socket.off(name, handler));
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, auctionId, pushEvent, teamNameFor]);

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
