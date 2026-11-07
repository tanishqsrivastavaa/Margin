export type Theme = 'system' | 'light' | 'dark'

export function currentTheme(): Theme {
  const t = document.documentElement.dataset.theme
  return t === 'light' || t === 'dark' ? t : 'system'
}

export function setTheme(t: Theme) {
  if (t === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = t
  try {
    if (t === 'system') localStorage.removeItem('margin-theme')
    else localStorage.setItem('margin-theme', t)
  } catch {}
}
