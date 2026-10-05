import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { apiClient } from '../../../shared/utils/apiClient'

type Usuario = { id: string; nombre: string; email: string; rol: string }
type Rol = 'admin' | 'supervisor' | 'operador'

const ROL_LABELS: Record<Rol, string> = {
  admin:      'Administrador',
  supervisor: 'Supervisor',
  operador:   'Operador',
}
const ROL_COLORS: Record<Rol, string> = {
  admin:      'var(--accent)',
  supervisor: '#a78bfa',
  operador:   'var(--success)',
}

function useUsuarios() {
  return useQuery<Usuario[]>({
    queryKey: ['usuarios'],
    queryFn:  () => apiClient.get('/usuarios'),
    staleTime: 0,
  })
}

export function UsuariosPage() {
  const qc = useQueryClient()
  const { data: usuarios = [], isLoading, isError } = useUsuarios()

  const [modalCrear, setModalCrear]       = useState(false)
  const [modalPassword, setModalPassword] = useState<Usuario | null>(null)
  const [modalRol, setModalRol]           = useState<Usuario | null>(null)
  const [modalEliminar, setModalEliminar] = useState<Usuario | null>(null)

  // Formulario crear
  const [nombre, setNombre]     = useState('')
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [rol, setRol]           = useState<Rol>('operador')
  const [errorForm, setErrorForm] = useState<string | null>(null)

  // Formulario password
  const [newPassword, setNewPassword]   = useState('')
  const [errorPwd, setErrorPwd]         = useState<string | null>(null)

  // Formulario rol
  const [nuevoRol, setNuevoRol] = useState<Rol>('operador')
  const [errorRol, setErrorRol] = useState<string | null>(null)

  const crear = useMutation({
    mutationFn: (body: object) => apiClient.post('/usuarios?accion=crear', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); resetCrear() },
  })
  const cambiarRol = useMutation({
    mutationFn: (body: object) => apiClient.post('/usuarios?accion=rol', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setModalRol(null) },
  })
  const resetPassword = useMutation({
    mutationFn: (body: object) => apiClient.post('/usuarios?accion=password', body),
    onSuccess: () => { setModalPassword(null); setNewPassword(''); setErrorPwd(null) },
  })
  const eliminar = useMutation({
    mutationFn: (body: object) => apiClient.post('/usuarios?accion=eliminar', body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['usuarios'] }); setModalEliminar(null) },
  })

  function resetCrear() {
    setModalCrear(false); setNombre(''); setEmail(''); setPassword(''); setRol('operador'); setErrorForm(null)
  }

  async function handleCrear() {
    setErrorForm(null)
    try {
      await crear.mutateAsync({ nombre, email, password, rol })
    } catch (e: any) {
      setErrorForm(e?.message ?? 'Error al crear usuario')
    }
  }

  async function handleCambiarRol() {
    if (!modalRol) return
    setErrorRol(null)
    try {
      await cambiarRol.mutateAsync({ id: modalRol.id, rol: nuevoRol })
    } catch (e: any) {
      setErrorRol(e?.message ?? 'Error al cambiar rol')
    }
  }

  async function handleResetPassword() {
    if (!modalPassword) return
    setErrorPwd(null)
    if (newPassword.length < 6) { setErrorPwd('La contraseña debe tener al menos 6 caracteres'); return }
    try {
      await resetPassword.mutateAsync({ id: modalPassword.id, password: newPassword })
    } catch (e: any) {
      setErrorPwd(e?.message ?? 'Error al cambiar contraseña')
    }
  }

  async function handleEliminar() {
    if (!modalEliminar) return
    try {
      await eliminar.mutateAsync({ id: modalEliminar.id })
    } catch {}
  }

  const MODAL_STYLE: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999,
  }
  const BOX_STYLE: React.CSSProperties = {
    background: 'var(--bg-card, #1e2229)', border: '1px solid var(--border)',
    borderRadius: '16px', padding: '2rem',
    width: 'min(480px, 92vw)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
  }

  return (
    <div className="notas-page">
      <div className="notas-veroc-wrap">
        <h1 className="notas-titulo">Usuarios</h1>
        <button className="btn-primario" onClick={() => setModalCrear(true)}>+ Nuevo usuario</button>
      </div>

      {isLoading && <p className="cargando">Cargando usuarios…</p>}
      {isError   && <p className="error">Error al cargar usuarios</p>}

      {!isLoading && !isError && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginTop: '1rem' }}>
          {usuarios.map((u) => (
            <div key={u.id} style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1.1rem 1.4rem',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: '16px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '1rem', color: 'var(--text-primary)' }}>{u.nombre}</div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)', marginTop: 3 }}>{u.email}</div>
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: 700, padding: '5px 14px', borderRadius: '999px', background: `${ROL_COLORS[u.rol as Rol]}22`, color: ROL_COLORS[u.rol as Rol] ?? 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                {ROL_LABELS[u.rol as Rol] ?? u.rol}
              </span>
              <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
                <button
                  className="btn-secundario"
                  style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '10px' }}
                  onClick={() => { setModalRol(u); setNuevoRol(u.rol as Rol) }}
                >Rol</button>
                <button
                  className="btn-secundario"
                  style={{ fontSize: '0.8rem', padding: '6px 14px', borderRadius: '10px' }}
                  onClick={() => { setModalPassword(u); setNewPassword(''); setErrorPwd(null) }}
                >Contraseña</button>
                <button
                  style={{ fontSize: '0.8rem', padding: '6px 14px', background: 'rgba(239,68,68,0.12)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: '10px', cursor: 'pointer', fontWeight: 600 }}
                  onClick={() => setModalEliminar(u)}
                >Eliminar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal crear usuario */}
      {modalCrear && (
        <div style={MODAL_STYLE} onClick={resetCrear}>
          <div style={BOX_STYLE} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-titulo">Nuevo usuario</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <label className="pm-confirmar-label">Nombre completo
                <input className="pm-confirmar-input" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej: Juan Pérez" autoFocus />
              </label>
              <label className="pm-confirmar-label">Correo electrónico
                <input className="pm-confirmar-input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="correo@empresa.cl" />
              </label>
              <label className="pm-confirmar-label">Contraseña inicial
                <input className="pm-confirmar-input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Mínimo 6 caracteres" />
              </label>
              <label className="pm-confirmar-label">Rol
                <select className="pm-confirmar-input" value={rol} onChange={(e) => setRol(e.target.value as Rol)}
                  style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                  <option value="operador">Operador</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
              {errorForm && <p className="pm-confirmar-barcode-error">{errorForm}</p>}
            </div>
            <div className="pm-confirmar-acciones" style={{ marginTop: '1.25rem', flexWrap: 'wrap' }}>
              <button className="btn-secundario pm-confirmar-btn" onClick={resetCrear}>Cancelar</button>
              <button className="btn-primario pm-confirmar-btn" disabled={crear.isPending || !nombre.trim() || !email.trim() || password.length < 6} onClick={handleCrear}>
                {crear.isPending ? 'Creando…' : 'Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal cambiar rol */}
      {modalRol && (
        <div style={MODAL_STYLE} onClick={() => setModalRol(null)}>
          <div style={BOX_STYLE} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-titulo">Cambiar rol — {modalRol.nombre}</h3>
            <label className="pm-confirmar-label">Nuevo rol
              <select className="pm-confirmar-input" value={nuevoRol} onChange={(e) => setNuevoRol(e.target.value as Rol)}
                style={{ background: 'var(--bg-elevated)', color: 'var(--text-primary)' }}>
                <option value="operador">Operador</option>
                <option value="supervisor">Supervisor</option>
                <option value="admin">Administrador</option>
              </select>
            </label>
            {errorRol && <p className="pm-confirmar-barcode-error">{errorRol}</p>}
            <div className="pm-confirmar-acciones" style={{ marginTop: '1rem' }}>
              <button className="btn-secundario pm-confirmar-btn" onClick={() => setModalRol(null)}>Cancelar</button>
              <button className="btn-primario pm-confirmar-btn" disabled={cambiarRol.isPending} onClick={handleCambiarRol}>
                {cambiarRol.isPending ? 'Guardando…' : 'Guardar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal resetear contraseña */}
      {modalPassword && (
        <div style={MODAL_STYLE} onClick={() => setModalPassword(null)}>
          <div style={BOX_STYLE} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-titulo">Nueva contraseña — {modalPassword.nombre}</h3>
            <label className="pm-confirmar-label">Contraseña
              <input className="pm-confirmar-input" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleResetPassword()} />
            </label>
            {errorPwd && <p className="pm-confirmar-barcode-error">{errorPwd}</p>}
            <div className="pm-confirmar-acciones" style={{ marginTop: '1rem' }}>
              <button className="btn-secundario pm-confirmar-btn" onClick={() => setModalPassword(null)}>Cancelar</button>
              <button className="btn-primario pm-confirmar-btn" disabled={resetPassword.isPending || !newPassword.trim()} onClick={handleResetPassword}>
                {resetPassword.isPending ? 'Guardando…' : 'Cambiar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal confirmar eliminar */}
      {modalEliminar && (
        <div style={MODAL_STYLE} onClick={() => setModalEliminar(null)}>
          <div style={BOX_STYLE} onClick={(e) => e.stopPropagation()}>
            <h3 className="modal-titulo">Eliminar usuario</h3>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1rem' }}>
              ¿Eliminar a <strong style={{ color: 'var(--text-primary)' }}>{modalEliminar.nombre}</strong>? Esta acción no se puede deshacer.
            </p>
            <div className="pm-confirmar-acciones">
              <button className="btn-secundario pm-confirmar-btn" onClick={() => setModalEliminar(null)}>Cancelar</button>
              <button
                style={{ flex: 1, padding: '0.6rem 1rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', border: '1px solid rgba(239,68,68,0.4)', borderRadius: '0.5rem', cursor: 'pointer', fontWeight: 700 }}
                disabled={eliminar.isPending}
                onClick={handleEliminar}
              >
                {eliminar.isPending ? 'Eliminando…' : 'Sí, eliminar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
