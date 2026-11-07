const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches

export function pacer(update: (shown: string) => void) {
  let pending = ''
  let shown = ''
  let ended = false
  let resolve!: () => void
  const finished = new Promise<void>((r) => (resolve = r))
  const timer = setInterval(() => {
    const word = pending.match(/^\s*\S+(?=\s)/)
    if (word) {
      shown += word[0]
      pending = pending.slice(word[0].length)
      update(shown)
    } else if (ended) {
      shown += pending
      pending = ''
      update(shown)
      clearInterval(timer)
      resolve()
    }
  }, reduce() ? 0 : 34)
  return {
    push(text: string) { pending += text },
    end() { ended = true },
    finished,
  }
}
