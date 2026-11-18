import { createClient } from '@supabase/supabase-js'

// Datos temporales: todo lo que crean las pruebas lleva este prefijo y se borra al terminar
export const PREFIJO = 'TEST-CONC-'
export const API = process.env.API_URL ?? 'http://localhost:3001/api'

export const db = createClient(process.env.SUPABASE_URL ?? '', process.env.SUPABASE_SERVICE_ROLE_KEY ?? '', {
  auth: { autoRefreshToken: false, persistSession: false },
})

export type Usuario = { id: string; nombre: string }

export async function verificarEntorno() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env')
  }
  try {
    await fetch(`${API}/picking-masivo?id=00000000-0000-4000-8000-000000000000`)
  } catch {
    throw new Error(`La API no responde en ${API}. Levanta el proyecto con "npm run dev" antes de correr estas pruebas.`)
  }
}

export async function usuariosPorRol() {
  const { data, error } = await db.from('usuarios').select('id, nombre, rol').order('created_at')
  if (error) throw error
  const de = (rol: string) => (data ?? []).filter((u) => u.rol === rol) as Usuario[]
  const operadores = de('operador')
  const admin = de('admin')[0]
  if (operadores.length < 2) throw new Error('Se necesitan al menos 2 usuarios con rol operador')
  if (!admin) throw new Error('Se necesita al menos 1 usuario admin')
  return { operadorA: operadores[0], operadorB: operadores[1], admin }
}

export async function post(ruta: string, body: unknown) {
  const inicio = performance.now()
  const res = await fetch(`${API}/${ruta}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
  const ms = performance.now() - inicio
  const json = await res.json().catch(() => null)
  return { status: res.status, json, ms }
}

// ── Picking masivo ─────────────────────────────────────────────────────────

export async function crearOrdenTemporal(creadoPor: string, lineas = 3) {
  const { data: producto } = await db.from('productos').select('id, sku, nombre').limit(1).single()
  if (!producto) throw new Error('No hay productos en la base para armar la orden de prueba')

  const { data: sesion, error } = await db.from('sesiones_picking_masivo').insert({
    numero_oc: `${PREFIJO}${Date.now()}`, nombre_cliente: 'Prueba concurrencia', estado: 'activa',
    total_items: lineas, creado_por: creadoPor, activada_en: new Date().toISOString(),
  }).select('id').single()
  if (error || !sesion) throw error ?? new Error('No se pudo crear la orden temporal')

  const { data: items, error: errItems } = await db.from('items_picking_masivo').insert(
    Array.from({ length: lineas }, (_, i) => ({
      sesion_id: sesion.id, producto_id: producto.id, codigo: `${PREFIJO}${i + 1}`,
      descripcion: producto.nombre, cantidad_pedida: 10, estado: 'libre',
    })),
  ).select('id')
  if (errItems || !items) throw errItems ?? new Error('No se pudieron crear las líneas temporales')
  return { sesionId: sesion.id as string, itemIds: items.map((i) => i.id as string) }
}

export async function reiniciarLinea(itemId: string) {
  await db.from('items_picking_masivo').update({ estado: 'libre', tomado_por: null, tomado_en: null }).eq('id', itemId)
}

export async function leerLinea(itemId: string) {
  const { data } = await db.from('items_picking_masivo').select('estado, tomado_por, tomado_en').eq('id', itemId).single()
  return data as { estado: string; tomado_por: string | null; tomado_en: string | null }
}

export async function borrarOrdenesTemporales() {
  const { data } = await db.from('sesiones_picking_masivo').select('id').like('numero_oc', `${PREFIJO}%`)
  const ids = (data ?? []).map((s) => s.id)
  if (!ids.length) return
  await db.from('items_picking_masivo').delete().in('sesion_id', ids)
  await db.from('sesiones_picking_masivo').delete().in('id', ids)
}

// ── NV ─────────────────────────────────────────────────────────────────────

export async function crearNotaTemporal(importadoPor: string) {
  const { data, error } = await db.from('notas_venta').insert({
    numero_nota: `${PREFIJO}${Date.now()}`, nombre_cliente: 'Prueba concurrencia', importado_por: importadoPor, estado: 'pendiente',
  }).select('id').single()
  if (error || !data) throw error ?? new Error('No se pudo crear la nota temporal')
  return data.id as string
}

export async function reiniciarNota(notaId: string) {
  await db.from('notas_venta').update({ estado: 'pendiente', tomada_por: null, tomada_en: null }).eq('id', notaId)
}

export async function leerNota(notaId: string) {
  const { data } = await db.from('notas_venta').select('estado, tomada_por').eq('id', notaId).single()
  return data as { estado: string; tomada_por: string | null }
}

export async function borrarNotasTemporales() {
  await db.from('notas_venta').delete().like('numero_nota', `${PREFIJO}%`)
}

// Lanza las funciones a la vez (mismo tick) y devuelve los resultados en orden
export function enParalelo<T>(fns: (() => Promise<T>)[]) {
  return Promise.all(fns.map((f) => f()))
}
