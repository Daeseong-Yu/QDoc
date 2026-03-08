import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { createRemoteJWKSet, JWTPayload, jwtVerify } from 'jose'

import { AuthenticatedRequest } from './authenticated-request'
import { ALL_ROLES, AuthenticatedUser, UserRole } from './auth.types'

function isUserRole(value: string): value is UserRole {
  return ALL_ROLES.includes(value as UserRole)
}

@Injectable()
export class AuthGuard implements CanActivate {
  private readonly logger = new Logger(AuthGuard.name)
  private readonly configService: ConfigService

  constructor(@Inject(ConfigService) configService: ConfigService) {
    this.configService = configService
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>()
    const authorization = request.headers.authorization

    if (!authorization) {
      if (this.isDevBypassEnabled()) {
        request.user = this.createDevUser(request)
        return true
      }

      throw new UnauthorizedException('Missing authorization header')
    }

    const token = this.extractBearerToken(authorization)
    if (!token) {
      throw new UnauthorizedException('Invalid bearer token format')
    }

    const payload = await this.verifyToken(token)
    request.user = this.payloadToUser(payload)

    return true
  }

  private extractBearerToken(header: string) {
    const [scheme, token] = header.split(' ')
    if (!scheme || !token || scheme.toLowerCase() !== 'bearer') {
      return null
    }

    return token
  }

  private isDevBypassEnabled() {
    const enabled = String(this.configService.get('AUTH_DEV_BYPASS') ?? '').toLowerCase() === 'true'
    const nodeEnv = (this.configService.get<string>('NODE_ENV') ?? process.env.NODE_ENV ?? 'development').toLowerCase()

    if (enabled && nodeEnv === 'production') {
      this.logger.error('AUTH_DEV_BYPASS is blocked in production environment.')
      return false
    }

    return enabled
  }

  private createDevUser(request: AuthenticatedRequest): AuthenticatedUser {
    const roleHeader = request.headers['x-dev-role']
    const rawRole = Array.isArray(roleHeader) ? roleHeader[0] : roleHeader
    const role = rawRole && isUserRole(rawRole) ? rawRole : 'patient'

    const userIdHeader = request.headers['x-dev-user-id']
    const rawUserId = Array.isArray(userIdHeader) ? userIdHeader[0] : userIdHeader

    const nameHeader = request.headers['x-dev-name']
    const rawName = Array.isArray(nameHeader) ? nameHeader[0] : nameHeader

    return {
      id: rawUserId ?? 'dev-user',
      name: rawName ?? 'Development User',
      roles: [role],
      authUserId: rawUserId ?? 'dev-user',
    }
  }

  private async verifyToken(token: string): Promise<JWTPayload> {
    const issuer = this.configService.get<string>('AUTH0_ISSUER')
    const audience = this.configService.get<string>('AUTH0_AUDIENCE')
    const jwksUri = this.configService.get<string>('AUTH0_JWKS_URI')

    if (!issuer || !audience || !jwksUri) {
      throw new UnauthorizedException(
        'Auth verification is not configured. Set AUTH0_ISSUER, AUTH0_AUDIENCE, AUTH0_JWKS_URI.',
      )
    }

    const jwks = createRemoteJWKSet(new URL(jwksUri))
    const { payload } = await jwtVerify(token, jwks, { issuer, audience })
    return payload
  }

  private payloadToUser(payload: JWTPayload): AuthenticatedUser {
    const rolesClaim =
      this.configService.get<string>('AUTH0_ROLES_CLAIM') ?? 'https://qdoc.example.com/roles'

    const claimRoles = payload[rolesClaim]
    const basicRoles = payload.roles

    const merged = [
      ...(Array.isArray(claimRoles) ? claimRoles : []),
      ...(Array.isArray(basicRoles) ? basicRoles : []),
    ]

    const roles: UserRole[] = merged.reduce<UserRole[]>((acc, role) => {
      if (typeof role === 'string' && isUserRole(role)) {
        acc.push(role)
      }

      return acc
    }, [])

    const normalizedRoles: UserRole[] = roles.length > 0 ? roles : ['patient']

    return {
      id: String(payload.sub ?? 'unknown-user'),
      authUserId: String(payload.sub ?? 'unknown-user'),
      name: String(payload.name ?? payload.nickname ?? payload.email ?? payload.sub ?? 'QDoc User'),
      roles: normalizedRoles,
    }
  }
}

