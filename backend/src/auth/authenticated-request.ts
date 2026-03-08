import { Request } from 'express'

import { AuthenticatedUser } from './auth.types'

export type AuthenticatedRequest = Request & {
  user?: AuthenticatedUser
}
