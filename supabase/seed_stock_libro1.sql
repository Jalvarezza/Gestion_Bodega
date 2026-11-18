-- Stock inicial (100-999 uds) y ubicación para los SKU de Libro1.xlsx.
-- Cada producto recibe un lote nuevo en una posición libre (orden pasillo, rack, nivel, posición).
-- Los SKU que no existan en productos se omiten. Ejecutar una sola vez.

BEGIN;

WITH datos(orden, sku, cantidad) AS (VALUES
  (1, 'AG/PR6101', 124),
  (2, 'AG/PR6102', 868),
  (3, 'AG/PR6103', 567),
  (4, 'AG/PR6104', 821),
  (5, 'AG/PR6105', 777),
  (6, 'AG/PR6106', 687),
  (7, 'AG/PR6110', 389),
  (8, 'AG/PR6032', 919),
  (9, 'AG/PR6033', 881),
  (10, 'AG/PR6034', 542),
  (11, 'AG/PR6035', 713),
  (12, 'AG/PR6036', 903),
  (13, 'AG/PR6037', 545),
  (14, 'AG/PR6003', 870),
  (15, 'AG/PR6004', 985),
  (16, 'AG/PR6005', 856),
  (17, 'AG/PR6006', 428),
  (18, 'AG/PR6007', 489),
  (19, 'AG/PR6008', 907),
  (20, '99251', 177),
  (21, '99303', 982),
  (22, '99247', 609),
  (23, '99248', 142),
  (24, '110531', 249),
  (25, '110232', 771),
  (26, '110233', 732),
  (27, '110300', 449),
  (28, '110251', 500),
  (29, '110246', 462),
  (30, '110247', 596),
  (31, '110248', 945),
  (32, '99231', 313),
  (33, '99531', 305),
  (34, '99232', 282),
  (35, '99233', 477),
  (36, '95300', 242),
  (37, '99236', 381),
  (38, '99245', 421),
  (39, '110231', 702),
  (40, '99246', 445),
  (41, '110236', 295),
  (42, '110245', 403),
  (43, 'HX-ATS10A-B', 934),
  (44, 'HX-ATS10A-N', 435),
  (45, 'HX-AT10A-B', 566),
  (46, 'HX-AT10A-N', 378),
  (47, 'HX-IV6A-B', 922),
  (48, 'HX-IV6A-N', 136),
  (49, 'HX-MV2P10A-B', 772),
  (50, 'HX-MV2P10A-N', 237),
  (51, 'HX-MV2PT10A-B', 435),
  (52, 'HX-MV2PT10A-N', 903),
  (53, 'HX-HV2PT10A-B', 126),
  (54, 'HX-HV2PT10A-N', 558),
  (55, 'HX-AM10A-B', 330),
  (56, '9452', 588),
  (57, '9431', 660),
  (58, '9631', 661),
  (59, '9432', 405),
  (60, '9433', 586),
  (61, '5503', 539),
  (62, '5502', 686),
  (63, '5501', 440),
  (64, '9300', 514),
  (65, '9236', 938),
  (66, '9245', 516),
  (67, '9246', 970),
  (68, '9248', 708),
  (69, '9247', 393),
  (70, '5245', 190),
  (71, '5248', 210),
  (72, '5313', 317),
  (73, '5231', 302),
  (74, '5531', 893),
  (75, '99136', 598),
  (76, 'HX-IVP-B', 642),
  (77, 'HX-IVP-N', 570),
  (78, 'HX-PLPE27C-B', 206),
  (79, 'HX-PLPE27P-B', 447),
  (80, 'HX-PLPE27P-N', 752),
  (81, 'HX-CCE', 455),
  (82, 'HX-LT-5', 251),
  (83, 'HX-OCHD', 609),
  (84, 'HX-ESS4-NA', 274),
  (85, 'HX-PLCE27C-B', 441),
  (86, 'HX-PLPE27B-B', 161),
  (87, 'HX-PLPE27B-N', 966),
  (88, 'HX-AA10A-B', 552),
  (89, 'HX-AA10A-N', 197),
  (90, 'HX-TS110A-B', 450),
  (91, 'HX-ESSA10-2', 823),
  (92, 'HX-ESSA2USB-2', 582),
  (93, 'HX-ESSA6PS-2', 120),
  (94, 'AG/PR6003M', 182),
  (95, 'AG/PR6006M', 414),
  (96, 'AG/PR6007M', 800),
  (97, 'AG/PR6036M', 244),
  (98, 'AG/PR6008M', 806),
  (99, 'AG/PR6037M', 294),
  (100, 'AG/PR6034M', 347),
  (101, 'AG/PR6035M', 663),
  (102, 'AG/PR6032M', 416),
  (103, 'AG/PR6004M', 230),
  (104, 'AG/PR6033M', 619),
  (105, 'AG/PR6005M', 752),
  (106, 'HX-EC416A-20', 928),
  (107, 'HX-EC416A-40', 525),
  (108, 'HX-EC416A-NA', 218),
  (109, 'HX-EP16A-10', 566),
  (110, 'HX-MVC2PT10A-B', 452),
  (111, 'HX-MVC2PT10A-N', 795),
  (112, 'HX-ES4USB2AC-3N', 560),
  (113, 'HX-MVC2P10A-B', 994),
  (114, 'HX-MVC2P10A-N', 872),
  (115, 'HX-ASPF10A-B', 478),
  (116, 'HX-MV2PT16A-N', 373),
  (117, 'HX-MVSCH90-N', 765),
  (118, 'HX-HV2PT1016A-N', 497),
  (119, 'HX-HV2PT1016A-B', 720),
  (120, 'HX-ES4USBC-3B', 832),
  (121, 'HX-UFO4USBC-5', 663),
  (122, 'BK-SAT-PC34', 760),
  (123, 'BK-ATP145', 379),
  (124, 'BK-SAT-PC56', 569),
  (125, 'BK-PC10', 958),
  (126, '99243', 392),
  (127, '99242', 183),
  (128, '99244', 902),
  (129, 'HX-PLPE27A-B', 766),
  (130, 'HX-PLPE27A-N', 273),
  (131, 'BK-PC20', 476),
  (132, '9249', 568),
  (133, 'UB-EC2CEE-40', 739),
  (134, 'UBEC1CEE2SCHNA', 145),
  (135, 'UB-TD2CEE4SCH2', 765),
  (136, 'UB-EILH-20', 805),
  (137, 'BK-FE4KIT1250', 216),
  (138, 'BK-FE4', 636)
),
prods AS (
  SELECT p.id AS producto_id, d.cantidad, row_number() OVER (ORDER BY d.orden) AS rn
  FROM datos d
  JOIN productos p ON p.sku = d.sku
),
libres AS (
  SELECT pr.id AS posicion_id, r.pasillo_id,
         row_number() OVER (ORDER BY split_part(pr.codigo, '-', 1),
                                     NULLIF(regexp_replace(split_part(pr.codigo, '-', 2), '[^0-9]', '', 'g'), '')::int,
                                     pr.nivel, pr.posicion) AS rn
  FROM posiciones_rack pr
  JOIN racks r ON r.id = pr.rack_id
  WHERE pr.activo AND NOT pr.ocupada
    AND NOT EXISTS (SELECT 1 FROM lotes_inventario l WHERE l.posicion_id = pr.id AND l.activo)
),
nuevos AS (
  INSERT INTO lotes_inventario (producto_id, posicion_id, pasillo_id, cantidad, fecha_ingreso, tipo_origen)
  SELECT p.producto_id, l.posicion_id, l.pasillo_id, p.cantidad, current_date, 'carga_inicial'
  FROM prods p
  JOIN libres l ON l.rn = p.rn
  RETURNING posicion_id
)
UPDATE posiciones_rack SET ocupada = true
WHERE id IN (SELECT posicion_id FROM nuevos);

COMMIT;

-- Verificación
SELECT p.sku, l.cantidad, pr.codigo AS ubicacion, p.stock_total
FROM lotes_inventario l
JOIN productos p ON p.id = l.producto_id
JOIN posiciones_rack pr ON pr.id = l.posicion_id
WHERE l.tipo_origen = 'carga_inicial' AND l.fecha_ingreso = current_date
ORDER BY pr.codigo;
