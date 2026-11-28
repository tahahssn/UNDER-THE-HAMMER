import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from './jwt.strategy';

/**
 * Extracts the current authenticated user ID from the request.
 * The JwtGuard automatically resolves the JWT 'sub' (Cognito subject) to internal User.id.
 * This decorator returns that resolved User.id.
 *
 * Use on controller methods protected by @UseGuards(JwtGuard).
 *
 * @param fieldName - Optional: 'sub' to get the Cognito subject instead of User.id
 *
 * Example:
 * @Get('profile')
 * @UseGuards(JwtGuard)
 * getProfile(@CurrentUser() userId: string) { return userId; }
 */
export const CurrentUser = createParamDecorator((fieldName: string | undefined, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();

  // If fieldName is 'sub', return the Cognito subject from JWT payload
  if (fieldName === 'sub') {
    return (request.user as JwtPayload).sub;
  }

  // Otherwise, return the resolved internal User.id (attached by JwtGuard)
  return request.userId as string;
});
