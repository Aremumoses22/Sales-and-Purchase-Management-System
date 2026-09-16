import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { AuthUserDto, SearchResultsDto } from '@spms/shared';
import { z } from 'zod';
import { CurrentUser } from '../../common/decorators.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const searchQuery = z.object({ q: z.string().trim().min(1).max(100) });

/** Global search in the top bar: a few matches per module the user is allowed to see. */
@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async search(
    @Query({ schema: searchQuery }) { q }: z.output<typeof searchQuery>,
    @CurrentUser() user: AuthUserDto,
  ): Promise<SearchResultsDto> {
    const can = (permission: AuthUserDto['permissions'][number]) => user.permissions.includes(permission);
    const contains = { contains: q, mode: 'insensitive' as const };

    const [customers, items, quotes, invoices, creditNotes] = await Promise.all([
      can('customers:view')
        ? this.prisma.contact.findMany({
            where: { type: 'customer', OR: [{ displayName: contains }, { companyName: contains }, { email: contains }] },
            select: { id: true, displayName: true, companyName: true },
            orderBy: { displayName: 'asc' },
            take: 5,
          })
        : [],
      can('items:view')
        ? this.prisma.item.findMany({
            where: { OR: [{ name: contains }, { sku: contains }] },
            select: { id: true, name: true, sku: true },
            orderBy: { name: 'asc' },
            take: 5,
          })
        : [],
      can('quotes:view')
        ? this.prisma.quote.findMany({
            where: { OR: [{ number: contains }, { referenceNumber: contains }, { customer: { displayName: contains } }] },
            select: { id: true, number: true, customer: { select: { displayName: true } } },
            orderBy: { quoteDate: 'desc' },
            take: 5,
          })
        : [],
      can('invoices:view')
        ? this.prisma.invoice.findMany({
            where: { OR: [{ number: contains }, { orderNumber: contains }, { customer: { displayName: contains } }] },
            select: { id: true, number: true, customer: { select: { displayName: true } } },
            orderBy: { invoiceDate: 'desc' },
            take: 5,
          })
        : [],
      can('credit_notes:view')
        ? this.prisma.creditNote.findMany({
            where: { OR: [{ number: contains }, { referenceNumber: contains }, { customer: { displayName: contains } }] },
            select: { id: true, number: true, customer: { select: { displayName: true } } },
            orderBy: { creditNoteDate: 'desc' },
            take: 5,
          })
        : [],
    ]);

    return {
      customers,
      items,
      quotes: quotes.map((quote) => ({ id: quote.id, number: quote.number, customerName: quote.customer.displayName })),
      invoices: invoices.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        customerName: invoice.customer.displayName,
      })),
      creditNotes: creditNotes.map((creditNote) => ({
        id: creditNote.id,
        number: creditNote.number,
        customerName: creditNote.customer.displayName,
      })),
    };
  }
}
