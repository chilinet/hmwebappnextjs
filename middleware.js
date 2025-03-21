import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

// Redirect to our custom signin page
export function middleware(request) {
  console.log('Middleware called for:', request.url);
  return null;
}

export default withAuth({
  callbacks: {
    authorized: ({ token }) => !!token
  },
})

// Nur auf /login anwenden
export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - api/auth (auth endpoints)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - auth/signin (login page)
     */
    '/((?!api/auth|_next/static|_next/image|favicon.ico|auth/signin).*)',
  ],
} 