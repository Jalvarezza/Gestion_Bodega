import { useState, useRef, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'

type Tema = 'dark' | 'light'

function useTema(): [Tema, () => void] {
  const [tema, setTema] = useState<Tema>(() => {
    const saved = localStorage.getItem('tema') as Tema | null
    return saved ?? 'dark'
  })
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', tema)
    localStorage.setItem('tema', tema)
  }, [tema])
  return [tema, () => setTema(t => t === 'dark' ? 'light' : 'dark')]
}

const IconSun = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
    <circle cx="12" cy="12" r="5"/>
    <line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
    <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
    <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
    <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
  </svg>
)
const IconMoon = () => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" width={18} height={18}>
    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
  </svg>
)

export function LoginPage() {
  const navigate = useNavigate()
  const { sesion, login } = useAuth()
  const [tema, toggleTema] = useTema()

  const logoSrc = '/LOGO GRANTT CELESTE.png'

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)

  const emailRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (sesion.token && sesion.rol) {
      navigate('/home', { replace: true })
    }
  }, [sesion, navigate])

  useEffect(() => {
    emailRef.current?.focus()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !password) return

    setError(null)
    setCargando(true)
    try {
      const resultado = await login(email.trim(), password)
      if (!resultado.ok) {
        setError(resultado.mensaje)
        return
      }
      navigate('/home', { replace: true })
    } finally {
      setCargando(false)
    }
  }

  return (
    <div className="login-page">
      <button
        onClick={toggleTema}
        title={tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        className="login-theme-btn"
      >
        {tema === 'dark' ? <IconSun /> : <IconMoon />}
        <span>{tema === 'dark' ? 'Modo claro' : 'Modo oscuro'}</span>
      </button>

      <div className="login-card">
        <div className="login-logo">
          <img src={logoSrc} alt="Grantt" className="login-logo-img" />
          <p className="login-subtitulo">Sistema de gestión de inventario</p>
        </div>

        <form className="login-form" onSubmit={handleSubmit}>
          <label>
            Email
            <input
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="usuario@empresa.cl"
              autoComplete="username"
              disabled={cargando}
              required
            />
          </label>

          <label>
            Contraseña
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              autoComplete="current-password"
              disabled={cargando}
              required
            />
          </label>

          {error && <div className="login-error">{error}</div>}

          <button
            type="submit"
            className="btn-primario btn-login"
            disabled={cargando || !email.trim() || !password}
          >
            {cargando ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
