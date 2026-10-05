-- Picking Masivo v3 — flujo de despacho Imperial
-- Ejecutar en Supabase SQL Editor

-- 1. Nuevo estado 'despachado' en sesiones
ALTER TABLE sesiones_picking_masivo
  DROP CONSTRAINT IF EXISTS sesiones_picking_masivo_estado_check;

ALTER TABLE sesiones_picking_masivo
  ADD CONSTRAINT sesiones_picking_masivo_estado_check
  CHECK (estado IN ('validando','activa','completada','despachado','cancelada'));

-- 2. Columnas de despacho en sesiones
ALTER TABLE sesiones_picking_masivo
  ADD COLUMN IF NOT EXISTS nombre_chofer  text,
  ADD COLUMN IF NOT EXISTS despachado_en  timestamptz,
  ADD COLUMN IF NOT EXISTS despachado_por uuid REFERENCES auth.users(id);

-- 3. Rastreo de validación LPN por ítem
ALTER TABLE items_picking_masivo
  ADD COLUMN IF NOT EXISTS lpn_validado    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS lpn_validado_en timestamptz;
