# WMS Grantt — Sistema de Gestión de Bodega

Sistema de gestión de bodega (WMS) desarrollado para proyecto de titulo, Centraliza el control de inventario, la ubicación física de productos en racks y los procesos de preparación y despacho de pedidos.

## Problema que resuelve

La operación de bodega dependía de registros manuales, lo que generaba errores de picking, stock desactualizado y poca trazabilidad de los movimientos. Este sistema digitaliza el flujo completo:

1. Ubicación en rack.
2. Preparación de pedidos.
3. Despacho.

En cada etapa valida con escaneo de códigos y deja un historial de cada movimiento. Los operadores lo usan desde tablets y celulares en la red local.

## Características principales

- **NV Preparación (picking):**
  - Preparación de notas de venta con validación obligatoria del rack y del producto mediante escaneo.
  - Salida FIFO.
  - Bloqueo en tiempo real para que dos operadores no tomen la misma nota.
- **NV Despacho:** revisión de los pedidos preparados, asignación de chofer y fecha de despacho.
- **Picking masivo:**
  - Carga de órdenes mayoristas desde Excel.
  - Varios operadores trabajan la misma orden en paralelo, con bloqueo por línea.
- **Mapa de bodega:** vista de pasillos, racks y posiciones con su ocupación.
- **Búsqueda de productos:** por SKU, nombre o código de barras, con su stock y ubicaciones.
- **Historial de movimientos:** registro de solo inserción (no se puede editar).
- **Gestión de usuarios** (solo administrador): crear, bloquear, cambiar contraseña y eliminar usuarios.
- **Roles:** administrador, supervisor, validador y operador, cada uno con su propio menú y permisos.
- **Escáner con cámara:** lectura de códigos de barras desde el navegador del dispositivo.
- **PWA, tema claro/oscuro y diseño responsive** para escritorio, tablet y móvil.

## Tecnologías utilizadas

| Capa | Tecnología |
|---|---|
| Frontend | React 19, TypeScript, Vite, React Router |
| Estado y datos | TanStack React Query |
| Estilos | CSS propio, Tailwind CSS, Lucide (íconos) |
| Backend | Next.js (API Routes), Zod (validación) |
| Base de datos | Supabase: PostgreSQL, Row Level Security, Realtime, Auth |
| Documentos | xlsx (Excel), pdfjs-dist (lectura de PDF), jsPDF y JsBarcode (etiquetas) |
| Escaneo | Barcode Detector API |
| Calidad | ESLint, TypeScript |

Arquitectura en capas:

```
Page → Component → Hook → API Client → API Route → Service → Supabase
```


## Estructura del proyecto

```
src/features/   → módulos del frontend (notas, salidas, ingresos, picking-masivo, productos, traslados, etiquetas, historial, mapa-bodega)
src/shared/     → componentes, utilidades y layout compartidos
api/            → servicios y handlers del backend por módulo
pages/api/      → rutas de Next.js
supabase/       → esquema base, migraciones y scripts SQL
```

---

Proyecto de título desarrollado por Jorge Alvarez.
