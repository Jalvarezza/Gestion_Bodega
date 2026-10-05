-- Función atómica para recalcular el estado de una importación.
-- Al ejecutar SELECT + UPDATE dentro de la misma transacción de BD, se elimina
-- la race condition donde dos admins leen detalles obsoletos y se sobreescriben (M4).
CREATE OR REPLACE FUNCTION recalcular_estado_importacion(p_importacion_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_nuevo_estado text;
BEGIN
  SELECT
    CASE
      WHEN COUNT(*) FILTER (WHERE estado != 'completa') = 0 THEN 'completa'
      WHEN COUNT(*) FILTER (WHERE estado != 'pendiente') > 0 THEN 'parcial'
      ELSE 'pendiente'
    END
  INTO v_nuevo_estado
  FROM importacion_detalles
  WHERE importacion_id = p_importacion_id;

  UPDATE importaciones
  SET estado = v_nuevo_estado
  WHERE id = p_importacion_id;
END;
$$;
