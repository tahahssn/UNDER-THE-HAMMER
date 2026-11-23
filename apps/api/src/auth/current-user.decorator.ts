import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './jwt.strategy';

/**
 * Extracts the current authenticated user from the request.
 * Use on controller methods protected by @UseGuards(JwtGuard).
 *
 * Example:
 * @Get('profile')
 * @UseGuards(JwtGuard)
 * getProfile(@CurrentUser() user: JwtPayload) { return user; }
 */
export const CurrentUser = createParamDecorator((_, ctx: ExecutionContext): JwtPayload => {
  const request = ctx.switchToHttp().getRequest();
  return request.user;
});
