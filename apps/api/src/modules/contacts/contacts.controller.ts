import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Post, Put, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import {
  contactListQuerySchema,
  contactSchema,
  type ActiveListQuery,
  type ContactOutput,
  type ContactType,
} from '@spms/shared';
import { RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { uuidParam } from '../../common/validation.js';
import { CONTACT_LABELS, ContactsService } from './contacts.service.js';

const RESOURCES = { customer: 'customers', vendor: 'vendors' } as const;

/** One controller definition for both customers and vendors. */
function contactController(type: ContactType) {
  const resource = RESOURCES[type];
  const can = (action: 'view' | 'create' | 'edit' | 'delete') => RequirePermissions(`${resource}:${action}`);

  @ApiTags(`${CONTACT_LABELS[type]}s`)
  @Controller(resource)
  class ContactsController {
    constructor(readonly contacts: ContactsService) {}

    @Get()
    @can('view')
    list(@Query({ schema: contactListQuerySchema }) query: ActiveListQuery) {
      return this.contacts.list(type, query);
    }

    @Get(':id')
    @can('view')
    get(@Param('id', { schema: uuidParam }) id: string) {
      return this.contacts.get(type, id);
    }

    @Get(':id/summary')
    @can('view')
    summary(@Param('id', { schema: uuidParam }) id: string) {
      return this.contacts.summary(type, id);
    }

    @Get(':id/history')
    @can('view')
    history(@Param('id', { schema: uuidParam }) id: string) {
      return this.contacts.history(type, id);
    }

    @Post()
    @can('create')
    @ApiZodBody(contactSchema)
    create(@Body({ schema: contactSchema }) body: ContactOutput) {
      return this.contacts.create(type, body);
    }

    @Put(':id')
    @can('edit')
    @ApiZodBody(contactSchema)
    update(@Param('id', { schema: uuidParam }) id: string, @Body({ schema: contactSchema }) body: ContactOutput) {
      return this.contacts.update(type, id, body);
    }

    @Post(':id/activate')
    @can('edit')
    @HttpCode(HttpStatus.OK)
    activate(@Param('id', { schema: uuidParam }) id: string) {
      return this.contacts.setActive(type, id, true);
    }

    @Post(':id/deactivate')
    @can('edit')
    @HttpCode(HttpStatus.OK)
    deactivate(@Param('id', { schema: uuidParam }) id: string) {
      return this.contacts.setActive(type, id, false);
    }

    @Delete(':id')
    @can('delete')
    @HttpCode(HttpStatus.NO_CONTENT)
    remove(@Param('id', { schema: uuidParam }) id: string) {
      return this.contacts.remove(type, id);
    }
  }

  Object.defineProperty(ContactsController, 'name', { value: `${CONTACT_LABELS[type]}sController` });
  return ContactsController;
}

export const CustomersController = contactController('customer');
export const VendorsController = contactController('vendor');
