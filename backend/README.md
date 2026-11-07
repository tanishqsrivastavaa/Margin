# Margin backend

FastAPI + SQLModel on Neon Postgres. Neon Auth handles sign-in; this server verifies the session JWT on every request. GPT OSS 120B on Groq detects points and writes one-line summaries. Gemma on OpenRouter is the thinking partner in each thread.

## Run locally

```bash
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head
uv run uvicorn app.main:app --reload
```

Set `AUTH_DEV_BYPASS=true` to call the API with `Authorization: Bearer dev:you@example.com` while Neon Auth is not wired up yet. Never enable it in production.

## Tests

```bash
uv run pytest
```

## Configuration

| Variable | Purpose |
| --- | --- |
| `DATABASE_URL` | Pooled Neon connection string, using the `postgresql+psycopg://` driver |
| `DATABASE_URL_UNPOOLED` | Direct Neon connection string. Alembic uses it when set |
| `NEON_AUTH_JWKS_URL` | Public keys that sign Neon Auth JWTs. Better Auth serves them at `<auth base url>/jwks` |
| `NEON_AUTH_ISSUER`, `NEON_AUTH_AUDIENCE` | Optional extra checks on the token |
| `GROQ_API_KEY`, `HELPER_MODEL` | Point detection and summaries |
| `OPENROUTER_API_KEY`, `THREAD_MODEL` | Thread replies |
| `THREAD_MODEL_SYSTEM_AS_USER` | Sends the system prompt inside the first user turn, for models that ignore the system role |
| `AWS_ENDPOINT_URL_S3`, `AWS_REGION`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Neon Object Storage. `neon deploy` writes them to `.env.local` |
| `STORAGE_BUCKET` | Bucket for page files, `assets` by default |
| `THREAD_KEEP_RECENT`, `THREAD_SUMMARIZE_AFTER` | When older thread turns get summarized |

## API

| Method | Path | What it does |
| --- | --- | --- |
| GET, POST | `/pages` | List or create pages |
| GET, PATCH, DELETE | `/pages/{id}` | Read, update (title, goal, instructions, `body_json`), delete |
| POST | `/pages/{id}/points/detect` | Ask the helper model whether a paragraph is a point; returns the point or `null` |
| POST | `/pages/{id}/points` | Open a point by hand |
| GET | `/points/{id}` | The thread: point, snapshot, messages |
| POST | `/points/{id}/reply` | Optional user message in, streamed reply out (`text/event-stream`: `token` events, then `done`) |
| PUT, GET | `/pages/{id}/files/{name}` | Upload (multipart field `file`) or download a file attached to a page |
| POST | `/points/{id}/unlock` | Allow rung 4, a direct answer, for this thread |

`body_json` is the TipTap document. Paragraphs and headings carry a stable `attrs.id` from TipTap's UniqueID extension, and points are tied to those ids.

## How a reply is built

Each call to the thread model gets five layers: the fixed core rules, the page title, goal, and instructions, a page map of one line per point, the focus paragraph with its neighbors, and the thread. Once a thread passes `THREAD_SUMMARIZE_AFTER` messages, older turns are summarized by the helper model and only the last `THREAD_KEEP_RECENT` stay word for word.

The model starts each reply with a `[rung:N]` tag. The server strips it, caps it at 3 unless the thread is unlocked, and stores it with the message.
