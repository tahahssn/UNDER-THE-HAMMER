import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * JWT authentication guard.
 * Use on controllers/routes that require a valid JWT.
 *
 * Example:
 * @UseGuards(JwtGuard)
 * @Get('profile')
 * getProfile(@Request() req) { return req.user; }
 */
@Injectable()
export class JwtGuard extends AuthGuard('jwt') {}
