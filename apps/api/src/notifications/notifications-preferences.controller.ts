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
import { ZodValidationPipe } from '@nestjs/common';
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
    // @CurrentUser() user: CurrentUserDto,
  ) {
    // TODO: Extract userId from JWT
    const userId = 'user-id-from-jwt'; // Placeholder

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
    // @CurrentUser() user: CurrentUserDto,
    @Param('category') category: string,
    @Body(new ZodValidationPipe(UpdatePreferenceRequestSchema))
    request: UpdatePreferenceRequest,
  ) {
    // TODO: Extract userId from JWT
    const userId = 'user-id-from-jwt'; // Placeholder

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
      if (error.message.includes('Unknown notification category')) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }
  }
}
