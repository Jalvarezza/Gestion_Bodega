-- Agregar nombre_chofer a notas_venta para recuperarlo sin join
ALTER TABLE notas_venta
  ADD COLUMN IF NOT EXISTS nombre_chofer text;
