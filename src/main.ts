/**
 * GENCRM SERVICE - MAIN ENTRY POINT
 * ==================================
 * CRM & Shared Entities Service for Geniefy platform.
 * Handles companies, contacts, deals, and activities (shared across all products).
 */

import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import * as cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { baseServiceConfig } from '../../shared';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.setGlobalPrefix(baseServiceConfig.apiPrefix);
  app.use(cookieParser());
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors({
    origin: baseServiceConfig.corsOrigins,
    credentials: true,
  });

  const port = baseServiceConfig.ports.gencrm;
  await app.listen(port);

  console.log(`🔷 GenCRM Service running on http://localhost:${port}`);
  console.log(`   API: http://localhost:${port}${baseServiceConfig.apiPrefix}`);
}

bootstrap();
