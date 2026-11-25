import type { UserRole } from '../types/base'

type Textos = Partial<Record<UserRole, string>>

const GESTION = ['admin', 'supervisor'] as const
const CONTROL = ['admin', 'supervisor', 'validador'] as const

function para(roles: readonly UserRole[], texto: string): Textos {
  return Object.fromEntries(roles.map((r) => [r, texto]))
}

const SUBTITULOS = {
  dashboard: {
    ...para(GESTION, 'Panel de control de la bodega: estado de las notas de venta, despachos de la semana y actividad reciente del turno.'),
    validador: 'Resumen de las notas por revisar, los despachos de la semana y la actividad reciente del turno.',
  },
  inicioOperador: {
    operador: 'Elige un módulo para comenzar tu turno.',
  },
  busqueda: {
    ...para(CONTROL, 'Consulta cualquier producto del catálogo por SKU, nombre o código de barras y revisa su stock por lote y ubicación.'),
    operador: 'Escanea o escribe un código para saber en qué rack está un producto y cuánto stock queda.',
  },
  mapa: {
    ...para(CONTROL, 'Visualización interactiva de la bodega. Selecciona un rack para ver sus posiciones, niveles y el stock almacenado en cada ubicación.'),
    operador: 'Ubica un rack en la bodega y revisa qué productos tiene cada posición antes de ir a buscarlos.',
  },
  notas: {
    ...para(GESTION, 'Carga las notas de venta desde PDF, revisa su avance y qué operador prepara cada una. Puedes editar o eliminar las notas que aún están pendientes.'),
    operador: 'Toma una nota de venta y prepara sus productos: escanea el rack indicado y luego el código de barras de cada producto.',
  },
  pickingMasivo: {
    ...para(GESTION, 'Carga órdenes de compra desde Excel y supervisa su avance, los operadores en zona y el estado de cada producto.'),
    operador: 'Órdenes de picking masivo activas asignadas a tu turno. Únete a una sesión para comenzar a preparar los productos solicitados.',
  },
  despacho: para(CONTROL, 'Revisa cada producto de cada nota de venta por escaneo, asigna el chofer y despacha.'),
  historial: para(CONTROL, 'Registro de todos los movimientos de la bodega: quién hizo cada acción, cuándo y sobre qué producto o nota de venta.'),
  usuarios: { admin: 'Crea usuarios, asigna su rol, cambia contraseñas y bloquea o elimina accesos.' },
} satisfies Record<string, Textos>

export type ModuloSubtitulo = keyof typeof SUBTITULOS

export function SubtituloModulo({ modulo, espaciado = false }: { modulo: ModuloSubtitulo; espaciado?: boolean }) {
  const rol = localStorage.getItem('user_rol') as UserRole | null
  const texto = rol ? (SUBTITULOS[modulo] as Textos)[rol] : undefined
  if (!texto) return null
  return <p className={`notas-subtitulo${espaciado ? ' notas-subtitulo--espaciado' : ''}`}>{texto}</p>
}
