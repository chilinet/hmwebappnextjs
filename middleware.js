import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

// Redirect to our custom signin page
export function middleware(request) {
  return NextResponse.redirect(new URL('/auth/signin', request.url))
}

// Nur auf /login anwenden
export const config = {
  matcher: '/login'
} 