import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
        token: { type: "text" },
        tbToken: { type: "text" },
        userid: { type: "integer" }
      },
      async authorize(credentials) {
        if (!credentials.token || !credentials.tbToken) {
          throw new Error('Missing tokens')
        }

        return {
          userid: credentials.userid,
          name: credentials.username,
          token: credentials.token,
          tbToken: credentials.tbToken
        }
      }
    })
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userid = user.userid
        token.name = user.name
        token.token = user.token
        token.tbToken = user.tbToken
      }
      return token
    },
    async session({ session, token }) {
      session.user.userid = token.userid
      session.user.name = token.name
      session.token = token.token
      session.tbToken = token.tbToken
      return session
    }
  },
  pages: {
    signIn: '/auth/signin'
  }
}

export default NextAuth(authOptions)