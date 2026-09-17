import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './app.setup.js';
import { assertProductionConfig, config } from './config.js';

assertProductionConfig();

const app = await NestFactory.create<NestExpressApplication>(AppModule);
configureApp(app);
if (config.apiDocsEnabled) setupSwagger(app);
app.enableShutdownHooks();
await app.listen(config.port, config.host);
Logger.log(
  `API listening on http://${config.host}:${config.port}/api/v1${config.apiDocsEnabled ? ' (docs: /api/docs)' : ''}`,
  'Bootstrap',
);
