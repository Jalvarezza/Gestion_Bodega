// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export type UsuarioResumen = {
  id:     string
  nombre: string
  email:  string
  rol:    string
}

export const usuariosService = {

  async listar(): Promise<ServiceResult<UsuarioResumen[]>> {
    const { data: usuarios, error } = await supabase
      .from('usuarios')
      .select('id, nombre, rol')
      .order('nombre')
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    // Resolver emails desde auth.users
    const { data: authList, error: authErr } = await supabase.auth.admin.listUsers()
    if (authErr) return { ok: false, error: { code: 'DB_ERROR', message: authErr.message } }

    const emailMap: Record<string, string> = {}
    for (const u of authList.users) emailMap[u.id] = u.email ?? ''

    const result = (usuarios ?? []).map((u: any) => ({
      id:     u.id,
      nombre: u.nombre,
      rol:    u.rol,
      email:  emailMap[u.id] ?? '',
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

  async eliminar(id: string): Promise<ServiceResult<{ ok: boolean }>> {
    await supabase.from('usuarios').delete().eq('id', id)
    const { error } = await supabase.auth.admin.deleteUser(id)
    if (error) return { ok: false, error: { code: 'AUTH_ERROR', message: error.message } }
    return { ok: true, data: { ok: true } }
  },
}
