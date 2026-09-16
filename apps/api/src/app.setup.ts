import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import { AllExceptionsFilter } from './common/exception.filter.js';
import { requestContextMiddleware } from './common/request-context.js';
import { createValidationPipe } from './common/validation.js';
import { ACCESS_COOKIE } from './modules/auth/cookies.js';

export const API_PREFIX = 'api/v1';

/** Shared by main.ts and the e2e tests so both run the exact same pipeline. */
export function configureApp(app: NestExpressApplication): void {
  app.setGlobalPrefix(API_PREFIX);
  // Browsers reach the API through the Next.js server on the same machine; trust it for client IPs.
  app.set('trust proxy', 'loopback');
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
