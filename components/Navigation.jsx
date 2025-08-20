import Link from "next/link";
import Image from "next/image";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faTachometerAlt, faSliders, faCog, faSignOutAlt, faBars, faUsers } from "@fortawesome/free-solid-svg-icons";
import { useSession, signIn, signOut } from "next-auth/react";
import { useRouter } from 'next/router';
import { useState, useEffect } from 'react';

export default function Navigation() {
    const { data: session } = useSession();
    const router = useRouter();
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

    // Close dropdown when clicking outside
    useEffect(() => {
        const handleClickOutside = (event) => {
            if (!event.target.closest('.dropdown')) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('click', handleClickOutside);
        return () => document.removeEventListener('click', handleClickOutside);
    }, []);

    const handleSignOut = () => {
        signOut({ callbackUrl: '/auth/signin' });
    };

    return (
        <nav className="navbar navbar-expand-lg light-theme shadow-sm sticky-top">
            <div className="container-fluid">
                {/* Logo */}
                <Link href="/" className="navbar-brand d-flex align-items-center">
                    <Image 
                        src="/assets/img/heatmanager-logo.png" 
                        alt="HeatManager Logo" 
                        width={280} 
                        height={35}
                        priority
                    />
                </Link>

                {/* Mobile Toggle Button */}
                <button 
                    className="navbar-toggler light-theme-btn border-0" 
                    type="button" 
                    onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                    aria-controls="navbarNav" 
                    aria-expanded={isMobileMenuOpen} 
                    aria-label="Toggle navigation"
                >
                    <FontAwesomeIcon icon={faBars} className="text-muted" />
                </button>

                {/* Navigation Items */}
                <div className={`navbar-collapse ${isMobileMenuOpen ? 'show' : ''}`} id="navbarNav">
                    <ul className="navbar-nav mx-auto">
                        {/* Navigation items removed - only logo and user menu remain */}
                    </ul>

                    {/* User Menu */}
                    <div className="navbar-nav ms-auto">
                        {session ? (
                            <div className="nav-item dropdown">
                                <button 
                                    className="btn btn-outline-light light-theme-btn dropdown-toggle d-flex align-items-center text-decoration-none"
                                    type="button"
                                    onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                                    aria-expanded={isDropdownOpen}
                                >
                                    <div className="user-avatar me-2">
                                        <FontAwesomeIcon icon={faUser} className="text-primary" />
                                    </div>
                                    <span className="text-muted">{session.user.name}</span>
                                </button>
                                
                                {isDropdownOpen && (
                                    <div className="dropdown-menu show shadow-sm border-0 position-absolute">
                                        <Link 
                                            href="/dashboard" 
                                            className={`dropdown-item d-flex align-items-center ${
                                                router.pathname === '/dashboard' ? 'active' : ''
                                            }`}
                                        >
                                            <FontAwesomeIcon icon={faTachometerAlt} className="me-2 text-muted" />
                                            Dashboard
                                        </Link>
                                        <Link 
                                            href="/control" 
                                            className={`dropdown-item d-flex align-items-center ${
                                                router.pathname === '/control' ? 'active' : ''
                                            }`}
                                        >
                                            <FontAwesomeIcon icon={faSliders} className="me-2 text-muted" />
                                            Steuerung
                                        </Link>
                                        <div className="dropdown-divider"></div>
                                        <Link href="/profile" className="dropdown-item d-flex align-items-center">
                                            <FontAwesomeIcon icon={faUser} className="me-2 text-muted" />
                                            Profil
                                        </Link>
                                        <Link 
                                            href="/config" 
                                            className={`dropdown-item d-flex align-items-center ${
                                                router.pathname.startsWith('/config') ? 'active' : ''
                                            }`}
                                        >
                                            <FontAwesomeIcon icon={faCog} className="me-2 text-muted" />
                                            Konfiguration
                                        </Link>
                                        <Link 
                                            href="/admin/customer-sync" 
                                            className={`dropdown-item d-flex align-items-center ${
                                                router.pathname === '/admin/customer-sync' ? 'active' : ''
                                            }`}
                                        >
                                            <FontAwesomeIcon icon={faUsers} className="me-2 text-muted" />
                                            Customer-Sync
                                        </Link>
                                        <div className="dropdown-divider"></div>
                                        <button 
                                            onClick={handleSignOut}
                                            className="dropdown-item d-flex align-items-center text-danger"
                                        >
                                            <FontAwesomeIcon icon={faSignOutAlt} className="me-2" />
                                            Abmelden
                                        </button>
                                    </div>
                                )}
                            </div>
                        ) : (
                            <button 
                                onClick={() => signIn()} 
                                className="btn btn-primary light-theme-btn d-flex align-items-center"
                            >
                                <FontAwesomeIcon icon={faUser} className="me-2" />
                                Anmelden
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </nav>
    );
}