/**
 * GENCRM APP MODULE
 * =================
 * Root module for GenCRM service.
 * Provides shared entities (Company, Contact) for all Geniefy products.
 */

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { AuthMiddleware } from '../../shared';

import { PrismaModule } from './prisma/prisma.module';
import { CompaniesModule } from './modules/companies/companies.module';
import { ContactsModule } from './modules/contacts/contacts.module';
import { DealsModule } from './modules/deals/deals.module';
import { ActivitiesModule } from './modules/activities/activities.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';

@Module({
  imports: [
    PrismaModule,
    CompaniesModule,
    ContactsModule,
    DealsModule,
    ActivitiesModule,
    WebhooksModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply auth middleware to all routes except webhooks
    consumer
      .apply(AuthMiddleware)
      .exclude('webhooks/(.*)')
      .forRoutes('*');
  }
}
