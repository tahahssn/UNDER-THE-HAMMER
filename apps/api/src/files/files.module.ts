import { Module } from '@nestjs/common';
import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { S3Service } from './s3/s3.client';
import { FileAssetRepository } from './repositories/file-asset.repository';

@Module({
  controllers: [FilesController],
  providers: [FilesService, S3Service, FileAssetRepository],
  exports: [FilesService, S3Service, FileAssetRepository],
})
export class FilesModule {}
