import { useState } from 'react'
import { useDetalleNota } from '../../notas/hooks/useNotas'
import { useRegistrarDevolucion } from '../hooks/useDevoluciones'

function IcoBack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  )
}
function IcoReturn() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
    </svg>
  )
}

export function DevolucionFlow({
  notaId,
  adminId,
  onCerrar,
}: {
  notaId:  string
  adminId: string
  onCerrar: () => void
}) {
  const { data, isLoading, isError } = useDetalleNota(notaId)
  const mutation = useRegistrarDevolucion()

  const [cantidades, setCantidades]   = useState<Record<string, number>>({})
  const [exito, setExito]             = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [modalAbierto, setModalAbierto] = useState(false)
  const [comentario, setComentario]   = useState('')
  const [errorModal, setErrorModal]   = useState<string | null>(null)
  const [itemsPendientes, setItemsPendientes] = useState<{ productoId: string; notaProductoId: string; cantidad: number }[]>([])

  if (isLoading) return <p className="cargando">Cargando productos…</p>
  if (isError || !data) return <p className="error">Error al cargar la nota</p>

  const productosConDespacho = data.productos.filter((p) => (p.cantidadDespachada ?? 0) > 0)

  function setCantidad(notaProductoId: string, val: number) {
    setCantidades((prev) => ({ ...prev, [notaProductoId]: val }))
  }

  function handleConfirmar() {
    setError(null)
    const items = productosConDespacho.map((p) => ({
      productoId:     p.productoId,
      notaProductoId: p.notaProductoId,
      cantidad:       cantidades[p.notaProductoId] ?? 0,
    })).filter((i) => i.cantidad > 0)

    if (items.length === 0) {
      setError('Debes ingresar al menos una unidad a devolver.')
      return
    }

    setItemsPendientes(items)
    setComentario('')
    setErrorModal(null)
    setModalAbierto(true)
  }

  async function handleConfirmarConComentario() {
    if (!comentario.trim()) {
      setErrorModal('El motivo de devolución es obligatorio.')
      return
    }
    setErrorModal(null)
    try {
      await mutation.mutateAsync({ adminId, notaId, items: itemsPendientes, comentario: comentario.trim() })
      setModalAbierto(false)
      setExito(true)
    } catch (e: any) {
      setErrorModal(e?.message ?? 'Error al registrar la devolución')
    }
  }

  if (exito) {
    return (
      <div className="dev-wrap">
        <div className="dev-exito">
          <span className="dev-exito-ico">✓</span>
          <h2 className="dev-exito-titulo">Devolución registrada</h2>
          <p className="dev-exito-sub">El stock fue reintegrado al inventario.</p>
          <button className="btn-primario" onClick={onCerrar}>Volver a NV Despacho</button>
        </div>
      </div>
    )
  }

  return (
    <div className="dev-wrap">
      <div className="dev-header">
        <button className="sd-volver-btn" onClick={onCerrar}>
          <IcoBack /> Volver
        </button>
        <div>
          <h2 className="dev-titulo">Devolución — NV {data.numeroNota}</h2>
          <p className="dev-sub">{data.nombreCliente}</p>
        </div>
      </div>

      <p className="dev-instruccion">
        Indica cuántas unidades de cada producto se devuelven. Solo puedes devolver hasta la cantidad despachada.
      </p>

      {error && <div className="sd-error-banner">{error}</div>}

      <div className="dev-lista">
        {productosConDespacho.length === 0 && (
          <p className="dev-vacio">Esta nota no tiene productos despachados.</p>
        )}
        {productosConDespacho.map((p) => {
          const max = p.cantidadDespachada ?? 0
          const val = cantidades[p.notaProductoId] ?? 0
          return (
            <div key={p.notaProductoId} className="dev-item">
              <div className="dev-item-info">
                <span className="dev-item-nombre">{p.nombre}</span>
                <span className="dev-item-sku">SKU: {p.sku}</span>
              </div>
              <div className="dev-item-cant">
                <span className="dev-item-max">Despachado: {max}</span>
                <div className="dev-item-input-wrap">
                  <button
                    className="dev-qty-btn"
                    onClick={() => setCantidad(p.notaProductoId, Math.max(0, val - 1))}
                    disabled={val <= 0}
                  >−</button>
                  <input
                    className="dev-qty-input"
                    type="number"
                    min={0}
                    max={max}
                    value={val}
                    onFocus={(e) => e.target.select()}
                    onChange={(e) => {
                      const n = Math.min(max, Math.max(0, parseInt(e.target.value, 10) || 0))
                      setCantidad(p.notaProductoId, n)
                    }}
                  />
                  <button
                    className="dev-qty-btn"
                    onClick={() => setCantidad(p.notaProductoId, Math.min(max, val + 1))}
                    disabled={val >= max}
                  >+</button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {productosConDespacho.length > 0 && (
        <div className="dev-footer">
          <button
            className="btn-primario dev-confirmar-btn"
            disabled={mutation.isPending}
            onClick={handleConfirmar}
          >
            <IcoReturn />
            Confirmar devolución
          </button>
        </div>
      )}

      {modalAbierto && (
        <div className="dev-modal-overlay">
          <div className="dev-modal">
            <h3 className="dev-modal-titulo">Motivo de devolución</h3>
            <p className="dev-modal-sub">Este campo es obligatorio para registrar la devolución.</p>
            <textarea
              className={`dev-modal-textarea ${errorModal ? 'dev-modal-textarea--error' : ''}`}
              placeholder="Describe el motivo de la devolución…"
              value={comentario}
              autoFocus
              rows={4}
              onChange={(e) => { setComentario(e.target.value); setErrorModal(null) }}
            />
            {errorModal && <p className="dev-modal-error">{errorModal}</p>}
            <div className="dev-modal-acciones">
              <button className="btn-secundario" onClick={() => setModalAbierto(false)} disabled={mutation.isPending}>
                Cancelar
              </button>
              <button className="btn-primario" onClick={handleConfirmarConComentario} disabled={mutation.isPending}>
                <IcoReturn />
                {mutation.isPending ? 'Registrando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
