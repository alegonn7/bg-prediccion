'use client'
import { useState, useRef } from 'react'

const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

export function InfoTip({ text }: { text: string }) {
  const [show, setShow] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)

  return (
    <span
      ref={ref}
      style={{ position: 'relative', display: 'inline-flex', alignItems: 'center' }}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
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

      {show && (
        <div style={{
          position: 'absolute',
          bottom: 'calc(100% + 8px)',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 240,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 10,
          padding: '10px 13px',
          fontSize: 12,
          lineHeight: 1.55,
          color: 'var(--text-muted)',
          zIndex: 200,
          boxShadow: '0 6px 24px rgba(0,0,0,0.18)',
          pointerEvents: 'none',
        }}>
          {text}
          {/* Arrow */}
          <span style={{
            position: 'absolute',
            top: '100%', left: '50%',
            transform: 'translateX(-50%)',
            width: 0, height: 0,
            borderLeft: '6px solid transparent',
            borderRight: '6px solid transparent',
            borderTop: '6px solid var(--border)',
          }} />
        </div>
      )}
    </span>
  )
}
