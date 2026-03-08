export const ALL_ROLES = ['patient', 'staff', 'admin', 'robot'] as const

export type UserRole = (typeof ALL_ROLES)[number]

export interface AuthenticatedUser {
  id: string
  name: string
  roles: UserRole[]
  authUserId?: string
}
