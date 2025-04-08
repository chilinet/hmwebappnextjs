import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faServer } from '@fortawesome/free-solid-svg-icons';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchStats() {
      if (session?.user?.customerId) {
        try {
          console.log('Fetching stats for customer:', session.user.customerId); // Debug
          const response = await fetch('/api/dashboard/stats');
          
          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to fetch stats');
          }
          
          const data = await response.json();
          console.log('Received stats:', data); // Debug
          setStats(data);
        } catch (err) {
          console.error('Error fetching stats:', err); // Debug
          setError(err.message);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('No customerId found in session:', session); // Debug
        setLoading(false);
      }
    }

    if (session) {
      fetchStats();
    } else {
      setLoading(false);
    }
  }, [session]);

  // Debug-Ausgabe
  console.log('Render state:', { status, loading, error, stats, session });

  if (status === "loading") {
    return <div>Loading session...</div>;
  }

  if (loading) {
    return <div>Loading stats...</div>;
  }

  if (!session) {
    return <div>No session found</div>;
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          Error: {error}
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <h1 className="mb-4">Dashboard</h1>
      
      <div className="row">
        <div className="col-md-6 mb-4">
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted mb-2">Geräte</h6>
                  <h2 className="mb-0">{stats?.devices || 0}</h2>
                </div>
                <div className="icon-shape bg-primary text-white rounded-circle p-3">
                  <FontAwesomeIcon icon={faServer} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>

        <div className="col-md-6 mb-4">
          <Card className="h-100 shadow-sm">
            <Card.Body>
              <div className="d-flex justify-content-between align-items-center">
                <div>
                  <h6 className="text-muted mb-2">Benutzer</h6>
                  <h2 className="mb-0">{stats?.users || 0}</h2>
                </div>
                <div className="icon-shape bg-success text-white rounded-circle p-3">
                  <FontAwesomeIcon icon={faUsers} />
                </div>
              </div>
            </Card.Body>
          </Card>
        </div>
      </div>
    </div>
  );
}

Home.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
