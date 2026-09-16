import { Module } from '@nestjs/common';
import { CustomersController, VendorsController } from './contacts.controller.js';
import { ContactsService } from './contacts.service.js';

@Module({
  controllers: [CustomersController, VendorsController],
  providers: [ContactsService],
  exports: [ContactsService],
})
export class ContactsModule {}
