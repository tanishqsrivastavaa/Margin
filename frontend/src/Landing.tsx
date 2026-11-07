import { go } from './router'

export default function Landing({ signedIn }: { signedIn: boolean }) {
  const start = () => go(signedIn ? '/new' : '/auth')
  return (
    <div className="gutter">
      <div className="landing">
        <header>
          <span className="brand">Margin</span>
          <button className="pill" type="button" onClick={start}>{signedIn ? 'Open Margin' : 'Sign in'}</button>
        </header>
        <main className="essay stagger">
          <div className="lede" style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            <h1>You think.<br />It asks.</h1>
            <dl className="props-list">
              <dt>What</dt><dd>A writing page that questions you</dd>
              <dt>Built by</dt><dd>Tanishq Srivastava</dd>
              <dt>Status</dt><dd>Beta, free</dd>
            </dl>
          </div>
          <span aria-hidden="true" />
          <p className="note-top">This page is written in Margin. The notes on the right are what it would ask.</p>

          <p className="para">Margin is a page where you write your ideas one point at a time. When you finish a point and pause, it asks you one question about it, in the margin. It never writes in your page.</p>
          <span className="rule" aria-hidden="true" />
          <div className="aside"><span className="t-label">Question</span><p className="t-msg">How is that different from asking a chatbot?</p></div>

          <p className="para">Most AI tools hand you the answer. It feels like progress, but the thinking happened somewhere else. Margin keeps the thinking on your side of the page. It asks, pushes back and hints, one step at a time. You get the answer only if you type /answer, twice.</p>
          <span className="rule on" aria-hidden="true" />
          <div className="aside"><span className="t-label">Nudge · 2 of 3</span><p className="t-msg">Think about what you still remember a week later: the answer you read, or the one you worked out.</p></div>

          <p className="para">I'm Tanishq. I built Margin while preparing for interviews. I could read a solution, nod along, and still not explain it an hour later. I wanted a partner that makes me say it in my own words first, and only helps as much as I ask.</p>
          <span className="rule" aria-hidden="true" />
          <div className="aside"><span className="t-label">Question</span><p className="t-msg">What did you last understand only after explaining it?</p></div>

          <ol className="steps">
            <li><span className="quiet">1</span><span>Write a goal, and say how Margin should talk to you.</span></li>
            <li><span className="quiet">2</span><span>Write. Pause after a point. Read the margin.</span></li>
            <li><span className="quiet">3</span><span>Answer by editing your page. Type /more when you are stuck.</span></li>
          </ol>
          <span aria-hidden="true" />
          <span aria-hidden="true" />

          <div className="cta">
            <button className="pill solid big" type="button" onClick={start}>
              Start a page
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
            <span className="quiet" style={{ fontSize: 14 }}>Free while in beta. Email sign-in.</span>
          </div>
        </main>
        <footer>
          <span>Margin, by Tanishq Srivastava</span>
          <a href="https://github.com/tanishqsrivastavaa/Margin">GitHub</a>
        </footer>
      </div>
    </div>
  )
}
