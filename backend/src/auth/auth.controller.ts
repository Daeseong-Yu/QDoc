import { Controller, Get, Req } from '@nestjs/common'

import type { AuthenticatedRequest } from './authenticated-request'

@Controller('auth')
export class AuthController {
  @Get('session')
  getSession(@Req() request: AuthenticatedRequest) {
    return {
      user: request.user,
      now: new Date().toISOString(),
    }
  }
}

