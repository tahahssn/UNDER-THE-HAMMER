import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
  VERSION_NEUTRAL,
  HttpCode,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { UsersService } from './users.service';

const updateProfileSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  locale: z.string().length(2).optional(),
  timezone: z.string().optional(),
  countryCode: z.string().length(2).optional(),
});
type UpdateProfileDto = z.infer<typeof updateProfileSchema>;

const setUsernameSchema = z.object({
  username: z.string().min(3).max(20).regex(/^[a-zA-Z0-9_]+$/),
});
type SetUsernameDto = z.infer<typeof setUsernameSchema>;

@ApiTags('users')
@Controller({ path: 'users', version: VERSION_NEUTRAL })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * Get current authenticated user's profile.
   */
  @Get('me')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getMe(@Request() req: { user: JwtPayload }) {
    const user = await this.users.getUserByCognitoSubject(req.user.sub);
    return { id: user.id, email: user.email, status: user.status, profile: user.profile };
  }

  /**
   * Update current user's profile.
   */
  @Patch('me/profile')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async updateProfile(
    @Request() req: { user: JwtPayload },
    @Body(new ZodValidationPipe(updateProfileSchema)) dto: UpdateProfileDto,
  ) {
    const user = await this.users.getUserByCognitoSubject(req.user.sub);
    const profile = await this.users.updateProfile(user.id, dto);
    return profile;
  }

  /**
   * Check if username is available.
   */
  @Get('check-username/:username')
  async checkUsername(@Request() req: { params?: { username?: string } }) {
    const { username } = req.params ?? {};
    if (!username) {
      return { available: false };
    }

    const available = await this.users.isUsernameAvailable(username);
    return { username, available };
  }

  /**
   * Set username for current user.
   */
  @Patch('me/username')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async setUsername(
    @Request() req: { user: JwtPayload },
    @Body(new ZodValidationPipe(setUsernameSchema)) dto: SetUsernameDto,
  ) {
    const user = await this.users.getUserByCognitoSubject(req.user.sub);
    return this.users.setUsername(user.id, dto.username);
  }

  /**
   * Get current user's linked identities (Cognito, Google, etc.).
   */
  @Get('me/identities')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async getIdentities(@Request() req: { user: JwtPayload }) {
    const user = await this.users.getUserByCognitoSubject(req.user.sub);
    return this.users.getIdentities(user.id);
  }
}
