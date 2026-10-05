import { apiClient } from '../../../shared/utils/apiClient'
import type {
  IniciarReubicacionInput,
  IniciarReubicacionResult,
  ConfirmarReubicacionInput,
  ConfirmarReubicacionResult,
  IniciarIntercambioInput,
  IniciarIntercambioResult,
  SeleccionarDestinoInput,
  SeleccionarDestinoResult,
  ConfirmarIntercambioInput,
  ConfirmarIntercambioResult,
} from '../../../../api/traslados/traslados.service'

export type PosicionDisponible = {
  posicionId: string
  codigo:     string
  rack:       string
  pasillo:    string
}

export type {
  IniciarReubicacionResult,
  ConfirmarReubicacionResult,
  IniciarIntercambioResult,
  SeleccionarDestinoResult,
  ConfirmarIntercambioResult,
}

export const trasladosApi = {
  getRacksDisponibles: () =>
    apiClient.get<PosicionDisponible[]>('/traslados'),

  iniciarReubicacion: (body: IniciarReubicacionInput) =>
    apiClient.post<IniciarReubicacionResult>('/traslados?accion=iniciar-reubicacion', body),

  confirmarReubicacion: (body: ConfirmarReubicacionInput) =>
    apiClient.post<ConfirmarReubicacionResult>('/traslados?accion=confirmar-reubicacion', body),

  iniciarIntercambio: (body: IniciarIntercambioInput) =>
    apiClient.post<IniciarIntercambioResult>('/traslados?accion=iniciar-intercambio', body),

  seleccionarDestino: (body: SeleccionarDestinoInput) =>
    apiClient.post<SeleccionarDestinoResult>('/traslados?accion=seleccionar-destino', body),

  confirmarIntercambio: (body: ConfirmarIntercambioInput) =>
    apiClient.post<ConfirmarIntercambioResult>('/traslados?accion=confirmar-intercambio', body),
}
