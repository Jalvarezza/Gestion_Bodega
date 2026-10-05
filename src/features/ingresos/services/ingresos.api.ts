import { apiClient } from '../../../shared/utils/apiClient'
import type {
  ImportacionResumen,
  DetalleImportacion,
  CrearImportacionInput,
  CrearImportacionResult,
  ValidarCantidadInput,
  ValidarCantidadResult,
  AlmacenarEnRackInput,
  AlmacenarEnRackResult,
  AlmacenarEnPasilloInput,
  AlmacenarEnPasilloResult,
} from '../../../../api/ingresos/ingresos.service'

export { type ImportacionResumen, type DetalleImportacion, type AlmacenarEnRackResult }

export type PosicionConProducto = {
  posicionId:    string
  codigo:        string
  rackCodigo:    string
  pasilloCodigo: string
  pasilloNombre: string | null
  stockActual:   number
}

export const ingresosApi = {
  getImportaciones:  (estado?: string)              =>
    apiClient.get<ImportacionResumen[]>(`/ingresos${estado ? `?estado=${estado}` : ''}`),

  getDetalle:        (id: string)                   =>
    apiClient.get<DetalleImportacion>(`/ingresos?id=${id}`),

  crearImportacion:  (body: CrearImportacionInput)  =>
    apiClient.post<CrearImportacionResult>('/ingresos', body),

  validarCantidad:   (body: ValidarCantidadInput)   =>
    apiClient.post<ValidarCantidadResult>('/ingresos?accion=validar-cantidad', body),

  almacenarEnRack:   (body: AlmacenarEnRackInput)   =>
    apiClient.post<AlmacenarEnRackResult>('/ingresos?accion=almacenar-rack', body),

  almacenarEnPasillo: (body: AlmacenarEnPasilloInput) =>
    apiClient.post<AlmacenarEnPasilloResult>('/ingresos?accion=almacenar-pasillo', body),

  getPosicionesConProducto: (productoId: string) =>
    apiClient.get<PosicionConProducto[]>(`/ingresos?accion=posiciones-con-producto&productoId=${productoId}`),
}
