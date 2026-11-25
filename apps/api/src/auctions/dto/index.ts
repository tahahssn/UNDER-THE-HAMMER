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

export const BeginBreakDtoSchema = z.object({
  auctionId: z.string().uuid(),
  durationSeconds: z.number().int().positive(),
  reason: z.string().optional(),
  userId: z.string().uuid(),
});

export type BeginBreakDto = z.infer<typeof BeginBreakDtoSchema>;

export const ExtendBreakDtoSchema = z.object({
  auctionId: z.string().uuid(),
  extensionSeconds: z.number().int().positive(),
  userId: z.string().uuid(),
});

export type ExtendBreakDto = z.infer<typeof ExtendBreakDtoSchema>;

export const ReduceBreakDtoSchema = z.object({
  auctionId: z.string().uuid(),
  reductionSeconds: z.number().int().positive(),
  userId: z.string().uuid(),
});

export type ReduceBreakDto = z.infer<typeof ReduceBreakDtoSchema>;

export const EndBreakDtoSchema = z.object({
  auctionId: z.string().uuid(),
  userId: z.string().uuid(),
});

export type EndBreakDto = z.infer<typeof EndBreakDtoSchema>;

export const BreakStatusDtoSchema = z.object({
  id: z.string().uuid(),
  startedAt: z.date(),
  deadline: z.date(),
  secondsRemaining: z.number().int(),
  originalDurationSeconds: z.number().int(),
  reason: z.string().optional(),
  isExpired: z.boolean(),
});

export type BreakStatusDto = z.infer<typeof BreakStatusDtoSchema>;

// ===== Squad Management =====

export const GetSquadRulesDtoSchema = z.object({
  auctionId: z.string().uuid(),
});

export type GetSquadRulesDto = z.infer<typeof GetSquadRulesDtoSchema>;

export const GetSquadProgressDtoSchema = z.object({
  auctionId: z.string().uuid(),
  auctionTeamId: z.string().uuid(),
});

export type GetSquadProgressDto = z.infer<typeof GetSquadProgressDtoSchema>;

export const ValidateSquadRequirementsDtoSchema = z.object({
  auctionId: z.string().uuid(),
  auctionTeamId: z.string().uuid(),
});

export type ValidateSquadRequirementsDto = z.infer<typeof ValidateSquadRequirementsDtoSchema>;

export const SquadRuleProgressSchema = z.object({
  id: z.string().uuid(),
  type: z.enum(['SQUAD_SIZE', 'ROLE_COUNT', 'DOMESTIC_COUNT', 'OVERSEAS_COUNT', 'CATEGORY_COUNT']),
  description: z.string(),
  currentCount: z.number().int(),
  minCount: z.number().int().optional(),
  maxCount: z.number().int().optional(),
  satisfied: z.boolean(),
});

export type SquadRuleProgressDto = z.infer<typeof SquadRuleProgressSchema>;

export const SquadValidationResultSchema = z.object({
  valid: z.boolean(),
  progress: z.array(SquadRuleProgressSchema),
  violations: z.array(
    z.object({
      ruleId: z.string().uuid(),
      type: z.string(),
      violationType: z.enum(['BELOW_MIN', 'ABOVE_MAX', 'MISSING_REQUIREMENT']),
      currentCount: z.number().int(),
      requiredMinCount: z.number().int().optional(),
      requiredMaxCount: z.number().int().optional(),
    })
  ),
});

export type SquadValidationResultDto = z.infer<typeof SquadValidationResultSchema>;

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
