import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parsearExcelOC } from '../../src/features/picking-masivo/utils/parsearExcelOC'

function excel(nombre: string, filas: unknown[][]) {
  const libro = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(libro, XLSX.utils.aoa_to_sheet(filas), 'Hoja1')
  const buffer = XLSX.write(libro, { type: 'array', bookType: 'xlsx' })
  return new File([buffer], nombre)
}

const ENCABEZADO = ['UPC', 'SKU', 'Descripción', 'VIN', 'Unidades']

describe('Lectura del Excel de la orden de compra', () => {
  it('UP-XLS-01 · lee las líneas y toma el N° de OC desde el nombre del archivo', async () => {
    const r = await parsearExcelOC(excel('oc-17649583-products-details.xlsx', [
      ENCABEZADO,
      ['7798138241480', '920258', 'Curva T 100x50', 'AG/PR6101', 16],
      ['7798138241497', '920266', 'Curva plana 100x50', 'AG/PR6102', 40],
    ]))
    expect(r.numeroOc).toBe('17649583')
    expect(r.errores).toEqual([])
    expect(r.lineas).toEqual([
      { upc: '7798138241480', codigoCliente: '920258', descripcion: 'Curva T 100x50', vin: 'AG/PR6101', cantidad: 16 },
      { upc: '7798138241497', codigoCliente: '920266', descripcion: 'Curva plana 100x50', vin: 'AG/PR6102', cantidad: 40 },
    ])
  })

  it('UP-XLS-02 · encuentra el encabezado aunque haya filas de título antes', async () => {
    const r = await parsearExcelOC(excel('oc_555.xlsx', [['Orden de compra'], [], ENCABEZADO, ['1', '2', 'Prod', 'SKU-1', 5]]))
    expect(r.numeroOc).toBe('555')
    expect(r.lineas).toHaveLength(1)
  })

  it('UP-XLS-03 · reporta cantidades inválidas y omite filas sin VIN', async () => {
    const r = await parsearExcelOC(excel('pedido.xlsx', [
      ENCABEZADO,
      ['1', '2', 'Sin VIN', '', 5],
      ['1', '2', 'Cero', 'SKU-0', 0],
      ['1', '2', 'Texto', 'SKU-X', 'abc'],
      ['1', '2', 'Válida', 'SKU-OK', 3],
    ]))
    expect(r.numeroOc).toBeNull()
    expect(r.lineas.map((l) => l.vin)).toEqual(['SKU-OK'])
    expect(r.errores).toHaveLength(2)
  })

  it('UP-XLS-04 · rechaza un Excel sin las columnas VIN y Unidades', async () => {
    const r = await parsearExcelOC(excel('oc-1.xlsx', [['Código', 'Cantidad'], ['A', 1]]))
    expect(r.lineas).toEqual([])
    expect(r.errores[0]).toContain('VIN')
  })
})
