'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

export default function LoginPage() {
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)
  const router  = useRouter()
  const supabase = createClient()

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError('Credenciales incorrectas.')
      setLoading(false)
    } else {
      router.push('/')
      router.refresh()
    }
  }

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: '100%', maxWidth: 380,
        background: 'var(--bg-card)', border: '1px solid var(--border)',
        borderRadius: 16, padding: '36px 32px',
        boxShadow: '0 4px 24px rgba(0,0,0,0.18)',
      }}>
        {/* Logo / título */}
        <div style={{ marginBottom: 28, textAlign: 'center' }}>
          <div style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', letterSpacing: '0.15em', marginBottom: 6 }}>
            MOTOR DE PREDICCIONES
          </div>
          <div style={{ fontSize: 18, fontWeight: 700 }}>Acceso privado</div>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus
              style={{
                padding: '10px 14px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-muted)',
                color: 'var(--text)', fontFamily: MONO, fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)' }}>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              style={{
                padding: '10px 14px', borderRadius: 8,
                border: '1px solid var(--border)', background: 'var(--bg-muted)',
                color: 'var(--text)', fontFamily: MONO, fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: 8,
              background: 'var(--down-soft)', color: 'var(--down)',
              fontFamily: MONO, fontSize: 12,
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              marginTop: 4, padding: '12px', borderRadius: 8,
              background: loading ? 'var(--bg-muted)' : 'var(--text)',
              color: loading ? 'var(--text-hint)' : 'var(--bg)',
              fontFamily: MONO, fontSize: 13, fontWeight: 600,
              border: 'none', cursor: loading ? 'default' : 'pointer',
              transition: 'background 0.15s',
            }}
          >
            {loading ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
