import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faUserCog, faSitemap, faUserShield, faGears, faBoxes, faCalendarAlt } from '@fortawesome/free-solid-svg-icons';
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
      <h1 className="mb-4" style={{ color: '#fd7e14', fontSize: '2.5rem', fontWeight: 'bold' }}>Konfiguration</h1>
      <div className="row g-4">
        {/* Kundenverwaltung Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                style={{ 
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                  transition: 'background-color 0.3s',
                  border: '1px solid #dee2e6'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                onClick={() => router.push('/config/customers')}>
              <div className="card-body">
                <FontAwesomeIcon icon={faUsers} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
                <h5 className="card-title" style={{ color: '#fd7e14' }}>Kundenverwaltung</h5>
                <p className="card-text text-muted">
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
                 backgroundColor: '#ffffff',
                 transition: 'background-color 0.3s',
                 border: '1px solid #dee2e6'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
               onClick={() => router.push('/config/users')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faUserCog} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
              <h5 className="card-title" style={{ color: '#fd7e14' }}>Benutzerverwaltung</h5>
              <p className="card-text text-muted">
                Benutzer und Berechtigungen verwalten
              </p>
            </div>
          </div>
        </div>

        {/* Objektstruktur Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                 style={{ 
                   cursor: 'pointer',
                   backgroundColor: '#ffffff',
                   transition: 'background-color 0.3s',
                   border: '1px solid #dee2e6'
                 }}
                 onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                 onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                 onClick={() => router.push('/config/structure')}>
              <div className="card-body">
                <FontAwesomeIcon icon={faSitemap} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
                <h5 className="card-title" style={{ color: '#fd7e14' }}>Objektstruktur</h5>
                <p className="card-text text-muted">
                  Gebäude und Anlagenstruktur verwalten
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Rollen und Berechtigungen Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                style={{ 
                  cursor: 'pointer',
                  backgroundColor: '#ffffff',
                  transition: 'background-color 0.3s',
                  border: '1px solid #dee2e6'
                }}
                onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                onClick={() => router.push('/config/roles')}>
              <div className="card-body">
                <FontAwesomeIcon icon={faUserShield} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
                <h5 className="card-title" style={{ color: '#fd7e14' }}>Rollen und Berechtigungen</h5>
                <p className="card-text text-muted">
                  Rollen und Berechtigungen verwalten
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Prozesse Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                 style={{ 
                   cursor: 'pointer',
                   backgroundColor: '#ffffff',
                   transition: 'background-color 0.3s',
                   border: '1px solid #dee2e6'
                 }}
                 onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                 onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                 onClick={() => router.push('/config/processes')}>
              <div className="card-body">
                <FontAwesomeIcon icon={faGears} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
                <h5 className="card-title" style={{ color: '#fd7e14' }}>Prozesse</h5>
                <p className="card-text text-muted">
                  Prozesse verwalten
                </p>
              </div>
            </div>
          </div>
        )}

        
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#ffffff',
                 transition: 'background-color 0.3s',
                 border: '1px solid #dee2e6'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
               onClick={() => router.push('/config/devices')}>
            <div className="card-body">
              <FontAwesomeIcon 
                icon={faGears} 
                className="mb-3" 
                style={{ fontSize: '2rem', color: '#fd7e14' }}
              />
              <h5 className="card-title" style={{ color: '#fd7e14' }}>Geräte</h5>
              <p className="card-text text-muted">
                Geräte verwalten
              </p>
            </div>
          </div>
        </div>

        {/* Inventar Kachel - nur für Superadmin */}
        {isSuperAdmin && (
          <div className="col-md-4">
            <div className="card h-100 text-center p-4" 
                 style={{ 
                   cursor: 'pointer',
                   backgroundColor: '#ffffff',
                   transition: 'background-color 0.3s',
                   border: '1px solid #dee2e6'
                 }}
                 onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
                 onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
                 onClick={() => router.push('/config/inventory')}>
              <div className="card-body">
                <FontAwesomeIcon 
                  icon={faBoxes} 
                  className="mb-3" 
                  style={{ fontSize: '2rem', color: '#fd7e14' }}
                />
                <h5 className="card-title" style={{ color: '#fd7e14' }}>Inventar</h5>
                <p className="card-text text-muted">
                  Inventar verwalten
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Heizpläne Kachel */}
        <div className="col-md-4">
          <div className="card h-100 text-center p-4" 
               style={{ 
                 cursor: 'pointer',
                 backgroundColor: '#ffffff',
                 transition: 'background-color 0.3s',
                 border: '1px solid #dee2e6'
               }}
               onMouseOver={e => e.currentTarget.style.backgroundColor = '#f8f9fa'}
               onMouseOut={e => e.currentTarget.style.backgroundColor = '#ffffff'}
               onClick={() => router.push('/config/heating-schedules')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faCalendarAlt} size="3x" className="mb-3" style={{ color: '#fd7e14' }} />
              <h5 className="card-title" style={{ color: '#fd7e14' }}>Heizpläne</h5>
              <p className="card-text text-muted">
                Heizpläne verwalten und konfigurieren
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