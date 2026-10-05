import { CrearSesionFlow } from '../components/CrearSesionFlow'

export function NuevaSesionPage() {
  const adminId = localStorage.getItem('user_id') ?? ''
  return <CrearSesionFlow adminId={adminId} />
}
