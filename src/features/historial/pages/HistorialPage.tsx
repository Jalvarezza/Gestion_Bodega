import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMovimientos, useMovimientosPorIngreso, useMovimientosPorNota, useListaOCs, useProductosPorOC, useMovimientosPorOCYProducto } from '../hooks/useHistorial'
import { TIPOS_MOVIMIENTO, TIPO_LABELS } from '../services/historial.api'
import type { MovimientoHistorial, ObtenerMovimientosInput, OCResumen, ProductoEnOC } from '../services/historial.api'
import { useNotas } from '../../notas/hooks/useNotas'
import type { NotaResumen } from '../../notas/services/notas.api'
import { useSesionesPicking } from '../../picking-masivo/hooks/usePickingMasivo'
import type { SesionResumen } from '../../picking-masivo/services/picking-masivo.api'

const LIMITE = 50

// ── Íconos ────────────────────────────────────────────────────────────────

function IconFiltro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IconCalendar() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  )
}
function IconSearch() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  )
}
// ── Colores por tipo de movimiento ────────────────────────────────────────

const TIPO_CONFIG: Record<string, { color: string; bg: string; icono: string }> = {
  ingreso:              { color: '#86efac', bg: 'rgba(34,197,94,0.15)',   icono: '↓' },
  ingreso_parcial:      { color: '#86efac', bg: 'rgba(34,197,94,0.10)',   icono: '↓' },
  salida:               { color: '#fca5a5', bg: 'rgba(239,68,68,0.15)',   icono: '↑' },
  salida_parcial:       { color: '#fca5a5', bg: 'rgba(239,68,68,0.10)',   icono: '↑' },
  traslado_reubicacion: { color: '#93c5fd', bg: 'rgba(59,130,246,0.15)',  icono: '→' },
  traslado_intercambio: { color: '#c4b5fd', bg: 'rgba(139,92,246,0.15)', icono: '⇄' },
  equivalente_usado:    { color: '#fde68a', bg: 'rgba(245,158,11,0.15)',  icono: '≈' },
  cambio_estado_nota:   { color: '#7dd3fc', bg: 'rgba(14,165,233,0.15)',  icono: '✎' },
  despacho:             { color: '#f9a8d4', bg: 'rgba(236,72,153,0.15)', icono: '▶' },
  devolucion:           { color: '#67e8f9', bg: 'rgba(0,160,223,0.15)',  icono: '↩' },
}

function BadgeTipo({ tipo }: { tipo: string }) {
  const cfg = TIPO_CONFIG[tipo] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)', icono: '•' }
  return (
    <span
      className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 rounded-full border border-transparent whitespace-nowrap"
      style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color + '40' }}
    >
      <span className="text-[12px] leading-none">{cfg.icono}</span>
      {TIPO_LABELS[tipo] ?? tipo}
    </span>
  )
}

// Resalta usuario, SKU y número de nota en el texto del detalle
function resaltarDetalle(texto: string, usuario: string, notaNumero?: string | null): React.ReactNode[] {
  const patrones: { re: RegExp; clase: string }[] = []
  if (usuario)    patrones.push({ re: new RegExp(usuario.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), clase: 'hist-hl-usuario' })
  if (notaNumero) patrones.push({ re: new RegExp(notaNumero.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), clase: 'hist-hl-nota' })
  patrones.push({ re: /[A-Z]{2,5}[\/\-][A-Z]{1,5}[A-Z0-9\-\/]*/g, clase: 'hist-hl-sku' })

  const partes: { texto: string; clase?: string }[] = [{ texto }]

  for (const { re, clase } of patrones) {
    const resultado: { texto: string; clase?: string }[] = []
    for (const parte of partes) {
      if (parte.clase) { resultado.push(parte); continue }
      let ultimo = 0
      let m: RegExpExecArray | null
      re.lastIndex = 0
      while ((m = re.exec(parte.texto)) !== null) {
        if (m.index > ultimo) resultado.push({ texto: parte.texto.slice(ultimo, m.index) })
        resultado.push({ texto: m[0], clase })
        ultimo = m.index + m[0].length
      }
      if (ultimo < parte.texto.length) resultado.push({ texto: parte.texto.slice(ultimo) })
    }
    partes.splice(0, partes.length, ...resultado)
  }

  return partes.map((p, i) =>
    p.clase ? <span key={i} className={p.clase}>{p.texto}</span> : p.texto
  )
}

// ── Tarjeta de movimiento ─────────────────────────────────────────────────

function MovimientoCard({
  m,
  onDetalle,
}: {
  m:          MovimientoHistorial
  onDetalle:  ((ctx: DetalleContexto) => void) | null
}) {
  const fecha = m.fecha.slice(0, 16).replace('T', ' ')
  const [dia, hora] = fecha.split(' ')

  return (
    <div className="flex flex-col gap-2 bg-[var(--bg-surface)] rounded-xl px-4 py-3 shadow-sm transition-colors duration-150 hover:bg-[var(--bg-elevated)] tablet:flex-row tablet:items-start tablet:gap-4">
      {/* Columna izquierda: badge + fecha */}
      <div className="flex flex-row items-center justify-between w-full shrink-0 tablet:flex-col tablet:items-start tablet:gap-1.5 tablet:w-auto tablet:min-w-[130px] desktop:min-w-[140px]">
        <BadgeTipo tipo={m.tipo} />
        <div className="flex flex-col gap-px">
          <span className="text-[11px] text-[var(--text-muted)]">{dia}</span>
          <span className="text-[13px] font-semibold text-[var(--text-secondary)] tabular-nums">{hora}</span>
        </div>
      </div>

      {/* Cuerpo: texto + meta */}
      <div className="flex-1 flex flex-col gap-1.5">
        <p className="text-base text-[var(--text-primary)] leading-[1.4]">
          {resaltarDetalle(m.detalle, m.usuario, m.notaNumero)}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {m.usuario}
          </span>

          {m.cantidad !== null && (
            <span className="text-[11px] font-bold text-[var(--accent-light)] bg-[rgba(2,132,199,0.15)] px-1.5 py-0.5 rounded">
              {m.cantidad} Und.
            </span>
          )}

          {m.ubicacion && (
            <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#86efac] bg-[rgba(34,197,94,0.12)] px-1.5 py-0.5 rounded font-mono">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}>
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
              </svg>
              {m.ubicacion}
            </span>
          )}

          {m.importacionCodigo && onDetalle && (
            <button
              className="inline-flex items-center text-[12px] text-[var(--accent-light)] bg-[rgba(2,132,199,0.12)] border border-[rgba(125,211,252,0.25)] rounded px-2.5 py-1.5 min-h-8 cursor-pointer transition-colors hover:bg-[rgba(2,132,199,0.25)]"
              onClick={() => onDetalle({ tipo: 'ingreso', importacionId: m.movimientoId, codigo: m.importacionCodigo! })}
            >
              Importación {m.importacionCodigo}
            </button>
          )}

          {m.notaNumero && m.notaVentaId && onDetalle && (
            <button
              className="hist-ver-nota-btn inline-flex items-center text-[12px] font-bold text-[#4ade80] bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.3)] rounded px-2.5 py-1.5 min-h-8 cursor-pointer transition-colors hover:bg-[rgba(74,222,128,0.22)]"
              onClick={() => onDetalle({ tipo: 'nota', notaId: m.notaVentaId!, numero: m.notaNumero! })}
            >
              Nota {m.notaNumero}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Tarjeta agrupada por nota ─────────────────────────────────────────────

const TIPOS_NOTA = new Set(['salida', 'salida_parcial', 'equivalente_usado', 'cambio_estado_nota', 'despacho', 'devolucion'])

function NotaGrupoCard({
  numero,
  movimientos,
  onDetalle,
}: {
  numero:      string
  movimientos: MovimientoHistorial[]
  onDetalle:   ((ctx: DetalleContexto) => void) | null
}) {
  const [abierto, setAbierto] = useState(false)

  // Primer movimiento de la nota para tomar usuario y movimientoId
  const primero  = movimientos[0]
  const usuarios = Array.from(new Set(movimientos.map((m) => m.usuario))).join(', ')
  const totalUds = movimientos.reduce((s, m) => s + (m.cantidad ?? 0), 0)

  // Tipos únicos presentes
  const tiposPresentes = Array.from(new Set(movimientos.map((m) => m.tipo)))

  return (
    <div className={`hist-nota-grupo${abierto ? ' abierto' : ''}`}>
      <button className="hist-nota-grupo-header" onClick={() => setAbierto((v) => !v)}>
        <div className="hist-nota-grupo-left">
          <span className="hist-nota-grupo-nv">NV {numero}</span>
          <div className="hist-nota-grupo-badges">
            {tiposPresentes.map((t) => <BadgeTipo key={t} tipo={t} />)}
          </div>
        </div>
        <div className="hist-nota-grupo-right">
          <span className="hist-nota-grupo-meta">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            {usuarios}
          </span>
          <span className="hist-nota-grupo-meta">
            {movimientos.length} movimiento{movimientos.length !== 1 ? 's' : ''}
          </span>
          {onDetalle && primero.notaVentaId && (
            <button
              className="hist-ver-nota-btn inline-flex items-center text-[12px] font-bold text-[#4ade80] bg-[rgba(74,222,128,0.12)] border border-[rgba(74,222,128,0.3)] rounded px-2.5 py-1.5 min-h-8 cursor-pointer transition-colors hover:bg-[rgba(74,222,128,0.22)]"
              onClick={(e) => { e.stopPropagation(); onDetalle({ tipo: 'nota', notaId: primero.notaVentaId!, numero }) }}
            >
              Ver nota
            </button>
          )}
          <span className={`hist-nota-grupo-chevron${abierto ? ' abierto' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </button>

      {abierto && (
        <div className="hist-nota-grupo-items">
          {movimientos.map((m) => (
            <MovimientoCard key={m.movimientoId} m={m} onDetalle={null} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Lista de movimientos ──────────────────────────────────────────────────

function ListaMovimientos({
  movimientos,
  onDetalle,
}: {
  movimientos: MovimientoHistorial[]
  onDetalle:   ((ctx: DetalleContexto) => void) | null
}) {
  const TIPOS_OCULTOS = new Set(['cambio_estado_nota', 'despacho'])
  const visibles = movimientos.filter(m => !TIPOS_OCULTOS.has(m.tipo))

  if (visibles.length === 0) {
    return <p className="vacio">Sin movimientos en este rango</p>
  }

  function formatearDia(iso: string) {
    const d = new Date(iso + 'T00:00:00')
    return d.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
  }

  // Agrupar por día, y dentro de cada día agrupar por nota los movimientos asociados
  const diasMap = new Map<string, MovimientoHistorial[]>()
  for (const m of visibles) {
    const dia = m.fecha.slice(0, 10)
    if (!diasMap.has(dia)) diasMap.set(dia, [])
    diasMap.get(dia)!.push(m)
  }

  return (
    <div className="hist-lista">
      {Array.from(diasMap.entries()).map(([dia, items]) => {
        // Separar: los que pertenecen a una nota y los que no
        const porNota = new Map<string, MovimientoHistorial[]>()
        const sinNota: MovimientoHistorial[] = []

        for (const m of items) {
          if (m.notaNumero && TIPOS_NOTA.has(m.tipo)) {
            if (!porNota.has(m.notaNumero)) porNota.set(m.notaNumero, [])
            porNota.get(m.notaNumero)!.push(m)
          } else {
            sinNota.push(m)
          }
        }

        const totalTarjetas = porNota.size + sinNota.length

        return (
          <div key={dia} className="hist-grupo">
            <div className="hist-grupo-header">
              <IconCalendar />
              <span>{formatearDia(dia)}</span>
              <span className="hist-grupo-count">{totalTarjetas} evento{totalTarjetas !== 1 ? 's' : ''}</span>
            </div>
            <div className="hist-grupo-items">
              {/* Grupos de nota primero */}
              {Array.from(porNota.entries()).map(([numero, mvs]) => (
                <NotaGrupoCard key={numero} numero={numero} movimientos={mvs} onDetalle={onDetalle} />
              ))}
              {/* Movimientos sin nota (ingresos, traslados, etc.) */}
              {sinNota.map((m) => (
                <MovimientoCard key={m.movimientoId} m={m} onDetalle={onDetalle} />
              ))}
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Detalle ingreso ───────────────────────────────────────────────────────

type DetalleContexto =
  | { tipo: 'ingreso'; importacionId: string; codigo: string }
  | { tipo: 'nota'; notaId: string; numero: string }
  | null

function DetalleIngreso({ importacionId, onCerrar }: { importacionId: string; onCerrar: () => void }) {
  const { data, isLoading, isError } = useMovimientosPorIngreso(importacionId)
  return (
    <div className="historial-detalle">
      <div className="detalle-header">
        <button className="btn-volver" onClick={onCerrar}>← Volver</button>
        <h3>Historial de importación</h3>
      </div>
      {isLoading && <p className="cargando">Cargando…</p>}
      {isError   && <p className="error">Error al cargar detalle</p>}
      {data && (
        <>
          <div className="detalle-meta">
            <span><strong>{data.importacion}</strong></span>
            <span>OC: {data.numeroOc}</span>
            <span>Fecha: {data.fechaIngreso}</span>
          </div>
          <ListaMovimientos movimientos={data.movimientos} onDetalle={null} />
        </>
      )}
    </div>
  )
}

function isoADMY(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = iso.slice(0, 10)
  return d.split('-').reverse().join('-')
}

const ESTADO_NOTA_CFG: Record<string, { label: string; color: string; bg: string }> = {
  pendiente:      { label: 'Pendiente',      color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  completa:       { label: 'Completa',       color: '#86efac', bg: 'rgba(34,197,94,0.15)'  },
  despachada:     { label: 'Despachada',     color: '#7dd3fc', bg: 'rgba(14,165,233,0.15)' },
  preparacion:    { label: 'En preparación', color: '#fb923c', bg: 'rgba(251,146,60,0.15)'  },
}

// ── Tarjeta accordion por producto en detalle de nota ────────────────────────

function ProductoHistorialCard({
  sku,
  movs,
  equivRevMap,
  comentario,
}: {
  sku:         string
  movs:        MovimientoHistorial[]
  equivRevMap: Map<string, string>
  comentario:  string | null
}) {
  const [abierto, setAbierto] = useState(false)

  const tiposUnicos   = Array.from(new Set(movs.map(m => m.tipo)))
  const equivalente   = movs.find(m => m.tipo === 'equivalente_usado')
  const salidaParcial = movs.find(m => m.tipo === 'salida_parcial')
  const ubicacion     = movs.find(m => m.ubicacion)?.ubicacion ?? null
  const skuDespachado = equivalente?.skuEquivalente ?? null
  const skuOriginal   = equivRevMap.get(sku) ?? null
  const soloEquivalente = tiposUnicos.every(t => t === 'equivalente_usado')
  const nombreProducto = movs.find(m => m.nombreProducto)?.nombreProducto ?? null

  const totalDespachado = movs
    .filter(m => m.tipo === 'salida' || m.tipo === 'salida_parcial')
    .reduce((s, m) => s + (m.cantidad ?? 0), 0)

  const cantSolicitada = salidaParcial?.cantidadSolicitada ?? totalDespachado
  const completo       = cantSolicitada > 0 && totalDespachado === cantSolicitada

  // Si la entrega fue completa, omitir el badge salida_parcial (era un estado intermedio)
  const tiposBadge = tiposUnicos
    .filter(t => t !== 'equivalente_usado')
    .filter(t => !(completo && t === 'salida_parcial'))

  return (
    <div className={`hist-prod-accordion${abierto ? ' abierto' : ''}`}>
      {/* ── Fila colapsada ── */}
      <button
        className="hist-prod-accordion-header"
        onClick={() => setAbierto(v => !v)}
      >
        {/* Solo código SKU */}
        <code className="hist-prod-sku-solo">{sku}</code>

        <div className="hist-prod-fila-derecha">
          {/* Solo "Desp." en blanco neutro */}
          {!soloEquivalente && (
            <span className="hist-prod-desp">
              <span className="hist-prod-cant-label">Despachado</span>
              <strong className="hist-prod-cant-val">{totalDespachado}</strong>
            </span>
          )}

          {/* Badge al extremo derecho */}
          <div className="hist-prod-accordion-badges">
            {tiposBadge.map(t => <BadgeTipo key={t} tipo={t} />)}
          </div>

          <span className={`hist-nota-grupo-chevron${abierto ? ' abierto' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </button>

      {/* ── Detalle expandido ── */}
      {abierto && (
        <div className="hist-prod-accordion-detalle">
          {/* Nombre completo */}
          {nombreProducto && (
            <p className="hist-prod-detalle-nombre">{nombreProducto}</p>
          )}
          {(skuOriginal || skuDespachado) && (
            <div className="flex flex-wrap gap-2">
              {skuOriginal  && <span className="hist-prod-equiv-label">Reemplazó a <strong>{skuOriginal}</strong></span>}
              {skuDespachado && <span className="hist-prod-equiv-label">Despachado como <strong>{skuDespachado}</strong></span>}
            </div>
          )}

          {/* Sol. vs Desp. */}
          {!soloEquivalente && (
            <div className="hist-prod-detalle-cantidades">
              <span><span className="hist-prod-cant-label">Solicitado</span><strong className="hist-prod-cant-val">{cantSolicitada}</strong></span>
              <span><span className="hist-prod-cant-label">Despachado</span><strong className="hist-prod-cant-val">{totalDespachado}</strong></span>
            </div>
          )}

          {/* Chips de meta */}
          <div className="flex flex-wrap gap-2 items-center">
            {ubicacion && (
              <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-[#86efac] bg-[rgba(34,197,94,0.12)] px-1.5 py-0.5 rounded font-mono">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}>
                  <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>
                </svg>
                {ubicacion}
              </span>
            )}
            {movs[0] && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[var(--text-muted)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}>
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                </svg>
                {movs[0].usuario}
              </span>
            )}
            {comentario && (
              <span className="inline-flex items-center gap-1 text-[11px] text-[#fbbf24] bg-[rgba(251,191,36,0.10)] px-1.5 py-0.5 rounded italic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={11} height={11}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
                {comentario}
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function DetalleNota({ notaId, onCerrar }: { notaId: string; onCerrar: () => void }) {
  const { data, isLoading, isError, error } = useMovimientosPorNota(notaId)
  const [devAbierta, setDevAbierta]         = useState(false)
  const [gruposAbiertos, setGruposAbiertos] = useState<Record<number, boolean>>({})

  const filas = useMemo(() => {
    if (!data) return [] as MovimientoHistorial[]
    const TIPOS_EXCLUIDOS = new Set(['cambio_estado_nota', 'despacho', 'picking', 'revision_admin', 'equivalente_usado', 'devolucion'])
    return (data.movimientos ?? []).filter(m => !TIPOS_EXCLUIDOS.has(m.tipo) && m.producto)
  }, [data])

  const filasDevolucion = useMemo(() => {
    if (!data) return [] as MovimientoHistorial[]
    return (data.movimientos ?? []).filter(m => m.tipo === 'devolucion')
  }, [data])

  const totalSolicitado = filas.reduce((s, m) => s + (m.cantidadSolicitada ?? m.cantidad ?? 0), 0)
  const totalPicked     = filas.reduce((s, m) => s + (m.cantidad ?? 0), 0)
  const pct             = totalSolicitado > 0 ? Math.round((totalPicked / totalSolicitado) * 100) : 0

  const productosEnNV    = [...new Set(filas.map(f => f.producto).filter(Boolean))]
  const productosDev     = new Set(filasDevolucion.map(m => m.producto))
  const todosDevueltos   = productosEnNV.length > 0 && productosEnNV.every(p => productosDev.has(p))
  const cadaUnoCompleto  = filasDevolucion.every(m => {
    const solicitado = filas.find(f => f.producto === m.producto)?.cantidadSolicitada ?? null
    return solicitado != null && (m.cantidad ?? 0) >= solicitado
  })
  const tipoDev: 'total' | 'parcial' | null = filasDevolucion.length === 0 ? null
    : (todosDevueltos && cadaUnoCompleto) ? 'total' : 'parcial'
  const motivoDev: string | null = (data as any)?.motivoDev ?? null

  const estadoCfg = data ? (ESTADO_NOTA_CFG[data.estado] ?? { label: data.estado, color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' }) : null

  return (
    <div className="hnv-detalle">
      {/* Cabecera */}
      <div className="hnv-detalle-header">
        <button className="hnv-volver" onClick={onCerrar}>← Volver al Historial</button>
        <div className="hnv-detalle-titulo-row">
          <span className="hnv-detalle-titulo">Detalle NV: {data?.nota ?? '…'}</span>
          {estadoCfg && (
            <span className="hnv-badge" style={{ color: estadoCfg.color, background: estadoCfg.bg, borderColor: estadoCfg.color + '40' }}>
              {estadoCfg.label}
            </span>
          )}
        </div>
      </div>

      {isLoading && <div className="hist-cargando"><span className="spinner" /><span>Cargando…</span></div>}
      {isError   && <p className="error">Error al cargar detalle: {(error as Error)?.message ?? 'desconocido'}</p>}

      {data && (
        <>
          {/* ── Banner de info ── */}
          <div className="hnv-info-banner">
            <div className="hnv-info-bloque">
              <span className="hnv-info-label">Cliente</span>
              <span className="hnv-info-val hnv-info-val--grande">{data.cliente}</span>
            </div>

            {data.despacho && (
              <div className="hnv-info-bloque">
                <span className="hnv-info-label">Revisado por</span>
                <span className="hnv-info-val">{data.despacho.despachadorNombre ?? '—'}</span>
              </div>
            )}

            {data.despacho?.nombreChofer && (
              <div className="hnv-info-bloque">
                <span className="hnv-info-label">Chofer</span>
                <span className="hnv-info-val">{data.despacho.nombreChofer}</span>
              </div>
            )}

            <div className="hnv-info-progreso">
              <div className="hnv-pct-badge" style={{ color: pct === 100 ? '#4ade80' : '#38bdf8' }}>
                {pct}%
              </div>
              <div className="hnv-pct-detalle">
                <span className="hnv-info-label">Progreso</span>
                <span className="hnv-info-val">{totalPicked} / {totalSolicitado} Uds</span>
                <div className="hnv-progreso-bar">
                  <div className="hnv-progreso-fill" style={{ width: `${Math.min(pct, 100)}%`, background: pct === 100 ? '#4ade80' : '#38bdf8' }} />
                </div>
              </div>
            </div>
          </div>

          {/* ── Sección devolución ── */}
          {filasDevolucion.length > 0 && (
            <div className="hnv-dev-wrap">
              <div className="hnv-dev-titulo-row">
                <span>↩ Devolución registrada · {filasDevolucion.length} producto{filasDevolucion.length !== 1 ? 's' : ''}</span>
                {tipoDev && (
                  <span className={`hnv-badge hnv-badge-dev hnv-badge-dev--${tipoDev}`}>
                    {tipoDev === 'total' ? 'Dev. total' : 'Dev. parcial'}
                  </span>
                )}
                <button
                  className="hnv-dev-toggle-btn"
                  onClick={() => setDevAbierta(v => !v)}
                >
                  {devAbierta ? 'Ocultar detalle' : 'Ver detalle Devolución'}
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} style={{ transform: devAbierta ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
              </div>
              {devAbierta && (
                <>
                  {motivoDev && (
                    <div className="hnv-dev-motivo">
                      <span className="hnv-dev-motivo-label">Motivo de la devolución:</span>
                      <span className="hnv-dev-motivo-texto">{motivoDev}</span>
                    </div>
                  )}
                  <div className="hnv-tabla-scroll">
                    <table className="hnv-dev-tabla">
                      <thead>
                        <tr>
                          <th className="hnv-dev-th">Producto</th>
                          <th className="hnv-dev-th hnv-dev-th--r">Cant. devuelta</th>
                          <th className="hnv-dev-th">Registrado por</th>
                          <th className="hnv-dev-th">Fecha</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filasDevolucion.map(m => {
                          const d    = new Date(m.fecha)
                          const dia  = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
                          const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
                          return (
                            <tr key={m.movimientoId} className="hnv-dev-fila">
                              <td className="hnv-dev-td">{m.nombreProducto ?? '—'}</td>
                              <td className="hnv-dev-td hnv-dev-td--r"><span className="hnv-dev-cant">{m.cantidad ?? 0}</span></td>
                              <td className="hnv-dev-td">{m.usuario}</td>
                              <td className="hnv-dev-td">
                                <span className="hnv-fecha-dia">{dia}</span>
                                <span className="hnv-fecha-hora">{hora} hrs</span>
                              </td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Trazabilidad por grupos (Picking / Salida) ── */}
          {(() => {
            const SEP_LABELS    = ['Pickeada por', 'Revisión de salida']
            const BTN_LABELS    = ['Ver detalle Picking', 'Ver detalle Salida']
            // Agrupar filas por bloques consecutivos de usuario
            const grupos: { usuario: string; label: string; btnLabel: string; movs: typeof filas }[] = []
            for (const m of filas) {
              const last = grupos[grupos.length - 1]
              if (!last || last.usuario !== m.usuario) {
                const idx = grupos.length
                grupos.push({ usuario: m.usuario, label: SEP_LABELS[idx] ?? 'Revisión por', btnLabel: BTN_LABELS[idx] ?? 'Ver detalle', movs: [] })
              }
              grupos[grupos.length - 1].movs.push(m)
            }

            if (grupos.length === 0) return (
              <div className="hnv-traz-wrap">
                <div className="hnv-traz-titulo">Trazabilidad de productos · 0 registros</div>
                <p className="hnv-vacio">Sin movimientos registrados para esta nota</p>
              </div>
            )

            return (
              <div className="hnv-traz-wrap">
                <div className="hnv-traz-titulo">Trazabilidad de productos · {filas.length} registro{filas.length !== 1 ? 's' : ''}</div>
                {grupos.map((grupo, gi) => {
                  const abierto = !!gruposAbiertos[gi]
                  return (
                    <div key={gi} className="hnv-traz-grupo">
                      {/* Header del grupo con botón toggle */}
                      <div className="hnv-traz-grupo-header">
                        <div className="hnv-traz-sep-nombre" style={{ gap: 8 }}>
                          <span className="hnv-traz-sep-label">{grupo.label}</span>
                          <span className="hnv-op-chip">{grupo.usuario?.charAt(0)?.toUpperCase()}</span>
                          <span style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.85rem' }}>{grupo.usuario}</span>
                          <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>· {grupo.movs.length} reg.</span>
                        </div>
                        <button
                          className="hnv-dev-toggle-btn"
                          onClick={() => setGruposAbiertos(prev => ({ ...prev, [gi]: !prev[gi] }))}
                        >
                          {abierto ? 'Ocultar detalle' : grupo.btnLabel}
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={13} height={13} style={{ transform: abierto ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>
                            <polyline points="6 9 12 15 18 9"/>
                          </svg>
                        </button>
                      </div>

                      {/* Tabla colapsable */}
                      {abierto && (
                        <div className="hnv-tabla-scroll">
                          <table className="hnv-traz-tabla">
                            <thead>
                              <tr className="hnv-traz-thead-tr">
                                <th className="hnv-traz-th">Rack</th>
                                <th className="hnv-traz-th">Producto</th>
                                <th className="hnv-traz-th hnv-traz-th--center">Solicitado / Picked</th>
                                <th className="hnv-traz-th hnv-traz-th--op">Operador</th>
                                <th className="hnv-traz-th hnv-traz-th--fecha">Registro</th>
                              </tr>
                            </thead>
                            <tbody>
                              {grupo.movs.map(m => {
                                const d   = new Date(m.fecha)
                                const dia  = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
                                const hora = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
                                const sol  = m.cantidadSolicitada ?? 0
                                const pick = m.cantidad ?? 0
                                const ok   = pick >= sol
                                return (
                                  <tr key={m.movimientoId} className="hnv-traz-fila">
                                    <td className="hnv-traz-td hnv-traz-td--rack">
                                      <code className="hnv-rack-code">{m.ubicacion ?? '—'}</code>
                                    </td>
                                    <td className="hnv-traz-td hnv-traz-td--prod">
                                      <span className="hnv-prod-nombre">{m.nombreProducto ?? '—'}</span>
                                      <span className="hnv-prod-sku">SKU: {m.producto}</span>
                                    </td>
                                    <td className="hnv-traz-td hnv-traz-td--cant">
                                      <span className="hnv-cant-row">
                                        <span className="hnv-cant-sol">{sol}</span>
                                        <span className="hnv-cant-sep">/</span>
                                        <span className={`hnv-cant-pick ${ok ? 'hnv-cant-pick--ok' : 'hnv-cant-pick--parcial'}`}>{pick}</span>
                                      </span>
                                    </td>
                                    <td className="hnv-traz-td hnv-traz-td--op">
                                      <span className="hnv-op-nombre">{m.usuario}</span>
                                    </td>
                                    <td className="hnv-traz-td hnv-traz-td--fecha">
                                      <span className="hnv-fecha-dia">{dia}</span>
                                      <span className="hnv-fecha-hora">{hora} hrs</span>
                                    </td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })()}
        </>
      )}
    </div>
  )
}

// ── Vista notas ───────────────────────────────────────────────────────────

const ESTADO_NOTA_LABELS: Record<string, string> = {
  pendiente:   'Pendiente',
  preparacion: 'En preparación',
  completa:    'Completa',
  despachada:  'Despachada',
}
const ESTADO_NOTA_COLORS: Record<string, { color: string; bg: string }> = {
  pendiente:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  preparacion: { color: '#fb923c', bg: 'rgba(251,146,60,0.15)' },
  completa:    { color: '#86efac', bg: 'rgba(34,197,94,0.15)'  },
  despachada:  { color: '#7dd3fc', bg: 'rgba(14,165,233,0.15)' },
}

function NotaHistorialRow({
  nota,
  onDetalle,
}: {
  nota: NotaResumen
  onDetalle: (notaId: string) => void
}) {
  const cfg = ESTADO_NOTA_COLORS[nota.estado] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' }
  const fechaRaw = nota.estado === 'despachada' ? nota.fechaDespacho
    : nota.estado === 'completa' ? nota.fechaPreparacion
    : nota.creadoEn
  const fecha = new Date(fechaRaw ?? nota.creadoEn).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })

  return (
    <tr className={`hnv-fila hnv-fila--${nota.estado}`} onClick={() => onDetalle(nota.notaId)}>
      <td className="hnv-td hnv-td--numero">{nota.numeroNota}</td>
      <td className="hnv-td hnv-td--cliente">{nota.nombreCliente}</td>
      <td className="hnv-td hnv-td--fecha">{fecha}</td>
      <td className="hnv-td hnv-td--estado">
        <span className="hnv-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color + '40' }}>
          {ESTADO_NOTA_LABELS[nota.estado] ?? nota.estado}
        </span>
      </td>
      <td className="hnv-td hnv-td--dev">
        {nota.tipoDev
          ? <span className={`hnv-badge hnv-badge-dev hnv-badge-dev--${nota.tipoDev}`}>{nota.tipoDev === 'total' ? 'Dev. total' : 'Dev. parcial'}</span>
          : <span className="hnv-dev-none">—</span>
        }
      </td>
      <td className="hnv-td hnv-td--accion">
        <button
          className="hnv-btn-ver"
          onClick={(e) => { e.stopPropagation(); onDetalle(nota.notaId) }}
        >
          Ver →
        </button>
      </td>
    </tr>
  )
}

function NotaHistorialCard({
  nota,
  onDetalle,
}: {
  nota: NotaResumen
  onDetalle: (notaId: string) => void
}) {
  const cfg = ESTADO_NOTA_COLORS[nota.estado] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' }
  const fechaRaw = nota.estado === 'despachada' ? nota.fechaDespacho
    : nota.estado === 'completa' ? nota.fechaPreparacion
    : nota.creadoEn
  const fecha = new Date(fechaRaw ?? nota.creadoEn).toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  })
  return (
    <div className={`hnv-card hnv-card--${nota.estado}`} onClick={() => onDetalle(nota.notaId)}>
      <div className="hnv-card-top">
        <span className="hnv-card-num">{nota.numeroNota}</span>
        <span className="hnv-badge" style={{ color: cfg.color, background: cfg.bg, borderColor: cfg.color + '40' }}>
          {ESTADO_NOTA_LABELS[nota.estado] ?? nota.estado}
        </span>
      </div>
      <div className="hnv-card-cliente">{nota.nombreCliente}</div>
      <div className="hnv-card-bottom">
        <span className="hnv-card-meta">{fecha}</span>
        {nota.tipoDev
          ? <span className={`hnv-badge hnv-badge-dev hnv-badge-dev--${nota.tipoDev}`}>{nota.tipoDev === 'total' ? 'Dev. total' : 'Dev. parcial'}</span>
          : <span className="hnv-card-meta">—</span>
        }
      </div>
    </div>
  )
}

function NotasHistorialView() {
  const [filtroEstado, setFiltroEstado] = useState('')
  const [soloConDev, setSoloConDev]     = useState(false)
  const [busqueda, setBusqueda]         = useState('')
  const [detalleId, setDetalleId]       = useState<string | null>(null)
  const { data, isLoading, isError }    = useNotas(filtroEstado || undefined)

  const notas = useMemo(() => {
    let todas = data ?? []
    if (soloConDev) todas = todas.filter(n => (n as any).tieneDev)
    if (!busqueda.trim()) return todas
    const q = busqueda.toLowerCase()
    return todas.filter(n =>
      n.numeroNota.toLowerCase().includes(q) ||
      n.nombreCliente.toLowerCase().includes(q)
    )
  }, [data, busqueda, soloConDev])

  if (detalleId) {
    return <DetalleNota notaId={detalleId} onCerrar={() => setDetalleId(null)} />
  }

  return (
    <div className="hnv-view">
      {/* Barra de filtros */}
      <div className="hnv-filtros">
        <div className="hnv-search-wrap">
          <input
            className="hnv-search"
            type="text"
            placeholder="Buscar por N° NV, cliente..."
            value={busqueda}
            onChange={e => setBusqueda(e.target.value)}
          />
        </div>
        <div className="hnv-estado-tabs">
          {(['', 'completa', 'despachada'] as const).map((e) => (
            <button
              key={e}
              className={`hnv-tab${filtroEstado === e && !soloConDev ? ' activo' : ''}`}
              onClick={() => { setFiltroEstado(e); setSoloConDev(false) }}
            >
              {e ? ESTADO_NOTA_LABELS[e] : `Todas${data ? ` (${data.length})` : ''}`}
            </button>
          ))}
          <button
            className={`hnv-tab hnv-tab--dev${soloConDev ? ' activo' : ''}`}
            onClick={() => { setSoloConDev(v => !v); setFiltroEstado('') }}
          >
            ↩ Devolución
          </button>
        </div>
      </div>

      {isLoading && <div className="hist-cargando"><span className="spinner" /><span>Cargando notas…</span></div>}
      {isError   && <p className="error">Error al cargar notas</p>}

      {!isLoading && !isError && (
        <div className="hnv-lista-wrap">
          {/* Tabla desktop */}
          <div className="hnv-tabla-scroll hnv-tabla-desktop">
            <table className="hnv-tabla">
              <thead>
                <tr className="hnv-thead-tr">
                  <th className="hnv-th">NV N°</th>
                  <th className="hnv-th">CLIENTE</th>
                  <th className="hnv-th">FECHA</th>
                  <th className="hnv-th">ESTADO</th>
                  <th className="hnv-th">DEVOLUCIÓN</th>
                  <th className="hnv-th"></th>
                </tr>
              </thead>
              <tbody>
                {notas.length === 0 ? (
                  <tr><td colSpan={6} className="hnv-vacio">No hay notas con este criterio</td></tr>
                ) : notas.map(n => (
                  <NotaHistorialRow key={n.notaId} nota={n} onDetalle={setDetalleId} />
                ))}
              </tbody>
            </table>
          </div>

          {/* Cards tablet/mobile */}
          <div className="hnv-cards-mobile">
            {notas.length === 0
              ? <div className="hnv-vacio">No hay notas con este criterio</div>
              : notas.map(n => (
                  <NotaHistorialCard key={`c-${n.notaId}`} nota={n} onDetalle={setDetalleId} />
                ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

// ── Vista jerárquica de Ingresos (OC → Productos → Movimientos) ───────────

type IngresoNivel =
  | { nivel: 'lista' }
  | { nivel: 'productos'; oc: OCResumen }
  | { nivel: 'movimientos'; oc: OCResumen; producto: ProductoEnOC }

const ESTADO_OC_CFG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#fbbf24' },
  parcial:   { label: 'Parcial',   color: '#60a5fa' },
  completa:  { label: 'Completa',  color: '#86efac' },
}

const ESTADO_PROD_CFG: Record<string, { label: string; color: string }> = {
  pendiente: { label: 'Pendiente', color: '#fbbf24' },
  parcial:   { label: 'Parcial',   color: '#60a5fa' },
  completa:  { label: 'Completa',  color: '#86efac' },
}

// ── Card de movimiento simplificada para la vista de ingresos ────────────────

function MovimientoIngresoCard({ m }: { m: MovimientoHistorial }) {
  // Extrae "X/Y" o "X" del texto del detalle generado por el backend
  const matchCant = m.detalle.match(/(\d+\/\d+|\d+)\s+unidades?/i)
  const cantStr   = matchCant ? matchCant[1] : String(m.cantidad ?? '')

  // Formato DD-MM-YYYY
  const fecha = m.fecha.slice(0, 10).split('-').reverse().join('-')

  return (
    <div className="hing-mov-card">
      <BadgeTipo tipo={m.tipo} />
      <div className="hing-mov-body">
        <p className="hing-mov-texto">
          Ingreso {cantStr} Unidades de <strong>{m.producto}</strong>{' '}
          {m.ubicacion && (
            <>en <span className="hing-mov-ubicacion">{m.ubicacion}</span></>
          )}
        </p>
        <span className="hing-mov-usuario">{m.usuario}</span>
      </div>
      <span className="hing-mov-fecha">{fecha}</span>
    </div>
  )
}

function ProductoIngresoAccordion({
  prod,
  onVerMovimientos,
}: {
  prod:             ProductoEnOC
  onVerMovimientos: () => void
}) {
  const [abierto, setAbierto] = useState(false)
  const estadoColor = prod.estado === 'completa' ? '#86efac' : prod.cantidadRecibida > 0 ? '#fbbf24' : '#f87171'
  const estadoLabel = ESTADO_PROD_CFG[prod.estado]?.label ?? prod.estado

  return (
    <div className={`hist-prod-accordion${abierto ? ' abierto' : ''}`}>
      {/* Fila colapsada */}
      <button className="hist-prod-accordion-header" onClick={() => setAbierto(v => !v)}>
        <code className="hist-prod-sku-solo">{prod.sku}</code>
        <div className="hist-prod-fila-derecha">
          <span className="hist-prod-desp">
            <span className="hist-prod-cant-label">Recibido</span>
            <strong className="hist-prod-cant-val">{prod.cantidadRecibida}</strong>
          </span>
          <span
            className="inline-flex items-center text-[11px] font-bold px-2 py-0.5 rounded-full border border-transparent whitespace-nowrap"
            style={{ color: estadoColor, background: estadoColor + '22', borderColor: estadoColor + '40' }}
          >
            {estadoLabel}
          </span>
          <span className={`hist-nota-grupo-chevron${abierto ? ' abierto' : ''}`}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </span>
        </div>
      </button>

      {/* Detalle expandido */}
      {abierto && (
        <div className="hist-prod-accordion-detalle">
          <p className="hist-prod-detalle-nombre">{prod.nombre}</p>
          <div className="hist-prod-detalle-cantidades">
            <span><span className="hist-prod-cant-label">Esperado</span><strong className="hist-prod-cant-val">{prod.cantidadEsperada}</strong></span>
            <span><span className="hist-prod-cant-label">Recibido</span><strong className="hist-prod-cant-val" style={{ color: estadoColor }}>{prod.cantidadRecibida}</strong></span>
          </div>
          <button
            className="hist-ver-mov-btn"
            onClick={(e) => { e.stopPropagation(); onVerMovimientos() }}
          >
            Ver movimientos →
          </button>
        </div>
      )}
    </div>
  )
}

function IngresosHistorialView() {
  const [nav, setNav]               = useState<IngresoNivel>({ nivel: 'lista' })
  const [filtroEstado, setFiltroEstado] = useState<string>('')

  const { data: ocs,        isLoading: cargandoOcs }  = useListaOCs()
  const importacionId = nav.nivel !== 'lista' ? nav.oc.importacionId : null
  const productoId    = nav.nivel === 'movimientos' ? nav.producto.productoId : null

  const { data: productos,   isLoading: cargandoProd } = useProductosPorOC(importacionId)
  const { data: movimientos, isLoading: cargandoMovs } = useMovimientosPorOCYProducto(importacionId, productoId)

  // ── Nivel 1: lista de OCs ──
  if (nav.nivel === 'lista') {
    return (
      <div className="hing-lista">
        <h2 className="hing-titulo">Órdenes de compra</h2>
        {cargandoOcs && <div className="hist-cargando"><span className="spinner" /><span>Cargando OCs…</span></div>}
        {!cargandoOcs && (ocs ?? []).length === 0 && <p className="vacio">No hay importaciones registradas</p>}
        <div className="hing-grid">
          {(ocs ?? []).map((oc) => {
            const cfg = ESTADO_OC_CFG[oc.estado] ?? { label: oc.estado, color: '#94a3b8' }
            return (
              <button key={oc.importacionId} className="hing-card" onClick={() => { setFiltroEstado(''); setNav({ nivel: 'productos', oc }) }}>
                <div className="hing-card-top">
                  <span className="hing-card-codigo">{oc.codigo}</span>
                  <span className="hing-badge" style={{ color: cfg.color, borderColor: cfg.color + '40', background: cfg.color + '18' }}>{cfg.label}</span>
                </div>
                <div className="hing-card-oc">OC #{oc.numeroOc}</div>
                <div className="hing-card-meta">
                  <span>{isoADMY(oc.fechaIngreso)}</span>
                  <span>{oc.totalProductos} producto{oc.totalProductos !== 1 ? 's' : ''}</span>
                </div>
                <div className="hing-card-chevron">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}><polyline points="9 18 15 12 9 6"/></svg>
                </div>
              </button>
            )
          })}
        </div>
      </div>
    )
  }

  // ── Nivel 2: productos de la OC ──
  if (nav.nivel === 'productos') {
    return (
      <div className="hing-detalle">
        <div className="hing-nav">
          <button className="btn-volver" onClick={() => { setFiltroEstado(''); setNav({ nivel: 'lista' }) }}>← Volver</button>
          <div className="hing-breadcrumb">
            <span className="hing-bc-root" onClick={() => { setFiltroEstado(''); setNav({ nivel: 'lista' }) }}>OCs</span>
            <span className="hing-bc-sep">›</span>
            <span className="hing-bc-actual">{nav.oc.codigo}</span>
          </div>
        </div>
        <div className="hing-oc-meta">
          <strong>{nav.oc.codigo}</strong>
          <span>OC #{nav.oc.numeroOc}</span>
          <span>{isoADMY(nav.oc.fechaIngreso)}</span>
        </div>
        <h3 className="hing-subtitulo">Productos ({nav.oc.totalProductos})</h3>

        {/* Filtro por estado */}
        <div className="hist-notas-filtros" style={{ marginBottom: 12 }}>
          {(['', 'pendiente', 'parcial', 'completa'] as const).map((e) => (
            <button
              key={e}
              className={`filtro-btn${filtroEstado === e ? ' activo' : ''}`}
              style={e && filtroEstado === e ? { borderColor: ESTADO_PROD_CFG[e]?.color, color: ESTADO_PROD_CFG[e]?.color } : {}}
              onClick={() => setFiltroEstado(e)}
            >
              {e ? ESTADO_PROD_CFG[e].label : 'Todos'}
            </button>
          ))}
        </div>

        {cargandoProd && <div className="hist-cargando"><span className="spinner" /><span>Cargando productos…</span></div>}
        <div className="notas-lista-panel">
          <div className="notas-lista-scroll">
            <div className="notas-lista-filas">
              {(productos ?? []).filter(p => !filtroEstado || p.estado === filtroEstado).map((prod) => (
                <ProductoIngresoAccordion
                  key={prod.detalleId}
                  prod={prod}
                  onVerMovimientos={() => setNav({ nivel: 'movimientos', oc: nav.oc, producto: prod })}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    )
  }

  // ── Nivel 3: movimientos del producto en la OC ──
  return (
    <div className="hing-detalle">
      <div className="hing-nav">
        <button className="btn-volver" onClick={() => setNav({ nivel: 'productos', oc: nav.oc })}>← Volver</button>
        <div className="hing-breadcrumb">
          <span className="hing-bc-root" onClick={() => setNav({ nivel: 'lista' })}>OCs</span>
          <span className="hing-bc-sep">›</span>
          <span className="hing-bc-root" onClick={() => setNav({ nivel: 'productos', oc: nav.oc })}>{nav.oc.codigo}</span>
          <span className="hing-bc-sep">›</span>
          <span className="hing-bc-actual">{nav.producto.sku}</span>
        </div>
      </div>
      <div className="hing-prod-header">
        <span className="hing-prod-sku">{nav.producto.sku}</span>
        <span className="hing-prod-nombre">{nav.producto.nombre}</span>
      </div>
      {cargandoMovs && <div className="hist-cargando"><span className="spinner" /><span>Cargando movimientos…</span></div>}
      {!cargandoMovs && (movimientos ?? []).length === 0 && <p className="vacio">Sin movimientos registrados para este producto en esta OC</p>}
      <div className="hing-movs-lista">
        {(movimientos ?? []).map((m) => (
          <MovimientoIngresoCard key={m.movimientoId} m={m} />
        ))}
      </div>
    </div>
  )
}

// ── Vista Picking Masivo — todas las sesiones ─────────────────────────────

const ESTADO_PM_LABELS: Record<string, string> = {
  validando:  'Validando',
  activa:     'Activa',
  completada: 'Completada',
  despachado: 'Despachado',
  cancelada:  'Cancelada',
}

function formatFechaPM(iso: string | null | undefined): string {
  if (!iso) return '—'
  return iso.slice(0, 10).split('-').reverse().join('-')
}

const ESTADO_PM_COLORS: Record<string, { color: string; bg: string }> = {
  activa:     { color: '#86efac', bg: 'rgba(34,197,94,0.15)' },
  validando:  { color: '#fbbf24', bg: 'rgba(251,191,36,0.15)' },
  completada: { color: '#7dd3fc', bg: 'rgba(14,165,233,0.15)' },
  despachado: { color: '#c4b5fd', bg: 'rgba(139,92,246,0.15)' },
  cancelada:  { color: '#f87171', bg: 'rgba(239,68,68,0.15)' },
}

function SesionPickingCard({ sesion }: { sesion: SesionResumen }) {
  const navigate = useNavigate()
  const creadoPor     = (sesion as any).creado_por_usuario?.nombre ?? null
  const despachPor    = (sesion as any).despachado_por_usuario?.nombre ?? null
  const fechaCreacion = formatFechaPM(sesion.creado_en)
  const fechaDespacho = formatFechaPM((sesion as any).despachado_en)
  const chofer        = (sesion as any).nombre_chofer ?? null
  const cfg           = ESTADO_PM_COLORS[sesion.estado] ?? { color: '#94a3b8', bg: 'rgba(148,163,184,0.15)' }
  const progreso      = sesion.total_items > 0 ? Math.round((sesion.items_completados / sesion.total_items) * 100) : 0

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => navigate(`/picking-masivo/${sesion.id}`)}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/picking-masivo/${sesion.id}`) }}
      style={{
        display: 'flex', flexDirection: 'column', gap: '0.6rem',
        padding: '1rem 1.1rem',
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '14px',
        cursor: 'pointer',
        transition: 'background 0.15s',
      }}
    >
      {/* Fila 1: OC + estado */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontWeight: 800, fontSize: '1rem', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
          {sesion.numero_oc}
        </span>
        <span style={{ flex: 1, fontSize: '0.85rem', color: 'var(--text-secondary)', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {sesion.nombre_cliente ?? '—'}
        </span>
        <span style={{ fontSize: '0.72rem', fontWeight: 700, padding: '3px 12px', borderRadius: '999px', whiteSpace: 'nowrap', color: cfg.color, background: cfg.bg }}>
          {ESTADO_PM_LABELS[sesion.estado] ?? sesion.estado}
        </span>
      </div>

      {/* Barra de progreso */}
      <div style={{ height: '4px', borderRadius: '999px', background: 'var(--border)', overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${progreso}%`, background: cfg.color, borderRadius: '999px', transition: 'width 0.3s' }} />
      </div>

      {/* Fila 2: auditoría */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 1rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ marginRight: 4 }}>📅</span>{fechaCreacion}
          {creadoPor && <> · <strong style={{ color: 'var(--text-secondary)' }}>{creadoPor}</strong></>}
        </span>
        {despachPor && (
          <span style={{ whiteSpace: 'nowrap' }}>
            <span style={{ marginRight: 4 }}>🚚</span>
            <strong style={{ color: 'var(--text-secondary)' }}>{despachPor}</strong>
            {chofer && <> · {chofer}</>}
            {fechaDespacho !== '—' && <> · {fechaDespacho}</>}
          </span>
        )}
        <span style={{ whiteSpace: 'nowrap' }}>
          <span style={{ marginRight: 4 }}>📦</span>
          <strong style={{ color: 'var(--text-secondary)' }}>{sesion.items_completados}/{sesion.total_items}</strong> ítems
        </span>
      </div>
    </div>
  )
}

function PickingHistorialView() {
  const { data, isLoading, isError } = useSesionesPicking()
  const sesiones = (data as SesionResumen[] | undefined) ?? []

  return (
    <div className="hist-notas-view">
      <h2 className="hing-titulo">Picking Masivo</h2>
      {isLoading && <div className="hist-cargando"><span className="spinner" /><span>Cargando sesiones…</span></div>}
      {isError   && <p className="error">Error al cargar sesiones</p>}
      {!isLoading && !isError && (
        <>
          <p className="notas-conteo">{sesiones.length} sesión{sesiones.length !== 1 ? 'es' : ''}</p>
          {sesiones.length === 0
            ? <p className="vacio">No hay sesiones registradas</p>
            : (
              <div className="notas-lista-panel">
                <div className="notas-lista-scroll">
                  <div className="notas-lista-filas">
                    {sesiones.map((s) => (
                      <SesionPickingCard key={s.id} sesion={s} />
                    ))}
                  </div>
                </div>
              </div>
            )
          }
        </>
      )}
    </div>
  )
}

// ── Tabla Kardex — vista densa admin ─────────────────────────────────────

function TablaKardex({
  movimientos,
  onDetalle,
}: {
  movimientos: MovimientoHistorial[]
  onDetalle:   ((ctx: DetalleContexto) => void) | null
}) {
  if (movimientos.length === 0) {
    return <p className="vacio">Sin movimientos para los filtros aplicados</p>
  }
  return (
    <div className="hkardex-scroll">
      <table className="hkardex-tabla">
        <thead>
          <tr className="hkardex-thead-tr">
            <th className="hkardex-th">FECHA / HORA</th>
            <th className="hkardex-th">TIPO</th>
            <th className="hkardex-th">PRODUCTO / SKU</th>
            <th className="hkardex-th">UBICACIÓN</th>
            <th className="hkardex-th hkardex-th--r">CANTIDAD</th>
            <th className="hkardex-th">REFERENCIA</th>
            <th className="hkardex-th">OPERADOR</th>
          </tr>
        </thead>
        <tbody>
          {movimientos.map(m => {
            const d        = new Date(m.fecha)
            const fechaStr = d.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' }).replace(/\//g, '-')
            const horaStr  = d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false })
            return (
              <tr key={m.movimientoId} className="hkardex-fila">
                <td className="hkardex-td hkardex-td--fecha">
                  <span className="hkardex-fecha-dia">{fechaStr}</span>
                  <span className="hkardex-fecha-hora"> · {horaStr}</span>
                </td>
                <td className="hkardex-td">
                  <BadgeTipo tipo={m.tipo} />
                </td>
                <td className="hkardex-td hkardex-td--prod">
                  {m.nombreProducto && <span className="hkardex-prod-nombre">{m.nombreProducto}</span>}
                  {m.producto       && <code  className="hkardex-prod-sku">{m.producto}</code>}
                </td>
                <td className="hkardex-td hkardex-td--ubic">
                  {m.ubicacion
                    ? <code className="hkardex-ubic-code">{m.ubicacion}</code>
                    : <span className="hkardex-nil">—</span>
                  }
                </td>
                <td className="hkardex-td hkardex-td--cant">
                  {m.cantidad !== null
                    ? <><strong className="hkardex-cant-num">{m.cantidad}</strong><span className="hkardex-uds"> Uds</span></>
                    : <span className="hkardex-nil">—</span>
                  }
                </td>
                <td className="hkardex-td hkardex-td--ref">
                  {m.notaNumero && onDetalle && m.notaVentaId
                    ? <button className="hkardex-ref-btn" onClick={() => onDetalle({ tipo: 'nota', notaId: m.notaVentaId!, numero: m.notaNumero! })}>NV {m.notaNumero}</button>
                    : m.importacionCodigo && onDetalle
                      ? <button className="hkardex-ref-btn hkardex-ref-btn--imp" onClick={() => onDetalle({ tipo: 'ingreso', importacionId: m.movimientoId, codigo: m.importacionCodigo! })}>{m.importacionCodigo}</button>
                      : <span className="hkardex-nil">—</span>
                  }
                </td>
                <td className="hkardex-td hkardex-td--op">
                  <span className="hkardex-op">{m.usuario}</span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

// ── Página principal ───────────────────────────────────────────────────────

type ErrorFiltro = { desde?: string; hasta?: string; rango?: string }

export function HistorialPage() {
  const hoyIso = new Date().toISOString().slice(0, 10)

  const [vista,               setVista]               = useState<'movimientos' | 'notas' | 'ingresos' | 'picking'>('movimientos')
  const [filtros,             setFiltros]             = useState<ObtenerMovimientosInput | null>({ limite: LIMITE, offset: 0, desde: hoyIso, hasta: hoyIso })
  const [detalle,             setDetalle]             = useState<DetalleContexto>(null)
  const [tipoInput,           setTipoInput]           = useState('')
  const [desdeInput,          setDesdeInput]          = useState(hoyIso)
  const [hastaInput,          setHastaInput]          = useState(hoyIso)
  const [errores,             setErrores]             = useState<ErrorFiltro>({})
  const [busquedaMovimientos, setBusquedaMovimientos] = useState('')

  const { data, isLoading, isError } = useMovimientos(filtros ?? { limite: LIMITE, offset: 0 })

  const total    = data?.total ?? 0
  const offset   = filtros?.offset ?? 0
  const hayMas   = offset + LIMITE < total
  const hayAntes = offset > 0

  const movimientosFiltrados = useMemo(() => {
    const lista = data?.movimientos ?? []
    if (!busquedaMovimientos.trim()) return lista
    const q = busquedaMovimientos.toLowerCase()
    return lista.filter(m =>
      m.producto?.toLowerCase().includes(q) ||
      m.nombreProducto?.toLowerCase().includes(q) ||
      m.usuario.toLowerCase().includes(q) ||
      m.detalle.toLowerCase().includes(q)
    )
  }, [data?.movimientos, busquedaMovimientos])

  function validar(): ErrorFiltro {
    const errs: ErrorFiltro = {}
    const hoy = new Date().toISOString().slice(0, 10)
    if (desdeInput && desdeInput > hoy) errs.desde = 'La fecha "desde" no puede ser futura'
    if (hastaInput && hastaInput > hoy) errs.hasta = 'La fecha "hasta" no puede ser futura'
    if (desdeInput && hastaInput && desdeInput > hastaInput) errs.rango = '"Desde" debe ser anterior o igual a "Hasta"'
    return errs
  }

  function handleBuscar() {
    const errs = validar()
    setErrores(errs)
    if (Object.keys(errs).length > 0) return
    setFiltros({
      tipo:   tipoInput as ObtenerMovimientosInput['tipo'] || undefined,
      desde:  desdeInput || undefined,
      hasta:  hastaInput || undefined,
      limite: LIMITE,
      offset: 0,
    })
  }

  function handleLimpiar() {
    const hoy = new Date().toISOString().slice(0, 10)
    setTipoInput('')
    setDesdeInput(hoy)
    setHastaInput(hoy)
    setErrores({})
    setBusquedaMovimientos('')
    setFiltros({ limite: LIMITE, offset: 0, desde: hoy, hasta: hoy })
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleBuscar()
  }

  function exportarCSV() {
    if (movimientosFiltrados.length === 0) return
    const headers = ['Fecha', 'Hora', 'Tipo', 'SKU', 'Producto', 'Ubicacion', 'Cantidad', 'Referencia', 'Operador']
    const rows = movimientosFiltrados.map(m => {
      const d = new Date(m.fecha)
      return [
        d.toLocaleDateString('es-CL').replace(/\//g, '-'),
        d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', hour12: false }),
        m.tipo,
        m.producto ?? '',
        m.nombreProducto ?? '',
        m.ubicacion ?? '',
        String(m.cantidad ?? ''),
        m.notaNumero ?? m.importacionCodigo ?? '',
        m.usuario,
      ]
    })
    const csv  = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href     = url
    a.download = `historial-movimientos-${new Date().toISOString().slice(0, 10)}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // Detalle vistas
  if (detalle?.tipo === 'ingreso') {
    return <DetalleIngreso importacionId={detalle.importacionId} onCerrar={() => setDetalle(null)} />
  }
  if (detalle?.tipo === 'nota') {
    return <DetalleNota notaId={detalle.notaId} onCerrar={() => setDetalle(null)} />
  }

  return (
    <div className="historial-page">
      {/* ── Tabs ── */}
      <div className="flex gap-1 bg-[var(--bg-surface)] border border-[var(--border-light)] rounded-2xl p-1 mb-4 w-full tablet:w-fit overflow-hidden">
        {(
          [
            {
              key: 'movimientos',
              label: 'Movimientos',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
              ),
            },
            {
              key: 'ingresos',
              label: 'IMP',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="8" x2="12" y2="13"/><line x1="9.5" y1="11" x2="12" y2="13.5"/><line x1="14.5" y1="11" x2="12" y2="13.5"/>
                </svg>
              ),
            },
            {
              key: 'notas',
              label: 'NV',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              ),
            },
            {
              key: 'picking',
              label: 'PM',
              icon: (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={15} height={15}>
                  <rect x="1" y="3" width="15" height="13" rx="1"/><path d="M16 8h4l3 5v3h-7V8z"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
                </svg>
              ),
            },
          ] as { key: typeof vista; label: string; icon: React.ReactNode }[]
        ).map(({ key, label, icon }) => (
          <button
            key={key}
            onClick={() => setVista(key)}
            className={`flex-1 shrink-0 tablet:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 tablet:px-4 border-0 rounded-xl text-sm tablet:text-base font-semibold cursor-pointer transition-all duration-150 whitespace-nowrap font-[Inter] ${
              vista === key
                ? 'bg-[var(--accent)] text-white shadow-sm'
                : 'bg-transparent text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {vista === 'ingresos' && <IngresosHistorialView />}

      {vista === 'picking' && <PickingHistorialView />}

      {vista === 'notas' && (
        <NotasHistorialView />
      )}

      {vista === 'movimientos' && <>
      {/* ── Panel de filtros Kardex ── */}
      <div className="hkardex-filtros-panel">
        <input
          className="hkardex-search"
          type="text"
          placeholder="Buscar por SKU, nombre de producto u operador..."
          value={busquedaMovimientos}
          onChange={e => setBusquedaMovimientos(e.target.value)}
        />
        <div className="hkardex-filtros-fila">
          <label className="hkardex-label">
            <span className="hkardex-label-txt">Tipo</span>
            <select className="hkardex-select" value={tipoInput} onChange={e => setTipoInput(e.target.value)} onKeyDown={handleKeyDown}>
              <option value="">Todos los tipos</option>
              {TIPOS_MOVIMIENTO.map(t => <option key={t} value={t}>{TIPO_LABELS[t]}</option>)}
            </select>
          </label>
          <label className={`hkardex-label${errores.desde ? ' hkardex-label--err' : ''}`}>
            <span className="hkardex-label-txt">Desde</span>
            <input className="hkardex-date" type="date" value={desdeInput}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => { setDesdeInput(e.target.value); setErrores(p => ({ ...p, desde: undefined, rango: undefined })) }}
              onKeyDown={handleKeyDown}
            />
          </label>
          <label className={`hkardex-label${errores.hasta ? ' hkardex-label--err' : ''}`}>
            <span className="hkardex-label-txt">Hasta</span>
            <input className="hkardex-date" type="date" value={hastaInput}
              max={new Date().toISOString().slice(0, 10)}
              onChange={e => { setHastaInput(e.target.value); setErrores(p => ({ ...p, hasta: undefined, rango: undefined })) }}
              onKeyDown={handleKeyDown}
            />
          </label>
          <button className="btn-primario hkardex-btn-aplicar" onClick={handleBuscar}>
            <IconSearch /> Aplicar
          </button>
          <button className="btn-secundario" onClick={handleLimpiar}>Hoy</button>
          <button
            className="hkardex-btn-export"
            onClick={exportarCSV}
            disabled={movimientosFiltrados.length === 0}
            title="Exportar a CSV"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Exportar CSV
          </button>
        </div>
        {(errores.desde || errores.hasta || errores.rango) && (
          <p className="hist-error-rango">{errores.rango ?? errores.desde ?? errores.hasta}</p>
        )}
      </div>

      {isLoading && <div className="hist-cargando"><span className="spinner" /><span>Cargando movimientos…</span></div>}
      {isError   && <p className="error">Error al cargar historial. Intenta nuevamente.</p>}

      {!isLoading && !isError && (
        <>
          <div className="hkardex-resumen">
            {busquedaMovimientos.trim()
              ? <span><strong>{movimientosFiltrados.length}</strong> resultado{movimientosFiltrados.length !== 1 ? 's' : ''} · filtro de texto activo</span>
              : <span><strong>{total}</strong> movimiento{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}</span>
            }
          </div>

          <TablaKardex movimientos={movimientosFiltrados} onDetalle={setDetalle} />

          {total > LIMITE && !busquedaMovimientos.trim() && (
            <div className="historial-paginacion">
              <button className="btn-secundario" disabled={!hayAntes}
                onClick={() => setFiltros(f => f ? { ...f, offset: Math.max(0, (f.offset ?? 0) - LIMITE) } : f)}>
                ← Anterior
              </button>
              <span className="paginacion-info">{offset + 1}–{Math.min(offset + LIMITE, total)} de {total}</span>
              <button className="btn-secundario" disabled={!hayMas}
                onClick={() => setFiltros(f => f ? { ...f, offset: (f.offset ?? 0) + LIMITE } : f)}>
                Siguiente →
              </button>
            </div>
          )}
        </>
      )}
      </>}
    </div>
  )
}
