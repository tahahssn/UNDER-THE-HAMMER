/**
 * Subscription contract types.
 * Used for API responses and cross-module communication.
 */

/** Subscription plan detail */
export interface SubscriptionPlanDto {
  id: string;
  key: string;
  name: string;
  priceMinor: bigint; // Integer in minor units (e.g., paisa for PKR)
  currency: string;
  period: 'MONTHLY' | 'ANNUAL' | 'LIFETIME';
  active: boolean;
  createdAt: string;
}

/** Entitlement check response */
export interface EntitlementCheckDto {
  hostCanCreate: boolean;
  maxActiveRooms: number;
  maxTeamsPerRoom: number;
  maxSpectatorsPerRoom: number;
  maxRoomDurationMinutes: number;
}

/** Subscription detail for user */
export interface SubscriptionDto {
  id: string;
  userId: string;
  planId: string;
  plan: SubscriptionPlanDto;
  status: 'PENDING' | 'ACTIVE' | 'GRACE' | 'CANCELLED' | 'EXPIRED';
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  createdAt: string;
  updatedAt: string;
}

/** List of available subscription plans (public) */
export interface SubscriptionPlanListResponse {
  plans: SubscriptionPlanDto[];
  total: number;
}

/** List of user's subscriptions */
export interface SubscriptionListResponse {
  subscriptions: SubscriptionDto[];
  total: number;
  hasMore: boolean;
}
