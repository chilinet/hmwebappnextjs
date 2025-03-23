import "@/styles/globals.css";
import "bootstrap/dist/css/bootstrap.min.css";
import Layout from "@/components/Layout";
//import { AuthProvider } from '../contexts/AuthContext';
import { SessionProvider } from "next-auth/react"
import '../lib/fontawesome'  // FontAwesome Konfiguration importieren
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ReactQueryDevtools } from '@tanstack/react-query-devtools'
import { useState } from 'react'
import { ThingsboardProvider } from '@/contexts/ThingsboardContext'
import { useRouter } from 'next/router'

export default function App({
  Component,
  pageProps: { session, ...pageProps },
}) {
  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: {
      queries: {
        refetchOnWindowFocus: true,
        refetchOnMount: true,
        staleTime: 0,
      },
    },
  }))

  const router = useRouter()
  const showLayout = router.pathname !== '/auth/signin'

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider session={session}>
        <ThingsboardProvider>
          {showLayout ? (
            <Layout>
              <Component {...pageProps} />
            </Layout>
          ) : (
            <Component {...pageProps} />
          )}
        </ThingsboardProvider>
      </SessionProvider>
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
