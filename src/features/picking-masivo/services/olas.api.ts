import { apiClient } from '../../../shared/utils/apiClient'
import type { OrdenConstrumart } from '../utils/parsearExcelConstrumart'

// ─── Tipos compartidos ────────────────────────────────────────────────────────

export type OlaResumen = {
  id:              string
  proveedor:       'imperial' | 'construmart'
  fecha_entrega:   string
  archivo_nombre:  string | null
  estado:          'validando' | 'en_extraccion' | 'en_preparacion' | 'completada' | 'despachada' | 'cancelada'
  total_ordenes:   number
  total_lineas:    number
  creado_en:       string
  activada_en:     string | null
  completada_en:   string | null
  despachada_en:   string | null
  nombre_chofer:   string | null
  creado_por_usuario:    { nombre: string } | null
  despachado_por_usuario: { nombre: string } | null
}

export type TareaExtraccion = {
  id:               string
  descripcion:      string
  codigo_barra:     string
  cantidad_total:   number
  cantidad_extraida: number
  estado:           'libre' | 'bloqueado' | 'completado'
  ruta_sugerida:    { posicion_codigo: string; lote_id: string; cantidad: number }[] | null
  bloqueado_por:    string | null
  bloqueado_en:     string | null
  completado_por:        string | null
  completado_en:         string | null
  completado_por_nombre: string | null
  bloqueado_por_nombre:  string | null
}

export type LineaLpn = {
  id:                 string
  lpn:                string
  codigo_barra:       string | null
  codigo_proveedor:   string | null
  tienda:             string | null
  descripcion:        string
  cantidad_solicitada: number
  fase2_escaneado:    boolean
  fase2_en:           string | null
  fase2_por_nombre:   string | null
  ola_ordenes:        { numero_orden: string; numero_guia: string | null } | null
}

export type AlertaValidacion = {
  codigoBarra:  string
  cantidadTotal: number
  tipo:         'sin_catalogo' | 'sin_stock' | 'stock_insuficiente'
  stockActual?: number
}

// ─── Cliente API ──────────────────────────────────────────────────────────────

export const olasApi = {

  // Gestión de olas
  validarArchivo: (skus: { codigoBarra: string; cantidadTotal: number }[]) =>
    apiClient.post<{ alertas: AlertaValidacion[]; totalSkus: number; sinProblemas: number }>(
      '/olas?accion=validar-archivo', { skus },
    ),

  crearOla: (body: {
    usuarioId:     string
    proveedor:     'imperial' | 'construmart'
    fechaEntrega:  string
    archivoNombre: string
    ordenes:       OrdenConstrumart[]
  }) =>
    apiClient.post<{ olaId: string }>('/olas?accion=crear-ola', body),

  activarOla: (olaId: string, usuarioId: string) =>
    apiClient.post<{ tareasGeneradas: number }>('/olas?accion=activar-ola', { olaId, usuarioId }),

  cancelarOla: (olaId: string) =>
    apiClient.post<{ olaId: string }>('/olas?accion=cancelar-ola', { olaId }),

  listarOlas: (estado?: string) =>
    apiClient.get<OlaResumen[]>(`/olas?accion=olas${estado ? `&estado=${estado}` : ''}`),

  obtenerOla: (id: string) =>
    apiClient.get<OlaResumen>(`/olas?accion=ola&id=${id}`),

  // Fase 1 — Extracción
  colaExtraccion: (olaId: string) =>
    apiClient.get<TareaExtraccion[]>(`/olas?accion=cola-extraccion&id=${olaId}`),

  tomarTarea: (tareaId: string, usuarioId: string) =>
    apiClient.post<{ tareaId: string }>('/olas?accion=tomar-tarea', { tareaId, usuarioId }),

  confirmarExtraccion: (tareaId: string, usuarioId: string, cantidadExtraida: number) =>
    apiClient.post<{ tareaId: string }>('/olas?accion=confirmar-extraccion', { tareaId, usuarioId, cantidadExtraida }),

  liberarPropiasExtraccion: (olaId: string, usuarioId: string) =>
    apiClient.post<{ liberadas: number }>('/olas?accion=liberar-propias-extraccion', { olaId, usuarioId }),

  // Fase 2 — Preparación
  lineasPreparacion: (olaId: string) =>
    apiClient.get<LineaLpn[]>(`/olas?accion=lineas-preparacion&id=${olaId}`),

  escanearLpnF2: (olaId: string, lpn: string, usuarioId: string) =>
    apiClient.post<{ lineasMarcadas: number; lpn: string }>('/olas?accion=escanear-lpn-f2', { olaId, lpn, usuarioId }),

  // Fase 3 — Despacho
  lineasDespacho: (olaId: string) =>
    apiClient.get<any[]>(`/olas?accion=lineas-despacho&id=${olaId}`),

  resumenDespacho: (olaId: string) =>
    apiClient.get<{ totalLineas: number; validadas: number; pendientes: number; porcentaje: number }>(
      `/olas?accion=resumen-despacho&id=${olaId}`,
    ),

  escanearLpnF3: (olaId: string, lpn: string, supervisorId: string) =>
    apiClient.post<{ lineasValidadas: number; lpn: string }>('/olas?accion=escanear-lpn-f3', { olaId, lpn, supervisorId }),

  despacharOla: (olaId: string, supervisorId: string, nombreChofer: string) =>
    apiClient.post<{ olaId: string }>('/olas?accion=despachar-ola', { olaId, supervisorId, nombreChofer }),
}
