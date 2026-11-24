import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SubscriptionsRepository {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Get all active subscription plans
   */
  async getActivePlans() {
    return this.prisma.subscriptionPlan.findMany({
      where: { active: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Get a subscription plan by ID
   */
  async getPlanById(planId: string) {
    return this.prisma.subscriptionPlan.findUnique({
      where: { id: planId },
    });
  }

  /**
   * Get user's active subscription
   */
  async getUserActiveSubscription(userId: string) {
    return this.prisma.subscription.findFirst({
      where: {
        userId,
        status: { in: ['ACTIVE', 'GRACE'] },
      },
      include: {
        plan: {
          include: {
            entitlements: true,
          },
        },
      },
      orderBy: { currentPeriodEnd: 'desc' },
    });
  }

  /**
   * Get all entitlements for a subscription plan
   */
  async getPlanEntitlements(planId: string) {
    return this.prisma.subscriptionEntitlement.findMany({
      where: { planId },
    });
  }

  /**
   * Get a user's subscriptions
   */
  async getUserSubscriptions(userId: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.subscription.findMany({
        where: { userId },
        include: {
          plan: {
            include: {
              entitlements: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.subscription.count({ where: { userId } }),
    ]);

    return { items, total };
  }

  /**
   * Check if user has an active subscription
   */
  async hasActiveSubscription(userId: string): Promise<boolean> {
    const count = await this.prisma.subscription.count({
      where: {
        userId,
        status: { in: ['ACTIVE', 'GRACE'] },
      },
    });
    return count > 0;
  }

  /**
   * Get entitlement value for a subscription plan
   */
  async getEntitlementValue(
    planId: string,
    key: string,
  ): Promise<{ intValue?: number; boolValue?: boolean } | null> {
    return this.prisma.subscriptionEntitlement.findUnique({
      where: {
        planId_key: { planId, key },
      },
      select: { intValue: true, boolValue: true },
    });
  }
}
