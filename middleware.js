import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"

// Redirect to our custom signin page
export function middleware(request) {
  console.log('Middleware called for:', request.url);
  return null;
}

// Nur auf /login anwenden
export const config = {
  matcher: '/login'
} 