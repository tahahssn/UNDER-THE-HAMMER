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
import { JwtGuard } from '../auth/jwt.guard';
import { CurrentUser } from '../auth/current-user.decorator';
import { NotificationService } from './services/notification.service';
import { NotificationDto } from './dto/notification.dto';

/**
 * REST API controller for notifications management.
 * All endpoints require JwtGuard authentication.
 */
@Controller('v1/notifications')
@UseGuards(JwtGuard)
export class NotificationsController {
  constructor(private notificationService: NotificationService) {}

  /**
   * GET /v1/notifications?page=1&limit=20&category=BID_WON
   * Get paginated list of notifications for authenticated user.
   */
  @Get()
  async getNotifications(
    @CurrentUser('sub') userId: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '20',
    @Query('category') category?: string,
  ) {
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));

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
      data: result.data.map((n: any) => NotificationDto.fromPrisma(n)),
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
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ): Promise<void> {
    try {
      await this.notificationService.markNotificationAsRead(
        notificationId,
        userId,
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundException('Notification not found');
      }
      if (error instanceof Error && error.message.includes('access denied')) {
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
    @CurrentUser('sub') userId: string,
  ): Promise<void> {
    await this.notificationService.markAllAsRead(userId);
  }

  /**
   * DELETE /v1/notifications/:id
   * Hard-delete a notification.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteNotification(
    @CurrentUser('sub') userId: string,
    @Param('id') notificationId: string,
  ): Promise<void> {
    try {
      await this.notificationService.deleteNotification(notificationId, userId);
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        throw new NotFoundException('Notification not found');
      }
      if (error instanceof Error && error.message.includes('access denied')) {
        throw new ForbiddenException('Access denied');
      }
      throw error;
    }
  }
}
