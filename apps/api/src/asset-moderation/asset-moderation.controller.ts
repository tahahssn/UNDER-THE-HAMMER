import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Request,
  UseGuards,
  VERSION_NEUTRAL,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { JwtGuard } from '../auth/jwt.guard';
import type { JwtPayload } from '../auth/jwt.strategy';
import { AssetModerationService } from './asset-moderation.service';

const reportFileSchema = z.object({
  reason: z.string().min(1).max(100),
  complaintText: z.string().max(1000).optional(),
  complainantEmail: z.string().email().optional(),
});

const resolveCaseSchema = z.object({
  status: z.enum(['OPEN', 'ACTION_TAKEN', 'DISMISSED']),
  outcome: z.string().max(500).optional(),
  action: z.enum(['DISABLE_ASSET', 'DISMISS']).optional(),
});

type ReportFileDto = z.infer<typeof reportFileSchema>;
type ResolveCaseDto = z.infer<typeof resolveCaseSchema>;

@ApiTags('moderation')
@Controller({ path: 'files', version: VERSION_NEUTRAL })
export class AssetModerationController {
  constructor(private readonly service: AssetModerationService) {}

  /**
   * Report a file (public, rate-limited)
   * POST /api/files/:id/report
   */
  @Post(':id/report')
  @HttpCode(201)
  async reportFile(
    @Param('id') assetId: string,
    @Body(new ZodValidationPipe(reportFileSchema)) dto: ReportFileDto,
  ) {
    return this.service.createModerationCase(assetId, dto);
  }
}

@ApiTags('moderation')
@Controller({ path: 'admin/moderation', version: VERSION_NEUTRAL })
export class AssetModerationAdminController {
  constructor(private readonly service: AssetModerationService) {}

  /**
   * List moderation cases (admin only)
   * GET /api/admin/moderation/cases
   */
  @Get('cases')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  async listCases(
    @Query('status') status?: string,
    @Query('skip') skip?: string,
    @Query('take') take?: string,
  ) {
    const skipNum = parseInt(skip ?? '0', 10);
    const takeNum = parseInt(take ?? '20', 10);

    return this.service.listCases({ status }, skipNum, takeNum);
  }

  /**
   * Resolve moderation case (admin only)
   * PATCH /api/admin/moderation/cases/:id
   */
  @Patch('cases/:id')
  @UseGuards(JwtGuard)
  @ApiBearerAuth()
  @HttpCode(200)
  async resolveCase(
    @Param('id') caseId: string,
    @Body(new ZodValidationPipe(resolveCaseSchema)) dto: ResolveCaseDto,
    @Request() req: { user: JwtPayload },
  ) {
    return this.service.resolveCase(caseId, dto, req.user.sub);
  }
}
