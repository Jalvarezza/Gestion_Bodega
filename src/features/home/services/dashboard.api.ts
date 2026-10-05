import { apiClient } from '../../../shared/utils/apiClient'

export type MesDespacho = { mes: string; label: string; cantidad: number }
export type DespachosMensuales = { meses: MesDespacho[]; total: number }

export type FiltrosDespachosMensuales = {
  cliente?:    string
  productoId?: string
  numeroNota?: string
}

function buildQuery(filtros: FiltrosDespachosMensuales): string {
  const params = new URLSearchParams({ vista: 'despachos-mensuales' })
  if (filtros.cliente)    params.set('cliente', filtros.cliente)
  if (filtros.productoId) params.set('productoId', filtros.productoId)
  if (filtros.numeroNota) params.set('numeroNota', filtros.numeroNota)
  return params.toString()
}

export type DiaDespacho = { dia: string; label: string; cant: number }
export type DespachosSemana = { dias: DiaDespacho[]; total: number }

export type TurnoStats   = { completadas: number; enProceso: number; pendientes: number }
export type ActividadItem = { hora: string; texto: string; tipo: 'ok' | 'info' | 'stock' | 'warn' | 'label' }
export type KpisBi = {
  despachados7dias: number
  leadTimeHrs:      number | null
  otifPct:          number | null
  turno: { hoy: TurnoStats; semana: TurnoStats; mes: TurnoStats }
  actividadReciente: ActividadItem[]
}

export type OperadorStats = {
  usuarioId:       string
  nombre:          string
  pickingsHoy:     number
  ritmoLph:        number
  avancePct:       number
  ultimaActividad: string | null
  estado:          'activo' | 'en_nota' | 'inactivo'
}
export type EquipoBodega = { operadores: OperadorStats[] }

export const dashboardApi = {
  despachosMensuales: (filtros: FiltrosDespachosMensuales) =>
    apiClient.get<DespachosMensuales>(`/dashboard?${buildQuery(filtros)}`),
  despachosSemana: () =>
    apiClient.get<DespachosSemana>('/dashboard?vista=despachos-semana'),
  kpisBi: () =>
    apiClient.get<KpisBi>('/dashboard?vista=kpis-bi'),
  despachosDia: (fecha: string) =>
    apiClient.get<{ id: string; referencia: string; nombreCliente: string; fechaDespacho: string; tipo: 'nv' | 'sesion' | 'ola' }[]>(`/dashboard?vista=despachos-dia&fecha=${fecha}`),
  clientes: () => apiClient.get<string[]>('/dashboard?vista=clientes'),
  equipoBodega: () => apiClient.get<EquipoBodega>('/dashboard?vista=equipo-bodega'),
}
