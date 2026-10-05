// Coordenadas físicas de cada rack, según el plano de bodega real
// ("Plano Bodega", confirmado con un recorte ampliado de Pasillo 2 el 27/07/2026).
// Vive solo en este archivo — si la bodega se rediseña, solo se edita esto.
// Todos los racks tienen la misma medida (BOX_W x BOX_H): es un mapa
// únicamente visual, no representa dimensiones reales de cada rack.
//
// Estructura confirmada por pasillo ("sándwich"), de arriba hacia abajo:
//   [bloque superior propio: 3-2-1 / 18-17-16]
//   [columna lateral propia + su etiqueta "Pasillo N"]
//   [bloque inferior propio: 7-8-9 / 10-11-12]
// El pasillo siguiente empieza inmediatamente con SU PROPIO bloque
// superior — por eso el R1 de un pasillo queda pegado, en la misma
// columna vertical, justo debajo del R1 del pasillo anterior (el bloque
// inferior de ESTE pasillo, con R9, queda más abajo, después de su propia
// columna — no entre los dos R1).

export type RackLayout = {
  codigo: string // debe coincidir EXACTO con racks.codigo en Supabase
  x: number
  y: number
  width: number
  height: number
}

export type PasilloLayout = {
  codigo: string
  labelX: number
  labelY: number
  direccion: 'down' | 'up' | 'left' | 'right'
}

export const BODEGA_VIEWBOX = { width: 400, height: 750 }

const BOX_W = 28
const BOX_H = 26
const GAP_X = BOX_W + 2   // 30 — separación horizontal entre racks de un mismo bloque
const GAP_Y = BOX_H + 2   // 28 — separación vertical entre racks de una misma columna
const HEADER_HEIGHT = 80  // título del plano
const AISLE_GAP = 0       // sin separación entre el bloque y la columna — quedan pegados, como en la foto

// Posiciones Y (relativas al inicio de cada franja) de cada elemento,
// pegadas con solo AISLE_GAP entre bloque y columna:
const COL_Y0_GRANDE = BOX_H + AISLE_GAP                              // 26 — tras el bloque superior
const BLOCK_INF_Y   = COL_Y0_GRANDE + GAP_Y * 2 + BOX_H + AISLE_GAP  // 108 — tras la columna (3 filas, P2-P4)
const BLOCK_INF_Y_CHICA = COL_Y0_GRANDE + GAP_Y + BOX_H + AISLE_GAP  // 80 — tras la columna (2 filas, P5-P6)
const BLOCK_P1_Y    = GAP_Y + BOX_H + AISLE_GAP                      // 54 — tras la columna de P1 (2 filas)

// Alto de cada franja (P1..P6): P1 no tiene bloque superior propio (sus
// racks 6-13 están en la fila especial contra el muro, ver
// `filaSuperiorP1`); P2-P6 tienen columna de 2 filas (R4,R5), por eso
// todas miden 106.
const BAND_HEIGHTS = [80, 106, 106, 106, 106, 106]
const BAND_GAP = 6 // pequeña separación entre el bloque de un pasillo y el bloque del siguiente

function bandStart(index: number): number {
  let y = HEADER_HEIGHT + BOX_H // pegado a la fila superior (RACK 6-13), sin espacio muerto
  for (let i = 0; i < index; i++) y += BAND_HEIGHTS[i] + BAND_GAP
  return y
}

const COL_LEFT_X = 15    // columna lateral izquierda (pegada al muro)
const COL_RIGHT_X = 330  // columna lateral derecha (pegada al muro)
const BLOQUE_ANCHO = GAP_X * 2 + BOX_W // 88 — ancho de un bloque de 3 racks

// El bloque queda PEGADO a su columna (sin espacio entre ellos) — el
// pasillo (aisle) real es el hueco central, entre el bloque izquierdo y
// el derecho, donde va la etiqueta "Pasillo N", no el espacio junto a
// la columna.
const LEFT_X0 = COL_LEFT_X + BOX_W                 // 43 — bloque izquierdo, pegado a su columna
const RIGHT_X0 = COL_RIGHT_X - BLOQUE_ANCHO        // 242 — bloque derecho, pegado a su columna

function box(pasillo: string, numero: number, x: number, y: number, bandStartY: number): [string, RackLayout] {
  const codigo = `${pasillo}-R${numero}`
  return [codigo, { codigo, x, y: bandStartY + y, width: BOX_W, height: BOX_H }]
}

/**
 * Pasillo 1 — caso especial: es el único contra el muro superior, sin
 * pasillo previo del que "heredar" un bloque superior. Sus racks 6-13
 * forman la fila especial `filaSuperiorP1` contra el muro; los 6 que
 * faltan para completar 18 (1,2,3,16,17,18) van en el único bloque de su
 * franja, ubicado después de su columna (no tiene bloque inferior propio:
 * los números 7-12 ya se usaron en la fila superior).
 */
function filaSuperiorP1(y: number): Record<string, RackLayout> {
  // R5 ligeramente corrido a la derecha (desde LEFT_X0), R6-R13 distribuidos hasta COL_RIGHT_X
  const r5: [string, RackLayout] = box('A', 5, LEFT_X0, y, 0)
  const numerosResto = [6, 7, 8, 9, 10, 11, 12, 13]
  const x0   = LEFT_X0 + GAP_X
  const xFin = COL_RIGHT_X
  const gap  = (xFin - x0 - BOX_W) / (numerosResto.length - 1)
  const resto = numerosResto.map((n, i) => box('A', n, x0 + i * gap, y, 0))
  return Object.fromEntries([r5, ...resto])
}

function pasillo1(bandStartY: number): Record<string, RackLayout> {
  // R4 con altura extendida hasta tocar la esquina superior de R3
  const r4: [string, RackLayout] = [
    'A-R4',
    { codigo: 'A-R4', x: COL_LEFT_X, y: bandStartY, width: BOX_W, height: BLOCK_P1_Y },
  ]
  return Object.fromEntries([
    r4,
    // columna lateral derecha: R14, R15
    box('A', 14, COL_RIGHT_X, 0, bandStartY),
    box('A', 15, COL_RIGHT_X, GAP_Y, bandStartY),
    // bloque inferior izquierdo
    box('A', 3, LEFT_X0, BLOCK_P1_Y, bandStartY),
    box('A', 2, LEFT_X0 + GAP_X, BLOCK_P1_Y, bandStartY),
    box('A', 1, LEFT_X0 + GAP_X * 2, BLOCK_P1_Y, bandStartY),
    // bloque inferior derecho: misma X que el bloque superior de B/C/D
    box('A', 19, COL_RIGHT_X - GAP_X * 4, BLOCK_P1_Y, bandStartY),
    box('A', 18, COL_RIGHT_X - GAP_X * 3, BLOCK_P1_Y, bandStartY),
    box('A', 17, COL_RIGHT_X - GAP_X * 2, BLOCK_P1_Y, bandStartY),
    box('A', 16, COL_RIGHT_X - GAP_X,     BLOCK_P1_Y, bandStartY),
  ])
}

/**
 * Pasillos 2, 3 y 4 (18 racks c/u) — estructura:
 *   [bloque superior: R3-R2-R1 (muro izq) | R18-R17-R16-R15 (muro der, 4 racks)]
 *   [columna 2 filas: R4,R5 (izq) | R14,R13 (der)]
 *   [bloque inferior: R6-R7-R8 (ligeramente desde muro izq) | R9-R10-R11-R12 (hasta muro der, 4 racks)]
 */
function pasilloGrande(pasillo: string, bandStartY: number): Record<string, RackLayout> {
  // Bloque de 4 racks derecho: R15 pegado al muro der, R18 más al centro
  const R_DER4_X0 = COL_RIGHT_X - GAP_X * 3  // 330 - 90 = 240

  return Object.fromEntries([
    // bloque superior izquierdo (3 racks, alineado con A)
    box(pasillo, 3, LEFT_X0, 0, bandStartY),
    box(pasillo, 2, LEFT_X0 + GAP_X, 0, bandStartY),
    box(pasillo, 1, LEFT_X0 + GAP_X * 2, 0, bandStartY),

    // bloque superior derecho (4 racks, un cuadro más a la izquierda)
    box(pasillo, 18, R_DER4_X0 - GAP_X,     0, bandStartY),
    box(pasillo, 17, R_DER4_X0,              0, bandStartY),
    box(pasillo, 16, R_DER4_X0 + GAP_X,     0, bandStartY),
    box(pasillo, 15, R_DER4_X0 + GAP_X * 2, 0, bandStartY),

    // columna lateral (2 filas)
    box(pasillo, 4, COL_LEFT_X, COL_Y0_GRANDE, bandStartY),
    box(pasillo, 5, COL_LEFT_X, COL_Y0_GRANDE + GAP_Y, bandStartY),
    box(pasillo, 14, COL_RIGHT_X, COL_Y0_GRANDE, bandStartY),
    box(pasillo, 13, COL_RIGHT_X, COL_Y0_GRANDE + GAP_Y, bandStartY),

    // bloque inferior izquierdo (3 racks, ligeramente alejado del muro)
    box(pasillo, 6, LEFT_X0, BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 7, LEFT_X0 + GAP_X, BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 8, LEFT_X0 + GAP_X * 2, BLOCK_INF_Y_CHICA, bandStartY),

    // bloque inferior derecho (4 racks, un cuadro más a la izquierda que el bloque superior)
    box(pasillo, 9,  R_DER4_X0 - GAP_X,     BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 10, R_DER4_X0,              BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 11, R_DER4_X0 + GAP_X,     BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 12, R_DER4_X0 + GAP_X * 2, BLOCK_INF_Y_CHICA, bandStartY),
  ])
}

// Pasillos 5 y 6 NO se corren a la derecha: sus racks deben compartir la
// misma columna vertical que P1-P4 (P5-R1 queda debajo de P4-R9), igual
// que el resto de la cadena de pasillos. Un corrimiento horizontal acá
// rompe esa alineación.
const CHICA_OFFSET_X = 0

/**
 * Pasillos 5 y 6 (8 racks c/u): mismo sándwich pero sin costado derecho —
 * el plano no muestra racks ahí y el schema confirma solo 8 racks por
 * pasillo (numero 1-8). El "9" que aparece en la imagen no existe en la
 * tabla racks para estos pasillos y se omite.
 */
function pasilloChica(pasillo: string, bandStartY: number): Record<string, RackLayout> {
  const left0 = LEFT_X0 + CHICA_OFFSET_X
  const colLeft = COL_LEFT_X + CHICA_OFFSET_X

  return Object.fromEntries([
    box(pasillo, 3, left0, 0, bandStartY),
    box(pasillo, 2, left0 + GAP_X, 0, bandStartY),
    box(pasillo, 1, left0 + GAP_X * 2, 0, bandStartY),

    box(pasillo, 4, colLeft, COL_Y0_GRANDE, bandStartY),
    box(pasillo, 5, colLeft, COL_Y0_GRANDE + GAP_Y, bandStartY),

    box(pasillo, 6, left0, BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 7, left0 + GAP_X, BLOCK_INF_Y_CHICA, bandStartY),
    box(pasillo, 8, left0 + GAP_X * 2, BLOCK_INF_Y_CHICA, bandStartY),
  ])
}

export const RACKS_LAYOUT: Record<string, RackLayout> = {
  ...filaSuperiorP1(HEADER_HEIGHT),
  ...pasillo1(bandStart(0)),
  ...pasilloGrande('B', bandStart(1)),
  ...pasilloGrande('C', bandStart(2)),
  ...pasilloGrande('D', bandStart(3)),
  ...pasilloChica('E', bandStart(4)),
  ...pasilloChica('F', bandStart(5)),
}

// Franja del pasillo (aisle): cubre solo la altura de la columna lateral
// (donde va la etiqueta "Pasillo N"), no el bloque de racks arriba/abajo.
// Alterna gris/verde por pasillo.
const ALTURA_COL_P1 = GAP_Y + BOX_H         // 54 — columna de 2 filas (P1, P5, P6)
const ALTURA_COL_GRANDE = GAP_Y * 2 + BOX_H // 82 — columna de 3 filas (P2-P4)

export const PASILLO_CODIGOS = ['A', 'B', 'C', 'D', 'E', 'F']
export const FRANJAS_PASILLO: Record<string, { yStart: number; height: number }> =
  Object.fromEntries(
    PASILLO_CODIGOS.map((codigo, i) => {
      if (i === 0) return [codigo, { yStart: bandStart(i), height: ALTURA_COL_P1 }]
      // P2-P6 tienen columna de 2 filas
      return [codigo, { yStart: bandStart(i) + COL_Y0_GRANDE, height: ALTURA_COL_P1 }]
    }),
  )

const CENTRO_GRANDE = (COL_LEFT_X + BOX_W + COL_RIGHT_X) / 2 // ~186.5, centro real entre columnas

// Los racks de P5/P6 NO se mueven (deben seguir alineados con P1-P4),
// pero la etiqueta "Pasillo N" sí se corre un poco a la derecha — solo
// el texto/recuadro, nada más.
const ETIQUETA_OFFSET_CHICA = 60
const CENTRO_CHICA = LEFT_X0 + GAP_X + BOX_W / 2 + ETIQUETA_OFFSET_CHICA

// Recuadro que envuelve todo el contenido real del mapa (de columna a
// columna, de la fila superior al último pasillo) — para el fondo
// alternado y el borde exterior, sin el margen sobrante del viewBox.
export const MAPA_CONTENIDO = {
  x: COL_LEFT_X,
  width: COL_RIGHT_X + BOX_W - COL_LEFT_X,
  y: HEADER_HEIGHT,
  height: bandStart(5) + BAND_HEIGHTS[5] - HEADER_HEIGHT,
}

// Línea vertical que marca el límite derecho de Pasillo 5 y 6 — ahí
// termina la bodega en esa zona, no hay racks a la derecha (a diferencia
// de P1-P4). Puramente visual, como en el plano.
export const LIMITE_PASILLOS_CHICOS = {
  x: COL_RIGHT_X - GAP_X * 4 + CHICA_OFFSET_X,
  y1: bandStart(4),
  y2: bandStart(5) + BAND_HEIGHTS[5],
}

// Zona sin racks a la derecha de Pasillo 5 y 6 — se pinta de un solo gris
// oscuro parejo, sin el tinte alternado verde/vacío del resto de las
// franjas, para marcarla como "sin uso" de forma consistente.
export const ZONA_VACIA_CHICA = {
  x: LIMITE_PASILLOS_CHICOS.x,
  y: LIMITE_PASILLOS_CHICOS.y1,
  width: MAPA_CONTENIDO.x + MAPA_CONTENIDO.width - LIMITE_PASILLOS_CHICOS.x,
  height: LIMITE_PASILLOS_CHICOS.y2 - LIMITE_PASILLOS_CHICOS.y1,
}

// Línea horizontal que cierra la esquina donde termina el bloque derecho
// de Pasillo 4 y empieza la zona sin costado derecho (Pasillo 5/6) —
// remata la línea vertical de arriba, mismo estilo.
export const LIMITE_PASILLOS_CHICOS_TOPE = {
  x1: LIMITE_PASILLOS_CHICOS.x,
  x2: COL_RIGHT_X + BOX_W,
  y: LIMITE_PASILLOS_CHICOS.y1,
}

const LABEL_Y_P1     = (GAP_Y + BOX_H) / 2                          // centro de la columna de P1 (0-54)
const LABEL_Y_GRANDE = COL_Y0_GRANDE + (GAP_Y * 2 + BOX_H) / 2       // centro de la columna (26-108, 3 filas)
const LABEL_Y_CHICA  = COL_Y0_GRANDE + (GAP_Y + BOX_H) / 2           // centro de la columna (26-80, 2 filas: P5-P6)

export const PASILLOS_LAYOUT: Record<string, PasilloLayout> = {
  A: { codigo: 'A', labelX: CENTRO_GRANDE, labelY: bandStart(0) + LABEL_Y_P1, direccion: 'down' },
  B: { codigo: 'B', labelX: CENTRO_GRANDE, labelY: bandStart(1) + LABEL_Y_CHICA, direccion: 'down' },
  C: { codigo: 'C', labelX: CENTRO_GRANDE, labelY: bandStart(2) + LABEL_Y_CHICA, direccion: 'down' },
  D: { codigo: 'D', labelX: CENTRO_GRANDE, labelY: bandStart(3) + LABEL_Y_CHICA, direccion: 'down' },
  E: { codigo: 'E', labelX: CENTRO_CHICA,  labelY: bandStart(4) + LABEL_Y_CHICA, direccion: 'down' },
  F: { codigo: 'F', labelX: CENTRO_CHICA,  labelY: bandStart(5) + LABEL_Y_CHICA, direccion: 'down' },
}
