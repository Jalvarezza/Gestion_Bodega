import { useState } from 'react'
import { supabase as supabaseClient } from '../../../lib/supabaseClient'
import type { UserRole } from '../../../shared/types/base'

export type AuthState = {
  token:  string | null
  rol:    UserRole | null
  userId: string | null
}

function leerSesion(): AuthState {
  return {
    token:  localStorage.getItem('auth_token'),
    rol:    localStorage.getItem('user_rol') as UserRole | null,
    userId: localStorage.getItem('user_id'),
  }
}

function guardarSesion(token: string, rol: UserRole, userId: string, nombre: string) {
  localStorage.setItem('auth_token', token)
  localStorage.setItem('user_rol', rol)
  localStorage.setItem('user_id', userId)
  localStorage.setItem('user_nombre', nombre)
}

function limpiarSesion() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user_rol')
  localStorage.removeItem('user_id')
  localStorage.removeItem('user_nombre')
}

export function useAuth() {
  const [sesion, setSesion] = useState<AuthState>(leerSesion)

  async function login(email: string, password: string): Promise<{ ok: true } | { ok: false; mensaje: string }> {
    // Paso 1: autenticar con Supabase Auth
    const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password })

    // Paso 2: credenciales incorrectas
    if (error || !data.session) {
      return { ok: false, mensaje: 'Credenciales incorrectas. Verifica tu email y contraseña.' }
    }

    const session = data.session

    // Obtener rol via API Route (usa service role key, sin restricciones RLS)
    let response: Response
    try {
      response = await fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
    } catch {
      await supabaseClient.auth.signOut()
      return { ok: false, mensaje: 'No se pudo conectar con el servidor. Verifica tu conexión.' }
    }

    if (!response.ok) {
      await supabaseClient.auth.signOut()
      return { ok: false, mensaje: 'Usuario no configurado en el sistema. Contacta al administrador.' }
    }

    const usuario = await response.json() as { rol: string; nombre: string; id: string }

    // Guardar en localStorage
    const rol = usuario.rol as UserRole
    guardarSesion(session.access_token, rol, session.user.id, usuario.nombre)
    setSesion({ token: session.access_token, rol, userId: session.user.id })
    return { ok: true }
  }

  async function logout() {
    await supabaseClient.auth.signOut()
    limpiarSesion()
    setSesion({ token: null, rol: null, userId: null })
  }

  return { sesion, login, logout }
}
