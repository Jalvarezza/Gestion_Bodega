-- Notas de venta de prueba A, B y C para la demostración del primer proceso funcional.
-- Ejecutar en el SQL Editor de Supabase. Puede ejecutarse más de una vez sin duplicar datos.

DO $$
DECLARE
  v_admin uuid := (SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1);
  v_nota  uuid;
  r       record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('900001', 'Cliente Prueba A', '11.111.111-1', 'EK-AA10A-B',   10),
      ('900001', 'Cliente Prueba A', '11.111.111-1', 'EK-AT10A-N',    5),
      ('900002', 'Cliente Prueba B', '22.222.222-2', 'AG/PR6110',    20),
      ('900002', 'Cliente Prueba B', '22.222.222-2', 'CG001-WA',     15),
      ('900003', 'Cliente Prueba C', '33.333.333-3', 'HX-EC416A-20',  2),
      ('900003', 'Cliente Prueba C', '33.333.333-3', 'EK-IV2A',       8)
    ) AS t(numero, cliente, rut, sku, cantidad)
  LOOP
    INSERT INTO notas_venta (numero_nota, nombre_cliente, rut_cliente, importado_por, estado, archivo_nombre)
    VALUES (r.numero, r.cliente, r.rut, v_admin, 'pendiente', 'seed_notas_prueba.sql')
    ON CONFLICT (numero_nota) DO NOTHING;

    SELECT id INTO v_nota FROM notas_venta WHERE numero_nota = r.numero;

    INSERT INTO nota_productos (nota_venta_id, producto_id, cantidad_solicitada)
    SELECT v_nota, p.id, r.cantidad
    FROM productos p
    WHERE p.sku = r.sku
      AND NOT EXISTS (
        SELECT 1 FROM nota_productos np
        WHERE np.nota_venta_id = v_nota AND np.producto_id = p.id
      );
  END LOOP;
END $$;

-- Evidencia: notas con su cantidad de productos
SELECT n.numero_nota, n.nombre_cliente, n.estado,
       count(np.id) AS productos, n.created_at
FROM notas_venta n
LEFT JOIN nota_productos np ON np.nota_venta_id = n.id
GROUP BY n.id
ORDER BY n.created_at;
