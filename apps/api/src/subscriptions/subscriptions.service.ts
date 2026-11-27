import { Injectable } from '@nestjs/common';
import { SubscriptionsRepository } from './subscriptions.repository';

/**
 * Manages subscription entitlements and host eligibility checks.
 * Backend authority: subscription state is authoritative.
 * No client-supplied values are trusted for entitlements.
 */
@Injectable()
export class SubscriptionsService {
  constructor(private readonly repo: SubscriptionsRepository) {}

  /**
   * Check if a user can host a room.
   * Returns true only if user has an active subscription with hostingEnabled entitlement.
   */
  async canUserHost(userId: string): Promise<boolean> {
    const subscription = await this.repo.getUserActiveSubscription(userId);

    if (!subscription) {
      return false;
    }

    // Check hostingEnabled entitlement (default to false if not present)
    const hostingEnabled = subscription.plan.entitlements.find((e) => e.key === 'hostingEnabled');
    return hostingEnabled?.boolValue ?? false;
  }

  /**
   * Get room capacity limits for a user's subscription.
   * Returns safe defaults if user has no active subscription.
   */
  async getRoomLimits(userId: string) {
    const subscription = await this.repo.getUserActiveSubscription(userId);

    if (!subscription) {
      // No subscription: user cannot host, return restrictive defaults
      return {
        maxActiveRooms: 0,
        maxTeamsPerRoom: 0,
        maxSpectatorsPerRoom: 0,
      };
    }

    const entitlements = subscription.plan.entitlements;

    return {
      maxActiveRooms: this.getEntitlementInt(entitlements, 'maxActiveRooms', 0),
      maxTeamsPerRoom: this.getEntitlementInt(entitlements, 'maxTeamsPerRoom', 0),
      maxSpectatorsPerRoom: this.getEntitlementInt(entitlements, 'maxSpectatorsPerRoom', 0),
    };
  }

  /**
   * Check all entitlements for a user's subscription.
   * Used to validate room configuration before creation.
   */
  async checkEntitlements(userId: string) {
    const subscription = await this.repo.getUserActiveSubscription(userId);

    if (!subscription) {
      return {
        hostCanCreate: false,
        maxActiveRooms: 0,
        maxTeamsPerRoom: 0,
        maxSpectatorsPerRoom: 0,
        maxRoomDurationMinutes: 0,
      };
    }

    const entitlements = subscription.plan.entitlements;

    return {
      hostCanCreate: this.getEntitlementBool(entitlements, 'hostingEnabled', false),
      maxActiveRooms: this.getEntitlementInt(entitlements, 'maxActiveRooms', 0),
      maxTeamsPerRoom: this.getEntitlementInt(entitlements, 'maxTeamsPerRoom', 16),
      maxSpectatorsPerRoom: this.getEntitlementInt(entitlements, 'maxSpectatorsPerRoom', 100),
      maxRoomDurationMinutes: this.getEntitlementInt(entitlements, 'maxRoomDurationMinutes', 480),
    };
  }

  /**
   * Format subscription for API response.
   */
  formatSubscription(sub: any) {
    return {
      id: sub.id,
      userId: sub.userId,
      planId: sub.planId,
      plan: {
        id: sub.plan.id,
        key: sub.plan.key,
        name: sub.plan.name,
        priceMinor: sub.plan.priceMinor,
        currency: sub.plan.currency,
        period: sub.plan.period,
        active: sub.plan.active,
        createdAt: sub.plan.createdAt.toISOString(),
      },
      status: sub.status,
      currentPeriodStart: sub.currentPeriodStart?.toISOString() || null,
      currentPeriodEnd: sub.currentPeriodEnd?.toISOString() || null,
      cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
      createdAt: sub.createdAt.toISOString(),
      updatedAt: sub.updatedAt.toISOString(),
    };
  }

  /**
   * Format subscription plan for API response.
   */
  formatPlan(plan: any) {
    return {
      id: plan.id,
      key: plan.key,
      name: plan.name,
      priceMinor: plan.priceMinor,
      currency: plan.currency,
      period: plan.period,
      active: plan.active,
      createdAt: plan.createdAt.toISOString(),
    };
  }

  /**
   * List all active plans
   */
  async listPlans() {
    const plans = await this.repo.getActivePlans();
    return {
      plans: plans.map((p) => this.formatPlan(p)),
      total: plans.length,
    };
  }

  /**
   * Get user's current active subscription
   */
  async getUserSubscription(userId: string) {
    const subscription = await this.repo.getUserActiveSubscription(userId);
    return {
      subscription: subscription ? this.formatSubscription(subscription) : null,
    };
  }

  /**
   * Helper: get integer entitlement value
   */
  private getEntitlementInt(entitlements: any[], key: string, defaultValue: number): number {
    const e = entitlements.find((x) => x.key === key);
    return e?.intValue ?? defaultValue;
  }

  /**
   * Helper: get boolean entitlement value
   */
  private getEntitlementBool(entitlements: any[], key: string, defaultValue: boolean): boolean {
    const e = entitlements.find((x) => x.key === key);
    return e?.boolValue ?? defaultValue;
  }

  /**
   * Get active subscription for a user
   */
  async getActiveSubscription(userId: string) {
    const subscription = await this.repo.getUserActiveSubscription(userId);
    return subscription ? this.formatSubscription(subscription) : null;
  }

  /**
   * Cancel a subscription (set cancelAtPeriodEnd flag)
   */
  async cancelSubscription(userId: string, subscriptionId: string) {
    // Verify ownership
    const subscription = await this.repo.getUserSubscriptions(userId, 0, 1);
    const sub = subscription.items.find((s) => s.id === subscriptionId);

    if (!sub) {
      throw new Error('Subscription not found');
    }

    // Update to set cancelAtPeriodEnd flag
    const updated = await this.repo.updateSubscriptionCancelAtPeriodEnd(subscriptionId, true);
    return this.formatSubscription(updated);
  }

  /**
   * Get invoices for a user with pagination
   */
  async getInvoices(userId: string, skip: number = 0, take: number = 20) {
    return this.repo.getUserInvoices(userId, skip, take);
  }
}
