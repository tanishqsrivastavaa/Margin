import { createAuthClient } from '@neon/auth'
import { BetterAuthReactAdapter } from '@neon/auth/react/adapters'

export const authClient = createAuthClient(import.meta.env.VITE_NEON_AUTH_URL, {
  adapter: BetterAuthReactAdapter(),
})

const isJwt = (token?: string | null) => !!token && token.split('.').length === 3

export async function sessionToken(force = false): Promise<string | null> {
  if (!force) {
    const { data } = await authClient.getSession()
    if (isJwt(data?.session?.token)) return data!.session.token
  }
  const { data } = await authClient.getSession({ fetchOptions: { headers: { 'X-Force-Fetch': '1' } } })
  return isJwt(data?.session?.token) ? data!.session.token : null
}
