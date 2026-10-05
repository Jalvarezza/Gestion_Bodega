-- Función: decrementar_stock_producto
-- Uso: llamada desde salidasService y notasService tras despachar stock
-- Decrementa stock_total de forma atómica. El constraint cantidad_positiva
-- en lotes_inventario es la última barrera, pero esta función valida antes.

CREATE OR REPLACE FUNCTION decrementar_stock_producto(
  p_producto_id UUID,
  p_cantidad     INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_stock_actual INTEGER;
BEGIN
  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  SELECT stock_total INTO v_stock_actual
  FROM productos
  WHERE id = p_producto_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Producto no encontrado: %', p_producto_id;
  END IF;

  IF v_stock_actual < p_cantidad THEN
    RAISE EXCEPTION 'Stock insuficiente — stock actual: %, solicitado: %', v_stock_actual, p_cantidad;
  END IF;

  UPDATE productos
  SET
    stock_total = stock_total - p_cantidad,
    updated_at  = NOW()
  WHERE id = p_producto_id;
END;
$$;
