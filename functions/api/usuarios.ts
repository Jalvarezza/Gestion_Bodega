import { initSupabase, supabase } from '../../api/lib/supabase/client'
import { usuariosService } from '../../api/usuarios/usuarios.service'
import { json, type Env } from '../_lib/cf'
import { z } from 'zod'

const ROLES_VALIDOS = ['admin', 'supervisor', 'operador'] as const

const crearSchema = z.object({
  nombre:   z.string().min(2),
  email:    z.string().email(),
  password: z.string().min(6),
  rol:      z.enum(ROLES_VALIDOS),
})
const rolSchema      = z.object({ id: z.string().uuid(), rol: z.enum(ROLES_VALIDOS) })
const passwordSchema = z.object({ id: z.string().uuid(), password: z.string().min(6) })
const idSchema       = z.object({ id: z.string().uuid() })

async function getAdminRol(request: Request): Promise<string | null> {
  const auth = request.headers.get('authorization')
  if (!auth?.startsWith('Bearer ')) return null
  const token = auth.slice(7)
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  const { data: u } = await supabase.from('usuarios').select('rol').eq('id', data.user.id).single()
  return u?.rol ?? null
}

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const rol = await getAdminRol(request)
  if (rol !== 'admin') return json({ error: { code: 'FORBIDDEN', message: 'Solo admins pueden gestionar usuarios' } }, 403)

  const url    = new URL(request.url)
  const accion = url.searchParams.get('accion')

  if (request.method === 'GET') {
    const result = await usuariosService.listar()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}))

    if (accion === 'crear') {
      const p = crearSchema.safeParse(body)
      if (!p.success) {
        const issue = p.error.issues[0]
        const msg = issue?.path[0] === 'password'
          ? 'La contraseña debe tener al menos 6 caracteres'
          : issue?.path[0] === 'email'
          ? 'El correo electrónico no es válido'
          : issue?.path[0] === 'nombre'
          ? 'El nombre debe tener al menos 2 caracteres'
          : 'Datos inválidos'
        return json({ error: { code: 'VALIDATION_ERROR', message: msg } }, 400)
      }
      const result = await usuariosService.crear(p.data)
      return result.ok ? json(result.data, 201) : json({ error: result.error }, 500)
    }
    if (accion === 'rol') {
      const p = rolSchema.safeParse(body)
      if (!p.success) return json({ error: { code: 'VALIDATION_ERROR', message: 'Rol inválido' } }, 400)
      const result = await usuariosService.actualizarRol(p.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'password') {
      const p = passwordSchema.safeParse(body)
      if (!p.success) return json({ error: { code: 'VALIDATION_ERROR', message: 'La contraseña debe tener al menos 6 caracteres' } }, 400)
      const result = await usuariosService.resetearPassword(p.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    if (accion === 'eliminar') {
      const p = idSchema.safeParse(body)
      if (!p.success) return json({ error: { code: 'VALIDATION_ERROR', message: p.error.message } }, 400)
      const result = await usuariosService.eliminar(p.data.id)
      return result.ok ? json(result.data) : json({ error: result.error }, 500)
    }
    return json({ error: 'Acción no reconocida' }, 400)
  }

  return json({ error: 'Método no permitido' }, 405)
}
