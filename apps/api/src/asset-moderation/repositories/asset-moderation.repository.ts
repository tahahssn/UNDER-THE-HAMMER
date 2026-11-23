import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class AssetModerationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.assetModerationCase.findUnique({
      where: { id },
      include: { asset: true, resolvedBy: { select: { profile: { select: { displayName: true } } } } },
    });
  }

  async findByAssetId(assetId: string) {
    return this.prisma.assetModerationCase.findMany({
      where: { assetId },
      include: { asset: true, resolvedBy: { select: { profile: { select: { displayName: true } } } } },
    });
  }

  async listCases(filters: { status?: string }, skip: number, take: number) {
    const where: any = {};

    if (filters.status) {
      where.status = filters.status;
    }

    const [items, total] = await Promise.all([
      this.prisma.assetModerationCase.findMany({
        where,
        include: { asset: true, resolvedBy: { select: { profile: { select: { displayName: true } } } } },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.assetModerationCase.count({ where }),
    ]);

    return { items, total };
  }

  async create(data: {
    assetId: string;
    reason: string;
    complaintText?: string;
    complainantEmail?: string;
  }) {
    return this.prisma.assetModerationCase.create({
      data: {
        ...data,
        status: 'OPEN',
      },
      include: { asset: true },
    });
  }

  async updateStatus(id: string, status: string, outcome?: string, resolvedById?: string) {
    return this.prisma.assetModerationCase.update({
      where: { id },
      data: { status, outcome, resolvedById, resolvedAt: new Date() },
      include: { asset: true, resolvedBy: { select: { profile: { select: { displayName: true } } } } },
    });
  }
}
