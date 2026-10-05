import { useState } from 'react'
import { useBuscarProductos, useUbicacionesProducto } from '../hooks/useProductos'
import { useConectividad } from '../../../shared/hooks/useConectividad'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'
import type { ProductoConUbicacion } from '../../../shared/types/servicios'

function BadgeUbicacion({ tipo, label }: { tipo: ProductoConUbicacion['ubicacion']['tipo']; label: string }) {
  return (
    <span className={`badge-ubicacion badge-ubicacion--${tipo}`}>
      {tipo === 'rack'        && <IconRack />}
      {tipo === 'pasillo'     && <IconPasillo />}
      {tipo === 'sin_stock'   && <IconSinStock />}
      {tipo === 'sin_ubicacion' && <IconSinUbicacion />}
      {label}
    </span>
  )
}

function IconRack() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <rect x="2" y="3" width="20" height="5" rx="1"/><rect x="2" y="10" width="20" height="5" rx="1"/><rect x="2" y="17" width="20" height="5" rx="1"/>
    </svg>
  )
}
function IconPasillo() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <path d="M3 9h18v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9z"/><path d="M3 9V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4"/>
    </svg>
  )
}
function IconSinStock() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>
    </svg>
  )
}
function IconSinUbicacion() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={14} height={14}>
      <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
    </svg>
  )
}

function UbicacionesModal({ p, onCerrar }: { p: ProductoConUbicacion; onCerrar: () => void }) {
  const { data: ubicaciones, isLoading } = useUbicacionesProducto(p.id)

  return (
    <div className="excel-overlay" onClick={onCerrar}>
      <div className="excel-modal" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="excel-header">
          <div className="excel-header-titulo">
            <div>
              <span style={{ fontFamily: 'monospace', fontSize: '1.1rem', fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '4px', padding: '2px 8px', display: 'inline-block', marginBottom: '0.3rem' }}>{p.sku}</span>
              <h2 style={{ fontSize: '0.95rem', margin: '0 0 0.15rem 0', color: 'var(--text-primary)' }}>{p.nombre}</h2>
              <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', margin: 0 }}>
                Stock total: <strong style={{ color: (p.stock_total ?? 0) === 0 ? 'var(--danger)' : 'var(--success)' }}>{p.stock_total ?? 0}</strong>
              </p>
            </div>
          </div>
          <button className="excel-btn-cerrar" onClick={onCerrar}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>

        <div className="excel-body" style={{ padding: '1rem' }}>
          {isLoading && (
            <div className="excel-estado"><span className="spinner" /><span>Cargando ubicaciones…</span></div>
          )}
          {!isLoading && (!ubicaciones || ubicaciones.length === 0) && (
            <div className="excel-estado"><p>Sin stock en ninguna ubicación</p></div>
          )}
          {!isLoading && ubicaciones && ubicaciones.length > 0 && (
            <div className="flex flex-col gap-2">
              {ubicaciones.map((u, i) => (
                <div key={u.loteId} className="flex items-center justify-between px-4 py-3 rounded-xl border border-white/10 bg-slate-800/60">
                  <div className="flex items-center gap-3">
                    {i === 0 && (
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">FIFO</span>
                    )}
                    <div>
                      <p className="text-sm font-semibold text-slate-100">
                        {u.posicionCodigo ?? u.pasilloNombre ?? 'Sin ubicación'}
                      </p>
                      <p className="text-xs text-slate-400">Ingreso: {u.fechaIngreso}</p>
                    </div>
                  </div>
                  <span className="text-lg font-bold text-emerald-400">{u.cantidad}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function ProductoCard({ p, onClick }: { p: ProductoConUbicacion; onClick: () => void }) {
  return (
    <button className="producto-card" style={{ width: '100%', textAlign: 'left', cursor: 'pointer' }} onClick={onClick}>
      <div className="producto-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0, flex: 1 }}>
          <span style={{ fontFamily: 'monospace', fontSize: '0.95rem', fontWeight: 700, color: '#4ade80', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', borderRadius: '4px', padding: '1px 6px', whiteSpace: 'nowrap', flexShrink: 0 }}>{p.sku}</span>
          <span className="producto-card-nombre">{p.nombre}</span>
        </div>
        {p.ubicacion.tipo !== 'sin_stock' && (
          <span className="producto-card-badge-ubicacion">
            <BadgeUbicacion tipo={p.ubicacion.tipo} label={p.ubicacion.label} />
          </span>
        )}
      </div>
      <div className="producto-card-meta">
        {p.codigo_barra && (
          <span className="producto-card-cb">CB: {p.codigo_barra}</span>
        )}
        {p.marca && (
          <span className="producto-card-marca">{p.marca}</span>
        )}
      </div>
      <div className="producto-card-stock">
        <span className="producto-card-stock-label">Stock</span>
        <span className={`producto-card-stock-valor${(p.stock_total ?? 0) === 0 ? ' sin-stock' : ''}`}>
          {p.stock_total ?? 0}
        </span>
      </div>
    </button>
  )
}

export function ProductosPage() {
  const { offline } = useConectividad()
  const [busqueda, setBusqueda]           = useState('')
  const [productoSeleccionado, setProductoSeleccionado] = useState<ProductoConUbicacion | null>(null)

  const { data: resultado, isFetching } = useBuscarProductos(busqueda)

  const productos = busqueda.length >= 2 ? (resultado ?? []) : []
  const sinResultados = busqueda.length >= 2 && !isFetching && productos.length === 0

  return (
    <div className="productos-page">
      {productoSeleccionado && (
        <UbicacionesModal p={productoSeleccionado} onCerrar={() => setProductoSeleccionado(null)} />
      )}
      <h1 className="productos-titulo">Búsqueda de Productos</h1>

      {offline && <div className="aviso-offline">Sin conexión — datos en caché</div>}

      <div className="barra-busqueda">
        <input
          type="search"
          placeholder="Nombre, SKU o código de barras…"
          value={busqueda}
          onChange={(e) => setBusqueda(e.target.value)}
          autoComplete="off"
          autoFocus
        />
        <BarcodeScanner onDetected={(codigo) => setBusqueda(codigo)} title="Escanear código de barras" />
        {isFetching && busqueda.length >= 2 && <span className="spinner" aria-label="Buscando" />}
      </div>

      {busqueda.length < 2 && (
        <div className="productos-estado-vacio">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" width={48} height={48} className="productos-icono-buscar">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <p>Escribe al menos 2 caracteres para buscar</p>
        </div>
      )}

      {sinResultados && (
        <div className="productos-estado-vacio">
          <p>No se encontraron productos para <strong>"{busqueda}"</strong></p>
        </div>
      )}

      {productos.length > 0 && (
        <div className="productos-lista">
          <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '0 0 0.5rem 0' }} />
          <p className="productos-conteo">{productos.length} resultado{productos.length !== 1 ? 's' : ''}</p>
          {productos.map((p) => (
            <ProductoCard key={p.id} p={p} onClick={() => setProductoSeleccionado(p)} />
          ))}
        </div>
      )}
    </div>
  )
}
