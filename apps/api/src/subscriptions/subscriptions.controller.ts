import {
  Controller,
  Get,
  Param,
  UseGuards,
  Request,
  VERSION_NEUTRAL,
  HttpStatus,
  ForbiddenException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { SubscriptionsService } from './subscriptions.service';
import type { JwtPayload } from '../auth/jwt.strategy';

@ApiTags('subscriptions')
@Controller({ path: 'subscription', version: VERSION_NEUTRAL })
export class SubscriptionsController {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  /**
   * Get all active subscription plans (public)
   * GET /api/subscription-plans
   */
  @Get('plans')
  async listPlans() {
    return this.subscriptionsService.listPlans();
  }

  /**
   * Get current user's subscription (authenticated)
   * GET /api/subscription
   */
  @Get()
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getUserSubscription(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.getUserSubscription(user.sub);
  }

  /**
   * Check subscription entitlements for the current user (authenticated)
   * GET /api/subscription/entitlements
   */
  @Get('entitlements')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async checkEntitlements(@CurrentUser() user: JwtPayload) {
    return this.subscriptionsService.checkEntitlements(user.sub);
  }

  /**
   * Check if user can host (administrative, requires admin role)
   * GET /api/subscription/admin/:userId/can-host
   */
  @Get('admin/:userId/can-host')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async canUserHost(@Param('userId') userId: string, @CurrentUser() user: JwtPayload) {
    // TODO: Check admin role here when admin module is implemented
    // For now, we just prevent users from checking others' status
    if (user.sub !== userId) {
      throw new ForbiddenException('You can only check your own subscription status');
    }

    const canHost = await this.subscriptionsService.canUserHost(userId);
    return { canHost };
  }
}
