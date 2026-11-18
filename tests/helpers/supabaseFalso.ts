// Cliente Supabase falso para pruebas unitarias: es para registrar cada consulta y responde según la tabla y la operación.
export type Consulta = {
  tabla:    string
  op:       'select' | 'update' | 'insert' | 'delete' | 'rpc'
  columnas?: string
  valores?: unknown
  filtros:  unknown[][]
}

export type Respuesta = { data?: unknown; error?: { message: string } | null }

const FILTROS = ['eq', 'neq', 'or', 'in', 'lt', 'lte', 'gt', 'gte', 'not', 'is', 'order', 'limit', 'range', 'single', 'maybeSingle']

export function crearSupabaseFalso() {
  const consultas: Consulta[] = []
  let responder: (c: Consulta) => Respuesta = () => ({ data: null, error: null })

  const resolver = (c: Consulta) => {
    consultas.push(c)
    const r = responder(c)
    return Promise.resolve({ data: r.data ?? null, error: r.error ?? null })
  }

  const constructor = (c: Consulta) => {
    const b: Record<string, unknown> = {}
    for (const f of FILTROS) b[f] = (...args: unknown[]) => { c.filtros.push([f, ...args]); return b }
    b.select = (cols?: string) => { if (c.op === 'select') c.columnas = cols; return b }
    b.update = (v: unknown) => { c.op = 'update'; c.valores = v; return b }
    b.insert = (v: unknown) => { c.op = 'insert'; c.valores = v; return b }
    b.delete = () => { c.op = 'delete'; return b }
    b.then = (ok: (v: unknown) => unknown, err?: (e: unknown) => unknown) => resolver(c).then(ok, err)
    return b
  }

  const cliente = {
    from: (tabla: string) => constructor({ tabla, op: 'select', filtros: [] }),
    rpc:  (fn: string, args: unknown) => resolver({ tabla: fn, op: 'rpc', valores: args, filtros: [] }),
  }

  return {
    cliente,
    consultas,
    responder: (fn: (c: Consulta) => Respuesta) => { responder = fn },
    reiniciar: () => { consultas.length = 0; responder = () => ({ data: null, error: null }) },
  }
}
