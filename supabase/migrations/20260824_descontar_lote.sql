-- Función atómica para descontar stock de un lote.
-- Realiza la resta en la BD en un único UPDATE, eliminando la condición de carrera
-- que ocurre cuando dos tablets leen el mismo lote y ambas escriben el mismo valor.
CREATE OR REPLACE FUNCTION descontar_lote(p_lote_id uuid, p_cantidad integer)
RETURNS jsonb
LANGUAGE plpgsql
AS $$
DECLARE
  v_cantidad_nueva integer;
BEGIN
  UPDATE lotes_inventario
  SET
    cantidad = GREATEST(0, cantidad - p_cantidad),
    activo   = (cantidad - p_cantidad) > 0
  WHERE id = p_lote_id
    AND cantidad >= p_cantidad
  RETURNING cantidad INTO v_cantidad_nueva;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'stock_insuficiente');
  END IF;

  RETURN jsonb_build_object('ok', true, 'cantidad_nueva', v_cantidad_nueva);
END;
$$;
