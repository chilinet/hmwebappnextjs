import { Navbar, Nav, Container } from 'react-bootstrap';
import { useSession, signOut } from "next-auth/react";
import { useRouter } from 'next/router';

export default function Layout({ children }) {
  const { data: session } = useSession();
  const router = useRouter();

  return (
    <div>
      <Navbar bg="dark" variant="dark" expand="lg">
        <Container>
          <Navbar.Brand onClick={() => router.push('/')} style={{ cursor: 'pointer' }}>
            HeatManager
          </Navbar.Brand>
          <Navbar.Toggle aria-controls="basic-navbar-nav" />
          <Navbar.Collapse id="basic-navbar-nav">
            <Nav className="me-auto">
              <Nav.Link onClick={() => router.push('/config/devices')}>
                Geräte
              </Nav.Link>
              <Nav.Link onClick={() => router.push('/api-docs')}>
                API Docs
              </Nav.Link>
            </Nav>
            <Nav>
              {session ? (
                <>
                  <span className="navbar-text me-3">
                    {session.user?.email}
                  </span>
                  <Nav.Link onClick={() => signOut()}>
                    Logout
                  </Nav.Link>
                </>
              ) : (
                <Nav.Link onClick={() => router.push('/api/auth/signin')}>
                  Login
                </Nav.Link>
              )}
            </Nav>
          </Navbar.Collapse>
        </Container>
      </Navbar>
      <main className="py-4">
        <Container>
          {children}
        </Container>
      </main>
    </div>
  );
} 