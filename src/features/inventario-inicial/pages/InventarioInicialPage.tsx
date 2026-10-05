import { useEffect }         from 'react'
import { useNavigate }       from 'react-router-dom'
import { CargaPosicionFlow } from '../components/CargaPosicionFlow'

export function InventarioInicialPage() {
  const navigate   = useNavigate()
  const usuarioId  = localStorage.getItem('user_id')  ?? ''
  const rol        = localStorage.getItem('user_rol')  ?? ''

  useEffect(() => {
    if (rol !== 'admin') navigate('/home', { replace: true })
  }, [rol, navigate])

  if (rol !== 'admin') return null

  return (
    <div className="inv2-page">
      <div className="inv2-page-header">
        <h1 className="inv2-page-titulo">Ubicación Inicial</h1>
      </div>
      <CargaPosicionFlow usuarioId={usuarioId} />
    </div>
  )
}
