import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials, req) {
        try {
          const res = await fetch(`${process.env.NEXTAUTH_URL}/api/login`, {
            method: 'POST',
            body: JSON.stringify(credentials),
            headers: { "Content-Type": "application/json" }
          })

          const user = await res.json()

          if (res.ok && user.success) {
            return {
              name: user.user.name,
              email: user.user.email,
              token: user.token,
              userid: user.user.userid,
              tbToken: user.tbToken,
            }
          }
          return null
        } catch (e) {
          console.error('Auth error:', e)
          return null
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userid = user.userid
        token.token = user.token
        token.tbToken = user.tbToken
      }
      return token
    },
    async session({ session, token }) {
      session.token = token.token
      session.tbToken = token.tbToken
      session.user.userid = token.userid
      return session
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
}

export default NextAuth(authOptions)