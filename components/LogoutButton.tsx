'use client'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase-browser'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

export function LogoutButton() {
  const router   = useRouter()
  const supabase = createClient()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <button
      onClick={handleLogout}
      title="Cerrar sesión"
      style={{
        padding: '7px 13px', borderRadius: 8,
        border: '1px solid var(--border)', background: 'transparent',
        color: 'var(--text-hint)', fontFamily: MONO, fontSize: 11,
        cursor: 'pointer', transition: 'color 0.15s, border-color 0.15s',
      }}
      onMouseEnter={e => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text)'
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--text-muted)'
      }}
      onMouseLeave={e => {
        (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-hint)'
        ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--border)'
      }}
    >
      Salir →
    </button>
  )
}
