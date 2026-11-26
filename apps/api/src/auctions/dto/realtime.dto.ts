import { z } from 'zod';

// ===== BREAK EVENT PAYLOAD =====

export const BreakEventPayloadSchema = z.object({
  breakId: z.string().uuid(),
  auctionId: z.string().uuid(),
  startedAt: z.date(),
  deadline: z.date(),
  durationSeconds: z.number().int().positive(),
  reason: z.string().optional(),
  triggerBidCount: z.number().int().optional(),
});

export type BreakEventPayload = z.infer<typeof BreakEventPayloadSchema>;

export const BreakAdjustmentPayloadSchema = z.object({
  breakId: z.string().uuid(),
  newDeadline: z.date(),
  adjustmentSeconds: z.number().int(), // positive/negative
});

export type BreakAdjustmentPayload = z.infer<typeof BreakAdjustmentPayloadSchema>;

// ===== CHAT MESSAGE DTO =====

export const ChatMessageDtoSchema = z.object({
  messageId: z.string().uuid(),
  from: z.string().uuid(),
  message: z.string().max(500),
  timestamp: z.date(),
  isModerationHeld: z.boolean(),
  authorRole: z.enum(['HOST', 'TEAM_OWNER', 'SPECTATOR']),
});

export type ChatMessageDto = z.infer<typeof ChatMessageDtoSchema>;

export const CreateChatMessageDtoSchema = z.object({
  roomId: z.string().uuid(),
  message: z.string().min(1).max(500),
});

export type CreateChatMessageDto = z.infer<typeof CreateChatMessageDtoSchema>;

// ===== PRESENCE PARTICIPANT =====

export const PresenceParticipantSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(['HOST', 'TEAM_OWNER', 'SPECTATOR']),
  teamId: z.string().uuid().optional(),
  joinedAt: z.date(),
  connectionState: z.enum(['connected', 'reconnecting']),
});

export type PresenceParticipant = z.infer<typeof PresenceParticipantSchema>;

export const RoomPresenceSnapshotSchema = z.object({
  roomId: z.string().uuid(),
  participants: z.array(PresenceParticipantSchema),
  activeBidderId: z.string().uuid().optional(),
  timestamp: z.date(),
});

export type RoomPresenceSnapshot = z.infer<typeof RoomPresenceSnapshotSchema>;

// ===== ROOM STATE DTO =====

export const RoomStateSchema = z.object({
  roomId: z.string().uuid(),
  auctionId: z.string().uuid().optional(),
  status: z.enum(['DRAFT', 'REGISTRATION', 'READY', 'LIVE', 'COMPLETED', 'CANCELLED']),
  phase: z.enum([
    'DRAFT',
    'REGISTRATION',
    'READY',
    'LIVE',
    'PLAYER_INTRODUCTION',
    'BIDDING',
    'BREAK',
    'SETTLEMENT',
    'PAUSED',
    'COMPLETED',
    'CANCELLED',
  ]),
  visibility: z.enum(['PUBLIC', 'PRIVATE']),
  hostId: z.string().uuid(),
  hostName: z.string(),
  currentParticipantCount: z.number().int().nonnegative(),
  maxParticipants: z.number().int().positive().optional(),
  createdAt: z.date(),
});

export type RoomStateDto = z.infer<typeof RoomStateSchema>;

// ===== GATEWAY EVENTS (PAYLOADS) =====

export const GatewayEventPayloadSchema = z.union([
  BreakEventPayloadSchema,
  BreakAdjustmentPayloadSchema,
  ChatMessageDtoSchema,
  PresenceParticipantSchema,
]);

export type GatewayEventPayload = z.infer<typeof GatewayEventPayloadSchema>;

// ===== ERROR RESPONSES =====

export const GatewayErrorSchema = z.object({
  code: z.string(),
  message: z.string().optional(),
});

export type GatewayError = z.infer<typeof GatewayErrorSchema>;

export const GatewayErrorCodesEnum = z.enum([
  'UNAUTHORIZED',
  'NOT_ROOM_MEMBER',
  'ROOM_NOT_FOUND',
  'AUCTION_NOT_FOUND',
  'NO_ACTIVE_BREAK',
  'DURATION_TOO_SHORT',
  'DURATION_TOO_LONG',
  'ADJUSTMENT_EXCEEDS_LIMIT',
  'INVALID_MESSAGE_LENGTH',
  'RATE_LIMITED',
  'USER_MUTED',
  'TARGET_NOT_MEMBER',
  'ROLE_MISMATCH',
  'INTERNAL_ERROR',
]);

export type GatewayErrorCode = z.infer<typeof GatewayErrorCodesEnum>;

// ===== REQUEST DTOs (from client) =====

export const BreakStartRequestSchema = z.object({
  auctionId: z.string().uuid(),
  durationSeconds: z.number().int().positive(),
  reason: z.string().optional(),
});

export type BreakStartRequest = z.infer<typeof BreakStartRequestSchema>;

export const BreakAdjustRequestSchema = z.object({
  auctionId: z.string().uuid(),
  adjustmentSeconds: z.number().int().refine(n => n !== 0, { message: "Adjustment must be non-zero" }),
});

export type BreakAdjustRequest = z.infer<typeof BreakAdjustRequestSchema>;

export const ChatHistoryRequestSchema = z.object({
  roomId: z.string().uuid(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type ChatHistoryRequest = z.infer<typeof ChatHistoryRequestSchema>;

export const PresenceRequestSchema = z.object({
  roomId: z.string().uuid(),
  includeEvents: z.boolean().optional(),
  eventCount: z.number().int().min(1).max(50).optional(),
});

export type PresenceRequest = z.infer<typeof PresenceRequestSchema>;
