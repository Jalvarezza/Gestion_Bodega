-- Función: incrementar_stock_producto
-- Uso: llamada desde ingresosService tras registrar lotes
-- Incrementa stock_total de forma atómica para evitar race conditions

CREATE OR REPLACE FUNCTION incrementar_stock_producto(
  p_producto_id UUID,
  p_cantidad     INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  UPDATE productos
  SET
    stock_total = stock_total + p_cantidad,
    updated_at  = NOW()
  WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_producto_id;
  END IF;
END;
$$;
