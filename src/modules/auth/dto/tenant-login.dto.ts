/**
 * TENANT LOGIN DTO
 * ================
 * Data transfer object for tenant-based authentication.
 * Allows users authenticated in outreach to get CRM tokens.
 */

import { z } from 'zod';

// Request schema
export const TenantLoginSchema = z.object({
  tenantId: z.string().min(1, 'Tenant ID is required'),
});

export type TenantLoginDto = z.infer<typeof TenantLoginSchema>;

// Response types
export interface TenantLoginResponseDto {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    tenantId: string;
    workspaceId?: string;
  };
}

// Refresh token request
export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof RefreshTokenSchema>;
