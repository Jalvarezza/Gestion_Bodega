-- ═══════════════════════════════════════════════════════════════════════════════
-- PICKING MASIVO — tablas, índices, trigger y función RPC
-- ═══════════════════════════════════════════════════════════════════════════════

-- ── 1. sesiones_picking_masivo ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sesiones_picking_masivo (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  numero_oc       text        NOT NULL,
  nombre_cliente  text,
  archivo_nombre  text,
  estado          text        NOT NULL DEFAULT 'validando'
                              CHECK (estado IN ('validando','activa','completada','cancelada')),
  total_items     integer     NOT NULL DEFAULT 0,
  items_completados integer   NOT NULL DEFAULT 0,
  creado_por      uuid        REFERENCES auth.users(id),
  creado_en       timestamptz NOT NULL DEFAULT now(),
  activada_en     timestamptz,
  completada_en   timestamptz
);

-- ── 2. items_picking_masivo ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS items_picking_masivo (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  sesion_id           uuid        NOT NULL REFERENCES sesiones_picking_masivo(id) ON DELETE CASCADE,
  producto_id         uuid        REFERENCES productos(id),
  codigo              text        NOT NULL,
  descripcion         text        NOT NULL,
  cantidad_pedida     integer     NOT NULL,
  cantidad_despachada integer     NOT NULL DEFAULT 0,
  estado              text        NOT NULL DEFAULT 'libre'
                                  CHECK (estado IN ('libre','en_progreso','completado','parcial','sin_stock')),
  motivo_diferencia   text
);

-- ── 3. subtareas_picking_masivo ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS subtareas_picking_masivo (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id             uuid        NOT NULL REFERENCES items_picking_masivo(id) ON DELETE CASCADE,
  sesion_id           uuid        NOT NULL REFERENCES sesiones_picking_masivo(id) ON DELETE CASCADE,
  lote_id             uuid        REFERENCES lotes_inventario(id),
  posicion_id         uuid        REFERENCES posiciones_rack(id),
  posicion_codigo     text        NOT NULL,
  orden_fifo          integer     NOT NULL,
  cantidad_asignada   integer     NOT NULL,
  cantidad_despachada integer,
  estado              text        NOT NULL DEFAULT 'libre'
                                  CHECK (estado IN ('libre','bloqueado','completado','parcial','sin_stock')),
  bloqueado_por       uuid,
  bloqueado_en        timestamptz,
  completado_por      uuid,
  completado_en       timestamptz,
  motivo_diferencia   text,
  producto_real_id    uuid        REFERENCES productos(id),
  es_equivalente      boolean     NOT NULL DEFAULT false,
  movimiento_id       uuid        REFERENCES movimientos(id)
);

-- ── 4. Índices ────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_items_pm_sesion_estado
  ON items_picking_masivo (sesion_id, estado);

CREATE INDEX IF NOT EXISTS idx_subtareas_pm_item_fifo
  ON subtareas_picking_masivo (item_id, orden_fifo);

CREATE INDEX IF NOT EXISTS idx_subtareas_pm_sesion_estado
  ON subtareas_picking_masivo (sesion_id, estado);

CREATE INDEX IF NOT EXISTS idx_subtareas_pm_bloqueado_en
  ON subtareas_picking_masivo (bloqueado_en)
  WHERE estado = 'bloqueado';

-- ── 5. Trigger: sync_item_desde_subtarea ─────────────────────────────────────
-- Actualiza cantidad_despachada + estado del ítem padre cada vez que
-- una subtarea pasa a completado / parcial / sin_stock.
-- También actualiza items_completados + completada_en en la sesión.

CREATE OR REPLACE FUNCTION fn_sync_item_desde_subtarea()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE
  v_item_id           uuid;
  v_sesion_id         uuid;
  v_total_asignado    integer;
  v_total_despachado  integer;
  v_subtareas_pendientes integer;
  v_nuevo_estado_item text;
  v_items_completados integer;
  v_total_items       integer;
BEGIN
  v_item_id   := NEW.item_id;
  v_sesion_id := NEW.sesion_id;

  -- Solo actuar cuando la subtarea pasa a un estado terminal
  IF NEW.estado NOT IN ('completado','parcial','sin_stock') THEN
    RETURN NEW;
  END IF;

  -- Agregar totales de todas las subtareas del ítem
  SELECT
    COALESCE(SUM(cantidad_asignada), 0),
    COALESCE(SUM(COALESCE(cantidad_despachada, 0)), 0),
    COUNT(*) FILTER (WHERE estado IN ('libre','bloqueado'))
  INTO v_total_asignado, v_total_despachado, v_subtareas_pendientes
  FROM subtareas_picking_masivo
  WHERE item_id = v_item_id;

  -- Determinar estado del ítem solo si no quedan subtareas pendientes
  IF v_subtareas_pendientes = 0 THEN
    IF v_total_despachado = 0 THEN
      v_nuevo_estado_item := 'sin_stock';
    ELSIF v_total_despachado >= v_total_asignado THEN
      v_nuevo_estado_item := 'completado';
    ELSE
      v_nuevo_estado_item := 'parcial';
    END IF;
  ELSE
    v_nuevo_estado_item := 'en_progreso';
  END IF;

  UPDATE items_picking_masivo
  SET
    cantidad_despachada = v_total_despachado,
    estado              = v_nuevo_estado_item
  WHERE id = v_item_id;

  -- Actualizar contador de la sesión solo si el ítem acaba de completarse
  IF v_nuevo_estado_item IN ('completado','parcial','sin_stock') THEN
    SELECT
      COUNT(*) FILTER (WHERE estado IN ('completado','parcial','sin_stock')),
      total_items
    INTO v_items_completados, v_total_items
    FROM sesiones_picking_masivo s
    JOIN items_picking_masivo i ON i.sesion_id = s.id
    WHERE s.id = v_sesion_id
    GROUP BY s.total_items;

    UPDATE sesiones_picking_masivo
    SET
      items_completados = v_items_completados,
      estado            = CASE WHEN v_items_completados >= v_total_items THEN 'completada' ELSE estado END,
      completada_en     = CASE WHEN v_items_completados >= v_total_items THEN now() ELSE completada_en END
    WHERE id = v_sesion_id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_item_desde_subtarea ON subtareas_picking_masivo;
CREATE TRIGGER trg_sync_item_desde_subtarea
  AFTER INSERT OR UPDATE OF estado, cantidad_despachada
  ON subtareas_picking_masivo
  FOR EACH ROW
  EXECUTE FUNCTION fn_sync_item_desde_subtarea();

-- ── 6. RPC: liberar_subtareas_expiradas (TTL 3 min) ──────────────────────────
CREATE OR REPLACE FUNCTION liberar_subtareas_expiradas(p_sesion_id uuid)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE subtareas_picking_masivo
  SET
    estado        = 'libre',
    bloqueado_por = NULL,
    bloqueado_en  = NULL
  WHERE
    sesion_id    = p_sesion_id
    AND estado   = 'bloqueado'
    AND bloqueado_en < now() - interval '3 minutes';
END;
$$;

-- ── 7. Realtime ───────────────────────────────────────────────────────────────
ALTER PUBLICATION supabase_realtime ADD TABLE sesiones_picking_masivo;
ALTER PUBLICATION supabase_realtime ADD TABLE subtareas_picking_masivo;
ALTER PUBLICATION supabase_realtime ADD TABLE items_picking_masivo;
