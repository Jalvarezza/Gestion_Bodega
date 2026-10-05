export interface Env {
  SUPABASE_URL: string
  SUPABASE_SERVICE_ROLE_KEY: string
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

export function errStatus(code: string): number {
  if (code === 'NOT_FOUND') return 404
  if (code === 'UNAUTHORIZED') return 403
  if (code === 'CONFLICT' || code === 'INVALID_STATE' ||
      code === 'CONFLICT_POSICION_OCUPADA' || code === 'CONFLICT_CONCURRENCIA') return 409
  if (code === 'VALIDATION_ERROR') return 400
  return 500
}

export function sp(request: Request): URLSearchParams {
  return new URL(request.url).searchParams
}
