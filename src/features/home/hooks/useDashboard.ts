import { useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../../lib/supabaseClient'
import { apiClient } from '../../../shared/utils/apiClient'
import { dashboardApi, type FiltrosDespachosMensuales } from '../services/dashboard.api'
export type { DespachosSemana, DiaDespacho, KpisBi, TurnoStats, ActividadItem, OperadorStats, EquipoBodega } from '../services/dashboard.api'

export type DashboardKPIs = {
  totalProductos:   number
  stockTotal:       number
  notasPendientes:  number
  notasDespacho:    number
  ocPendientes:     number
  posicionesLibres: number
  posicionesTotal:  number
  ocupacionPct:     number
}

export function useDashboard() {
  return useQuery<DashboardKPIs>({
    queryKey: ['dashboard'],
    queryFn:  () => apiClient.get<DashboardKPIs>('/dashboard'),
    staleTime: 60_000,
  })
}

export function useDespachosMensuales(filtros: FiltrosDespachosMensuales) {
  return useQuery({
    queryKey:  ['dashboard', 'despachos-mensuales', filtros],
    queryFn:   () => dashboardApi.despachosMensuales(filtros),
    staleTime: 60_000,
  })
}

export function useKpisBi() {
  return useQuery({
    queryKey:  ['dashboard', 'kpis-bi'],
    queryFn:   dashboardApi.kpisBi,
    staleTime: 2 * 60_000,
  })
}

export function useDespachosSemana() {
  return useQuery({
    queryKey:  ['dashboard', 'despachos-semana'],
    queryFn:   dashboardApi.despachosSemana,
    staleTime: 5 * 60_000,
  })
}

export function useDespachosDia(fecha: string | null) {
  return useQuery({
    queryKey:  ['dashboard', 'despachos-dia', fecha],
    queryFn:   () => dashboardApi.despachosDia(fecha!),
    enabled:   !!fecha,
    staleTime: 2 * 60_000,
  })
}

export function useClientesNotas() {
  return useQuery({
    queryKey:  ['dashboard', 'clientes'],
    queryFn:   dashboardApi.clientes,
    staleTime: 5 * 60_000,
  })
}

export function useEquipoBodega() {
  return useQuery({
    queryKey:       ['dashboard', 'equipo-bodega'],
    queryFn:        dashboardApi.equipoBodega,
    staleTime:      0,
    refetchInterval: 30_000,  // refresca cada 30s para ver cambios de estado
  })
}

// Actualiza KPIs, gráfico de despachos y actividad apenas cambia una nota (despacho, completada, nueva NV…)
export function useDashboardRealtime() {
  const qc = useQueryClient()
  useEffect(() => {
    const canal = supabase
      .channel('dashboard:notas')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notas_venta' }, () => {
        qc.invalidateQueries({ queryKey: ['dashboard'] })
      })
      .subscribe()
    return () => { supabase.removeChannel(canal) }
  }, [qc])
}
