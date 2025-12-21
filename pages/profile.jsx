import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faUser, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import styles from '@/styles/config.module.css';

export default function Profile() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  return (
    <div className={`container mt-4 ${styles.container}`}>
      <div className="d-flex align-items-center mb-4">
        <button 
          className="btn btn-outline-secondary me-3"
          onClick={() => router.back()}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <h1 className={`mb-0 ${styles.heading}`}>Profil</h1>
      </div>
      <div className="row g-4">
        {/* Benutzer ändern Kachel */}
        <div className="col-md-4">
          <div className={`card h-100 text-center p-4 ${styles.cardOrange}`} 
               onClick={() => router.push('/profile/edit-user')}>
            <div className="card-body">
              <FontAwesomeIcon icon={faUser} size="3x" className={`mb-3 ${styles.iconOrange}`} />
              <h5 className={`card-title ${styles.titleOrange}`}>Benutzer ändern</h5>
              <p className={`card-text ${styles.textOrange}`}>
                Persönliche Daten und Einstellungen ändern
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}