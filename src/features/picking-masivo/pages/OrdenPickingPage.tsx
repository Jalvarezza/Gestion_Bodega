import { useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import {
  useOrdenPicking, useTomarLinea, useLiberarLinea, useCancelarOrden, usePickingMasivoRealtime,
} from '../hooks/usePickingMasivo'
import { PickingLineaFlow } from '../components/PickingLineaFlow'
import type { LineaOrden } from '../services/pickingMasivo.api'

const ETIQUETA_LINEA: Record<string, string> = {
  libre: 'Disponible', en_progreso: 'En preparación', completado: 'Completa', parcial: 'Parcial', sin_stock: 'Sin stock',
}
const RESUELTAS = ['completado', 'parcial', 'sin_stock']

export function OrdenPickingPage() {
  const { id = '' }  = useParams<{ id: string }>()
  const navigate     = useNavigate()
  const usuarioId    = localStorage.getItem('user_id') ?? ''
  const rol          = localStorage.getItem('user_rol') ?? ''
  const esOperador   = rol === 'operador'
  const puedeCancelar = rol === 'admin' || rol === 'supervisor'

  const { data: orden, isLoading, isError, refetch } = useOrdenPicking(id)
  const tomar    = useTomarLinea()
  const liberar  = useLiberarLinea()
  const cancelar = useCancelarOrden()
  usePickingMasivoRealtime()

  const [lineaActiva, setLineaActiva] = useState<LineaOrden | null>(null)
  const [busqueda, setBusqueda] = useState('')
  const [aviso, setAviso] = useState<string | null>(null)

  async function iniciarLinea(l: LineaOrden) {
    setAviso(null)
    try {
      await tomar.mutateAsync({ usuarioId, itemId: l.id })
      setLineaActiva(l)
    } catch (e) {
      setAviso(e instanceof ApiResponseError ? e.message : 'No se pudo tomar la línea')
      void refetch()
    }
  }

  async function handleCancelar() {
    if (!orden || !window.confirm(`¿Cancelar la orden de la OC ${orden.numeroOc}? Las líneas pendientes no se prepararán.`)) return
    try {
      await cancelar.mutateAsync({ usuarioId, sesionId: orden.id })
      navigate('/picking-masivo')
    } catch (e) {
      setAviso(e instanceof ApiResponseError ? e.message : 'No se pudo cancelar la orden')
    }
  }

  if (isLoading) return <p className="cargando">Cargando orden…</p>
  if (isError || !orden) return <p className="error">Orden no encontrada</p>

  if (lineaActiva) {
    return (
      <PickingLineaFlow
        linea={lineaActiva}
        usuarioId={usuarioId}
        onSalir={() => { void liberar.mutateAsync({ usuarioId, itemId: lineaActiva.id }); setLineaActiva(null) }}
        onTerminada={(ordenCompleta) => {
          setLineaActiva(null)
          setAviso(ordenCompleta ? `La OC ${orden.numeroOc} quedó completada.` : null)
          void refetch()
        }}
      />
    )
  }

  const q = busqueda.trim().toLowerCase()
  const lineas = orden.lineas.filter((l) =>
    !q || l.sku.toLowerCase().includes(q) || l.nombre.toLowerCase().includes(q) || (l.codigoCliente ?? '').toLowerCase().includes(q))
  const pendientes = lineas.filter((l) => !RESUELTAS.includes(l.estado))
  const resueltas  = lineas.filter((l) => RESUELTAS.includes(l.estado))
  const pct = orden.unidadesPedidas > 0 ? Math.round((orden.unidadesPickeadas / orden.unidadesPedidas) * 100) : 0

  const filaLinea = (l: LineaOrden) => {
    const deOtro = l.estado === 'en_progreso' && l.tomadoPor !== usuarioId
    const stock  = l.ubicaciones.reduce((t, u) => t + u.cantidad, 0)
    return (
      <div key={l.id} className={`pmo-linea ${deOtro ? 'pmo-linea--bloqueada' : ''}`}>
        <div className="pmo-linea-info">
          <div className="pmo-linea-titulo"><code>{l.sku}</code> {l.nombre}</div>
          <div className="pmo-linea-meta">
            {l.codigoCliente && <span>Cód. cliente {l.codigoCliente}</span>}
            <span>{l.cantidadDespachada}/{l.cantidadPedida} uds</span>
            {!RESUELTAS.includes(l.estado) && <span>Stock {stock}{l.ubicaciones[0] ? ` · FIFO ${l.ubicaciones[0].posicionCodigo}` : ' · sin ubicación'}</span>}
            {l.motivo && <span>Motivo: {l.motivo}</span>}
          </div>
        </div>
        <div className="pmo-linea-acciones">
          <span className={`pmo-estado pmo-estado--${l.estado}`}>
            {deOtro ? `🔒 ${l.tomadoPorNombre ?? 'Otro operador'}` : ETIQUETA_LINEA[l.estado] ?? l.estado}
          </span>
          {esOperador && orden.estado === 'activa' && !RESUELTAS.includes(l.estado) && !deOtro && (
            <button className="btn-primario" disabled={tomar.isPending} onClick={() => void iniciarLinea(l)}>
              {l.estado === 'en_progreso' ? 'Continuar' : 'Picking'}
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="notas-page">
      <div className="notas-toolbar">
        <button className="btn-secundario" onClick={() => navigate('/picking-masivo')}>← Volver</button>
        <h1 className="notas-titulo">OC {orden.numeroOc}</h1>
        {puedeCancelar && orden.estado === 'activa' && (
          <button className="btn-secundario" disabled={cancelar.isPending} onClick={() => void handleCancelar()}>Cancelar orden</button>
        )}
      </div>

      <p className="pmo-resumen">
        {orden.nombreCliente} · {orden.lineasResueltas}/{orden.totalLineas} líneas · {orden.unidadesPickeadas.toLocaleString('es-CL')} / {orden.unidadesPedidas.toLocaleString('es-CL')} uds ({pct}%)
        {orden.estado === 'completada' && ' · Completada'}
      </p>
      <div className="nota-card-progress-bar"><div className="nota-card-progress-fill" style={{ width: `${pct}%` }} /></div>

      {aviso && <p className="pmo-aviso">{aviso}</p>}

      <input className="pmo-buscar" placeholder="Buscar por SKU, nombre o código cliente…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />

      {pendientes.length > 0 && <h2 className="pmo-subtitulo">Pendientes ({pendientes.length})</h2>}
      <div className="pmo-lineas">{pendientes.map(filaLinea)}</div>

      {resueltas.length > 0 && <h2 className="pmo-subtitulo">Resueltas ({resueltas.length})</h2>}
      <div className="pmo-lineas">{resueltas.map(filaLinea)}</div>
    </div>
  )
}
