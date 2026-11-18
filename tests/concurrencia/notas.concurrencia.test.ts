import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import {
  verificarEntorno, usuariosPorRol, crearNotaTemporal, reiniciarNota, leerNota, borrarNotasTemporales,
  post, enParalelo, db, type Usuario,
} from '../helpers/datosPrueba'

// La toma exitosa por API registra un movimiento (tabla append-only, imposible de borrar),
// por eso la carrera se ejecuta directo sobre la RPC atómica tomar_nota que usa el API,
// y por API solo se prueban los casos de rechazo, que no dejan registros.
const RONDAS = 20
const SOLICITUDES_POR_OPERADOR = 3

let A: Usuario, B: Usuario, admin: Usuario
let notaId: string

const rpcTomar = (u: Usuario) => db.rpc('tomar_nota', { p_nota_id: notaId, p_usuario_id: u.id })
const apiTomar = (u: Usuario) => post('notas?accion=tomar', { usuarioId: u.id, notaId })

beforeAll(async () => {
  await verificarEntorno()
  ;({ operadorA: A, operadorB: B, admin } = await usuariosPorRol())
  await borrarNotasTemporales()
  notaId = await crearNotaTemporal(admin.id)
})

afterAll(async () => {
  await borrarNotasTemporales()
})

describe('NV Preparación · concurrencia al tomar una nota', () => {
  it(`CC-NV-01 · ${RONDAS} rondas de solicitudes simultáneas: la nota queda con un único operador`, async () => {
    const resumen = { A: 0, B: 0 }

    for (let ronda = 1; ronda <= RONDAS; ronda++) {
      await reiniciarNota(notaId)
      const solicitudes = Array.from({ length: SOLICITUDES_POR_OPERADOR }, () => [
        async () => ({ quien: A, r: await rpcTomar(A) }),
        async () => ({ quien: B, r: await rpcTomar(B) }),
      ]).flat()

      const resultados = await enParalelo(solicitudes)
      const exitos = resultados.filter((x) => x.r.data === true)
      const final = await leerNota(notaId)

      expect(exitos, `ronda ${ronda}: la nota se entregó más de una vez`).toHaveLength(1)
      expect(final).toEqual({ estado: 'preparacion', tomada_por: exitos[0].quien.id })
      resumen[final.tomada_por === A.id ? 'A' : 'B']++
    }
    console.info(`CC-NV-01 · ganadores por ronda → operador A: ${resumen.A}, operador B: ${resumen.B}`)
  })

  it('CC-NV-02 · por API, el segundo operador recibe 409 NOTA_TOMADA con el nombre de quien la tiene', async () => {
    await reiniciarNota(notaId)
    await rpcTomar(A)
    const r = await apiTomar(B)
    expect(r.status).toBe(409)
    expect(r.json.error.code).toBe('NOTA_TOMADA')
    expect(r.json.error.message).toContain(A.nombre)
    expect((await leerNota(notaId)).tomada_por).toBe(A.id)
  })

  it('CC-NV-03 · varios intentos simultáneos del otro operador por API son todos rechazados', async () => {
    await reiniciarNota(notaId)
    await rpcTomar(A)
    const resultados = await enParalelo(Array.from({ length: 5 }, () => () => apiTomar(B)))
    for (const r of resultados) expect(r.status).toBe(409)
    expect((await leerNota(notaId)).tomada_por).toBe(A.id)
  })

  it('CC-NV-04 · el operador dueño puede retomar su nota por API', async () => {
    await reiniciarNota(notaId)
    await rpcTomar(A)
    expect((await apiTomar(A)).status).toBe(200)
    expect((await leerNota(notaId)).tomada_por).toBe(A.id)
  })

  it('CC-NV-05 · un usuario que no es operador no puede tomar notas', async () => {
    await reiniciarNota(notaId)
    const r = await apiTomar(admin)
    expect(r.status).toBe(403)
    expect((await leerNota(notaId)).estado).toBe('pendiente')
  })

  it('CC-NV-06 · tiempo de respuesta al intentar tomar una nota menor a 2 segundos', async () => {
    await reiniciarNota(notaId)
    await rpcTomar(A)
    const tiempos: number[] = []
    for (let i = 0; i < 10; i++) tiempos.push((await apiTomar(B)).ms)
    const max = Math.max(...tiempos)
    const promedio = tiempos.reduce((t, x) => t + x, 0) / tiempos.length
    console.info(`CC-NV-06 · tomar nota → promedio ${Math.round(promedio)} ms, máximo ${Math.round(max)} ms (${tiempos.length} muestras)`)
    expect(max).toBeLessThan(2000)
  })
})
