# CLAUDE.md — WMS Grantt (Sistema de Inventario)

Contexto del proyecto para Claude Code. Se actualiza a medida que el sistema evoluciona.

---

## Empresa y producto

**Representaciones Grantt S.A.** — Sistema de gestión de bodega (WMS) para control de inventario, picking y despacho. Usuarios internos: administradores y operadores de bodega con tablets Zebra.

---

## Stack técnico

| Capa | Tecnología |
|---|---|
| Frontend | React 19 + TypeScript + Vite, PWA |
| API Routes | Next.js (en `/api/` y `/pages/api/`) |
| Base de datos | Supabase (PostgreSQL + RLS + Realtime) |
| Deploy | Cloudflare Pages (auto-deploy desde `main` vía webhook) |
| Estilos | CSS custom en `src/index.css`, prefijos por feature |

## Arquitectura de capas (respetar siempre en este orden)

```
Page → Component → Hook → API Client → API Route → Service → Supabase
```

---

## Reglas de trabajo

- **Nunca abrir el preview del navegador** para verificar cambios — el usuario prueba todo él mismo
- **No hacer commit ni push** sin que el usuario lo pida explícitamente
- **No agregar comentarios** al código salvo que el WHY sea muy no obvio
- No refactorizar ni agregar features fuera del scope pedido

---

## Estructura de carpetas clave

```
src/features/
  notas/          → NV Preparacion (picking de notas de venta)
  salidas/        → NV Despacho (revisión y despacho)
  ingresos/       → Ingreso de OC
  picking-masivo/ → Picking masivo (pedidos mayoristas vía Excel)
  productos/      → Búsqueda y gestión de productos
  traslados/      → Reubicación e intercambio de stock
  etiquetas/      → Generación de etiquetas
  historial/      → Historial de movimientos
  mapa-bodega/    → Vista de racks y posiciones

api/
  notas/          → Service + handler NV
  salidas/        → Service + handler despacho
  ingresos/       → Service + handler OC
  picking-masivo/ → Service + handler picking masivo
  productos/      → Service + handler productos
  lib/supabase/   → Cliente Supabase (tipos como `any`)
```

---

## Nomenclatura CSS

Prefijos por feature para evitar colisiones:

| Prefijo | Feature |
|---|---|
| `nd-` | NotaDetallePage (NV Preparacion) |
| `rv-` | RevisionFlow (NV Despacho) |
| `pm-` | PickingMasivoPage |
| `ing-` | Ingresos |
| `hist-` | Historial |

---

## Base de datos

### Tablas principales
- `productos` — catálogo (sku, nombre, codigo_barra, prefijo, codigo_grupo, descripcion_grupo, codigo_subgrupo, descripcion_subgrupo, alto_cm, ancho_cm, largo_cm, peso_kg, activo, stock_total)
- `lotes_inventario` — stock físico por ubicación (FIFO por fecha_ingreso)
- `posiciones_rack` — ubicaciones (formato `A-R2-3-B`)
- `pasillos` — A, B, C, D, E, F
- `notas_venta` + `notas_venta_productos` — pedidos de clientes
- `importaciones` + `importacion_detalles` — OC de proveedores
- `movimientos` — log append-only (trigger `movimientos_append_only` — desactivar antes de UPDATE directo)
- `sesiones_picking_masivo` + `items_picking_masivo` + `subtareas_picking_masivo` — picking masivo

### Nomenclatura de ubicaciones
Formato: `A-R2-3-B` → pasillo=letra, rack=R+num, nivel=num, posicion=A/B

### Cubicaje
`floor(pos_dim / caja_dim)` por eje multiplicado. Posición estándar: alto 100cm, largo 120cm, ancho 100cm.

---

## Features implementados

- ✅ Ingresos de OC (PDF + ubicar con cubicaje)
- ✅ NV Preparacion (picking por operador)
- ✅ NV Despacho (revisión admin + asignación chofer + fecha despacho)
- ✅ Historial de movimientos
- ✅ Traslados (reubicación + intercambio)
- ✅ Mapa de bodega (racks + posiciones)
- ✅ Búsqueda de productos
- ✅ Inventario inicial
- ✅ Etiquetas
- ✅ Picking Masivo (backend + frontend — pendiente prueba e2e)
- ✅ Tema claro/oscuro (toggle en sidebar y login)

## Pendientes conocidos

- **Picking Masivo**: pendiente prueba end-to-end. Las 3 tablas nuevas deben existir en Supabase (`sesiones_picking_masivo`, `items_picking_masivo`, `subtareas_picking_masivo` + función `liberar_subtareas_expiradas`).
- **Botón "Producto equivalente"** en `ConfirmarSubtareaPage.tsx` (~línea 260): debe mostrarse solo cuando no hay stock, no siempre. Pendiente integrar validación de stock real.
- **`unidades_por_caja`**: campo pendiente en `productos` para cubicaje en cajas. SQL: `ALTER TABLE productos ADD COLUMN unidades_por_caja integer NOT NULL DEFAULT 1`.

---

## Tema visual

- **Modo oscuro**: fondo `#0f172a`, superficies `#1e293b`
- **Modo claro**: fondo Pantone 290C `#BDE0F3`, superficies `#D1E9F7`
- **Accent**: `#00A0DF` / hover `#0080B8`
- Logos: sidebar siempre `logo-grantt.png` (blanco); login usa `LOGO GRANTT CELESTE.png`

## Acceso móvil (red local)

- Certificado mkcert para IP `192.168.0.144`, válido hasta 2028
- Android: usar **Firefox** (Chrome bloquea fetch con cert de usuario)
- iOS: instalar `rootCA.pem` + habilitar confianza plena en Ajustes → Información → Configuración de confianza
- `rootCA` en `C:\Users\dekl\AppData\Local\mkcert\rootCA.pem` (solo en PC principal)
