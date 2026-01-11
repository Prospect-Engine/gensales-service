/**
 * AUTH CONTROLLER
 * ===============
 * Handles authentication endpoints for GenCRM service.
 */

import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  BadRequestException,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  TenantLoginSchema,
  TenantLoginResponseDto,
  RefreshTokenSchema,
} from './dto/tenant-login.dto';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * Tenant Login
   * ------------
   * Authenticates a user based on their tenant ID from the outreach system.
   * This allows users who are already authenticated in outreach to get CRM tokens.
   *
   * @param body - Contains the tenant ID (organization ID) from outreach
   * @returns Access token, refresh token, and user info
   */
  @Post('tenant-login')
  @HttpCode(HttpStatus.OK)
  async tenantLogin(@Body() body: unknown): Promise<TenantLoginResponseDto> {
    // Validate request body with Zod
    const result = TenantLoginSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors[0]?.message || 'Invalid request');
    }

    return this.authService.tenantLogin(result.data);
  }

  /**
   * Refresh Token
   * -------------
   * Refreshes an access token using a valid refresh token.
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refreshToken(@Body() body: unknown): Promise<{ accessToken: string }> {
    // Validate request body with Zod
    const result = RefreshTokenSchema.safeParse(body);
    if (!result.success) {
      throw new BadRequestException(result.error.errors[0]?.message || 'Invalid request');
    }

    return this.authService.refreshAccessToken(result.data.refreshToken);
  }
}
