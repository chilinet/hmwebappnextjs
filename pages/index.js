import { useSession } from 'next-auth/react';
import { useState } from 'react';

export default function Home() {
  const { data: session } = useSession();
  const [error, setError] = useState(null);

  return (
    <>
      <h1>Index js</h1>
    </>
  );
}
