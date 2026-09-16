import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module.js';
import { ItemsController } from './items.controller.js';
import { ItemsService } from './items.service.js';

@Module({
  imports: [SettingsModule],
  controllers: [ItemsController],
  providers: [ItemsService],
})
export class ItemsModule {}
