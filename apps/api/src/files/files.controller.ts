import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Request,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { FilesService } from './files.service';

const uploadIntentSchema = z.object({
  kind: z.enum(['TEAM_LOGO', 'USER_AVATAR', 'EXPORT_IMAGE']),
  teamId: z.string().uuid().optional(),
  filename: z.string().max(100),
  fileSizeBytes: z.number().int().positive(),
  declaredMimeType: z.enum(['image/jpeg', 'image/jpg', 'image/png']),
});

const confirmUploadSchema = z.object({
  uploadId: z.string(),
  sha256Hash: z.string().regex(/^[a-f0-9]{64}$/i),
  actualMimeType: z.enum(['image/jpeg', 'image/jpg', 'image/png']),
});

type UploadIntentDto = z.infer<typeof uploadIntentSchema>;
type ConfirmUploadDto = z.infer<typeof confirmUploadSchema>;

@ApiTags('files')
@Controller({ path: 'files', version: VERSION_NEUTRAL })
export class FilesController {
  constructor(private readonly filesService: FilesService) {}

  /**
   * Request upload intent
   * POST /api/files/upload-intent
   */
  @Post('upload-intent')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.CREATED)
  async requestUploadIntent(
    @Body(new ZodValidationPipe(uploadIntentSchema)) dto: UploadIntentDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.filesService.requestUploadIntent(dto, req.user.sub);
  }

  /**
   * Confirm upload
   * POST /api/files/confirm-upload
   */
  @Post('confirm-upload')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async confirmUpload(
    @Body(new ZodValidationPipe(confirmUploadSchema)) dto: ConfirmUploadDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.filesService.confirmUpload(dto, req.user.sub);
  }

  /**
   * Get file metadata
   * GET /api/files/:id
   */
  @Get(':id')
  async getFile(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub;
    return this.filesService.getFile(id, userId);
  }

  /**
   * Get download URL
   * GET /api/files/:id/download-url
   */
  @Get(':id/download-url')
  async getDownloadUrl(@Param('id') id: string, @Request() req: any) {
    const userId = req.user?.sub;
    return this.filesService.getDownloadUrl(id, userId);
  }

  /**
   * Disable file
   * DELETE /api/files/:id
   */
  @Delete(':id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(204)
  async disableFile(@Param('id') id: string, @Request() req: { user: JwtPayload }) {
    await this.filesService.disableFile(id, req.user.sub);
  }
}
