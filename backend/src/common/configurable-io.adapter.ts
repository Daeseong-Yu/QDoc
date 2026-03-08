import type { INestApplicationContext } from '@nestjs/common'
import { IoAdapter } from '@nestjs/platform-socket.io'
import type { ServerOptions } from 'socket.io'

export class ConfigurableIoAdapter extends IoAdapter {
  constructor(
    app: INestApplicationContext,
    private readonly allowedOrigins: string[],
  ) {
    super(app)
  }

  override createIOServer(port: number, options?: ServerOptions) {
    const cors = {
      ...(options?.cors ?? {}),
      origin: this.buildOriginValidator(),
    }

    return super.createIOServer(port, {
      ...options,
      cors,
    })
  }

  private buildOriginValidator() {
    return (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin) {
        callback(null, true)
        return
      }

      if (this.allowedOrigins.includes(origin)) {
        callback(null, true)
        return
      }

      callback(new Error('Origin not allowed by CORS policy'))
    }
  }
}
