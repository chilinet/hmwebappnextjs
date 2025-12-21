import { useState, useEffect } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Image from "next/image"
import Head from 'next/head'
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEnvelope, faUser } from "@fortawesome/free-solid-svg-icons";

export default function SignIn() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const [showForgotPassword, setShowForgotPassword] = useState(false)
    const [showForgotUsername, setShowForgotUsername] = useState(false)
    const [email, setEmail] = useState('')
    const [forgotPasswordUsername, setForgotPasswordUsername] = useState('')
    const [forgotPasswordLoading, setForgotPasswordLoading] = useState(false)
    const [forgotPasswordSuccess, setForgotPasswordSuccess] = useState(false)
    const [forgotUsernameEmail, setForgotUsernameEmail] = useState('')
    const [forgotUsernameLoading, setForgotUsernameLoading] = useState(false)
    const [forgotUsernameSuccess, setForgotUsernameSuccess] = useState(false)
    const [quote, setQuote] = useState({
        quote_text: 'Die beste Energie ist die, die wir nicht verbrauchen.',
        author: 'Angela Merkel',
        author_title: 'Ehemalige Bundeskanzlerin'
    })
    const router = useRouter()

    // Load random quote on component mount
    useEffect(() => {
        const fetchQuote = async () => {
            try {
                const response = await fetch('/api/quotes/random')
                if (response.ok) {
                    const data = await response.json()
                    setQuote(data)
                }
            } catch (error) {
                console.error('Error fetching quote:', error)
                // Keep default quote on error
            }
        }
        fetchQuote()
    }, [])

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)
        setIsLoading(true)

        try {
            const result = await signIn('credentials', {
                username,
                password,
                redirect: false,
            })

            if (result.error) {
                throw new Error(result.error)
            }

            // Erfolgreich eingeloggt, Weiterleitung zur vorherigen oder Startseite
            router.push(router.query.callbackUrl || '/')

        } catch (err) {
            setError(err.message)
        } finally {
            setIsLoading(false)
        }
    }

    const handleForgotPassword = async (e) => {
        e.preventDefault()
        setError(null)
        setForgotPasswordLoading(true)

        try {
            const response = await fetch('/api/auth/forgot-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email, username: forgotPasswordUsername }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Fehler beim Senden der E-Mail')
            }

            setForgotPasswordSuccess(true)
            setTimeout(() => {
                setShowForgotPassword(false)
                setForgotPasswordSuccess(false)
                setEmail('')
                setForgotPasswordUsername('')
            }, 5000)

        } catch (err) {
            setError(err.message)
        } finally {
            setForgotPasswordLoading(false)
        }
    }

    const handleForgotUsername = async (e) => {
        e.preventDefault()
        setError(null)
        setForgotUsernameLoading(true)

        try {
            const response = await fetch('/api/auth/forgot-username', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ email: forgotUsernameEmail }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.message || 'Fehler beim Senden der E-Mail')
            }

            setForgotUsernameSuccess(true)
            setTimeout(() => {
                setShowForgotUsername(false)
                setForgotUsernameSuccess(false)
                setForgotUsernameEmail('')
            }, 5000)

        } catch (err) {
            setError(err.message)
        } finally {
            setForgotUsernameLoading(false)
        }
    }

    return (
        <>
            <Head>
                <title>Anmelden - HeatManager</title>
                <meta name="description" content="Anmelden bei HeatManager" />
            </Head>
            
            <div className="signin-page light-theme">
                <div className="signin-container">
                    {/* Linke Seite - Anmeldefenster */}
                    <div className="signin-left">
                        <div className="signin-card">
                            <div className="card-body">
                                <div className="signin-logo">
                                    <Image
                                        src="/assets/img/heatmanager-logo.png"
                                        alt="HeatManager Logo"
                                        width={280}
                                        height={35}
                                        priority
                                    />
                                </div>
                                
                                {error && (
                                    <div className="alert alert-danger" role="alert">
                                        <strong>Fehler:</strong> {error}
                                    </div>
                                )}
                                
                                <form onSubmit={handleSubmit} className="signin-form">
                                    <div className="mb-3">
                                        <label className="form-label">Benutzername</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                            disabled={isLoading}
                                            placeholder="Benutzername eingeben"
                                        />
                                    </div>
                                    
                                    <div className="mb-4">
                                        <label className="form-label">Passwort</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                            disabled={isLoading}
                                            placeholder="Passwort eingeben"
                                        />
                                    </div>
                                    
                                    <button 
                                        type="submit" 
                                        className="btn btn-primary w-100"
                                        disabled={isLoading}
                                    >
                                        {isLoading ? (
                                            <>
                                                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                Anmelden...
                                            </>
                                        ) : (
                                            'Anmelden'
                                        )}
                                    </button>
                                </form>

                                {/* Passwort vergessen und Benutzername vergessen Links */}
                                <div className="mt-3 text-center">
                                    <div className="d-flex justify-content-center gap-3 flex-wrap">
                                        <button
                                            type="button"
                                            className="btn btn-link text-decoration-none p-0"
                                            onClick={() => setShowForgotUsername(true)}
                                            disabled={isLoading}
                                        >
                                            Benutzername vergessen?
                                        </button>
                                        <span className="text-muted">|</span>
                                        <button
                                            type="button"
                                            className="btn btn-link text-decoration-none p-0"
                                            onClick={() => setShowForgotPassword(true)}
                                            disabled={isLoading}
                                        >
                                            Passwort vergessen?
                                        </button>
                                    </div>
                                </div>
                                
                                <div className="mt-4 text-center">
                                    <small className="text-muted">
                                        HeatManager - Intelligente Heizungssteuerung
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rechte Seite - Weißer Bereich */}
                    <div className="signin-right">
                        <div className="quote-container">
                            <div className="quote-content">
                                <div className="quote-text">
                                    &ldquo;{quote.quote_text}&rdquo;
                                </div>
                                <div className="quote-author">
                                    — {quote.author}
                                </div>
                                {quote.author_title && (
                                    <div className="quote-subtitle">
                                        {quote.author_title}
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Benutzername vergessen Modal */}
            {showForgotUsername && (
                <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <FontAwesomeIcon icon={faUser} className="me-2" />
                                    Benutzername anfordern
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => {
                                        setShowForgotUsername(false)
                                        setForgotUsernameEmail('')
                                        setError(null)
                                        setForgotUsernameSuccess(false)
                                    }}
                                ></button>
                            </div>
                            <div className="modal-body">
                                {forgotUsernameSuccess ? (
                                    <div className="alert alert-success">
                                        <strong>E-Mail gesendet!</strong><br />
                                        Falls die E-Mail-Adresse in unserem System registriert ist, erhalten Sie eine E-Mail mit Ihrem Benutzernamen.
                                    </div>
                                ) : (
                                    <>
                                        <p>Geben Sie Ihre E-Mail-Adresse ein. Wir senden Ihnen eine E-Mail mit Ihrem Benutzernamen.</p>
                                        
                                        {error && (
                                            <div className="alert alert-danger">
                                                <strong>Fehler:</strong> {error}
                                            </div>
                                        )}
                                        
                                        <form onSubmit={handleForgotUsername}>
                                            <div className="mb-3">
                                                <label className="form-label">E-Mail-Adresse</label>
                                                <input
                                                    type="email"
                                                    className="form-control"
                                                    value={forgotUsernameEmail}
                                                    onChange={(e) => setForgotUsernameEmail(e.target.value)}
                                                    required
                                                    disabled={forgotUsernameLoading}
                                                    placeholder="ihre.email@beispiel.de"
                                                />
                                            </div>
                                            
                                            <div className="d-flex gap-2">
                                                <button
                                                    type="submit"
                                                    className="btn btn-primary"
                                                    disabled={forgotUsernameLoading}
                                                >
                                                    {forgotUsernameLoading ? (
                                                        <>
                                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                            Sende...
                                                        </>
                                                    ) : (
                                                        'E-Mail senden'
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => {
                                                        setShowForgotUsername(false)
                                                        setForgotUsernameEmail('')
                                                        setError(null)
                                                        setForgotUsernameSuccess(false)
                                                    }}
                                                >
                                                    Abbrechen
                                                </button>
                                            </div>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Passwort vergessen Modal */}
            {showForgotPassword && (
                <div className="modal fade show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered">
                        <div className="modal-content">
                            <div className="modal-header">
                                <h5 className="modal-title">
                                    <FontAwesomeIcon icon={faEnvelope} className="me-2" />
                                    Passwort zurücksetzen
                                </h5>
                                <button
                                    type="button"
                                    className="btn-close"
                                    onClick={() => {
                                        setShowForgotPassword(false)
                                        setEmail('')
                                        setForgotPasswordUsername('')
                                        setError(null)
                                        setForgotPasswordSuccess(false)
                                    }}
                                ></button>
                            </div>
                            <div className="modal-body">
                                {forgotPasswordSuccess ? (
                                    <div className="alert alert-success">
                                        <strong>E-Mail gesendet!</strong><br />
                                        Falls die E-Mail-Adresse und der Benutzername in unserem System registriert sind, erhalten Sie eine E-Mail mit einem Link zum Zurücksetzen Ihres Passworts.
                                    </div>
                                ) : (
                                    <>
                                        <p>Geben Sie Ihren Benutzernamen und Ihre E-Mail-Adresse ein. Wir senden Ihnen einen Link zum Zurücksetzen Ihres Passworts.</p>
                                        
                                        {error && (
                                            <div className="alert alert-danger">
                                                <strong>Fehler:</strong> {error}
                                            </div>
                                        )}
                                        
                                        <form onSubmit={handleForgotPassword}>
                                            <div className="mb-3">
                                                <label className="form-label">Benutzername</label>
                                                <input
                                                    type="text"
                                                    className="form-control"
                                                    value={forgotPasswordUsername}
                                                    onChange={(e) => setForgotPasswordUsername(e.target.value)}
                                                    required
                                                    disabled={forgotPasswordLoading}
                                                    placeholder="Benutzername eingeben"
                                                />
                                            </div>
                                            <div className="mb-3">
                                                <label className="form-label">E-Mail-Adresse</label>
                                                <input
                                                    type="email"
                                                    className="form-control"
                                                    value={email}
                                                    onChange={(e) => setEmail(e.target.value)}
                                                    required
                                                    disabled={forgotPasswordLoading}
                                                    placeholder="ihre.email@beispiel.de"
                                                />
                                            </div>
                                            
                                            <div className="d-flex gap-2">
                                                <button
                                                    type="submit"
                                                    className="btn btn-primary"
                                                    disabled={forgotPasswordLoading}
                                                >
                                                    {forgotPasswordLoading ? (
                                                        <>
                                                            <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                                                            Sende...
                                                        </>
                                                    ) : (
                                                        'E-Mail senden'
                                                    )}
                                                </button>
                                                <button
                                                    type="button"
                                                    className="btn btn-secondary"
                                                    onClick={() => {
                                                        setShowForgotPassword(false)
                                                        setEmail('')
                                                        setForgotPasswordUsername('')
                                                        setError(null)
                                                        setForgotPasswordSuccess(false)
                                                    }}
                                                >
                                                    Abbrechen
                                                </button>
                                            </div>
                                        </form>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}

// Deaktiviere das Standard-Layout für diese Seite
SignIn.getLayout = function getLayout(page) {
    return page;
} 