-- Columnas que olas.service.ts lee/escribe y que sql/wave_picking_tables.sql no crea.
-- Ejecutar después de sql/wave_picking_tables.sql.
ALTER TABLE olas_picking
  ADD COLUMN IF NOT EXISTS fecha_entrega date,
  ADD COLUMN IF NOT EXISTS total_ordenes integer NOT NULL DEFAULT 0;
