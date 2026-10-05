import { apiClient } from '../../../shared/utils/apiClient'

export type DevolucionItemInput = {
  productoId:     string
  notaProductoId: string
  cantidad:       number
}

export const devolucionesApi = {
  registrar(adminId: string, notaId: string, items: DevolucionItemInput[], comentario: string) {
    return apiClient.post<{ procesados: number }>('/devoluciones', { adminId, notaId, items, comentario })
  },
}
