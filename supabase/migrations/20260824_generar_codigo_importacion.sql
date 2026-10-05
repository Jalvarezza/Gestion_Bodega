-- Función atómica para generar el siguiente código de importación.
-- Usa pg_advisory_xact_lock para serializar llamadas concurrentes del mismo año,
-- eliminando la race condition donde dos admins generan el mismo código (H4).
CREATE OR REPLACE FUNCTION generar_codigo_importacion(p_año integer)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefijo text;
  v_ultimo  integer;
  v_codigo  text;
BEGIN
  v_prefijo := 'IMP-' || p_año || '-';

  -- Bloqueo a nivel de transacción para este año en particular.
  -- Dos llamadas concurrentes para el mismo año quedan serializadas.
  PERFORM pg_advisory_xact_lock(hashtext(v_prefijo));

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(codigo FROM LENGTH(v_prefijo) + 1) AS integer)),
    0
  )
  INTO v_ultimo
  FROM importaciones
  WHERE codigo LIKE v_prefijo || '%';

  v_codigo := v_prefijo || LPAD((v_ultimo + 1)::text, 4, '0');
  RETURN v_codigo;
END;
$$;
