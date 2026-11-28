import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ExecutionContext } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * JWT authentication guard.
 * Extends default AuthGuard to resolve Cognito subject to internal User.id.
 * Attaches both request.user (JWT payload) and request.userId (internal User.id).
 *
 * Use on controllers/routes that require a valid JWT:
 *
 * Example:
 * @UseGuards(JwtGuard)
 * @Get('profile')
 * getProfile(@CurrentUser() userId: string) { return userId; }
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    // First, validate the JWT using passport
    const isValid = (await super.canActivate(ctx)) as boolean;
    if (!isValid) {
      return false;
    }

    // Now resolve the Cognito subject to internal User.id
    const request = ctx.switchToHttp().getRequest();
    const jwtPayload = request.user;

    if (!jwtPayload || !jwtPayload.sub) {
      return false;
    }

    try {
      // Look up the internal User.id by the Cognito subject
      const userIdentity = await this.prisma.userIdentity.findUnique({
        where: {
          provider_subject: {
            provider: 'COGNITO_PASSWORD',
            subject: jwtPayload.sub,
          },
        },
        select: { userId: true },
      });

      if (!userIdentity) {
        // Subject not found in database - user may not be fully registered
        return false;
      }

      // Attach the resolved User.id to the request
      request.userId = userIdentity.userId;
    } catch (error) {
      // Log error but don't expose details
      console.error('Failed to resolve user ID from Cognito subject', error);
      return false;
    }

    return true;
  }
}

