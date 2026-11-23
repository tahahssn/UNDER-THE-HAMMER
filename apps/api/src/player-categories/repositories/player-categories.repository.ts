import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class PlayerCategoriesRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.playerCategory.findMany({
      orderBy: { sortOrder: 'asc' },
    });
  }

  async findById(id: string) {
    return this.prisma.playerCategory.findUnique({
      where: { id },
    });
  }

  async findByKey(key: string) {
    return this.prisma.playerCategory.findUnique({
      where: { key },
    });
  }
}
