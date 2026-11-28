import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { NotificationPreferencesService } from './services/notification-preferences.service';
import {
  UpdatePreferenceRequest,
  UpdatePreferenceRequestSchema,
} from './dto/notification-preference.dto';

/**
 * REST API controller for notification preferences management.
 * All endpoints require JwtGuard authentication.
 */
@Controller('v1/notifications/preferences')
@UseGuards(JwtGuard)
export class NotificationPreferencesController {
  constructor(
    private preferencesService: NotificationPreferencesService,
  ) {}

  /**
   * GET /v1/notifications/preferences
   * Get all notification preferences for authenticated user (with defaults).
   */
  @Get()
  async getUserPreferences(
    @CurrentUser('sub') userId: string,
  ) {
    const preferences = await this.preferencesService.getUserPreferences(userId);
    return {
      data: preferences,
    };
  }

  /**
   * POST /v1/notifications/preferences/:category
   * Update preferences for a specific notification category.
   *
   * Example request body:
   * {
   *   "channels": {
   *     "inApp": true,
   *     "email": false,
   *     "sms": true
   *   }
   * }
   */
  @Post(':category')
  @HttpCode(HttpStatus.OK)
  async updatePreferencesForCategory(
    @CurrentUser('sub') userId: string,
    @Param('category') category: string,
    @Body(new ZodValidationPipe(UpdatePreferenceRequestSchema))
    request: UpdatePreferenceRequest,
  ) {
    try {
      const preferences = await this.preferencesService.updatePreferencesForCategory(
        userId,
        category,
        request.channels,
      );
      return {
        data: preferences,
      };
    } catch (error) {
      if (error instanceof Error && error.message.includes('Unknown notification category')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
