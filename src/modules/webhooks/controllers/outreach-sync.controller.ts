/**
 * OUTREACH SYNC CONTROLLER
 * ========================
 * Handles webhook endpoints for syncing LinkedIn connection data
 * from the main backend (White Walker) to CRM contacts.
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'crypto';
import {
  ConnectionAcceptedPayload,
  ConnectionAcceptedPayloadSchema,
  SyncResultDto,
} from '../dto/outreach-sync.dto';
import { ContactMatcherService } from '../services/contact-matcher.service';
import { ContactMergerService } from '../services/contact-merger.service';

@Controller('webhooks/outreach')
export class OutreachSyncController {
  private readonly logger = new Logger(OutreachSyncController.name);
  private readonly webhookSecret: string;

  constructor(
    private readonly contactMatcher: ContactMatcherService,
    private readonly contactMerger: ContactMergerService,
  ) {
    this.webhookSecret = process.env.OUTREACH_WEBHOOK_SECRET || '';
    if (!this.webhookSecret) {
      this.logger.warn(
        'OUTREACH_WEBHOOK_SECRET not set - webhook authentication disabled',
      );
    }
  }

  /**
   * POST /webhooks/outreach/connection-accepted
   *
   * Webhook endpoint called when a LinkedIn connection is accepted.
   * Creates or updates a CRM contact with the connection data.
   */
  @Post('connection-accepted')
  @HttpCode(HttpStatus.OK)
  async handleConnectionAccepted(
    @Body() rawPayload: unknown,
  ): Promise<SyncResultDto> {
    this.logger.log('Received connection-accepted webhook');

    // Validate payload structure
    const parseResult = ConnectionAcceptedPayloadSchema.safeParse(rawPayload);
    if (!parseResult.success) {
      this.logger.error(`Invalid payload: ${parseResult.error.message}`);
      throw new BadRequestException('Invalid webhook payload');
    }

    const payload = parseResult.data;

    // Verify webhook secret (HMAC authentication)
    if (this.webhookSecret) {
      if (!this.verifyWebhookSecret(payload.webhook_secret)) {
        this.logger.warn('Webhook authentication failed');
        throw new UnauthorizedException('Invalid webhook secret');
      }
    }

    try {
      const { organization_id } = payload.source;
      const connectionData = payload.connection;

      // 1. Try to find an existing contact
      const matchResult = await this.contactMatcher.findMatch(
        organization_id,
        connectionData,
      );

      let result: SyncResultDto;

      // 2. Create or merge based on match result
      if (matchResult.found) {
        result = await this.contactMerger.mergeContact(
          matchResult,
          connectionData,
          false, // Don't force update existing data
        );
      } else {
        result = await this.contactMerger.createContact(
          organization_id,
          connectionData,
        );
      }

      // 3. Create activity log if successful
      if (result.success && result.contact_id) {
        await this.contactMerger.createSyncActivity(
          organization_id,
          result.contact_id,
          result.action as 'created' | 'updated',
          connectionData,
        );
      }

      this.logger.log(
        `Sync completed: ${result.action} (contact_id: ${result.contact_id})`,
      );

      return result;
    } catch (error) {
      this.logger.error(`Webhook processing failed: ${error}`);
      return {
        success: false,
        action: 'skipped',
        error: error instanceof Error ? error.message : 'Processing failed',
      };
    }
  }

  /**
   * POST /webhooks/outreach/batch-sync
   *
   * Batch sync endpoint for syncing multiple connections at once.
   * Useful for initial sync or periodic reconciliation.
   */
  @Post('batch-sync')
  @HttpCode(HttpStatus.OK)
  async handleBatchSync(
    @Body()
    body: {
      webhook_secret: string;
      organization_id: string;
      connections: ConnectionAcceptedPayload['connection'][];
    },
  ): Promise<{
    total: number;
    created: number;
    updated: number;
    skipped: number;
    results: SyncResultDto[];
  }> {
    this.logger.log(`Received batch-sync webhook with ${body.connections?.length || 0} connections`);

    // Verify webhook secret
    if (this.webhookSecret && !this.verifyWebhookSecret(body.webhook_secret)) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    if (!body.connections || !Array.isArray(body.connections)) {
      throw new BadRequestException('Invalid batch payload');
    }

    const results: SyncResultDto[] = [];
    let created = 0;
    let updated = 0;
    let skipped = 0;

    for (const connectionData of body.connections) {
      try {
        const matchResult = await this.contactMatcher.findMatch(
          body.organization_id,
          connectionData,
        );

        let result: SyncResultDto;

        if (matchResult.found) {
          result = await this.contactMerger.mergeContact(
            matchResult,
            connectionData,
            false,
          );
        } else {
          result = await this.contactMerger.createContact(
            body.organization_id,
            connectionData,
          );
        }

        results.push(result);

        if (result.action === 'created') created++;
        else if (result.action === 'updated') updated++;
        else skipped++;

        // Create activity for successful syncs
        if (result.success && result.contact_id) {
          await this.contactMerger.createSyncActivity(
            body.organization_id,
            result.contact_id,
            result.action as 'created' | 'updated',
            connectionData,
          );
        }
      } catch (error) {
        results.push({
          success: false,
          action: 'skipped',
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        skipped++;
      }
    }

    this.logger.log(
      `Batch sync completed: ${created} created, ${updated} updated, ${skipped} skipped`,
    );

    return {
      total: body.connections.length,
      created,
      updated,
      skipped,
      results,
    };
  }

  /**
   * Verify webhook secret using timing-safe comparison.
   */
  private verifyWebhookSecret(providedSecret: string): boolean {
    try {
      const expected = Buffer.from(this.webhookSecret);
      const provided = Buffer.from(providedSecret);

      if (expected.length !== provided.length) {
        return false;
      }

      return timingSafeEqual(expected, provided);
    } catch {
      return false;
    }
  }
}
