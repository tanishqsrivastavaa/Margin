import { FormEvent, useState } from 'react'
import { api } from './api'
import { go } from './router'
import { pagesChanged } from './Shell'

const TONES: Record<string, string> = {
  'Tough interviewer': 'Act like a senior interviewer. Ask about edge cases and complexity. Keep replies to two or three sentences.',
  'Patient tutor': 'Be patient and encouraging. Say why each question matters. Keep replies short.',
  'Peer reviewer': 'Respond like a sharp colleague reviewing a draft. Point out gaps in the argument.',
  "Devil's advocate": 'Argue against my points. Make me defend each claim.',
}

export default function NewPage() {
  const [title, setTitle] = useState('')
  const [goal, setGoal] = useState('')
  const [tone, setTone] = useState('Tough interviewer')
  const [instructions, setInstructions] = useState(TONES['Tough interviewer'])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  function pickTone(t: string) {
    setTone(t)
    setInstructions(TONES[t])
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const page = await api.createPage({ title: title.trim() || 'Untitled', goal, instructions })
      pagesChanged()
      go(`/p/${page.id}`)
    } catch {
      setError('The page could not be created. Check that the server is running, then try again.')
      setBusy(false)
    }
  }

  return (
    <form className="newpage gutter" onSubmit={submit}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <h1>New page</h1>
        <p className="quiet" style={{ margin: 0 }}>Three short answers, then you start writing.</p>
      </div>
      <div className="field">
        <label htmlFor="title">Title</label>
        <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Two Sum II, sorted array" autoFocus />
      </div>
      <div className="field">
        <label htmlFor="goal">What is this page for?</label>
        <p className="help">Margin reads this to decide which of your paragraphs are real points.</p>
        <textarea id="goal" rows={2} value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Get good at two pointer problems before my interviews." />
      </div>
      <div className="field">
        <label htmlFor="instructions">How should Margin respond?</label>
        <div className="chips" role="group" aria-label="Starting styles">
          {Object.keys(TONES).map((t) => (
            <button key={t} type="button" className="pill" aria-pressed={tone === t} onClick={() => pickTone(t)}>{t}</button>
          ))}
        </div>
        <textarea id="instructions" rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} />
        <p className="help">Margin never writes in your page, and never gives a full answer unless you ask with /answer.</p>
      </div>
      {error && <p className="error" role="alert">{error}</p>}
      <div style={{ display: 'flex', gap: 10 }}>
        <button className="pill solid big" type="submit" disabled={busy}>
          {busy ? 'Creating…' : 'Create page'}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
        </button>
      </div>
    </form>
  )
}
