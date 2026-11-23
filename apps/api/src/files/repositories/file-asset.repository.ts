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
}
