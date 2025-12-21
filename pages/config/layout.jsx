import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faSave, faUndo, faPalette, faFont, faExpand, faImage, faTh, faIdCard } from '@fortawesome/free-solid-svg-icons';
import { Card, Button, Form, Alert, Spinner, Tabs, Tab } from 'react-bootstrap';
import Layout from '@/components/Layout';

export default function LayoutConfig() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [customerId, setCustomerId] = useState(null);
  const [userRole, setUserRole] = useState(null);
  
  // Style States
  const [styles, setStyles] = useState({
    colors: {
      primary: '#0d6efd',
      secondary: '#6c757d',
      background: '#fff3e0',
      text: '#212529',
      headerBackground: '#f8f9fa',
      cardBackground: '#ffffff',
      borderColor: '#dee2e6'
    },
    tiles: {
      backgroundColor: '#fd7e14',
      hoverBackgroundColor: '#e66a00',
      iconColor: '#800020',
      textColor: '#ffffff',
      borderRadius: '0.375rem'
    },
    cards: {
      backgroundColor: '#ffffff',
      borderColor: '#dee2e6',
      textColor: '#212529',
      borderRadius: '0.375rem',
      boxShadow: '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)'
    },
    typography: {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '16px',
      headingSize: '2rem',
      lineHeight: '1.5'
    },
    spacing: {
      padding: '1rem',
      margin: '1rem',
      borderRadius: '0.375rem'
    },
    logo: {
      url: '',
      width: '150px',
      height: 'auto'
    }
  });

  // Check if user has Superadmin role
  useEffect(() => {
    if (status === 'loading') return;
    
    if (!session) {
      router.push('/auth/signin');
      return;
    }

    // Check if user has Superadmin role (role = 1)
    if (session.user?.role !== 1) {
      router.push('/config');
      return;
    }
  }, [session, status, router]);

  useEffect(() => {
    if (session?.token) {
      fetchUserData();
    }
  }, [session]);

  const fetchUserData = async () => {
    try {
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch user data');
      }

      const data = await response.json();
      setCustomerId(data.customerid);
      setUserRole(data.role);

      // Load layout styles
      await loadLayoutStyles(data.customerid);
    } catch (err) {
      console.error('Error fetching user data:', err);
      setError('Fehler beim Laden der Benutzerdaten');
    } finally {
      setLoading(false);
    }
  };

  const loadLayoutStyles = async (customerId) => {
    try {
      const response = await fetch(`/api/config/customers/${customerId}/layout`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to load layout styles');
      }

      const result = await response.json();
      if (result.success && result.data) {
        setStyles(prevStyles => ({
          ...prevStyles,
          ...result.data,
          // Ensure tiles and cards have default values if not present
          tiles: result.data.tiles || prevStyles.tiles,
          cards: result.data.cards || prevStyles.cards
        }));
      }
    } catch (err) {
      console.error('Error loading layout styles:', err);
      // Don't show error, use defaults
    }
  };

  const handleStyleChange = (category, key, value) => {
    setStyles(prevStyles => ({
      ...prevStyles,
      [category]: {
        ...prevStyles[category],
        [key]: value
      }
    }));
    setSuccess(null);
  };

  const handleSave = async () => {
    if (!customerId) {
      setError('Keine Kunden-ID gefunden');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/config/customers/${customerId}/layout`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({ styles })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Fehler beim Speichern');
      }

      const result = await response.json();
      if (result.success) {
        setSuccess('Layout-Styles erfolgreich gespeichert! Die Änderungen werden nach einem Seitenreload sichtbar.');
        // Apply styles immediately
        applyStyles();
      } else {
        throw new Error(result.message || 'Fehler beim Speichern');
      }
    } catch (err) {
      console.error('Error saving layout styles:', err);
      setError(err.message || 'Fehler beim Speichern der Layout-Styles');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    if (confirm('Möchten Sie wirklich alle Styles zurücksetzen?')) {
      setStyles({
        colors: {
          primary: '#0d6efd',
          secondary: '#6c757d',
          background: '#fff3e0',
          text: '#212529',
          headerBackground: '#f8f9fa',
          cardBackground: '#ffffff',
          borderColor: '#dee2e6'
        },
        tiles: {
          backgroundColor: '#fd7e14',
          hoverBackgroundColor: '#e66a00',
          iconColor: '#800020',
          textColor: '#ffffff',
          borderRadius: '0.375rem'
        },
        cards: {
          backgroundColor: '#ffffff',
          borderColor: '#dee2e6',
          textColor: '#212529',
          borderRadius: '0.375rem',
          boxShadow: '0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)'
        },
        typography: {
          fontFamily: 'system-ui, -apple-system, sans-serif',
          fontSize: '16px',
          headingSize: '2rem',
          lineHeight: '1.5'
        },
        spacing: {
          padding: '1rem',
          margin: '1rem',
          borderRadius: '0.375rem'
        },
        logo: {
          url: '',
          width: '150px',
          height: 'auto'
        }
      });
      setSuccess(null);
      setError(null);
    }
  };

  const applyStyles = () => {
    // Apply styles to document root
    const root = document.documentElement;
    
    // Apply colors
    if (styles.colors) {
      root.style.setProperty('--bs-primary', styles.colors.primary);
      root.style.setProperty('--bs-secondary', styles.colors.secondary);
      root.style.setProperty('--custom-bg-color', styles.colors.background);
      root.style.setProperty('--custom-text-color', styles.colors.text);
      root.style.setProperty('--custom-header-bg', styles.colors.headerBackground);
      root.style.setProperty('--custom-card-bg', styles.colors.cardBackground);
      root.style.setProperty('--custom-border-color', styles.colors.borderColor);
    }

    // Apply typography
    if (styles.typography) {
      root.style.setProperty('--custom-font-family', styles.typography.fontFamily);
      root.style.setProperty('--custom-font-size', styles.typography.fontSize);
      root.style.setProperty('--custom-heading-size', styles.typography.headingSize);
      root.style.setProperty('--custom-line-height', styles.typography.lineHeight);
    }

    // Apply spacing
    if (styles.spacing) {
      root.style.setProperty('--custom-padding', styles.spacing.padding);
      root.style.setProperty('--custom-margin', styles.spacing.margin);
      root.style.setProperty('--custom-border-radius', styles.spacing.borderRadius);
    }

    // Apply tiles (klickbare Kacheln)
    if (styles.tiles) {
      root.style.setProperty('--custom-tile-bg', styles.tiles.backgroundColor);
      root.style.setProperty('--custom-tile-hover-bg', styles.tiles.hoverBackgroundColor);
      root.style.setProperty('--custom-tile-icon-color', styles.tiles.iconColor);
      root.style.setProperty('--custom-tile-text-color', styles.tiles.textColor);
      root.style.setProperty('--custom-tile-border-radius', styles.tiles.borderRadius);
    }

    // Apply cards (normale Karten)
    if (styles.cards) {
      root.style.setProperty('--custom-card-bg', styles.cards.backgroundColor);
      root.style.setProperty('--custom-card-border-color', styles.cards.borderColor);
      root.style.setProperty('--custom-card-text-color', styles.cards.textColor);
      root.style.setProperty('--custom-card-border-radius', styles.cards.borderRadius);
      root.style.setProperty('--custom-card-box-shadow', styles.cards.boxShadow);
    }
  };

  // Apply styles on mount and when styles change
  useEffect(() => {
    if (!loading) {
      applyStyles();
    }
  }, [styles, loading]);

  if (loading || status === 'loading') {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  // Check if user has Superadmin role
  if (!session || session.user?.role !== 1) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <h3>Keine Berechtigung</h3>
          <p>Sie haben keine Berechtigung, diese Seite aufzurufen.</p>
          <Button 
            variant="primary"
            onClick={() => router.push('/config')}
          >
            Zurück zur Konfiguration
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 mt-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4">
        <div className="d-flex align-items-center">
          <Button
            variant="outline-secondary"
            className="me-3"
            onClick={() => router.push('/config')}
          >
            <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
            Zurück
          </Button>
          <div>
            <h2 className="mb-0">Layout-Konfiguration</h2>
            <p className="text-muted mb-0">Passen Sie das Aussehen der Seite an</p>
          </div>
        </div>
        <div className="d-flex gap-2">
          <Button
            variant="outline-secondary"
            onClick={handleReset}
          >
            <FontAwesomeIcon icon={faUndo} className="me-2" />
            Zurücksetzen
          </Button>
          <Button
            variant="primary"
            onClick={handleSave}
            disabled={saving}
          >
            <FontAwesomeIcon icon={faSave} className="me-2" />
            {saving ? 'Speichere...' : 'Speichern'}
          </Button>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <Alert variant="danger" dismissible onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert variant="success" dismissible onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}

      {/* Style Configuration Tabs */}
      <Tabs defaultActiveKey="colors" className="mb-4">
        {/* Colors Tab */}
        <Tab eventKey="colors" title={
          <span>
            <FontAwesomeIcon icon={faPalette} className="me-2" />
            Farben
          </span>
        }>
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-4">Farben</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <Form.Label>Primärfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.primary}
                    onChange={(e) => handleStyleChange('colors', 'primary', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Sekundärfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.secondary}
                    onChange={(e) => handleStyleChange('colors', 'secondary', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Hintergrundfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.background}
                    onChange={(e) => handleStyleChange('colors', 'background', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Textfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.text}
                    onChange={(e) => handleStyleChange('colors', 'text', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Header-Hintergrund</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.headerBackground}
                    onChange={(e) => handleStyleChange('colors', 'headerBackground', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Karten-Hintergrund</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.cardBackground}
                    onChange={(e) => handleStyleChange('colors', 'cardBackground', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Rahmenfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.colors.borderColor}
                    onChange={(e) => handleStyleChange('colors', 'borderColor', e.target.value)}
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* Typography Tab */}
        <Tab eventKey="typography" title={
          <span>
            <FontAwesomeIcon icon={faFont} className="me-2" />
            Typografie
          </span>
        }>
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-4">Typografie</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <Form.Label>Schriftart</Form.Label>
                  <Form.Select
                    value={styles.typography.fontFamily}
                    onChange={(e) => handleStyleChange('typography', 'fontFamily', e.target.value)}
                  >
                    <option value="system-ui, -apple-system, sans-serif">System</option>
                    <option value="Arial, sans-serif">Arial</option>
                    <option value="'Helvetica Neue', Helvetica, sans-serif">Helvetica</option>
                    <option value="Georgia, serif">Georgia</option>
                    <option value="'Times New Roman', serif">Times New Roman</option>
                    <option value="'Courier New', monospace">Courier New</option>
                  </Form.Select>
                </div>
                <div className="col-md-6">
                  <Form.Label>Schriftgröße</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.typography.fontSize}
                    onChange={(e) => handleStyleChange('typography', 'fontSize', e.target.value)}
                    placeholder="z.B. 16px, 1rem"
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Überschriften-Größe</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.typography.headingSize}
                    onChange={(e) => handleStyleChange('typography', 'headingSize', e.target.value)}
                    placeholder="z.B. 2rem"
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Zeilenhöhe</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.typography.lineHeight}
                    onChange={(e) => handleStyleChange('typography', 'lineHeight', e.target.value)}
                    placeholder="z.B. 1.5"
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* Spacing Tab */}
        <Tab eventKey="spacing" title={
          <span>
            <FontAwesomeIcon icon={faExpand} className="me-2" />
            Abstände
          </span>
        }>
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-4">Abstände und Ecken</h5>
              <div className="row g-3">
                <div className="col-md-4">
                  <Form.Label>Padding</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.spacing.padding}
                    onChange={(e) => handleStyleChange('spacing', 'padding', e.target.value)}
                    placeholder="z.B. 1rem"
                  />
                </div>
                <div className="col-md-4">
                  <Form.Label>Margin</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.spacing.margin}
                    onChange={(e) => handleStyleChange('spacing', 'margin', e.target.value)}
                    placeholder="z.B. 1rem"
                  />
                </div>
                <div className="col-md-4">
                  <Form.Label>Border-Radius</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.spacing.borderRadius}
                    onChange={(e) => handleStyleChange('spacing', 'borderRadius', e.target.value)}
                    placeholder="z.B. 0.375rem"
                  />
                </div>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* Tiles Tab (Klickbare Kacheln) */}
        <Tab eventKey="tiles" title={
          <span>
            <FontAwesomeIcon icon={faTh} className="me-2" />
            Klickbare Kacheln
          </span>
        }>
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-4">Klickbare Kacheln (z.B. Config-Kacheln)</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <Form.Label>Hintergrundfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.tiles.backgroundColor}
                    onChange={(e) => handleStyleChange('tiles', 'backgroundColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Hover-Hintergrundfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.tiles.hoverBackgroundColor}
                    onChange={(e) => handleStyleChange('tiles', 'hoverBackgroundColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Icon-Farbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.tiles.iconColor}
                    onChange={(e) => handleStyleChange('tiles', 'iconColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Textfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.tiles.textColor}
                    onChange={(e) => handleStyleChange('tiles', 'textColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Border-Radius</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.tiles.borderRadius}
                    onChange={(e) => handleStyleChange('tiles', 'borderRadius', e.target.value)}
                    placeholder="z.B. 0.375rem"
                  />
                </div>
                <div className="col-md-12">
                  <div className="p-3 border rounded" style={{
                    backgroundColor: styles.tiles.backgroundColor,
                    color: styles.tiles.textColor,
                    borderRadius: styles.tiles.borderRadius,
                    cursor: 'pointer',
                    transition: 'background-color 0.3s'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = styles.tiles.hoverBackgroundColor}
                  onMouseLeave={(e) => e.target.style.backgroundColor = styles.tiles.backgroundColor}
                  >
                    <div className="text-center">
                      <FontAwesomeIcon icon={faTh} size="2x" style={{ color: styles.tiles.iconColor }} className="mb-2" />
                      <h6 style={{ color: styles.tiles.textColor }}>Beispiel-Kachel</h6>
                      <small style={{ color: styles.tiles.textColor }}>Hover-Effekt aktiv</small>
                    </div>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* Cards Tab (Normale Karten) */}
        <Tab eventKey="cards" title={
          <span>
            <FontAwesomeIcon icon={faIdCard} className="me-2" />
            Karten
          </span>
        }>
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-4">Normale Karten (z.B. Bootstrap Cards)</h5>
              <div className="row g-3">
                <div className="col-md-6">
                  <Form.Label>Hintergrundfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.cards.backgroundColor}
                    onChange={(e) => handleStyleChange('cards', 'backgroundColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Rahmenfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.cards.borderColor}
                    onChange={(e) => handleStyleChange('cards', 'borderColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Textfarbe</Form.Label>
                  <Form.Control
                    type="color"
                    value={styles.cards.textColor}
                    onChange={(e) => handleStyleChange('cards', 'textColor', e.target.value)}
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Border-Radius</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.cards.borderRadius}
                    onChange={(e) => handleStyleChange('cards', 'borderRadius', e.target.value)}
                    placeholder="z.B. 0.375rem"
                  />
                </div>
                <div className="col-md-12">
                  <Form.Label>Box-Shadow</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.cards.boxShadow}
                    onChange={(e) => handleStyleChange('cards', 'boxShadow', e.target.value)}
                    placeholder="z.B. 0 0.125rem 0.25rem rgba(0, 0, 0, 0.075)"
                  />
                  <Form.Text className="text-muted">
                    CSS Box-Shadow Wert
                  </Form.Text>
                </div>
                <div className="col-md-12">
                  <div className="p-3 border rounded" style={{
                    backgroundColor: styles.cards.backgroundColor,
                    color: styles.cards.textColor,
                    borderColor: styles.cards.borderColor,
                    borderRadius: styles.cards.borderRadius,
                    boxShadow: styles.cards.boxShadow
                  }}>
                    <h6>Beispiel-Karte</h6>
                    <p className="mb-0">Dies ist eine Beispiel-Karte mit den konfigurierten Styles.</p>
                  </div>
                </div>
              </div>
            </Card.Body>
          </Card>
        </Tab>

        {/* Logo Tab */}
        <Tab eventKey="logo" title={
          <span>
            <FontAwesomeIcon icon={faImage} className="me-2" />
            Logo
          </span>
        }>
          <Card className="mt-3">
            <Card.Body>
              <h5 className="mb-4">Logo-Einstellungen</h5>
              <div className="row g-3">
                <div className="col-md-12">
                  <Form.Label>Logo-URL</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.logo.url}
                    onChange={(e) => handleStyleChange('logo', 'url', e.target.value)}
                    placeholder="https://example.com/logo.png"
                  />
                  <Form.Text className="text-muted">
                    URL zum Logo-Bild
                  </Form.Text>
                </div>
                <div className="col-md-6">
                  <Form.Label>Breite</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.logo.width}
                    onChange={(e) => handleStyleChange('logo', 'width', e.target.value)}
                    placeholder="z.B. 150px"
                  />
                </div>
                <div className="col-md-6">
                  <Form.Label>Höhe</Form.Label>
                  <Form.Control
                    type="text"
                    value={styles.logo.height}
                    onChange={(e) => handleStyleChange('logo', 'height', e.target.value)}
                    placeholder="z.B. auto oder 50px"
                  />
                </div>
                {styles.logo.url && (
                  <div className="col-md-12">
                    <Form.Label>Vorschau</Form.Label>
                    <div className="border p-3 text-center" style={{ minHeight: '100px' }}>
                      <img
                        src={styles.logo.url}
                        alt="Logo Vorschau"
                        style={{
                          width: styles.logo.width,
                          height: styles.logo.height === 'auto' ? 'auto' : styles.logo.height,
                          maxHeight: '100px'
                        }}
                        onError={(e) => {
                          e.target.style.display = 'none';
                          e.target.nextSibling.style.display = 'block';
                        }}
                      />
                      <div style={{ display: 'none', color: '#999' }}>
                        Logo konnte nicht geladen werden
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </Card.Body>
          </Card>
        </Tab>
      </Tabs>

      {/* Preview Section */}
      <Card className="mt-4">
        <Card.Header>
          <h5 className="mb-0">Vorschau</h5>
        </Card.Header>
        <Card.Body>
          <div className="p-4" style={{
            backgroundColor: styles.colors.background,
            color: styles.colors.text,
            fontFamily: styles.typography.fontFamily,
            fontSize: styles.typography.fontSize,
            lineHeight: styles.typography.lineHeight,
            borderRadius: styles.spacing.borderRadius
          }}>
            <h3 style={{ fontSize: styles.typography.headingSize, marginBottom: styles.spacing.margin }}>
              Beispiel-Überschrift
            </h3>
            <p style={{ marginBottom: styles.spacing.margin }}>
              Dies ist ein Beispieltext, um die Typografie-Einstellungen zu zeigen.
              Die Schriftart, Größe und Zeilenhöhe können hier angepasst werden.
            </p>
            
            {/* Klickbare Kachel Vorschau */}
            <div className="mb-4">
              <h5 className="mb-3">Klickbare Kachel</h5>
              <div className="row">
                <div className="col-md-4">
                  <div className="p-4 text-center" style={{
                    backgroundColor: styles.tiles.backgroundColor,
                    color: styles.tiles.textColor,
                    borderRadius: styles.tiles.borderRadius,
                    cursor: 'pointer',
                    transition: 'background-color 0.3s'
                  }}
                  onMouseEnter={(e) => e.target.style.backgroundColor = styles.tiles.hoverBackgroundColor}
                  onMouseLeave={(e) => e.target.style.backgroundColor = styles.tiles.backgroundColor}
                  >
                    <FontAwesomeIcon icon={faTh} size="2x" style={{ color: styles.tiles.iconColor }} className="mb-2" />
                    <h6 style={{ color: styles.tiles.textColor }}>Kachel-Titel</h6>
                    <small style={{ color: styles.tiles.textColor }}>Klickbar</small>
                  </div>
                </div>
              </div>
            </div>

            {/* Normale Karte Vorschau */}
            <div className="mb-4">
              <h5 className="mb-3">Normale Karte</h5>
              <div className="p-3" style={{
                backgroundColor: styles.cards.backgroundColor,
                color: styles.cards.textColor,
                border: `1px solid ${styles.cards.borderColor}`,
                borderRadius: styles.cards.borderRadius,
                boxShadow: styles.cards.boxShadow,
                padding: styles.spacing.padding
              }}>
                <h6>Karten-Titel</h6>
                <p className="mb-0">Beispiel-Karte mit angepassten Farben, Rahmen und Schatten</p>
              </div>
            </div>

            <div className="mt-3">
              <Button variant="primary" style={{ backgroundColor: styles.colors.primary, borderColor: styles.colors.primary }}>
                Primärer Button
              </Button>
              <Button variant="secondary" className="ms-2" style={{ backgroundColor: styles.colors.secondary, borderColor: styles.colors.secondary }}>
                Sekundärer Button
              </Button>
            </div>
          </div>
        </Card.Body>
      </Card>
    </div>
  );
}

LayoutConfig.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

