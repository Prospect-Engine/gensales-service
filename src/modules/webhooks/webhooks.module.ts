/**
 * WEBHOOKS MODULE
 * ===============
 * Handles incoming webhooks from external services.
 * Currently supports:
 * - Outreach sync (LinkedIn connection data from White Walker)
 */

import { Module } from '@nestjs/common';
import { OutreachSyncController } from './controllers/outreach-sync.controller';
import { ContactMatcherService } from './services/contact-matcher.service';
import { ContactMergerService } from './services/contact-merger.service';

@Module({
  controllers: [OutreachSyncController],
  providers: [ContactMatcherService, ContactMergerService],
  exports: [ContactMatcherService, ContactMergerService],
})
export class WebhooksModule {}
