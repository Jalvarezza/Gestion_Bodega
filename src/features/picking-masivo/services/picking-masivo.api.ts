import { apiClient } from '../../../shared/utils/apiClient'
import type {
  ValidarExcelInput,
  ValidarExcelResult,
  CrearSesionInput,
  ActivarSesionInput,
  TomarSubtareaInput,
  ConfirmarSubtareaInput,
  LiberarPropiasInput,
} from '../../../../api/picking-masivo/picking-masivo.service'

export type {
  ValidarExcelResult,
}

export type SesionResumen = {
  id:                    string
  numero_oc:             string
  nombre_cliente:        string | null
  numero_oc_pedido:      string | null
  estado:                'validando' | 'en_proceso' | 'completada' | 'despachado' | 'cancelada'
  total_items:           number
  items_completados:     number
  archivo_nombre:        string | null
  creado_en:             string
  activada_en:           string | null
  completada_en:         string | null
  despachado_en:         string | null
  nombre_chofer:         string | null
  creado_por_usuario:    { nombre: string } | null
  despachado_por_usuario: { nombre: string } | null
}

export type SubtareaResumen = {
  id:                string
  posicion_codigo:   string
  orden_fifo:        number
  cantidad_asignada: number
  cantidad_despachada: number | null
  estado:            'libre' | 'bloqueado' | 'completado' | 'parcial' | 'sin_stock'
  bloqueado_por:     string | null
  bloqueado_en:      string | null
  item_id:           string
  motivo_diferencia: string | null
  items_picking_masivo: {
    codigo:             string
    descripcion:        string
    cantidad_pedida:    number
    cantidad_despachada: number
    codigo_barra:       string | null
    lpn:                string | null
    producto_id:        string | null
  } | null
}

export const pickingMasivoApi = {

  validarExcel: (body: ValidarExcelInput) =>
    apiClient.post<ValidarExcelResult>('/picking-masivo?accion=validar-excel', body),

  crearSesion: (body: CrearSesionInput) =>
    apiClient.post<{ sesionId: string }>('/picking-masivo?accion=crear-sesion', body),

  activarSesion: (body: ActivarSesionInput) =>
    apiClient.post<{ subtareasGeneradas: number }>('/picking-masivo?accion=activar-sesion', body),

  listarSesiones: (estado?: string) =>
    apiClient.get<SesionResumen[]>(`/picking-masivo?accion=sesiones${estado ? `&estado=${estado}` : ''}`),

  obtenerSesion: (id: string) =>
    apiClient.get<SesionResumen & { items: unknown[] }>(`/picking-masivo?accion=sesion&id=${id}`),

  colaSubtareas: (sesionId: string) =>
    apiClient.get<SubtareaResumen[]>(`/picking-masivo?accion=cola&id=${sesionId}`),

  tomarSubtarea: (body: TomarSubtareaInput) =>
    apiClient.post<{ subtareaId: string }>('/picking-masivo?accion=tomar-subtarea', body),

  confirmarSubtarea: (body: ConfirmarSubtareaInput) =>
    apiClient.post<{ movimientoId: string | null }>('/picking-masivo?accion=confirmar-subtarea', body),

  liberarPropias: (body: LiberarPropiasInput) =>
    apiClient.post<{ liberadas: number }>('/picking-masivo?accion=liberar-propias', body),

  editarParcial: (body: { subtareaId: string; usuarioId: string; cantidadDespachada: number; motivo?: string }) =>
    apiClient.post<{ subtareaId: string }>('/picking-masivo?accion=editar-parcial', body),

  buscarLpn: (body: { sesionId: string; lpn: string }) =>
    apiClient.post<{ itemId: string; codigo: string; descripcion: string; cantidadPedida: number; tienda: string | null }>('/picking-masivo?accion=buscar-lpn', body),

  validarLpn: (body: { sesionId: string; lpn: string }) =>
    apiClient.post<{ itemId: string; codigo: string; descripcion: string; cantidadPedida: number; tienda: string | null; lpnValidado: boolean }>('/picking-masivo?accion=validar-lpn', body),

  buscarItem: (body: { sesionId: string; termino: string }) =>
    apiClient.post<{ itemId: string; codigo: string; descripcion: string; cantidadPedida: number; cantidadDespachada: number; tienda: string | null }>('/picking-masivo?accion=buscar-item', body),

  validarItem: (body: { sesionId: string; itemId: string }) =>
    apiClient.post<{ ok: boolean }>('/picking-masivo?accion=validar-item', body),

  despacharSesion: (body: { sesionId: string; usuarioId: string; nombreChofer: string }) =>
    apiClient.post<{ sesionId: string }>('/picking-masivo?accion=despachar-sesion', body),

  cancelarSesion: (sesionId: string) =>
    apiClient.post<{ sesionId: string }>('/picking-masivo?accion=cancelar-sesion', { sesionId }),

  guardarLpns: (body: { sesionId: string; lpnsData: unknown[] }) =>
    apiClient.post<{ ok: boolean }>('/picking-masivo?accion=guardar-lpns', body),

  guardarLpnsEscaneados: (body: { sesionId: string; lpnsEscaneados: string[] }) =>
    apiClient.post<{ ok: boolean }>('/picking-masivo?accion=guardar-lpns-escaneados', body),

  parcharSkuProveedor: (body: { sesionId: string; items: { codigo: string; skuProveedor: string }[] }) =>
    apiClient.post<{ actualizados: number }>('/picking-masivo?accion=parchar-sku-proveedor', body),
}
