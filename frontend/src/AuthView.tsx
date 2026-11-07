import { FormEvent, useState } from 'react'
import { authClient } from './auth'
import { go } from './router'

export default function AuthView() {
  const [mode, setMode] = useState<'in' | 'up'>('up')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError('')
    const result = mode === 'up'
      ? await authClient.signUp.email({ email, password, name: name || email.split('@')[0] })
      : await authClient.signIn.email({ email, password })
    setBusy(false)
    if (result.error) setError(result.error.message ?? 'That did not work. Check your email and password.')
    else go('/new')
  }

  return (
    <div className="auth gutter">
      <form onSubmit={submit}>
        <button type="button" className="brand" style={{ border: 0, background: 'none', padding: 0, cursor: 'pointer', alignSelf: 'flex-start' }} onClick={() => go('/')}>Margin</button>
        <h1>{mode === 'up' ? 'Create your account' : 'Welcome back'}</h1>
        <div className="seg" role="group" aria-label="Sign in or sign up" style={{ alignSelf: 'flex-start' }}>
          <button type="button" aria-pressed={mode === 'up'} onClick={() => setMode('up')}>Sign up</button>
          <button type="button" aria-pressed={mode === 'in'} onClick={() => setMode('in')}>Sign in</button>
        </div>
        {mode === 'up' && (
          <div className="field">
            <label htmlFor="name">Name</label>
            <input id="name" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </div>
        )}
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input id="password" type="password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === 'up' ? 'new-password' : 'current-password'} />
        </div>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="pill solid big" type="submit" disabled={busy} style={{ alignSelf: 'flex-start' }}>
          {busy ? 'One moment…' : mode === 'up' ? 'Create account' : 'Sign in'}
        </button>
      </form>
    </div>
  )
}
