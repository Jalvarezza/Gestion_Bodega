import { apiClient } from '../../../shared/utils/apiClient'
import type {
  NotaResumen,
  DetalleNota,
  CrearNotaInput,
  CrearNotaResult,
  RegistrarPickingInput,
  RegistrarPickingResult,
  RegistrarSinStockInput,
  ConcluirParcialInput,
  ConcluirParcialResult,
  CambiarEstadoInput,
  CambiarEstadoResult,
  EnviarARevisionInput,
  EnviarARevisionResult,
} from '../../../../api/notas/notas.service'

export type {
  NotaResumen,
  DetalleNota,
  NotaProductoResumen,
  Ubicacion,
  ProductoConStock,
  RegistrarPickingResult,
  CambiarEstadoResult,
} from '../../../../api/notas/notas.service'

export const notasApi = {
  getNotas: (estado?: string) =>
    apiClient.get<NotaResumen[]>(`/notas${estado ? `?estado=${estado}` : ''}`),

  getDetalle: (id: string, usuarioId?: string) =>
    apiClient.get<DetalleNota>(`/notas?id=${id}${usuarioId ? `&usuarioId=${usuarioId}` : ''}`),

  crearNota: (body: CrearNotaInput) =>
    apiClient.post<CrearNotaResult>('/notas', body),

  registrarPicking: (body: RegistrarPickingInput) =>
    apiClient.post<RegistrarPickingResult>('/notas?accion=picking', body),

  registrarSinStock: (body: RegistrarSinStockInput) =>
    apiClient.post<{ notaProductoId: string; estado: string; comentario: string }>('/notas?accion=sin-stock', body),

  concluirParcial: (body: ConcluirParcialInput) =>
    apiClient.post<ConcluirParcialResult>('/notas?accion=concluir-parcial', body),

  cambiarEstado: (body: CambiarEstadoInput) =>
    apiClient.post<CambiarEstadoResult>('/notas?accion=cambiar-estado', body),

  enviarARevision: (body: EnviarARevisionInput) =>
    apiClient.post<EnviarARevisionResult>('/notas?accion=enviar-revision', body),

  anularNota: (body: { adminId: string; notaId: string; motivo: string }) =>
    apiClient.post<{ notaId: string; estado: string }>('/notas?accion=anular-nota', body),

  editarNota: (body: {
    adminId: string
    notaId: string
    modificaciones: { notaProductoId: string; cantidad: number; nuevoSku?: string }[]
    nuevos: { sku: string; cantidad: number }[]
    eliminar: string[]
  }) => apiClient.post<{ notaId: string }>('/notas?accion=editar-nota', body),

  eliminarNota: (body: { adminId: string; notaId: string }) =>
    apiClient.post<{ notaId: string }>('/notas?accion=eliminar-nota', body),
}
