type ApiError = { code: string; message: string; field?: string }

export class ApiResponseError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly field?: string,
  ) {
    super(message)
    this.name = 'ApiResponseError'
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const method = options?.method ?? 'GET'

  if (!navigator.onLine && method !== 'GET') {
    throw new ApiResponseError('OFFLINE', 'Sin conexión — las operaciones de escritura requieren WiFi')
  }

  const token = localStorage.getItem('auth_token')

  const res = await fetch(`/api${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })

  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const err  = body.error as ApiError | undefined
    throw new ApiResponseError(
      err?.code    ?? 'HTTP_ERROR',
      err?.message ?? `Error ${res.status}`,
      err?.field,
    )
  }

  return res.json() as Promise<T>
}

export const apiClient = {
  get:    <T>(path: string)                        => request<T>(path),
  post:   <T>(path: string, body: unknown)         => request<T>(path, { method: 'POST',  body: JSON.stringify(body) }),
  put:    <T>(path: string, body: unknown)         => request<T>(path, { method: 'PUT',   body: JSON.stringify(body) }),
  delete: <T>(path: string)                        => request<T>(path, { method: 'DELETE' }),
}
