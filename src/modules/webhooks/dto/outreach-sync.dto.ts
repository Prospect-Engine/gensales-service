/**
 * OUTREACH SYNC DTOs
 * ==================
 * DTOs for webhook payloads from the main backend (White Walker).
 */

import { z } from 'zod';

// Webhook payload schema for connection accepted events
export const ConnectionAcceptedPayloadSchema = z.object({
  webhook_secret: z.string(),
  event_type: z.literal('CONNECTION_ACCEPTED'),
  timestamp: z.string().datetime(),
  source: z.object({
    organization_id: z.string().uuid(),
    workspace_id: z.string().uuid(),
    integration_id: z.string().uuid(),
    campaign_id: z.string().uuid().optional(),
  }),
  connection: z.object({
    id: z.string().uuid(),
    urn_id: z.string(),
    public_id: z.string().optional(),
    name: z.string(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    headline: z.string().optional(),
    profile_url: z.string(),
    profile_pic_url: z.string().optional(),
    company: z.string().optional(),
    job_title: z.string().optional(),
    location: z.string().optional(),
    industry: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    connected_on: z.string().datetime(),
    // Additional enriched data
    skills: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    work_experience: z.any().optional(),
    education: z.any().optional(),
  }),
});

export type ConnectionAcceptedPayload = z.infer<
  typeof ConnectionAcceptedPayloadSchema
>;

// Response DTOs
export interface SyncResultDto {
  success: boolean;
  action: 'created' | 'updated' | 'skipped';
  contact_id?: string;
  match_type?: 'URN_ID' | 'LINKEDIN_URL' | 'EMAIL' | 'NEW';
  message?: string;
  error?: string;
}

// Manual sync request DTO
export const ManualSyncRequestSchema = z.object({
  connection_id: z.string().uuid(),
  organization_id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  force_update: z.boolean().optional().default(false),
});

export type ManualSyncRequest = z.infer<typeof ManualSyncRequestSchema>;
