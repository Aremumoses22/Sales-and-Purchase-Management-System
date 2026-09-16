import { HttpStatus, Injectable } from '@nestjs/common';
import type { DateFormat, OrganizationDto, organizationSchema } from '@spms/shared';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { z } from 'zod';
import { diffRecords } from '../../audit/diff.js';
import { AuditService } from '../../audit/audit.service.js';
import { AppException } from '../../common/app-exception.js';
import { toIso } from '../../common/serialize.js';
import { config } from '../../config.js';
import type { Organization } from '../../generated/prisma/client.js';
import { PrismaService } from '../../prisma/prisma.service.js';

const LOGO_DIR = path.join(config.uploadDir, 'organization');

const IMAGE_SIGNATURES: { mimeType: string; extension: string; matches: (b: Buffer) => boolean }[] = [
  { mimeType: 'image/png', extension: 'png', matches: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { mimeType: 'image/jpeg', extension: 'jpg', matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { mimeType: 'image/webp', extension: 'webp', matches: (b) => b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP' },
];

export interface UploadedImage {
  buffer: Buffer;
  size: number;
}

function toOrganizationDto(org: Organization): OrganizationDto {
  return {
    name: org.name,
    email: org.email,
    phone: org.phone,
    website: org.website,
    taxNumber: org.taxNumber,
    addressLine1: org.addressLine1,
    addressLine2: org.addressLine2,
    city: org.city,
    state: org.state,
    postalCode: org.postalCode,
    country: org.country,
    currencyCode: org.currencyCode,
    currencySymbol: org.currencySymbol,
    dateFormat: org.dateFormat as DateFormat,
    fiscalYearStartMonth: org.fiscalYearStartMonth,
    timezone: org.timezone,
    hasLogo: org.logoFile !== null,
    updatedAt: toIso(org.updatedAt),
  };
}

@Injectable()
export class OrganizationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async get(): Promise<OrganizationDto> {
    return toOrganizationDto(await this.load());
  }

  /** The organization's time zone decides what "today" means for due and expiry dates. */
  async timezone(): Promise<string> {
    return (await this.load()).timezone;
  }

  async update(input: z.output<typeof organizationSchema>): Promise<OrganizationDto> {
    const before = await this.load();
    const updated = await this.prisma.organization.update({ where: { id: 1 }, data: input });
    const changes = diffRecords(
      { ...before, logoFile: undefined, logoMimeType: undefined },
      { ...updated, logoFile: undefined, logoMimeType: undefined },
    );
    if (changes) {
      await this.audit.record({
        action: 'updated',
        entityType: 'organization',
        entityId: '1',
        summary: 'Organization profile updated',
        changes,
      });
    }
    return toOrganizationDto(updated);
  }

  async setLogo(file: UploadedImage | undefined): Promise<OrganizationDto> {
    if (!file || file.size === 0) {
      throw new AppException('FILE_REQUIRED', 'Choose an image to upload', HttpStatus.BAD_REQUEST);
    }
    const format = IMAGE_SIGNATURES.find((signature) => signature.matches(file.buffer));
    if (!format) {
      throw new AppException('UNSUPPORTED_FILE_TYPE', 'The logo must be a PNG, JPEG or WebP image', HttpStatus.UNSUPPORTED_MEDIA_TYPE);
    }

    const before = await this.load();
    await mkdir(LOGO_DIR, { recursive: true });
    const fileName = `logo-${Date.now()}.${format.extension}`;
    await writeFile(path.join(LOGO_DIR, fileName), file.buffer);

    const updated = await this.prisma.organization.update({
      where: { id: 1 },
      data: { logoFile: fileName, logoMimeType: format.mimeType },
    });
    if (before.logoFile) await rm(path.join(LOGO_DIR, before.logoFile), { force: true });
    await this.audit.record({ action: 'updated', entityType: 'organization', entityId: '1', summary: 'Organization logo updated' });
    return toOrganizationDto(updated);
  }

  async removeLogo(): Promise<void> {
    const org = await this.load();
    if (!org.logoFile) return;
    await this.prisma.organization.update({ where: { id: 1 }, data: { logoFile: null, logoMimeType: null } });
    await rm(path.join(LOGO_DIR, org.logoFile), { force: true });
    await this.audit.record({ action: 'updated', entityType: 'organization', entityId: '1', summary: 'Organization logo removed' });
  }

  async logo(): Promise<{ filePath: string; mimeType: string } | null> {
    const org = await this.load();
    if (!org.logoFile || !org.logoMimeType) return null;
    return { filePath: path.join(LOGO_DIR, org.logoFile), mimeType: org.logoMimeType };
  }

  private async load(): Promise<Organization> {
    return (
      (await this.prisma.organization.findUnique({ where: { id: 1 } })) ??
      (await this.prisma.organization.create({ data: { id: 1, name: 'My Company' } }))
    );
  }
}
