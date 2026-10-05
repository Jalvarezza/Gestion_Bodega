-- ═══════════════════════════════════════════════════════════════════════════
-- WAVE PICKING — Imperial & Construmart
-- Tablas separadas del flujo Sodimac (sesiones_picking_masivo)
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Cabecera de la ola ────────────────────────────────────────────────────
CREATE TABLE olas_picking (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  proveedor           TEXT        NOT NULL CHECK (proveedor IN ('imperial', 'construmart')),
  archivo_nombre      TEXT        NOT NULL,
  estado              TEXT        NOT NULL DEFAULT 'validando'
                                  CHECK (estado IN (
                                    'validando',
                                    'en_extraccion',
                                    'en_preparacion',
                                    'completada',
                                    'despachada',
                                    'cancelada'
                                  )),
  total_lineas        INT         NOT NULL DEFAULT 0,
  creado_por          UUID        NOT NULL REFERENCES usuarios(id),
  creado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  activada_en         TIMESTAMPTZ,
  completada_en       TIMESTAMPTZ,
  despachado_en       TIMESTAMPTZ,
  despachado_por      UUID        REFERENCES usuarios(id),
  nombre_chofer       TEXT
);

-- ── 2. Órdenes de compra dentro de la ola ───────────────────────────────────
-- Un archivo puede contener N órdenes distintas (Núm. Orden / N° OC)
CREATE TABLE ola_ordenes (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ola_id              UUID        NOT NULL REFERENCES olas_picking(id) ON DELETE CASCADE,
  numero_orden        TEXT        NOT NULL,
  numero_guia         TEXT,                    -- Construmart: columna "Guia"
  nombre_tienda       TEXT                     -- agrupación opcional
);

CREATE INDEX idx_ola_ordenes_ola ON ola_ordenes(ola_id);

-- ── 3. Líneas de la ola ──────────────────────────────────────────────────────
-- Cada fila del Excel = 1 línea.
-- Un LPN puede repetirse si contiene múltiples productos (caso Construmart).
-- Fase 2: operador escanea LPN → se marcan todas las líneas de ese LPN.
-- Fase 3: supervisor escanea LPN → validación final antes del despacho.
CREATE TABLE ola_lineas (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ola_id              UUID        NOT NULL REFERENCES olas_picking(id) ON DELETE CASCADE,
  orden_id            UUID        NOT NULL REFERENCES ola_ordenes(id)  ON DELETE CASCADE,

  -- Datos del Excel
  lpn                 TEXT        NOT NULL,
  posicion_orden      INT,                     -- Construmart: columna "Posición"
  codigo_barra        TEXT,                    -- EAN13 / DUN14
  codigo_proveedor    TEXT,                    -- PLU SAP (Construmart) / cod. interno Imperial
  sku_proveedor       TEXT,                    -- Cod. Proveedor / SKU propio
  producto_id         UUID        REFERENCES productos(id),  -- NULL si no está en catálogo
  descripcion         TEXT        NOT NULL,
  tienda              TEXT,                    -- Nombre Local Destino
  cantidad_solicitada INT         NOT NULL CHECK (cantidad_solicitada > 0),

  -- Fase 2: asignación de LPN en zona de preparación
  fase2_escaneado     BOOLEAN     NOT NULL DEFAULT false,
  fase2_por           UUID        REFERENCES usuarios(id),
  fase2_en            TIMESTAMPTZ,

  -- Fase 3: validación supervisor antes de despacho
  fase3_validado      BOOLEAN     NOT NULL DEFAULT false,
  fase3_por           UUID        REFERENCES usuarios(id),
  fase3_en            TIMESTAMPTZ
);

CREATE INDEX idx_ola_lineas_ola         ON ola_lineas(ola_id);
CREATE INDEX idx_ola_lineas_orden       ON ola_lineas(orden_id);
CREATE INDEX idx_ola_lineas_lpn         ON ola_lineas(ola_id, lpn);
CREATE INDEX idx_ola_lineas_producto    ON ola_lineas(producto_id) WHERE producto_id IS NOT NULL;

-- ── 4. Tareas de extracción consolidadas (Fase 1) ────────────────────────────
-- 1 tarea por SKU único en la ola.
-- cantidad_total = suma de todas las líneas con ese código en toda la ola.
-- ruta_sugerida  = posiciones FIFO calculadas al activar (solo orientación al operador).
-- lotes_descontados = auditoría de qué lotes se descontaron al confirmar.
CREATE TABLE ola_tareas_extraccion (
  id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  ola_id              UUID        NOT NULL REFERENCES olas_picking(id) ON DELETE CASCADE,
  producto_id         UUID        REFERENCES productos(id),   -- NULL si sin catálogo
  codigo_barra        TEXT,
  descripcion         TEXT        NOT NULL,
  cantidad_total      INT         NOT NULL CHECK (cantidad_total > 0),
  cantidad_extraida   INT         NOT NULL DEFAULT 0,
  ruta_sugerida       JSONB,
  -- Ejemplo ruta_sugerida:
  -- [
  --   { "posicion_codigo": "A-R2-3-B", "lote_id": "uuid", "cantidad": 40 },
  --   { "posicion_codigo": "B-R1-2-A", "lote_id": "uuid", "cantidad": 30 }
  -- ]
  estado              TEXT        NOT NULL DEFAULT 'libre'
                                  CHECK (estado IN ('libre', 'bloqueado', 'completado')),
  bloqueado_por       UUID        REFERENCES usuarios(id),
  bloqueado_en        TIMESTAMPTZ,
  completado_por      UUID        REFERENCES usuarios(id),
  completado_en       TIMESTAMPTZ,
  lotes_descontados   JSONB
  -- Ejemplo lotes_descontados:
  -- [
  --   { "lote_id": "uuid", "posicion_codigo": "A-R2-3-B", "cantidad": 40 },
  --   { "lote_id": "uuid", "posicion_codigo": "B-R1-2-A", "cantidad": 30 }
  -- ]
);

CREATE INDEX idx_ola_tareas_ola         ON ola_tareas_extraccion(ola_id);
CREATE INDEX idx_ola_tareas_estado      ON ola_tareas_extraccion(ola_id, estado);
CREATE INDEX idx_ola_tareas_producto    ON ola_tareas_extraccion(producto_id) WHERE producto_id IS NOT NULL;


-- ═══════════════════════════════════════════════════════════════════════════
-- TRIGGER: auto-avanzar estado de la ola
-- ═══════════════════════════════════════════════════════════════════════════

-- Al completar todas las tareas de extracción → ola pasa a 'en_preparacion'
CREATE OR REPLACE FUNCTION fn_avanzar_ola_desde_extraccion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ola_id UUID;
  v_pendientes INT;
BEGIN
  v_ola_id := NEW.ola_id;

  IF NEW.estado = 'completado' THEN
    SELECT COUNT(*) INTO v_pendientes
    FROM ola_tareas_extraccion
    WHERE ola_id = v_ola_id AND estado <> 'completado';

    IF v_pendientes = 0 THEN
      UPDATE olas_picking
      SET estado = 'en_preparacion'
      WHERE id = v_ola_id AND estado = 'en_extraccion';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_avanzar_ola_extraccion
AFTER UPDATE ON ola_tareas_extraccion
FOR EACH ROW EXECUTE FUNCTION fn_avanzar_ola_desde_extraccion();


-- Al completar fase2 en todas las líneas → ola pasa a 'completada'
CREATE OR REPLACE FUNCTION fn_avanzar_ola_desde_preparacion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_ola_id UUID;
  v_pendientes INT;
BEGIN
  v_ola_id := NEW.ola_id;

  IF NEW.fase2_escaneado = true THEN
    SELECT COUNT(*) INTO v_pendientes
    FROM ola_lineas
    WHERE ola_id = v_ola_id AND fase2_escaneado = false;

    IF v_pendientes = 0 THEN
      UPDATE olas_picking
      SET estado = 'completada', completada_en = now()
      WHERE id = v_ola_id AND estado = 'en_preparacion';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_avanzar_ola_preparacion
AFTER UPDATE ON ola_lineas
FOR EACH ROW EXECUTE FUNCTION fn_avanzar_ola_desde_preparacion();


-- ═══════════════════════════════════════════════════════════════════════════
-- RLS (misma política que el resto del sistema)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE olas_picking          ENABLE ROW LEVEL SECURITY;
ALTER TABLE ola_ordenes           ENABLE ROW LEVEL SECURITY;
ALTER TABLE ola_lineas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE ola_tareas_extraccion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "autenticado_todo" ON olas_picking
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "autenticado_todo" ON ola_ordenes
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "autenticado_todo" ON ola_lineas
  FOR ALL TO authenticated USING (true) WITH CHECK (true);

CREATE POLICY "autenticado_todo" ON ola_tareas_extraccion
  FOR ALL TO authenticated USING (true) WITH CHECK (true);
