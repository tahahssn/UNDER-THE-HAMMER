'use client';

import React, { Suspense, useCallback, useEffect, useMemo } from 'react';
import { useParams, useRouter, useSearchParams, notFound } from 'next/navigation';
import { WifiOff } from 'lucide-react';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import RoomChat from '@/components/RoomChat';
import { useAuth } from '@/hooks/useAuth';
import { useRoomSocket } from '@/hooks/useRoomSocket';
import { usePresence } from '@/hooks/usePresence';
import { useBreakSocket } from '@/hooks/useBreakSocket';
import { useAuctionState } from '@/hooks/useAuctionState';
import { useAuctionRealTime } from '@/hooks/useAuctionRealTime';
import { ROUTES } from '@/lib/constants';
import { BidRecord, LeadingTeam } from '@/lib/auction-live';
import { PlayerIntroduction } from '@/components/auction/PlayerIntroduction';
import { BidPlacementForm } from '@/components/auction/BidPlacementForm';
import { RealTimeStats } from '@/components/auction/RealTimeStats';
import { BidHistory } from '@/components/auction/BidHistory';
import { TeamStandings } from '@/components/auction/TeamStandings';
import { BreakScreen } from '@/components/auction/BreakScreen';

/**
 * Live auction room.
 *
 * Note on access control: the application authenticates with an in-memory JWT
 * (see AuthContext/lib/api), so there is no server-readable session cookie to
 * gate this route in a Server Component. Membership is therefore enforced
 * against the server-authoritative `GET /api/auctions/[id]/state` response:
 * a 403/404 or `room.isMember === false` renders the Next.js not-found page,
 * which is the functional equivalent of the server returning 404 for
 * non-members. The backend remains authoritative for every auction decision.
 */
function LiveAuctionRoom() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();

  const auctionId = (params?.id as string) ?? '';
  const roomId = searchParams?.get('roomId') ?? auctionId;

  const {
    auction,
    room,
    teams: initialTeams,
    currentPlayer: initialPlayer,
    isLoading: stateLoading,
    status,
    error: stateError,
    refetch,
  } = useAuctionState(auctionId, roomId);

  const role = room?.role ?? 'SPECTATOR';
  const myTeamId = room?.teamId ?? '';
  const isHost = role === 'HOST';

  // Join the auction socket room (and re-join on reconnect).
  useRoomSocket(auctionId, role, myTeamId || undefined);

  const { participants } = usePresence(roomId);
  const onlineCount = participants.filter((p) => p.isOnline).length;

  const {
    currentPlayer,
    bids,
    teams,
    breakState,
    isConnected,
    addOptimisticBid,
  } = useAuctionRealTime(auctionId, {
    initialPlayer,
    initialTeams,
    onReconcile: refetch,
  });

  const {
    breakStatus,
    isBreakActive,
    extendBreak,
    reduceBreak,
    endBreak,
  } = useBreakSocket(auctionId);

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

  // Membership gate: non-members get the not-found page.
  if (status === 404 || status === 403 || (room && room.isMember === false)) {
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
              player={currentPlayer}
              leadingTeam={leadingTeam}
              isLoading={stateLoading && !currentPlayer}
            />

            <div className="rounded-lg border border-border bg-surface p-4 sm:p-6">
              {canBid ? (
                <BidPlacementForm
                  auctionId={auctionId}
                  roomId={roomId}
                  teamId={myTeamId}
                  currentTeamPurse={myTeam?.purse ?? 0}
                  minimumBid={
                    leadingTeam
                      ? leadingTeam.amountMinor
                      : currentPlayer?.basePriceMinor ?? 0
                  }
                  maxBid={myTeam?.purse ?? 0}
                  currency={currentPlayer?.currency}
                  onSubmit={handleOptimisticBid}
                  disabled={breakState === 'active' || isBreakActive}
                />
              ) : (
                <p className="text-sm text-text-muted">
                  You are viewing as a spectator. Bidding is restricted to
                  participating team owners.
                </p>
              )}
            </div>

            <RealTimeStats
              bidCount={bids.filter((b: BidRecord) => b.status !== 'rejected').length}
              lastBidTimestamp={lastBid ? lastBid.timestamp : null}
              nextBreakIn={breakStatus?.secondsRemaining ?? null}
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
          squadRequirements={[]}
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
