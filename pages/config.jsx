import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faUserCog, faSitemap, faUserShield, faGears } from '@fortawesome/free-solid-svg-icons';
import { useEffect, useState } from 'react';

export default function Config() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [userRole, setUserRole] = useState(null);

  useEffect(() => {
    if (session?.token) {
      fetchUserRole();
    }
  }, [session]);

  const fetchUserRole = async () => {
    try {
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user role');
      }

      const data = await response.json();
      setUserRole(data.role);
    } catch (error) {
      console.error('Error fetching user role:', error);
    }
  };

  const isSuperAdmin = userRole === 1;

  return (
    <div className="container mt-4">
      <h2 className="mb-4 text-white">Konfiguration</h2>
      <div className="row g-4">
        {/* Kundenverwaltung Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                style={{ 
                  cursor: 'pointer',
                  backgroundColor: '#2C3E50',
                  transition: 'background-color 0.3s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
                onClick={() => router.push('/config/customers')}>
              <div className="card-body">
                <FontAwesomeIcon icon={faUsers} size="3x" className="mb-3 text-white" />
                <h5 className="card-title text-white">Kundenverwaltung</h5>
                <p className="card-text text-white-50">
                  Kunden anlegen, bearbeiten und verwalten
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Benutzerverwaltung Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#2C3E50',
                 transition: 'background-color 0.3s'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
               onClick={() => router.push('/config/users')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faUserCog} size="3x" className="mb-3 text-white" />
              <h5 className="card-title text-white">Benutzerverwaltung</h5>
              <p className="card-text text-white-50">
                Benutzer und Berechtigungen verwalten
              </p>
            </div>
          </div>
        </div>

        {/* Objektstruktur Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#2C3E50',
                 transition: 'background-color 0.3s'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
               onClick={() => router.push('/config/structure')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faSitemap} size="3x" className="mb-3 text-white" />
              <h5 className="card-title text-white">Objektstruktur</h5>
              <p className="card-text text-white-50">
                Gebäude und Anlagenstruktur verwalten
              </p>
            </div>
          </div>
        </div>

        {/* Rollen und Berechtigungen Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                style={{ 
                  cursor: 'pointer',
                  backgroundColor: '#2C3E50',
                  transition: 'background-color 0.3s'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
                onClick={() => router.push('/config/roles')}>
              <div className="card-body">
                <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-3 text-white" />
                <h5 className="card-title text-white">Rollen und Berechtigungen</h5>
                <p className="card-text text-white-50">
                  Rollen und Berechtigungen verwalten
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Prozesse Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#2C3E50',
                 transition: 'background-color 0.3s'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#1a252f'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#2C3E50'}
               onClick={() => router.push('/config/processes')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faGears} size="3x" className="mb-3 text-white" />
              <h5 className="card-title text-white">Prozesse</h5>
              <p className="card-text text-white-50">
                Prozesse verwalten
              </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}

// Server-side Überprüfung der Authentifizierung
export async function getServerSideProps(context) {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  return {
    props: {}
  };
} 