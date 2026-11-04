import * as XLSX from 'xlsx'
import type { LineaExcelOC } from '../services/pickingMasivo.api'

export type ResultadoExcelOC = {
  numeroOc: string | null
  lineas:   LineaExcelOC[]
  errores:  string[]
}

const quitarTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '')
const clave = (s: unknown) => quitarTildes(String(s ?? '')).trim().toLowerCase()

// Formato de OC del cliente: UPC | SKU (código interno del cliente) | Descripción | VIN (SKU Grantt) | Unidades
export async function parsearExcelOC(file: File): Promise<ResultadoExcelOC> {
  const errores: string[] = []
  const numeroOc = file.name.match(/oc[-_ ]?(\d+)/i)?.[1] ?? null

  let filas: unknown[][]
  try {
    const libro = XLSX.read(await file.arrayBuffer(), { type: 'array' })
    const hoja  = libro.Sheets[libro.SheetNames[0]]
    filas = XLSX.utils.sheet_to_json(hoja, { header: 1, defval: null, raw: false })
  } catch {
    return { numeroOc, lineas: [], errores: ['No se pudo leer el archivo. Verifica que sea un Excel válido.'] }
  }

  const idxEncabezado = filas.findIndex((f) => f.some((c) => clave(c) === 'vin') && f.some((c) => clave(c) === 'unidades'))
  if (idxEncabezado === -1) {
    return { numeroOc, lineas: [], errores: ['No se encontraron las columnas "VIN" y "Unidades" en el Excel.'] }
  }

  const encabezado = filas[idxEncabezado].map(clave)
  const col = (nombre: string) => encabezado.indexOf(nombre)
  const cUpc = col('upc'), cSku = col('sku'), cDesc = col('descripcion'), cVin = col('vin'), cUds = col('unidades')

  const lineas: LineaExcelOC[] = []
  filas.slice(idxEncabezado + 1).forEach((f, i) => {
    const vin = String(f[cVin] ?? '').trim()
    if (!vin) return
    const cantidad = Number(String(f[cUds] ?? '').replace(/[.\s]/g, '').replace(',', '.'))
    if (!Number.isInteger(cantidad) || cantidad <= 0) {
      errores.push(`Fila ${idxEncabezado + i + 2}: cantidad inválida para ${vin}`)
      return
    }
    lineas.push({
      upc:           cUpc >= 0 && f[cUpc] ? String(f[cUpc]).trim() : null,
      codigoCliente: cSku >= 0 && f[cSku] ? String(f[cSku]).trim() : null,
      descripcion:   cDesc >= 0 ? String(f[cDesc] ?? '').trim() : '',
      vin,
      cantidad,
    })
  })

  if (!lineas.length) errores.push('El Excel no tiene líneas con VIN y cantidad.')
  return { numeroOc, lineas, errores }
}
