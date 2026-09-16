import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Put,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiConsumes, ApiTags } from '@nestjs/swagger';
import { organizationSchema, type OrganizationDto } from '@spms/shared';
import type { Response } from 'express';
import type { z } from 'zod';
import { notFound } from '../../common/app-exception.js';
import { Public, RequirePermissions } from '../../common/decorators.js';
import { ApiZodBody } from '../../common/swagger.js';
import { OrganizationService, type UploadedImage } from './organization.service.js';

@ApiTags('Settings')
@Controller('settings/organization')
export class OrganizationController {
  constructor(private readonly organization: OrganizationService) {}

  @Get()
  get(): Promise<OrganizationDto> {
    return this.organization.get();
  }

  @Put()
  @RequirePermissions('settings:manage')
  @ApiZodBody(organizationSchema)
  update(@Body({ schema: organizationSchema }) body: z.output<typeof organizationSchema>): Promise<OrganizationDto> {
    return this.organization.update(body);
  }

  @Post('logo')
  @RequirePermissions('settings:manage')
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 1_000_000, files: 1 } }))
  uploadLogo(@UploadedFile() file: UploadedImage | undefined): Promise<OrganizationDto> {
    return this.organization.setLogo(file);
  }

  @Delete('logo')
  @RequirePermissions('settings:manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  removeLogo(): Promise<void> {
    return this.organization.removeLogo();
  }

  /** Public so printed documents can always show the logo, even mid token refresh. */
  @Public()
  @Get('logo')
  async logo(@Res() res: Response): Promise<void> {
    const logo = await this.organization.logo();
    if (!logo) throw notFound('Logo');
    res.setHeader('Content-Type', logo.mimeType);
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.sendFile(logo.filePath);
  }
}
