import { useState, useRef, useEffect } from 'react'
import { useValidarProducto } from '../hooks/useSalidas'
import { useCambiarEstadoNota, useAnularNota } from '../../notas/hooks/useNotas'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { onlyNumbersKeyDown, onlyNumbersPaste } from '../../../shared/utils/numericInput'

export type ItemRevision = {
  notaProductoId:          string
  sku:                     string
  nombre:                  string
  codigoBarra:             string
  codigoBarraAlternativo:  string | null
  cantidadSolicitada:      number
  cantidadDespachada:      number
  revisadoAdmin:           boolean
  estado:                  string
  skuEquivalente:          string | null
}

type Paso =
  | { tipo: 'lista' }
  | { tipo: 'escanear_producto'; item: ItemRevision }
  | { tipo: 'codigo_validado'; item: ItemRevision; codigoEscaneado: string }
  | { tipo: 'ingresar_cantidad'; item: ItemRevision; codigoEscaneado: string }
  | { tipo: 'resultado'; mensaje: string; todosRevisados: boolean }

// ── Íconos ────────────────────────────────────────────────────────────────

function IcoCheck({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  )
}
function IcoUser({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
    </svg>
  )
}
function IcoDoc({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
    </svg>
  )
}
function IcoBack({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}
function IcoScan({ size = 16 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/>
      <path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>
      <line x1="7" y1="12" x2="17" y2="12"/>
    </svg>
  )
}
function IcoClock({ size = 13 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  )
}
function IcoTruck({ size = 14 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={size} height={size}>
      <rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/>
      <circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/>
    </svg>
  )
}

// ── Stepper de auditoría ──────────────────────────────────────────────────

const PASOS_AUDIT = [
  { key: 'picking',   label: 'Picking' },
  { key: 'revision',  label: 'En Revisión' },
  { key: 'despacho',  label: 'Despachada' },
] as const

function StepperAudit({ estadoNota }: { estadoNota: 'completa' | 'despachada' }) {
  const activo = estadoNota === 'despachada' ? 2 : 1
  return (
    <div className="nd-stepper">
      {PASOS_AUDIT.map((p, i) => {
        const hecho  = i < activo
        const esteEs = i === activo
        return (
          <div key={p.key} className="nd-step-wrap">
            {i > 0 && <div className={`nd-step-line ${hecho ? 'nd-step-line--done' : ''}`} />}
            <div className={`nd-step ${hecho ? 'nd-step--done' : esteEs ? 'nd-step--active' : ''}`}>
              <div className="nd-step-circle">
                {hecho ? <IcoCheck size={10} /> : i + 1}
              </div>
              <span className="nd-step-label">{p.label}</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

// ── Modal chofer ──────────────────────────────────────────────────────────

type ModalChoferProps = {
  notaId:   string
  adminId:  string
  onCerrar: () => void
}

const CHOFERES = ['Darhyng Olea', 'Javier Arancibia', 'Jorge Alvarez', 'Gustavo Bunster', 'Cliente Retira']

function ModalChofer({ notaId, adminId, onCerrar }: ModalChoferProps) {
  const [nombreChofer, setNombreChofer] = useState('')
  const [error, setError]               = useState<string | null>(null)
  const cambiarEstado = useCambiarEstadoNota()

  async function handleConfirmar() {
    setError(null)
    try {
      await cambiarEstado.mutateAsync({ adminId, notaId, nuevoEstado: 'despachada', nombreChofer })
      onCerrar()
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al marcar para despacho')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-white mb-1">Marcar lista para despacho</h3>
        <p className="text-xs text-slate-400 mb-4">Selecciona el chofer</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1rem' }}>
          {CHOFERES.map((chofer) => (
            <button
              key={chofer}
              type="button"
              onClick={() => setNombreChofer(chofer)}
              style={{
                padding: '0.7rem 1rem',
                borderRadius: '8px',
                border: nombreChofer === chofer ? '2px solid #38bdf8' : '1px solid rgba(255,255,255,0.1)',
                background: nombreChofer === chofer ? 'rgba(56,189,248,0.12)' : 'rgba(255,255,255,0.04)',
                color: nombreChofer === chofer ? '#38bdf8' : '#e2e8f0',
                fontWeight: nombreChofer === chofer ? 700 : 400,
                fontSize: '0.875rem',
                cursor: 'pointer',
                textAlign: 'left',
                transition: 'all 0.15s',
              }}
            >
              {chofer}
            </button>
          ))}
        </div>
        {error && <p className="text-red-400 text-xs mb-3">{error}</p>}
        <div className="flex gap-2">
          <button
            className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
            onClick={onCerrar}
            disabled={cambiarEstado.isPending}
          >
            Cancelar
          </button>
          <button
            className="flex-1 px-4 py-2.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            disabled={cambiarEstado.isPending || !nombreChofer.trim()}
            onClick={handleConfirmar}
          >
            {cambiarEstado.isPending ? 'Procesando…' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Modal anular NV ───────────────────────────────────────────────────────

type ModalAnularProps = {
  notaId:    string
  adminId:   string
  onCerrar:  () => void
  onAnulada: () => void
}

function ModalAnular({ notaId, adminId, onCerrar, onAnulada }: ModalAnularProps) {
  const [motivo, setMotivo] = useState('')
  const [error, setError]   = useState<string | null>(null)
  const anular = useAnularNota()

  async function handleAnular() {
    setError(null)
    if (!motivo.trim()) { setError('Ingresa un motivo para la anulación'); return }
    try {
      await anular.mutateAsync({ adminId, notaId, motivo: motivo.trim() })
      onAnulada()
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al anular la nota')
    }
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={onCerrar}>
      <div className="bg-slate-800 border border-white/10 rounded-2xl p-6 w-full max-w-sm shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-base font-semibold text-white mb-1">Anular Nota de Venta</h3>
        <p className="text-xs text-slate-400 mb-4">Esta acción es irreversible. Ingresa el motivo de anulación.</p>
        <textarea
          className="rv-anular-textarea"
          rows={4}
          placeholder="Motivo de anulación…"
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          autoFocus
        />
        {error && <p className="text-red-400 text-xs mb-3 mt-2">{error}</p>}
        <div className="flex gap-2 mt-4">
          <button
            className="flex-1 px-4 py-2.5 rounded-lg border border-white/10 text-slate-300 text-sm hover:bg-slate-700 transition-colors"
            onClick={onCerrar}
            disabled={anular.isPending}
          >
            Cancelar
          </button>
          <button
            className="flex-1 px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-medium transition-colors disabled:opacity-50"
            disabled={anular.isPending || !motivo.trim()}
            onClick={handleAnular}
          >
            {anular.isPending ? 'Anulando…' : 'Confirmar anulación'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Props ─────────────────────────────────────────────────────────────────

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return '—'
  const d = new Date(iso)
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
}

interface Props {
  notaId:              string
  numeroNota:          string
  nombreCliente:       string
  rutCliente?:         string | null
  numeroOc?:           string | null
  comentarioDespacho?: string | null
  adminId:             string
  items:               ItemRevision[]
  estadoNota:          'completa' | 'despachada'
  nombreChofer:        string | null
  fechaPreparacion?:   string | null
  fechaDespacho?:      string | null
  tieneDev?:           boolean
  devolucion?:         { items: { sku: string; nombre: string; cantidad: number }[] } | null
  offline:             boolean
  onCerrar:            () => void
}

// ── Componente principal ──────────────────────────────────────────────────

export function RevisionFlow({
  notaId, numeroNota, nombreCliente, rutCliente, numeroOc,
  comentarioDespacho, adminId, items, estadoNota, nombreChofer,
  fechaPreparacion, fechaDespacho, tieneDev, devolucion, offline, onCerrar,
}: Props) {
  const yaDespachada = estadoNota === 'despachada'
  const rolUsuario   = localStorage.getItem('user_rol') ?? ''
  const esAdmin      = rolUsuario === 'admin' || rolUsuario === 'supervisor'

  const [paso, setPaso]           = useState<Paso>({ tipo: 'lista' })
  const [cantidad, setCantidad]   = useState('')
  const [scanInput, setScanInput] = useState('')
  const [scanError, setScanError] = useState('')
  const [error, setError]         = useState<string | null>(null)
  const [revisadoEnSesion, setRevisadoEnSesion] = useState(false)
  const [mostrarModalChofer, setMostrarModalChofer] = useState(false)
  const [mostrarModalAnular, setMostrarModalAnular] = useState(false)
  const [expandidos, setExpandidos] = useState<Set<string>>(new Set())

  function toggleExpandido(id: string) {
    setExpandidos(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const scanRef     = useRef<HTMLInputElement>(null)
  const cantidadRef = useRef<HTMLInputElement>(null)
  const validar     = useValidarProducto()

  const totalItems    = items.length
  const itemsRevisados = items.filter((i) => i.revisadoAdmin).length
  const todosRevisados = revisadoEnSesion || (items.length > 0 && items.every((i) => i.revisadoAdmin))
  const pctGlobal     = totalItems > 0 ? Math.round((itemsRevisados / totalItems) * 100) : 0
  const todosOk       = pctGlobal === 100

  useEffect(() => {
    if (paso.tipo === 'escanear_producto') scanRef.current?.focus()
    if (paso.tipo === 'ingresar_cantidad') cantidadRef.current?.focus()
  }, [paso])

  function handleSeleccionarItem(item: ItemRevision) {
    if (item.revisadoAdmin) return
    setError(null)
    setCantidad('')
    setScanInput('')
    setScanError('')
    setPaso({ tipo: 'escanear_producto', item })
  }

  function handleEscanearProducto(codigo: string) {
    if (!codigo.trim() || paso.tipo !== 'escanear_producto') return
    const normalizar = (s: string) => s.replace(/^0+/, '')
    const escaneado  = normalizar(codigo.trim())
    // Si hay equivalente, validar SOLO contra el código del equivalente (ya resuelto en codigoBarra por el servicio)
    const cbEsperado = paso.item.codigoBarra
    const cbOk  = cbEsperado ? normalizar(cbEsperado) === escaneado : true
    const altOk = paso.item.codigoBarraAlternativo ? normalizar(paso.item.codigoBarraAlternativo) === escaneado : false
    if (cbEsperado && !cbOk && !altOk) {
      const skuEsperado = paso.item.skuEquivalente ?? paso.item.sku
      setScanError(`Producto incorrecto. Escanea el código de: ${skuEsperado}`)
      setScanInput('')
      setTimeout(() => setScanError(''), 4000)
      scanRef.current?.focus()
      return
    }
    setScanError('')
    setScanInput('')
    setCantidad('')
    setError(null)
    setPaso({ tipo: 'codigo_validado', item: paso.item, codigoEscaneado: codigo.trim() })
  }

  async function handleConfirmarCantidad() {
    if (paso.tipo !== 'ingresar_cantidad') return
    const cant = parseInt(cantidad, 10)
    if (isNaN(cant) || cant <= 0) { setError('Ingresa una cantidad válida'); return }
    if (cant !== paso.item.cantidadDespachada) { setError('Cantidad no coincide con lo despachado'); return }
    setError(null)
    try {
      const resultado = await validar.mutateAsync({
        adminId,
        notaProductoId:    paso.item.notaProductoId,
        codigoProducto:    paso.codigoEscaneado,
        cantidadIngresada: cant,
      })
      if (resultado.todosRevisados) setRevisadoEnSesion(true)
      setPaso({ tipo: 'resultado', mensaje: resultado.mensaje, todosRevisados: resultado.todosRevisados })
    } catch (e) {
      const msg = e instanceof ApiResponseError ? e.message : 'Error al validar'
      setError(msg)
      if (e instanceof ApiResponseError && e.code === 'INVALID_PRODUCTO') {
        setPaso({ tipo: 'escanear_producto', item: paso.item })
        setScanInput('')
        scanRef.current?.focus()
      }
    }
  }

  const pendientes  = items.filter((i) => !i.revisadoAdmin)
  const completados = items.filter((i) => i.revisadoAdmin)

  // ── Fila de producto (grid plano igual que NotaDetallePage) ──────────────

  function renderFila(item: ItemRevision) {
    const revisado     = item.revisadoAdmin
    const esSinStock   = item.estado === 'sin_stock'
    const puedeRevisar = !revisado && !esSinStock && !offline && !yaDespachada
    const abierto      = expandidos.has(item.notaProductoId)

    const dotClass = revisado
      ? 'nd-dot nd-dot--ok'
      : esSinStock
        ? 'nd-dot nd-dot--warn'
        : 'nd-dot nd-dot--pending'

    const badgeClass = revisado
      ? 'nd-prod-badge nd-prod-badge--revisado'
      : 'nd-prod-badge nd-prod-badge--warn'

    const badgeLabel = revisado ? 'Revisado' : esSinStock ? 'Sin stock' : 'Pendiente'

    return (
      <div key={item.notaProductoId} className={`nd-prod-row rv-prod-row ${revisado ? 'nd-prod-row--terminado' : 'nd-prod-row--pendiente'}`}>

        {/* Info del producto */}
        <div
          className="nd-prod-info"
          style={{ cursor: 'pointer' }}
          onClick={() => toggleExpandido(item.notaProductoId)}
        >
          <div className="nd-prod-nombre-row">
            <code className="nd-prod-sku-inline">{item.skuEquivalente ?? item.sku}</code>
          </div>
          <span className="nd-prod-descripcion">{item.nombre}</span>
          {abierto && item.codigoBarra && (
            <code className="nd-prod-ean" style={{ marginTop: '4px' }}>{item.codigoBarra}</code>
          )}
          {item.skuEquivalente && (
            <div className="rv-equiv-info">
              <span className="rv-equiv-row"><span className="rv-equiv-etiqueta">Original:</span><code className="rv-equiv-codigo">{item.sku}</code></span>
              <span className="rv-equiv-row"><span className="rv-equiv-etiqueta">Equivalente:</span><code className="rv-equiv-codigo rv-equiv-codigo--activo">{item.skuEquivalente}</code></span>
            </div>
          )}
        </div>

        {/* Cantidades */}
        <div className="nd-prod-qty rv-prod-qty">
          <div className="nd-qty-item">
            <span className="nd-qty-label">Despachado</span>
            <span className={`nd-qty-valor ${revisado ? 'nd-qty-valor--ok' : ''}`}>{item.cantidadDespachada}</span>
          </div>
        </div>

        {/* Acción */}
        <div className="nd-prod-acciones">
          {puedeRevisar ? (
            <button
              className="btn-primario nd-prod-btns"
              style={{ fontSize: 'var(--font-size-xs)', padding: '0.3rem 0.75rem' }}
              onClick={() => handleSeleccionarItem(item)}
            >
              Revisar
            </button>
          ) : (
            <span className={badgeClass}>{badgeLabel}</span>
          )}
        </div>
      </div>
    )
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="nd-page">
      {mostrarModalChofer && (
        <ModalChofer
          notaId={notaId}
          adminId={adminId}
          onCerrar={() => { setMostrarModalChofer(false); onCerrar() }}
        />
      )}
      {mostrarModalAnular && (
        <ModalAnular
          notaId={notaId}
          adminId={adminId}
          onCerrar={() => setMostrarModalAnular(false)}
          onAnulada={() => { setMostrarModalAnular(false); onCerrar() }}
        />
      )}

      {/* ── Header ejecutivo ── */}
      <div className="nd-header">
        <div className="nd-header-top">
          <button
            className="btn-volver"
            onClick={() => {
              if (paso.tipo === 'lista') { onCerrar() }
              else { setPaso({ tipo: 'lista' }); setError(null); setScanError(''); setScanInput('') }
            }}
          >
            <IcoBack size={16} /> Volver
          </button>
          <div className="nd-header-titulo">
            <h2 className="nd-titulo">NV {numeroNota}</h2>
            <span className={`badge ${yaDespachada ? 'badge-completa' : 'badge-preparacion'}`}>
              {yaDespachada ? 'Despachada' : 'En Revisión'}
            </span>
          </div>
          {/* Botón "Lista para despacho" en el header cuando todos revisados */}
          {!yaDespachada && todosRevisados && esAdmin && (
            <div className="nd-header-acciones">
              <button
                className="nd-btn-enviar"
                disabled={offline}
                onClick={() => setMostrarModalChofer(true)}
              >
                <IcoTruck size={14} /> Lista para despacho
              </button>
            </div>
          )}
        </div>

        {/* Meta strip de cliente */}
        <div className="nd-meta-strip">
          <div className="nd-meta-item">
            <IcoUser size={13} />
            <span className="nd-meta-label">Cliente</span>
            <span className="nd-meta-valor">{nombreCliente}</span>
          </div>
          {rutCliente && (
            <div className="nd-meta-item">
              <IcoDoc size={13} />
              <span className="nd-meta-label">RUT</span>
              <span className="nd-meta-valor">{rutCliente}</span>
            </div>
          )}
          {numeroOc && (
            <div className="nd-meta-item">
              <IcoDoc size={13} />
              <span className="nd-meta-label">N° OC</span>
              <span className="nd-meta-valor">{numeroOc}</span>
            </div>
          )}
          {fechaPreparacion && (
            <div className="nd-meta-item">
              <IcoClock size={13} />
              <span className="nd-meta-label">Preparada</span>
              <span className="nd-meta-valor">{fmtFecha(fechaPreparacion)}</span>
            </div>
          )}
          {yaDespachada && fechaDespacho && (
            <div className="nd-meta-item">
              <IcoClock size={13} />
              <span className="nd-meta-label">Despachada</span>
              <span className="nd-meta-valor">{fmtFecha(fechaDespacho)}</span>
            </div>
          )}
          {yaDespachada && nombreChofer && (
            <div className="nd-meta-item">
              <IcoTruck size={13} />
              <span className="nd-meta-label">Chofer</span>
              <span className="nd-meta-valor">{nombreChofer}</span>
            </div>
          )}
        </div>
      </div>


      {/* ── Avisos ── */}
      {offline && <div className="nd-aviso nd-aviso--offline">Sin conexión — modo solo lectura.</div>}
      {error   && <div className="nd-aviso nd-aviso--error">{error}</div>}

      {/* ── Botón Anular NV (solo admin, solo en vista lista, no despachada) ── */}
      {paso.tipo === 'lista' && esAdmin && !yaDespachada && (
        <div style={{ padding: '0 var(--spacing-md)', marginBottom: '0.5rem' }}>
          <button
            className="rv-btn-anular"
            disabled={offline}
            onClick={() => setMostrarModalAnular(true)}
          >
            Anular NV
          </button>
        </div>
      )}

      {/* ── Banner devolución registrada ── */}
      {tieneDev && (
        <div className="rv-dev-banner">
          <div className="rv-dev-banner-header">
            <span className="rv-dev-banner-ico">↩</span>
            <span className="rv-dev-banner-titulo">Devolución registrada</span>
          </div>
          {devolucion?.items?.length ? (
            <table className="rv-dev-tabla">
              <thead>
                <tr>
                  <th>SKU</th>
                  <th>Producto</th>
                  <th>Cant.</th>
                </tr>
              </thead>
              <tbody>
                {devolucion.items.map((it, i) => (
                  <tr key={i}>
                    <td><span className="rv-dev-sku">{it.sku}</span></td>
                    <td>{it.nombre}</td>
                    <td className="rv-dev-cant">{it.cantidad}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : null}
        </div>
      )}

      {/* ── Progreso global (solo en vista lista) ── */}
      {paso.tipo === 'lista' && (
        <div className="nd-progreso-global">
          <div className="nd-progreso-info">
            <span className="nd-progreso-titulo">Revisión de productos</span>
            <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
              <span className="nd-progreso-fraccion">{itemsRevisados}/{totalItems} ítems</span>
              <span className={`nd-progreso-pct ${todosOk ? 'nd-progreso-pct--ok' : ''}`}>{pctGlobal}%</span>
            </div>
          </div>
          <div className="nd-progreso-barra">
            <div className={`nd-progreso-fill ${todosOk ? 'nd-progreso-fill--ok' : ''}`} style={{ width: `${pctGlobal}%` }} />
          </div>
        </div>
      )}

      {/* ══ VISTA LISTA ════════════════════════════════════════════════════ */}
      {paso.tipo === 'lista' && (
        <>
          {comentarioDespacho && (
            <div className="nd-aviso" style={{ borderColor: 'var(--color-blue-500)', background: 'color-mix(in srgb, var(--color-blue-500) 10%, transparent)' }}>
              <strong>Comentario:</strong> {comentarioDespacho}
            </div>
          )}

          {/* Header tabla */}
          <div className="nd-tabla-header rv-tabla-header">
            <div>Producto</div>
            <div className="nd-col-qty">Cantidades</div>
            <div className="nd-col-acc">Estado</div>
          </div>

          {pendientes.length > 0 && (
            <section>
              <h3 className="nd-seccion-titulo">
                Pendientes ({pendientes.length})
              </h3>
              <div className="nd-productos-lista">
                {pendientes.map(renderFila)}
              </div>
            </section>
          )}

          {completados.length > 0 && (
            <section className={pendientes.length > 0 ? 'nd-productos-lista--completados' : ''}>
              <h3 className="nd-seccion-titulo">
                Revisados ({completados.length})
              </h3>
              <div className="nd-productos-lista">
                {completados.map(renderFila)}
              </div>
            </section>
          )}
        </>
      )}

      {/* ══ ESCANEAR PRODUCTO ══════════════════════════════════════════════ */}
      {paso.tipo === 'escanear_producto' && (
        <div className="rv-scan-paso">
          <div className="rv-scan-producto-info">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
              <code className="nd-prod-sku-inline" style={{ flexShrink: 0 }}>{paso.item.skuEquivalente ?? paso.item.sku}</code>
              <span className="nd-prod-nombre" style={{ fontSize: 'var(--font-size-base)' }}>{paso.item.nombre}</span>
            </div>
            {paso.item.skuEquivalente ? (
              <div className="rv-equiv-despacho">
                <span className="rv-equiv-row"><span className="rv-equiv-etiqueta">Producto original:</span><code className="rv-equiv-codigo">{paso.item.sku}</code></span>
                <span className="rv-equiv-row rv-equiv-row--activo"><span className="rv-equiv-etiqueta">Equivalente asignado:</span><code className="rv-equiv-codigo rv-equiv-codigo--activo">{paso.item.skuEquivalente}</code></span>
                {paso.item.codigoBarra && <code className="nd-prod-ean" style={{ marginTop: '4px' }}>{paso.item.codigoBarra}</code>}
              </div>
            ) : (
              <div className="nd-prod-codes">
                {paso.item.codigoBarra && <code className="nd-prod-ean">{paso.item.codigoBarra}</code>}
              </div>
            )}
          </div>

          <div className={`nd-scanner-bar ${scanError ? 'nd-scanner-bar--error' : ''}`}>
            <span className="nd-scanner-icon"><IcoScan size={18} /></span>
            <input
              ref={scanRef}
              className="nd-scanner-input"
              type="text"
              inputMode="numeric"
              placeholder="Escanea el código de barras del producto…"
              autoComplete="off"
              value={scanInput}
              onChange={(e) => setScanInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { handleEscanearProducto(scanInput); e.preventDefault() }
              }}
            />
            <BarcodeScanner
              onDetected={(codigo) => { setScanInput(codigo); handleEscanearProducto(codigo) }}
              title="Escanear producto"
            />
          </div>
          {scanError && <p className="nd-scanner-error">{scanError}</p>}

          <div className="rv-paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'lista' }); setError(null); setScanError('') }}>
              ← Volver
            </button>
            <button className="btn-primario" onClick={() => handleEscanearProducto(scanInput)}>
              Confirmar
            </button>
          </div>
        </div>
      )}

      {/* ══ CÓDIGO VALIDADO ════════════════════════════════════════════════ */}
      {paso.tipo === 'codigo_validado' && (
        <div className="rv-scan-paso">
          <div style={{ borderLeft: '4px solid #22c55e', borderTop: '1px solid rgba(34,197,94,0.4)', borderRight: '1px solid rgba(34,197,94,0.4)', borderBottom: '1px solid rgba(34,197,94,0.4)', background: 'rgba(34,197,94,0.15)', borderRadius: '8px', padding: '14px 16px', display: 'flex', alignItems: 'center', gap: '10px', color: '#4ade80', fontWeight: 700, fontSize: '1rem' }}>
            <IcoCheck size={20} /> Producto validado correctamente
          </div>
          <div className="rv-scan-producto-info">
            <span className="nd-prod-nombre">{paso.item.nombre}</span>
            <code className="nd-prod-sku">{paso.item.skuEquivalente ?? paso.item.sku}</code>
          </div>
          <div className="rv-paso-acciones">
            <button className="btn-secundario" onClick={() => { setPaso({ tipo: 'escanear_producto', item: paso.item }); setError(null) }}>
              ← Volver
            </button>
            <button
              className="btn-primario"
              onClick={() => setPaso({ tipo: 'ingresar_cantidad', item: paso.item, codigoEscaneado: paso.codigoEscaneado })}
            >
              Continuar →
            </button>
          </div>
        </div>
      )}

      {/* ══ INGRESAR CANTIDAD ══════════════════════════════════════════════ */}
      {paso.tipo === 'ingresar_cantidad' && (
        <div className="rv-scan-paso">
          <div className="rv-scan-producto-info">
            <span className="nd-prod-nombre">{paso.item.nombre}</span>
            <code className="nd-prod-sku">{paso.item.skuEquivalente ?? paso.item.sku}</code>
          </div>

          <div className="rv-cantidad-panel">
            <div className="rv-cantidad-referencia">
              <span className="nd-qty-label">Cantidad despachada registrada</span>
              <strong className="nd-qty-valor" style={{ fontSize: 'var(--font-size-xl)' }}>{paso.item.cantidadDespachada}</strong>
            </div>
            <label className="rv-cantidad-label">
              <span className="nd-qty-label">Cantidad física contada</span>
              <input
                ref={cantidadRef}
                className="rv-cantidad-input"
                type="number"
                min={1}
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                onKeyDown={(e) => { onlyNumbersKeyDown(e); if (e.key === 'Enter') void handleConfirmarCantidad() }}
                onPaste={onlyNumbersPaste}
              />
            </label>
          </div>

          <div className="rv-paso-acciones">
            <button
              className="btn-secundario"
              onClick={() => { setPaso({ tipo: 'escanear_producto', item: paso.item }); setError(null) }}
            >
              ← Volver
            </button>
            <button
              className="btn-primario"
              disabled={validar.isPending || !cantidad}
              onClick={() => void handleConfirmarCantidad()}
            >
              {validar.isPending ? 'Validando…' : 'Confirmar cantidad'}
            </button>
          </div>
        </div>
      )}

      {/* ══ RESULTADO ══════════════════════════════════════════════════════ */}
      {paso.tipo === 'resultado' && (
        <div className="rv-scan-paso">
          <div className="nd-aviso" style={{ borderColor: 'var(--color-green-500)', background: 'color-mix(in srgb, var(--color-green-500) 10%, transparent)', flexDirection: 'column', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600 }}>
              <IcoCheck size={18} /> {paso.todosRevisados ? '¡Todos los productos revisados!' : 'Producto validado'}
            </div>
            <p style={{ margin: 0, opacity: 0.85 }}>{paso.mensaje}</p>
          </div>
          {paso.todosRevisados && esAdmin && (
            <button
              className="nd-btn-enviar"
              style={{ width: '100%', justifyContent: 'center', marginTop: '0.5rem' }}
              disabled={offline}
              onClick={() => setMostrarModalChofer(true)}
            >
              <IcoTruck size={14} /> Lista para despacho
            </button>
          )}
          <button className="btn-secundario" style={{ marginTop: '0.5rem' }} onClick={() => { setPaso({ tipo: 'lista' }); setError(null) }}>
            ← Volver a la lista
          </button>
        </div>
      )}
    </div>
  )
}
