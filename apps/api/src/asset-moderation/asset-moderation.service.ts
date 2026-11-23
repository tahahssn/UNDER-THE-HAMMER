import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { AssetModerationRepository } from './repositories/asset-moderation.repository';
import { FilesService } from '../files/files.service';

@Injectable()
export class AssetModerationService {
  constructor(
    private readonly repo: AssetModerationRepository,
    private readonly filesService: FilesService,
  ) {}

  /**
   * Create a moderation case for a file
   */
  async createModerationCase(assetId: string, input: {
    reason: string;
    complaintText?: string;
    complainantEmail?: string;
  }) {
    return this.repo.create({
      assetId,
      reason: input.reason,
      complaintText: input.complaintText,
      complainantEmail: input.complainantEmail,
    });
  }

  /**
   * List moderation cases
   */
  async listCases(filters: { status?: string }, skip: number, take: number) {
    const { items, total } = await this.repo.listCases(filters, skip, take);

    return {
      cases: items.map((c) => this.formatCase(c)),
      total,
      hasMore: skip + take < total,
    };
  }

  /**
   * Resolve a moderation case
   */
  async resolveCase(
    caseId: string,
    input: {
      status: string;
      outcome?: string;
      action?: 'DISABLE_ASSET' | 'DISMISS';
    },
    userId: string,
  ) {
    const caseRecord = await this.repo.findById(caseId);

    if (!caseRecord) {
      throw new NotFoundException('Moderation case not found');
    }

    // Handle action
    if (input.action === 'DISABLE_ASSET') {
      await this.filesService.disableFile(caseRecord.assetId, userId, input.outcome);
    }

    const updated = await this.repo.updateStatus(caseId, input.status, input.outcome, userId);

    return this.formatCase(updated);
  }

  /**
   * Format case for response
   */
  private formatCase(caseRecord: any) {
    return {
      id: caseRecord.id,
      assetId: caseRecord.assetId,
      reason: caseRecord.reason,
      complaintText: caseRecord.complaintText,
      complainantEmail: caseRecord.complainantEmail,
      status: caseRecord.status,
      outcome: caseRecord.outcome,
      resolvedBy: caseRecord.resolvedBy
        ? { displayName: caseRecord.resolvedBy.profile?.displayName }
        : null,
      createdAt: caseRecord.createdAt.toISOString(),
      resolvedAt: caseRecord.resolvedAt?.toISOString() ?? null,
    };
  }
}
