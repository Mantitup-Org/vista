import type { AuthSectionContent } from '@/types/auth';

/** Auth feature from the home runtime block — fail-closed middleware in the same app. */
export const authSection: AuthSectionContent = {
  title: 'Auth that ships.',
  titleMuted: 'Fail closed.',
  body: 'vista g auth writes providers, sign-in, and middleware that denies /account without a session — not a package you bolt on later.',
  connector: 'same app/',
  config: {
    path: 'auth.ts',
    language: 'ts',
    caption: 'Auth',
    source: `import VistaAuth, { Credentials, GitHub, Google } from 'vista/auth'

export const { handlers, auth, signIn, signOut, authMiddleware } = VistaAuth({
  pages: { signIn: '/signin' },
  providers: [
    GitHub({}),
    Google({}),
    Credentials({
      authorize: async (credentials) => {
        if (!credentials.email || !credentials.password) return null
        return {
          id: credentials.email,
          email: credentials.email,
          name: credentials.email,
        }
      },
    }),
  ],
})`,
  },
  middleware: {
    path: 'middleware.ts',
    language: 'ts',
    caption: 'Middleware',
    source: `import { authMiddleware } from './auth'

export default authMiddleware(({ auth, request }) => {
  const pathname = new URL(request.url).pathname
  if (pathname.startsWith('/account') && !auth) {
    return false
  }
  return true
})`,
  },
  page: {
    path: 'app/account/page.tsx',
    language: 'tsx',
    caption: 'Page',
    source: `import { auth } from '../../auth'

export default async function AccountPage() {
  const session = await auth()
  if (!session?.user) {
    return <p>Not signed in.</p>
  }
  return (
    <main>
      <h1>Account</h1>
      <p>Signed in as {session.user.email}</p>
    </main>
  )
}`,
  },
};
