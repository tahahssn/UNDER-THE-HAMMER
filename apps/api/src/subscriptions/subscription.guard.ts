import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { SubscriptionsService } from './subscriptions.service';
import type { JwtPayload } from '../auth/jwt.strategy';

/**
 * Guard that checks if a user has an active subscription and can host.
 * Used on endpoints that require hosting entitlement.
 *
 * Example:
 * @UseGuards(JwtGuard, SubscriptionGuard)
 * @Post('rooms')
 * async createRoom(...) { }
 */
@Injectable()
export class SubscriptionGuard implements CanActivate {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user as JwtPayload;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const canHost = await this.subscriptionsService.canUserHost(user.sub);

    if (!canHost) {
      throw new ForbiddenException(
        'Active subscription required to host a room. Please upgrade your subscription.',
      );
    }

    return true;
  }
}
