"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PaymentSchema = exports.PaymentStatusSchema = exports.CheckEntitlementsResponseSchema = exports.CancelSubscriptionResponseSchema = exports.CancelSubscriptionRequestSchema = exports.ListPlansResponseSchema = exports.GetInvoicesResponseSchema = exports.InvoiceSchema = exports.GetCurrentSubscriptionResponseSchema = exports.SubscriptionSchema = exports.SubscriptionPlanSchema = exports.CheckoutResponseSchema = exports.CreateCheckoutRequestSchema = void 0;
const zod_1 = require("zod");
/**
 * Payments DTO contracts
 *
 * Shared between backend API and frontend client.
 * All amounts are in integer minor units (paisa).
 * Zod schemas provide runtime validation.
 */
// ===== Checkout Request/Response =====
exports.CreateCheckoutRequestSchema = zod_1.z.object({
    planId: zod_1.z.string().uuid('Invalid plan ID'),
    idempotencyKey: zod_1.z.string().optional(),
});
exports.CheckoutResponseSchema = zod_1.z.object({
    paymentId: zod_1.z.string().uuid(),
    checkoutUrl: zod_1.z.string().url(),
    sessionId: zod_1.z.string(),
});
// ===== Subscription Info =====
exports.SubscriptionPlanSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    key: zod_1.z.string(),
    name: zod_1.z.string(),
    priceMinor: zod_1.z.number().int().nonnegative(),
    currency: zod_1.z.string().length(3),
    period: zod_1.z.enum(['MONTH', 'YEAR']),
    active: zod_1.z.boolean(),
    createdAt: zod_1.z.string().datetime(),
});
exports.SubscriptionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    userId: zod_1.z.string().uuid(),
    planId: zod_1.z.string().uuid(),
    plan: exports.SubscriptionPlanSchema,
    status: zod_1.z.enum(['PENDING', 'ACTIVE', 'GRACE', 'CANCELLED', 'EXPIRED']),
    currentPeriodStart: zod_1.z.string().datetime().nullable(),
    currentPeriodEnd: zod_1.z.string().datetime().nullable(),
    cancelAtPeriodEnd: zod_1.z.boolean(),
    createdAt: zod_1.z.string().datetime(),
    updatedAt: zod_1.z.string().datetime(),
});
exports.GetCurrentSubscriptionResponseSchema = zod_1.z.object({
    subscription: exports.SubscriptionSchema.nullable(),
});
// ===== Invoices =====
exports.InvoiceSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    paymentId: zod_1.z.string().uuid(),
    number: zod_1.z.string(),
    issuedAt: zod_1.z.string().datetime(),
    amountMinor: zod_1.z.number().int().nonnegative(),
    currency: zod_1.z.string().length(3),
    status: zod_1.z.enum(['PENDING', 'PAID', 'CANCELLED']),
});
exports.GetInvoicesResponseSchema = zod_1.z.object({
    invoices: zod_1.z.array(exports.InvoiceSchema),
    total: zod_1.z.number().int().nonnegative(),
    skip: zod_1.z.number().int().nonnegative(),
    take: zod_1.z.number().int().nonnegative(),
});
// ===== Plans List =====
exports.ListPlansResponseSchema = zod_1.z.object({
    plans: zod_1.z.array(exports.SubscriptionPlanSchema),
    total: zod_1.z.number().int().nonnegative(),
});
// ===== Cancel Subscription =====
exports.CancelSubscriptionRequestSchema = zod_1.z.object({
    subscriptionId: zod_1.z.string().uuid(),
    reason: zod_1.z.string().optional(),
});
exports.CancelSubscriptionResponseSchema = zod_1.z.object({
    subscription: exports.SubscriptionSchema,
    cancelAt: zod_1.z.string().datetime(),
});
// ===== Entitlements =====
exports.CheckEntitlementsResponseSchema = zod_1.z.object({
    hostCanCreate: zod_1.z.boolean(),
    maxActiveRooms: zod_1.z.number().int().nonnegative(),
    maxTeamsPerRoom: zod_1.z.number().int().nonnegative(),
    maxSpectatorsPerRoom: zod_1.z.number().int().nonnegative(),
    maxRoomDurationMinutes: zod_1.z.number().int().nonnegative(),
});
// ===== Payment Status =====
exports.PaymentStatusSchema = zod_1.z.enum([
    'PENDING',
    'PAID',
    'FAILED',
    'CANCELLED',
    'PARTIALLY_REFUNDED',
    'REFUNDED',
]);
exports.PaymentSchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    amountMinor: zod_1.z.number().int().positive(),
    currency: zod_1.z.string().length(3),
    status: exports.PaymentStatusSchema,
    createdAt: zod_1.z.string().datetime(),
    paidAt: zod_1.z.string().datetime().nullable(),
});
//# sourceMappingURL=payments.dto.js.map