// @ts-nocheck
import { supabase } from '../lib/supabase/client'
import type { ServiceResult } from '../../src/shared/types/base'
import type { Database } from '../lib/supabase/types'

type Pasillo = Database['public']['Tables']['pasillos']['Row']
type Rack = Database['public']['Tables']['racks']['Row']
type Posicion = Database['public']['Tables']['posiciones_rack']['Row']

export type PasilloConRacks = Pasillo & {
  racks: (Rack & { posiciones: Posicion[] })[]
}

export type RackConPosiciones = Rack & {
  posiciones: Posicion[]
}

export type ProductoPasilloItem = {
  loteId:       string
  cantidad:     number
  fechaIngreso: string
  sku:          string
  nombre:       string
  codigoBarra:  string | null
  marca:        string | null
  ubicacion:    'pasillo' | 'rack'
  posicion:     string | null
}

export type PosicionLibre = Pick<Posicion, 'id' | 'codigo' | 'alto_cm' | 'ancho_cm' | 'largo_cm' | 'nivel' | 'posicion' | 'rack_id'> & {
  rackCodigo:    string
  rackNombre:    string | null
  pasilloId:     string
  pasilloCodigo: string
  pasilloNombre: string | null
}

export type LoteMapa = {
  productoId:   string
  sku:          string
  nombre:       string
  cantidad:     number
  fechaIngreso: string
}

export type PosicionMapa = {
  id:       string
  codigo:   string
  nivel:    number
  posicion: string
  ocupada:  boolean
  lote:     LoteMapa | null
}

export type RackMapa = {
  id:         string
  codigo:     string
  activo:     boolean
  posiciones: PosicionMapa[]
}

export type PasilloMapa = {
  id:     string
  codigo: string
  nombre: string
  racks:  RackMapa[]
}

export const ubicacionesService = {
  async listarPasillos(): Promise<ServiceResult<Pasillo[]>> {
    const { data, error } = await supabase
      .from('pasillos')
      .select('*')
      .eq('activo', true)
      .order('codigo')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: data ?? [] }
  },

  async listarRacksPorPasillo(pasilloId: string): Promise<ServiceResult<RackConPosiciones[]>> {
    const { data, error } = await supabase
      .from('racks')
      .select('*, posiciones_rack(*)')
      .eq('pasillo_id', pasilloId)
      .eq('activo', true)
      .order('numero')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const result: RackConPosiciones[] = (data ?? []).map((rack) => ({
      ...rack,
      posiciones: (rack.posiciones_rack as Posicion[]) ?? [],
    }))

    return { ok: true, data: result }
  },

  async listarPosicionesLibres(rackId: string): Promise<ServiceResult<Posicion[]>> {
    const { data, error } = await supabase
      .from('posiciones_rack')
      .select('*')
      .eq('rack_id', rackId)
      .eq('ocupada', false)
      .eq('activo', true)
      .order('nivel')
      .order('posicion')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }
    return { ok: true, data: data ?? [] }
  },

  async listarTodasPosicionesLibres(): Promise<ServiceResult<PosicionLibre[]>> {
    const { data, error } = await supabase
      .from('posiciones_rack')
      .select('*, racks!inner(id, codigo, pasillos!inner(id, codigo, nombre))')
      .eq('ocupada', false)
      .eq('activo', true)
      .order('codigo')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type RackRef   = { id: string; codigo: string; pasillos: { id: string; codigo: string; nombre: string } }
    type RawPos    = Posicion & { racks: RackRef }

    const result: PosicionLibre[] = (data as RawPos[] ?? []).map((p) => ({
      id:            p.id,
      codigo:        p.codigo,
      alto_cm:       p.alto_cm,
      ancho_cm:      p.ancho_cm,
      largo_cm:      p.largo_cm,
      nivel:         p.nivel,
      posicion:      p.posicion,
      rack_id:       p.rack_id,
      rackCodigo:    p.racks.codigo,
      rackNombre:    null,
      pasilloId:     p.racks.pasillos.id,
      pasilloCodigo: p.racks.pasillos.codigo,
      pasilloNombre: p.racks.pasillos.nombre,
    }))

    return { ok: true, data: result }
  },

  async productosPorPasillo(pasilloId: string): Promise<ServiceResult<ProductoPasilloItem[]>> {
    const { data, error } = await supabase
      .from('lotes_inventario')
      .select('id, cantidad, fecha_ingreso, producto_id, productos(sku, nombre, codigo_barra, marca)')
      .eq('pasillo_id', pasilloId)
      .eq('en_pasillo', true)
      .eq('activo', true)
      .gt('cantidad', 0)
      .order('fecha_ingreso', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type Raw = typeof data extends (infer T)[] | null ? T : never
    const result: ProductoPasilloItem[] = (data ?? []).map((r: Raw) => {
      const p = Array.isArray(r.productos) ? r.productos[0] : r.productos as { sku: string; nombre: string; codigo_barra: string | null; marca: string | null } | null
      return {
        loteId:       r.id,
        cantidad:     r.cantidad,
        fechaIngreso: r.fecha_ingreso,
        sku:          p?.sku ?? '',
        nombre:       p?.nombre ?? '',
        codigoBarra:  p?.codigo_barra ?? null,
        marca:        p?.marca ?? null,
        ubicacion:    'pasillo',
        posicion:     null,
      }
    })

    return { ok: true, data: result }
  },

  async productosPorPosiciones(pasilloId: string): Promise<ServiceResult<ProductoPasilloItem[]>> {
    const { data, error } = await supabase
      .from('lotes_inventario')
      .select('id, cantidad, fecha_ingreso, producto_id, posiciones_rack!inner(codigo, rack_id, racks!inner(pasillo_id)), productos(sku, nombre, codigo_barra, marca)')
      .eq('posiciones_rack.racks.pasillo_id', pasilloId)
      .eq('activo', true)
      .gt('cantidad', 0)
      .order('fecha_ingreso', { ascending: true })

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type PosRef = { codigo: string }
    type Raw    = { id: string; cantidad: number; fecha_ingreso: string; posiciones_rack: PosRef | PosRef[] | null; productos: { sku: string; nombre: string; codigo_barra: string | null; marca: string | null } | null }

    const result: ProductoPasilloItem[] = (data as Raw[] ?? []).map((r) => {
      const p   = Array.isArray(r.productos) ? r.productos[0] : r.productos
      const pos = Array.isArray(r.posiciones_rack) ? r.posiciones_rack[0] : r.posiciones_rack
      return {
        loteId:       r.id,
        cantidad:     r.cantidad,
        fechaIngreso: r.fecha_ingreso,
        sku:          p?.sku ?? '',
        nombre:       p?.nombre ?? '',
        codigoBarra:  p?.codigo_barra ?? null,
        marca:        p?.marca ?? null,
        ubicacion:    'rack',
        posicion:     pos?.codigo ?? null,
      }
    })

    return { ok: true, data: result }
  },

  async obtenerPosicion(posicionId: string): Promise<ServiceResult<Posicion>> {
    const { data, error } = await supabase
      .from('posiciones_rack')
      .select('*')
      .eq('id', posicionId)
      .single()

    if (error) return { ok: false, error: { code: 'NOT_FOUND', message: 'Posición no encontrada', field: 'posicionId' } }
    return { ok: true, data }
  },

  async listarTodasPosiciones(): Promise<ServiceResult<PosicionLibre[]>> {
    const { data, error } = await supabase
      .from('posiciones_rack')
      .select('*, racks!inner(id, codigo, pasillos!inner(id, codigo, nombre))')
      .eq('activo', true)
      .order('codigo')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type RackRef = { id: string; codigo: string; pasillos: { id: string; codigo: string; nombre: string } }
    type RawPos  = Posicion & { racks: RackRef }

    const result: PosicionLibre[] = (data as RawPos[] ?? []).map((p) => ({
      id:            p.id,
      codigo:        p.codigo,
      alto_cm:       p.alto_cm,
      ancho_cm:      p.ancho_cm,
      largo_cm:      p.largo_cm,
      nivel:         p.nivel,
      posicion:      p.posicion,
      rack_id:       p.rack_id,
      rackCodigo:    p.racks.codigo,
      rackNombre:    null,
      pasilloId:     p.racks.pasillos.id,
      pasilloCodigo: p.racks.pasillos.codigo,
      pasilloNombre: p.racks.pasillos.nombre,
    }))

    return { ok: true, data: result }
  },

  async obtenerMapaBodega(): Promise<ServiceResult<PasilloMapa[]>> {
    const { data, error } = await supabase
      .from('pasillos')
      .select(`
        id, codigo, nombre,
        racks(
          id, codigo, activo,
          posiciones_rack(
            id, codigo, nivel, posicion, ocupada,
            lotes_inventario(id, cantidad, fecha_ingreso, producto_id, productos(sku, nombre, alto_cm, largo_cm, ancho_cm))
          )
        )
      `)
      .eq('activo', true)
      .order('codigo')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    type RawProd    = { sku: string; nombre: string; alto_cm: number; largo_cm: number; ancho_cm: number }
    type RawLote    = { id: string; cantidad: number; fecha_ingreso: string; producto_id: string; productos: RawProd | RawProd[] | null }
    type RawPos     = { id: string; codigo: string; nivel: number; posicion: string; ocupada: boolean; lotes_inventario: RawLote[] }
    type RawRack    = { id: string; codigo: string; activo: boolean; posiciones_rack: RawPos[] }
    type RawPasillo = { id: string; codigo: string; nombre: string; racks: RawRack[] }

    const result: PasilloMapa[] = ((data ?? []) as RawPasillo[]).map((pasillo) => ({
      id:     pasillo.id,
      codigo: pasillo.codigo,
      nombre: pasillo.nombre,
      racks: (pasillo.racks ?? [])
        .filter((r) => r.activo)
        .map((rack) => ({
          id:     rack.id,
          codigo: rack.codigo,
          activo: rack.activo,
          posiciones: (rack.posiciones_rack ?? [])
            .sort((a, b) => a.nivel - b.nivel || a.posicion.localeCompare(b.posicion))
            .map((pos) => {
              const loteRaw = (pos.lotes_inventario ?? []).find((l) => l.cantidad >= 0) ?? null
              const prod    = loteRaw
                ? (Array.isArray(loteRaw.productos) ? loteRaw.productos[0] : loteRaw.productos)
                : null
              return {
                id:       pos.id,
                codigo:   pos.codigo,
                nivel:    pos.nivel,
                posicion: pos.posicion,
                ocupada:  pos.ocupada,
                lote: loteRaw && prod ? {
                  productoId:   loteRaw.producto_id,
                  sku:          prod.sku,
                  nombre:       prod.nombre,
                  cantidad:     loteRaw.cantidad,
                  fechaIngreso: loteRaw.fecha_ingreso,
                  alto_cm:      prod.alto_cm,
                  largo_cm:     prod.largo_cm,
                  ancho_cm:     prod.ancho_cm,
                } : null,
              }
            }),
        })),
    }))

    return { ok: true, data: result }
  },

  async obtenerEstructuraCompleta(): Promise<ServiceResult<PasilloConRacks[]>> {
    const { data, error } = await supabase
      .from('pasillos')
      .select('*, racks(*, posiciones_rack(*))')
      .eq('activo', true)
      .order('codigo')

    if (error) return { ok: false, error: { code: 'DB_ERROR', message: error.message } }

    const result: PasilloConRacks[] = (data ?? []).map((pasillo) => ({
      ...pasillo,
      racks: ((pasillo.racks as (Rack & { posiciones_rack: Posicion[] })[]) ?? []).map((rack) => ({
        ...rack,
        posiciones: rack.posiciones_rack ?? [],
      })),
    }))

    return { ok: true, data: result }
  },
}
