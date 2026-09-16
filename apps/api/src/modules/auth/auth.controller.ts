import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { changePasswordSchema, loginSchema, type AuthUserDto, type MeDto } from '@spms/shared';
import type { Request, Response } from 'express';
import type { z } from 'zod';
import { AllowDuringPasswordChange, CurrentUser, Public } from '../../common/decorators.js';
import { clientMeta } from '../../common/request-context.js';
import { ApiZodBody } from '../../common/swagger.js';
import { AuthService } from './auth.service.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from './cookies.js';

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(loginSchema)
  async login(
    @Body({ schema: loginSchema }) body: z.output<typeof loginSchema>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { me, accessToken, refreshToken } = await this.auth.login(body, clientMeta(req));
    setAuthCookies(res, accessToken, refreshToken);
    return me;
  }

  /**
   * Cookies are deliberately left alone on failure: another tab may have just rotated the
   * session, and clearing here would sign that tab out too.
   */
  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<{ refreshed: true }> {
    const tokens = await this.auth.refresh(req.cookies?.[REFRESH_COOKIE], clientMeta(req));
    setAuthCookies(res, tokens.accessToken, tokens.refreshToken);
    return { refreshed: true };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
  }

  @AllowDuringPasswordChange()
  @Get('me')
  me(@CurrentUser() user: AuthUserDto): Promise<MeDto> {
    return this.auth.me(user.id);
  }

  @AllowDuringPasswordChange()
  @Post('change-password')
  @HttpCode(HttpStatus.OK)
  @ApiZodBody(changePasswordSchema)
  async changePassword(
    @Body({ schema: changePasswordSchema }) body: z.output<typeof changePasswordSchema>,
    @CurrentUser() user: AuthUserDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<MeDto> {
    const { me, accessToken, refreshToken } = await this.auth.changePassword(user.id, body, clientMeta(req));
    setAuthCookies(res, accessToken, refreshToken);
    return me;
  }
}
