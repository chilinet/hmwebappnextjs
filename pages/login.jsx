import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Login() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/auth/signin');
  }, [router]);

  return null; // oder eine Loading-Anzeige
}

// Disable default layout for this page
Login.getLayout = function getLayout(page) {
  return page;
}; 