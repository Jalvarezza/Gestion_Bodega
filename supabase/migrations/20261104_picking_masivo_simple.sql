-- Picking masivo por orden de compra (OC en Excel).
-- sesiones_picking_masivo = cabecera de la OC; items_picking_masivo = sus líneas.
-- Cada línea se bloquea para un operador (tomado_por) y varios operadores trabajan la misma OC en paralelo.
-- Ejecutar después de 20260825_picking_masivo*.sql.

BEGIN;

ALTER TABLE items_picking_masivo
  ADD COLUMN IF NOT EXISTS tomado_por      uuid REFERENCES usuarios(id),
  ADD COLUMN IF NOT EXISTS tomado_en       timestamptz,
  ADD COLUMN IF NOT EXISTS codigo_cliente  text;

CREATE INDEX IF NOT EXISTS idx_items_pm_tomado ON items_picking_masivo (estado, tomado_en);
CREATE INDEX IF NOT EXISTS idx_sesiones_pm_oc  ON sesiones_picking_masivo (numero_oc);

-- Lectura desde el navegador para Realtime (las escrituras van por la API con service_role)
ALTER TABLE sesiones_picking_masivo ENABLE ROW LEVEL SECURITY;
ALTER TABLE items_picking_masivo    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "autenticado_lee_sesiones_pm" ON sesiones_picking_masivo;
CREATE POLICY "autenticado_lee_sesiones_pm" ON sesiones_picking_masivo
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "autenticado_lee_items_pm" ON items_picking_masivo;
CREATE POLICY "autenticado_lee_items_pm" ON items_picking_masivo
  FOR SELECT TO authenticated USING (true);

GRANT SELECT ON sesiones_picking_masivo, items_picking_masivo TO authenticated;
GRANT ALL    ON sesiones_picking_masivo, items_picking_masivo TO service_role;

COMMIT;
