import { useEffect, useState } from 'react'
import { api, PageSummary } from './api'
import { authClient } from './auth'
import { go } from './router'
import { currentTheme, setTheme, Theme } from './theme'
import NewPage from './NewPage'
import Writing from './Writing'

export const pagesChanged = () => dispatchEvent(new Event('margin:pages'))

export default function Shell({ path, email }: { path: string; email: string }) {
  const [pages, setPages] = useState<PageSummary[]>([])
  const [theme, setThemeState] = useState<Theme>(currentTheme())
  const pageId = path.startsWith('/p/') ? path.slice(3) : null

  useEffect(() => {
    const load = () => api.pages().then(setPages).catch(() => {})
    load()
    addEventListener('margin:pages', load)
    return () => removeEventListener('margin:pages', load)
  }, [])

  const pick = (t: Theme) => { setTheme(t); setThemeState(t) }
  const open = (e: React.MouseEvent, to: string) => { e.preventDefault(); go(to) }

  return (
    <div className="shell gutter">
      <aside className="side">
        <a className="brand" href="/" onClick={(e) => open(e, '/')} style={{ padding: '0 8px' }}>Margin</a>
        <a className="pill new" href="/new" onClick={(e) => open(e, '/new')}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
          New page
        </a>
        <nav aria-label="Pages">
          <p className="label">Pages</p>
          {pages.length === 0 && <span className="quiet" style={{ padding: '0 8px', fontSize: 13 }}>No pages yet</span>}
          {pages.map((p) => (
            <a key={p.id} href={`/p/${p.id}`} aria-current={p.id === pageId ? 'page' : undefined} onClick={(e) => open(e, `/p/${p.id}`)}>
              {p.title || 'Untitled'}
            </a>
          ))}
        </nav>
        <div className="foot">
          <div className="seg" role="group" aria-label="Theme">
            {(['system', 'light', 'dark'] as Theme[]).map((t) => (
              <button key={t} type="button" aria-pressed={theme === t} onClick={() => pick(t)}>
                {t === 'system' ? 'Auto' : t === 'light' ? 'Light' : 'Graphite'}
              </button>
            ))}
          </div>
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{email}</span>
          <button className="link" type="button" onClick={async () => { await authClient.signOut(); go('/') }}>Sign out</button>
        </div>
      </aside>
      <div className="main">
        {pageId ? <Writing key={pageId} id={pageId} /> : <NewPage />}
      </div>
    </div>
  )
}
