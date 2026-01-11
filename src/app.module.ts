/**
 * GENCRM APP MODULE
 * =================
 * Root module for GenCRM service.
 * Provides shared entities (Company, Contact) for all Geniefy products.
 */

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AuthMiddleware } from '../../shared';

import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { HealthModule } from './modules/health/health.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DealsModule } from './modules/deals/deals.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    HealthModule,
    CompaniesModule,
    ContactsModule,
    DealsModule,
    ActivitiesModule,
    WebhooksModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply auth middleware to all routes except webhooks, auth, and health endpoints
    consumer
      .apply(AuthMiddleware)
      .exclude('webhooks/(.*)', 'auth/(.*)', 'health(.*)')
      .forRoutes('*');
  }
}
