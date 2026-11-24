import { z } from 'zod';

// Hex color validation
const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;

export const createTeamSchema = z.object({
  name: z
    .string()
    .min(1, 'Team name is required')
    .max(100, 'Team name must be 100 characters or less'),
  shortName: z
    .string()
    .min(1, 'Short name is required')
    .max(20, 'Short name must be 20 characters or less')
    .regex(/^[a-zA-Z0-9]*$/, 'Short name can only contain letters and numbers'),
  description: z
    .string()
    .max(500, 'Description must be 500 characters or less')
    .optional()
    .or(z.literal('')),
  primaryColor: z
    .string()
    .regex(hexColorRegex, 'Primary color must be a valid hex color (e.g., #FF5733)'),
  secondaryColor: z
    .string()
    .regex(hexColorRegex, 'Secondary color must be a valid hex color')
    .optional()
    .or(z.literal('')),
  countryCode: z
    .string()
    .length(2, 'Country code must be 2 characters')
    .optional()
    .or(z.literal('')),
});

export type CreateTeamFormData = z.infer<typeof createTeamSchema>;

export const updateTeamSchema = createTeamSchema.partial().omit({});

export type UpdateTeamFormData = z.infer<typeof updateTeamSchema>;
