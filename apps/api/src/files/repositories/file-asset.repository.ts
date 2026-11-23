import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class FileAssetRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.fileAsset.findUnique({
      where: { id },
      include: { uploadedBy: { select: { profile: { select: { displayName: true } } } } },
    });
  }

  async findByBucketAndKey(bucket: string, objectKey: string) {
    return this.prisma.fileAsset.findUnique({
      where: { bucket_objectKey: { bucket, objectKey } },
    });
  }

  async create(data: {
    kind: string;
    objectKey: string;
    bucket: string;
    contentType?: string;
    uploadedById?: string;
  }) {
    return this.prisma.fileAsset.create({
      data: {
        ...data,
        status: 'PENDING_UPLOAD',
      },
      include: { uploadedBy: { select: { profile: { select: { displayName: true } } } } },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.fileAsset.update({
      where: { id },
      data: { status, updatedAt: new Date() },
    });
  }

  async markReady(
    id: string,
    data: {
      status?: string;
      contentType?: string;
      sizeBytes?: number;
      width?: number;
      height?: number;
      sha256?: string;
    },
  ) {
    return this.prisma.fileAsset.update({
      where: { id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  async disable(id: string, reason?: string) {
    return this.prisma.fileAsset.update({
      where: { id },
      data: { status: 'DISABLED', updatedAt: new Date() },
    });
  }

  async delete(id: string) {
    return this.prisma.fileAsset.update({
      where: { id },
      data: { status: 'DELETED', updatedAt: new Date() },
    });
  }

  /**
   * Clean up expired PENDING_UPLOAD records (older than 1 hour)
   * Called by scheduled job or on-demand to prevent accumulation
   */
  async cleanupExpiredPendingUploads(expiryMinutes: number = 60) {
    const expiryDate = new Date();
    expiryDate.setMinutes(expiryDate.getMinutes() - expiryMinutes);

    const expired = await this.prisma.fileAsset.findMany({
      where: {
        status: 'PENDING_UPLOAD',
        createdAt: { lt: expiryDate },
      },
    });

    // Mark expired uploads as REJECTED
    if (expired.length > 0) {
      await this.prisma.fileAsset.updateMany({
        where: {
          status: 'PENDING_UPLOAD',
          createdAt: { lt: expiryDate },
        },
        data: { status: 'REJECTED', updatedAt: new Date() },
      });
    }

    return expired.map((f) => f.id);
  }

  /**
   * Find orphaned PROCESSING uploads (no corresponding S3 object)
   * Used to clean up stale intermediate states
   */
  async findOrphanedProcessingUploads(olderThanMinutes: number = 30) {
    const cutoffTime = new Date();
    cutoffTime.setMinutes(cutoffTime.getMinutes() - olderThanMinutes);

    return this.prisma.fileAsset.findMany({
      where: {
        status: 'PROCESSING',
        updatedAt: { lt: cutoffTime },
      },
    });
  }
}
