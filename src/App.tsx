import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

// Auth
import { LoginPage }        from './features/auth/pages/LoginPage'
import { ProtectedRoute }   from './shared/components/ProtectedRoute'
import { Layout }           from './shared/components/Layout'

// Páginas
import { HomePage }         from './features/home/pages/HomePage'
import { UbicacionesPage }  from './features/ubicaciones/pages/UbicacionesPage'
import { ProductosPage }    from './features/productos/pages/ProductosPage'
import { NotasPage }        from './features/notas/pages/NotasPage'
import { NotaDetallePage }  from './features/notas/pages/NotaDetallePage'
import { SalidasPage }      from './features/salidas/pages/SalidasPage'
import { HistorialPage }    from './features/historial/pages/HistorialPage'
import { UsuariosPage }          from './features/usuarios/pages/UsuariosPage'

function Protected({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  return (
    <ProtectedRoute rutaActual={pathname}>
      <Layout>{children}</Layout>
    </ProtectedRoute>
  )
}

export default function App() {
  return (
    <Routes>
      {/* Pública */}
      <Route path="/login" element={<LoginPage />} />

      {/* Redirige raíz a home */}
      <Route path="/" element={<Navigate to="/home" replace />} />

      {/* Admin + Operador */}
      <Route path="/home"        element={<Protected><HomePage /></Protected>} />
      <Route path="/ubicaciones" element={<Protected><UbicacionesPage /></Protected>} />
      <Route path="/productos"   element={<Protected><ProductosPage /></Protected>} />
      <Route path="/notas"       element={<Protected><NotasPage /></Protected>} />
      <Route path="/notas/:id"   element={<Protected><NotaDetallePage /></Protected>} />
      <Route path="/historial"   element={<Protected><HistorialPage /></Protected>} />

      {/* Solo Admin */}
      <Route path="/salidas"    element={<Protected><SalidasPage /></Protected>} />

      {/* Gestión de usuarios — solo admin */}
      <Route path="/usuarios" element={<Protected><UsuariosPage /></Protected>} />
    </Routes>
  )
}
