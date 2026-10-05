// ⚠️ TEMPORAL — SOLO PARA PRUEBAS ⚠️
// Omite la etapa de "NV preparación": al crear una nota, la completa
// automáticamente (usando las mismas API de picking/sin-stock que usaría
// un operador) para que quede disponible de inmediato en "NV despacho".
// No modifica el backend — solo encadena llamadas a los endpoints ya
// existentes. Eliminar este archivo y su uso en ImportarNotaFlow.tsx
// cuando se reactive la etapa de preparación manual.

import { notasApi } from '../services/notas.api'
import type { NotaProductoResumen } from '../services/notas.api'

function construirPlan(ubicaciones: { loteId: string; cantidad: number }[], cantidadNecesaria: number) {
  const plan: { loteId: string; cantidad: number }[] = []
  let restante = cantidadNecesaria
  for (const u of ubicaciones) {
    if (restante <= 0) break
    const tomar = Math.min(u.cantidad, restante)
    plan.push({ loteId: u.loteId, cantidad: tomar })
    restante -= tomar
  }
  return { plan, restante }
}

async function autoCompletarProducto(usuarioId: string, producto: NotaProductoResumen) {
  const necesario = producto.cantidadSolicitada - producto.cantidadDespachada
  if (necesario <= 0) return

  let { plan, restante } = construirPlan(producto.ubicaciones, necesario)
  let usarEquivalente = false
  let productoEquivalenteId: string | undefined
  let codigoBarra = producto.codigoBarra

  // Si el producto original no alcanza a cubrir la cantidad, probar con
  // el primer equivalente que sí tenga stock suficiente.
  if (restante > 0) {
    const equivalente = producto.equivalentes.find((eq) => {
      const totalEq = eq.ubicaciones.reduce((s, u) => s + u.cantidad, 0)
      return totalEq >= necesario
    })
    if (equivalente) {
      const resultado = construirPlan(equivalente.ubicaciones, necesario)
      plan = resultado.plan
      restante = resultado.restante
      usarEquivalente = true
      productoEquivalenteId = equivalente.productoId
      codigoBarra = equivalente.codigoBarra
    }
  }

  // Ni el original ni ningún equivalente tienen stock → cerrar como sin stock.
  if (plan.length === 0) {
    await notasApi.registrarSinStock({
      usuarioId,
      notaProductoId: producto.notaProductoId,
      comentarioOperador: 'Auto-completado para pruebas — sin stock disponible',
    })
    return
  }

  for (let i = 0; i < plan.length; i++) {
    const esUltima = i === plan.length - 1
    await notasApi.registrarPicking({
      usuarioId,
      notaProductoId: producto.notaProductoId,
      codigoProducto: codigoBarra,
      cantidad: plan[i].cantidad,
      loteId: plan[i].loteId,
      usarEquivalente,
      productoEquivalenteId,
      esParadaMultiLote: !esUltima,
      // Solo hace falta motivo si, tras agotar el plan, sigue quedando cantidad sin cubrir.
      comentarioOperador: (esUltima && restante > 0) ? 'Auto-completado para pruebas — stock insuficiente' : undefined,
    })
  }
}

export async function autoCompletarNotaParaPruebas(
  usuarioId: string,
  productos: NotaProductoResumen[],
  onProgreso?: (completados: number, total: number) => void,
): Promise<void> {
  let completados = 0
  onProgreso?.(0, productos.length)

  // Cada producto es independiente (lotes propios, fila propia en nota_productos),
  // así que se procesan en paralelo — con muchos productos, hacerlo secuencial
  // se sentía "colgado" porque cada uno implica 1-2 llamadas de red en serie.
  await Promise.all(productos.map(async (producto) => {
    try {
      await autoCompletarProducto(usuarioId, producto)
    } catch (e) {
      console.error(`[auto-completar pruebas] falló para ${producto.sku}:`, e)
    } finally {
      completados += 1
      onProgreso?.(completados, productos.length)
    }
  }))
}
