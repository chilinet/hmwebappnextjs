import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

export default withAuth(
  function middleware(req) {
    // Wenn der Benutzer nicht authentifiziert ist und nicht bereits auf der Anmeldeseite ist,
    // leite zur Anmeldeseite um
    if (!req.nextauth.token && !req.nextUrl.pathname.startsWith('/auth')) {
      return NextResponse.redirect(new URL('/auth/signin', req.url))
    }
    return NextResponse.next()
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token
    },
  }
)

// Konfiguriere auf welchen Pfaden die Middleware ausgeführt werden soll
export const config = {
  matcher: [
    // Schütze alle Routen außer /auth/...
    '/((?!auth|_next/static|_next/image|favicon).*)',
  ]
} 