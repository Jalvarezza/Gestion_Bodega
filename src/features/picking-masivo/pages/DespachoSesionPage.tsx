import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { useSesionPicking, useBuscarLpn, useValidarLpn, useBuscarItem, useValidarItem, useDespacharSesion, useGuardarLpns, useGuardarLpnsEscaneados } from '../hooks/usePickingMasivo'
import { ApiResponseError } from '../../../shared/utils/apiClient'
import { BarcodeScanner } from '../../../shared/components/BarcodeScanner'

type ItemPendienteLpn = {
  itemId:         string
  codigo:         string
  descripcion:    string
  cantidadPedida: number
  tienda:         string | null
  lpn:            string
}

type ItemValidadoLpn = ItemPendienteLpn

type ItemPendienteSodimac = {
  itemId:             string
  codigo:             string
  descripcion:        string
  cantidadPedida:     number
  cantidadDespachada: number
  tienda:             string | null
}

type ItemValidadoSodimac = ItemPendienteSodimac & { estado: string }

type LpnDetalle = { codigo: string; tienda: string; cantidad: number }
type LpnEntry   = { lpn: string; totalEmpaque: number; items: LpnDetalle[] }

// Fase Sodimac: validar productos → cargar Excel LPN → validar LPNs → despachar
type FaseSodimac = 'productos' | 'lpns'

export function DespachoSesionPage() {
  const { id }          = useParams<{ id: string }>()
  const navigate        = useNavigate()
  const [searchParams]  = useSearchParams()
  const sesionId        = id ?? ''
  const adminId         = localStorage.getItem('user_id') ?? ''
  const iniciarEnLpns   = searchParams.get('fase') === 'lpns'

  const { data: sesion, isLoading } = useSesionPicking(sesionId || null)

  // LPN flow (Imperial)
  const buscarLpn       = useBuscarLpn()
  const validarLpn      = useValidarLpn(sesionId)

  // Barcode flow (Sodimac)
  const buscarItem      = useBuscarItem()
  const validarItem     = useValidarItem(sesionId)

  const despacharSesion = useDespacharSesion()
  const guardarLpns            = useGuardarLpns()
  const guardarLpnsEscaneados  = useGuardarLpnsEscaneados()

  const [scanInput, setScanInput]                   = useState('')
  const [itemPendienteLpn, setItemPendienteLpn]     = useState<ItemPendienteLpn | null>(null)
  const [itemPendienteSodimac, setItemPendienteSodimac] = useState<ItemPendienteSodimac | null>(null)
  const [validadosLpn, setValidadosLpn]             = useState<ItemValidadoLpn[]>([])
  const [validadosSodimac, setValidadosSodimac]     = useState<ItemValidadoSodimac[]>([])
  const [inicializado, setInicializado]             = useState(false)
  const [detalleLpn, setDetalleLpn]                 = useState<ItemValidadoLpn | null>(null)
  const [errorScan, setErrorScan]                   = useState<string | null>(null)
  const [mostrarChofer, setMostrarChofer]           = useState(false)
  const [nombreChofer, setNombreChofer]             = useState('')
  const [errorDespacho, setErrorDespacho]           = useState<string | null>(null)

  // Sodimac fase 2: LPN
  const [faseSodimac, setFaseSodimac]               = useState<FaseSodimac>(iniciarEnLpns ? 'lpns' : 'productos')
  const [mostrarCargarLpn, setMostrarCargarLpn]     = useState(false)
  const [lpnsExcel, setLpnsExcel]                   = useState<LpnEntry[]>([])
  const [lpnsEscaneados, setLpnsEscaneados]         = useState<Set<string>>(new Set())
  const [lpnScanInput, setLpnScanInput]             = useState('')
  const [lpnPendiente, setLpnPendiente]             = useState<LpnEntry | null>(null)
  const [lpnDetalleAbierto, setLpnDetalleAbierto]  = useState(false)
  const [errorLpnScan, setErrorLpnScan]             = useState<string | null>(null)
  const [errorExcel, setErrorExcel]                 = useState<string | null>(null)

  const [preparacionConfirmada, setPreparacionConfirmada] = useState(() => {
    try { return localStorage.getItem(`pm_productos_ok_${sesionId}`) === '1' } catch { return false }
  })
  const [filtroLpns, setFiltroLpns]                 = useState<'pendientes' | 'validados'>('pendientes')
  const [filtroImperial, setFiltroImperial]         = useState<'pendientes' | 'validados'>('pendientes')
  const [imperialExpandido, setImperialExpandido]   = useState<string | null>(null)
  const [filtroPendientes, setFiltroPendientes]     = useState(false)
  const [filtroEstadoDespacho, setFiltroEstadoDespacho] = useState<'todos' | 'parcial' | 'sin_stock'>('todos')
  const [productoExpandido, setProductoExpandido]  = useState<string | null>(null)
  const [busquedaSodimac, setBusquedaSodimac]       = useState('')

  const inputRef        = useRef<HTMLInputElement>(null)
  const lpnInputRef     = useRef<HTMLInputElement>(null)
  const fileInputRef    = useRef<HTMLInputElement>(null)
  const scanCooldownRef = useRef(false)   // evita doble disparo \r\n del lector

  // Detectar si la sesión usa LPN (Imperial) o no (Sodimac)
  const items = (sesion as any)?.items as Array<{
    id: string; codigo: string; descripcion: string
    cantidad_pedida: number; tienda: string | null
    lpn: string | null; lpn_validado: boolean
    subtareas_picking_masivo?: Array<{ cantidad_despachada: number | null }>
  }> | undefined

  const sesionTieneLpn = items ? items.some((i) => !!i.lpn) : true

  // Inicializar validados desde la BD al cargar la sesión
  // Cargar LPNs desde la BD al recibir la sesión
  useEffect(() => {
    const lpnsDb = (sesion as any)?.lpns_excel as LpnEntry[] | undefined
    if (lpnsDb && lpnsDb.length > 0) setLpnsExcel(lpnsDb)
    const escaneadosDb = (sesion as any)?.lpns_escaneados as string[] | undefined
    if (escaneadosDb && escaneadosDb.length > 0) setLpnsEscaneados(new Set(escaneadosDb))
  }, [sesion])

  useEffect(() => {
    if (!sesion || inicializado || !items) return
    if (sesionTieneLpn) {
      const yaValidados = items
        .filter((i) => i.lpn_validado && i.lpn)
        .map((i) => ({
          itemId:         i.id,
          codigo:         i.codigo,
          descripcion:    i.descripcion,
          cantidadPedida: i.cantidad_pedida,
          tienda:         i.tienda ?? null,
          lpn:            i.lpn!,
        }))
      setValidadosLpn(yaValidados)
    } else {
      const yaValidados = items
        .filter((i) => i.lpn_validado)
        .map((i) => {
          const despachada = (i.subtareas_picking_masivo ?? []).reduce(
            (acc, s) => acc + (s.cantidad_despachada ?? 0), 0
          )
          const estado = despachada === 0 ? 'sin_stock' : despachada < i.cantidad_pedida ? 'parcial' : 'completado'
          return {
            itemId:             i.id,
            codigo:             i.codigo,
            descripcion:        i.descripcion,
            cantidadPedida:     i.cantidad_pedida,
            cantidadDespachada: despachada,
            tienda:             i.tienda ?? null,
            estado,
          }
        })
      setValidadosSodimac(yaValidados)
    }
    setInicializado(true)
  }, [sesion, inicializado, items, sesionTieneLpn])

  // Auto-validar como sin_stock los items Imperial (LPN) con cantidad despachada = 0
  useEffect(() => {
    if (!inicializado || !sesionTieneLpn || !items) return

    const sinStockNoValidados = items.filter(i => {
      if (i.lpn_validado || !i.lpn) return false
      const subs = i.subtareas_picking_masivo ?? []
      if (subs.length === 0) return false
      return subs.every(s => (s.cantidad_despachada ?? 0) === 0)
    })

    if (sinStockNoValidados.length === 0) return

    Promise.all(
      sinStockNoValidados.map(async i => {
        try {
          await validarLpn.mutateAsync({ sesionId, lpn: i.lpn! })
          return {
            itemId:         i.id,
            codigo:         i.codigo,
            descripcion:    i.descripcion,
            cantidadPedida: i.cantidad_pedida,
            tienda:         i.tienda ?? null,
            lpn:            i.lpn!,
          } as ItemValidadoLpn
        } catch { return null }
      })
    ).then(resultados => {
      const validos = resultados.filter(Boolean) as ItemValidadoLpn[]
      if (validos.length > 0) {
        setValidadosLpn(prev => {
          const ids = new Set(prev.map(v => v.itemId))
          return [...prev, ...validos.filter(v => !ids.has(v.itemId))]
        })
      }
    })
  }, [inicializado]) // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-validar como sin_stock los items Sodimac con cantidad despachada = 0
  useEffect(() => {
    if (!inicializado || sesionTieneLpn || !items) return

    const sinStockNoValidados = items.filter((i) => {
      if (i.lpn_validado) return false
      const despachada = (i.subtareas_picking_masivo ?? []).reduce((s, t) => s + (t.cantidad_despachada ?? 0), 0)
      return despachada === 0
    })

    if (sinStockNoValidados.length === 0) return

    Promise.all(
      sinStockNoValidados.map(async (i) => {
        try {
          await validarItem.mutateAsync({ sesionId, itemId: i.id })
          return {
            itemId:             i.id,
            codigo:             i.codigo,
            descripcion:        i.descripcion,
            cantidadPedida:     i.cantidad_pedida,
            cantidadDespachada: 0,
            tienda:             i.tienda ?? null,
            estado:             'sin_stock',
          } as ItemValidadoSodimac
        } catch {
          return null
        }
      })
    ).then((resultados) => {
      const validos = resultados.filter(Boolean) as ItemValidadoSodimac[]
      if (validos.length > 0) {
        setValidadosSodimac((prev) => {
          const ids = new Set(prev.map((v) => v.itemId))
          return [...prev, ...validos.filter((v) => !ids.has(v.itemId))]
        })
      }
    })
  }, [inicializado]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Handlers LPN (Imperial) ──────────────────────────────────────────────────

  async function handleBuscarLpn(lpn: string) {
    const lpnTrimmed = lpn.trim()
    if (!lpnTrimmed || lpnTrimmed.length < 3) return
    if (scanCooldownRef.current) return
    scanCooldownRef.current = true
    setTimeout(() => { scanCooldownRef.current = false }, 500)
    setErrorScan(null)

    if (validadosLpn.some(v => v.lpn === lpnTrimmed)) {
      setErrorScan(`LPN "${lpnTrimmed}" ya fue validado`)
      setScanInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
      return
    }

    try {
      const res = await buscarLpn.mutateAsync({ sesionId, lpn: lpnTrimmed })
      setItemPendienteLpn({ ...res, lpn: lpnTrimmed })
      setScanInput('')
    } catch (e) {
      setErrorScan(e instanceof ApiResponseError ? e.message : 'LPN no encontrado en esta sesión')
      setScanInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function handleConfirmarLpn() {
    if (!itemPendienteLpn) return
    try {
      await validarLpn.mutateAsync({ sesionId, lpn: itemPendienteLpn.lpn })
      setValidadosLpn((prev) =>
        prev.some((v) => v.itemId === itemPendienteLpn.itemId)
          ? prev
          : [itemPendienteLpn, ...prev]
      )
      setItemPendienteLpn(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (e) {
      setErrorScan(e instanceof ApiResponseError ? e.message : 'Error al confirmar el LPN')
      setItemPendienteLpn(null)
    }
  }

  // ── Handlers Barcode (Sodimac) ───────────────────────────────────────────────

  async function handleBuscarItem(termino: string) {
    const term = termino.trim()
    if (!term || term.length < 3) return
    if (scanCooldownRef.current) return
    scanCooldownRef.current = true
    setTimeout(() => { scanCooldownRef.current = false }, 500)
    setErrorScan(null)
    try {
      const res = await buscarItem.mutateAsync({ sesionId, termino: term })
      setItemPendienteSodimac(res)
      setScanInput('')
    } catch (e) {
      setErrorScan(e instanceof ApiResponseError ? e.message : 'Producto no encontrado en esta sesión')
      setScanInput('')
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }

  async function handleConfirmarSodimac() {
    if (!itemPendienteSodimac) return
    try {
      await validarItem.mutateAsync({ sesionId, itemId: itemPendienteSodimac.itemId })
      setValidadosSodimac((prev) =>
        prev.some((v) => v.itemId === itemPendienteSodimac.itemId)
          ? prev
          : [{ ...itemPendienteSodimac, estado: itemPendienteSodimac.cantidadDespachada === 0 ? 'sin_stock' : itemPendienteSodimac.cantidadDespachada < itemPendienteSodimac.cantidadPedida ? 'parcial' : 'completado' }, ...prev]
      )
      setItemPendienteSodimac(null)
      setTimeout(() => inputRef.current?.focus(), 50)
    } catch (e) {
      setErrorScan(e instanceof ApiResponseError ? e.message : 'Error al confirmar el producto')
      setItemPendienteSodimac(null)
    }
  }

  // ── Handlers LPN Excel (Sodimac fase 2) ─────────────────────────────────────

  function handleArchivoExcel(file: File) {
    setErrorExcel(null)
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target!.result as ArrayBuffer)
        const wb   = XLSX.read(data, { type: 'array', cellText: true })
        const ws   = wb.Sheets[wb.SheetNames[0]]
        const raw  = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: null, raw: false }) as (string | null)[][]

        // Formato Sodimac: filas "Total XXXXX" marcan el fin de cada LPN
        // Col 0: LPN (solo en la primera fila del grupo), "Total XXXXX" al final, null en filas intermedias
        // Col 1: Código, Col 2: Tienda, Col 3: Cantidad de Empaques
        const lpnMap = new Map<string, LpnEntry>()
        let currentLpn: string | null = null

        for (const row of raw.slice(1)) {
          const col0 = String(row[0] ?? '').trim()
          const col1 = String(row[1] ?? '').trim()
          const col2 = String(row[2] ?? '').trim()
          const col3 = String(row[3] ?? '').trim()
          if (!col0 && !col1) continue

          if (col0.startsWith('Total ')) {
            // Fila de total: actualiza cantidadEmpaque del LPN actual
            const totalLpn = col0.replace('Total ', '').trim()
            const entry = lpnMap.get(totalLpn)
            if (entry) entry.totalEmpaque = parseInt(col3, 10) || 0
            currentLpn = null
          } else if (col0 && /^\d+$/.test(col0)) {
            // Fila nueva con número de LPN
            currentLpn = col0
            if (!lpnMap.has(currentLpn)) {
              lpnMap.set(currentLpn, { lpn: currentLpn, totalEmpaque: 0, items: [] })
            }
            if (col1) {
              lpnMap.get(currentLpn)!.items.push({
                codigo: col1, tienda: col2, cantidad: parseInt(col3, 10) || 0
              })
            }
          } else if (!col0 && col1 && currentLpn) {
            // Fila de detalle (LPN vacío = continuación del anterior)
            lpnMap.get(currentLpn)!.items.push({
              codigo: col1, tienda: col2, cantidad: parseInt(col3, 10) || 0
            })
          }
        }

        const entradas = [...lpnMap.values()]
        if (entradas.length === 0) { setErrorExcel('El archivo no contiene LPNs válidos'); return }
        setLpnsExcel(entradas)
        // Guardar en BD para que sea accesible desde cualquier dispositivo
        guardarLpns.mutate({ sesionId, lpnsData: entradas })
        guardarLpnsEscaneados.mutate({ sesionId, lpnsEscaneados: [] })
        setLpnsEscaneados(new Set())
        setLpnPendiente(null)
        setMostrarCargarLpn(false)
        setFaseSodimac('lpns')
        setTimeout(() => lpnInputRef.current?.focus(), 100)
      } catch {
        setErrorExcel('Error al leer el archivo Excel')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function handleEscanearLpn(lpn: string) {
    const lpnTrimmed = lpn.trim()
    if (!lpnTrimmed) return
    setErrorLpnScan(null)
    if (lpnsExcel.length === 0) {
      setErrorLpnScan('No hay Excel cargado. Carga el archivo Excel de LPNs primero.')
      setLpnScanInput('')
      setTimeout(() => lpnInputRef.current?.focus(), 50)
      return
    }
    const entry = lpnsExcel.find((e) => lpnTrimmed === e.lpn || lpnTrimmed.endsWith(e.lpn))
    if (!entry) {
      setErrorLpnScan(`LPN "${lpnTrimmed}" no encontrado en el Excel (${lpnsExcel.length} LPNs cargados)`)
      setLpnScanInput('')
      setTimeout(() => lpnInputRef.current?.focus(), 50)
      return
    }
    if (lpnsEscaneados.has(lpnTrimmed)) {
      setErrorLpnScan(`LPN "${lpnTrimmed}" ya fue validado`)
      setLpnScanInput('')
      setTimeout(() => lpnInputRef.current?.focus(), 50)
      return
    }
    setLpnPendiente(entry)
    setLpnDetalleAbierto(false)
    setLpnScanInput('')
  }

  function handleConfirmarLpnSodimac() {
    if (!lpnPendiente) return
    const nuevoSet = new Set([...lpnsEscaneados, lpnPendiente.lpn])
    setLpnsEscaneados(nuevoSet)
    guardarLpnsEscaneados.mutate({ sesionId, lpnsEscaneados: [...nuevoSet] })
    setLpnPendiente(null)
    setTimeout(() => lpnInputRef.current?.focus(), 50)
  }

  async function handleDespachar() {
    if (!nombreChofer.trim()) return
    setErrorDespacho(null)
    try {
      await despacharSesion.mutateAsync({ sesionId, usuarioId: adminId, nombreChofer: nombreChofer.trim() })
      try { localStorage.removeItem(`pm_lpn_${sesionId}`) } catch {}
      navigate('/picking-masivo')
    } catch (e) {
      setErrorDespacho(e instanceof ApiResponseError ? e.message : 'Error al despachar')
    }
  }

  if (isLoading) return <div className="desp-page"><p className="cargando">Cargando…</p></div>
  if (!sesion)   return <div className="desp-page"><p className="error-msg">Sesión no encontrada</p></div>

  if (sesion.estado !== 'completada' && sesion.estado !== 'despachado') {
    return (
      <div className="desp-page">
        <p className="error-msg">La sesión debe estar completada para iniciar el despacho</p>
        <button className="desp-volver-btn" onClick={() => navigate('/picking-masivo')}>← Volver</button>
      </div>
    )
  }

  const totalItems     = sesion.total_items
  const validados      = sesionTieneLpn ? validadosLpn : validadosSodimac
  const totalValidados = validados.length
  const todosProductosValidados = totalValidados >= totalItems
  const isPending      = buscarLpn.isPending || buscarItem.isPending
  const pct            = totalItems > 0 ? Math.round((totalValidados / totalItems) * 100) : 0

  // Sodimac fase 2: LPNs
  const totalLpns          = lpnsExcel.length
  const lpnsValidadosN     = lpnsEscaneados.size
  const todosLpnsValidados = totalLpns > 0 && lpnsValidadosN >= totalLpns

  const ESTADO_LABELS: Record<string, string> = { completado: 'Completado', parcial: 'Parcial', sin_stock: 'Sin stock' }

  return (
    <div className="desp-page">

      {/* ── Cabecera ── */}
      <div className="desp-header">
        <button className="desp-volver-btn" onClick={() => navigate(`/picking-masivo/${sesionId}`)}>
          ← Volver
        </button>
        <div className="desp-header-info">
          <span className="desp-cliente">{sesion.nombre_cliente ?? sesion.numero_oc}</span>
          <span className="desp-fase-label">
            {!sesionTieneLpn && faseSodimac === 'lpns' ? 'Validación de Carga' : 'Validación de Preparación'}
          </span>
        </div>
        <div className="desp-progreso-pill">{totalValidados}/{totalItems} · {pct}%</div>
      </div>

      {/* ── Barra de progreso ── */}
      <div className="desp-progreso-wrap">
        <div className="desp-progreso-bg">
          <div className="desp-progreso-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* ── FASE 1: Escáner ── */}
      {sesion.estado === 'completada' && (!sesionTieneLpn ? faseSodimac === 'productos' : true) && (
        <div className="desp-scanner-wrap">
          {!sesionTieneLpn && todosProductosValidados && (
            <div className="desp-todos-ok">
              ✓ Todos los productos validados. Confirma la preparación para continuar.
            </div>
          )}
          <div className="desp-scanner-header">
            <div className="desp-scanner-dot" />
            <span className="desp-scanner-label">
              ESCÁNER ACTIVO — {sesionTieneLpn ? 'LPN' : 'Código de barra'}
            </span>
          </div>
          <div className="desp-scanner-input-row">
            <input
              ref={inputRef}
              type="text"
              className={`desp-scanner-input ${errorScan ? 'desp-scanner-input--error' : ''}`}
              placeholder={sesionTieneLpn ? 'Escanea o ingresa el LPN…' : 'Escanea el código de barra o código…'}
              value={scanInput}
              onChange={(e) => { setScanInput(e.target.value); setErrorScan(null) }}
              onKeyDown={(e) => {
                if (e.key !== 'Enter') return
                if (!sesionTieneLpn && todosProductosValidados) return
                sesionTieneLpn ? handleBuscarLpn(scanInput) : handleBuscarItem(scanInput)
              }}
              disabled={!sesionTieneLpn && todosProductosValidados}
              autoFocus={!((!sesionTieneLpn) && todosProductosValidados)}
              autoComplete="off"
            />
            <BarcodeScanner
              title="Escanear con cámara"
              onDetected={(val) => sesionTieneLpn ? handleBuscarLpn(val) : handleBuscarItem(val)}
            />
          </div>
          {errorScan && <p className="desp-scanner-error">{errorScan}</p>}
          <button
            className="desp-scan-btn"
            disabled={!scanInput.trim() || isPending || (!sesionTieneLpn && todosProductosValidados)}
            onClick={() => sesionTieneLpn ? handleBuscarLpn(scanInput) : handleBuscarItem(scanInput)}
          >
            {isPending ? 'Buscando…' : 'Buscar'}
          </button>
        </div>
      )}

      {/* Confirmar Preparación — Sodimac fase 1 */}
      {!sesionTieneLpn && faseSodimac === 'productos' && todosProductosValidados && sesion.estado === 'completada' && (
        <button
          className="desp-action-btn desp-action-btn--confirmar"
          disabled={preparacionConfirmada}
          onClick={() => {
            try { localStorage.setItem(`pm_productos_ok_${sesionId}`, '1') } catch {}
            setPreparacionConfirmada(true)
            navigate(`/picking-masivo/${sesionId}`)
          }}
        >
          {preparacionConfirmada ? 'Preparación confirmada ✓' : 'Confirmar Preparación'}
        </button>
      )}

      {/* ── Lista de validados — fase 1 ── */}
      {(!sesionTieneLpn ? faseSodimac === 'productos' : true) && (validados.length > 0 || (items && items.length > 0)) && (
        <div className="desp-lista-card">

          {/* Filtros Sodimac */}
          {!sesionTieneLpn && (
            <>
              <div className="desp-filtros-row">
                <div className="desp-filtros">
                  <button className={`desp-filtro-btn ${!filtroPendientes ? 'desp-filtro-btn--activo' : ''}`} onClick={() => setFiltroPendientes(false)}>Validados</button>
                  <button className={`desp-filtro-btn ${filtroPendientes ? 'desp-filtro-btn--pendiente' : ''}`} onClick={() => setFiltroPendientes(true)}>Pendientes</button>
                </div>
                <span className="desp-ratio">{totalValidados}/{totalItems}</span>
              </div>
              {!filtroPendientes && (
                <div className="desp-subfiltros">
                  <input
                    type="search"
                    className="desp-busqueda"
                    placeholder="Buscar por código o nombre…"
                    value={busquedaSodimac}
                    onChange={(e) => setBusquedaSodimac(e.target.value)}
                  />
                  <div className="desp-estado-filtros">
                    {(['todos', 'parcial', 'sin_stock'] as const).map((f) => (
                      <button
                        key={f}
                        className={`desp-estado-btn desp-estado-btn--${f.replace('_', '-')} ${filtroEstadoDespacho === f ? 'desp-estado-btn--activo' : ''}`}
                        onClick={() => setFiltroEstadoDespacho(f)}
                      >
                        {f === 'todos' ? 'Todos' : f === 'parcial' ? 'Parcial' : 'Sin stock'}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {!sesionTieneLpn && (
            <p className="desp-lista-titulo">
              {filtroPendientes ? 'Pendientes de validar' : `Productos Validados (${validados.length})`}
            </p>
          )}

          {/* Filtro pendientes/validados — solo Imperial */}
          {sesionTieneLpn && (
            <div className="desp-filtros-row">
              <div className="desp-filtros">
                <button
                  className={`desp-filtro-btn ${filtroImperial === 'pendientes' ? 'desp-filtro-btn--pendiente' : ''}`}
                  onClick={() => setFiltroImperial('pendientes')}
                >
                  Pendientes ({(items ?? []).filter(i => !validadosLpn.some(v => v.itemId === i.id)).length})
                </button>
                <button
                  className={`desp-filtro-btn ${filtroImperial === 'validados' ? 'desp-filtro-btn--activo' : ''}`}
                  onClick={() => setFiltroImperial('validados')}
                >
                  Validados ({validadosLpn.length})
                </button>
              </div>
              <span className="desp-ratio">{validadosLpn.length}/{totalItems}</span>
            </div>
          )}

          <div className="desp-items">
            {sesionTieneLpn
              ? filtroImperial === 'validados'
                ? validadosLpn.map((v) => {
                    const abierto = imperialExpandido === v.itemId
                    return (
                      <div key={v.itemId} className="desp-item desp-item--validado">
                        <div
                          className="desp-item-fila"
                          role="button" tabIndex={0}
                          onClick={() => setImperialExpandido(abierto ? null : v.itemId)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setImperialExpandido(abierto ? null : v.itemId)}
                        >
                          <div className="desp-item-info">
                            <span className="desp-item-nombre">{v.descripcion || v.codigo}</span>
                            <span className="desp-item-codigo">{v.codigo}</span>
                          </div>
                          <div className="desp-item-right">
                            <span className="desp-item-cant">{v.cantidadPedida} uds</span>
                            <span className="desp-item-check">✓</span>
                          </div>
                        </div>
                        {abierto && (
                          <div className="desp-item-detalle">
                            {v.tienda && (
                              <div className="desp-detalle-col">
                                <span className="desp-detalle-label">Tienda</span>
                                <span className="desp-detalle-val">{v.tienda}</span>
                              </div>
                            )}
                            <div className="desp-detalle-col">
                              <span className="desp-detalle-label">LPN</span>
                              <span className="desp-detalle-val desp-detalle-val--mono">{v.lpn}</span>
                            </div>
                            <div className="desp-detalle-col">
                              <span className="desp-detalle-label">Cantidad</span>
                              <span className="desp-detalle-val desp-detalle-val--ok">{v.cantidadPedida}</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
                : (items ?? [])
                    .filter(i => !validadosLpn.some(v => v.itemId === i.id))
                    .map(i => (
                      <div key={i.id} className="desp-item desp-item--pendiente">
                        <div className="desp-item-info">
                          <span className="desp-item-nombre">{i.descripcion || i.codigo}</span>
                          <span className="desp-item-codigo">{i.codigo}{i.lpn ? ` · LPN ${i.lpn}` : ''}</span>
                        </div>
                        <span className="desp-item-pending">○</span>
                      </div>
                    ))
              : filtroPendientes
              ? (items ?? [])
                  .filter((i) => !validadosSodimac.some((v) => v.itemId === i.id))
                  .map((i) => {
                    const despachada = (i.subtareas_picking_masivo ?? []).reduce((s, t) => s + (t.cantidad_despachada ?? 0), 0)
                    return (
                      <div key={i.id} className="desp-item desp-item--pendiente">
                        <div className="desp-item-info">
                          <span className="desp-item-codigo">{i.codigo}</span>
                          <span className="desp-item-meta">{i.descripcion}</span>
                        </div>
                        <span className="desp-item-cant desp-item-cant--muted">{despachada}/{i.cantidad_pedida}</span>
                      </div>
                    )
                  })
              : validadosSodimac
                  .filter((v) => {
                    const q = busquedaSodimac.trim().toLowerCase()
                    const matchQ = !q || v.codigo.toLowerCase().includes(q) || v.descripcion.toLowerCase().includes(q)
                    const matchE = filtroEstadoDespacho === 'todos' || v.estado === filtroEstadoDespacho
                    return matchQ && matchE
                  })
                  .map((v) => {
                    const expandido = productoExpandido === v.itemId
                    return (
                      <div key={v.itemId} className="desp-item">
                        <div
                          className="desp-item-fila"
                          role="button" tabIndex={0}
                          onClick={() => setProductoExpandido(expandido ? null : v.itemId)}
                          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setProductoExpandido(expandido ? null : v.itemId)}
                        >
                          <div className="desp-item-info">
                            <span className="desp-item-nombre">{v.descripcion || v.codigo}</span>
                            <span className="desp-item-codigo">{v.codigo}</span>
                          </div>
                          <div className="desp-item-right">
                            <span className={`desp-estado-badge desp-estado-badge--${v.estado.replace(/_/g, '-')}`}>
                              {ESTADO_LABELS[v.estado] ?? v.estado}
                            </span>
                            <span className="desp-chevron">{expandido ? '▲' : '▼'}</span>
                          </div>
                        </div>
                        {expandido && (
                          <div className="desp-item-detalle">
                            <div className="desp-detalle-col">
                              <span className="desp-detalle-label">Solicitado OC</span>
                              <span className="desp-detalle-val">{v.cantidadPedida}</span>
                            </div>
                            <div className="desp-detalle-col">
                              <span className="desp-detalle-label">Enviado</span>
                              <span className={`desp-detalle-val ${v.cantidadDespachada < v.cantidadPedida ? 'desp-detalle-val--warn' : 'desp-detalle-val--ok'}`}>
                                {v.cantidadDespachada}
                              </span>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })
            }
          </div>
        </div>
      )}

      {sesion.estado === 'despachado' && (
        <div className="desp-completado">OC despachada ✓</div>
      )}

      {/* Despachar Carga — Imperial */}
      {sesionTieneLpn && todosProductosValidados && sesion.estado === 'completada' && !mostrarChofer && (
        <button className="desp-action-btn desp-action-btn--despachar" onClick={() => setMostrarChofer(true)}>
          Despachar Carga
        </button>
      )}

      {/* ── FASE 2 Sodimac: escáner LPN ── */}
      {!sesionTieneLpn && faseSodimac === 'lpns' && sesion.estado === 'completada' && (
        <>
          <div className="desp-scanner-wrap">
            <div className="desp-scanner-header">
              <div className="desp-scanner-dot" />
              <span className="desp-scanner-label">ESCÁNER ACTIVO — LPN</span>
            </div>
            <div className="desp-excel-row">
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                style={{ display: 'none' }}
                onChange={(e) => { const f = e.target.files?.[0]; if (f) handleArchivoExcel(f) }}
              />
              <button type="button" className="desp-excel-btn" onClick={() => fileInputRef.current?.click()}>
                📎 {lpnsExcel.length > 0 ? `Excel cargado (${lpnsExcel.length} LPNs)` : 'Cargar Excel de LPNs'}
              </button>
              {errorExcel && <span className="desp-scanner-error">{errorExcel}</span>}
            </div>
            <div className="desp-scanner-input-row">
              <input
                ref={lpnInputRef}
                type="text"
                className={`desp-scanner-input ${errorLpnScan ? 'desp-scanner-input--error' : ''}`}
                placeholder="Escanea o ingresa el LPN…"
                value={lpnScanInput}
                onChange={(e) => { setLpnScanInput(e.target.value); setErrorLpnScan(null) }}
                onKeyDown={(e) => e.key === 'Enter' && handleEscanearLpn(lpnScanInput)}
                autoFocus
                autoComplete="off"
              />
              <BarcodeScanner title="Escanear con cámara" onDetected={handleEscanearLpn} />
            </div>
            {errorLpnScan && <p className="desp-scanner-error">{errorLpnScan}</p>}
            <button className="desp-scan-btn" disabled={!lpnScanInput.trim()} onClick={() => handleEscanearLpn(lpnScanInput)}>
              Validar
            </button>
          </div>

          {/* Lista LPNs */}
          <div className="desp-lista-card">
            <div className="desp-filtros-row">
              <div className="desp-filtros">
                <button className={`desp-filtro-btn ${filtroLpns === 'pendientes' ? 'desp-filtro-btn--pendiente' : ''}`} onClick={() => setFiltroLpns('pendientes')}>
                  Pendientes ({totalLpns - lpnsValidadosN})
                </button>
                <button className={`desp-filtro-btn ${filtroLpns === 'validados' ? 'desp-filtro-btn--activo' : ''}`} onClick={() => setFiltroLpns('validados')}>
                  Validados ({lpnsValidadosN})
                </button>
              </div>
              <span className="desp-ratio">{lpnsValidadosN}/{totalLpns}</span>
            </div>
            <div className="desp-items">
              {lpnsExcel
                .filter((entry) => filtroLpns === 'validados' ? lpnsEscaneados.has(entry.lpn) : !lpnsEscaneados.has(entry.lpn))
                .map((entry) => {
                  const validado = lpnsEscaneados.has(entry.lpn)
                  return (
                    <div key={entry.lpn} className={`desp-item ${validado ? 'desp-item--validado' : 'desp-item--pendiente'}`}>
                      <div className="desp-item-info">
                        <span className="desp-item-codigo desp-item-codigo--mono">{entry.lpn}</span>
                        <span className="desp-item-meta">{entry.totalEmpaque} empaque{entry.totalEmpaque !== 1 ? 's' : ''}</span>
                      </div>
                      <span className={validado ? 'desp-item-check' : 'desp-item-pending'}>{validado ? '✓' : '○'}</span>
                    </div>
                  )
                })}
            </div>
          </div>

          {todosLpnsValidados && (
            <button className="desp-action-btn desp-action-btn--despachar" onClick={() => setMostrarChofer(true)}>
              Despachar Carga
            </button>
          )}
        </>
      )}

      {/* ── Modal: LPN escaneado (Sodimac fase 2) ── */}
      {lpnPendiente && (
        <div className="modal-overlay" onClick={() => setLpnPendiente(null)}>
          <div className="desp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">LPN Escaneado</h3>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">LPN</span>
              <span className="desp-modal-valor desp-modal-valor--mono desp-modal-valor--green">{lpnPendiente.lpn}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Cantidad de empaques</span>
              <span className="desp-modal-valor desp-modal-valor--xl">{lpnPendiente.totalEmpaque}</span>
            </div>
            <button
              type="button"
              className="desp-detalle-toggle"
              onClick={() => setLpnDetalleAbierto((p) => !p)}
            >
              <span>Ver detalle ({lpnPendiente.items.length} código{lpnPendiente.items.length !== 1 ? 's' : ''})</span>
              <span>{lpnDetalleAbierto ? '▲' : '▼'}</span>
            </button>
            {lpnDetalleAbierto && (
              <div className="desp-detalle-lista">
                {lpnPendiente.items.map((it, idx) => (
                  <div key={idx} className="desp-detalle-fila">
                    <div className="desp-item-info">
                      <span className="desp-item-codigo desp-item-codigo--mono desp-item-codigo--green">{it.codigo}</span>
                      <span className="desp-item-meta">{it.tienda}</span>
                    </div>
                    <span className="desp-item-cant">{it.cantidad} u.</span>
                  </div>
                ))}
              </div>
            )}
            <div className="desp-modal-acciones">
              <button className="desp-modal-btn desp-modal-btn--secondary" onClick={() => setLpnPendiente(null)}>Cancelar</button>
              <button className="desp-modal-btn desp-modal-btn--primary" onClick={handleConfirmarLpnSodimac}>Confirmar LPN</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Detalle LPN validado (Imperial) ── */}
      {detalleLpn && (
        <div className="modal-overlay" onClick={() => setDetalleLpn(null)}>
          <div className="desp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">{detalleLpn.codigo}</h3>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Tienda</span>
              <span className="desp-modal-valor">{detalleLpn.tienda ?? '—'}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Cantidad</span>
              <span className="desp-modal-valor desp-modal-valor--xl">{detalleLpn.cantidadPedida}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">LPN</span>
              <span className="desp-modal-valor desp-modal-valor--mono desp-modal-valor--accent">{detalleLpn.lpn}</span>
            </div>
            <div className="desp-modal-acciones">
              <button className="desp-modal-btn desp-modal-btn--secondary" style={{ flex: 1 }} onClick={() => setDetalleLpn(null)}>Cerrar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar bulto (Imperial) ── */}
      {itemPendienteLpn && (
        <div className="modal-overlay" onClick={() => setItemPendienteLpn(null)}>
          <div className="desp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">Confirmar bulto</h3>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">LPN</span>
              <span className="desp-modal-valor desp-modal-valor--mono desp-modal-valor--accent">{itemPendienteLpn.lpn}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Código</span>
              <span className="desp-modal-valor">{itemPendienteLpn.codigo}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Cantidad</span>
              <span className="desp-modal-valor desp-modal-valor--xl">{itemPendienteLpn.cantidadPedida} uds</span>
            </div>
            {itemPendienteLpn.tienda && (
              <div className="desp-modal-fila">
                <span className="desp-modal-label">Tienda</span>
                <span className="desp-modal-valor">{itemPendienteLpn.tienda}</span>
              </div>
            )}
            <div className="desp-modal-acciones">
              <button className="desp-modal-btn desp-modal-btn--secondary" onClick={() => setItemPendienteLpn(null)}>Volver</button>
              <button className="desp-modal-btn desp-modal-btn--primary" disabled={validarLpn.isPending} onClick={handleConfirmarLpn}>
                {validarLpn.isPending ? 'Confirmando…' : 'Confirmado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Confirmar producto (Sodimac) ── */}
      {itemPendienteSodimac && (
        <div className="modal-overlay" onClick={() => setItemPendienteSodimac(null)}>
          <div className="desp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">Confirmar producto</h3>
            {itemPendienteSodimac.cantidadDespachada < itemPendienteSodimac.cantidadPedida && (
              <span className="desp-parcial-badge">Parcial</span>
            )}
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Código</span>
              <span className="desp-modal-valor desp-modal-valor--mono desp-modal-valor--green">{itemPendienteSodimac.codigo}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Cant. solicitada</span>
              <span className="desp-modal-valor desp-modal-valor--xl">{itemPendienteSodimac.cantidadPedida}</span>
            </div>
            <div className="desp-modal-fila">
              <span className="desp-modal-label">Cant. despachada</span>
              <span className="desp-modal-valor desp-modal-valor--xl">{itemPendienteSodimac.cantidadDespachada}</span>
            </div>
            <div className="desp-modal-acciones">
              <button className="desp-modal-btn desp-modal-btn--secondary" onClick={() => setItemPendienteSodimac(null)}>Volver</button>
              <button className="desp-modal-btn desp-modal-btn--primary" disabled={validarItem.isPending} onClick={handleConfirmarSodimac}>
                {validarItem.isPending ? 'Confirmando…' : 'Confirmado'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Modal: Chofer ── */}
      {mostrarChofer && (
        <div className="modal-overlay" onClick={() => { setMostrarChofer(false); setNombreChofer(''); setErrorDespacho(null) }}>
          <div className="desp-modal" onClick={(e) => e.stopPropagation()}>
            <h3 className="desp-modal-titulo">Confirmar despacho</h3>
            <p className="desp-modal-sub">Selecciona el chofer</p>
            <div className="desp-choferes">
              {['Darhyng Olea', 'Javier Arancibia', 'Jorge Alvarez', 'Gustavo Bunster'].map((chofer) => (
                <button
                  key={chofer}
                  type="button"
                  className={`desp-chofer-btn ${nombreChofer === chofer ? 'desp-chofer-btn--sel' : ''}`}
                  onClick={() => setNombreChofer(chofer)}
                >
                  {chofer}
                </button>
              ))}
            </div>
            {errorDespacho && <p className="desp-scanner-error">{errorDespacho}</p>}
            <div className="desp-modal-acciones">
              <button className="desp-modal-btn desp-modal-btn--secondary" disabled={despacharSesion.isPending} onClick={() => { setMostrarChofer(false); setNombreChofer(''); setErrorDespacho(null) }}>
                Cancelar
              </button>
              <button className="desp-modal-btn desp-modal-btn--primary" disabled={!nombreChofer.trim() || despacharSesion.isPending} onClick={handleDespachar}>
                {despacharSesion.isPending ? 'Despachando…' : 'Confirmar despacho'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
