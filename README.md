# Margin

A writing space where you do the thinking and an agent thinks with you. You write your points; the agent responds to each one in a margin thread with questions, challenges, and angles. It never writes your page, and it only gives a direct answer when you unlock it for that thread.

- `backend/` FastAPI, SQLModel, Alembic, Neon Postgres, Neon Auth
- `frontend/` React, TipTap and Neon Auth

## Run the frontend

```
cd frontend
cp .env.example .env
npm install
npm run dev
```

Set `VITE_NEON_AUTH_URL` to the Neon Auth URL of your branch and `VITE_API_URL` to the backend. The app runs on http://localhost:5173.

You reply to Margin by editing your page. Type `/more` at the end of a point for a bigger hint, or `/answer` twice to see the answer.
