import NextAuth from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'
import sql from 'mssql'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'

const sqlConfig = {
  user: process.env.MSSQL_USER,
  password: process.env.MSSQL_PASSWORD,
  database: process.env.MSSQL_DATABASE,
  server: process.env.MSSQL_SERVER,
  options: {
    encrypt: true,
    trustServerCertificate: true
  }
}

export const authOptions = {
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
    maxAge: 8 * 60 * 60, // 8 hours
    updateAge: 24 * 60 * 60, // 24 hours
  },
  cookies: {
    sessionToken: {
      name: `next-auth.session-token`,
      options: {
        httpOnly: true,
        sameSite: 'lax',
        path: '/',
        secure: process.env.NODE_ENV === 'production'
      }
    }
  },
  providers: [
    CredentialsProvider({
      name: 'Credentials',
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" }
      },
      async authorize(credentials) {
        try {
          const pool = await sql.connect(sqlConfig)
          
          // User und Settings abfragen
          const result = await pool.request()
            .input('username', sql.NVarChar, credentials.username)
            .query(`
              SELECT 
                u.userid,
                u.username,
                u.email,
                u.password,
                u.customerid,
                u.role,
                cs.tb_username,
                cs.tb_password,
                cs.tb_url
              FROM hm_users u
              LEFT JOIN customer_settings cs ON u.customerid = cs.customer_id
              WHERE u.username = @username
            `)

          await pool.close()

          if (result.recordset.length === 0) {
            return null
          }

          const user = result.recordset[0]

          // Passwort überprüfen
          const passwordMatch = await bcrypt.compare(credentials.password, user.password)
          if (!passwordMatch) {
            return null
          }

          // ThingsBoard Login
          const tbResponse = await fetch(`${process.env.THINGSBOARD_URL}/api/auth/login`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              username: user.tb_username,
              password: user.tb_password
            })
          })

          const tbData = await tbResponse.json()
          
          if (!tbResponse.ok) {
            return null
          }
          
          return {
            id: user.userid.toString(),
            name: user.username,
            email: user.email,
            userid: user.userid,
            customerid: user.customerid,
            role: user.role,
            token: jwt.sign(
              { 
                username: user.username,
                userid: user.userid,
                customerid: user.customerid,
                role: user.role,
              },
              process.env.NEXTAUTH_SECRET,
              { expiresIn: '8h' }
            ),
            tbToken: tbData.token,
            refreshToken: tbData.refreshToken,
            tbTokenExpires: new Date(Date.now() + 60 * 60 * 1000).toISOString() // Current time + 1 hour
          }
        } catch (error) {
          console.error('Auth error:', error)
          return null
        }
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
          role: user.role,
        }
      }
      return token
    },
    async session({ session, token }) {
      if (!token) {
        return null
      }
      session.user = {
        ...session.user,
        id: token.id,
        email: token.email,
        userid: token.userid,
        customerid: token.customerid,
        role: token.role,
      }
      session.token = token.token
      session.tbToken = token.tbToken
      session.refreshToken = token.refreshToken
      session.tbTokenExpires = token.tbTokenExpires
      return session
    }
  },
  pages: {
    signIn: '/auth/signin'
  },
  debug: process.env.NODE_ENV === 'development',
}

export default NextAuth(authOptions)