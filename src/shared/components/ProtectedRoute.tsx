import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import type { UserRole } from '../types/base'

// Rutas que solo puede ver admin
const RUTAS_SOLO_ADMIN = ['/usuarios']
// Rutas bloqueadas para el operador
const RUTAS_ADMIN_SUPERVISOR = ['/salidas', '/historial', '/inventario-inicial']

interface Props {
  children:   React.ReactNode
  rutaActual: string
}

function limpiarSesion() {
  localStorage.removeItem('auth_token')
  localStorage.removeItem('user_rol')
  localStorage.removeItem('user_id')
  localStorage.removeItem('user_nombre')
}

// Valida el token en el servidor una vez por sesión de pestaña
let tokenValidado: string | null = null

export function ProtectedRoute({ children, rutaActual }: Props) {
  const token = localStorage.getItem('auth_token')
  const rol   = localStorage.getItem('user_rol') as UserRole | null

  const [estado, setEstado] = useState<'verificando' | 'ok' | 'invalido'>(
    token && token === tokenValidado ? 'ok' : (token ? 'verificando' : 'invalido')
  )

  const verificado = useRef(false)

  useEffect(() => {
    if (estado !== 'verificando' || verificado.current) return
    verificado.current = true

    fetch('/api/auth/me', {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('invalido')
        tokenValidado = token
        setEstado('ok')
      })
      .catch(() => {
        limpiarSesion()
        tokenValidado = null
        setEstado('invalido')
      })
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  if (estado === 'verificando') {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <p style={{ color: 'var(--text-secondary)' }}>Verificando sesión…</p>
      </div>
    )
  }

  if (estado === 'invalido') {
    return <Navigate to="/login" replace />
  }

  // Operador intenta ruta bloqueada → /productos
  if (rol === 'operador') {
    const bloqueada = (
      RUTAS_SOLO_ADMIN.some((r) => rutaActual.startsWith(r))
      || RUTAS_ADMIN_SUPERVISOR.some((r) => rutaActual.startsWith(r))
    )
    if (bloqueada) return <Navigate to="/productos" replace />
  }

  // Supervisor o validador intenta ruta solo-admin → /home
  if (rol === 'supervisor' || rol === 'validador') {
    const bloqueada = RUTAS_SOLO_ADMIN.some((r) => rutaActual.startsWith(r))
    if (bloqueada) return <Navigate to="/home" replace />
  }

  return <>{children}</>
}
