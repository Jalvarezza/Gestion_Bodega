import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useQueryClient } from '@tanstack/react-query'
import { useCancelarSesion, useSesionPicking, useGuardarLpns, useParcharSkuProveedor } from '../hooks/usePickingMasivo'
import { useRealtimeSesion } from '../hooks/useRealtimePicking'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import type { SesionResumen } from '../services/picking-masivo.api'

// ── Tipos ─────────────────────────────────────────────────────────────────────

type SubtareaDetalle = {
  id:                    string
  posicion_codigo:       string
  orden_fifo:            number
  cantidad_asignada:     number
  cantidad_despachada:   number | null
  estado:                string
  bloqueado_por:         string | null
  bloqueado_por_nombre:  string | null
  bloqueado_en:          string | null
  completado_por:        string | null
  completado_por_nombre: string | null
  completado_en:         string | null
  motivo_diferencia:     string | null
  es_equivalente:        boolean
  producto_real_id:      string | null
  producto_equivalente:  { codigo: string; descripcion: string } | null
}

type ItemDetalle = {
  id:                  string
  codigo:              string
  descripcion:         string
  cantidad_pedida:     number
  cantidad_despachada: number
  estado:              string
  motivo_diferencia:   string | null
  lpn:                 string | null
  lpn_validado:        boolean | null
  tienda:              string | null
  codigo_barra:        string | null
  sku_proveedor:       string | null
  subtareas_picking_masivo: SubtareaDetalle[]
}

type SesionDetalle = SesionResumen & { items: ItemDetalle[] }

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtFecha(iso: string | null | undefined) {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('-')
}

function fmtFechaHora(iso: string | null | undefined) {
  if (!iso) return '—'
  const d = new Date(iso)
  const fecha = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
  const hora  = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
  return `${fecha} ${hora} hrs`
}

function tiempoRelativo(iso: string | null | undefined) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  if (diff < 60000)    return 'Hace < 1 min'
  if (diff < 3600000)  return `Hace ${Math.floor(diff / 60000)} min`
  return `Hace ${Math.floor(diff / 3600000)} hr`
}

function opNombre(nombre: string | null | undefined, id: string | null | undefined) {
  if (nombre) return nombre
  if (!id) return '—'
  return `Op. …${id.slice(-4)}`
}

// ── Íconos ────────────────────────────────────────────────────────────────────

function IcoBack() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
}
function IcoDownload() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
}
function IcoUser() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
}

function IcoPin() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
}
function IcoUnlock() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>
}
function IcoEye() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
}
function IcoTool() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={13} height={13}><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
}
function IcoChevron({ open }: { open: boolean }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14} style={{ transition: 'transform 0.2s', transform: open ? 'rotate(180deg)' : 'none' }}><polyline points="6 9 12 15 18 9"/></svg>
}

// ── Labels ────────────────────────────────────────────────────────────────────

const ESTADO_SESION_LABELS: Record<string, string> = {
  validando: 'Validando', en_proceso: 'En Proceso', completada: 'Completada',
  despachado: 'Despachado', cancelada: 'Cancelada',
}

const ESTADO_ITEM_BADGE: Record<string, { label: string; cls: string }> = {
  libre:       { label: 'Libre',        cls: 'sd-badge--libre' },
  en_progreso: { label: 'En Proceso',   cls: 'sd-badge--proceso' },
  completado:  { label: 'Completado',   cls: 'sd-badge--ok' },
  parcial:     { label: 'Parcial',      cls: 'sd-badge--parcial' },
  sin_stock:   { label: 'Sin Stock',    cls: 'sd-badge--sinstock' },
  bloqueado:   { label: 'Bloqueado',    cls: 'sd-badge--proceso' },
}

const SESION_BADGE_CLS: Record<string, string> = {
  en_proceso: 'sd-sesion-badge--activa', completada: 'sd-sesion-badge--completada',
  despachado: 'sd-sesion-badge--despachada', cancelada: 'sd-sesion-badge--cancelada',
  validando: 'sd-sesion-badge--validando',
}

// ── Componente principal ───────────────────────────────────────────────────────

export function SesionDetallePage() {
  const { id }   = useParams<{ id: string }>()
  const navigate = useNavigate()
  const sesionId = id ?? null

  const { data, isLoading, isError } = useSesionPicking(sesionId)
  useRealtimeSesion(sesionId)
  const cancelarSesion    = useCancelarSesion()
  const guardarLpns       = useGuardarLpns()
  const parcharSku        = useParcharSkuProveedor(sesionId ?? '')
  const qc                = useQueryClient()
  const fileInputRef      = useRef<HTMLInputElement>(null)
  const skuFileInputRef   = useRef<HTMLInputElement>(null)

  const [confirmarCancelar, setConfirmarCancelar] = useState(false)
  const [error, setError]               = useState<string | null>(null)
  const [skuMap, setSkuMap]             = useState<Map<string, string>>(new Map())
  const [skuMapLabel, setSkuMapLabel]   = useState<string | null>(null)
  const [expandido, setExpandido]       = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda]         = useState('')
  const [filtroEstado, setFiltroEstado] = useState<'todos' | 'libre' | 'parcial' | 'sin_stock' | 'completado'>('todos')
  const [productosConfirmados, setProductosConfirmados] = useState(false)
  const [lpnCount, setLpnCount]     = useState(0)
  const [lpnSubiendo, setLpnSubiendo] = useState(false)
  const [lpnError, setLpnError]     = useState<string | null>(null)

  useEffect(() => {
    if (!sesionId) return
    qc.invalidateQueries({ queryKey: ['picking-masivo', 'sesion', sesionId] })
    try { setProductosConfirmados(localStorage.getItem(`pm_productos_ok_${sesionId}`) === '1') } catch {}
  }, [sesionId, qc])

  useEffect(() => {
    const lpnsDb = (data as any)?.lpns_excel as unknown[] | undefined
    if (lpnsDb) setLpnCount(lpnsDb.length)
  }, [data])

  const toggleExpandido = useCallback((id: string) => {
    setExpandido((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }, [])

  async function handleCancelar() {
    if (!sesionId) return
    setError(null)
    try {
      await cancelarSesion.mutateAsync(sesionId)
      setConfirmarCancelar(false)
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al cancelar la sesión')
    }
  }

  function handleArchivoLpn(file: File) {
    setLpnError(null)
    setLpnSubiendo(true)
    const reader = new FileReader()
    reader.onload = async (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellText: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false }) as (string | null)[][]
        type LpnEntry = { lpn: string; totalEmpaque: number; items: { codigo: string; tienda: string; cantidad: number }[] }
        const lpnMap = new Map<string, LpnEntry>()
        let currentLpn: string | null = null
        for (const row of raw.slice(1)) {
          const col0 = String(row[0] ?? '').trim()
          const col1 = String(row[1] ?? '').trim()
          const col2 = String(row[2] ?? '').trim()
          const col3 = String(row[3] ?? '').trim()
          if (!col0 && !col1) continue
          if (col0.startsWith('Total ')) {
            const entry = lpnMap.get(col0.replace('Total ', '').trim())
            if (entry) entry.totalEmpaque = parseInt(col3, 10) || 0
            currentLpn = null
          } else if (col0 && /^\d+$/.test(col0)) {
            currentLpn = col0
            if (!lpnMap.has(currentLpn)) lpnMap.set(currentLpn, { lpn: currentLpn, totalEmpaque: 0, items: [] })
            if (col1) lpnMap.get(currentLpn)!.items.push({ codigo: col1, tienda: col2, cantidad: parseInt(col3, 10) || 0 })
          } else if (!col0 && col1 && currentLpn) {
            lpnMap.get(currentLpn)!.items.push({ codigo: col1, tienda: col2, cantidad: parseInt(col3, 10) || 0 })
          }
        }
        const entradas = [...lpnMap.values()]
        if (entradas.length === 0) { setLpnError('Sin LPNs válidos'); setLpnSubiendo(false); return }
        setLpnCount(entradas.length)
        try { await guardarLpns.mutateAsync({ sesionId: sesionId!, lpnsData: entradas }) }
        catch (e) { setLpnError(`Error al guardar: ${e instanceof Error ? e.message : 'desconocido'}`) }
      } catch { setLpnError('Error al leer el Excel') }
      finally {
        setLpnSubiendo(false)
        if (fileInputRef.current) fileInputRef.current.value = ''
      }
    }
    reader.readAsArrayBuffer(file)
  }

  async function handleSkuFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    try {
      const { parsearExcelSkuProveedor } = await import('../utils/parsearExcelSkuProveedor')
      const { items, error: parseError } = await parsearExcelSkuProveedor(file)
      if (parseError || items.length === 0) { setError(parseError ?? 'No se encontraron items'); return }
      const mapa = new Map(items.map(i => [i.codigo, i.skuProveedor]))
      setSkuMap(mapa)
      setSkuMapLabel(`SKU cargado: ${mapa.size} productos — ahora descarga el Excel`)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al leer el archivo')
    }
  }

  function descargarExcel() {
    const LABEL: Record<string, string> = { completado: 'Completado', parcial: 'Parcial', sin_stock: 'Sin stock', libre: 'Pendiente', bloqueado: 'En progreso' }
    const filas: Record<string, unknown>[] = []
    for (const item of sesion.items) {
      for (const sub of item.subtareas_picking_masivo) {
        const eq = sub.es_equivalente && sub.producto_equivalente
          ? `${sub.producto_equivalente.codigo} — ${sub.producto_equivalente.descripcion}` : ''
        filas.push({
          'UPC / EAN': item.codigo_barra ?? '—', 'SKU': skuMap.get(item.codigo) ?? item.sku_proveedor ?? item.codigo,
          'Descripción': item.descripcion ?? item.codigo,
          'Código': item.codigo, 'LPN': item.lpn ?? '—',
          'Cant. Solicitada': sub.cantidad_asignada,
          'Cant. Despachada': sub.cantidad_despachada ?? 0,
          'Diferencia': (sub.cantidad_despachada ?? 0) - sub.cantidad_asignada,
          'Estado': LABEL[sub.estado] ?? sub.estado, 'Motivo': sub.motivo_diferencia ?? '',
          'Producto equivalente': eq,
        })
      }
    }
    const ws = XLSX.utils.json_to_sheet(filas)
    ws['!cols'] = [{ wch: 18 }, { wch: 14 }, { wch: 40 }, { wch: 16 }, { wch: 22 }, { wch: 16 }, { wch: 16 }, { wch: 12 }, { wch: 14 }, { wch: 30 }, { wch: 45 }]
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Detalle')
    XLSX.writeFile(wb, `picking-${sesion.nombre_cliente ?? sesion.numero_oc}-${sesion.numero_oc}.xlsx`.replace(/[^a-zA-Z0-9\-_.]/g, '_'))
  }

  // ── Guards ──
  if (isLoading) return <div className="sd-page"><p className="cargando">Cargando sesión…</p></div>
  if (isError || !data) return <div className="sd-page"><p className="error-msg">Error al cargar la sesión</p></div>

  const sesion          = data as SesionDetalle
  const pct             = sesion.total_items ? Math.round((sesion.items_completados / sesion.total_items) * 100) : 0
  const rolUsuario      = localStorage.getItem('user_rol') ?? ''
  const esAdmin         = rolUsuario === 'admin' || rolUsuario === 'supervisor'
  const puedeCancelar   = (sesion.estado === 'validando' || sesion.estado === 'en_proceso') && esAdmin

  // Operador solo puede ver sesiones activas
  if (!esAdmin && sesion.estado !== 'en_proceso' && sesion.estado !== 'validando') {
    return (
      <div className="sd-page">
        <div className="sd-bloqueado">
          <span className="sd-bloqueado-ico">🔒</span>
          <h2 className="sd-bloqueado-titulo">Sesión no disponible</h2>
          <p className="sd-bloqueado-desc">
            Esta sesión ya fue <strong>{sesion.estado === 'completada' ? 'completada' : sesion.estado === 'despachado' ? 'despachada' : 'cerrada'}</strong> y no está abierta para preparación.
          </p>
          <button className="sd-btn sd-btn--secondary" onClick={() => navigate('/picking-masivo/operador')}>
            ← Volver a sesiones disponibles
          </button>
        </div>
      </div>
    )
  }
  const sesionTieneLpn  = sesion.items.some((i) => !!i.lpn)
  const todosProductosValidados = !sesionTieneLpn && sesion.items.length > 0 && (
    sesion.items.every((i) => i.lpn_validado === true) || productosConfirmados
  )

  // ── KPIs ──
  const todasSubs = sesion.items.flatMap(i => i.subtareas_picking_masivo)
  const operadoresIds = Array.from(new Set(
    todasSubs.filter(s => s.estado === 'bloqueado' && s.bloqueado_por).map(s => s.bloqueado_por!)
  ))
  // Mapa id → nombre para mostrar en el panel de operadores
  const operadoresNombres: Record<string, string> = {}
  for (const s of todasSubs) {
    if (s.bloqueado_por && s.bloqueado_por_nombre) operadoresNombres[s.bloqueado_por] = s.bloqueado_por_nombre
    if (s.completado_por && s.completado_por_nombre) operadoresNombres[s.completado_por] = s.completado_por_nombre
  }

  // ── Filtros de items ──
  const FILTROS = [
    { key: 'libre',      label: 'Pendiente', count: sesion.items.filter(i => i.estado === 'libre').length },
    { key: 'completado', label: 'Completas', count: sesion.items.filter(i => i.estado === 'completado').length },
    { key: 'parcial',    label: 'Parcial',   count: sesion.items.filter(i => i.estado === 'parcial').length },
    { key: 'sin_stock',  label: 'Sin Stock', count: sesion.items.filter(i => i.estado === 'sin_stock').length },
  ] as const

  const ESTADO_ORDEN: Record<string, number> = { en_progreso: 0, libre: 1, parcial: 2, sin_stock: 3, completado: 4 }

  const itemsFiltrados = sesion.items
    .filter(item => {
      const q = busqueda.trim().toLowerCase()
      const matchQ = !q || item.codigo.toLowerCase().includes(q) || (item.descripcion ?? '').toLowerCase().includes(q) ||
        (item.codigo_barra ?? '').toLowerCase().includes(q)
      const matchF = filtroEstado === 'todos' || item.estado === filtroEstado
      return matchQ && matchF
    })
    .sort((a, b) => {
      const oa = ESTADO_ORDEN[a.estado] ?? 99
      const ob = ESTADO_ORDEN[b.estado] ?? 99
      if (oa !== ob) return oa - ob
      if (a.lpn && b.lpn) return a.lpn.localeCompare(b.lpn)
      return 0
    })

  const lpnSesion  = sesion.items[0]?.lpn ?? null
  const esImperial = (sesion.nombre_cliente ?? '').toLowerCase() === 'imperial'

  return (
    <div className="sd-page">

      {/* ── Cabecera ── */}
      <div className="sd-header">
        <button className="sd-volver-btn" onClick={() => navigate('/picking-masivo')}>
          <IcoBack /> Volver
        </button>
        <div className="sd-header-title">
          <div className="sd-header-nombre-row">
            <span className="sd-header-nombre">{sesion.nombre_cliente ?? sesion.numero_oc}</span>
            {esImperial && sesion.numero_oc && (
              <span className="sd-header-entrega">
                Entrega: {(() => {
                  const d = new Date(sesion.numero_oc)
                  return isNaN(d.getTime())
                    ? sesion.numero_oc
                    : d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
                })()}
              </span>
            )}
          </div>
          <div className="sd-header-meta">
            {sesion.numero_oc_pedido && (
              <span className="sd-header-oc">OC: {sesion.numero_oc_pedido}</span>
            )}
          </div>
        </div>
        <div className="sd-header-actions">
          {esAdmin && (
            <button className="sd-btn sd-btn--secondary" onClick={descargarExcel}>
              <IcoDownload /> Excel
            </button>
          )}
          {esAdmin && !sesionTieneLpn && (sesion.estado === 'completada' || sesion.estado === 'despachado') && (
            <>
              <input ref={fileInputRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleArchivoLpn(f) }} />
              <button className="sd-btn sd-btn--secondary" disabled={lpnSubiendo} onClick={() => fileInputRef.current?.click()}>
                📎 {lpnSubiendo ? 'Subiendo…' : lpnCount > 0 ? `Excel LPN (${lpnCount})` : 'Excel LPN'}
              </button>
            </>
          )}
          {puedeCancelar && (
            <button className="sd-btn sd-btn--danger" onClick={() => setConfirmarCancelar(true)}>
              🚫 Cancelar Sesión
            </button>
          )}
        </div>
        <span className={`sd-sesion-badge ${SESION_BADGE_CLS[sesion.estado] ?? ''}`}>
          {ESTADO_SESION_LABELS[sesion.estado] ?? sesion.estado}
        </span>
      </div>

      {/* ── Bloque de trazabilidad de salida (solo admin, solo cuando despachado) ── */}
      {esAdmin && sesion.estado === 'despachado' && (
        <div className="sd-despacho-traz">
          <span className="sd-despacho-traz-ico">🚚</span>

          <div className="sd-despacho-traz-info">
            <span className="sd-despacho-traz-label">Fecha despacho</span>
            <span className="sd-despacho-traz-fecha-val">{fmtFechaHora(sesion.despachado_en)}</span>
          </div>

          {(sesion.despachado_por_usuario?.nombre || sesion.nombre_chofer) && (
            <span className="sd-despacho-traz-sep">|</span>
          )}

          {sesion.despachado_por_usuario?.nombre && (
            <div className="sd-despacho-traz-info">
              <span className="sd-despacho-traz-label">Confirmado por</span>
              <span className="sd-despacho-traz-nombre">{sesion.despachado_por_usuario.nombre}</span>
            </div>
          )}

          {sesion.nombre_chofer && (
            <>
              <span className="sd-despacho-traz-sep">|</span>
              <div className="sd-despacho-traz-chofer-bloque">
                <span className="sd-despacho-traz-label">🚛 Chofer asignado</span>
                <span className="sd-despacho-traz-chofer-nombre">{sesion.nombre_chofer}</span>
              </div>
            </>
          )}
        </div>
      )}

      {error && <div className="sd-error-banner">{error}</div>}
      {lpnError && <div className="sd-error-banner">{lpnError}</div>}

      {/* ── KPI Banner ── */}
      <div className="sd-kpi-banner">

        {/* Operadores en zona */}
        <div className="sd-kpi-col sd-kpi-col--ops">
          <span className="sd-kpi-titulo">
            👥 OPERADORES EN ZONA ({operadoresIds.length})
          </span>
          {operadoresIds.length === 0 ? (
            <span className="sd-kpi-vacio">Sin operadores activos</span>
          ) : (
            <div className="sd-ops-lista">
              {operadoresIds.map(opId => {
                const subActiva = todasSubs.find(s => s.bloqueado_por === opId && s.estado === 'bloqueado')
                const itemActivo = subActiva ? sesion.items.find(i => i.subtareas_picking_masivo.some(s => s.id === subActiva.id)) : null
                return (
                  <div key={opId} className="sd-op-row">
                    <span className="sd-op-avatar"><IcoUser /></span>
                    <div className="sd-op-info">
                      <span className="sd-op-nombre">{opNombre(operadoresNombres[opId], opId)}</span>
                      {itemActivo && (
                        <span className="sd-op-sku">Recogiendo SKU {itemActivo.codigo}</span>
                      )}
                    </div>
                    <span className="sd-op-dot" />
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Avance global */}
        <div className="sd-kpi-col sd-kpi-col--progreso">
          <span className="sd-kpi-titulo">AVANCE GLOBAL</span>
          <div className="sd-kpi-progreso-wrap">
            <div className="sd-kpi-barra-bg">
              <div className="sd-kpi-barra-fill" style={{ width: `${pct}%` }} />
            </div>
            <span className="sd-kpi-pct">{pct}%</span>
          </div>
          <span className="sd-kpi-uds">
            <strong>{sesion.items_completados.toLocaleString('es-CL')}</strong> / {sesion.total_items.toLocaleString('es-CL')} Uds Completadas
          </span>
        </div>

      </div>

      {/* Botones de fase (completada/despachado) — solo admin */}
      {esAdmin && !sesionTieneLpn && (sesion.estado === 'completada' || sesion.estado === 'despachado') && (
        <div className="sd-fase-btns">
          <button
            className="sd-btn sd-btn--primary"
            disabled={!todosProductosValidados || lpnCount === 0}
            onClick={() => navigate(`/picking-masivo/${sesionId}/despacho?fase=lpns`)}
          >
            Validar LPN →
          </button>
        </div>
      )}

      {/* ── Toolbar: búsqueda + filtros ── */}
      <div className="sd-toolbar">
        <div className="sd-busqueda-wrap">
          <input
            type="search"
            className="sd-busqueda"
            placeholder="🔍 Buscar por SKU, código o EAN…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
        <div className="sd-filtros">
          {FILTROS.map(f => (
            <button
              key={f.key}
              className={`sd-filtro-btn sd-filtro-btn--${f.key.replace('_', '-')} ${filtroEstado === f.key ? 'sd-filtro-btn--activo' : ''}`}
              onClick={() => setFiltroEstado(prev => prev === f.key ? 'todos' : f.key as typeof filtroEstado)}
            >
              {f.label}
              <span className="sd-filtro-count">{f.count}</span>
            </button>
          ))}
        </div>
      </div>

      <h2 className="sd-lista-titulo">Listado de productos {sesion.nombre_cliente ?? sesion.numero_oc}</h2>

      {/* ── Lista de productos ── */}
      <div className="sd-items-lista">
        {itemsFiltrados.length === 0 && (
          <div className="sd-vacio">Sin productos para este filtro</div>
        )}
        {itemsFiltrados.map(item => {
          const abierto     = expandido.has(item.id)
          const rack        = item.subtareas_picking_masivo[0]?.posicion_codigo ?? '—'
          const subActiva   = item.subtareas_picking_masivo.find(s => s.estado === 'bloqueado')
          const subComp     = item.subtareas_picking_masivo.find(s => s.estado === 'completado' || s.estado === 'parcial')
          const subSinStock = item.subtareas_picking_masivo.find(s => s.estado === 'sin_stock')
          const badge       = ESTADO_ITEM_BADGE[item.estado] ?? { label: item.estado, cls: '' }
          const itemPct     = item.cantidad_pedida > 0 ? Math.round((item.cantidad_despachada / item.cantidad_pedida) * 100) : 0

          return (
            <div key={item.id} className={`sd-item-card sd-item-card--${item.estado.replace('_', '-')}`}>

              {/* ── Fila principal ── */}
              <div className="sd-item-row">

                {/* Rack */}
                <div className="sd-item-rack">
                  <span className="sd-rack-badge">
                    <IcoPin /> {rack !== '—' ? rack : 'S/U'}
                  </span>
                </div>

                {/* Info: nombre + SKU / EAN / LPN */}
                <div className="sd-item-sku">
                  <span className="sd-item-nombre">
                    {item.descripcion && item.descripcion !== item.codigo ? item.descripcion : item.codigo}
                  </span>
                  <div className="sd-item-codes">
                    <span className="sd-sku-tag">SKU: {item.codigo}</span>
                    {item.codigo_barra && <span className="sd-ean-tag">EAN: {item.codigo_barra}</span>}
                    {item.tienda && <span className="sd-tienda-tag">{item.tienda}</span>}
                    {item.lpn && <span className="sd-lpn-item-tag">LPN: {item.lpn}</span>}
                  </div>
                </div>

                {/* UDS */}
                <div className="sd-item-uds">
                  <strong>{item.cantidad_despachada}</strong> / {item.cantidad_pedida}
                  <span className="sd-item-cant-unit"> Uds</span>
                </div>

                {/* Estado */}
                <div className="sd-item-estado">
                  <span className={`sd-badge ${badge.cls}`}>{badge.label}</span>
                </div>

                {/* Acciones */}
                <div className="sd-item-acciones">
                  <button
                    className="sd-accion-btn"
                    title="Ver trazabilidad"
                    onClick={() => toggleExpandido(item.id)}
                  >
                    <IcoEye /> {abierto ? 'Ocultar' : 'Detalle'}
                  </button>
                  {esAdmin && subActiva && (
                    <button
                      className="sd-accion-btn sd-accion-btn--warn"
                      title="Liberar ítem bloqueado"
                      onClick={() => alert(`Liberar ítem ${item.codigo} — disponible próximamente`)}
                    >
                      <IcoUnlock /> Liberar
                    </button>
                  )}
                  {esAdmin && item.estado === 'sin_stock' && (
                    <button
                      className="sd-accion-btn sd-accion-btn--tool"
                      title="Asignar reposición"
                      onClick={() => alert(`Reposición para ${item.codigo} — disponible próximamente`)}
                    >
                      <IcoTool /> Reponer
                    </button>
                  )}
                </div>
              </div>

              {/* ── Panel expandido: trazabilidad ── */}
              {abierto && (
                <div className="sd-item-trazabilidad">
                  <div className="sd-traz-header">
                    <span className="sd-traz-titulo">Auditoría de picking</span>
                    {esImperial && item.lpn && (
                      <span className="sd-traz-lpn-badge">LPN: {item.lpn}</span>
                    )}
                  </div>

                  <div className={`sd-traz-grid-header${esAdmin ? '' : ' sd-traz-grid--operador'}`}>
                    <span>Rack / Ubicación</span>
                    <span>Operador Picking</span>
                    <span>Cantidad</span>
                    <span>Escaneo</span>
                    {esAdmin && <span>Despachador</span>}
                    <span>Estado</span>
                  </div>

                  {item.subtareas_picking_masivo.map((sub) => (
                    <div key={sub.id} className={`sd-traz-grid-fila${esAdmin ? '' : ' sd-traz-grid--operador'}`}>

                      {/* Rack */}
                      <span className="sd-traz-rack">
                        <IcoPin /> {sub.posicion_codigo}
                      </span>

                      {/* Operador de picking */}
                      <span className="sd-traz-op-cell">
                        <IcoUser />
                        <span>
                          {sub.completado_por
                            ? opNombre(sub.completado_por_nombre, sub.completado_por)
                            : sub.bloqueado_por
                              ? opNombre(sub.bloqueado_por_nombre, sub.bloqueado_por)
                              : '—'}
                        </span>
                      </span>

                      {/* Cantidad */}
                      <span className="sd-traz-cant">
                        {sub.cantidad_despachada ?? 0} / {sub.cantidad_asignada} uds
                      </span>

                      {/* Hora de escaneo */}
                      <span className="sd-traz-hora">
                        {sub.completado_en
                          ? fmtFechaHora(sub.completado_en)
                          : sub.bloqueado_en
                            ? fmtFechaHora(sub.bloqueado_en)
                            : '—'}
                      </span>

                      {/* Despachador — solo admin */}
                      {esAdmin && (
                        <span className="sd-traz-despachador">
                          {sesion.despachado_por_usuario?.nombre ?? sesion.nombre_chofer ?? '—'}
                        </span>
                      )}

                      {/* Estado */}
                      <span className={`sd-badge sd-badge--sm ${(ESTADO_ITEM_BADGE[sub.estado] ?? { cls: '' }).cls}`}>
                        {(ESTADO_ITEM_BADGE[sub.estado] ?? { label: sub.estado }).label}
                      </span>

                      {/* Motivo y equivalente (fila extra si existen) */}
                      {(sub.motivo_diferencia || (sub.es_equivalente && sub.producto_equivalente)) && (
                        <div className="sd-traz-extras">
                          {sub.motivo_diferencia && (
                            <span className="sd-traz-motivo">⚠ {sub.motivo_diferencia}</span>
                          )}
                          {sub.es_equivalente && sub.producto_equivalente && (
                            <span className="sd-traz-equiv">↪ Equiv: {sub.producto_equivalente.codigo}</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* ── Modal cancelar sesión ── */}
      {confirmarCancelar && (
        <div className="modal-overlay" onClick={() => setConfirmarCancelar(false)}>
          <div className="sd-modal" onClick={e => e.stopPropagation()}>
            <h3 className="sd-modal-titulo">¿Cancelar esta sesión?</h3>
            <p className="sd-modal-desc">Esta acción no se puede revertir. Las subtareas en progreso quedarán liberadas.</p>
            <div className="sd-modal-acciones">
              <button className="sd-btn sd-btn--secondary" onClick={() => setConfirmarCancelar(false)}>
                No, mantener
              </button>
              <button className="sd-btn sd-btn--danger" disabled={cancelarSesion.isPending} onClick={handleCancelar}>
                {cancelarSesion.isPending ? 'Cancelando…' : 'Sí, cancelar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
