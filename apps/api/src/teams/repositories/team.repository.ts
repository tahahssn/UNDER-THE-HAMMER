import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string) {
    return this.prisma.team.findUnique({
      where: { id },
      include: {
        createdBy: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        currentLogo: true,
        members: true,
        assets: true,
      },
    });
  }

  async findByCreator(createdById: string, skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.team.findMany({
        where: { createdById, status: 'ACTIVE' },
        include: {
          createdBy: { select: { profile: { select: { displayName: true } } } },
          currentLogo: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.team.count({ where: { createdById, status: 'ACTIVE' } }),
    ]);

    return { items, total };
  }

  async findAll(skip: number, take: number) {
    const [items, total] = await Promise.all([
      this.prisma.team.findMany({
        where: { status: 'ACTIVE' },
        include: {
          createdBy: { select: { profile: { select: { displayName: true } } } },
          currentLogo: true,
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take,
      }),
      this.prisma.team.count({ where: { status: 'ACTIVE' } }),
    ]);

    return { items, total };
  }

  async create(data: {
    createdById: string;
    name: string;
    shortName: string;
    description?: string;
    primaryColor: string;
    secondaryColor?: string;
    countryCode?: string;
  }) {
    return this.prisma.team.create({
      data,
      include: {
        createdBy: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        currentLogo: true,
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    shortName: string;
    description: string | null;
    primaryColor: string;
    secondaryColor: string | null;
    countryCode: string | null;
    status: string;
  }>) {
    return this.prisma.team.update({
      where: { id },
      data,
      include: {
        createdBy: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        currentLogo: true,
      },
    });
  }

  async archive(id: string) {
    return this.prisma.team.update({
      where: { id },
      data: { status: 'ARCHIVED' },
      include: {
        createdBy: { select: { id: true, email: true, profile: { select: { displayName: true } } } },
        currentLogo: true,
      },
    });
  }

  async findMembers(teamId: string) {
    return this.prisma.teamMember.findMany({
      where: { teamId },
      include: { user: { select: { id: true, profile: { select: { displayName: true } } } } },
    });
  }

  async isMember(teamId: string, userId: string) {
    const member = await this.prisma.teamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });

    return !!member;
  }

  async addMember(teamId: string, userId: string, role: string = 'MEMBER') {
    return this.prisma.teamMember.create({
      data: { teamId, userId, role },
    });
  }

  async setCurrentLogo(teamId: string, assetId: string | null) {
    return this.prisma.team.update({
      where: { id: teamId },
      data: { currentLogoAssetId: assetId },
      include: { currentLogo: true },
    });
  }
}
