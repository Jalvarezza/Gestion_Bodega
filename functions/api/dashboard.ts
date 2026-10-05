import { initSupabase, supabase } from '../../api/lib/supabase/client'
import { dashboardService } from '../../api/dashboard/dashboard.service'
import { json, sp, type Env } from '../_lib/cf'

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const params = sp(request)
  const vista = params.get('vista')

  if (vista === 'despachos-mensuales') {
    const result = await dashboardService.obtenerDespachosMensuales({
      cliente:    params.get('cliente')    ?? undefined,
      productoId: params.get('productoId') ?? undefined,
      numeroNota: params.get('numeroNota') ?? undefined,
    })
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (vista === 'kpis-bi') {
    const result = await dashboardService.obtenerKpisBi()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (vista === 'despachos-semana') {
    const result = await dashboardService.obtenerDespachosSemana()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (vista === 'despachos-dia') {
    const fecha = params.get('fecha') ?? ''
    if (!fecha) return json({ error: 'Falta parámetro fecha' }, 400)
    const result = await dashboardService.obtenerDespachosDia(fecha)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (vista === 'clientes') {
    const result = await dashboardService.obtenerClientes()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (vista === 'equipo-bodega') {
    const result = await dashboardService.obtenerEquipoBodega()
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  const [
    { count: totalProductos },
    { data: stocks },
    { data: notasPendientes },
    { data: notasDespacho },
    { data: ocPendientes },
    { data: posicionesLibres },
    { data: posicionesTotal },
  ] = await Promise.all([
    supabase.from('productos').select('*', { count: 'exact', head: true }),
    supabase.from('productos').select('stock_total'),
    supabase.from('notas_venta').select('id', { count: 'exact' }).eq('estado', 'pendiente'),
    supabase.from('notas_venta').select('id', { count: 'exact' }).eq('estado', 'completa'),
    supabase.from('importaciones').select('id', { count: 'exact' }).in('estado', ['pendiente', 'parcial']),
    supabase.from('posiciones_rack').select('id', { count: 'exact' }).eq('ocupada', false).eq('activo', true),
    supabase.from('posiciones_rack').select('id', { count: 'exact' }).eq('activo', true),
  ])

  const stockTotal = (stocks ?? []).reduce((acc: number, p: any) => acc + (p.stock_total ?? 0), 0)
  const totalPos   = (posicionesTotal as any)?.count ?? 0
  const libresPos  = (posicionesLibres  as any)?.count ?? 0

  return json({
    totalProductos:   totalProductos ?? 0,
    stockTotal,
    notasPendientes:  (notasPendientes  as any)?.count ?? notasPendientes?.length ?? 0,
    notasDespacho:    (notasDespacho    as any)?.count ?? notasDespacho?.length   ?? 0,
    ocPendientes:     (ocPendientes     as any)?.count ?? ocPendientes?.length    ?? 0,
    posicionesLibres: libresPos,
    posicionesTotal:  totalPos,
    ocupacionPct:     totalPos > 0 ? Math.round(((totalPos - libresPos) / totalPos) * 100) : 0,
  })
}
