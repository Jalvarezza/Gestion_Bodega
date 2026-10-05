-- Picking Masivo v2 — ajustes operativos
-- Ejecutar en Supabase SQL Editor

-- 1. lote_id y posicion_id dejan de ser NOT NULL (no hay stock cargado aún)
ALTER TABLE subtareas_picking_masivo ALTER COLUMN lote_id     DROP NOT NULL;
ALTER TABLE subtareas_picking_masivo ALTER COLUMN posicion_id DROP NOT NULL;

-- 2. Columnas adicionales en ítems para barcode y LPN
ALTER TABLE items_picking_masivo
  ADD COLUMN IF NOT EXISTS codigo_barra text,
  ADD COLUMN IF NOT EXISTS lpn          text;

-- 3. Nueva acción de edición de parcial: no se necesita objeto SQL extra
--    (se actualiza directamente via UPDATE en el service con service_role)
