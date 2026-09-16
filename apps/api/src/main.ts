import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp, setupSwagger } from './app.setup.js';
import { config } from './config.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule);
configureApp(app);
setupSwagger(app);
app.enableShutdownHooks();
await app.listen(config.port);
Logger.log(`API listening on http://localhost:${config.port}/api/v1 (docs: /api/docs)`, 'Bootstrap');
