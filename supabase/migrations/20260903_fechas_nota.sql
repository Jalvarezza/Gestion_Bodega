-- Fechas de preparación y despacho directamente en notas_venta
ALTER TABLE notas_venta
  ADD COLUMN IF NOT EXISTS fecha_preparacion timestamptz,
  ADD COLUMN IF NOT EXISTS fecha_despacho    timestamptz;
