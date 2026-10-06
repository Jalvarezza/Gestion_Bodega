-- Esquema base del WMS Grantt, reconstruido desde las consultas del código.
-- Debe ejecutarse ANTES que el resto de migraciones (20260824_* en adelante),
-- que hacen ALTER sobre estas tablas.
--
-- Los nombres de FK que el código usa como hint de PostgREST
-- (ej. nota_productos_producto_equivalente_id_fkey) son los nombres por
-- defecto de Postgres para un REFERENCES inline: no renombrar.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
--  Funciones comunes
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Usuarios (id = auth.users.id)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE usuarios (
  id          uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      text        NOT NULL,
  rol         text        NOT NULL CHECK (rol IN ('admin', 'supervisor', 'validador', 'operador')),
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ═══════════════════════════════════════════════════════════════════════════
--  Ubicaciones: pasillos → racks → posiciones_rack (formato A-R2-3-B)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE pasillos (
  id      uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo  text    NOT NULL UNIQUE,
  nombre  text,
  activo  boolean NOT NULL DEFAULT true
);

CREATE TABLE racks (
  id          uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  pasillo_id  uuid    NOT NULL REFERENCES pasillos(id),
  codigo      text    NOT NULL,
  numero      integer,
  activo      boolean NOT NULL DEFAULT true
);

CREATE INDEX idx_racks_pasillo ON racks(pasillo_id);

CREATE TABLE posiciones_rack (
  id        uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  rack_id   uuid    NOT NULL REFERENCES racks(id),
  codigo    text    NOT NULL UNIQUE,
  nivel     integer NOT NULL,
  posicion  text    NOT NULL,
  ocupada   boolean NOT NULL DEFAULT false,
  activo    boolean NOT NULL DEFAULT true,
  alto_cm   numeric NOT NULL DEFAULT 100,
  ancho_cm  numeric NOT NULL DEFAULT 100,
  largo_cm  numeric NOT NULL DEFAULT 120
);

CREATE INDEX idx_posiciones_rack_rack ON posiciones_rack(rack_id);

-- ═══════════════════════════════════════════════════════════════════════════
--  Productos
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE productos (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sku                       text        NOT NULL UNIQUE,
  nombre                    text        NOT NULL,
  codigo_barra              text,
  codigo_barra_alternativo  text,
  marca                     text,
  prefijo                   text,
  codigo_grupo              text,
  descripcion_grupo         text,
  codigo_subgrupo           text,
  descripcion_subgrupo      text,
  alto_cm                   numeric,
  ancho_cm                  numeric,
  largo_cm                  numeric,
  peso_kg                   numeric,
  activo                    boolean     NOT NULL DEFAULT true,
  stock_total               integer     NOT NULL DEFAULT 0,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_productos_codigo_barra ON productos(codigo_barra) WHERE codigo_barra IS NOT NULL;
CREATE INDEX idx_productos_codigo_barra_alt ON productos(codigo_barra_alternativo);

CREATE TRIGGER trg_productos_updated_at
  BEFORE UPDATE ON productos
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- ═══════════════════════════════════════════════════════════════════════════
--  Importaciones (OC de proveedores)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE importaciones (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo          text        NOT NULL UNIQUE,
  numero_oc       text        NOT NULL UNIQUE,
  fecha_ingreso   date        NOT NULL DEFAULT current_date,
  estado          text        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'parcial', 'completa')),
  importado_por   uuid        REFERENCES usuarios(id),
  archivo_nombre  text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE importacion_detalles (
  id                 uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  importacion_id     uuid    NOT NULL REFERENCES importaciones(id) ON DELETE CASCADE,
  producto_id        uuid    NOT NULL REFERENCES productos(id),
  cantidad_esperada  integer NOT NULL CHECK (cantidad_esperada > 0),
  cantidad_recibida  integer NOT NULL DEFAULT 0,
  estado             text    NOT NULL DEFAULT 'pendiente'
                             CHECK (estado IN ('pendiente', 'parcial', 'completa'))
);

CREATE INDEX idx_importacion_detalles_importacion ON importacion_detalles(importacion_id);

-- ═══════════════════════════════════════════════════════════════════════════
--  Lotes de inventario (stock físico, FIFO por fecha_ingreso)
-- ═══════════════════════════════════════════════════════════════════════════

-- created_at lo usan notas e inventario-inicial; creado_en lo usa olas.
CREATE TABLE lotes_inventario (
  id                      uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  producto_id             uuid        NOT NULL REFERENCES productos(id),
  posicion_id             uuid        REFERENCES posiciones_rack(id),
  pasillo_id              uuid        REFERENCES pasillos(id),
  cantidad                integer     NOT NULL CONSTRAINT cantidad_positiva CHECK (cantidad >= 0),
  fecha_ingreso           date        NOT NULL DEFAULT current_date,
  en_pasillo              boolean     NOT NULL DEFAULT false,
  activo                  boolean     NOT NULL DEFAULT true,
  tipo_origen             text        NOT NULL DEFAULT 'importacion',
  importacion_id          uuid        REFERENCES importaciones(id),
  importacion_detalle_id  uuid        REFERENCES importacion_detalles(id),
  created_at              timestamptz NOT NULL DEFAULT now(),
  creado_en               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_lotes_producto_fifo ON lotes_inventario(producto_id, fecha_ingreso);
CREATE INDEX idx_lotes_posicion ON lotes_inventario(posicion_id);

-- productos.stock_total = suma de sus lotes
CREATE OR REPLACE FUNCTION fn_recalcular_stock_producto(p_producto_id uuid)
RETURNS void
LANGUAGE sql
AS $$
  UPDATE productos
  SET stock_total = COALESCE((
    SELECT SUM(cantidad) FROM lotes_inventario
    WHERE producto_id = p_producto_id AND activo
  ), 0)
  WHERE id = p_producto_id;
$$;

CREATE OR REPLACE FUNCTION fn_trg_recalcular_stock()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM fn_recalcular_stock_producto(OLD.producto_id);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') AND (TG_OP = 'INSERT' OR NEW.producto_id IS DISTINCT FROM OLD.producto_id) THEN
    PERFORM fn_recalcular_stock_producto(NEW.producto_id);
  END IF;
  RETURN NULL;
END;
$$;

CREATE TRIGGER trg_recalcular_stock
  AFTER INSERT OR UPDATE OR DELETE ON lotes_inventario
  FOR EACH ROW EXECUTE FUNCTION fn_trg_recalcular_stock();

-- ═══════════════════════════════════════════════════════════════════════════
--  Notas de venta
-- ═══════════════════════════════════════════════════════════════════════════

-- comentario_despacho, fecha_preparacion, fecha_despacho, nombre_chofer y
-- completada_por_id los agregan las migraciones 20260825/20260903/20260904.
CREATE TABLE notas_venta (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_nota     text        NOT NULL UNIQUE,
  nombre_cliente  text        NOT NULL,
  rut_cliente     text,
  numero_oc       text,
  importado_por   uuid        NOT NULL REFERENCES usuarios(id),
  estado          text        NOT NULL DEFAULT 'pendiente'
                              CHECK (estado IN ('pendiente', 'preparacion', 'completa', 'despachada', 'anulada')),
  archivo_nombre  text,
  tomada_por      uuid        REFERENCES usuarios(id),
  tomada_en       timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_notas_venta_estado ON notas_venta(estado);
CREATE INDEX idx_notas_venta_updated_at ON notas_venta(updated_at);

CREATE TRIGGER trg_notas_venta_updated_at
  BEFORE UPDATE ON notas_venta
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

CREATE TABLE nota_productos (
  id                       uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_venta_id            uuid    NOT NULL REFERENCES notas_venta(id) ON DELETE CASCADE,
  producto_id              uuid    NOT NULL REFERENCES productos(id),
  producto_equivalente_id  uuid    REFERENCES productos(id),
  cantidad_solicitada      integer NOT NULL CHECK (cantidad_solicitada > 0),
  cantidad_despachada      integer NOT NULL DEFAULT 0,
  estado                   text    NOT NULL DEFAULT 'pendiente'
                                   CHECK (estado IN ('pendiente', 'parcial', 'completo', 'sin_stock')),
  comentario_operador      text,
  revisado_admin           boolean NOT NULL DEFAULT false
);

CREATE INDEX idx_nota_productos_nota ON nota_productos(nota_venta_id);

CREATE TABLE despachos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_venta_id   uuid        NOT NULL UNIQUE REFERENCES notas_venta(id) ON DELETE CASCADE,
  nombre_chofer   text        NOT NULL,
  validado_por    uuid        REFERENCES usuarios(id),
  fecha_despacho  timestamptz NOT NULL DEFAULT now(),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devoluciones (
  id             uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  nota_venta_id  uuid        NOT NULL REFERENCES notas_venta(id) ON DELETE CASCADE,
  usuario_id     uuid        REFERENCES usuarios(id),
  motivo         text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE devolucion_items (
  id             uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  devolucion_id  uuid    NOT NULL REFERENCES devoluciones(id) ON DELETE CASCADE,
  producto_id    uuid    NOT NULL REFERENCES productos(id),
  cantidad       integer NOT NULL CHECK (cantidad > 0),
  posicion_id    uuid    REFERENCES posiciones_rack(id)
);

-- Bloqueo atómico de una nota por un operador: true si la tomó.
CREATE OR REPLACE FUNCTION tomar_nota(p_nota_id uuid, p_usuario_id uuid)
RETURNS boolean
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE notas_venta
  SET estado     = 'preparacion',
      tomada_por = p_usuario_id,
      tomada_en  = now()
  WHERE id = p_nota_id
    AND estado = 'pendiente';
  RETURN FOUND;
END;
$$;

-- Libera notas en preparación sin movimientos en los últimos 10 minutos.
CREATE OR REPLACE FUNCTION liberar_notas_abandonadas()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE
  v_liberadas integer;
BEGIN
  UPDATE notas_venta n
  SET estado     = 'pendiente',
      tomada_por = NULL,
      tomada_en  = NULL
  WHERE n.estado = 'preparacion'
    AND n.tomada_en < now() - interval '10 minutes'
    AND NOT EXISTS (
      SELECT 1 FROM movimientos m
      WHERE m.nota_venta_id = n.id
        AND m.fecha > now() - interval '10 minutes'
    );
  GET DIAGNOSTICS v_liberadas = ROW_COUNT;
  RETURN v_liberadas;
END;
$$;

-- ═══════════════════════════════════════════════════════════════════════════
--  Traslados (solo lectura desde Historial)
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE traslados (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo                 text        NOT NULL CHECK (tipo IN ('reubicacion', 'intercambio')),
  fecha_traslado       timestamptz NOT NULL DEFAULT now(),
  realizado_por        uuid        NOT NULL REFERENCES usuarios(id),
  posicion_origen_id   uuid        REFERENCES posiciones_rack(id),
  posicion_destino_id  uuid        REFERENCES posiciones_rack(id),
  producto_origen_id   uuid        REFERENCES productos(id),
  producto_destino_id  uuid        REFERENCES productos(id),
  lote_origen_id       uuid,
  lote_destino_id      uuid
);

-- ═══════════════════════════════════════════════════════════════════════════
--  Movimientos (log append-only)
-- ═══════════════════════════════════════════════════════════════════════════

-- lote_id sin FK: inventario-inicial borra lotes que ya tienen movimientos,
-- y un ON DELETE SET NULL chocaría con el trigger append-only.
CREATE TABLE movimientos (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo            text        NOT NULL,
  fecha           timestamptz NOT NULL DEFAULT now(),
  usuario_id      uuid        REFERENCES usuarios(id),
  producto_id     uuid        REFERENCES productos(id),
  nota_venta_id   uuid        REFERENCES notas_venta(id),
  importacion_id  uuid        REFERENCES importaciones(id),
  lote_id         uuid,
  traslado_id     uuid        REFERENCES traslados(id),
  cantidad        integer,
  detalle         jsonb
);

CREATE INDEX idx_movimientos_fecha ON movimientos(fecha DESC);
CREATE INDEX idx_movimientos_nota ON movimientos(nota_venta_id);
CREATE INDEX idx_movimientos_producto ON movimientos(producto_id);
CREATE INDEX idx_movimientos_importacion ON movimientos(importacion_id);

CREATE OR REPLACE FUNCTION fn_movimientos_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'movimientos es append-only: % no permitido', TG_OP;
END;
$$;

CREATE TRIGGER movimientos_append_only
  BEFORE UPDATE OR DELETE ON movimientos
  FOR EACH ROW EXECUTE FUNCTION fn_movimientos_append_only();

-- ═══════════════════════════════════════════════════════════════════════════
--  RLS: el backend usa service_role (salta RLS). Sin políticas, la anon key
--  pública no puede leer ni escribir. Solo notas_venta se lee desde el
--  navegador (Realtime de notificaciones).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE usuarios             ENABLE ROW LEVEL SECURITY;
ALTER TABLE pasillos             ENABLE ROW LEVEL SECURITY;
ALTER TABLE racks                ENABLE ROW LEVEL SECURITY;
ALTER TABLE posiciones_rack      ENABLE ROW LEVEL SECURITY;
ALTER TABLE productos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE importaciones        ENABLE ROW LEVEL SECURITY;
ALTER TABLE importacion_detalles ENABLE ROW LEVEL SECURITY;
ALTER TABLE lotes_inventario     ENABLE ROW LEVEL SECURITY;
ALTER TABLE notas_venta          ENABLE ROW LEVEL SECURITY;
ALTER TABLE nota_productos       ENABLE ROW LEVEL SECURITY;
ALTER TABLE despachos            ENABLE ROW LEVEL SECURITY;
ALTER TABLE devoluciones         ENABLE ROW LEVEL SECURITY;
ALTER TABLE devolucion_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE traslados            ENABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos          ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticado_lee_notas" ON notas_venta
  FOR SELECT TO authenticated USING (true);

ALTER PUBLICATION supabase_realtime ADD TABLE notas_venta;

-- Los proyectos Supabase nuevos no otorgan permisos automáticos a las tablas
-- creadas por SQL: sin esto el backend recibe 42501 permission denied.
GRANT USAGE ON SCHEMA public TO service_role, authenticated;
GRANT ALL ON ALL TABLES    IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES    TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO service_role;
GRANT SELECT ON notas_venta TO authenticated;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
--  Después de ejecutar: dar de alta tu usuario de Authentication en la app.
--  Reemplaza el email y ejecuta por separado.
-- ═══════════════════════════════════════════════════════════════════════════
-- INSERT INTO usuarios (id, nombre, rol)
-- SELECT id, 'Jorge Alvarez', 'admin' FROM auth.users WHERE email = 'TU_EMAIL_AQUI';
