import { useState, useEffect, useRef } from 'react'
import { Navigate } from 'react-router-dom'
import type { UserRole } from '../types/base'

// Rutas que solo puede ver admin
const RUTAS_SOLO_ADMIN = ['/ingresos', '/etiquetas', '/usuarios']
// Rutas que puede ver admin + supervisor (no operador)
const RUTAS_ADMIN_SUPERVISOR = ['/salidas', '/picking-masivo', '/historial', '/inventario-inicial']

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

  // Operador intenta ruta de admin o admin+supervisor → /productos
  // Excepción: /picking-masivo/operador es la ruta propia del operador
  if (rol === 'operador') {
    const esRutaOperadorPM = rutaActual.startsWith('/picking-masivo/operador')
    const esRutaOla        = rutaActual.startsWith('/picking-masivo/ola/')
    const bloqueada = !esRutaOperadorPM && !esRutaOla && (
      RUTAS_SOLO_ADMIN.some((r) => rutaActual.startsWith(r))
      || RUTAS_ADMIN_SUPERVISOR.some((r) => rutaActual.startsWith(r))
    )
    if (bloqueada) return <Navigate to="/productos" replace />
  }

  // Supervisor intenta ruta solo-admin → /picking-masivo
  if (rol === 'supervisor') {
    const bloqueada = RUTAS_SOLO_ADMIN.some((r) => rutaActual.startsWith(r))
    if (bloqueada) return <Navigate to="/picking-masivo" replace />
  }

  return <>{children}</>
}
