import { CanActivate, ExecutionContext, ForbiddenException, Inject, Injectable, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'

import { AuthenticatedRequest } from './authenticated-request'
import { ROLES_KEY } from './roles.decorator'
import { UserRole } from './auth.types'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<UserRole[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles || requiredRoles.length === 0) {
      return true
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const user = request.user
    if (!user) {
      throw new UnauthorizedException('Authentication required')
    }

    const allowed = requiredRoles.some((role) => user.roles.includes(role))
    if (!allowed) {
      throw new ForbiddenException('Insufficient role')
    }

    return true
  }
}

