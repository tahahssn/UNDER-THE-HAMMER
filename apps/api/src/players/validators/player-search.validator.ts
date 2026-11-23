import { z } from 'zod';

export const playerSearchSchema = z.object({
  search: z.string().max(100).optional(),
  category: z.string().uuid().optional(),
  role: z.enum(['BATTER', 'BOWLER', 'ALL_ROUNDER', 'WICKETKEEPER']).optional(),
  country: z.string().length(2).optional(),
  skip: z.coerce.number().int().min(0).default(0),
  take: z.coerce.number().int().min(1).max(100).default(20),
});

export type PlayerSearchInput = z.infer<typeof playerSearchSchema>;
