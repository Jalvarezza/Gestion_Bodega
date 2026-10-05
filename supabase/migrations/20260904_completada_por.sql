-- Guardar quién completó la nota (no se borra al hacer completa)
ALTER TABLE notas_venta
  ADD COLUMN IF NOT EXISTS completada_por_id uuid REFERENCES usuarios(id);
