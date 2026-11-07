import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor, JSONContent } from '@tiptap/core'
import StarterKit from '@tiptap/starter-kit'
import UniqueID from '@tiptap/extension-unique-id'
import { Placeholder } from '@tiptap/extensions'
import { api, Message, Page, PointOut } from './api'
import { Flash, flash } from './flash'
import { pacer } from './pacer'
import { go } from './router'
import { pagesChanged } from './Shell'

type Entry = { key: number; kind: 'label' | 'msg' | 'note' | 'status'; text: string; done?: boolean }
type ThreadState = { blockId: string; point: PointOut; snapshot: string; entries: Entry[]; busy: boolean; answerPending: boolean }
type Block = { id: string; text: string; pos: number; size: number; index: number }

const PAUSE = 2200
const POINT_END = /[.?!]["')\]]?$/
const COMMAND = /(^|\s)\/(more|answer)\s*$/
const MORE = 'Give me a bigger hint.'
const ANSWER = 'Give me the full answer.'
const REVISED = 'I revised this point: '
const RUNGS = ['', 'Question', 'Nudge', 'Approach', 'Answer']
let entryKey = 0

const sleep = (ms: number) => new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms))
const firstWords = (text: string) => text.trim().split(/\s+/).slice(0, 6).join(' ')

function rungLabel(rung: number | null) {
  if (!rung) return 'Margin'
  return rung === 4 ? 'Answer · unlocked' : `${RUNGS[rung]} · ${rung} of 3`
}

function userNote(content: string) {
  if (content.startsWith(REVISED)) return 'You changed this point.'
  if (content === MORE) return 'You typed /more.'
  if (content === ANSWER) return 'You typed /answer.'
  return `You: ${content}`
}

function entriesFrom(messages: Message[]): Entry[] {
  return messages.flatMap((m): Entry[] =>
    m.role === 'user'
      ? [{ key: ++entryKey, kind: 'note', text: userNote(m.content) }]
      : [
          { key: ++entryKey, kind: 'label', text: rungLabel(m.rung) },
          { key: ++entryKey, kind: 'msg', text: m.content, done: true },
        ],
  )
}

function blocksOf(editor: Editor): Block[] {
  const out: Block[] = []
  editor.state.doc.descendants((node, pos) => {
    if ((node.type.name === 'paragraph' || node.type.name === 'heading') && node.attrs.id) {
      out.push({ id: node.attrs.id, text: node.textContent, pos, size: node.nodeSize, index: out.length })
      return false
    }
  })
  return out
}

function blockAt(editor: Editor): string | null {
  const $from = editor.state.selection.$from
  for (let d = $from.depth; d > 0; d--) {
    const id = $from.node(d).attrs.id
    if (id) return id
  }
  return null
}

function changedRange(prev: string, next: string): [number, number, boolean] {
  let a = 0
  while (a < prev.length && a < next.length && prev[a] === next[a]) a++
  let b = 0
  while (b < prev.length - a && b < next.length - a && prev[prev.length - 1 - b] === next[next.length - 1 - b]) b++
  return [a, next.length - b, next.length > prev.length && a === prev.length]
}

function EntryView({ entry }: { entry: Entry }) {
  if (entry.kind === 'status') return <p className="t-status">{entry.text}</p>
  if (entry.kind === 'note') return <p className="t-note">{entry.text}</p>
  if (entry.kind === 'label') return <span key={entry.text} className="t-label">{entry.text}</span>
  if (entry.done) {
    const parts = entry.text.split(/```[\w-]*\n?/)
    return (
      <>
        {parts.map((part, i) =>
          i % 2 ? <pre key={i} className="t-code">{part.replace(/\n$/, '')}</pre> : part.trim() ? <p key={i} className="t-msg">{part.trim()}</p> : null,
        )}
      </>
    )
  }
  return (
    <p className="t-msg">
      {entry.text.split(/(\s+)/).map((w, i) => (!w || /^\s+$/.test(w) ? w : <span key={i} className="w">{w}</span>))}
    </p>
  )
}

export default function Writing({ id }: { id: string }) {
  const [page, setPage] = useState<Page | null>(null)
  const [title, setTitle] = useState('')
  const [saving, setSaving] = useState<'Saved' | 'Saving…' | 'Not saved'>('Saved')
  const [active, setActive] = useState<string | null>(null)
  const [missing, setMissing] = useState(false)
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick((t) => t + 1), [])

  const threads = useRef(new Map<string, ThreadState>()).current
  const seen = useRef(new Map<string, string>()).current
  const marks = useRef(new Map<string, HTMLSpanElement>()).current
  const threadEls = useRef(new Map<string, HTMLElement>()).current
  const placed = useRef(new Set<string>()).current
  const timers = useRef({ save: 0, check: 0, title: 0, raf: 0 }).current
  const state = useRef({ loaded: false, json: null as JSONContent | null }).current
  const pageRef = useRef<Page | null>(null)
  const editorRef = useRef<Editor | null>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const marksRef = useRef<HTMLDivElement>(null)
  const marginRef = useRef<HTMLElement>(null)

  function schedule() {
    if (!timers.raf) timers.raf = requestAnimationFrame(() => { timers.raf = 0; layout() })
  }

  function layout() {
    const editor = editorRef.current, row = rowRef.current, margin = marginRef.current
    if (!editor || editor.isDestroyed || !row || !margin) return
    const root = editor.view.dom as HTMLElement
    const rowBox = row.getBoundingClientRect()
    const x = root.getBoundingClientRect().right - rowBox.left - 8
    const boxes = new Map<string, DOMRect>()
    root.querySelectorAll<HTMLElement>('[data-id]').forEach((el) => boxes.set(el.dataset.id!, el.getBoundingClientRect()))
    for (const [bid, m] of marks) {
      const r = boxes.get(bid)
      m.style.display = r ? '' : 'none'
      if (!r) continue
      m.style.left = `${x}px`
      m.style.top = `${r.top - rowBox.top + 4}px`
      m.style.height = `${Math.max(8, r.height - 8)}px`
    }
    for (const [bid, el] of threadEls) el.style.display = boxes.has(bid) ? '' : 'none'
    if (!matchMedia('(min-width: 900px)').matches) { margin.style.height = ''; return }
    const top = margin.getBoundingClientRect().top
    const items = [...threadEls].filter(([bid]) => boxes.has(bid)).sort((a, b) => boxes.get(a[0])!.top - boxes.get(b[0])!.top)
    let bottom = 0
    for (const [bid, el] of items) {
      const y = Math.max(boxes.get(bid)!.top - top, bottom)
      el.style.transform = `translateY(${y}px)`
      if (!placed.has(bid)) requestAnimationFrame(() => { placed.add(bid); el.classList.add('placed') })
      bottom = y + el.offsetHeight + 28
    }
    margin.style.height = `${bottom}px`
  }

  function setMark(blockId: string, s: 'reading' | 'point' | 'active') {
    let m = marks.get(blockId)
    if (!m) {
      m = document.createElement('span')
      m.className = 'mark'
      marksRef.current?.append(m)
      marks.set(blockId, m)
    }
    m.dataset.state = s
    if (s === 'reading') { m.classList.remove('draw'); void m.offsetWidth; m.classList.add('draw') }
    schedule()
  }

  function clearMark(blockId: string) {
    const m = marks.get(blockId)
    if (!m) return
    marks.delete(blockId)
    m.dataset.state = 'gone'
    setTimeout(() => m.remove(), 260)
  }

  function activate(blockId: string) {
    setActive(blockId)
    for (const [bid, m] of marks) if (threads.has(bid) && m.dataset.state !== 'reading') m.dataset.state = bid === blockId ? 'active' : 'point'
  }

  function add(t: ThreadState, kind: Entry['kind'], text: string, done?: boolean) {
    const entry: Entry = { key: ++entryKey, kind, text, done }
    t.entries.push(entry)
    rerender()
    return entry
  }

  function drop(t: ThreadState, entry: Entry) {
    t.entries = t.entries.filter((e) => e !== entry)
    rerender()
  }

  function find(blockId: string) {
    const editor = editorRef.current
    return editor ? blocksOf(editor).find((b) => b.id === blockId) : undefined
  }

  async function save() {
    const p = pageRef.current
    clearTimeout(timers.save)
    if (!p || !state.loaded || !state.json) return
    try {
      await api.updatePage(p.id, { body_json: state.json })
      setSaving('Saved')
    } catch {
      setSaving('Not saved')
    }
  }

  async function say(t: ThreadState, text: string) {
    const label = add(t, 'label', 'Margin')
    const msg = add(t, 'msg', '')
    const pace = pacer((shown) => { msg.text = shown; rerender() })
    pace.push(text)
    pace.end()
    await pace.finished
    label.text = 'Margin'
    rerender()
  }

  async function respond(t: ThreadState, content: string | null) {
    t.busy = true
    activate(t.blockId)
    const status = add(t, 'status', 'Thinking about this point')
    const live: { label?: Entry; msg?: Entry } = {}
    const pace = pacer((shown) => { if (live.msg) { live.msg.text = shown; rerender() } })
    const open = () => {
      if (live.msg) return
      drop(t, status)
      live.label = add(t, 'label', 'Margin')
      live.msg = add(t, 'msg', '')
    }
    try {
      const done = await api.reply(t.point.id, content, (text) => { open(); pace.push(text) })
      pace.end()
      await pace.finished
      open()
      live.label!.text = rungLabel(done.rung)
      live.msg!.text = done.content
      live.msg!.done = true
    } catch {
      pace.end()
      drop(t, status)
      add(t, 'note', 'Margin is busy right now. Keep writing, and it will try again when you pause.')
    } finally {
      t.busy = false
      rerender()
      schedule()
      clearTimeout(timers.check)
      timers.check = window.setTimeout(check, PAUSE)
    }
  }

  async function stripCommand(blockId: string) {
    const editor = editorRef.current
    let b = find(blockId)
    let m = b?.text.match(COMMAND)
    if (!editor || !b || !m) return
    flash(editor, b.pos + b.size - 1 - m[0].length, b.pos + b.size - 1, 'cmd-out', 300)
    await sleep(220)
    b = find(blockId)
    m = b?.text.match(COMMAND)
    if (!b || !m) return
    const end = b.pos + b.size - 1
    editor.chain().deleteRange({ from: end - m[0].length, to: end }).run()
    seen.set(blockId, find(blockId)?.text ?? '')
  }

  async function command(t: ThreadState, kind: 'more' | 'answer') {
    activate(t.blockId)
    if (kind === 'more') {
      add(t, 'note', 'You typed /more.')
      return respond(t, MORE)
    }
    if (t.point.unlocked) {
      add(t, 'note', 'You typed /answer.')
      return respond(t, ANSWER)
    }
    if (!t.answerPending) {
      t.answerPending = true
      add(t, 'note', 'You typed /answer.')
      return say(t, 'Type /answer once more to see the full answer for this point.')
    }
    add(t, 'note', 'You typed /answer again.')
    try {
      t.point = await api.unlock(t.point.id)
    } catch {
      add(t, 'note', 'The answer could not be unlocked. Try /answer again in a moment.')
      return
    }
    return respond(t, ANSWER)
  }

  async function revise(t: ThreadState, prev: string, next: string) {
    const editor = editorRef.current
    const b = find(t.blockId)
    const [a, z, appended] = changedRange(prev, next)
    if (editor && b) flash(editor, b.pos + 1 + a, b.pos + 1 + z, 'sweep', 1400)
    t.snapshot = next.trim()
    add(t, 'note', appended ? 'You added to this point.' : 'You changed this point.')
    await respond(t, REVISED + t.snapshot)
  }

  async function detect(b: Block, text: string) {
    setMark(b.id, 'reading')
    try {
      const point = await api.detect(pageRef.current!.id, { block_id: b.id, text, position: b.index })
      if (!point) { clearMark(b.id); return }
      const t: ThreadState = { blockId: b.id, point, snapshot: text, entries: [], busy: false, answerPending: false }
      threads.set(b.id, t)
      setMark(b.id, 'point')
      activate(b.id)
      rerender()
      await respond(t, null)
    } catch {
      clearMark(b.id)
      seen.delete(b.id)
    }
  }

  async function handle(b: Block, prev: string) {
    const t = threads.get(b.id)
    if (COMMAND.test(b.text)) {
      const kind = b.text.match(COMMAND)![2] as 'more' | 'answer'
      await stripCommand(b.id)
      await save()
      if (t) await command(t, kind)
      return
    }
    const text = b.text.trim()
    if (t) {
      if (text && text !== t.snapshot) await revise(t, prev, b.text)
      return
    }
    if (text.length >= 40 && POINT_END.test(text)) await detect(b, text)
  }

  async function check() {
    const editor = editorRef.current
    if (!editor || editor.isDestroyed || !state.loaded) return
    await save()
    for (const b of blocksOf(editor)) {
      const prev = seen.get(b.id) ?? ''
      if (prev === b.text || threads.get(b.id)?.busy) continue
      seen.set(b.id, b.text)
      handle(b, prev)
    }
  }

  const editor = useEditor({
    immediatelyRender: true,
    editable: false,
    extensions: [
      StarterKit,
      UniqueID.configure({ types: ['paragraph', 'heading'] }),
      Placeholder.configure({ placeholder: 'Write your first point, then pause…' }),
      Flash,
    ],
    editorProps: { attributes: { 'aria-label': 'Your page' } },
    onUpdate: ({ editor }) => {
      if (!state.loaded) return
      state.json = editor.getJSON()
      setSaving('Saving…')
      clearTimeout(timers.save)
      timers.save = window.setTimeout(save, 800)
      clearTimeout(timers.check)
      timers.check = window.setTimeout(check, PAUSE)
      schedule()
    },
    onSelectionUpdate: ({ editor }) => {
      const bid = blockAt(editor)
      if (bid && threads.has(bid)) activate(bid)
    },
  })
  editorRef.current = editor

  useEffect(() => {
    let live = true
    api.page(id).then(async (p) => {
      if (!live || !editor) return
      pageRef.current = p
      setPage(p)
      setTitle(p.title)
      editor.commands.setContent(p.body_json?.type === 'doc' ? (p.body_json as JSONContent) : '', { emitUpdate: false })
      state.json = editor.getJSON()
      for (const b of blocksOf(editor)) seen.set(b.id, b.text)
      state.loaded = true
      editor.setEditable(true)
      const loaded = await Promise.all(p.points.map((pt) => api.thread(pt.id).catch(() => null)))
      if (!live) return
      for (const t of loaded) {
        if (!t) continue
        const blockId = t.point.block_id
        threads.set(blockId, { blockId, point: t.point, snapshot: t.text_snapshot, entries: entriesFrom(t.messages), busy: false, answerPending: false })
        setMark(blockId, 'point')
      }
      rerender()
      editor.commands.focus('end')
    }).catch(() => live && setMissing(true))
    const onResize = () => schedule()
    addEventListener('resize', onResize)
    document.fonts?.ready.then(schedule)
    return () => {
      live = false
      removeEventListener('resize', onResize)
      clearTimeout(timers.check)
      clearTimeout(timers.title)
      if (timers.save) save()
    }
  }, [id])

  useLayoutEffect(() => schedule())

  function rename(value: string) {
    setTitle(value)
    clearTimeout(timers.title)
    timers.title = window.setTimeout(async () => {
      if (!pageRef.current) return
      await api.updatePage(pageRef.current.id, { title: value.trim() || 'Untitled' }).catch(() => {})
      pagesChanged()
    }, 600)
  }

  if (missing) {
    return (
      <div className="newpage">
        <h1>Page not found</h1>
        <p className="quiet">It may have been deleted.</p>
        <button className="pill" type="button" onClick={() => go('/new')} style={{ alignSelf: 'flex-start' }}>New page</button>
      </div>
    )
  }

  return (
    <div>
      <div className="writing-top">
        <span>Pages <span aria-hidden="true">/</span> <b>{title || 'Untitled'}</b></span>
        <span aria-live="polite">{saving}</span>
      </div>
      <div className="row" ref={rowRef}>
        <div className="col">
          <label htmlFor="page-title" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>Title</label>
          <input id="page-title" className="title-input" value={title} placeholder="Untitled" onChange={(e) => rename(e.target.value)} />
          {page && (
            <dl className="props-list">
              <dt>Goal</dt><dd>{page.goal || 'Not set'}</dd>
              <dt>Margin is</dt><dd>{page.instructions.split(/(?<=\.)\s/)[0] || 'A thinking partner'}</dd>
            </dl>
          )}
          <EditorContent editor={editor} />
          <p className="hint">Answer Margin by editing your page. Type <code>/more</code> for a bigger hint, or <code>/answer</code> to see the answer.</p>
        </div>
        <aside className="margin" ref={marginRef} aria-label="Margin">
          {[...threads.values()].map((t) => (
            <section
              key={t.blockId}
              ref={(el) => { if (el) threadEls.set(t.blockId, el); else threadEls.delete(t.blockId) }}
              className={`thread${placed.has(t.blockId) ? ' placed' : ''}${active && active !== t.blockId ? ' dim' : ''}`}
              aria-label={`Thread on ${firstWords(t.snapshot)}`}
            >
              <p className="on">On “{firstWords(t.snapshot)}…”</p>
              {t.entries.map((entry) => <EntryView key={entry.key} entry={entry} />)}
            </section>
          ))}
        </aside>
        <div className="marks" ref={marksRef} aria-hidden="true" />
      </div>
    </div>
  )
}
