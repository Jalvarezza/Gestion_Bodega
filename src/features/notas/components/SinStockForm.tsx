import { useState } from 'react'
import { useRegistrarSinStock } from '../hooks/useNotas'
import { ApiResponseError } from '../../../shared/utils/apiClient'

interface Props {
  notaProductoId: string
  sku:            string
  usuarioId:      string
  onCompletado:   () => void
  onCancelar:     () => void
}

export function SinStockForm({ notaProductoId, sku, usuarioId, onCompletado, onCancelar }: Props) {
  const [comentario, setComentario] = useState('')
  const [error, setError]           = useState<string | null>(null)
  const sinStock = useRegistrarSinStock()

  async function handleConfirmar() {
    setError(null)
    try {
      await sinStock.mutateAsync({ usuarioId, notaProductoId, comentarioOperador: comentario })
      onCompletado()
    } catch (e) {
      setError(e instanceof ApiResponseError ? e.message : 'Error al registrar sin stock')
    }
  }

  return (
    <div className="paso sin-stock-form">
      <h4>Producto sin Stock</h4>
      <p>Explica por qué no se puede despachar este producto.</p>

      <label>
        Comentario <span className="requerido">*</span>
        <textarea
          rows={3}
          value={comentario}
          onChange={(e) => setComentario(e.target.value)}
          placeholder="Ej: Sin stock en bodega, pendiente de reposición…"
          autoFocus
        />
      </label>

      {error && <div className="error-banner">{error}</div>}

      <div className="paso-acciones">
        <button className="btn-secundario btn-secundario--accion" onClick={onCancelar} disabled={sinStock.isPending}>
          Cancelar
        </button>
        <button
          className="btn-secundario btn-secundario--accion"
          disabled={sinStock.isPending || !comentario.trim()}
          onClick={handleConfirmar}
        >
          {sinStock.isPending ? 'Registrando…' : 'Confirmar sin stock'}
        </button>
      </div>
    </div>
  )
}
