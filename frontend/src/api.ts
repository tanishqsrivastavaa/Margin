import { sessionToken } from './auth'

const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:8000'

export type PointOut = {
  id: string
  block_id: string
  position: number
  summary_line: string
  status: 'candidate' | 'open' | 'stale'
  unlocked: boolean
}

export type PageSummary = { id: string; title: string; updated_at: string }

export type Page = PageSummary & {
  goal: string
  instructions: string
  body_json: Record<string, unknown>
  points: PointOut[]
}

export type Message = {
  id: number
  role: 'user' | 'assistant'
  content: string
  rung: number | null
  created_at: string
}

export type Thread = { point: PointOut; text_snapshot: string; messages: Message[] }

async function request(path: string, init: RequestInit = {}, retry = true): Promise<Response> {
  const token = await sessionToken(!retry)
  const response = await fetch(BASE + path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (response.status === 401 && retry) return request(path, init, false)
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`)
  return response
}

const json = async <T>(path: string, init?: RequestInit) => (await request(path, init)).json() as Promise<T>
const send = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

export const api = {
  pages: () => json<PageSummary[]>('/pages'),
  page: (id: string) => json<Page>(`/pages/${id}`),
  createPage: (body: { title: string; goal: string; instructions: string }) => json<Page>('/pages', send('POST', body)),
  updatePage: (id: string, body: Partial<Pick<Page, 'title' | 'goal' | 'instructions' | 'body_json'>>) =>
    json<Page>(`/pages/${id}`, send('PATCH', body)),
  detect: (pageId: string, body: { block_id: string; text: string; position: number }) =>
    json<PointOut | null>(`/pages/${pageId}/points/detect`, send('POST', body)),
  thread: (pointId: string) => json<Thread>(`/points/${pointId}`),
  unlock: (pointId: string) => json<PointOut>(`/points/${pointId}/unlock`, send('POST', {})),
  async reply(pointId: string, content: string | null, onText: (text: string) => void): Promise<Message> {
    const response = await request(`/points/${pointId}/reply`, send('POST', { content }))
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader()
    let buffer = ''
    let done: Message | null = null
    for (;;) {
      const { value, done: end } = await reader.read()
      if (end) break
      buffer += value
      let cut: number
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const block = buffer.slice(0, cut)
        buffer = buffer.slice(cut + 2)
        const event = block.match(/^event: (.*)$/m)?.[1]
        const data = block.match(/^data: (.*)$/m)?.[1]
        if (!data) continue
        if (event === 'token') onText(JSON.parse(data).text)
        if (event === 'done') done = JSON.parse(data)
      }
    }
    if (!done) throw new Error('The reply stopped before it finished')
    return done
  },
}
