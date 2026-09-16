import { Module } from '@nestjs/common';
import { CustomersController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';

@Module({
  controllers: [CustomersController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
