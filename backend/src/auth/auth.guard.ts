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
      const bypassUser = this.tryCreateBypassUser(request)
      if (bypassUser) {
        request.user = bypassUser
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

  private isLocalBypassEnabled() {
    return String(this.configService.get('AUTH_LOCAL_BYPASS') ?? '').toLowerCase() === 'true'
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

  private isHeaderBypassEnabled() {
    return this.isLocalBypassEnabled() || this.isDevBypassEnabled()
  }

  private tryCreateBypassUser(request: AuthenticatedRequest): AuthenticatedUser | null {
    if (!this.isHeaderBypassEnabled()) {
      return null
    }

    const rawRole = this.readHeader(request, 'x-local-role', 'x-dev-role')
    const role = rawRole && isUserRole(rawRole) ? rawRole : 'patient'

    const rawUserId = this.readHeader(request, 'x-local-user-id', 'x-dev-user-id')
    const rawName = this.readHeader(request, 'x-local-name', 'x-dev-name')

    if (!rawUserId && !rawName) {
      return null
    }

    const normalizedId = rawUserId ?? rawName?.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') ?? 'local-user'

    return {
      id: normalizedId,
      name: rawName ?? 'QDoc User',
      roles: [role],
      authUserId: normalizedId,
    }
  }

  private readHeader(request: AuthenticatedRequest, ...headerNames: string[]) {
    for (const headerName of headerNames) {
      const value = request.headers[headerName]
      const normalized = Array.isArray(value) ? value[0] : value
      if (typeof normalized === 'string' && normalized.trim()) {
        return normalized.trim()
      }
    }

    return undefined
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
