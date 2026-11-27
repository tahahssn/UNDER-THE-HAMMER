'use client';

import { useCallback, useEffect, useState } from 'react';
import { getAuthToken } from '@/lib/api';
import {
  resolveCurrency,
  TeamStanding,
} from '@/lib/auction-live';

/** Minimal auction summary surfaced to the live room. */
export interface LiveAuctionSummary {
  id: string;
  roomId: string;
  phase: string;
  stateVersion: number;
  currency: string;
  currentAuctionPlayerId: string | null;
  highBidMinor: number | null;
  highBidTeamId: string | null;
}

/** Minimal room summary surfaced to the live room. */
export interface LiveRoomSummary {
  id: string;
  name: string;
  /** User id of the room host; authoritative for host detection. */
  hostId: string;
}

/** A squad requirement rule shown in the break overlay. */
export interface SquadRequirement {
  id: string;
  type: string;
  description: string;
  currentCount: number;
  minCount?: number;
  maxCount?: number;
  satisfied: boolean;
}

export interface UseAuctionStateResult {
  auction: LiveAuctionSummary | null;
  room: LiveRoomSummary | null;
  teams: TeamStanding[];
  /** Base price in minor units keyed by auctionPlayerId (used to enrich the live player). */
  basePriceByPlayerId: Record<string, number>;
  squadRequirements: SquadRequirement[];
  isLoading: boolean;
  /** HTTP status of the auction fetch; 404 means the auction does not exist. */
  status: number | null;
  error: string | null;
  refetch: () => Promise<void>;
}

/** Internal cached snapshot of the three combined fetches. */
interface AuctionStateData {
  auction: LiveAuctionSummary;
  room: LiveRoomSummary;
  teams: TeamStanding[];
  basePriceByPlayerId: Record<string, number>;
  squadRequirements: SquadRequirement[];
}

const STALE_TIME_MS = 5_000;

interface CacheEntry {
  data: AuctionStateData;
  fetchedAt: number;
}

// Module-level cache keyed by auctionId. Shared across hook instances.
const stateCache = new Map<string, CacheEntry>();

/** Exposed for tests to reset cross-test cache state. */
export function __clearAuctionStateCache(): void {
  stateCache.clear();
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object'
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

/** Coerce a number or numeric string (BigInt is serialized as string) to a number. */
function asMinor(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function mapAuction(raw: unknown): LiveAuctionSummary {
  const a = asRecord(raw);
  const room = asRecord(a.room);
  return {
    id: asString(a.id) ?? '',
    roomId: asString(a.roomId) ?? asString(room.id) ?? '',
    phase: asString(a.phase) ?? 'UNKNOWN',
    stateVersion: asMinor(a.stateVersion) ?? 0,
    currency: resolveCurrency(asString(a.currency) ?? undefined),
    currentAuctionPlayerId: asString(a.currentAuctionPlayerId),
    highBidMinor: asMinor(a.highBidMinor),
    highBidTeamId: asString(a.highBidTeamId),
  };
}

function mapRoom(rawAuction: unknown): LiveRoomSummary {
  const a = asRecord(rawAuction);
  const room = asRecord(a.room);
  return {
    id: asString(room.id) ?? asString(a.roomId) ?? '',
    name: asString(room.name) ?? 'Live Auction',
    hostId: asString(room.hostId) ?? '',
  };
}

function mapTeams(raw: unknown, currency: string, squadSize: number): TeamStanding[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry) => {
    const t = asRecord(entry);
    const team = asRecord(t.team);
    const acquisitions = Array.isArray(t.acquisitions) ? t.acquisitions : [];
    const logoAsset = asRecord(team.currentLogo);
    return {
      id: asString(t.id) ?? '',
      name: asString(team.name) ?? asString(t.name) ?? 'Team',
      logo: asString(logoAsset.url),
      purse: asMinor(t.purseBalanceMinor) ?? 0,
      squadCount: acquisitions.length,
      maxSquadSize: squadSize,
      currency,
    } satisfies TeamStanding;
  });
}

function describeRule(rule: Record<string, unknown>): string {
  const type = asString(rule.type) ?? 'REQUIREMENT';
  const role = asString(rule.role);
  const category = asRecord(rule.category);
  const label = role ?? asString(category.name) ?? type.replace(/_/g, ' ');
  const min = asMinor(rule.minCount);
  const max = asMinor(rule.maxCount);
  if (min !== null && max !== null) return `${label}: ${min}–${max}`;
  if (min !== null) return `${label}: min ${min}`;
  if (max !== null) return `${label}: max ${max}`;
  return label;
}

function mapSquadRules(raw: unknown): SquadRequirement[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((entry, index) => {
    const rule = asRecord(entry);
    return {
      id: asString(rule.id) ?? `rule-${index}`,
      type: asString(rule.type) ?? 'REQUIREMENT',
      description: describeRule(rule),
      currentCount: 0,
      minCount: asMinor(rule.minCount) ?? undefined,
      maxCount: asMinor(rule.maxCount) ?? undefined,
      satisfied: false,
    } satisfies SquadRequirement;
  });
}

/** Derive a sensible squad-size ceiling from the configured rules. */
function deriveSquadSize(rules: SquadRequirement[]): number {
  const totalMin = rules.reduce((sum, r) => sum + (r.minCount ?? 0), 0);
  return totalMin > 0 ? totalMin : 0;
}

function mapBasePrices(rawAuction: unknown): Record<string, number> {
  const a = asRecord(rawAuction);
  const players = Array.isArray(a.players) ? a.players : [];
  const map: Record<string, number> = {};
  for (const entry of players) {
    const p = asRecord(entry);
    const id = asString(p.id);
    const base = asMinor(p.basePriceMinor);
    if (id && base !== null) map[id] = base;
  }
  return map;
}

/**
 * useAuctionState: fetch and cache the initial live-room state from the real
 * REST endpoints that the backend exposes.
 *
 * Combines `GET /api/v1/auctions/:id` (auction + room + players), `/teams`
 * (purse balances and acquisitions) and `/squads/rules` (break requirements).
 * There is no `/state` endpoint; the live current-player and bid feed are
 * driven by the Socket.IO snapshot and event stream (see useAuctionRealTime).
 *
 * A 404 on the auction fetch means the auction does not exist and is surfaced
 * via `status` so the page can render not-found; transport failures are kept
 * distinct (status stays null) so a flaky network does not masquerade as a
 * missing auction. Room membership is enforced server-side on the socket join.
 */
export function useAuctionState(auctionId: string): UseAuctionStateResult {
  const [data, setData] = useState<AuctionStateData | null>(() => {
    const cached = stateCache.get(auctionId);
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
      if (!auctionId) return;

      if (!force) {
        const cached = stateCache.get(auctionId);
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

      const token = getAuthToken();
      const headers: HeadersInit = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const base = `/api/v1/auctions/${encodeURIComponent(auctionId)}`;

      try {
        const detailRes = await fetch(base, { method: 'GET', headers });
        setStatus(detailRes.status);

        if (!detailRes.ok) {
          setError(
            detailRes.status === 404
              ? 'Auction not found.'
              : `Failed to load auction (${detailRes.status}).`
          );
          setData(null);
          setIsLoading(false);
          return;
        }

        const detail = (await detailRes.json()) as unknown;

        // Teams and squad rules are supplementary; failures degrade gracefully.
        const [teamsRaw, rulesRaw] = await Promise.all([
          fetch(`${base}/teams`, { method: 'GET', headers })
            .then((r) => (r.ok ? (r.json() as Promise<unknown>) : []))
            .catch(() => []),
          fetch(`${base}/squads/rules`, { method: 'GET', headers })
            .then((r) => (r.ok ? (r.json() as Promise<unknown>) : []))
            .catch(() => []),
        ]);

        const auction = mapAuction(detail);
        const squadRequirements = mapSquadRules(rulesRaw);
        const squadSize = deriveSquadSize(squadRequirements);
        const next: AuctionStateData = {
          auction,
          room: mapRoom(detail),
          teams: mapTeams(teamsRaw, auction.currency, squadSize),
          basePriceByPlayerId: mapBasePrices(detail),
          squadRequirements,
        };

        stateCache.set(auctionId, { data: next, fetchedAt: Date.now() });
        setData(next);
        setError(null);
      } catch (err) {
        // Transport failure — not a missing auction. Keep status null.
        setStatus(null);
        setError(
          err instanceof Error ? err.message : 'Failed to load auction state'
        );
      } finally {
        setIsLoading(false);
      }
    },
    [auctionId]
  );

  useEffect(() => {
    void doFetch(false);
  }, [doFetch]);

  const refetch = useCallback(() => doFetch(true), [doFetch]);

  return {
    auction: data?.auction ?? null,
    room: data?.room ?? null,
    teams: data?.teams ?? [],
    basePriceByPlayerId: data?.basePriceByPlayerId ?? {},
    squadRequirements: data?.squadRequirements ?? [],
    isLoading,
    status,
    error,
    refetch,
  };
}

export default useAuctionState;
