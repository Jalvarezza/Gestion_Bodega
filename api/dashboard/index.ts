// @ts-nocheck
import type { NextApiRequest, NextApiResponse } from 'next'
import { supabase } from '../lib/supabase/client'
import { dashboardService } from './dashboard.service'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader('Cache-Control', 'no-store')

  const { vista } = req.query

  if (vista === 'despachos-mensuales') {
    const { cliente, productoId, numeroNota } = req.query
    const result = await dashboardService.obtenerDespachosMensuales({
      cliente:    typeof cliente === 'string' && cliente ? cliente : undefined,
      productoId: typeof productoId === 'string' && productoId ? productoId : undefined,
      numeroNota: typeof numeroNota === 'string' && numeroNota ? numeroNota : undefined,
    })
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'kpis-bi') {
    const result = await dashboardService.obtenerKpisBi()
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'despachos-semana') {
    const result = await dashboardService.obtenerDespachosSemana()
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'despachos-dia') {
    const fecha = typeof req.query.fecha === 'string' ? req.query.fecha : ''
    if (!fecha) return res.status(400).json({ error: 'Falta parámetro fecha' })
    const result = await dashboardService.obtenerDespachosDia(fecha)
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'clientes') {
    const result = await dashboardService.obtenerClientes()
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
  }

  if (vista === 'equipo-bodega') {
    const result = await dashboardService.obtenerEquipoBodega()
    if (!result.ok) return res.status(500).json({ error: result.error })
    return res.status(200).json(result.data)
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

  const stockTotal = (stocks ?? []).reduce((acc, p) => acc + (p.stock_total ?? 0), 0)
  const totalPos   = (posicionesTotal as unknown as { count: number } | null)?.count ?? 0
  const libresPos  = (posicionesLibres  as unknown as { count: number } | null)?.count ?? 0

  return res.status(200).json({
    totalProductos:   totalProductos ?? 0,
    stockTotal,
    notasPendientes:  (notasPendientes as unknown as { count: number } | null)?.count ?? notasPendientes?.length ?? 0,
    notasDespacho:    (notasDespacho   as unknown as { count: number } | null)?.count ?? notasDespacho?.length   ?? 0,
    ocPendientes:     (ocPendientes    as unknown as { count: number } | null)?.count ?? ocPendientes?.length    ?? 0,
    posicionesLibres: libresPos,
    posicionesTotal:  totalPos,
    ocupacionPct:     totalPos > 0 ? Math.round(((totalPos - libresPos) / totalPos) * 100) : 0,
  })
}
