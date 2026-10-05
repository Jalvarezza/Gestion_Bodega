import { useState, useRef, useEffect } from 'react'
import { sonarEscaneoExitoso } from '../utils/sonidos'

interface Props {
  onDetected: (codigo: string) => void
  title?: string
}

const CamaraIcon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" width={20} height={20}>
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
)

// Carga BarcodeDetector nativo o el polyfill si no está disponible
async function getDetector(): Promise<{ detect: (src: HTMLVideoElement) => Promise<{ rawValue: string }[]> }> {
  if ('BarcodeDetector' in window) {
    // @ts-ignore
    return new BarcodeDetector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'data_matrix', 'upc_a', 'upc_e'],
    })
  }
  // Polyfill para desktop Chrome y Firefox
  const { BarcodeDetector: Polyfill } = await import('barcode-detector/pure')
  return new Polyfill({
    formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'data_matrix', 'upc_a', 'upc_e'],
  })
}

// Intenta abrir cámara trasera; si falla (PC sin cámara trasera) usa cualquier cámara
async function abrirCamara(): Promise<MediaStream> {
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } },
    })
  } catch {
    return navigator.mediaDevices.getUserMedia({ video: true })
  }
}

export function BarcodeScanner({ onDetected, title = 'Escanear con cámara' }: Props) {
  const [activo, setActivo]   = useState(false)
  const [error, setError]     = useState<string | null>(null)
  const videoRef              = useRef<HTMLVideoElement>(null)
  const streamRef             = useRef<MediaStream | null>(null)
  const animRef               = useRef<number>(0)
  const canceladoRef          = useRef(false)

  // Mostrar botón siempre que el navegador soporte getUserMedia
  const soportado = typeof window !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia

  function cerrar() {
    canceladoRef.current = true
    setActivo(false)
    cancelAnimationFrame(animRef.current)
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
  }

  useEffect(() => {
    if (!activo) return

    canceladoRef.current = false

    async function arrancar() {
      try {
        const stream = await abrirCamara()
        if (canceladoRef.current) { stream.getTracks().forEach((t) => t.stop()); return }
        streamRef.current = stream
        if (videoRef.current) videoRef.current.srcObject = stream

        const detector = await getDetector()
        if (canceladoRef.current) return

        async function escanear() {
          if (canceladoRef.current || !videoRef.current) return
          try {
            const resultados = await detector.detect(videoRef.current)
            if (resultados.length > 0) {
              sonarEscaneoExitoso()
              cerrar()
              onDetected(resultados[0].rawValue)
              return
            }
          } catch { /* frame no listo */ }
          animRef.current = requestAnimationFrame(escanear)
        }

        animRef.current = requestAnimationFrame(escanear)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (msg.includes('Permission') || msg.includes('NotAllowed')) {
          setError('Permiso de cámara denegado. Habilítalo en la configuración del navegador.')
        } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
          setError('No se encontró ninguna cámara en este dispositivo.')
        } else {
          setError('No se pudo acceder a la cámara.')
        }
      }
    }

    arrancar()
    return () => { cerrar() }
  }, [activo])

  if (!soportado) {
    return (
      <button className="btn-camara" title="Cámara no disponible en este navegador" disabled type="button">
        <CamaraIcon />
      </button>
    )
  }

  return (
    <>
      <button
        className="btn-camara"
        title={title}
        type="button"
        onClick={() => { setError(null); setActivo(true) }}
      >
        <CamaraIcon />
      </button>

      {activo && (
        <div className="scanner-modal">
          <div className="scanner-container">
            <div className="scanner-header">
              <span>Apunta al código de barras</span>
              <button className="scanner-cerrar" onClick={cerrar} type="button">✕</button>
            </div>
            <video ref={videoRef} autoPlay playsInline muted className="scanner-video" />
            <div className="scanner-viewfinder">
              <div className="scanner-linea" />
            </div>
            {error && <div className="scanner-error">{error}</div>}
          </div>
        </div>
      )}
    </>
  )
}
