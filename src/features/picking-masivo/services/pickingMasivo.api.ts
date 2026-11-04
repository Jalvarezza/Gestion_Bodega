import { apiClient } from '../../../shared/utils/apiClient'
import type {
  LineaExcelOC,
  LineaPrevisualizada,
  OrdenResumen,
  OrdenDetalle,
  LineaOrden,
  UbicacionPM,
} from '../../../../api/picking-masivo/picking-masivo.service'

export type { LineaExcelOC, LineaPrevisualizada, OrdenResumen, OrdenDetalle, LineaOrden, UbicacionPM }

export type RegistrarPickingPMInput = {
  usuarioId:           string
  itemId:              string
  codigoRack:          string
  codigoProducto:      string
  cantidad:            number
  loteId?:             string
  esParadaIntermedia?: boolean
  comentario?:         string | null
}

export const pickingMasivoApi = {
  listar: () =>
    apiClient.get<OrdenResumen[]>('/picking-masivo'),

  obtener: (id: string) =>
    apiClient.get<OrdenDetalle>(`/picking-masivo?id=${id}`),

  previsualizar: (lineas: LineaExcelOC[]) =>
    apiClient.post<LineaPrevisualizada[]>('/picking-masivo?accion=previsualizar', { lineas }),

  crear: (body: { usuarioId: string; numeroOc: string; nombreCliente: string; archivoNombre: string | null; lineas: LineaExcelOC[] }) =>
    apiClient.post<{ id: string; lineasCreadas: number; lineasOmitidas: number }>('/picking-masivo?accion=crear', body),

  tomarLinea: (body: { usuarioId: string; itemId: string }) =>
    apiClient.post<{ itemId: string }>('/picking-masivo?accion=tomar-linea', body),

  liberarLinea: (body: { usuarioId: string; itemId: string }) =>
    apiClient.post<{ itemId: string }>('/picking-masivo?accion=liberar-linea', body),

  registrarPicking: (body: RegistrarPickingPMInput) =>
    apiClient.post<{ cantidadDespachada: number; lineaResuelta: boolean; ordenCompleta: boolean }>('/picking-masivo?accion=picking', body),

  registrarSinStock: (body: { usuarioId: string; itemId: string; comentario: string }) =>
    apiClient.post<{ ordenCompleta: boolean }>('/picking-masivo?accion=sin-stock', body),

  cancelar: (body: { usuarioId: string; sesionId: string }) =>
    apiClient.post<{ id: string }>('/picking-masivo?accion=cancelar', body),
}
