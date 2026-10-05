export type DomainError = {
  code: string
  message: string
  field?: string
}

export type ServiceResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: DomainError }

export type UserRole = 'admin' | 'supervisor' | 'operador'

export type AuthUser = {
  id: string
  email: string
  role: UserRole
}
