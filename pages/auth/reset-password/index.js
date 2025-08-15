import { useEffect } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Image from 'next/image';

export default function ResetPasswordIndex() {
  const router = useRouter();
  const { token } = router.query;

  useEffect(() => {
    if (router.isReady) {
      if (token) {
        // Wenn Token vorhanden ist, zur token-basierten Route weiterleiten
        router.replace(`/auth/reset-password/${token}`);
      } else {
        // Wenn kein Token vorhanden ist, zur Anmeldeseite weiterleiten
        router.replace('/auth/signin?error=no-token');
      }
    }
  }, [router.isReady, token, router]);

  // Lade-Animation während der Weiterleitung
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <Head>
        <title>Weiterleitung - HeatManager</title>
      </Head>
      
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <Image
            src="/assets/img/heatmanager-logo.png"
            alt="HeatManager Logo"
            width={200}
            height={60}
            className="h-12 w-auto"
          />
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Weiterleitung...
        </h2>
      </div>
      
      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <div className="flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
          <p className="mt-4 text-center text-gray-600">
            Bitte warten Sie, während wir Sie weiterleiten...
          </p>
        </div>
      </div>
    </div>
  );
}
