import CredentialsProvider from 'next-auth/providers/credentials';
import { authenticateCredentials } from './credentialsLogin';
import { debugLog } from './appDebug';

if (process.env.NODE_ENV === 'production' && !process.env.NEXTAUTH_SECRET) {
  console.error('❌ ERROR: NEXTAUTH_SECRET is required in production!');
  console.error('Please set NEXTAUTH_SECRET environment variable.');
}

export const authOptions = {
  secret:
    process.env.NEXTAUTH_SECRET ||
    (process.env.NODE_ENV === 'development' ? 'development-secret-change-in-production' : undefined),
  url:
    process.env.NEXTAUTH_URL ||
    (process.env.NODE_ENV === 'production' ? 'https://webapptest.heatmanager.cloud' : 'http://localhost:3000'),
  trustHost: process.env.NODE_ENV === 'production',
  useSecureCookies: process.env.NODE_ENV === 'production',
  adapter: undefined,
  session: {
    strategy: 'jwt',
    maxAge: 8 * 60 * 60,
    updateAge: 24 * 60 * 60
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.heatmanager.cloud' : undefined
      }
    },
    callbackUrl: {
      name: `next-auth.callback-url`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.heatmanager.cloud' : undefined
      }
    },
    csrfToken: {
      name: `next-auth.csrf-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        domain: process.env.NODE_ENV === 'production' ? '.heatmanager.cloud' : undefined
      }
    }
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        return authenticateCredentials(credentials?.username, credentials?.password);
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        return {
          ...token,
          ...user,
          email: user.email,
          userid: user.userid,
          customerid: user.customerid,
          role: user.role
        };
      }
      return token;
    },
    async session({ session, token }) {
      if (!token) {
        return null;
      }
      session.user = {
        ...session.user,
        id: token.id,
        email: token.email,
        userid: token.userid,
        customerid: token.customerid,
        role: token.role,
        defaultEntryAssetId: token.defaultEntryAssetId ?? null
      };
      session.token = token.token;
      session.tbToken = token.tbToken;
      session.refreshToken = token.refreshToken;
      session.tbTokenExpires = token.tbTokenExpires;
      return session;
    }
  },
  pages: {
    signIn: '/auth/signin'
  },
  debug: process.env.NODE_ENV === 'development',
  events: {
    async signIn({ user }) {
      debugLog('User signed in:', user?.username);
    },
    async signOut() {
      debugLog('User signed out');
    },
    async session() {
      debugLog('Session callback called');
    }
  },
  error: {
    error: '/auth/error'
  }
};
