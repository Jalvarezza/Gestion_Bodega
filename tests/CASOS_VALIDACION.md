# Plan de pruebas — Bloqueo de NV y Picking Masivo

Objetivo: demostrar que cuando un operador toma una **Nota de Venta** (NV Preparación) o un **producto de una OC** (Picking Masivo), ningún otro operador puede tomarlo al mismo tiempo, evitando inconsistencias de inventario.

## 1. Cómo ejecutar las pruebas automatizadas

| Comando | Qué ejecuta | Requisitos |
|---|---|---|
| `npm test` | Pruebas unitarias (34) | Ninguno (usa un Supabase simulado) |
| `npm run test:concurrencia` | Pruebas de concurrencia (15) contra la API real | `npm run dev` corriendo y `.env` con las claves de Supabase |
| `npm run test:reporte` | Todas las pruebas + reporte JUnit, HTML y cobertura | Igual que concurrencia |
| `npx vite preview --outDir tests/reportes/html` | Abre el reporte HTML en el navegador | Haber corrido `test:reporte` |

Las pruebas de concurrencia crean datos temporales con prefijo `TEST-CONC-` (una OC con 3 líneas y una NV) y los borran al terminar. Usan los dos primeros usuarios con rol operador y un admin existentes; no crean usuarios.

Reportes generados (no se suben a git):

- `tests/reportes/junit.xml` — resultado de cada prueba (formato estándar).
- `tests/reportes/html/index.html` — reporte navegable.
- `tests/reportes/cobertura/index.html` — cobertura de código.

## 2. Pruebas unitarias (lógica aislada)

| ID | Módulo | Caso | Resultado esperado |
|---|---|---|---|
| UP-PM-01 | Picking masivo | Operador toma línea libre | Éxito |
| UP-PM-02 | Picking masivo | Condición del UPDATE de bloqueo | Solo afecta líneas libres o ya tomadas por el mismo operador |
| UP-PM-03 | Picking masivo | Línea tomada por otro operador | `LINEA_TOMADA` con el nombre del operador |
| UP-PM-04 | Picking masivo | Línea ya resuelta | `LINEA_RESUELTA` |
| UP-PM-05 | Picking masivo | Admin / supervisor / validador intentan tomar | `UNAUTHORIZED`, sin modificar datos |
| UP-PM-06 | Picking masivo | Orden cancelada o completada | `CONFLICT_ESTADO_INVALIDO` |
| UP-PM-07 | Picking masivo | Liberar línea | Solo libera si la tiene el mismo operador |
| UP-PM-08 | Picking masivo | Otro operador registra picking en línea ajena | `LINEA_NO_TOMADA`, no descuenta stock |
| UP-PM-09 | Picking masivo | Producto escaneado incorrecto | `INVALID_PRODUCTO` |
| UP-PM-10 | Picking masivo | Cantidad mayor a lo solicitado | `EXCEDE_SOLICITADO` |
| UP-PM-11 | Picking masivo | Parcial sin motivo | `COMENTARIO_REQUERIDO` |
| UP-PM-12 | Picking masivo | Rack incorrecto | `UBICACION_INCORRECTA` |
| UP-PM-13 | Picking masivo | Producto sin stock ubicado | `SIN_UBICACION` |
| UP-PM-14 | Picking masivo | Picking en orden no activa | `CONFLICT_ESTADO_INVALIDO` |
| UP-NV-01 | NV Preparación | Operador toma NV pendiente | Usa la RPC atómica `tomar_nota` |
| UP-NV-02 | NV Preparación | NV en preparación por otro operador | `NOTA_TOMADA` con su nombre, sin intentar bloquear |
| UP-NV-03 | NV Preparación | Dos operadores compiten y la RPC devuelve `false` | El perdedor recibe `NOTA_TOMADA`, no registra movimiento |
| UP-NV-04 | NV Preparación | Mismo operador retoma su NV | Éxito sin volver a bloquear |
| UP-NV-05 | NV Preparación | Admin / supervisor / validador intentan tomar | `UNAUTHORIZED` |
| UP-NV-06 | NV Preparación | NV completa, despachada o anulada | `CONFLICT_ESTADO_INVALIDO` |
| UP-FIFO-01..04 | Picking masivo | Plan de extracción FIFO | Orden por fecha de ingreso, sin exceder stock ni lo pedido |
| UP-XLS-01..04 | Picking masivo | Lectura del Excel de la OC | Columnas, N° de OC, filas inválidas y archivo sin columnas |
| UP-API-01..06 | Picking masivo | Validación de entrada de la API | 400 / 405 ante datos inválidos |

## 3. Pruebas de concurrencia (integración contra la API real)

| ID | Caso | Resultado esperado |
|---|---|---|
| CC-PM-01 | 20 rondas: 2 operadores envían 6 solicitudes simultáneas para la misma línea | En cada ronda un único operador queda como dueño; el resto recibe 409 `LINEA_TOMADA` |
| CC-PM-02 | Operador B intenta tomar línea de A | 409 con el nombre de A |
| CC-PM-03 | Operador A retoma su línea | Éxito, sigue siendo de A |
| CC-PM-04 | Operador B intenta liberar línea de A | La línea sigue siendo de A |
| CC-PM-05 | A libera, B toma | B queda como dueño |
| CC-PM-06 | Línea sin actividad por más de 10 minutos | Se libera automáticamente y B puede tomarla |
| CC-PM-07 | A y B toman líneas distintas al mismo tiempo | Ambos lo logran (sin bloqueos falsos) |
| CC-PM-08 | Admin intenta tomar | 403, la línea sigue libre |
| CC-PM-09 | Tiempo de respuesta de "Tomar" (10 muestras) | Máximo < 2 s |
| CC-NV-01 | 20 rondas: 6 solicitudes simultáneas sobre `tomar_nota` | Exactamente 1 éxito por ronda |
| CC-NV-02 | Operador B intenta tomar NV de A por API | 409 `NOTA_TOMADA` con el nombre de A |
| CC-NV-03 | 5 intentos simultáneos de B por API | Todos 409, la NV sigue siendo de A |
| CC-NV-04 | Operador A retoma su NV | 200 |
| CC-NV-05 | Admin intenta tomar NV | 403, la NV sigue pendiente |
| CC-NV-06 | Tiempo de respuesta al tomar NV (10 muestras) | Máximo < 2 s |

> En NV, la carrera se ejecuta sobre la función `tomar_nota` de la base (la misma que usa la API), porque una toma exitosa por API registra un movimiento en una tabla de solo inserción que no se puede borrar después de la prueba.

## 4. Pruebas de validación (aceptación manual con dos dispositivos)

Preparación: dos tablets o dos navegadores (uno en ventana privada), cada uno con un usuario operador distinto (Operador A y Operador B), y un tercer navegador con un admin.

| ID | Requisito | Precondición | Pasos | Resultado esperado | Resultado obtenido | Evidencia |
|---|---|---|---|---|---|---|
| CV-01 | NV bloqueada en tiempo real | NV pendiente visible para A y B | 1. A presiona "Iniciar picking" en la NV. 2. B observa la lista sin recargar | B ve la NV bloqueada con el nombre de A en menos de 2 s | | |
| CV-02 | NV no se puede tomar dos veces | CV-01 realizado | B intenta abrir/iniciar la misma NV | Mensaje "Esta nota ya está siendo preparada por A" | | |
| CV-03 | Producto de OC bloqueado en tiempo real | OC activa visible para A y B | 1. A presiona "Tomar" en un producto. 2. B observa la lista | B ve el producto atenuado con "🔒 A", sin botón Tomar | | |
| CV-04 | Producto no se puede tomar dos veces | Ambos con el mismo producto libre en pantalla | A y B presionan "Tomar" casi al mismo tiempo | Solo uno lo obtiene; el otro ve "Esta línea la está preparando …" | | |
| CV-05 | Liberar devuelve el producto | A tiene un producto tomado | A presiona "Soltar" | B ve el producto libre y puede tomarlo | | |
| CV-06 | Liberar mis tareas | A tiene 2 o más productos tomados | A presiona "Liberar mis tareas" | Todos quedan libres para B | | |
| CV-07 | Admin ve quién trabaja | A tiene un producto tomado | Admin abre el detalle de la OC | "Operadores en zona (1)" con el nombre de A y el producto con 🔒 A | | |
| CV-08 | Validación de rack | A inicia picking de un producto | Escanea un rack distinto al indicado | "Ubicación incorrecta. Por favor, diríjase al rack asignado" y no descuenta stock | | |
| CV-09 | Validación de producto | Rack correcto validado | Escanea otro código de barras | "Producto incorrecto…" y no descuenta stock | | |
| CV-10 | Cantidad máxima | Producto validado | Ingresa más unidades que las pendientes | Mensaje de error, no registra | | |
| CV-11 | Picking parcial con motivo | Producto validado | Ingresa menos unidades y confirma | Pide motivo; al ingresarlo la línea queda "Parcial" | | |
| CV-12 | Stock consistente | Producto con stock conocido | Completa el picking | El stock del lote baja exactamente lo pickeado (verificar en Búsqueda / Mapa) | | |
| CV-13 | Liberación por abandono | A toma un producto y no hace nada | Esperar 10 minutos y recargar en B | El producto vuelve a estar libre | | |
| CV-14 | Tiempo de respuesta | OC activa | A presiona "Tomar" y cronometra | El producto aparece como tomado en menos de 2 s | | |

## 5. Resultados obtenidos en la ejecución automatizada

Completar con la salida de `npm run test:reporte` (fecha, total de pruebas, aprobadas, tiempos medidos en CC-PM-09 y CC-NV-06, y distribución de ganadores en CC-PM-01 y CC-NV-01).
