-- Función atómica para incrementar cantidad_recibida en un detalle de importación.
-- La suma y la validación ocurren en un único UPDATE, eliminando la race condition
-- donde dos tablets leen el mismo pendiente y ambas pasan la validación (H7).
CREATE OR REPLACE FUNCTION incrementar_cantidad_recibida(p_detalle_id uuid, p_cantidad integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_nueva_recibida  integer;
  v_cantidad_esperada integer;
  v_estado          text;
BEGIN
  UPDATE importacion_detalles
  SET
    cantidad_recibida = cantidad_recibida + p_cantidad,
    estado = CASE
      WHEN (cantidad_recibida + p_cantidad) >= cantidad_esperada THEN 'completa'
      ELSE 'parcial'
    END
  WHERE id = p_detalle_id
    AND (cantidad_recibida + p_cantidad) <= cantidad_esperada
  RETURNING cantidad_recibida, cantidad_esperada, estado
  INTO v_nueva_recibida, v_cantidad_esperada, v_estado;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cantidad_excede');
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'nueva_recibida',  v_nueva_recibida,
    'esperada',        v_cantidad_esperada,
    'estado',          v_estado,
    'restante',        v_cantidad_esperada - v_nueva_recibida
  );
END;
$$;
