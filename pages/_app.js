import "bootstrap/dist/css/bootstrap.min.css";
import "@/styles/globals.css";
import "@/styles/light-theme.css";
import "@/styles/navigation-overrides.css";
import Layout from "@/components/Layout";
//import { AuthProvider } from '../contexts/AuthContext';
import { SessionProvider } from "next-auth/react"
import '../lib/fontawesome'  // FontAwesome Konfiguration importieren
import { useState } from 'react'
import { ThingsboardProvider } from '@/contexts/ThingsboardContext'
import { useRouter } from 'next/router'
import AutoLogout from '../components/AutoLogout'

// Initialize ThingsBoard token refresh service (server-side only)
if (typeof window === 'undefined') {
  require('../lib/tokenRefreshInit');
}

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}) {
  const router = useRouter()
  const showLayout = router.pathname !== '/auth/signin'

  return (
    <SessionProvider session={session}>
      <ThingsboardProvider>
        <AutoLogout />
        {showLayout ? (
          <Layout>
            <Component {...pageProps} />
          </Layout>
        ) : (
          <Component {...pageProps} />
        )}
      </ThingsboardProvider>
    </SessionProvider>
  );
}
