import { useState, type ReactNode } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import {
  useOrdenPicking, useTomarLinea, useLiberarLinea, useCancelarOrden, usePickingMasivoRealtime,
} from '../hooks/usePickingMasivo'
import { PickingLineaFlow } from '../components/PickingLineaFlow'
import type { LineaOrden } from '../services/pickingMasivo.api'

const ETIQUETA_LINEA: Record<string, string> = {
  libre: 'Libre', en_progreso: 'En proceso', completado: 'Completado', parcial: 'Parcial', sin_stock: 'Sin stock',
}
const ETIQUETA_ORDEN: Record<string, string> = { activa: 'En proceso', completada: 'Completada', cancelada: 'Cancelada' }
const RESUELTAS = ['completado', 'parcial', 'sin_stock']

type FiltroAdmin = 'pendiente' | 'completado' | 'parcial' | 'sin_stock'
type FiltroOperador = 'todas' | 'mias' | 'ocupadas' | 'parcial' | 'completas'

const IcoOjo = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" />
  </svg>
)
const IcoUbicacion = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z" /><circle cx="12" cy="10" r="3" />
  </svg>
)

const fmt = (n: number) => n.toLocaleString('es-CL')

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
  const [filtroAdmin, setFiltroAdmin] = useState<FiltroAdmin | null>(null)
  const [filtroOp, setFiltroOp] = useState<FiltroOperador>('todas')
  const [abierta, setAbierta] = useState<string | null>(null)
  const [liberando, setLiberando] = useState(false)

  async function tomarLinea(l: LineaOrden, iniciar: boolean) {
    setAviso(null)
    try {
      await tomar.mutateAsync({ usuarioId, itemId: l.id })
      if (iniciar) setLineaActiva(l)
    } catch (e) {
      setAviso(e instanceof ApiResponseError ? e.message : 'No se pudo tomar el producto')
      void refetch()
    }
  }

  async function soltarLinea(l: LineaOrden) {
    await liberar.mutateAsync({ usuarioId, itemId: l.id })
  }

  async function liberarMisTareas(mias: LineaOrden[]) {
    setLiberando(true)
    try {
      await Promise.all(mias.map((l) => liberar.mutateAsync({ usuarioId, itemId: l.id })))
    } finally {
      setLiberando(false)
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

  const q = busqueda.trim().toLowerCase()
  const coincide = (l: LineaOrden) =>
    !q || [l.sku, l.nombre, l.codigoCliente, l.codigoBarra].some((v) => (v ?? '').toLowerCase().includes(q))

  const esMia     = (l: LineaOrden) => l.estado === 'en_progreso' && l.tomadoPor === usuarioId
  const esDeOtro  = (l: LineaOrden) => l.estado === 'en_progreso' && l.tomadoPor !== usuarioId
  const pendiente = (l: LineaOrden) => !RESUELTAS.includes(l.estado)
  const mias      = orden.lineas.filter(esMia)
  const activa    = orden.estado === 'activa'
  const cliente   = orden.nombreCliente ?? 'Sin cliente'
  const pctUds    = orden.unidadesPedidas > 0 ? Math.round((orden.unidadesPickeadas / orden.unidadesPedidas) * 100) : 0
  const pctLineas = orden.totalLineas > 0 ? Math.round((orden.lineasResueltas / orden.totalLineas) * 100) : 0

  const encabezado = (acciones: ReactNode) => (
    <header className="pmo-imp-head">
      <button className="pmo-imp-volver" onClick={() => navigate('/picking-masivo')}>← Volver</button>
      <div className="pmo-imp-titulos">
        <h1>{cliente}</h1>
        <span>OC: {orden.numeroOc}</span>
      </div>
      <div className="pmo-det-head-acciones">{acciones}</div>
    </header>
  )

  const barraAviso = aviso && <p className="pmo-det-aviso">{aviso}</p>

  if (esOperador) {
    const filtrosOp: { clave: FiltroOperador; label: string; prueba: (l: LineaOrden) => boolean }[] = [
      { clave: 'todas',     label: 'Todas',      prueba: pendiente },
      { clave: 'mias',      label: 'Mis tareas', prueba: esMia },
      { clave: 'ocupadas',  label: 'Ocupadas',   prueba: esDeOtro },
      { clave: 'parcial',   label: 'Parcial',    prueba: (l) => l.estado === 'parcial' || l.estado === 'sin_stock' },
      { clave: 'completas', label: 'Completas',  prueba: (l) => l.estado === 'completado' },
    ]
    const pruebaActiva = filtrosOp.find((f) => f.clave === filtroOp)!.prueba
    const visibles = orden.lineas.filter((l) => pruebaActiva(l) && coincide(l))

    return (
      <div className="pmo-page">
        <div className="pmo-imp">
          {encabezado(
            <button className="pmo-det-btn" disabled={!mias.length || liberando} onClick={() => void liberarMisTareas(mias)}>
              🔓 {liberando ? 'Liberando…' : 'Liberar mis tareas'}
            </button>,
          )}

          <section className="pmo-det-progreso">
            <div className="pmo-det-progreso-cab">
              <h2>Progreso del lote</h2>
              <strong>{orden.lineasResueltas} / {orden.totalLineas} productos · {pctLineas}%</strong>
            </div>
            <div className="pmo-barra"><div className="pmo-barra-relleno" style={{ width: `${pctLineas}%` }} /></div>
          </section>

          <div className="pmo-imp-toolbar">
            <input className="pmo-imp-buscar" placeholder="Buscar por SKU, nombre o EAN…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
            <div className="pmo-chips">
              {filtrosOp.map((f) => (
                <button key={f.clave} className={`pmo-chip ${filtroOp === f.clave ? 'pmo-chip--activo' : ''}`} onClick={() => setFiltroOp(f.clave)}>
                  {f.label} <span>{orden.lineas.filter(f.prueba).length}</span>
                </button>
              ))}
            </div>
          </div>

          {barraAviso}

          <div className="pmo-imp-lista pmo-det-lista">
            {visibles.length === 0 && <p className="pmo-vacio">No hay productos en esta vista</p>}
            {visibles.map((l) => {
              const restante = l.cantidadPedida - l.cantidadDespachada
              return (
                <div key={l.id} className={`pmo-det-item ${esDeOtro(l) ? 'pmo-det-item--bloqueado' : ''} ${esMia(l) ? 'pmo-det-item--mio' : ''}`}>
                  <div className="pmo-det-info">
                    <div className="pmo-imp-codigos">
                      <span className="pmo-imp-sku">{l.sku}</span>
                      {l.codigoBarra && <span className="pmo-det-ean"><b>EAN</b> {l.codigoBarra}</span>}
                    </div>
                    <span className="pmo-det-nombre">{l.nombre}</span>
                    {esMia(l) && l.ubicaciones[0] && <span className="pmo-det-meta">Ir a {l.ubicaciones[0].posicionCodigo}</span>}
                    {l.motivo && <span className="pmo-det-meta">Motivo: {l.motivo}</span>}
                  </div>
                  <div className="pmo-det-uds">
                    <strong>{fmt(pendiente(l) ? restante : l.cantidadDespachada)}</strong>
                    <span>Uds</span>
                  </div>
                  <div className="pmo-det-acciones">
                    {activa && l.estado === 'libre' && (
                      <button className="pmo-det-btn pmo-det-btn--accent" disabled={tomar.isPending} onClick={() => void tomarLinea(l, false)}>Tomar</button>
                    )}
                    {activa && esMia(l) && (
                      <>
                        <button className="pmo-det-btn pmo-det-btn--solido" disabled={tomar.isPending} onClick={() => void tomarLinea(l, true)}>Picking</button>
                        <button className="pmo-det-btn" disabled={liberar.isPending} onClick={() => void soltarLinea(l)}>Soltar</button>
                      </>
                    )}
                    {esDeOtro(l) && <span className="pmo-det-bloqueo">🔒 {l.tomadoPorNombre ?? 'Otro operador'}</span>}
                    {RESUELTAS.includes(l.estado) && <span className={`pmo-det-estado pmo-det-estado--${l.estado}`}>{ETIQUETA_LINEA[l.estado]}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>

        {lineaActiva && (
          <div className="modal-overlay pmo-modal" role="dialog" aria-modal="true">
            <PickingLineaFlow
              linea={lineaActiva}
              usuarioId={usuarioId}
              onSalir={() => setLineaActiva(null)}
              onTerminada={(ordenCompleta) => {
                setLineaActiva(null)
                setAviso(ordenCompleta ? `La OC ${orden.numeroOc} quedó completada.` : null)
                void refetch()
              }}
            />
          </div>
        )}
      </div>
    )
  }

  const filtrosAdmin: { clave: FiltroAdmin; label: string; prueba: (l: LineaOrden) => boolean }[] = [
    { clave: 'pendiente',  label: 'Pendiente',  prueba: pendiente },
    { clave: 'completado', label: 'Completas',  prueba: (l) => l.estado === 'completado' },
    { clave: 'parcial',    label: 'Parcial',    prueba: (l) => l.estado === 'parcial' },
    { clave: 'sin_stock',  label: 'Sin stock',  prueba: (l) => l.estado === 'sin_stock' },
  ]
  const pruebaAdmin = filtrosAdmin.find((f) => f.clave === filtroAdmin)?.prueba
  const visibles = orden.lineas.filter((l) => (!pruebaAdmin || pruebaAdmin(l)) && coincide(l))
  const operadores = [...new Set(orden.lineas.filter((l) => l.estado === 'en_progreso').map((l) => l.tomadoPorNombre ?? 'Operador'))]

  return (
    <div className="pmo-page">
      <div className="pmo-imp">
        {encabezado(
          <>
            {puedeCancelar && activa && (
              <button className="pmo-det-btn pmo-det-btn--peligro" disabled={cancelar.isPending} onClick={() => void handleCancelar()}>
                ⊘ Cancelar orden
              </button>
            )}
            <span className={`pmo-badge pmo-badge--${orden.estado}`}>{ETIQUETA_ORDEN[orden.estado] ?? orden.estado}</span>
          </>,
        )}

        <section className="pmo-imp-paneles">
          <div className="pmo-imp-panel">
            <h2>👥 Operadores en zona ({operadores.length})</h2>
            {operadores.length === 0
              ? <p className="pmo-det-vacio">Sin operadores activos</p>
              : <div className="pmo-det-operadores">{operadores.map((n) => <span key={n}>{n}</span>)}</div>}
          </div>
          <div className="pmo-imp-panel">
            <h2>Avance global</h2>
            <div className="pmo-imp-avance">
              <div className="pmo-barra"><div className="pmo-barra-relleno" style={{ width: `${pctUds}%` }} /></div>
              <strong>{pctUds}%</strong>
            </div>
            <p className="pmo-imp-total"><strong>{fmt(orden.unidadesPickeadas)}</strong> / {fmt(orden.unidadesPedidas)} Uds completadas</p>
          </div>
        </section>

        <div className="pmo-imp-toolbar">
          <input className="pmo-imp-buscar" placeholder="🔍 Buscar por SKU, código o EAN…" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
          <div className="pmo-chips">
            {filtrosAdmin.map((f) => (
              <button key={f.clave} className={`pmo-chip ${filtroAdmin === f.clave ? 'pmo-chip--activo' : ''}`}
                onClick={() => setFiltroAdmin(filtroAdmin === f.clave ? null : f.clave)}>
                {f.label} <span>{orden.lineas.filter(f.prueba).length}</span>
              </button>
            ))}
          </div>
        </div>

        {barraAviso}

        <h3 className="pmo-imp-subtitulo">Listado de productos {cliente}</h3>

        <div className="pmo-imp-lista">
          {visibles.length === 0 && <p className="pmo-vacio">No hay productos con estos filtros</p>}
          {visibles.map((l) => {
            const ubic = l.ubicaciones[0]?.posicionCodigo
            const abiertaEsta = abierta === l.id
            return (
              <div key={l.id} className={`pmo-det-item pmo-det-item--admin ${abiertaEsta ? 'pmo-det-item--abierto' : ''}`}>
                <div className="pmo-imp-codigos">
                  <span className={`pmo-det-ubic ${ubic ? '' : 'pmo-det-ubic--sin'}`}><IcoUbicacion /> {ubic ?? 'S/U'}</span>
                  <span className="pmo-imp-sku">{l.sku}</span>
                  {l.codigoBarra && <span className="pmo-imp-ean">EAN: {l.codigoBarra}</span>}
                </div>
                <div className="pmo-det-cant">
                  <strong>{fmt(l.cantidadDespachada)}</strong> / <b>{fmt(l.cantidadPedida)}</b> Uds
                </div>
                <span className={`pmo-det-estado pmo-det-estado--${l.estado}`}>
                  {l.estado === 'en_progreso' && l.tomadoPorNombre ? `🔒 ${l.tomadoPorNombre}` : ETIQUETA_LINEA[l.estado] ?? l.estado}
                </span>
                <button className="pmo-det-btn pmo-det-btn--detalle" onClick={() => setAbierta(abiertaEsta ? null : l.id)}>
                  <IcoOjo /> Detalle
                </button>

                {abiertaEsta && (
                  <div className="pmo-det-extra">
                    <div><span>Producto</span>{l.nombre}</div>
                    {l.codigoCliente && <div><span>Cód. cliente</span>{l.codigoCliente}</div>}
                    {l.tomadoPorNombre && l.estado === 'en_progreso' && <div><span>Tomado por</span>{l.tomadoPorNombre}</div>}
                    {pendiente(l) && (
                      <div><span>Ubicaciones (FIFO)</span>
                        {l.ubicaciones.length ? l.ubicaciones.map((u) => `${u.posicionCodigo} · ${fmt(u.cantidad)} uds`).join('  |  ') : 'Sin stock ubicado'}
                      </div>
                    )}
                    {l.motivo && <div><span>Motivo</span>{l.motivo}</div>}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
