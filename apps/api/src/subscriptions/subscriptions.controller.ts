import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  VERSION_NEUTRAL,
  HttpCode,
  HttpStatus,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags, ApiResponse } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import { SubscriptionsRepository } from './subscriptions.repository';
import type { JwtPayload } from '../auth/jwt.strategy';

/**
 * SubscriptionsController
 *
 * Manages subscription lifecycle:
 * - GET /v1/subscriptions/plans: List active plans (public, cached 5 min)
 * - GET /v1/subscriptions/current: Get user's active subscription
 * - GET /v1/subscriptions/entitlements: Get user's current entitlements
 * - GET /v1/subscriptions/invoices: List user's invoices (paginated)
 * - POST /v1/subscriptions/:id/cancel: Cancel subscription (sets cancelAtPeriodEnd flag)
 *
 * Authorization:
 * - plans: Public, no auth required
 * - current, entitlements, invoices, cancel: Requires JwtGuard
 * - Ownership enforced: user cannot view/cancel other users' subscriptions (403)
 */
@ApiTags('subscriptions')
@Controller({ path: 'v1/subscriptions', version: VERSION_NEUTRAL })
export class SubscriptionsController {
  private readonly logger = new Logger(SubscriptionsController.name);

  // Simple TTL cache for plans (5 minutes)
  private plansCache: { data: any; timestamp: number } | null = null;
  private readonly PLANS_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly subscriptionsService: SubscriptionsService,
    private readonly subscriptionsRepository: SubscriptionsRepository,
  ) {}

  /**
   * GET /v1/subscriptions/plans
   * Get all active subscription plans (public, cached)
   *
   * - No authentication required
   * - Response cached 5 minutes
   * - Returns: { plans: [], total: number }
   */
  @Get('plans')
  @ApiResponse({
    status: 200,
    description: 'List of active subscription plans',
    schema: {
      properties: {
        plans: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              key: { type: 'string' },
              name: { type: 'string' },
              priceMinor: { type: 'string', description: 'Price in paisa (integer)' },
              currency: { type: 'string' },
              period: { type: 'string', enum: ['MONTH', 'YEAR'] },
              active: { type: 'boolean' },
              createdAt: { type: 'string', format: 'date-time' },
            },
          },
        },
        total: { type: 'number' },
      },
    },
  })
  async listPlans() {
    // Check cache
    if (this.plansCache && Date.now() - this.plansCache.timestamp < this.PLANS_CACHE_TTL_MS) {
      this.logger.debug('Returning cached plans');
      return this.plansCache.data;
    }

    // Cache miss: fetch from service
    const result = await this.subscriptionsService.listPlans();

    // Store in cache
    this.plansCache = {
      data: result,
      timestamp: Date.now(),
    };

    return result;
  }

  /**
   * GET /v1/subscriptions/current
   * Get current user's active subscription
   *
   * - Requires: JWT authentication
   * - Returns: { subscription: Subscription | null }
   */
  @Get('current')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Current active subscription or null',
  })
  async getCurrentSubscription(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`Fetching current subscription for user ${user.sub}`);

    const subscription = await this.subscriptionsService.getActiveSubscription(user.sub);
    return { subscription };
  }

  /**
   * GET /v1/subscriptions/entitlements
   * Get current user's subscription entitlements
   *
   * - Requires: JWT authentication
   * - Returns: { hostCanCreate, maxActiveRooms, maxTeamsPerRoom, maxSpectatorsPerRoom, ... }
   * - If no active subscription: returns restrictive defaults
   */
  @Get('entitlements')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'User subscription entitlements',
    schema: {
      properties: {
        hostCanCreate: { type: 'boolean' },
        maxActiveRooms: { type: 'number' },
        maxTeamsPerRoom: { type: 'number' },
        maxSpectatorsPerRoom: { type: 'number' },
        maxRoomDurationMinutes: { type: 'number' },
      },
    },
  })
  async checkEntitlements(@CurrentUser() user: JwtPayload) {
    this.logger.debug(`Fetching entitlements for user ${user.sub}`);

    const entitlements = await this.subscriptionsService.checkEntitlements(user.sub);
    return entitlements;
  }

  /**
   * GET /v1/subscriptions/invoices?skip=0&take=10
   * Get paginated list of user's invoices
   *
   * - Requires: JWT authentication
   * - Params: skip (default 0), take (default 10)
   * - Returns: { items: Invoice[], total: number }
   */
  @Get('invoices')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @ApiResponse({
    status: 200,
    description: 'Paginated list of user invoices',
    schema: {
      properties: {
        items: {
          type: 'array',
          items: {
            properties: {
              id: { type: 'string', format: 'uuid' },
              number: { type: 'string' },
              issuedAt: { type: 'string', format: 'date-time' },
              payment: {
                properties: {
                  amountMinor: { type: 'string', description: 'Amount in paisa' },
                  currency: { type: 'string' },
                },
              },
            },
          },
        },
        total: { type: 'number' },
      },
    },
  })
  async listInvoices(
    @CurrentUser() user: JwtPayload,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = Math.max(0, parseInt(skip ?? '0', 10) || 0);
    const takeNum = Math.max(1, Math.min(100, parseInt(take ?? '10', 10) || 10));

    this.logger.debug(
      `Fetching invoices for user ${user.sub}: skip=${skipNum}, take=${takeNum}`,
    );

    const result = await this.subscriptionsService.getInvoices(user.sub, skipNum, takeNum);

    return {
      items: result.items.map((invoice: any) => ({
        id: invoice.id,
        number: invoice.number,
        issuedAt: invoice.issuedAt?.toISOString() || null,
        payment: invoice.payment
          ? {
              amountMinor: invoice.payment.amountMinor.toString(),
              currency: invoice.payment.currency,
              status: invoice.payment.status,
            }
          : null,
      })),
      total: result.total,
    };
  }

  /**
   * POST /v1/subscriptions/:id/cancel
   * Cancel a subscription (set cancelAtPeriodEnd flag)
   *
   * - Requires: JWT authentication
   * - Verifies ownership: user can only cancel their own subscription
   * - Returns: 204 No Content on success
   * - 403: If subscription belongs to different user
   * - 404: If subscription not found
   */
  @Post(':id/cancel')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiResponse({
    status: 204,
    description: 'Subscription cancelled',
  })
  async cancelSubscription(
    @Param('id') subscriptionId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    this.logger.log(`Cancel requested for subscription ${subscriptionId} by user ${user.sub}`);

    // 1. Fetch subscription and verify ownership
    const subscriptions = await this.subscriptionsRepository.getUserSubscriptions(user.sub, 0, 1000);
    const subscription = subscriptions.items.find((s: any) => s.id === subscriptionId);

    if (!subscription) {
      this.logger.warn(
        `Subscription ${subscriptionId} not found or belongs to different user`,
      );
      throw new ForbiddenException('Subscription not found or access denied');
    }

    // 2. Cancel subscription
    await this.subscriptionsService.cancelSubscription(user.sub, subscriptionId);

    this.logger.log(`Subscription ${subscriptionId} cancelled for user ${user.sub}`);
    // 204 returns no content
  }
}
