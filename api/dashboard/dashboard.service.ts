import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'

export type MesDespacho = { mes: string; label: string; cantidad: number }

export type FiltrosDespachosMensuales = {
  cliente?:    string
  productoId?: string
  numeroNota?: string
}

export type DespachosMensuales = { meses: MesDespacho[]; total: number }

export type TurnoStats = { completadas: number; enProceso: number; pendientes: number }
export type ActividadItem = { hora: string; texto: string; tipo: 'ok' | 'info' | 'stock' | 'warn' | 'label' }

export type OperadorStats = {
  usuarioId:  string
  nombre:     string
  pickingsHoy: number
  ritmoLph:   number        // lineas por hora
  avancePct:  number        // relativo al top del equipo
  ultimaActividad: string | null
  estado:     'activo' | 'en_nota' | 'inactivo'
}
export type EquipoBodega = { operadores: OperadorStats[] }

export type KpisBi = {
  despachados7dias: number
  leadTimeHrs:      number | null
  otifPct:          number | null
  turno: { hoy: TurnoStats; semana: TurnoStats; mes: TurnoStats }
  actividadReciente: ActividadItem[]
}

const MESES_LABEL = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function labelMes(clave: string): string {
  const [anio, mes] = clave.split('-').map(Number)
  return `${MESES_LABEL[mes - 1]} ${anio}`
}

// Últimos 12 meses móviles, terminando en el mes actual
function ultimos12Meses(): { inicio: Date; claves: string[] } {
  const hoy    = new Date()
  const inicio = new Date(hoy.getFullYear(), hoy.getMonth() - 11, 1)
  const claves = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(inicio.getFullYear(), inicio.getMonth() + i, 1)
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
  })
  return { inicio, claves }
}

export const dashboardService = {

  async obtenerDespachosMensuales(filtros: FiltrosDespachosMensuales): Promise<ServiceResult<DespachosMensuales>> {
    const { inicio, claves } = ultimos12Meses()
    const mesesVacios = () => claves.map((mes) => ({ mes, label: labelMes(mes), cantidad: 0 }))

    // Filtro por producto: primero resolver qué notas de venta lo contienen
    let notaVentaIdsProducto: string[] | null = null
    if (filtros.productoId) {
      const { data, error } = await supabase
        .from('nota_productos')
        .select('nota_venta_id')
        .eq('producto_id', filtros.productoId)

      if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

      notaVentaIdsProducto = Array.from(new Set((data ?? []).map((r) => r.nota_venta_id)))
      if (notaVentaIdsProducto.length === 0) {
        return { ok: true, data: { meses: mesesVacios(), total: 0 } }
      }
    }

    let query = supabase
      .from('despachos')
      .select('fecha_despacho, notas_venta!inner(id)')
      .gte('fecha_despacho', inicio.toISOString())

    if (filtros.cliente)      query = query.ilike('notas_venta.nombre_cliente', `%${filtros.cliente}%`)
    if (filtros.numeroNota)   query = query.ilike('notas_venta.numero_nota', `%${filtros.numeroNota}%`)
    if (notaVentaIdsProducto) query = query.in('notas_venta.id', notaVentaIdsProducto)

    const { data, error } = await query
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const conteo = new Map<string, number>(claves.map((c) => [c, 0]))
    for (const row of (data as { fecha_despacho: string }[] ?? [])) {
      const mes = row.fecha_despacho.slice(0, 7)
      if (conteo.has(mes)) conteo.set(mes, (conteo.get(mes) ?? 0) + 1)
    }

    const meses = claves.map((mes) => ({ mes, label: labelMes(mes), cantidad: conteo.get(mes) ?? 0 }))
    const total = meses.reduce((s, m) => s + m.cantidad, 0)

    return { ok: true, data: { meses, total } }
  },

  async obtenerKpisBi(): Promise<ServiceResult<KpisBi>> {
    const ahora = new Date()
    const hoyInicio   = new Date(ahora); hoyInicio.setHours(0, 0, 0, 0)
    // Semana calendario: desde el lunes de esta semana (0=dom → retroceder 6, 1=lun → 0, etc.)
    const semanaInicio = new Date(ahora)
    const diaSemana = ahora.getDay()
    const diasDesdelunes = diaSemana === 0 ? 6 : diaSemana - 1
    semanaInicio.setDate(ahora.getDate() - diasDesdelunes)
    semanaInicio.setHours(0, 0, 0, 0)
    const mesInicio   = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    const mes30Inicio = new Date(ahora); mes30Inicio.setDate(ahora.getDate() - 30)

    const [
      despachosR,
      notasDispR,
      notasHoyR,
      notasSemR,
      notasMesR,
      movR,
    ] = await Promise.all([
      supabase.from('despachos').select('id', { count: 'exact', head: true })
        .gte('fecha_despacho', semanaInicio.toISOString()),
      supabase.from('notas_venta').select('fecha_preparacion, fecha_despacho, created_at')
        .eq('estado', 'despachada')
        .gte('fecha_despacho', mes30Inicio.toISOString()),
      supabase.from('notas_venta').select('estado').gte('updated_at', hoyInicio.toISOString()),
      supabase.from('notas_venta').select('estado').gte('updated_at', semanaInicio.toISOString()),
      supabase.from('notas_venta').select('estado').gte('updated_at', mesInicio.toISOString()),
      supabase.from('movimientos')
        .select('tipo, fecha, detalle, usuarios(nombre), productos(sku), notas_venta(numero_nota)')
        .in('tipo', ['despacho', 'picking', 'ingreso', 'ingreso_parcial', 'cambio_estado_nota', 'traslado_reubicacion'])
        .order('fecha', { ascending: false })
        .limit(8),
    ])

    // Lead time promedio (horas)
    const notasDisp = (notasDispR.data ?? []) as { fecha_preparacion: string | null; fecha_despacho: string | null; created_at: string }[]
    const leadTimes = notasDisp
      .filter(n => n.fecha_despacho)
      .map(n => {
        const inicio = n.fecha_preparacion ?? n.created_at
        return (new Date(n.fecha_despacho!).getTime() - new Date(inicio).getTime()) / 3_600_000
      })
      .filter(t => t >= 0 && t < 720)
    const leadTimeHrs = leadTimes.length > 0
      ? Math.round((leadTimes.reduce((s, t) => s + t, 0) / leadTimes.length) * 10) / 10
      : null

    // OTIF: % notas despachadas dentro de 24h de preparación
    const otifPct = leadTimes.length > 0
      ? Math.round((leadTimes.filter(t => t <= 24).length / leadTimes.length) * 1000) / 10
      : null

    // Rendimiento turno
    const turno = (['hoy', 'semana', 'mes'] as const).reduce((acc, key, i) => {
      const rows = ([notasHoyR.data, notasSemR.data, notasMesR.data][i] ?? []) as { estado: string }[]
      acc[key] = {
        completadas: rows.filter(r => r.estado === 'completa' || r.estado === 'despachada').length,
        enProceso:   rows.filter(r => r.estado === 'preparacion').length,
        pendientes:  rows.filter(r => r.estado === 'pendiente').length,
      }
      return acc
    }, {} as { hoy: TurnoStats; semana: TurnoStats; mes: TurnoStats })

    // Actividad reciente
    const TIPO_MAP: Record<string, ActividadItem['tipo']> = {
      despacho:             'ok',
      picking:              'info',
      ingreso:              'stock',
      ingreso_parcial:      'stock',
      cambio_estado_nota:   'info',
      traslado_reubicacion: 'label',
    }
    const actividadReciente: ActividadItem[] = ((movR.data ?? []) as any[]).map((m) => {
      const hora    = new Date(m.fecha).toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Santiago' })
      const usuario = (m.usuarios as { nombre: string } | null)?.nombre ?? 'Sistema'
      const d       = (m.detalle ?? {}) as Record<string, unknown>
      const sku     = (m.productos as { sku: string } | null)?.sku ?? (d.sku as string) ?? ''
      const nv      = (m.notas_venta as { numero_nota: string } | null)?.numero_nota ?? (d.numeroNota as string) ?? ''
      let texto = ''
      switch (m.tipo) {
        case 'despacho':             texto = `${usuario} despachó nota ${nv} al chofer ${(d.nombreChofer as string) ?? ''}`;                       break
        case 'picking':              texto = `${usuario} preparó ${d.cantidadDespachada ?? ''} u. de ${sku} — NV ${nv}`;                           break
        case 'ingreso':              texto = `${usuario} ingresó ${d.cantidadIngresada ?? ''} u. de ${sku} en ${(d.ubicacion as string) ?? 'bodega'}`; break
        case 'ingreso_parcial':      texto = `${usuario} ingresó parcial ${d.cantidadIngresada ?? ''}/${d.cantidadEsperada ?? ''} u. de ${sku}`;    break
        case 'traslado_reubicacion': texto = `${usuario} trasladó ${sku} de ${d.posicionOrigen ?? '?'} a ${d.posicionDestino ?? '?'}`;             break
        case 'cambio_estado_nota':   texto = `${usuario} cambió nota ${nv} a estado ${d.estadoNuevo ?? ''}`;                                       break
        default:                     texto = `${usuario} realizó ${m.tipo}`
      }
      return { hora, texto, tipo: TIPO_MAP[m.tipo] ?? 'info' }
    })

    return {
      ok: true,
      data: {
        despachados7dias: (despachosR as any).count ?? 0,
        leadTimeHrs,
        otifPct,
        turno,
        actividadReciente,
      },
    }
  },

  async obtenerDespachosSemana(): Promise<ServiceResult<{ dias: { dia: string; label: string; cant: number }[]; total: number }>> {
    const DIAS_LABEL = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb']
    const hoy   = new Date()
    const inicio = new Date(hoy)
    inicio.setDate(inicio.getDate() - 6)
    inicio.setHours(0, 0, 0, 0)

    const [despR, sesionR, olaR] = await Promise.all([
      supabase.from('despachos').select('fecha_despacho').gte('fecha_despacho', inicio.toISOString()),
      supabase.from('sesiones_picking_masivo').select('despachado_en').gte('despachado_en', inicio.toISOString()).not('despachado_en', 'is', null),
      supabase.from('olas_picking').select('despachado_en').gte('despachado_en', inicio.toISOString()).not('despachado_en', 'is', null),
    ])
    if (despR.error && sesionR.error && olaR.error) return { ok: false, error: { code: 'DB_ERROR', message: despR.error.message } }

    const dias = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(inicio)
      d.setDate(d.getDate() + i)
      return { dia: d.toISOString().slice(0, 10), label: DIAS_LABEL[d.getDay()], cant: 0 }
    })

    const sumarFechas = (rows: { fecha_despacho?: string; despachado_en?: string }[]) => {
      for (const row of rows) {
        const key = (row.fecha_despacho ?? row.despachado_en ?? '').slice(0, 10)
        const found = dias.find((d) => d.dia === key)
        if (found) found.cant++
      }
    }

    sumarFechas((despR.data ?? []) as any[])
    sumarFechas((sesionR.data ?? []) as any[])
    sumarFechas((olaR.data ?? []) as any[])

    return { ok: true, data: { dias, total: dias.reduce((s, d) => s + d.cant, 0) } }
  },

  async obtenerEquipoBodega(): Promise<ServiceResult<EquipoBodega>> {
    const hoyInicio = new Date()
    hoyInicio.setHours(0, 0, 0, 0)

    const [movR, notasR] = await Promise.all([
      // Pickings del turno actual (desde medianoche)
      supabase
        .from('movimientos')
        .select('usuario_id, fecha, usuarios(nombre)')
        .eq('tipo', 'picking')
        .gte('fecha', hoyInicio.toISOString())
        .order('fecha', { ascending: true }),

      // Notas en preparación con operador asignado ahora mismo
      supabase
        .from('notas_venta')
        .select('tomada_por, tomada_en')
        .eq('estado', 'preparacion')
        .not('tomada_por', 'is', null),
    ])

    if (movR.error) return { ok: false, error: { code: 'DB_ERROR', message: movR.error.message } }

    // Quién tiene nota bloqueada ahora
    const conNotaAhora = new Set(
      ((notasR.data ?? []) as { tomada_por: string; tomada_en: string | null }[])
        .filter(n => {
          if (!n.tomada_en) return false
          const minAtras = (Date.now() - new Date(n.tomada_en).getTime()) / 60000
          return minAtras < 15  // consideramos "en nota" si bloqueó hace <15 min
        })
        .map(n => n.tomada_por)
    )

    // Agrupar movimientos por usuario
    type RawMov = { usuario_id: string; fecha: string; usuarios: { nombre: string } | null }
    const movimientos = (movR.data ?? []) as RawMov[]

    const mapaUsuarios = new Map<string, { nombre: string; fechas: Date[] }>()
    for (const m of movimientos) {
      if (!m.usuario_id) continue
      const nombre = (m.usuarios as { nombre: string } | null)?.nombre ?? m.usuario_id
      if (!mapaUsuarios.has(m.usuario_id)) mapaUsuarios.set(m.usuario_id, { nombre, fechas: [] })
      mapaUsuarios.get(m.usuario_id)!.fechas.push(new Date(m.fecha))
    }

    // Calcular stats por operador
    const ahora = new Date()
    const operadoresRaw: (OperadorStats & { pickingsRaw: number })[] = []

    for (const [usuarioId, info] of mapaUsuarios) {
      const { nombre, fechas } = info
      const pickingsHoy = fechas.length
      const primeraFecha = fechas[0]
      const ultimaFecha  = fechas[fechas.length - 1]
      const horasActivo  = Math.max(0.1, (ultimaFecha.getTime() - primeraFecha.getTime()) / 3_600_000)
      const ritmoLph     = Math.round(pickingsHoy / horasActivo)
      const minDesdeUltima = (ahora.getTime() - ultimaFecha.getTime()) / 60000
      const estado: OperadorStats['estado'] =
        conNotaAhora.has(usuarioId) ? 'en_nota' :
        minDesdeUltima < 20 ? 'activo' : 'inactivo'

      operadoresRaw.push({
        usuarioId,
        nombre,
        pickingsHoy,
        pickingsRaw: pickingsHoy,
        ritmoLph,
        avancePct: 0,
        ultimaActividad: ultimaFecha.toISOString(),
        estado,
      })
    }

    // Calcular avancePct relativo al top del equipo
    const maxPickings = Math.max(1, ...operadoresRaw.map(o => o.pickingsRaw))
    const operadores: OperadorStats[] = operadoresRaw
      .map(({ pickingsRaw: _, ...o }) => ({
        ...o,
        avancePct: Math.round((o.pickingsHoy / maxPickings) * 100),
      }))
      .sort((a, b) => b.pickingsHoy - a.pickingsHoy)

    return { ok: true, data: { operadores } }
  },

  async obtenerClientes(): Promise<ServiceResult<string[]>> {
    const { data, error } = await supabase.from('notas_venta').select('nombre_cliente')
    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const clientes = Array.from(new Set((data ?? []).map((r) => r.nombre_cliente))).sort((a, b) => a.localeCompare(b))
    return { ok: true, data: clientes }
  },

  async obtenerDespachosDia(fecha: string): Promise<ServiceResult<{ id: string; referencia: string; nombreCliente: string; fechaDespacho: string; tipo: 'nv' | 'sesion' | 'ola' }[]>> {
    // Ampliar rango ±12h para cubrir timezone Chile (UTC-3/UTC-4)
    const inicio = new Date(`${fecha}T00:00:00.000Z`)
    inicio.setHours(inicio.getHours() - 12)
    const fin = new Date(`${fecha}T23:59:59.999Z`)
    fin.setHours(fin.getHours() + 12)

    const [despR, sesionR, olaR] = await Promise.all([
      supabase.from('despachos')
        .select('id, fecha_despacho, nota_venta_id, notas_venta(id, numero_nota, nombre_cliente)')
        .gte('fecha_despacho', inicio.toISOString())
        .lte('fecha_despacho', fin.toISOString()),
      supabase.from('sesiones_picking_masivo')
        .select('id, numero_oc, nombre_cliente, despachado_en')
        .gte('despachado_en', inicio.toISOString())
        .lte('despachado_en', fin.toISOString()),
      supabase.from('olas_picking')
        .select('id, proveedor, despachado_en')
        .gte('despachado_en', inicio.toISOString())
        .lte('despachado_en', fin.toISOString()),
    ])

    const nvs = ((despR.data ?? []) as any[])
      .filter(r => (r.fecha_despacho ?? '').slice(0, 10) === fecha)
      .map(r => ({
        id: r.notas_venta?.id ?? r.id,
        referencia: r.notas_venta?.numero_nota ?? '—',
        nombreCliente: r.notas_venta?.nombre_cliente ?? '—',
        fechaDespacho: r.fecha_despacho,
        tipo: 'nv' as const,
      }))
    const sesiones = (sesionR.data ?? [])
      .filter((r: any) => (r.despachado_en ?? '').slice(0, 10) === fecha)
      .map((r: any) => ({
        id: r.id, referencia: r.numero_oc ?? '—', nombreCliente: r.nombre_cliente ?? 'Sodimac',
        fechaDespacho: r.despachado_en, tipo: 'sesion' as const,
      }))
    const olas = (olaR.data ?? [])
      .filter((r: any) => (r.despachado_en ?? '').slice(0, 10) === fecha)
      .map((r: any) => ({
        id: r.id, referencia: '—', nombreCliente: r.proveedor,
        fechaDespacho: r.despachado_en, tipo: 'ola' as const,
      }))

    const todos = [...nvs, ...sesiones, ...olas]
      .sort((a, b) => new Date(a.fechaDespacho).getTime() - new Date(b.fechaDespacho).getTime())

    return { ok: true, data: todos }
  },
}
