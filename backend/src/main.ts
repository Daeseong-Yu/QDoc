import 'reflect-metadata'

import { ValidationPipe } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module'
import { ConfigurableIoAdapter } from './common/configurable-io.adapter'
import { parseAllowedOrigins } from './common/cors'

function isTruthy(value: unknown) {
  return String(value ?? '').toLowerCase() === 'true'
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  const configService = app.get(ConfigService)

  const nodeEnv = (configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development').toLowerCase()
  const isProduction = nodeEnv === 'production'

  if (isProduction && isTruthy(configService.get('AUTH_DEV_BYPASS'))) {
    throw new Error('AUTH_DEV_BYPASS must be false in production environment.')
  }

  const allowedOrigins = parseAllowedOrigins(configService.get<string>('CORS_ORIGIN'))
  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  })
  app.useWebSocketAdapter(new ConfigurableIoAdapter(app, allowedOrigins))

  app.setGlobalPrefix('api')
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  )

  const port = configService.get<number>('PORT') ?? 4000
  const host = configService.get<string>('HOST') ?? '0.0.0.0'
  await app.listen(port, host)

  console.log(`QDoc backend listening on http://${host}:${port}/api`)
}

void bootstrap()
