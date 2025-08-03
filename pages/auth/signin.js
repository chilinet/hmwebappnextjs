import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Image from "next/image"
import Head from 'next/head'

export default function SignIn() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)
    const [isLoading, setIsLoading] = useState(false)
    const router = useRouter()

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

    return (
        <>
            <Head>
                <title>Anmelden - HeatManager</title>
                <meta name="description" content="Anmelden bei HeatManager" />
            </Head>
            
            <div className="signin-page light-theme">
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
                        
                        <div className="mt-4 text-center">
                            <small className="text-muted">
                                HeatManager - Intelligente Heizungssteuerung
                            </small>
                        </div>
                    </div>
                </div>
            </div>
        </>
    )
}

// Deaktiviere das Standard-Layout für diese Seite
SignIn.getLayout = function getLayout(page) {
    return page;
} 