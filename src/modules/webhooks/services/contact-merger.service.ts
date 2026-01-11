/**
 * CONTACT MERGER SERVICE
 * ======================
 * Handles creating new contacts or merging data into existing contacts
 * when LinkedIn connections are synced from Outreach.
 *
 * Merge Strategy:
 * - LinkedIn-specific fields: Always update (profile photo, headline, location, connected date)
 * - Basic fields (name, job title): Only update if currently empty
 * - User-managed fields (status, priority, owner): Never overwrite
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConnectionAcceptedPayload, SyncResultDto } from '../dto/outreach-sync.dto';
import { MatchResult } from './contact-matcher.service';
import { Prisma } from '@prisma/client';

@Injectable()
export class ContactMergerService {
  private readonly logger = new Logger(ContactMergerService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Create a new contact from LinkedIn connection data.
   */
  async createContact(
    organizationId: string,
    connectionData: ConnectionAcceptedPayload['connection'],
  ): Promise<SyncResultDto> {
    try {
      const {
        urn_id,
        public_id,
        name,
        first_name,
        last_name,
        headline,
        profile_url,
        profile_pic_url,
        company,
        job_title,
        location,
        industry,
        email,
        phone,
        connected_on,
        skills,
        languages,
        work_experience,
        education,
      } = connectionData;

      // Parse name if first/last not provided
      const { firstName, lastName } = this.parseName(name, first_name, last_name);

      // Build LinkedIn-specific data to store in customFields
      const linkedinData: Record<string, any> = {
        linkedinUrnId: urn_id,
        linkedinPublicId: public_id,
        linkedinConnected: connected_on,
        linkedinHeadline: headline,
        linkedinLocation: location,
        linkedinProfilePhoto: profile_pic_url,
        linkedinIndustry: industry,
        linkedinSkills: skills || [],
        linkedinLanguages: languages || [],
        linkedinWorkExperience: work_experience,
        linkedinEducation: education,
        syncedFromOutreach: true,
        lastSyncedAt: new Date().toISOString(),
      };

      // Remove undefined values
      Object.keys(linkedinData).forEach((key) => {
        if (linkedinData[key] === undefined) {
          delete linkedinData[key];
        }
      });

      const contact = await this.prisma.contact.create({
        data: {
          organizationId,
          firstName,
          lastName,
          email: email?.toLowerCase() || null,
          phone: phone || null,
          jobTitle: job_title || null,
          linkedinUrl: this.normalizeLinkedInUrl(profile_url, public_id),
          profileImageUrl: profile_pic_url || null,
          isLead: true,
          leadSource: 'LINKEDIN_OUTREACH',
          leadStatus: 'NEW',
          customFields: linkedinData as any,
        },
        select: {
          id: true,
        },
      });

      this.logger.log(`Created new contact ${contact.id} from LinkedIn connection`);

      return {
        success: true,
        action: 'created',
        contact_id: contact.id,
        match_type: 'NEW',
        message: `Created new contact: ${firstName} ${lastName}`,
      };
    } catch (error) {
      this.logger.error(`Failed to create contact: ${error}`);
      return {
        success: false,
        action: 'skipped',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Merge LinkedIn connection data into an existing contact.
   */
  async mergeContact(
    matchResult: MatchResult,
    connectionData: ConnectionAcceptedPayload['connection'],
    forceUpdate: boolean = false,
  ): Promise<SyncResultDto> {
    if (!matchResult.contact_id || !matchResult.existing_data) {
      return {
        success: false,
        action: 'skipped',
        error: 'No existing contact to merge with',
      };
    }

    try {
      const {
        urn_id,
        public_id,
        name,
        first_name,
        last_name,
        headline,
        profile_url,
        profile_pic_url,
        company,
        job_title,
        location,
        industry,
        email,
        phone,
        connected_on,
        skills,
        languages,
        work_experience,
        education,
      } = connectionData;

      const existing = matchResult.existing_data;
      const existingCustomFields = (existing.customFields || {}) as Record<string, any>;

      // Build update data based on merge strategy
      const updateData: Record<string, any> = {};

      // Fields to always update (LinkedIn-specific)
      const linkedinData: Record<string, any> = {
        ...existingCustomFields,
        linkedinUrnId: urn_id,
        linkedinPublicId: public_id,
        linkedinConnected: connected_on,
        linkedinHeadline: headline,
        linkedinLocation: location,
        linkedinProfilePhoto: profile_pic_url,
        linkedinIndustry: industry,
        linkedinSkills: skills || existingCustomFields.linkedinSkills || [],
        linkedinLanguages: languages || existingCustomFields.linkedinLanguages || [],
        linkedinWorkExperience: work_experience || existingCustomFields.linkedinWorkExperience,
        linkedinEducation: education || existingCustomFields.linkedinEducation,
        syncedFromOutreach: true,
        lastSyncedAt: new Date().toISOString(),
      };

      // Always update these fields
      updateData.profileImageUrl = profile_pic_url || existing.linkedinUrl;
      updateData.linkedinUrl = this.normalizeLinkedInUrl(profile_url, public_id) || existing.linkedinUrl;

      // Only update if empty OR force update
      const { firstName, lastName } = this.parseName(name, first_name, last_name);

      if (forceUpdate || !existing.firstName) {
        updateData.firstName = firstName;
      }
      if (forceUpdate || !existing.lastName) {
        updateData.lastName = lastName;
      }
      if (forceUpdate || !existing.email) {
        updateData.email = email?.toLowerCase() || existing.email;
      }

      // Add jobTitle if empty
      const currentJobTitle = await this.prisma.contact.findUnique({
        where: { id: matchResult.contact_id },
        select: { jobTitle: true },
      });
      if (forceUpdate || !currentJobTitle?.jobTitle) {
        updateData.jobTitle = job_title;
      }

      // Update customFields with LinkedIn data
      updateData.customFields = linkedinData as any;

      // Perform the update
      await this.prisma.contact.update({
        where: { id: matchResult.contact_id },
        data: updateData,
      });

      this.logger.log(
        `Merged LinkedIn data into contact ${matchResult.contact_id} (match type: ${matchResult.match_type})`,
      );

      return {
        success: true,
        action: 'updated',
        contact_id: matchResult.contact_id,
        match_type: matchResult.match_type,
        message: `Updated existing contact: ${firstName} ${lastName}`,
      };
    } catch (error) {
      this.logger.error(`Failed to merge contact: ${error}`);
      return {
        success: false,
        action: 'skipped',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create an activity record for the sync event.
   */
  async createSyncActivity(
    organizationId: string,
    contactId: string,
    action: 'created' | 'updated',
    connectionData: ConnectionAcceptedPayload['connection'],
  ): Promise<void> {
    try {
      await this.prisma.activity.create({
        data: {
          organizationId,
          contactId,
          type: action === 'created' ? 'NOTE' : 'NOTE',
          title:
            action === 'created'
              ? 'Contact created from LinkedIn connection'
              : 'Contact updated from LinkedIn sync',
          description: `LinkedIn connection accepted. Profile: ${connectionData.name}`,
          customFields: {
            source: 'OUTREACH_SYNC',
            connectionId: connectionData.id,
            linkedinUrl: connectionData.profile_url,
            connectedOn: connectionData.connected_on,
          } as any,
        },
      });
    } catch (error) {
      // Non-critical - log but don't fail
      this.logger.warn(`Failed to create sync activity: ${error}`);
    }
  }

  /**
   * Parse full name into first and last name.
   */
  private parseName(
    fullName: string,
    firstName?: string,
    lastName?: string,
  ): { firstName: string; lastName: string } {
    if (firstName && lastName) {
      return { firstName, lastName };
    }

    const parts = fullName.trim().split(/\s+/);
    if (parts.length === 1) {
      return { firstName: parts[0], lastName: '' };
    }

    return {
      firstName: parts[0],
      lastName: parts.slice(1).join(' '),
    };
  }

  /**
   * Normalize LinkedIn URL to a consistent format.
   */
  private normalizeLinkedInUrl(
    profileUrl?: string,
    publicId?: string,
  ): string | null {
    if (publicId) {
      return `https://www.linkedin.com/in/${publicId}`;
    }

    if (!profileUrl) return null;

    // Extract public ID from URL
    const match = profileUrl.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (match) {
      return `https://www.linkedin.com/in/${match[1]}`;
    }

    return profileUrl;
  }
}
