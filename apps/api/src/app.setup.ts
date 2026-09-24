import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import type { NextFunction, Request, Response } from 'express';
import { AllExceptionsFilter } from './common/exception.filter.js';
import { requestContextMiddleware } from './common/request-context.js';
import { createValidationPipe } from './common/validation.js';
import { config } from './config.js';
import { ACCESS_COOKIE } from './modules/auth/cookies.js';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  app.disable('x-powered-by');
  // Baseline security headers. The API only serves JSON and uploaded files, so it never needs framing or sniffing.
  app.use((_req: Request, res: Response, next: NextFunction) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    next();
  });
  // Browsers reach the API through the Next.js server; trust it (and any proxy in front of it) for client IPs.
  app.set('trust proxy', config.trustProxy);
  app.useBodyParser('json', { limit: '1mb' });
  app.use(cookieParser());
  app.use(requestContextMiddleware);
  app.useGlobalPipes(createValidationPipe());
  app.useGlobalFilters(new AllExceptionsFilter());
}

export function setupSwagger(app: NestExpressApplication): void {
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Sales & Purchase Management API')
      .setVersion('0.1.0')
      .addCookieAuth(ACCESS_COOKIE)
      .build(),
  );
  SwaggerModule.setup('api/docs', app, document, {
    swaggerOptions: {
      withCredentials: true,
      requestInterceptor: (req: { headers: Record<string, string> }) => {
        req.headers['X-Requested-With'] = 'swagger';
        return req;
      },
    },
  });
}
