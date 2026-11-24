import { z } from 'zod';

// ===== Auction Creation and Setup =====

export const CreateAuctionDtoSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type CreateAuctionDto = z.infer<typeof CreateAuctionDtoSchema>;

// ===== Bid Submission =====

export const SubmitBidDtoSchema = z.object({
  auctionId: z.string().uuid(),
  auctionPlayerId: z.string().uuid(),
  auctionTeamId: z.string().uuid(),
  amountMinor: z.bigint().positive(),
  idempotencyKey: z.string().uuid(),
  stateVersion: z.number().int().nonnegative(),
});

export type SubmitBidDto = z.infer<typeof SubmitBidDtoSchema>;

// ===== State Transitions =====

export const StartAuctionDtoSchema = z.object({
  auctionId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type StartAuctionDto = z.infer<typeof StartAuctionDtoSchema>;

export const PauseAuctionDtoSchema = z.object({
  auctionId: z.string().uuid(),
  userId: z.string().uuid(),
  reason: z.string().optional(),
});

export type PauseAuctionDto = z.infer<typeof PauseAuctionDtoSchema>;

export const ResumeAuctionDtoSchema = z.object({
  auctionId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type ResumeAuctionDto = z.infer<typeof ResumeAuctionDtoSchema>;

export const ConcludeAuctionDtoSchema = z.object({
  auctionId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type ConcludeAuctionDto = z.infer<typeof ConcludeAuctionDtoSchema>;

// ===== Player Selection =====

export const SelectPlayerManualDtoSchema = z.object({
  auctionId: z.string().uuid(),
  playerId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type SelectPlayerManualDto = z.infer<typeof SelectPlayerManualDtoSchema>;

export const DrawPlayerAutomaticDtoSchema = z.object({
  auctionId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type DrawPlayerAutomaticDto = z.infer<typeof DrawPlayerAutomaticDtoSchema>;

// ===== Break Management =====

export const UpdateBreakDurationDtoSchema = z.object({
  auctionId: z.string().uuid(),
  adjustmentSeconds: z.number().int(),
  userId: z.string().uuid(),
});

export type UpdateBreakDurationDto = z.infer<typeof UpdateBreakDurationDtoSchema>;

// ===== Turn-Based Actions =====

export const SubmitTurnActionDtoSchema = z.object({
  auctionId: z.string().uuid(),
  auctionPlayerId: z.string().uuid(),
  auctionTeamId: z.string().uuid(),
  action: z.enum(['RAISE', 'PASS']),
  bidAmountMinor: z.bigint().positive().optional(),
  idempotencyKey: z.string().uuid(),
  stateVersion: z.number().int().nonnegative(),
});

export type SubmitTurnActionDto = z.infer<typeof SubmitTurnActionDtoSchema>;

// ===== Response DTOs =====

export const BidResponseSchema = z.object({
  id: z.string().uuid(),
  auctionId: z.string().uuid(),
  playerId: z.string().uuid(),
  teamId: z.string().uuid(),
  amountMinor: z.bigint(),
  accepted: z.boolean(),
  reason: z.string().optional(),
  sequence: z.number().int(),
  stateVersion: z.number().int(),
});

export type BidResponseDto = z.infer<typeof BidResponseSchema>;

export const AuctionSnapshotSchema = z.object({
  auctionId: z.string().uuid(),
  phase: z.enum(['DRAFT', 'REGISTRATION', 'READY', 'LIVE', 'SETTLEMENT', 'CONCLUDED', 'PAUSED']),
  stateVersion: z.number().int(),
  currentPlayerId: z.string().uuid().nullable(),
  currentTeamId: z.string().uuid().nullable(),
  highBidMinor: z.bigint().nullable(),
  highBidTeamId: z.string().uuid().nullable(),
  phaseDeadline: z.date().nullable(),
  events: z.array(
    z.object({
      sequence: z.number(),
      type: z.string(),
      payload: z.record(z.any()),
      createdAt: z.date(),
    })
  ),
});

export type AuctionSnapshotDto = z.infer<typeof AuctionSnapshotSchema>;
