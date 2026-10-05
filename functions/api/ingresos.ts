import { initSupabase, supabase } from '../../api/lib/supabase/client'
import { ingresosService } from '../../api/ingresos/ingresos.service'
import { json, errStatus, sp, type Env } from '../_lib/cf'
import { z } from 'zod'

const crearImportacionSchema = z.object({
  adminId: z.string().uuid(), numeroOc: z.string().min(1), archivoNombre: z.string().min(1),
  productos: z.array(z.object({ productoId: z.string().uuid(), cantidadEsperada: z.coerce.number().int().positive() })).min(1),
})
const validarCantidadSchema = z.object({
  detalleId: z.string().uuid(), cantidadIngresada: z.coerce.number().int().positive(),
})
const almacenarEnRackSchema = z.object({
  adminId: z.string().uuid(), detalleId: z.string().uuid(), posicionId: z.string().uuid(),
  cantidad: z.coerce.number().int().positive(), agregarAMismoProducto: z.boolean().optional(),
})
const almacenarEnPasilloSchema = z.object({
  adminId: z.string().uuid(), detalleId: z.string().uuid(), pasilloId: z.string().uuid(),
  cantidad: z.coerce.number().int().positive(),
})

export async function onRequest({ request, env }: { request: Request; env: Env }): Promise<Response> {
  initSupabase(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY)

  const params = sp(request)
  const accion = params.get('accion')
  const id     = params.get('id')
  const estado = params.get('estado')

  if (request.method === 'GET') {
    if (accion === 'packing-file') {
      const oc   = params.get('oc')
      const anio = params.get('anio')
      if (!oc || !anio) return json({ error: 'Faltan parámetros oc o anio' }, 400)
      const base = `${anio}/${oc}`
      const { data: archivos } = await supabase.storage.from('importaciones').list(base)
      if (!archivos || archivos.length === 0) return json({ error: 'no archivos' }, 404)
      const encontrado = ['packing.pdf', 'packing_ylk.pdf'].find((c) => archivos.some((f: any) => f.name === c))
      if (!encontrado) return json({ error: 'packing no encontrado' }, 404)
      const { data: blob, error: dlErr } = await supabase.storage.from('importaciones').download(`${base}/${encontrado}`)
      if (dlErr || !blob) return json({ error: dlErr?.message ?? 'sin blob' }, 500)
      return new Response(await blob.arrayBuffer(), {
        status: 200,
        headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${encontrado}"` },
      })
    }

    if (accion === 'posiciones-con-producto') {
      const productoId = params.get('productoId')
      if (!productoId) return json({ error: 'Falta productoId' }, 400)
      const { data: lotes } = await supabase
        .from('lotes_inventario')
        .select('posicion_id, cantidad, posiciones_rack(id, codigo, rack_id, racks(id, codigo, pasillos(id, codigo, nombre)))')
        .eq('producto_id', productoId).eq('activo', true).eq('en_pasillo', false)
        .not('posicion_id', 'is', null).gt('cantidad', 0)
      const mapaPos = new Map<string, any>()
      for (const l of (lotes ?? [])) {
        const pos = (l as any).posiciones_rack
        if (!pos || !l.posicion_id) continue
        const entry = mapaPos.get(l.posicion_id)
        if (entry) { entry.stockActual += l.cantidad }
        else mapaPos.set(l.posicion_id, {
          posicionId: l.posicion_id, codigo: pos.codigo,
          rackCodigo: pos.racks?.codigo ?? '', pasilloCodigo: pos.racks?.pasillos?.codigo ?? '',
          pasilloNombre: pos.racks?.pasillos?.nombre ?? null, stockActual: l.cantidad,
        })
      }
      return json(Array.from(mapaPos.values()))
    }

    if (id) {
      const result = await ingresosService.obtenerDetalleImportacion(id)
      return result.ok ? json(result.data) : json({ error: result.error }, 404)
    }

    const result = await ingresosService.obtenerImportaciones(estado ?? undefined)
    return result.ok ? json(result.data) : json({ error: result.error }, 500)
  }

  if (request.method === 'POST') {
    const body = await request.json().catch(() => ({}))

    if (accion === 'validar-cantidad') {
      const parsed = validarCantidadSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await ingresosService.validarCantidadIngreso(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, 400)
    }
    if (accion === 'almacenar-rack') {
      const parsed = almacenarEnRackSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await ingresosService.almacenarEnRack(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus(result.error.code))
    }
    if (accion === 'almacenar-pasillo') {
      const parsed = almacenarEnPasilloSchema.safeParse(body)
      if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
      const result = await ingresosService.almacenarEnPasillo(parsed.data)
      return result.ok ? json(result.data) : json({ error: result.error }, errStatus(result.error.code))
    }

    const parsed = crearImportacionSchema.safeParse(body)
    if (!parsed.success) return json({ error: { code: 'VALIDATION_ERROR', message: parsed.error.message } }, 400)
    const result = await ingresosService.crearImportacion(parsed.data)
    return result.ok ? json(result.data, 201) : json({ error: result.error }, errStatus(result.error.code))
  }

  return json({ error: 'Método no permitido' }, 405)
}
