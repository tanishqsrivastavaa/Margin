import { useEffect } from 'react'
import { authClient } from './auth'
import { go, usePath } from './router'
import Landing from './Landing'
import AuthView from './AuthView'
import Shell from './Shell'

export default function App() {
  const path = usePath()
  const { data, isPending } = authClient.useSession()
  const signedIn = !!data?.user
  const inApp = path !== '/' && path !== '/auth'

  useEffect(() => {
    if (!isPending && inApp && !signedIn) go('/auth')
    if (!isPending && path === '/auth' && signedIn) go('/new')
  }, [isPending, inApp, signedIn, path])

  if (path === '/') return <Landing signedIn={signedIn} />
  if (path === '/auth') return <AuthView />
  if (!signedIn) return null
  return <Shell path={path} email={data!.user.email} />
}
