const MONO = "var(--font-mono, 'IBM Plex Mono', monospace)"

type Props = {
  page: number
  totalItems: number
  pageSize: number
  onChange: (page: number) => void
}

export function Pagination({ page, totalItems, pageSize, onChange }: Props) {
  const totalPages = Math.ceil(totalItems / pageSize)
  if (totalPages <= 1) return null

  function pages(): (number | '…')[] {
    if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i + 1)
    const result: (number | '…')[] = []
    const addRange = (from: number, to: number) => {
      for (let i = from; i <= to; i++) result.push(i)
    }
    result.push(1)
    if (page > 3) result.push('…')
    addRange(Math.max(2, page - 1), Math.min(totalPages - 1, page + 1))
    if (page < totalPages - 2) result.push('…')
    result.push(totalPages)
    return [...new Set(result)]
  }

  const btnBase: React.CSSProperties = {
    minWidth: 32, height: 32, padding: '0 8px',
    borderRadius: 7, border: '1px solid var(--border)',
    fontFamily: MONO, fontSize: 12, cursor: 'pointer',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    transition: 'all 0.12s',
  }

  const from = (page - 1) * pageSize + 1
  const to   = Math.min(page * pageSize, totalItems)

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 24, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: MONO, fontSize: 11, color: 'var(--text-hint)', marginRight: 6 }}>
        {from}–{to} de {totalItems}
      </span>

      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        style={{
          ...btnBase,
          background: 'var(--bg-muted)', color: page === 1 ? 'var(--text-hint)' : 'var(--text)',
          opacity: page === 1 ? 0.4 : 1,
        }}
      >
        ←
      </button>

      {pages().map((p, i) =>
        p === '…' ? (
          <span key={`e${i}`} style={{ fontFamily: MONO, fontSize: 12, color: 'var(--text-hint)', padding: '0 4px' }}>…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p as number)}
            style={{
              ...btnBase,
              background: p === page ? 'var(--text)' : 'var(--bg-muted)',
              color:      p === page ? 'var(--bg)'  : 'var(--text-muted)',
              border:     p === page ? '1px solid var(--text)' : '1px solid var(--border)',
              fontWeight: p === page ? 700 : 400,
            }}
          >
            {p}
          </button>
        )
      )}

      <button
        onClick={() => onChange(page + 1)}
        disabled={page === totalPages}
        style={{
          ...btnBase,
          background: 'var(--bg-muted)', color: page === totalPages ? 'var(--text-hint)' : 'var(--text)',
          opacity: page === totalPages ? 0.4 : 1,
        }}
      >
        →
      </button>
    </div>
  )
}
