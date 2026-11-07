import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'

const listeners = new Set<() => void>()
let path = location.pathname

function notify() {
  path = location.pathname
  listeners.forEach((l) => l())
}

addEventListener('popstate', () => flushSync(notify))

export function usePath() {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => listeners.delete(l)),
    () => path,
  )
}

export function go(to: string) {
  if (to === location.pathname) return
  const navigate = () => {
    history.pushState(null, '', to)
    flushSync(notify)
  }
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches
  if (document.startViewTransition && !reduce) document.startViewTransition(navigate).ready.catch(() => {})
  else navigate()
}
