import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faTachometerAlt, faSliders, faCog } from "@fortawesome/free-solid-svg-icons";
import { useSession, signIn } from "next-auth/react";
import { useRouter } from 'next/router';

export default function Navigation() {
    const { data: session } = useSession();
    const router = useRouter();

    return (
        <div className="shadow sticky-top p-3 mb-2 text-white" 
             style={{ 
                 backgroundImage: 'linear-gradient(90deg,rgb(14, 14, 14) 0%, #5C5C5C 90%)'
             }}>
            <div className="d-flex justify-content-between align-items-center">
                <Link href="/" className="me-4">
                    <Image src="/assets/img/heatmanager-logo.png" alt="logo" width={320} height={40} />
                </Link>

                {/* Zentrale Navigation */}
                <div className="d-flex gap-3 flex-grow-1 justify-content-center">
                    <Link 
                        href="/dashboard" 
                        className={`nav-item d-flex align-items-center text-white text-decoration-none px-4 py-2 rounded ${
                            router.pathname === '/dashboard' ? 'active-nav-item' : ''
                        }`}
                    >
                        <FontAwesomeIcon icon={faTachometerAlt} className="me-2" />
                        Dashboard
                    </Link>
                    
                    <Link 
                        href="/control" 
                        className={`nav-item d-flex align-items-center text-white text-decoration-none px-4 py-2 rounded ${
                            router.pathname === '/control' ? 'active-nav-item' : ''
                        }`}
                    >
                        <FontAwesomeIcon icon={faSliders} className="me-2" />
                        Steuerung
                    </Link>
                    
                    <Link 
                        href="/config" 
                        className={`nav-item d-flex align-items-center text-white text-decoration-none px-4 py-2 rounded ${
                            router.pathname === '/config' ? 'active-nav-item' : ''
                        }`}
                    >
                        <FontAwesomeIcon icon={faCog} className="me-2" />
                        Konfiguration
                    </Link>
                </div>

                <div className="d-flex align-items-center ms-4">
                    {session ? (
                        <Link href="/profile" style={{ color: 'white' }} className="d-flex align-items-center gap-2">
                            <span>{session.user.name}</span>
                            <FontAwesomeIcon icon={faUser} size="lg" />
                        </Link>
                    ) : (
                        <button onClick={() => signIn()} className="btn btn-link" style={{ color: 'white' }}>
                            <span>Anmelden</span>
                            <FontAwesomeIcon icon={faUser} size="lg" className="ms-2" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}