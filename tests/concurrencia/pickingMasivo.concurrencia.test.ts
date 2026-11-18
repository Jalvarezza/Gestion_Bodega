import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  verificarEntorno, usuariosPorRol, crearOrdenTemporal, reiniciarLinea, leerLinea, borrarOrdenesTemporales,
  post, enParalelo, db, type Usuario,
} from '../helpers/datosPrueba'

const RONDAS = 20
const SOLICITUDES_POR_OPERADOR = 3

let A: Usuario, B: Usuario, admin: Usuario
let sesionId: string
let lineas: string[]

const tomar   = (u: Usuario, itemId: string) => post('picking-masivo?accion=tomar-linea', { usuarioId: u.id, itemId })
const liberar = (u: Usuario, itemId: string) => post('picking-masivo?accion=liberar-linea', { usuarioId: u.id, itemId })

beforeAll(async () => {
  await verificarEntorno()
  ;({ operadorA: A, operadorB: B, admin } = await usuariosPorRol())
  await borrarOrdenesTemporales()
  ;({ sesionId, itemIds: lineas } = await crearOrdenTemporal(admin.id, 3))
})

afterAll(async () => {
  await borrarOrdenesTemporales()
})

describe('Picking masivo · concurrencia al tomar un producto', () => {
  it(`CC-PM-01 · ${RONDAS} rondas de solicitudes simultáneas: la línea queda con un único operador`, async () => {
    const linea = lineas[0]
    const resumen = { A: 0, B: 0 }

    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      await reiniciarLinea(linea)
      const solicitudes = Array.from({ length: SOLICITUDES_POR_OPERADOR }, () => [
        async () => ({ quien: A, r: await tomar(A, linea) }),
        async () => ({ quien: B, r: await tomar(B, linea) }),
      ]).flat()

      const resultados = await enParalelo(solicitudes)
      const final = await leerLinea(linea)
      const ganadores = new Set(resultados.filter((x) => x.r.status === 200).map((x) => x.quien.id))

      expect(final.estado).toBe('en_progreso')
      expect(ganadores.size, `ronda ${ronda}: más de un operador obtuvo la línea`).toBe(1)
      expect([...ganadores][0]).toBe(final.tomado_por)

      for (const x of resultados.filter((x) => x.quien.id !== final.tomado_por)) {
        expect(x.r.status).toBe(409)
        expect(x.r.json.error.code).toBe('LINEA_TOMADA')
      }
      resumen[final.tomado_por === A.id ? 'A' : 'B']++
    }
    console.info(`CC-PM-01 · ganadores por ronda → operador A: ${resumen.A}, operador B: ${resumen.B}`)
  })

  it('CC-PM-02 · el segundo operador recibe LINEA_TOMADA con el nombre de quien la tiene', async () => {
    const linea = lineas[0]
    await reiniciarLinea(linea)
    expect((await tomar(A, linea)).status).toBe(200)
    const r = await tomar(B, linea)
    expect(r.status).toBe(409)
    expect(r.json.error.message).toContain(A.nombre)
  })

  it('CC-PM-03 · el operador que la tomó puede retomarla (continuar) sin perder el bloqueo', async () => {
    const linea = lineas[0]
    await reiniciarLinea(linea)
    await tomar(A, linea)
    expect((await tomar(A, linea)).status).toBe(200)
    expect((await leerLinea(linea)).tomado_por).toBe(A.id)
  })

  it('CC-PM-04 · otro operador no puede liberar una línea ajena', async () => {
    const linea = lineas[0]
    await reiniciarLinea(linea)
    await tomar(A, linea)
    await liberar(B, linea)
    expect(await leerLinea(linea)).toMatchObject({ estado: 'en_progreso', tomado_por: A.id })
  })

  it('CC-PM-05 · al liberarla su dueño, el otro operador ya puede tomarla', async () => {
    const linea = lineas[0]
    await reiniciarLinea(linea)
    await tomar(A, linea)
    await liberar(A, linea)
    expect((await tomar(B, linea)).status).toBe(200)
    expect((await leerLinea(linea)).tomado_por).toBe(B.id)
  })

  it('CC-PM-06 · una línea abandonada más de 10 minutos se libera y otro operador puede tomarla', async () => {
    const linea = lineas[0]
    await reiniciarLinea(linea)
    await tomar(A, linea)
    await db.from('items_picking_masivo').update({ tomado_en: new Date(Date.now() - 11 * 60_000).toISOString() }).eq('id', linea)
    await fetch(`${process.env.API_URL ?? 'http://localhost:3001/api'}/picking-masivo?id=${sesionId}`)
    expect((await leerLinea(linea)).estado).toBe('libre')
    expect((await tomar(B, linea)).status).toBe(200)
  })

  it('CC-PM-07 · operadores distintos pueden tomar líneas distintas al mismo tiempo (sin bloqueos falsos)', async () => {
    await Promise.all(lineas.map(reiniciarLinea))
    const [rA, rB] = await enParalelo([() => tomar(A, lineas[1]), () => tomar(B, lineas[2])])
    expect(rA.status).toBe(200)
    expect(rB.status).toBe(200)
    expect((await leerLinea(lineas[1])).tomado_por).toBe(A.id)
    expect((await leerLinea(lineas[2])).tomado_por).toBe(B.id)
  })

  it('CC-PM-08 · un usuario que no es operador no puede tomar líneas', async () => {
    await reiniciarLinea(lineas[0])
    const r = await tomar(admin, lineas[0])
    expect(r.status).toBe(403)
    expect((await leerLinea(lineas[0])).estado).toBe('libre')
  })

  it('CC-PM-09 · tiempo de respuesta de "Tomar" menor a 2 segundos', async () => {
    const tiempos: number[] = []
    for (let i = 0; i < 10; i++) {
      await reiniciarLinea(lineas[0])
      tiempos.push((await tomar(A, lineas[0])).ms)
    }
    const max = Math.max(...tiempos)
    const promedio = tiempos.reduce((t, x) => t + x, 0) / tiempos.length
    console.info(`CC-PM-09 · tomar-linea → promedio ${Math.round(promedio)} ms, máximo ${Math.round(max)} ms (${tiempos.length} muestras)`)
    expect(max).toBeLessThan(2000)
  })
})
