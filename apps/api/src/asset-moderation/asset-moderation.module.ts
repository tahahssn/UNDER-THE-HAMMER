import { Module } from '@nestjs/common';
import { AssetModerationController } from './asset-moderation.controller';
import { AssetModerationService } from './asset-moderation.service';
import { AssetModerationRepository } from './repositories/asset-moderation.repository';
import { FilesModule } from '../files/files.module';

@Module({
  imports: [FilesModule],
  controllers: [AssetModerationController],
  providers: [AssetModerationService, AssetModerationRepository],
  exports: [AssetModerationService, AssetModerationRepository],
})
export class AssetModerationModule {}
