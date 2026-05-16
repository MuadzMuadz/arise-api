import { NestFactory } from '@nestjs/core';
import { ValidationPipe, Logger } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';
import { ProblemJsonFilter } from './common/filters/problem-json.filter';
import { Env } from './config/env';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, {
    logger: ['error', 'warn', 'log', 'debug'],
  });

  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const port = config.get<number>('PORT', { infer: true });
  const apiPrefix = config.get<string>('API_PREFIX', { infer: true });

  // Global API versioning prefix
  app.setGlobalPrefix(apiPrefix);

  // Strict DTO validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // RFC 7807 problem+json error format
  app.useGlobalFilters(new ProblemJsonFilter());

  // CORS — dev permissive, tighten via env di prod
  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN', { infer: true }).split(','),
    credentials: true,
  });

  // ── Swagger / OpenAPI ──────────────────────────────────────────
  const swaggerConfig = new DocumentBuilder()
    .setTitle('ARISE API')
    .setDescription('Hunter System tracker — Solo Leveling DNA')
    .setVersion('0.1.0')
    .addBearerAuth()
    .addServer(`/${apiPrefix}`)
    .build();

  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: 'openapi.json',
    swaggerOptions: { persistAuthorization: true },
  });

  await app.listen(port);

  const logger = new Logger('Bootstrap');
  logger.log(`🗡  ARISE API running on http://localhost:${port}/${apiPrefix}`);
  logger.log(`📖 Swagger UI: http://localhost:${port}/docs`);
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal bootstrap error:', err);
  process.exit(1);
});
