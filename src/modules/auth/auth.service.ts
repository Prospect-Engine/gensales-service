/**
 * AUTH SERVICE
 * ============
 * Handles authentication for GenCRM service.
 * Provides tenant-based login for users authenticated in outreach.
 */

import { Injectable, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { TenantLoginDto, TenantLoginResponseDto } from './dto/tenant-login.dto';
import { baseServiceConfig } from '../../../../shared';

interface JwtPayload {
  sub: string;
  tenant_id: string;
  team_id?: string;
  type: 'access' | 'refresh';
  iat: number;
  exp: number;
}

@Injectable()
export class AuthService {
  private readonly jwtSecret: string;
  private readonly accessTokenExpiry = '7d'; // 7 days
  private readonly refreshTokenExpiry = '30d'; // 30 days

  constructor() {
    this.jwtSecret = baseServiceConfig.jwtSecret || process.env.AUTH_JWT_SECRET || '';
    if (!this.jwtSecret) {
      console.warn('AUTH_JWT_SECRET not configured - authentication will fail');
    }
  }

  /**
   * Authenticate user based on tenant ID from outreach system.
   * This endpoint trusts that the frontend has already validated the user
   * through the main outreach authentication system.
   */
  async tenantLogin(dto: TenantLoginDto): Promise<TenantLoginResponseDto> {
    const { tenantId } = dto;

    if (!tenantId) {
      throw new UnauthorizedException('Tenant ID is required');
    }

    if (!this.jwtSecret) {
      throw new UnauthorizedException('Authentication not configured');
    }

    // Generate a unique user ID for this tenant session
    // In a full implementation, you might look up the user in a CRM users table
    const userId = `crm-user-${tenantId}`;

    // Generate access token
    const accessToken = this.generateToken({
      sub: userId,
      tenant_id: tenantId,
      type: 'access',
    }, this.accessTokenExpiry);

    // Generate refresh token
    const refreshToken = this.generateToken({
      sub: userId,
      tenant_id: tenantId,
      type: 'refresh',
    }, this.refreshTokenExpiry);

    return {
      accessToken,
      refreshToken,
      user: {
        id: userId,
        tenantId,
      },
    };
  }

  /**
   * Verify a JWT token and return the payload.
   */
  verifyToken(token: string): JwtPayload {
    try {
      return jwt.verify(token, this.jwtSecret) as JwtPayload;
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token');
    }
  }

  /**
   * Refresh access token using a valid refresh token.
   */
  async refreshAccessToken(refreshToken: string): Promise<{ accessToken: string }> {
    const payload = this.verifyToken(refreshToken);

    if (payload.type !== 'refresh') {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const accessToken = this.generateToken({
      sub: payload.sub,
      tenant_id: payload.tenant_id,
      team_id: payload.team_id,
      type: 'access',
    }, this.accessTokenExpiry);

    return { accessToken };
  }

  /**
   * Generate a JWT token with the given payload.
   */
  private generateToken(
    payload: Omit<JwtPayload, 'iat' | 'exp'>,
    expiresIn: string,
  ): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn });
  }
}
