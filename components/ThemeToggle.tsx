'use client'
import { useTheme } from 'next-themes'
import { useEffect, useState } from 'react'

export function ThemeToggle() {
  const { theme, setTheme } = useTheme()
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  if (!mounted) return <div style={{ width: 80, height: 36 }} />

  const isDark = theme === 'dark'
  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      style={{
        flexShrink: 0,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 9,
        padding: '9px 14px',
        border: '1px solid var(--border)',
        borderRadius: 999,
        background: 'var(--bg-card)',
        color: 'var(--text-muted)',
        fontFamily: "var(--font-mono, 'IBM Plex Mono', monospace)",
        fontSize: 12,
        cursor: 'pointer',
        boxShadow: 'var(--shadow)',
        whiteSpace: 'nowrap',
        transition: 'color 0.15s ease',
      }}
    >
      <span style={{
        width: 11,
        height: 11,
        borderRadius: '50%',
        background: isDark ? 'transparent' : 'var(--text-muted)',
        border: '1.5px solid var(--text-muted)',
        display: 'inline-block',
        flexShrink: 0,
      }} />
      {isDark ? 'Oscuro' : 'Claro'}
    </button>
  )
}
