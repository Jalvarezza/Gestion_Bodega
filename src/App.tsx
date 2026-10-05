import { Routes, Route, Navigate, useLocation } from 'react-router-dom'

// Auth
import { LoginPage }        from './features/auth/pages/LoginPage'
import { ProtectedRoute }   from './shared/components/ProtectedRoute'
import { Layout }           from './shared/components/Layout'

// Páginas
import { HomePage }         from './features/home/pages/HomePage'
import { UbicacionesPage }  from './features/ubicaciones/pages/UbicacionesPage'
import { ProductosPage }    from './features/productos/pages/ProductosPage'
import { IngresosPage }     from './features/ingresos/pages/IngresosPage'
import { NotasPage }        from './features/notas/pages/NotasPage'
import { NotaDetallePage }  from './features/notas/pages/NotaDetallePage'
import { SalidasPage }      from './features/salidas/pages/SalidasPage'
import { TrasladosPage }    from './features/traslados/pages/TrasladosPage'
import { HistorialPage }    from './features/historial/pages/HistorialPage'
import { EtiquetasPage }          from './features/etiquetas/pages/EtiquetasPage'
import { InventarioInicialPage }  from './features/inventario-inicial/pages/InventarioInicialPage'
import { PickingMasivoPage }      from './features/picking-masivo/pages/PickingMasivoPage'
import { NuevaSesionPage }        from './features/picking-masivo/pages/NuevaSesionPage'
import { SesionDetallePage }      from './features/picking-masivo/pages/SesionDetallePage'
import { OperadorSesionesPage }   from './features/picking-masivo/pages/OperadorSesionesPage'
import { OperadorColaPage }       from './features/picking-masivo/pages/OperadorColaPage'
import { ConfirmarSubtareaPage }  from './features/picking-masivo/pages/ConfirmarSubtareaPage'
import { DespachoSesionPage }    from './features/picking-masivo/pages/DespachoSesionPage'
import { OlaDetallePage }        from './features/picking-masivo/pages/OlaDetallePage'
import { ExtraccionOlaPage }           from './features/picking-masivo/pages/ExtraccionOlaPage'
import { ConfirmarExtraccionOlaPage }  from './features/picking-masivo/pages/ConfirmarExtraccionOlaPage'
import { PreparacionOlaPage }          from './features/picking-masivo/pages/PreparacionOlaPage'
import { ConfirmarLpnPage }            from './features/picking-masivo/pages/ConfirmarLpnPage'
import { DespachoOlaPage }             from './features/picking-masivo/pages/DespachoOlaPage'
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
      <Route path="/traslados"   element={<Protected><TrasladosPage /></Protected>} />
      <Route path="/historial"   element={<Protected><HistorialPage /></Protected>} />

      {/* Solo Admin */}
      <Route path="/ingresos"   element={<Protected><IngresosPage /></Protected>} />
      <Route path="/salidas"    element={<Protected><SalidasPage /></Protected>} />
      <Route path="/etiquetas"          element={<Protected><EtiquetasPage /></Protected>} />
      <Route path="/inventario-inicial" element={<Protected><InventarioInicialPage /></Protected>} />
      <Route path="/picking-masivo"       element={<Protected><PickingMasivoPage /></Protected>} />
      <Route path="/picking-masivo/nueva" element={<Protected><NuevaSesionPage /></Protected>} />
      <Route path="/picking-masivo/ola/:id"             element={<Protected><OlaDetallePage /></Protected>} />
      <Route path="/picking-masivo/ola/:id/extraccion"              element={<Protected><ExtraccionOlaPage /></Protected>} />
      <Route path="/picking-masivo/ola/:id/extraccion/:tareaId"    element={<Protected><ConfirmarExtraccionOlaPage /></Protected>} />
      <Route path="/picking-masivo/ola/:id/preparacion"            element={<Protected><PreparacionOlaPage /></Protected>} />
      <Route path="/picking-masivo/ola/:id/preparacion/:lpn"      element={<Protected><ConfirmarLpnPage /></Protected>} />
      <Route path="/picking-masivo/ola/:id/despacho"             element={<Protected><DespachoOlaPage /></Protected>} />
      <Route path="/picking-masivo/:id"    element={<Protected><SesionDetallePage /></Protected>} />

      {/* Picking masivo — operador */}
      <Route path="/picking-masivo/operador"                             element={<Protected><OperadorSesionesPage /></Protected>} />
      <Route path="/picking-masivo/operador/:id"                         element={<Protected><OperadorColaPage /></Protected>} />
      <Route path="/picking-masivo/operador/:id/confirmar/:subtareaId"   element={<Protected><ConfirmarSubtareaPage /></Protected>} />
      <Route path="/picking-masivo/:id/despacho"                         element={<Protected><DespachoSesionPage /></Protected>} />

      {/* Gestión de usuarios — solo admin */}
      <Route path="/usuarios" element={<Protected><UsuariosPage /></Protected>} />
    </Routes>
  )
}
