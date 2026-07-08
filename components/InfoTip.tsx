'use client'
import { useState, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"
const TIP_WIDTH = 240
const MARGIN = 8

export function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const [pos, setPos] = useState<{ top: number; left: number; arrowLeft: number; below: boolean } | null>(null)
  const ref = useRef<HTMLSpanElement>(null)

  function open() {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const anchorCenter = rect.left + rect.width / 2
    const left = Math.max(MARGIN, Math.min(anchorCenter - TIP_WIDTH / 2, window.innerWidth - TIP_WIDTH - MARGIN))
    const below = rect.top < 110 // not enough room above — flip below the icon instead
    setPos({
      top: below ? rect.bottom + 8 : rect.top - 8,
      left,
      arrowLeft: Math.max(12, Math.min(anchorCenter - left, TIP_WIDTH - 12)),
      below,
    })
    setShow(true)
  }
  function close() { setShow(false) }

  // Position is computed relative to the viewport (fixed) — stale after scroll, so just close.
  useEffect(() => {
    if (!show) return
    const onScroll = () => close()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [show])

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={open}
      onMouseLeave={close}
    >
      <span style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: 14, height: 14, borderRadius: '50%',
        border: '1px solid var(--text-hint)',
        color: 'var(--text-hint)', fontSize: 9,
        fontFamily: MONO, cursor: 'help',
        lineHeight: 1, flexShrink: 0,
      }}>
        ?
      </span>

      {show && pos && typeof document !== 'undefined' && createPortal(
        <div style={{
          position: 'fixed',
          top: pos.top,
          left: pos.left,
          width: TIP_WIDTH,
          transform: pos.below ? 'none' : 'translateY(-100%)',
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 13px',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--text-muted)',
          zIndex: 1000,
          boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}>
          {text}
          {/* Arrow */}
          <span style={{
            position: 'absolute',
            ...(pos.below
              ? { bottom: '100%', borderBottom: '6px solid var(--border)', borderTop: 'none' }
              : { top: '100%', borderTop: '6px solid var(--border)', borderBottom: 'none' }),
            left: pos.arrowLeft,
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
          }} />
        </div>,
        document.body
      )}
    </span>
  )
}
