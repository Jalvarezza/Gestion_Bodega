import * as XLSX from 'xlsx'

// ─── Tipos de salida ──────────────────────────────────────────────────────────

export type LineaConstrumart = {
  lpn:               string
  posicionOrden:     number
  codigoBarra:       string
  codigoProveedor:   string   // Cod. PLU SAP — código interno Construmart
  skuProveedor:      string   // Cod. Proveedor — nuestro SKU de fábrica
  tienda:            string   // Nombre Local Destino
  cantidadSolicitada: number
}

export type OrdenConstrumart = {
  numeroOrden: string          // Núm. Orden
  numeroGuia:  string          // Guia
  lineas:      LineaConstrumart[]
}

export type ResultadoParseConstrumart = {
  ordenes:     OrdenConstrumart[]
  totalLineas: number
  errores:     string[]
}

// ─── Columnas esperadas ───────────────────────────────────────────────────────

const COL = {
  ORDEN:        'núm. orden',
  GUIA:         'guia',
  LPN:          'lpn',
  POSICION:     'posición',
  CODIGO_BARRA: 'cód. empaque(ean13/dun14)',
  PLU_SAP:      'cod. plu sap',
  COD_PROV:     'cod. proveedor',
  TIENDA:       'nombre local destino',
  CANTIDAD:     'unidades solicitadas',
} as const

type Celda = string | number | boolean | null

function norm(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function encontrar(headers: string[], objetivo: string): number {
  const n = norm(objetivo)
  return headers.findIndex(h => norm(h) === n)
}

function strCell(fila: Celda[], idx: number): string {
  if (idx === -1) return ''
  const v = fila[idx]
  if (v === null || v === undefined) return ''
  if (typeof v === 'number') {
    // Evitar notación científica y sufijo .0 para enteros grandes
    return Number.isInteger(v) ? String(v) : String(Math.round(v))
  }
  return String(v).trim().replace(/\.0$/, '')
}

function numCell(fila: Celda[], idx: number): number {
  if (idx === -1) return NaN
  const v = fila[idx]
  // Si XLSX retornó el valor numérico real (raw: true), usarlo directamente
  if (typeof v === 'number') return v
  if (v === null || v === undefined) return NaN
  // Fallback para string: eliminar separadores de miles y normalizar decimal
  const s = String(v).trim().replace(/\./g, '').replace(',', '.')
  return parseFloat(s)
}

// ─── Parser principal ─────────────────────────────────────────────────────────

export async function parsearExcelConstrumart(file: File): Promise<ResultadoParseConstrumart> {
  const errores: string[] = []
  const buffer = await file.arrayBuffer()
  const wb     = XLSX.read(buffer, { type: 'array', cellDates: false })
  const ws     = wb.Sheets[wb.SheetNames[0]]
  const data     = XLSX.utils.sheet_to_json<Celda[]>(ws, { header: 1, defval: null, raw: true })
  // Versión formateada para preservar ceros iniciales en campos como LPN
  const dataFmt  = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, defval: '', raw: false })

  // Buscar fila de encabezados (primera fila con contenido)
  const headerRow = data.find(f => f.some(c => c !== null && c !== ''))
  if (!headerRow) {
    return { ordenes: [], totalLineas: 0, errores: ['El archivo está vacío'] }
  }

  const headers   = headerRow.map(c => String(c ?? '').trim())
  const filasDatos = data
    .slice(data.indexOf(headerRow) + 1)
    .filter(f => f.some(c => c !== null && c !== ''))

  // Mapear índices
  const idx = {
    orden:       encontrar(headers, COL.ORDEN),
    guia:        encontrar(headers, COL.GUIA),
    lpn:         encontrar(headers, COL.LPN),
    posicion:    encontrar(headers, COL.POSICION),
    codigoBarra: encontrar(headers, COL.CODIGO_BARRA),
    pluSap:      encontrar(headers, COL.PLU_SAP),
    codProv:     encontrar(headers, COL.COD_PROV),
    tienda:      encontrar(headers, COL.TIENDA),
    cantidad:    encontrar(headers, COL.CANTIDAD),
  }

  // Validar columnas obligatorias
  const faltantes = (Object.entries(idx) as [string, number][])
    .filter(([, v]) => v === -1)
    .map(([k]) => k)

  if (faltantes.length > 0) {
    errores.push(
      `Columnas no encontradas: ${faltantes.join(', ')}. ` +
      `Verifica que el archivo sea el formato Construmart correcto.`
    )
    return { ordenes: [], totalLineas: 0, errores }
  }

  // Parsear filas y agrupar por Núm. Orden
  const mapaOrdenes = new Map<string, OrdenConstrumart>()
  const headerRowIdx = data.indexOf(headerRow)
  let filaNum = headerRowIdx + 2  // para mensajes de error con nro de fila real
  let totalLineas = 0
  const filasDatosFmt = (dataFmt as any[]).slice(headerRowIdx + 1).filter((_: any, i: number) => filasDatos[i] !== undefined)

  for (let fi = 0; fi < filasDatos.length; fi++) {
    const fila    = filasDatos[fi]
    const filaFmt = filasDatosFmt[fi] ?? []
    filaNum++

    const numeroOrden  = strCell(fila, idx.orden).replace(/\.0$/, '')
    const numeroGuia   = strCell(fila, idx.guia).replace(/\.0$/, '')
    // Usar valor formateado para preservar cero inicial (LPN es código, no número)
    const lpnFmt = idx.lpn !== -1 ? String(filaFmt[idx.lpn] ?? '').trim().replace(/\.0$/, '') : ''
    const lpnRaw = strCell(fila, idx.lpn)
    const lpn    = lpnFmt.length >= lpnRaw.length ? lpnFmt : lpnRaw
    const posicion     = numCell(fila, idx.posicion)
    const codigoBarra  = strCell(fila, idx.codigoBarra)
    const pluSap       = strCell(fila, idx.pluSap)
    const codProv      = strCell(fila, idx.codProv)
    const tienda       = strCell(fila, idx.tienda)
    const cantidad     = numCell(fila, idx.cantidad)

    // Validaciones por fila
    if (!numeroOrden) {
      errores.push(`Fila ${filaNum}: Núm. Orden vacío, se omite`)
      continue
    }
    if (!lpn) {
      errores.push(`Fila ${filaNum}: LPN vacío en orden ${numeroOrden}, se omite`)
      continue
    }
    if (!codigoBarra) {
      errores.push(`Fila ${filaNum}: Código de barra vacío en orden ${numeroOrden} / LPN ${lpn}, se omite`)
      continue
    }
    if (!Number.isFinite(cantidad) || cantidad <= 0) {
      errores.push(`Fila ${filaNum}: Cantidad inválida en orden ${numeroOrden} / LPN ${lpn}, se omite`)
      continue
    }

    const linea: LineaConstrumart = {
      lpn,
      posicionOrden:      Number.isFinite(posicion) ? posicion : 0,
      codigoBarra,
      codigoProveedor:    pluSap,
      skuProveedor:       codProv,
      tienda,
      cantidadSolicitada: Math.round(cantidad),
    }

    if (!mapaOrdenes.has(numeroOrden)) {
      mapaOrdenes.set(numeroOrden, { numeroOrden, numeroGuia, lineas: [] })
    }
    mapaOrdenes.get(numeroOrden)!.lineas.push(linea)
    totalLineas++
  }

  if (totalLineas === 0) {
    errores.push('No se encontraron filas válidas en el archivo')
  }

  return {
    ordenes: Array.from(mapaOrdenes.values()),
    totalLineas,
    errores,
  }
}

// ─── Helper: consolidar demanda por código de barra ──────────────────────────
// Usado para mostrar el resumen de validación antes de crear la ola.

export type ResumenSkuConstrumart = {
  codigoBarra:    string
  skuProveedor:   string
  codigoProveedor: string
  cantidadTotal:  number
  nOrdenes:       number
}

export function consolidarSkusConstrumart(
  ordenes: OrdenConstrumart[]
): ResumenSkuConstrumart[] {
  const mapa = new Map<string, ResumenSkuConstrumart>()

  for (const orden of ordenes) {
    for (const linea of orden.lineas) {
      const key = linea.codigoBarra
      if (!mapa.has(key)) {
        mapa.set(key, {
          codigoBarra:     linea.codigoBarra,
          skuProveedor:    linea.skuProveedor,
          codigoProveedor: linea.codigoProveedor,
          cantidadTotal:   0,
          nOrdenes:        0,
        })
      }
      const r = mapa.get(key)!
      r.cantidadTotal += linea.cantidadSolicitada
      r.nOrdenes++
    }
  }

  return Array.from(mapa.values()).sort((a, b) => a.skuProveedor.localeCompare(b.skuProveedor))
}
