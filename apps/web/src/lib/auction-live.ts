/**
 * Phase J — Live Auction frontend contracts and formatting helpers.
 *
 * Shared types and pure helpers for the live auction room UI. Business logic
 * (currency formatting, error mapping) lives here so components stay
 * presentational and the same rules are reused across hooks and views.
 *
 * All monetary values are integer minor units (e.g. paisa for PKR). Never use
 * floating point for money decisions; the backend remains authoritative.
 */

/** A player currently or previously on the auction block. */
export interface AuctionPlayer {
  id: string;
  name: string;
  role: string;
  category: string;
  /** Base price in integer minor units. */
  basePriceMinor: number;
  /** ISO 4217 currency code, e.g. "PKR". */
  currency: string;
}

/** The team currently holding the highest accepted bid on a player. */
export interface LeadingTeam {
  id: string;
  name: string;
  /** Leading bid amount in integer minor units. */
  amountMinor: number;
}

/** Status of a bid as shown in the history feed. */
export type BidStatus = 'accepted' | 'pending' | 'rejected';

/** A single bid shown in the history feed. */
export interface BidRecord {
  id: string;
  teamId: string;
  teamName: string;
  /** Bid amount in integer minor units. */
  amount: number;
  /** ISO 8601 string or Date. */
  timestamp: string | Date;
  status: BidStatus;
  /** Currency code; defaults to PKR when omitted. */
  currency?: string;
  /** Idempotency key used to reconcile optimistic updates. */
  idempotencyKey?: string;
}

/** A team row in the standings grid. */
export interface TeamStanding {
  id: string;
  name: string;
  logo?: string | null;
  /** Remaining purse in integer minor units. */
  purse: number;
  squadCount: number;
  maxSquadSize: number;
  currency?: string;
}

/** Break lifecycle state surfaced to the live room. */
export type BreakState = 'inactive' | 'active';

/**
 * Bid rejection codes handled by the UI. These mirror the Phase G validation
 * pipeline rejection reasons. Unknown codes fall back to a generic message.
 */
export type BidErrorCode =
  | 'INSUFFICIENT_PURSE'
  | 'INVALID_INCREMENT'
  | 'UNAUTHORIZED_TEAM'
  | 'PLAYER_SOLD'
  | 'AUCTION_NOT_ACTIVE'
  | 'BID_AFTER_DEADLINE'
  | 'DUPLICATE_IDEMPOTENCY_KEY';

/** Structured error returned by bid submission or socket rejection. */
export interface BidError {
  code: BidErrorCode | string;
  /** Optional server-provided message. */
  message?: string;
  /** Available purse in minor units (for INSUFFICIENT_PURSE). */
  availableMinor?: number;
  /** Minimum valid next bid in minor units (for INVALID_INCREMENT / BELOW_MINIMUM). */
  minimumBidMinor?: number;
  currency?: string;
}

const CRORE_IN_RUPEES = 10_000_000;
const LAKH_IN_RUPEES = 100_000;

/**
 * Format an integer minor-unit amount as a compact, human-readable string using
 * the South Asian crore/lakh scale used by the product. Pure and deterministic.
 *
 * @param amountMinor Amount in minor units (paisa). Non-finite inputs render as 0.
 * @param currency ISO currency code prefix (default "PKR").
 */
export function formatMoney(amountMinor: number, currency = 'PKR'): string {
  const safe = Number.isFinite(amountMinor) ? amountMinor : 0;
  const major = safe / 100;
  const abs = Math.abs(major);

  if (abs >= CRORE_IN_RUPEES) {
    return `${currency} ${(major / CRORE_IN_RUPEES).toFixed(2)} Cr`;
  }
  if (abs >= LAKH_IN_RUPEES) {
    return `${currency} ${(major / LAKH_IN_RUPEES).toFixed(2)} L`;
  }
  return `${currency} ${major.toLocaleString('en-PK', { maximumFractionDigits: 2 })}`;
}

/** Normalize a currency value from a team/player record with a PKR fallback. */
export function resolveCurrency(currency?: string): string {
  return currency && currency.trim().length > 0 ? currency : 'PKR';
}

/**
 * Map a raw rejection code or structured error from the backend into the
 * canonical {@link BidError} shape consumed by the UI. Normalizes the Phase G
 * internal codes (e.g. BELOW_MINIMUM, DEADLINE_PASSED) onto the UI codes.
 */
export function normalizeBidError(raw: unknown): BidError {
  if (typeof raw === 'string') {
    return { code: mapRejectionCode(raw) };
  }
  if (raw && typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    const rawCode =
      (typeof obj.code === 'string' && obj.code) ||
      (typeof obj.reason === 'string' && obj.reason) ||
      (typeof obj.rejectionCode === 'string' && obj.rejectionCode) ||
      'UNKNOWN';
    return {
      code: mapRejectionCode(rawCode),
      message: typeof obj.message === 'string' ? obj.message : undefined,
      availableMinor:
        typeof obj.availableMinor === 'number'
          ? obj.availableMinor
          : typeof obj.available === 'number'
            ? obj.available
            : undefined,
      minimumBidMinor:
        typeof obj.minimumBidMinor === 'number'
          ? obj.minimumBidMinor
          : typeof obj.minimumBid === 'number'
            ? obj.minimumBid
            : undefined,
      currency: typeof obj.currency === 'string' ? obj.currency : undefined,
    };
  }
  return { code: 'UNKNOWN' };
}

/** Translate Phase G internal rejection codes onto UI-facing codes. */
function mapRejectionCode(code: string): BidErrorCode | string {
  switch (code) {
    case 'BELOW_MINIMUM':
    case 'INVALID_INCREMENT':
      return 'INVALID_INCREMENT';
    case 'INSUFFICIENT_PURSE':
    case 'INSUFFICIENT_BALANCE':
      return 'INSUFFICIENT_PURSE';
    case 'INVALID_TEAM':
    case 'NOT_ELIGIBLE_TO_BID':
    case 'UNAUTHORIZED':
    case 'UNAUTHORIZED_TEAM':
      return 'UNAUTHORIZED_TEAM';
    case 'PLAYER_ALREADY_SOLD':
    case 'PLAYER_SOLD':
      return 'PLAYER_SOLD';
    case 'AUCTION_NOT_LIVE':
    case 'AUCTION_NOT_ACTIVE':
      return 'AUCTION_NOT_ACTIVE';
    case 'DEADLINE_PASSED':
    case 'BID_AFTER_DEADLINE':
      return 'BID_AFTER_DEADLINE';
    case 'DUPLICATE_BID':
    case 'DUPLICATE_IDEMPOTENCY_KEY':
      return 'DUPLICATE_IDEMPOTENCY_KEY';
    default:
      return code;
  }
}

/** Generate a RFC4122 idempotency key, falling back when crypto is unavailable. */
export function generateIdempotencyKey(): string {
  const cryptoObj = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (cryptoObj && typeof cryptoObj.randomUUID === 'function') {
    return cryptoObj.randomUUID();
  }
  // Deterministic-enough fallback for non-secure contexts / older runtimes.
  return `bid-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}
