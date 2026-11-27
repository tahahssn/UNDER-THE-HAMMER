import { z } from 'zod';

/**
 * Payments DTO contracts
 *
 * Shared between backend API and frontend client.
 * All amounts are in integer minor units (paisa).
 * Zod schemas provide runtime validation.
 */

// ===== Checkout Request/Response =====

export const CreateCheckoutRequestSchema = z.object({
  planId: z.string().uuid('Invalid plan ID'),
  idempotencyKey: z.string().optional(),
});

export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;

export const CheckoutResponseSchema = z.object({
  paymentId: z.string().uuid(),
  checkoutUrl: z.string().url(),
  sessionId: z.string(),
});

export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;

// ===== Subscription Info =====

export const SubscriptionPlanSchema = z.object({
  id: z.string().uuid(),
  key: z.string(),
  name: z.string(),
  priceMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  period: z.enum(['MONTH', 'YEAR']),
  active: z.boolean(),
  createdAt: z.string().datetime(),
});

export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;

export const SubscriptionSchema = z.object({
  id: z.string().uuid(),
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  plan: SubscriptionPlanSchema,
  status: z.enum(['PENDING', 'ACTIVE', 'GRACE', 'CANCELLED', 'EXPIRED']),
  currentPeriodStart: z.string().datetime().nullable(),
  currentPeriodEnd: z.string().datetime().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

export type Subscription = z.infer<typeof SubscriptionSchema>;

export const GetCurrentSubscriptionResponseSchema = z.object({
  subscription: SubscriptionSchema.nullable(),
});

export type GetCurrentSubscriptionResponse = z.infer<
  typeof GetCurrentSubscriptionResponseSchema
>;

// ===== Invoices =====

export const InvoiceSchema = z.object({
  id: z.string().uuid(),
  paymentId: z.string().uuid(),
  number: z.string(),
  issuedAt: z.string().datetime(),
  amountMinor: z.number().int().nonnegative(),
  currency: z.string().length(3),
  status: z.enum(['PENDING', 'PAID', 'CANCELLED']),
});

export type Invoice = z.infer<typeof InvoiceSchema>;

export const GetInvoicesResponseSchema = z.object({
  invoices: z.array(InvoiceSchema),
  total: z.number().int().nonnegative(),
  skip: z.number().int().nonnegative(),
  take: z.number().int().nonnegative(),
});

export type GetInvoicesResponse = z.infer<typeof GetInvoicesResponseSchema>;

// ===== Plans List =====

export const ListPlansResponseSchema = z.object({
  plans: z.array(SubscriptionPlanSchema),
  total: z.number().int().nonnegative(),
});

export type ListPlansResponse = z.infer<typeof ListPlansResponseSchema>;

// ===== Cancel Subscription =====

export const CancelSubscriptionRequestSchema = z.object({
  subscriptionId: z.string().uuid(),
  reason: z.string().optional(),
});

export type CancelSubscriptionRequest = z.infer<
  typeof CancelSubscriptionRequestSchema
>;

export const CancelSubscriptionResponseSchema = z.object({
  subscription: SubscriptionSchema,
  cancelAt: z.string().datetime(),
});

export type CancelSubscriptionResponse = z.infer<
  typeof CancelSubscriptionResponseSchema
>;

// ===== Entitlements =====

export const CheckEntitlementsResponseSchema = z.object({
  hostCanCreate: z.boolean(),
  maxActiveRooms: z.number().int().nonnegative(),
  maxTeamsPerRoom: z.number().int().nonnegative(),
  maxSpectatorsPerRoom: z.number().int().nonnegative(),
  maxRoomDurationMinutes: z.number().int().nonnegative(),
});

export type CheckEntitlementsResponse = z.infer<
  typeof CheckEntitlementsResponseSchema
>;

// ===== Payment Status =====

export const PaymentStatusSchema = z.enum([
  'PENDING',
  'PAID',
  'FAILED',
  'CANCELLED',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
]);

export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;

export const PaymentSchema = z.object({
  id: z.string().uuid(),
  amountMinor: z.number().int().positive(),
  currency: z.string().length(3),
  status: PaymentStatusSchema,
  createdAt: z.string().datetime(),
  paidAt: z.string().datetime().nullable(),
});

export type Payment = z.infer<typeof PaymentSchema>;
