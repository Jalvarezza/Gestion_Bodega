function beepRaw(freq: number, dur: number, vol: number, tipo: OscillatorType = 'square') {
  try {
    const ctx    = new AudioContext()
    const osc    = ctx.createOscillator()
    const gain   = ctx.createGain()
    // Nodo de boost extra para mayor volumen percibido
    const boost  = ctx.createGain()
    osc.connect(gain)
    gain.connect(boost)
    boost.connect(ctx.destination)
    boost.gain.value = 2.5
    osc.type = tipo
    osc.frequency.value = freq
    gain.gain.setValueAtTime(vol, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur)
    osc.start(ctx.currentTime)
    osc.stop(ctx.currentTime + dur)
  } catch { /* sin permiso de audio */ }
}

export function sonarEscaneoExitoso() {
  // Dos pitidos cortos ascendentes — confirmación clara
  beepRaw(1800, 0.09, 1.0, 'square')
  setTimeout(() => beepRaw(2600, 0.12, 1.0, 'square'), 90)
}

export function sonarEscaneoError() {
  // Tres pitidos graves descendentes — buzzer de error inconfundible
  beepRaw(400, 0.18, 1.0, 'sawtooth')
  setTimeout(() => beepRaw(300, 0.18, 1.0, 'sawtooth'), 200)
  setTimeout(() => beepRaw(220, 0.28, 1.0, 'sawtooth'), 400)
}
