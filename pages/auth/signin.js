import { useState } from 'react'
import { signIn } from 'next-auth/react'
import { useRouter } from 'next/router'
import Image from "next/image"

export default function SignIn() {
    const [username, setUsername] = useState('')
    const [password, setPassword] = useState('')
    const [error, setError] = useState(null)
    const router = useRouter()

    const handleSubmit = async (e) => {
        e.preventDefault()
        setError(null)

        try {
            // Login über unsere eigene API, die auch den ThingsBoard-Token generiert
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username, password }),
            })

            const data = await response.json()

            if (!response.ok) {
                throw new Error(data.error || 'Login failed')
            }

            // NextAuth SignIn mit dem erhaltenen Token
            const result = await signIn('credentials', {
                username,
                password,
                token: data.token,        // JWT Token
                tbToken: data.tbToken,    // ThingsBoard Token
                redirect: false,
            })

            if (result.error) {
                throw new Error(result.error)
            }

            // Erfolgreich eingeloggt, Weiterleitung zur vorherigen oder Startseite
            router.push(router.query.callbackUrl || '/')

        } catch (err) {
            setError(err.message)
        }
    }

    return (
        <div className="min-vh-100 d-flex align-items-center justify-content-center">
            <div className="container">
                <div className="row justify-content-center">
                    <div className="col-md-6 col-lg-4">
                        <div className="card shadow" style={{ backgroundColor: '#2C3E50' }}>
                            <div className="card-body p-4">
                                <div className="text-center mb-4">
                                    <Image
                                        src="/assets/img/heatmanager-logo.png"
                                        alt="HeatManager Logo"
                                        width={280}
                                        height={35}
                                    />
                                </div>
                                {error && (
                                    <div className="alert alert-danger" role="alert">
                                        {error}
                                    </div>
                                )}
                                <form onSubmit={handleSubmit}>
                                    <div className="mb-3">
                                        <label className="form-label text-white">Benutzername</label>
                                        <input
                                            type="text"
                                            className="form-control"
                                            value={username}
                                            onChange={(e) => setUsername(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <div className="mb-3">
                                        <label className="form-label text-white">Passwort</label>
                                        <input
                                            type="password"
                                            className="form-control"
                                            value={password}
                                            onChange={(e) => setPassword(e.target.value)}
                                            required
                                        />
                                    </div>
                                    <button type="submit" className="btn btn-primary w-100">
                                        Anmelden
                                    </button>
                                </form>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

// Deaktiviere das Standard-Layout für diese Seite
SignIn.getLayout = function getLayout(page) {
    return page;
} 