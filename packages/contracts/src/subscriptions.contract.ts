/**
 * Subscription and billing contracts.
 * Host subscriptions are required to create and host auction rooms.
 * Subscription entitlements define per-host limits and capabilities.
 */

export interface SubscriptionPlanDto {
  id: string;
  key: string;
  name: string;
  priceMinor: bigint;
  currency: string;
  period: "MONTH" | "YEAR";
  active: boolean;
  createdAt: string;
}

export interface SubscriptionEntitlementDto {
  id: string;
  planId: string;
  key: string;
  intValue?: number;
  boolValue?: boolean;
}

export interface SubscriptionPlanDetailDto extends SubscriptionPlanDto {
  entitlements: SubscriptionEntitlementDto[];
}

export interface SubscriptionDto {
  id: string;
  userId: string;
  planId: string;
  status: "PENDING" | "ACTIVE" | "GRACE" | "CANCELLED" | "EXPIRED";
  currentPeriodStart?: string;
  currentPeriodEnd?: string;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SubscriptionDetailDto extends SubscriptionDto {
  plan: SubscriptionPlanDto;
}

export interface EntitlementCheckDto {
  subscriptionId: string;
  userId: string;
  planId: string;
  status: string;
  entitlements: Record<string, number | boolean | null>;
}

export interface SubscriptionListResponse {
  subscriptions: SubscriptionDetailDto[];
  total: number;
  hasMore: boolean;
}
