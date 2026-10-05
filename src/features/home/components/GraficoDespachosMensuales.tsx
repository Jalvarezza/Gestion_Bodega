import { useMemo, useState } from 'react'
import { useDespachosMensuales, useClientesNotas } from '../hooks/useDashboard'
import { useBuscarProductos } from '../../productos/hooks/useProductos'
import type { FiltrosDespachosMensuales } from '../services/dashboard.api'

function IconFiltro() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={16} height={16}>
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/>
    </svg>
  )
}
function IconClose() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={12} height={12}>
      <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  )
}

type ProductoSel = { id: string; sku: string; nombre: string }

function ProductoAutocomplete({
  seleccionado,
  onSeleccionar,
}: {
  seleccionado:  ProductoSel | null
  onSeleccionar: (p: ProductoSel | null) => void
}) {
  const [q, setQ]           = useState('')
  const [abierto, setAbierto] = useState(false)
  const { data: resultados } = useBuscarProductos(q)

  if (seleccionado) {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--accent-light)] bg-[rgba(2,132,199,0.12)] border border-[rgba(125,211,252,0.3)] rounded-lg px-3 py-2">
        {seleccionado.sku} — {seleccionado.nombre}
        <button type="button" onClick={() => { onSeleccionar(null); setQ('') }} className="opacity-70 hover:opacity-100">
          <IconClose />
        </button>
      </span>
    )
  }

  return (
    <div className="relative">
      <input
        type="text"
        placeholder="Buscar SKU, nombre o marca…"
        value={q}
        onChange={(e) => { setQ(e.target.value); setAbierto(true) }}
        onFocus={() => setAbierto(true)}
        onBlur={() => setTimeout(() => setAbierto(false), 150)}
        className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-base)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
      />
      {abierto && q.length >= 2 && (resultados?.length ?? 0) > 0 && (
        <div className="absolute z-10 top-full left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-[var(--bg-surface)] border border-[var(--border-light)] rounded-lg shadow-lg">
          {resultados!.map((p) => (
            <button
              key={p.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-[var(--bg-elevated)] flex flex-col"
              onMouseDown={() => { onSeleccionar({ id: p.id, sku: p.sku, nombre: p.nombre }); setAbierto(false) }}
            >
              <span className="font-semibold text-[var(--text-primary)]">{p.sku}</span>
              <span className="text-xs text-[var(--text-muted)]">{p.nombre}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function GraficoDespachosMensuales() {
  const { data: clientes } = useClientesNotas()

  const [clienteInput, setClienteInput]       = useState('')
  const [productoSel, setProductoSel]         = useState<ProductoSel | null>(null)
  const [numeroNotaInput, setNumeroNotaInput] = useState('')
  const [filtros, setFiltros]                 = useState<FiltrosDespachosMensuales>({})

  const hayFiltrosPendientes = !!clienteInput || !!productoSel || !!numeroNotaInput
  const hayFiltrosAplicados  = !!filtros.cliente || !!filtros.productoId || !!filtros.numeroNota

  const { data, isLoading, isError } = useDespachosMensuales(filtros)

  function aplicarFiltros() {
    setFiltros({
      cliente:    clienteInput.trim() || undefined,
      productoId: productoSel?.id,
      numeroNota: numeroNotaInput.trim() || undefined,
    })
  }

  function limpiarFiltros() {
    setClienteInput('')
    setProductoSel(null)
    setNumeroNotaInput('')
    setFiltros({})
  }

  const maxCantidad = useMemo(() => Math.max(1, ...(data?.meses.map((m) => m.cantidad) ?? [0])), [data])

  const ANCHO = 700
  const ALTO  = 220
  const MARGEN_INF = 28
  const meses = data?.meses ?? []
  const anchoBarra = meses.length ? (ANCHO / meses.length) : 0

  return (
    <div className="bg-[var(--bg-surface)] rounded-2xl p-4 border border-[var(--border-light)] flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-bold text-[var(--text-primary)]">Despachos mensuales</h2>
          <p className="text-xs text-[var(--text-muted)]">NV despachadas por mes — últimos 12 meses</p>
        </div>
        {!isLoading && !isError && (
          <span className="text-sm font-bold text-[var(--accent-light)] bg-[rgba(2,132,199,0.15)] px-2.5 py-1 rounded-lg">
            {data?.total ?? 0} NV en el período
          </span>
        )}
      </div>

      {/* Filtros */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-secondary)]">
          <IconFiltro /> Filtros
        </div>
        <div className="grid grid-cols-1 tablet:grid-cols-2 gap-2">
          <div>
            <input
              type="text"
              list="dash-clientes-list"
              placeholder="Cliente"
              value={clienteInput}
              onChange={(e) => setClienteInput(e.target.value)}
              className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--border-light)] bg-[var(--bg-base)] text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
            />
            <datalist id="dash-clientes-list">
              {(clientes ?? []).map((c) => <option key={c} value={c} />)}
            </datalist>
          </div>

          <ProductoAutocomplete seleccionado={productoSel} onSeleccionar={setProductoSel} />

        </div>
        <div className="flex gap-2">
          <button
            onClick={aplicarFiltros}
            disabled={!hayFiltrosPendientes && !hayFiltrosAplicados}
            className="text-sm font-semibold px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white disabled:opacity-40"
          >
            Aplicar filtros
          </button>
          {hayFiltrosAplicados && (
            <button onClick={limpiarFiltros} className="text-sm font-semibold px-3 py-1.5 rounded-lg border border-[var(--border-light)] text-[var(--text-secondary)]">
              Limpiar
            </button>
          )}
        </div>
      </div>

      {/* Gráfico */}
      {isLoading && <div className="py-10 text-center text-sm text-[var(--text-muted)]">Cargando…</div>}
      {isError   && <div className="py-10 text-center text-sm text-red-400">Error al cargar el gráfico</div>}

      {!isLoading && !isError && (
        (data?.total ?? 0) === 0 ? (
          <div className="py-10 text-center text-sm text-[var(--text-muted)]">
            Sin despachos {hayFiltrosAplicados ? 'para estos filtros' : 'en los últimos 12 meses'}
          </div>
        ) : (
          <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
            {meses.map((m, i) => {
              const alturaMax = ALTO - MARGEN_INF - 12
              const altura    = m.cantidad > 0 ? Math.max(3, (m.cantidad / maxCantidad) * alturaMax) : 0
              const x  = i * anchoBarra
              const y  = ALTO - MARGEN_INF - altura
              const anchoReal = anchoBarra * 0.6
              const xCentrado = x + (anchoBarra - anchoReal) / 2
              return (
                <g key={m.mes}>
                  <title>{`${m.label}: ${m.cantidad} NV`}</title>
                  <rect
                    x={xCentrado}
                    y={y}
                    width={anchoReal}
                    height={altura}
                    rx={3}
                    fill="var(--accent, #0284c7)"
                    opacity={m.cantidad > 0 ? 1 : 0.15}
                  />
                  {m.cantidad > 0 && (
                    <text x={x + anchoBarra / 2} y={y - 4} textAnchor="middle" fontSize="10" fill="var(--text-secondary)">
                      {m.cantidad}
                    </text>
                  )}
                  <text x={x + anchoBarra / 2} y={ALTO - 10} textAnchor="middle" fontSize="10" fill="var(--text-muted)">
                    {m.label.split(' ')[0]}
                  </text>
                </g>
              )
            })}
          </svg>
        )
      )}
    </div>
  )
}
