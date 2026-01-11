/**
 * AUTH MODULE
 * ===========
 * Authentication module for GenCRM service.
 * Provides tenant-based authentication for users from outreach system.
 */

import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

@Module({
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
