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

          console.log('************************************************') 
          console.log('credentials:', credentials)
          console.log('************************************************')

          console.log('process.env.NEXTAUTH_URL:', process.env.NEXTAUTH_URL)
          console.log('************************************************')

          console.log('process.env.NEXTAUTH_URL_INTERNAL:', process.env.NEXTAUTH_URL_INTERNAL)
          console.log('************************************************')

          console.log('process.env.NODE_ENV:', process.env.NODE_ENV)
          console.log('************************************************')

          const apiUrl = process.env.NEXTAUTH_URL_INTERNAL + '/api/login'

          let res;

          try {
            console.log('Attempting to fetch from:', apiUrl);
            res = await fetch(apiUrl, {
              method: 'POST', 
              body: JSON.stringify(credentials),
              headers: { "Content-Type": "application/json" }
            });
            console.log('Fetch successful');
          } catch (fetchError) {
            console.error('Fetch failed with error:', {
              message: fetchError.message,
              cause: fetchError.cause,
              code: fetchError.code,
              stack: fetchError.stack
            });
            throw fetchError;
          }
          console.log('************************************************')
          console.log('res:', res)
          console.log('************************************************')

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