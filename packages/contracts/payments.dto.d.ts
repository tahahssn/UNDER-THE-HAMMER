import { z } from 'zod';
/**
 * Payments DTO contracts
 *
 * Shared between backend API and frontend client.
 * All amounts are in integer minor units (paisa).
 * Zod schemas provide runtime validation.
 */
export declare const CreateCheckoutRequestSchema: z.ZodObject<{
    planId: z.ZodString;
    idempotencyKey: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    planId: string;
    idempotencyKey?: string | undefined;
}, {
    planId: string;
    idempotencyKey?: string | undefined;
}>;
export type CreateCheckoutRequest = z.infer<typeof CreateCheckoutRequestSchema>;
export declare const CheckoutResponseSchema: z.ZodObject<{
    paymentId: z.ZodString;
    checkoutUrl: z.ZodString;
    sessionId: z.ZodString;
}, "strip", z.ZodTypeAny, {
    paymentId: string;
    checkoutUrl: string;
    sessionId: string;
}, {
    paymentId: string;
    checkoutUrl: string;
    sessionId: string;
}>;
export type CheckoutResponse = z.infer<typeof CheckoutResponseSchema>;
export declare const SubscriptionPlanSchema: z.ZodObject<{
    id: z.ZodString;
    key: z.ZodString;
    name: z.ZodString;
    priceMinor: z.ZodNumber;
    currency: z.ZodString;
    period: z.ZodEnum<["MONTH", "YEAR"]>;
    active: z.ZodBoolean;
    createdAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
    id: string;
    createdAt: string;
    key: string;
    priceMinor: number;
    currency: string;
    period: "MONTH" | "YEAR";
    active: boolean;
}, {
    name: string;
    id: string;
    createdAt: string;
    key: string;
    priceMinor: number;
    currency: string;
    period: "MONTH" | "YEAR";
    active: boolean;
}>;
export type SubscriptionPlan = z.infer<typeof SubscriptionPlanSchema>;
export declare const SubscriptionSchema: z.ZodObject<{
    id: z.ZodString;
    userId: z.ZodString;
    planId: z.ZodString;
    plan: z.ZodObject<{
        id: z.ZodString;
        key: z.ZodString;
        name: z.ZodString;
        priceMinor: z.ZodNumber;
        currency: z.ZodString;
        period: z.ZodEnum<["MONTH", "YEAR"]>;
        active: z.ZodBoolean;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    }, {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    }>;
    status: z.ZodEnum<["PENDING", "ACTIVE", "GRACE", "CANCELLED", "EXPIRED"]>;
    currentPeriodStart: z.ZodNullable<z.ZodString>;
    currentPeriodEnd: z.ZodNullable<z.ZodString>;
    cancelAtPeriodEnd: z.ZodBoolean;
    createdAt: z.ZodString;
    updatedAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    planId: string;
    plan: {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    };
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}, {
    status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
    id: string;
    createdAt: string;
    updatedAt: string;
    userId: string;
    planId: string;
    plan: {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    };
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
}>;
export type Subscription = z.infer<typeof SubscriptionSchema>;
export declare const GetCurrentSubscriptionResponseSchema: z.ZodObject<{
    subscription: z.ZodNullable<z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        planId: z.ZodString;
        plan: z.ZodObject<{
            id: z.ZodString;
            key: z.ZodString;
            name: z.ZodString;
            priceMinor: z.ZodNumber;
            currency: z.ZodString;
            period: z.ZodEnum<["MONTH", "YEAR"]>;
            active: z.ZodBoolean;
            createdAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        }, {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        }>;
        status: z.ZodEnum<["PENDING", "ACTIVE", "GRACE", "CANCELLED", "EXPIRED"]>;
        currentPeriodStart: z.ZodNullable<z.ZodString>;
        currentPeriodEnd: z.ZodNullable<z.ZodString>;
        cancelAtPeriodEnd: z.ZodBoolean;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    }, {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    }>>;
}, "strip", z.ZodTypeAny, {
    subscription: {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    } | null;
}, {
    subscription: {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    } | null;
}>;
export type GetCurrentSubscriptionResponse = z.infer<typeof GetCurrentSubscriptionResponseSchema>;
export declare const InvoiceSchema: z.ZodObject<{
    id: z.ZodString;
    paymentId: z.ZodString;
    number: z.ZodString;
    issuedAt: z.ZodString;
    amountMinor: z.ZodNumber;
    currency: z.ZodString;
    status: z.ZodEnum<["PENDING", "PAID", "CANCELLED"]>;
}, "strip", z.ZodTypeAny, {
    number: string;
    status: "PENDING" | "CANCELLED" | "PAID";
    id: string;
    paymentId: string;
    currency: string;
    issuedAt: string;
    amountMinor: number;
}, {
    number: string;
    status: "PENDING" | "CANCELLED" | "PAID";
    id: string;
    paymentId: string;
    currency: string;
    issuedAt: string;
    amountMinor: number;
}>;
export type Invoice = z.infer<typeof InvoiceSchema>;
export declare const GetInvoicesResponseSchema: z.ZodObject<{
    invoices: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        paymentId: z.ZodString;
        number: z.ZodString;
        issuedAt: z.ZodString;
        amountMinor: z.ZodNumber;
        currency: z.ZodString;
        status: z.ZodEnum<["PENDING", "PAID", "CANCELLED"]>;
    }, "strip", z.ZodTypeAny, {
        number: string;
        status: "PENDING" | "CANCELLED" | "PAID";
        id: string;
        paymentId: string;
        currency: string;
        issuedAt: string;
        amountMinor: number;
    }, {
        number: string;
        status: "PENDING" | "CANCELLED" | "PAID";
        id: string;
        paymentId: string;
        currency: string;
        issuedAt: string;
        amountMinor: number;
    }>, "many">;
    total: z.ZodNumber;
    skip: z.ZodNumber;
    take: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    total: number;
    skip: number;
    take: number;
    invoices: {
        number: string;
        status: "PENDING" | "CANCELLED" | "PAID";
        id: string;
        paymentId: string;
        currency: string;
        issuedAt: string;
        amountMinor: number;
    }[];
}, {
    total: number;
    skip: number;
    take: number;
    invoices: {
        number: string;
        status: "PENDING" | "CANCELLED" | "PAID";
        id: string;
        paymentId: string;
        currency: string;
        issuedAt: string;
        amountMinor: number;
    }[];
}>;
export type GetInvoicesResponse = z.infer<typeof GetInvoicesResponseSchema>;
export declare const ListPlansResponseSchema: z.ZodObject<{
    plans: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        key: z.ZodString;
        name: z.ZodString;
        priceMinor: z.ZodNumber;
        currency: z.ZodString;
        period: z.ZodEnum<["MONTH", "YEAR"]>;
        active: z.ZodBoolean;
        createdAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    }, {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    }>, "many">;
    total: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    total: number;
    plans: {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    }[];
}, {
    total: number;
    plans: {
        name: string;
        id: string;
        createdAt: string;
        key: string;
        priceMinor: number;
        currency: string;
        period: "MONTH" | "YEAR";
        active: boolean;
    }[];
}>;
export type ListPlansResponse = z.infer<typeof ListPlansResponseSchema>;
export declare const CancelSubscriptionRequestSchema: z.ZodObject<{
    subscriptionId: z.ZodString;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    subscriptionId: string;
    reason?: string | undefined;
}, {
    subscriptionId: string;
    reason?: string | undefined;
}>;
export type CancelSubscriptionRequest = z.infer<typeof CancelSubscriptionRequestSchema>;
export declare const CancelSubscriptionResponseSchema: z.ZodObject<{
    subscription: z.ZodObject<{
        id: z.ZodString;
        userId: z.ZodString;
        planId: z.ZodString;
        plan: z.ZodObject<{
            id: z.ZodString;
            key: z.ZodString;
            name: z.ZodString;
            priceMinor: z.ZodNumber;
            currency: z.ZodString;
            period: z.ZodEnum<["MONTH", "YEAR"]>;
            active: z.ZodBoolean;
            createdAt: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        }, {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        }>;
        status: z.ZodEnum<["PENDING", "ACTIVE", "GRACE", "CANCELLED", "EXPIRED"]>;
        currentPeriodStart: z.ZodNullable<z.ZodString>;
        currentPeriodEnd: z.ZodNullable<z.ZodString>;
        cancelAtPeriodEnd: z.ZodBoolean;
        createdAt: z.ZodString;
        updatedAt: z.ZodString;
    }, "strip", z.ZodTypeAny, {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    }, {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    }>;
    cancelAt: z.ZodString;
}, "strip", z.ZodTypeAny, {
    subscription: {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    };
    cancelAt: string;
}, {
    subscription: {
        status: "ACTIVE" | "PENDING" | "GRACE" | "CANCELLED" | "EXPIRED";
        id: string;
        createdAt: string;
        updatedAt: string;
        userId: string;
        planId: string;
        plan: {
            name: string;
            id: string;
            createdAt: string;
            key: string;
            priceMinor: number;
            currency: string;
            period: "MONTH" | "YEAR";
            active: boolean;
        };
        currentPeriodStart: string | null;
        currentPeriodEnd: string | null;
        cancelAtPeriodEnd: boolean;
    };
    cancelAt: string;
}>;
export type CancelSubscriptionResponse = z.infer<typeof CancelSubscriptionResponseSchema>;
export declare const CheckEntitlementsResponseSchema: z.ZodObject<{
    hostCanCreate: z.ZodBoolean;
    maxActiveRooms: z.ZodNumber;
    maxTeamsPerRoom: z.ZodNumber;
    maxSpectatorsPerRoom: z.ZodNumber;
    maxRoomDurationMinutes: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    maxActiveRooms: number;
    maxTeamsPerRoom: number;
    maxSpectatorsPerRoom: number;
    maxRoomDurationMinutes: number;
    hostCanCreate: boolean;
}, {
    maxActiveRooms: number;
    maxTeamsPerRoom: number;
    maxSpectatorsPerRoom: number;
    maxRoomDurationMinutes: number;
    hostCanCreate: boolean;
}>;
export type CheckEntitlementsResponse = z.infer<typeof CheckEntitlementsResponseSchema>;
export declare const PaymentStatusSchema: z.ZodEnum<["PENDING", "PAID", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]>;
export type PaymentStatus = z.infer<typeof PaymentStatusSchema>;
export declare const PaymentSchema: z.ZodObject<{
    id: z.ZodString;
    amountMinor: z.ZodNumber;
    currency: z.ZodString;
    status: z.ZodEnum<["PENDING", "PAID", "FAILED", "CANCELLED", "PARTIALLY_REFUNDED", "REFUNDED"]>;
    createdAt: z.ZodString;
    paidAt: z.ZodNullable<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    status: "FAILED" | "PENDING" | "CANCELLED" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
    id: string;
    createdAt: string;
    currency: string;
    amountMinor: number;
    paidAt: string | null;
}, {
    status: "FAILED" | "PENDING" | "CANCELLED" | "PAID" | "PARTIALLY_REFUNDED" | "REFUNDED";
    id: string;
    createdAt: string;
    currency: string;
    amountMinor: number;
    paidAt: string | null;
}>;
export type Payment = z.infer<typeof PaymentSchema>;
