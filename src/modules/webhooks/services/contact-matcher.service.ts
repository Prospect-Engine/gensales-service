/**
 * CONTACT MATCHER SERVICE
 * =======================
 * Handles matching incoming LinkedIn connection data to existing CRM contacts.
 *
 * Priority matching order:
 * 1. LinkedIn URN ID (most reliable - unique identifier)
 * 2. LinkedIn URL (normalized)
 * 3. Email (if available)
 */

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { ConnectionAcceptedPayload } from '../dto/outreach-sync.dto';

export interface MatchResult {
  found: boolean;
  contact_id?: string;
  match_type?: 'URN_ID' | 'LINKEDIN_URL' | 'EMAIL' | 'NEW';
  existing_data?: {
    id: string;
    firstName: string;
    lastName: string;
    email: string | null;
    linkedinUrl: string | null;
    customFields: any;
  };
}

@Injectable()
export class ContactMatcherService {
  private readonly logger = new Logger(ContactMatcherService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Find an existing contact that matches the incoming connection data.
   */
  async findMatch(
    organizationId: string,
    connectionData: ConnectionAcceptedPayload['connection'],
  ): Promise<MatchResult> {
    const { urn_id, public_id, profile_url, email } = connectionData;

    // 1. Try matching by LinkedIn URN ID stored in customFields
    const urnMatch = await this.matchByUrnId(organizationId, urn_id);
    if (urnMatch) {
      this.logger.log(`Found contact match by URN ID: ${urnMatch.id}`);
      return {
        found: true,
        contact_id: urnMatch.id,
        match_type: 'URN_ID',
        existing_data: urnMatch,
      };
    }

    // 2. Try matching by LinkedIn URL
    const normalizedUrl = this.normalizeLinkedInUrl(profile_url, public_id);
    if (normalizedUrl) {
      const urlMatch = await this.matchByLinkedInUrl(
        organizationId,
        normalizedUrl,
      );
      if (urlMatch) {
        this.logger.log(`Found contact match by LinkedIn URL: ${urlMatch.id}`);
        return {
          found: true,
          contact_id: urlMatch.id,
          match_type: 'LINKEDIN_URL',
          existing_data: urlMatch,
        };
      }
    }

    // 3. Try matching by email
    if (email) {
      const emailMatch = await this.matchByEmail(organizationId, email);
      if (emailMatch) {
        this.logger.log(`Found contact match by email: ${emailMatch.id}`);
        return {
          found: true,
          contact_id: emailMatch.id,
          match_type: 'EMAIL',
          existing_data: emailMatch,
        };
      }
    }

    // No match found
    this.logger.log(`No existing contact found for URN: ${urn_id}`);
    return {
      found: false,
      match_type: 'NEW',
    };
  }

  /**
   * Match by LinkedIn URN ID stored in customFields.linkedinUrnId
   */
  private async matchByUrnId(
    organizationId: string,
    urnId: string,
  ): Promise<MatchResult['existing_data'] | null> {
    try {
      // Query contacts where customFields contains the LinkedIn URN ID
      const contacts = await this.prisma.$queryRaw<
        Array<{
          id: string;
          first_name: string;
          last_name: string;
          email: string | null;
          linkedin_url: string | null;
          custom_fields: any;
        }>
      >`
        SELECT id, first_name, last_name, email, linkedin_url, custom_fields
        FROM crm.contacts
        WHERE organization_id = ${organizationId}::uuid
          AND custom_fields->>'linkedinUrnId' = ${urnId}
        LIMIT 1
      `;

      if (contacts.length > 0) {
        const contact = contacts[0];
        return {
          id: contact.id,
          firstName: contact.first_name,
          lastName: contact.last_name,
          email: contact.email,
          linkedinUrl: contact.linkedin_url,
          customFields: contact.custom_fields,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Error matching by URN ID: ${error}`);
      return null;
    }
  }

  /**
   * Match by LinkedIn URL (normalized)
   */
  private async matchByLinkedInUrl(
    organizationId: string,
    linkedinUrl: string,
  ): Promise<MatchResult['existing_data'] | null> {
    try {
      // Try multiple URL variations
      const urlVariations = this.getLinkedInUrlVariations(linkedinUrl);

      const contact = await this.prisma.contact.findFirst({
        where: {
          organizationId,
          linkedinUrl: {
            in: urlVariations,
          },
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          linkedinUrl: true,
          customFields: true,
        },
      });

      if (contact) {
        return {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          linkedinUrl: contact.linkedinUrl,
          customFields: contact.customFields,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Error matching by LinkedIn URL: ${error}`);
      return null;
    }
  }

  /**
   * Match by email address
   */
  private async matchByEmail(
    organizationId: string,
    email: string,
  ): Promise<MatchResult['existing_data'] | null> {
    try {
      const contact = await this.prisma.contact.findFirst({
        where: {
          organizationId,
          email: email.toLowerCase(),
        },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          linkedinUrl: true,
          customFields: true,
        },
      });

      if (contact) {
        return {
          id: contact.id,
          firstName: contact.firstName,
          lastName: contact.lastName,
          email: contact.email,
          linkedinUrl: contact.linkedinUrl,
          customFields: contact.customFields,
        };
      }
      return null;
    } catch (error) {
      this.logger.error(`Error matching by email: ${error}`);
      return null;
    }
  }

  /**
   * Normalize LinkedIn URL to a consistent format
   */
  private normalizeLinkedInUrl(
    profileUrl?: string,
    publicId?: string,
  ): string | null {
    if (publicId) {
      return `https://www.linkedin.com/in/${publicId}`;
    }

    if (!profileUrl) return null;

    // Extract public ID from various URL formats
    const patterns = [
      /linkedin\.com\/in\/([^/?#]+)/i,
      /linkedin\.com\/sales\/lead\/([^/?#]+)/i,
      /linkedin\.com\/sales\/people\/([^/?#]+)/i,
    ];

    for (const pattern of patterns) {
      const match = profileUrl.match(pattern);
      if (match) {
        return `https://www.linkedin.com/in/${match[1]}`;
      }
    }

    return profileUrl;
  }

  /**
   * Generate URL variations for matching
   */
  private getLinkedInUrlVariations(url: string): string[] {
    const variations: string[] = [url];

    // Extract the public ID
    const match = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
    if (match) {
      const publicId = match[1];
      variations.push(
        `https://www.linkedin.com/in/${publicId}`,
        `https://linkedin.com/in/${publicId}`,
        `http://www.linkedin.com/in/${publicId}`,
        `http://linkedin.com/in/${publicId}`,
        `https://www.linkedin.com/in/${publicId}/`,
        `linkedin.com/in/${publicId}`,
      );
    }

    return [...new Set(variations)];
  }
}
