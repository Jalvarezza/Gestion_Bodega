// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export type UsuarioResumen = {
  id:        string
  nombre:    string
  email:     string
  rol:       string
  bloqueado: boolean
}

// Supabase Auth no tiene bloqueo permanente: se usa un ban de ~100 años.
const DURACION_BLOQUEO = '876000h'

function estaBloqueado(bannedUntil: string | null | undefined): boolean {
  return !!bannedUntil && new Date(bannedUntil).getTime() > Date.now()
}

export const usuariosService = {

  async listar(): Promise<ServiceResult<UsuarioResumen[]>> {
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol')
      .order('nombre')
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    // Resolver email y estado de bloqueo desde auth.users
    const { data: authList, error: authErr } = await supabase.auth.admin.listUsers({ perPage: 1000 })
    if (authErr) return { ok: false, error: { code: 'DB_ERROR', message: authErr.message } }

    const authMap: Record<string, { email: string; bloqueado: boolean }> = {}
    for (const u of authList.users) authMap[u.id] = { email: u.email ?? '', bloqueado: estaBloqueado(u.banned_until) }

    const result = (usuarios ?? []).map((u: any) => ({
      id:        u.id,
      nombre:    u.nombre,
      rol:       u.rol,
      email:     authMap[u.id]?.email ?? '',
      bloqueado: authMap[u.id]?.bloqueado ?? false,
    }))
    return { ok: true, data: result }
  },

  async crear(params: { nombre: string; email: string; password: string; rol: string }): Promise<ServiceResult<{ id: string }>> {
    const { data: authData, error: authErr } = await supabase.auth.admin.createUser({
      email:             params.email,
      password:          params.password,
      email_confirm:     true,
    })
    if (authErr || !authData.user) return { ok: false, error: { code: 'AUTH_ERROR', message: authErr?.message ?? 'Error al crear usuario' } }

    const { error: dbErr } = await supabase
      .from('usuarios')
      .insert({ id: authData.user.id, nombre: params.nombre, rol: params.rol })
    if (dbErr) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      return { ok: false, error: { code: 'DB_ERROR', message: dbErr.message } }
    }
    return { ok: true, data: { id: authData.user.id } }
  },

  async actualizarRol(params: { id: string; rol: string }): Promise<ServiceResult<{ ok: boolean }>> {
    const { error } = await supabase
      .from('usuarios')
      .update({ rol: params.rol })
      .eq('id', params.id)
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },

  async resetearPassword(params: { id: string; password: string }): Promise<ServiceResult<{ ok: boolean }>> {
    const { error } = await supabase.auth.admin.updateUserById(params.id, { password: params.password })
    if (error) return { ok: false, error: { code: 'AUTH_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },

  async bloquear(params: { id: string; bloqueado: boolean }): Promise<ServiceResult<{ ok: boolean }>> {
    const { error } = await supabase.auth.admin.updateUserById(params.id, {
      ban_duration: params.bloqueado ? DURACION_BLOQUEO : 'none',
    })
    if (error) return { ok: false, error: { code: 'AUTH_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },

  async eliminar(id: string): Promise<ServiceResult<{ ok: boolean }>> {
    const { error: dbErr } = await supabase.from('usuarios').delete().eq('id', id)
    if (dbErr) {
      // 23503: el usuario aparece en notas, movimientos, despachos, etc.
      if (dbErr.code === '23503') {
        return { ok: false, error: { code: 'TIENE_HISTORIAL', message: 'El usuario tiene registros asociados (notas, movimientos o despachos) y no se puede eliminar. Bloquéalo en su lugar.' } }
      }
      return { ok: false, error: { code: 'DB_ERROR', message: dbErr.message } }
    }
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return { ok: false, error: { code: 'AUTH_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },
}
