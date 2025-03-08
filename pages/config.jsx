import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUsers, faUserCog, faSitemap, faUserShield } from '@fortawesome/free-solid-svg-icons';

export default function Config() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  return (
    <div className="container mt-4">
      <h2 className="mb-4 text-white">Konfiguration</h2>
      <div className="row g-4">
        {/* Kundenverwaltung Kachel */}
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

        {/* Rollen und Berechtigungen Kachel */}
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