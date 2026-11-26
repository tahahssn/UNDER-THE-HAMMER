/**
 * Socket.IO Event Contracts
 * Type-safe schemas for all real-time events (client ↔ server)
 * Generated from Phase I Real-time Gateway specification
 */

// ============================================================================
// CHAT EVENTS
// ============================================================================

export interface ChatMessagePayload {
  messageId: string;
  from: string; // User name or ID
  message: string;
  timestamp: string; // ISO 8601
  isModerationHeld: boolean;
  authorRole?: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  idempotencyKey?: string; // Idempotency key for deduplication; server echoes back
}

export interface ChatSendRequest {
  roomId: string;
  message: string;
  idempotencyKey?: string; // For deduplication
}

export interface ChatErrorPayload {
  code: 'RATE_LIMITED' | 'USER_MUTED' | 'MESSAGE_TOO_LONG' | 'INVALID_INPUT' | 'UNAUTHORIZED';
  message: string;
}

export interface ChatHistoryRequest {
  roomId: string;
  limit?: number;
  offset?: number;
}

export interface ChatHistoryPayload {
  messages: ChatMessagePayload[];
  total: number;
  hasMore: boolean;
}

// ============================================================================
// PRESENCE EVENTS
// ============================================================================

export interface PresenceParticipant {
  userId: string;
  userName: string;
  role: 'HOST' | 'TEAM_OWNER' | 'SPECTATOR';
  teamId?: string;
  teamName?: string;
  isOnline: boolean;
  connectedAt: string; // ISO 8601
  lastHeartbeat: string; // ISO 8601
  activeBidderId?: string; // Current active bidder on player
}

export interface RoomPresencePayload {
  participants: PresenceParticipant[];
  activeBidderId?: string; // Current active bidder (if any)
  timestamp: string; // ISO 8601
}

export interface PresenceUpdatePayload {
  userId: string;
  status: 'connected' | 'disconnected' | 'reconnecting';
  timestamp: string; // ISO 8601
}

export interface PresenceHeartbeatRequest {
  roomId: string;
  userId: string;
}

// ============================================================================
// BREAK EVENTS
// ============================================================================

export interface BreakStartedPayload {
  breakId: string;
  auctionId: string;
  startedAt: string; // ISO 8601
  deadline: string; // ISO 8601 (when break ends)
  reason: string; // 'BID_COUNT_THRESHOLD' | 'HOST_REQUESTED'
  durationSeconds: number;
}

export interface BreakEndedPayload {
  breakId: string;
  auctionId: string;
  endedAt: string; // ISO 8601
  actualDurationSeconds: number;
}

export interface BreakExtendRequest {
  breakId: string;
  auctionId: string;
  additionalSeconds: number;
}

export interface BreakReduceRequest {
  breakId: string;
  auctionId: string;
  reduceBySeconds: number;
}

export interface BreakAdjustedPayload {
  breakId: string;
  newDeadline: string; // ISO 8601
  adjustment: number; // positive for extend, negative for reduce
}

export interface BreakStatusPayload {
  isActive: boolean;
  breakId?: string;
  deadline?: string; // ISO 8601
  timeRemainingSeconds?: number;
  durationSeconds?: number;
}

// ============================================================================
// SQUAD EVENTS
// ============================================================================

export interface SquadRequirementProgress {
  squadRuleId: string;
  currentCount: number;
  minCount?: number;
  maxCount?: number;
  satisfied: boolean;
  ruleType: 'SQUAD_SIZE' | 'ROLE_COUNT' | 'DOMESTIC_COUNT' | 'OVERSEAS_COUNT' | 'CATEGORY_COUNT';
}

export interface SquadProgressPayload {
  auctionTeamId: string;
  teamName: string;
  progress: SquadRequirementProgress[];
  totalAcquisitions: number;
  timestamp: string; // ISO 8601
}

export interface SquadUpdatedPayload {
  auctionTeamId: string;
  auctionPlayerId: string;
  playerName: string;
  priceMinor: number;
  currency: string;
  newProgress: SquadProgressPayload;
}

// ============================================================================
// CONNECTION EVENTS
// ============================================================================

export interface ConnectionStatusPayload {
  status: 'connecting' | 'connected' | 'disconnected' | 'reconnecting' | 'error';
  message?: string;
  errorCode?: string;
  retryCount?: number;
}

export interface ReconnectRecoveryPayload {
  roomId: string;
  currentAuctionState: {
    phase: string;
    currentPlayerId?: string;
    highestBid?: number;
    breakActive: boolean;
  };
  messages: ChatMessagePayload[];
  participants: PresenceParticipant[];
}

// ============================================================================
// AUCTION EVENTS (from Phase G, integrated with real-time)
// ============================================================================

export interface BidAcceptedPayload {
  bidId: string;
  auctionPlayerId: string;
  auctionTeamId: string;
  amountMinor: number;
  currency: string;
  timestamp: string; // ISO 8601
  sequence: number;
  stateVersion: number;
}

export interface BidRejectedPayload {
  bidId: string;
  auctionTeamId: string;
  rejectionCode: string;
  message: string;
  timestamp: string; // ISO 8601
}

export interface PlayerSoldPayload {
  auctionPlayerId: string;
  playerName: string;
  winningTeamId: string;
  winningTeamName: string;
  priceMinor: number;
  currency: string;
  timestamp: string; // ISO 8601
}

export interface PlayerIntroducedPayload {
  auctionPlayerId: string;
  playerName: string;
  role: string;
  basePrice: number;
  category: string;
  timestamp: string; // ISO 8601
}

// ============================================================================
// ERROR EVENTS
// ============================================================================

export interface ErrorPayload {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string; // ISO 8601
}

// ============================================================================
// TYPE GUARDS & HELPERS
// ============================================================================

export function isChatMessagePayload(payload: unknown): payload is ChatMessagePayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'messageId' in payload &&
    'from' in payload &&
    'message' in payload &&
    'timestamp' in payload
  );
}

export function isPresenceParticipant(payload: unknown): payload is PresenceParticipant {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'userId' in payload &&
    'userName' in payload &&
    'role' in payload &&
    'isOnline' in payload
  );
}

export function isBreakStartedPayload(payload: unknown): payload is BreakStartedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'breakId' in payload &&
    'deadline' in payload &&
    'durationSeconds' in payload
  );
}

export function isSquadProgressPayload(payload: unknown): payload is SquadProgressPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'auctionTeamId' in payload &&
    'progress' in payload &&
    Array.isArray((payload as any).progress)
  );
}

export function isBidAcceptedPayload(payload: unknown): payload is BidAcceptedPayload {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'bidId' in payload &&
    'auctionTeamId' in payload &&
    'amountMinor' in payload
  );
}
