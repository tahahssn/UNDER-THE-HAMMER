'use client';

import React, {
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useParams, useRouter, useSearchParams, notFound } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import RoomChat from '@/components/RoomChat';
import { useAuth } from '@/hooks/useAuth';
import { useSocket } from '@/hooks/useSocket';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { usePresence } from '@/hooks/usePresence';
import { useBreakSocket } from '@/hooks/useBreakSocket';
import { useAuctionState } from '@/hooks/useAuctionState';
import { useAuctionRealTime } from '@/hooks/useAuctionRealTime';
import { ROUTES } from '@/lib/constants';
import { AuctionPlayer, BidRecord, LeadingTeam } from '@/lib/auction-live';
import { PlayerIntroduction } from '@/components/auction/PlayerIntroduction';
import { BidPlacementForm } from '@/components/auction/BidPlacementForm';
import { RealTimeStats } from '@/components/auction/RealTimeStats';
import { BidHistory } from '@/components/auction/BidHistory';
import { TeamStandings } from '@/components/auction/TeamStandings';
import { BreakScreen } from '@/components/auction/BreakScreen';

// Break cadence (Phase H sample): a break is proposed after every N accepted
// bids. The exact value is host-configurable server-side; this client preview
// uses the product's documented default and the backend remains authoritative.
const BREAK_AFTER_N_BIDS = 5;

/**
 * Live auction room.
 *
 * Access control: the app authenticates with an in-memory JWT, so there is no
 * server-readable session cookie to gate this route in a Server Component.
 * The gate is therefore driven by the server-authoritative signals that exist:
 *   - A 404 from `GET /api/v1/auctions/:id` means the auction does not exist.
 *   - The Socket.IO join answers `room:join:error` (AUCTION_NOT_FOUND /
 *     NOT_ROOM_MEMBER / UNAUTHORIZED) for a user who may not enter.
 * Either renders the Next.js not-found page. A transport failure is kept
 * distinct (retry UI) so a flaky network does not masquerade as "not a member".
 * The backend remains authoritative for every auction decision.
 *
 * Identity note: the auction event stream is scoped server-side to
 * `auction:${auctionId}`, while presence and chat are scoped to
 * `room:${roomId}`. Those are deliberately different namespaces, so the auction
 * socket joins by auctionId and presence/chat use the room id.
 */
function LiveAuctionRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const socket = useSocket();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const auctionId = (params?.id as string) ?? '';

  const {
    auction,
    room,
    teams: initialTeams,
    basePriceByPlayerId,
    squadRequirements,
    isLoading: stateLoading,
    status,
    error: stateError,
    refetch,
  } = useAuctionState(auctionId);

  const roomId = searchParams?.get('roomId') ?? auction?.roomId ?? auctionId;
  const requestedTeamId = searchParams?.get('teamId') ?? '';

  const isHost = Boolean(room && user && room.hostId === user.id);

  const {
    currentPlayer,
    bids,
    teams,
    breakState,
    isConnected,
    addOptimisticBid,
  } = useAuctionRealTime(auctionId, {
    initialTeams,
    currency: auction?.currency,
    onReconcile: refetch,
  });

  // The user's team is the one they own (passed via the workspace link and
  // validated against the live team list). The backend authoritatively rejects
  // bids from a team the user does not own.
  const myTeamId = useMemo(
    () => (teams.some((t) => t.id === requestedTeamId) ? requestedTeamId : ''),
    [teams, requestedTeamId]
  );

  const role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR' = isHost
    ? 'HOST'
    : myTeamId
      ? 'TEAM_OWNER'
      : 'SPECTATOR';

  // Join the auction socket room (and re-join on reconnect).
  useRoomSocket(auctionId, role, myTeamId || undefined);

  const { participants } = usePresence(roomId);
  const onlineCount = participants.filter((p) => p.isOnline).length;

  const {
    breakStatus,
    isBreakActive,
    extendBreak,
    reduceBreak,
    endBreak,
  } = useBreakSocket(auctionId);

  // Membership gate driven by the socket join result.
  const [joinDenied, setJoinDenied] = useState(false);
  useEffect(() => {
    if (!socket) return;
    const handleJoinError = (payload: unknown) => {
      const code =
        payload && typeof payload === 'object'
          ? ((payload as { error?: string; code?: string }).error ??
            (payload as { code?: string }).code)
          : undefined;
      if (
        code === 'AUCTION_NOT_FOUND' ||
        code === 'NOT_ROOM_MEMBER' ||
        code === 'UNAUTHORIZED'
      ) {
        setJoinDenied(true);
      }
    };
    socket.on('room:join:error', handleJoinError);
    return () => {
      socket.off('room:join:error', handleJoinError);
    };
  }, [socket]);

  // Redirect unauthenticated users to sign-in.
  useEffect(() => {
    if (!authLoading && !isAuthenticated) {
      router.replace(ROUTES.signIn);
    }
  }, [authLoading, isAuthenticated, router]);

  const myTeam = useMemo(
    () => teams.find((t) => t.id === myTeamId) ?? null,
    [teams, myTeamId]
  );

  const leadingTeam: LeadingTeam | null = currentPlayer?.leadingTeam ?? null;

  // Enrich the live player with the base price from the REST state (the socket
  // snapshot does not carry it) and the auction currency.
  const displayPlayer: (AuctionPlayer & { leadingTeam?: LeadingTeam | null }) | null =
    useMemo(() => {
      if (!currentPlayer) return null;
      const basePriceMinor =
        basePriceByPlayerId[currentPlayer.id] ?? currentPlayer.basePriceMinor;
      return {
        ...currentPlayer,
        basePriceMinor,
        currency: auction?.currency ?? currentPlayer.currency,
      };
    }, [currentPlayer, basePriceByPlayerId, auction?.currency]);

  const acceptedThisPlayer = bids.filter((b) => b.status === 'accepted').length;
  const bidsUntilBreak =
    BREAK_AFTER_N_BIDS - (acceptedThisPlayer % BREAK_AFTER_N_BIDS);

  const lastBid = bids.length > 0 ? bids[bids.length - 1] : null;

  const handleOptimisticBid = useCallback(
    (amount: number, idempotencyKey: string) => {
      addOptimisticBid(
        { amountMinor: amount, idempotencyKey, teamId: myTeamId },
        myTeam?.name ?? 'Your team'
      );
    },
    [addOptimisticBid, myTeamId, myTeam]
  );

  // Loading state (auth or initial fetch).
  if (authLoading || (stateLoading && !room)) {
    return <LoadingSpinner fullScreen message="Loading auction room…" />;
  }

  if (!isAuthenticated) {
    return <LoadingSpinner fullScreen message="Redirecting…" />;
  }

  // Membership gate: a missing auction (404) or an authoritative join denial
  // renders the not-found page. Transport errors fall through to the retry UI.
  if (status === 404 || joinDenied) {
    notFound();
  }

  if (stateError && !room) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg px-4 text-center">
        <div>
          <p className="mb-4 text-text-muted">{stateError}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="rounded-md bg-accent px-4 py-2 font-semibold text-white cursor-pointer"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const canBid = role === 'TEAM_OWNER' || (isHost && Boolean(myTeamId));

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <header className="border-b border-border bg-surface px-4 py-3">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold text-text-primary">
              {room?.name ?? 'Live Auction'}
            </h1>
            <p className="text-xs text-text-muted">
              Phase: {auction?.phase ?? '—'}
            </p>
          </div>
          <div className="flex items-center gap-3">
            {!isConnected && (
              <span
                role="status"
                className="flex items-center gap-1 text-xs text-warning"
              >
                <WifiOff size={14} aria-hidden="true" /> Reconnecting…
              </span>
            )}
            <span
              aria-label={`${onlineCount} participants online`}
              className="rounded-full bg-surface-raised px-3 py-1 text-xs font-medium text-text-primary"
            >
              {onlineCount} online
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_20rem]">
          {/* Main column */}
          <div className="space-y-6">
            <PlayerIntroduction
              player={displayPlayer}
              leadingTeam={leadingTeam}
              isLoading={stateLoading && !currentPlayer}
            />

            <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
              {canBid && displayPlayer ? (
                <BidPlacementForm
                  auctionId={auctionId}
                  roomId={roomId}
                  teamId={myTeamId}
                  auctionPlayerId={displayPlayer.id}
                  stateVersion={auction?.stateVersion}
                  currentTeamPurse={myTeam?.purse ?? 0}
                  basePrice={displayPlayer.basePriceMinor}
                  currentLeadingBid={leadingTeam ? leadingTeam.amountMinor : null}
                  maxBid={myTeam?.purse ?? 0}
                  currency={displayPlayer.currency}
                  onSubmit={handleOptimisticBid}
                  disabled={breakState === 'active' || isBreakActive}
                />
              ) : canBid ? (
                <p className="text-sm text-text-muted">
                  Waiting for the next player to be introduced…
                </p>
              ) : (
                <p className="text-sm text-text-muted">
                  You are viewing as a spectator. Bidding is restricted to
                  participating team owners.
                </p>
              )}
            </div>

            <RealTimeStats
              bidCount={
                bids.filter((b: BidRecord) => b.status !== 'rejected').length
              }
              lastBidTimestamp={lastBid ? lastBid.timestamp : null}
              bidsUntilBreak={bidsUntilBreak}
            />

            <BidHistory bids={bids} maxHeight="50vh" />
          </div>

          {/* Sidebar (desktop) / stacked (mobile) */}
          <aside className="space-y-6">
            <TeamStandings teams={teams} sortBy="purse" />
            <div className="h-[28rem]">
              <RoomChat roomId={roomId} currentUserId={user?.id ?? ''} />
            </div>
          </aside>
        </div>
      </main>

      {/* Break overlay (Phase H) */}
      {(breakState === 'active' || isBreakActive) && breakStatus && (
        <BreakScreen
          auctionId={auctionId}
          userId={user?.id ?? ''}
          isHost={isHost}
          breakStatus={breakStatus}
          teams={teams}
          squadRequirements={squadRequirements}
          onBreakEnded={() => void refetch()}
          onExtendBreak={async (s) => {
            await extendBreak(s);
          }}
          onReduceBreak={async (s) => {
            await reduceBreak(s);
          }}
          onEndBreak={async () => {
            await endBreak();
          }}
        />
      )}
    </div>
  );
}

/**
 * Page wrapper. `useSearchParams` requires a Suspense boundary in the App
 * Router, and the whole room is wrapped in an error boundary so a render
 * failure shows a recoverable fallback rather than crashing the route.
 */
export default function LiveAuctionPage() {
  return (
    <ErrorBoundary>
      <Suspense
        fallback={<LoadingSpinner fullScreen message="Loading auction room…" />}
      >
        <LiveAuctionRoom />
      </Suspense>
    </ErrorBoundary>
  );
}
