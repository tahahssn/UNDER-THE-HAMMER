import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Query,
} from '@nestjs/common';
import { NotificationService } from './services/notification.service';
import { NotificationDto } from './dto/notification.dto';

/**
 * REST API controller for notifications management.
 * All endpoints require JwtGuard authentication.
 */
@Controller('v1/notifications')
export class NotificationsController {
  constructor(private notificationService: NotificationService) {}

  /**
   * GET /v1/notifications?page=1&limit=20&category=BID_WON
   * Get paginated list of notifications for authenticated user.
   */
  @Get()
  async getNotifications(
    // @CurrentUser() user: CurrentUserDto,  // Requires JwtGuard decorator
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('category') category?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

    // TODO: Extract userId from JWT claim via @CurrentUser() decorator
    const userId = 'user-id-from-jwt'; // Placeholder

    let result;
    if (category) {
      result = await this.notificationService.getNotificationsByCategory(
        userId,
        category,
        pageNum,
        limitNum,
      );
    } else {
      result = await this.notificationService.getNotifications(
        userId,
        pageNum,
        limitNum,
      );
    }

    return {
      data: result.data.map((n) => NotificationDto.fromPrisma(n)),
      pagination: result.pagination,
    };
  }

  /**
   * POST /v1/notifications/:id/mark-read
   * Mark a single notification as read.
   * Idempotent: succeeds if already read.
   */
  @Post(':id/mark-read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markNotificationAsRead(
    // @CurrentUser() user: CurrentUserDto,
    @Param('id') notificationId: string,
  ): Promise<void> {
    // TODO: Extract userId from JWT
    const userId = 'user-id-from-jwt'; // Placeholder

    try {
      await this.notificationService.markNotificationAsRead(
        notificationId,
        userId,
      );
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundException('Notification not found');
      }
      if (error.message.includes('access denied')) {
        throw new ForbiddenException('Access denied');
      }
      throw error;
    }
  }

  /**
   * POST /v1/notifications/mark-all-read
   * Mark all unread notifications as read for authenticated user.
   */
  @Post('mark-all-read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllAsRead(
    // @CurrentUser() user: CurrentUserDto,
  ): Promise<void> {
    // TODO: Extract userId from JWT
    const userId = 'user-id-from-jwt'; // Placeholder

    await this.notificationService.markAllAsRead(userId);
  }

  /**
   * DELETE /v1/notifications/:id
   * Hard-delete a notification.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNotification(
    // @CurrentUser() user: CurrentUserDto,
    @Param('id') notificationId: string,
  ): Promise<void> {
    // TODO: Extract userId from JWT
    const userId = 'user-id-from-jwt'; // Placeholder

    try {
      await this.notificationService.deleteNotification(notificationId, userId);
    } catch (error) {
      if (error.message.includes('not found')) {
        throw new NotFoundException('Notification not found');
      }
      if (error.message.includes('access denied')) {
        throw new ForbiddenException('Access denied');
      }
      throw error;
    }
  }
}
