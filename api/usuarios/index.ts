// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { z } from 'zod'
import { supabase } from '../lib/supabase/client'
import { usuariosService } from './usuarios.service'

const ROLES_VALIDOS = ['admin', 'supervisor', 'validador', 'operador'] as const

const crearSchema = z.object({
  nombre:   z.string().trim().min(2),
  email:    z.string().trim().email(),
  password: z.string().min(6),
  rol:      z.enum(ROLES_VALIDOS),
})
const rolSchema      = z.object({ id: z.string().uuid(), rol: z.enum(ROLES_VALIDOS) })
const passwordSchema = z.object({ id: z.string().uuid(), password: z.string().min(6) })
const bloquearSchema = z.object({ id: z.string().uuid(), bloqueado: z.boolean() })
const idSchema       = z.object({ id: z.string().uuid() })

async function obtenerAdmin(req: NextApiRequest): Promise<string | null> {
  const token = req.headers.authorization?.replace('Bearer ', '')
  if (!token) return null
  const { data, error } = await supabase.auth.getUser(token)
  if (error || !data.user) return null
  const { data: u } = await supabase.from('usuarios').select('rol').eq('id', data.user.id).single()
  return u?.rol === 'admin' ? data.user.id : null
}

function mensajeCrear(issue: z.ZodIssue | undefined): string {
  switch (issue?.path[0]) {
    case 'password': return 'La contraseña debe tener al menos 6 caracteres'
    case 'email':    return 'El correo electrónico no es válido'
    case 'nombre':   return 'El nombre debe tener al menos 2 caracteres'
    default:         return 'Datos inválidos'
  }
}

function statusDeError(code: string): number {
  if (code === 'TIENE_HISTORIAL') return 409
  if (code === 'AUTH_ERROR')      return 400
  return 500
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const adminId = await obtenerAdmin(req)
  if (!adminId) {
    return res.status(403).json({ error: { code: 'FORBIDDEN', message: 'Solo admins pueden gestionar usuarios' } })
  }

  if (req.method === 'GET') {
    const result = await usuariosService.listar()
    return result.ok ? res.status(200).json(result.data) : res.status(500).json({ error: result.error })
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Método no permitido' })

  const accion = typeof req.query.accion === 'string' ? req.query.accion : ''
  const body   = req.body ?? {}

  if (accion === 'crear') {
    const p = crearSchema.safeParse(body)
    if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: mensajeCrear(p.error.issues[0]) } })
    const result = await usuariosService.crear(p.data)
    return result.ok ? res.status(201).json(result.data) : res.status(statusDeError(result.error.code)).json({ error: result.error })
  }

  if (accion === 'password') {
    const p = passwordSchema.safeParse(body)
    if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'La contraseña debe tener al menos 6 caracteres' } })
    const result = await usuariosService.resetearPassword(p.data)
    return result.ok ? res.status(200).json(result.data) : res.status(statusDeError(result.error.code)).json({ error: result.error })
  }

  // Acciones que no pueden aplicarse sobre el propio admin (evita quedar sin acceso)
  const sobreSiMismo = (id: string) => id === adminId
  const ERROR_PROPIO = { code: 'ACCION_PROPIA', message: 'No puedes aplicar esta acción sobre tu propio usuario' }

  if (accion === 'rol') {
    const p = rolSchema.safeParse(body)
    if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Rol inválido' } })
    if (sobreSiMismo(p.data.id)) return res.status(400).json({ error: ERROR_PROPIO })
    const result = await usuariosService.actualizarRol(p.data)
    return result.ok ? res.status(200).json(result.data) : res.status(statusDeError(result.error.code)).json({ error: result.error })
  }

  if (accion === 'bloquear') {
    const p = bloquearSchema.safeParse(body)
    if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } })
    if (sobreSiMismo(p.data.id)) return res.status(400).json({ error: ERROR_PROPIO })
    const result = await usuariosService.bloquear(p.data)
    return result.ok ? res.status(200).json(result.data) : res.status(statusDeError(result.error.code)).json({ error: result.error })
  }

  if (accion === 'eliminar') {
    const p = idSchema.safeParse(body)
    if (!p.success) return res.status(400).json({ error: { code: 'VALIDATION_ERROR', message: 'Datos inválidos' } })
    if (sobreSiMismo(p.data.id)) return res.status(400).json({ error: ERROR_PROPIO })
    const result = await usuariosService.eliminar(p.data.id)
    return result.ok ? res.status(200).json(result.data) : res.status(statusDeError(result.error.code)).json({ error: result.error })
  }

  return res.status(400).json({ error: { code: 'ACCION_INVALIDA', message: 'Acción no reconocida' } })
}
