import { withAuth } from "next-auth/middleware"
import { NextResponse } from "next/server"
import { getToken } from "next-auth/jwt"
import { debugLog } from "./lib/appDebug"

// Redirect to our custom signin page
export async function middleware(request) {
  debugLog('Middleware called for:', request.url);
  const pathname = request.nextUrl.pathname;

  // Allow public/static assets to pass through without auth checks.
  if (
    pathname.startsWith('/assets/') ||
    pathname.startsWith('/_next/static') ||
    pathname.startsWith('/_next/image') ||
    pathname === '/favicon.ico' ||
    pathname === '/robots.txt' ||
    pathname === '/sitemap.xml'
  ) {
    return NextResponse.next();
  }
  
  // Fix URL issues in production
  if (process.env.NODE_ENV === 'production' && request.url.includes('localhost')) {
    const correctedUrl = request.url.replace('localhost:3000', 'webapptest.heatmanager.cloud');
    debugLog('Correcting URL from', request.url, 'to', correctedUrl);
    return NextResponse.redirect(correctedUrl);
  }
  
  // For production, manually check JWT token to avoid internal fetch issues
  if (process.env.NODE_ENV === 'production' && !request.nextUrl.pathname.startsWith('/api/')) {
    try {
      const token = await getToken({ 
        req: request, 
        secret: process.env.NEXTAUTH_SECRET 
      });
      
      if (!token) {
        debugLog('No token found, redirecting to signin');
        return NextResponse.redirect(new URL('/auth/signin', request.url));
      }
      
      debugLog('Token found, allowing access');
    } catch (error) {
      console.error('Token validation error:', error);
      return NextResponse.redirect(new URL('/auth/signin', request.url));
    }
  }
  
  return null;
}

// Only use withAuth for development, use manual token validation for production
export default process.env.NODE_ENV === 'production' ? middleware : withAuth({
  callbacks: {
    authorized: ({ token, req }) => {
      // Allow API routes to pass through
      if (req.nextUrl.pathname.startsWith('/api/')) {
        return true;
      }
      
      return !!token;
    }
  },
  // Add pages configuration
  pages: {
    signIn: '/auth/signin'
  }
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
    '/((?!api/auth|api/|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|assets/|auth/signin).*)',
  ],
}