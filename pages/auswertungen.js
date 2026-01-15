import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState, useMemo, useRef } from 'react';
import Layout from '@/components/Layout';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faThermometerHalf, faArrowLeft, faSync, faDownload, faSearch, faArrowUp } from '@fortawesome/free-solid-svg-icons';
import { Table, Spinner, Alert, Button, Form, InputGroup, Badge } from 'react-bootstrap';
import Head from 'next/head';
import styles from '@/styles/config.module.css';
import * as XLSX from 'xlsx';

export default function Auswertungen() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [showTemperaturen, setShowTemperaturen] = useState(false);
  const [temperaturenData, setTemperaturenData] = useState([]);
  const [treeData, setTreeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProfile, setSelectedProfile] = useState('all');
  const [showDevicesWithoutPath, setShowDevicesWithoutPath] = useState(false);
  const [showInactiveDevices, setShowInactiveDevices] = useState(false);
  const [selectedLevel1, setSelectedLevel1] = useState('all');
  const [selectedLevel2, setSelectedLevel2] = useState('all');
  const [selectedLevel3, setSelectedLevel3] = useState('all');
  const [selectedLevel4, setSelectedLevel4] = useState('all');
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const tableContainerRef = useRef(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  // Handle scroll events for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollToTop(scrollTop > 100);
    };

    const handleTableScroll = (event) => {
      const scrollTop = event.target.scrollTop;
      setShowScrollToTop(scrollTop > 100);
    };

    window.addEventListener('scroll', handleScroll);
    
    const tableContainer = document.querySelector('.table-responsive');
    if (tableContainer) {
      tableContainer.addEventListener('scroll', handleTableScroll);
    }

    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (tableContainer) {
        tableContainer.removeEventListener('scroll', handleTableScroll);
      }
    };
  }, []);

  // Add ref to table container and set up scroll listener
  useEffect(() => {
    if (tableContainerRef.current) {
      const handleTableScroll = (event) => {
        const scrollTop = event.target.scrollTop;
        setShowScrollToTop(scrollTop > 50);
      };

      tableContainerRef.current.addEventListener('scroll', handleTableScroll);
      
      return () => {
        if (tableContainerRef.current) {
          tableContainerRef.current.removeEventListener('scroll', handleTableScroll);
        }
      };
    }
  }, [temperaturenData]);

  // Helper function to find asset path in tree
  const findAssetPath = (assetId, treeNodes, currentPath = []) => {
    if (!treeNodes || !Array.isArray(treeNodes)) return null;
    
    for (const node of treeNodes) {
      const newPath = [...currentPath, node.label];
      
      if (node.id === assetId) {
        return newPath;
      }
      
      if (node.children && node.children.length > 0) {
        const foundPath = findAssetPath(assetId, node.children, newPath);
        if (foundPath) {
          return foundPath;
        }
      }
    }
    return null;
  };

  // Helper function to get asset path as array (without Level 0)
  const getAssetPathArray = (assetId) => {
    if (!treeData || !assetId) return [];
    
    const path = findAssetPath(assetId, treeData);
    if (path && path.length > 0) {
      // Entferne den obersten Node-Level (Level 0), da dieser immer gleich ist
      return path.length > 1 ? path.slice(1) : path;
    }
    return [];
  };

  // Helper function to get asset path string
  const getAssetPathString = (assetId) => {
    const pathArray = getAssetPathArray(assetId);
    return pathArray.length > 0 ? pathArray.join(' → ') : '-';
  };

  // Get available options for each level based on selected parent levels
  const getAvailableLevelOptions = useMemo(() => {
    if (!temperaturenData || temperaturenData.length === 0) {
      return { level1: [], level2: [], level3: [], level4: [] };
    }

    const level1Options = new Set();
    const level2Options = new Set();
    const level3Options = new Set();
    const level4Options = new Set();

    temperaturenData.forEach(row => {
      const pathArray = getAssetPathArray(row.asset_id);
      
      // Filter based on selected parent levels
      if (selectedLevel1 !== 'all' && pathArray[0] !== selectedLevel1) return;
      if (selectedLevel2 !== 'all' && pathArray[1] !== selectedLevel2) return;
      if (selectedLevel3 !== 'all' && pathArray[2] !== selectedLevel3) return;

      if (pathArray.length > 0) level1Options.add(pathArray[0]);
      if (pathArray.length > 1 && (selectedLevel1 === 'all' || pathArray[0] === selectedLevel1)) {
        level2Options.add(pathArray[1]);
      }
      if (pathArray.length > 2 && 
          (selectedLevel1 === 'all' || pathArray[0] === selectedLevel1) &&
          (selectedLevel2 === 'all' || pathArray[1] === selectedLevel2)) {
        level3Options.add(pathArray[2]);
      }
      if (pathArray.length > 3 && 
          (selectedLevel1 === 'all' || pathArray[0] === selectedLevel1) &&
          (selectedLevel2 === 'all' || pathArray[1] === selectedLevel2) &&
          (selectedLevel3 === 'all' || pathArray[2] === selectedLevel3)) {
        level4Options.add(pathArray[3]);
      }
    });

    return {
      level1: Array.from(level1Options).sort(),
      level2: Array.from(level2Options).sort(),
      level3: Array.from(level3Options).sort(),
      level4: Array.from(level4Options).sort()
    };
  }, [temperaturenData, selectedLevel1, selectedLevel2, selectedLevel3, treeData]);

  const loadTemperaturenData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load temperaturen data
      const response = await fetch('/api/auswertungen/temperaturen');
      
      if (!response.ok) {
        throw new Error('Fehler beim Laden der Daten');
      }
      
      const result = await response.json();
      setTemperaturenData(result.data || []);

      // Load tree data if customerid is available
      if (session?.user?.customerid) {
        try {
          const treeResponse = await fetch(`/api/config/customers/${session.user.customerid}/tree`);
          if (treeResponse.ok) {
            const treeDataResult = await treeResponse.json();
            setTreeData(treeDataResult);
            console.log('Tree data loaded:', treeDataResult);
          }
        } catch (treeError) {
          console.error('Error loading tree data:', treeError);
          // Don't fail the whole request if tree data fails
        }
      }
    } catch (err) {
      console.error('Error loading temperaturen data:', err);
      setError(err.message || 'Fehler beim Laden der Daten');
    } finally {
      setLoading(false);
    }
  };

  const refreshTemperaturenData = async () => {
    setIsRefreshing(true);
    try {
      await loadTemperaturenData();
    } catch (error) {
      console.error('Error refreshing temperaturen data:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleTileClick = (tileName) => {
    if (tileName === 'Temperaturen') {
      setShowTemperaturen(true);
      loadTemperaturenData();
    }
  };

  const handleBack = () => {
    setShowTemperaturen(false);
    setTemperaturenData([]);
    setError(null);
    setSearchTerm('');
    setSelectedProfile('all');
    setShowDevicesWithoutPath(false);
    setShowInactiveDevices(false);
    setSelectedLevel1('all');
    setSelectedLevel2('all');
    setSelectedLevel3('all');
    setSelectedLevel4('all');
  };

  // Handle level selection - reset child levels when parent level changes
  const handleLevel1Change = (value) => {
    setSelectedLevel1(value);
    setSelectedLevel2('all');
    setSelectedLevel3('all');
    setSelectedLevel4('all');
  };

  const handleLevel2Change = (value) => {
    setSelectedLevel2(value);
    setSelectedLevel3('all');
    setSelectedLevel4('all');
  };

  const handleLevel3Change = (value) => {
    setSelectedLevel3(value);
    setSelectedLevel4('all');
  };

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  const exportTemperaturenData = () => {
    try {
      const excelData = filteredTemperaturenData.map(row => ({
        'Gerät Name': row.device_name || '-',
        'Gerät Label': row.device_label || '-',
        'Device Profile': row.device_profile || '-',
        'Status': row.device_active ? 'Aktiv' : 'Inaktiv',
        'Pfad': getAssetPathString(row.asset_id),
        'Sensor Temperatur (°C)': row.sensortemperature !== null && row.sensortemperature !== undefined
          ? parseFloat(row.sensortemperature).toFixed(2)
          : '-',
        'Ventil Offen (%)': row.percentvalveopen !== null && row.percentvalveopen !== undefined
          ? parseFloat(row.percentvalveopen).toFixed(1)
          : '-',
        'Ziel Temperatur (°C)': row.targettemperature !== null && row.targettemperature !== undefined
          ? parseFloat(row.targettemperature).toFixed(2)
          : '-',
        'Letzte Aktualisierung': row.last_update_ts
          ? new Date(row.last_update_ts).toLocaleString('de-DE', {
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit'
            })
          : '-'
      }));

      const worksheet = XLSX.utils.json_to_sheet(excelData);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Temperaturen');

      const columnWidths = [
        { wch: 20 }, // Gerät Name
        { wch: 20 }, // Gerät Label
        { wch: 15 }, // Device Profile
        { wch: 12 }, // Status
        { wch: 40 }, // Pfad
        { wch: 18 }, // Sensor Temperatur
        { wch: 15 }, // Ventil Offen
        { wch: 18 }, // Ziel Temperatur
        { wch: 25 }  // Letzte Aktualisierung
      ];
      worksheet['!cols'] = columnWidths;

      const fileName = `temperaturen_${new Date().toISOString().split('T')[0]}.xlsx`;
      XLSX.writeFile(workbook, fileName);
    } catch (error) {
      console.error('Error exporting temperaturen data:', error);
      alert('Fehler beim Exportieren der Daten: ' + error.message);
    }
  };

  // Filter temperaturen data based on search term and filters
  const filteredTemperaturenData = useMemo(() => {
    if (!temperaturenData || temperaturenData.length === 0) return [];

    const searchLower = (searchTerm || '').toLowerCase();
    const filtered = temperaturenData.filter(row => {
      const pathArray = getAssetPathArray(row.asset_id);
      const assetPath = getAssetPathString(row.asset_id);
      const hasPath = assetPath && assetPath !== '-';
      
      // Filter: Devices ohne Pfad ausblenden (wenn showDevicesWithoutPath false ist)
      if (!showDevicesWithoutPath && !hasPath) {
        return false;
      }
      
      // Filter: Inaktive Devices ausblenden (wenn showInactiveDevices false ist)
      if (!showInactiveDevices && !row.device_active) {
        return false;
      }

      // Filter: Pfad-Level Filter
      if (selectedLevel1 !== 'all' && pathArray[0] !== selectedLevel1) {
        return false;
      }
      if (selectedLevel2 !== 'all' && pathArray[1] !== selectedLevel2) {
        return false;
      }
      if (selectedLevel3 !== 'all' && pathArray[2] !== selectedLevel3) {
        return false;
      }
      if (selectedLevel4 !== 'all' && pathArray[3] !== selectedLevel4) {
        return false;
      }
      
      const matchesSearch = !searchTerm || 
        (row.device_name || '').toLowerCase().includes(searchLower) ||
        (row.device_label || '').toLowerCase().includes(searchLower) ||
        (row.device_profile || '').toLowerCase().includes(searchLower) ||
        assetPath.toLowerCase().includes(searchLower);

      const matchesProfile = selectedProfile === 'all' || row.device_profile === selectedProfile;

      return matchesSearch && matchesProfile;
    });

    // Sortiere nach Pfad
    return filtered.sort((a, b) => {
      const pathA = getAssetPathString(a.asset_id);
      const pathB = getAssetPathString(b.asset_id);
      
      // Vergleiche die Pfade alphabetisch
      if (pathA < pathB) return -1;
      if (pathA > pathB) return 1;
      
      // Falls Pfade gleich sind, sortiere nach Gerät Name
      const nameA = (a.device_name || '').toLowerCase();
      const nameB = (b.device_name || '').toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      
      return 0;
    });
  }, [temperaturenData, searchTerm, selectedProfile, showDevicesWithoutPath, showInactiveDevices, selectedLevel1, selectedLevel2, selectedLevel3, selectedLevel4, treeData]);

  if (status === "loading") {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <Spinner animation="border" />
          <p className="mt-3 text-muted">Session wird geladen...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return null;
  }

  return (
    <>
      <Head>
        <title>HeatManager - Auswertungen</title>
        <meta name="description" content="HeatManager - Auswertungen und Analysen" />
      </Head>
      
      <div className={`container mt-4 ${styles.container}`}>
        {!showTemperaturen ? (
          <>
            <h1 className={`mb-4 ${styles.heading}`}>Auswertungen</h1>
            <div className="row g-4">
              <div className="col-md-4">
                <div className={`card h-100 text-center p-4 ${styles.cardOrange}`} 
                    onClick={() => handleTileClick('Temperaturen')}>
                  <div className="card-body">
                    <FontAwesomeIcon icon={faThermometerHalf} size="3x" className={`mb-3 ${styles.iconOrange}`} />
                    <h5 className={`card-title ${styles.titleOrange}`}>Temperaturen</h5>
                    <p className={`card-text ${styles.textOrange}`}>
                      Temperaturauswertungen und Analysen
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="container-fluid px-4 mt-4">
            <div className="d-flex justify-content-between align-items-center mb-4">
              <div className="d-flex align-items-center">
                <Button
                  variant="outline-secondary"
                  className="me-3"
                  onClick={handleBack}
                >
                  <FontAwesomeIcon icon={faArrowLeft} className="me-2" />
                  Zurück
                </Button>
                <h2 className="text-white mb-0">Temperaturen</h2>
              </div>
              <div className="d-flex gap-2">
                <Button
                  variant="outline-light"
                  size="sm"
                  onClick={refreshTemperaturenData}
                  disabled={isRefreshing}
                >
                  <FontAwesomeIcon icon={faSync} spin={isRefreshing} className="me-2" />
                  {isRefreshing ? 'Aktualisiere...' : 'Aktualisieren'}
                </Button>
                <Button
                  variant="outline-info"
                  size="sm"
                  onClick={exportTemperaturenData}
                  disabled={filteredTemperaturenData.length === 0}
                >
                  <FontAwesomeIcon icon={faDownload} className="me-2" />
                  Export
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="danger" className="mb-3">
                {error}
              </Alert>
            )}

            {/* Search Bar */}
            <div className="mb-4">
              <InputGroup>
                <InputGroup.Text>
                  <FontAwesomeIcon icon={faSearch} />
                </InputGroup.Text>
                <Form.Control
                  placeholder="Suche nach Gerät, Label, Device Profile oder Pfad..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </InputGroup>
            </div>

            {/* Filter Row */}
            <div className="row mb-4 g-3">
              <div className="col-md-2">
                <Form.Select 
                  value={selectedProfile} 
                  onChange={(e) => setSelectedProfile(e.target.value)}
                  className="form-select-sm"
                >
                  <option value="all">Alle Device Profiles</option>
                  {Array.from(new Set(temperaturenData.map(d => d.device_profile).filter(Boolean))).sort().map(profile => (
                    <option key={profile} value={profile}>{profile}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-2">
                <Form.Select 
                  value={selectedLevel1} 
                  onChange={(e) => handleLevel1Change(e.target.value)}
                  className="form-select-sm"
                >
                  <option value="all">Level 1: Alle</option>
                  {getAvailableLevelOptions.level1.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-2">
                <Form.Select 
                  value={selectedLevel2} 
                  onChange={(e) => handleLevel2Change(e.target.value)}
                  className="form-select-sm"
                  disabled={selectedLevel1 === 'all'}
                >
                  <option value="all">Level 2: Alle</option>
                  {getAvailableLevelOptions.level2.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-2">
                <Form.Select 
                  value={selectedLevel3} 
                  onChange={(e) => handleLevel3Change(e.target.value)}
                  className="form-select-sm"
                  disabled={selectedLevel2 === 'all'}
                >
                  <option value="all">Level 3: Alle</option>
                  {getAvailableLevelOptions.level3.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-2">
                <Form.Select 
                  value={selectedLevel4} 
                  onChange={(e) => setSelectedLevel4(e.target.value)}
                  className="form-select-sm"
                  disabled={selectedLevel3 === 'all'}
                >
                  <option value="all">Level 4: Alle</option>
                  {getAvailableLevelOptions.level4.map(level => (
                    <option key={level} value={level}>{level}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-md-2">
                <Button
                  variant="outline-secondary"
                  size="sm"
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedProfile('all');
                    setShowDevicesWithoutPath(false);
                    setShowInactiveDevices(false);
                    setSelectedLevel1('all');
                    setSelectedLevel2('all');
                    setSelectedLevel3('all');
                    setSelectedLevel4('all');
                  }}
                  className="w-100"
                >
                  Filter zurücksetzen
                </Button>
              </div>
            </div>

            {/* Checkbox Filter Row */}
            <div className="row mb-4 g-3">
              <div className="col-md-6">
                <Form.Check
                  type="checkbox"
                  id="showDevicesWithoutPath"
                  label="Geräte ohne Pfad anzeigen"
                  checked={showDevicesWithoutPath}
                  onChange={(e) => setShowDevicesWithoutPath(e.target.checked)}
                />
              </div>
              <div className="col-md-6">
                <Form.Check
                  type="checkbox"
                  id="showInactiveDevices"
                  label="Inaktive Geräte anzeigen"
                  checked={showInactiveDevices}
                  onChange={(e) => setShowInactiveDevices(e.target.checked)}
                />
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="text-center py-5">
                <Spinner animation="border" variant="primary" size="lg" className="me-3" />
                <div className="mt-3">
                  <h5 className="text-white">Lade Daten...</h5>
                  <p className="text-muted">Bitte warten Sie, während die Daten abgerufen werden.</p>
                </div>
              </div>
            )}

            {/* Table - nur anzeigen wenn nicht geladen wird */}
            {!loading && (
              <div ref={tableContainerRef} className="table-responsive" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                <Table striped bordered hover className="text-start" style={{ marginBottom: 0 }}>
                  <thead style={{ 
                    position: 'sticky', 
                    top: 0, 
                    zIndex: 1, 
                    backgroundColor: 'var(--bs-table-bg)',
                    boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
                  }}>
                    <tr>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Gerät Name</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Gerät Label</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Device Profile</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Status</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Pfad</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Sensor Temperatur</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Ventil Offen (%)</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Ziel Temperatur</th>
                      <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Letzte Aktualisierung</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredTemperaturenData.length === 0 ? (
                      <tr>
                        <td colSpan="9" className="text-center text-muted">
                          Keine Daten gefunden
                        </td>
                      </tr>
                    ) : (
                      filteredTemperaturenData.map((row, index) => (
                        <tr key={index}>
                          <td>{row.device_name || '-'}</td>
                          <td>{row.device_label || '-'}</td>
                          <td>{row.device_profile || '-'}</td>
                          <td>
                            <Badge bg={row.device_active ? 'success' : 'danger'}>
                              {row.device_active ? 'Aktiv' : 'Inaktiv'}
                            </Badge>
                          </td>
                          <td>
                            <small className="text-dark">{getAssetPathString(row.asset_id)}</small>
                          </td>
                          <td>
                            {row.sensortemperature !== null && row.sensortemperature !== undefined
                              ? `${parseFloat(row.sensortemperature).toFixed(2)} °C`
                              : '-'}
                          </td>
                          <td>
                            {row.percentvalveopen !== null && row.percentvalveopen !== undefined
                              ? `${parseFloat(row.percentvalveopen).toFixed(1)}%`
                              : '-'}
                          </td>
                          <td>
                            {row.targettemperature !== null && row.targettemperature !== undefined
                              ? `${parseFloat(row.targettemperature).toFixed(2)} °C`
                              : '-'}
                          </td>
                          <td>
                            {row.last_update_ts
                              ? new Date(row.last_update_ts).toLocaleString('de-DE', {
                                  year: 'numeric',
                                  month: '2-digit',
                                  day: '2-digit',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                  second: '2-digit'
                                })
                              : '-'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </Table>
              </div>
            )}

            {/* Scroll to Top Button */}
            <Button
              variant="primary"
              size="lg"
              className="position-fixed"
              style={{
                bottom: '30px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                borderRadius: '50%',
                width: '60px',
                height: '60px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
                opacity: showScrollToTop ? 1 : 0.3
              }}
              onClick={scrollToTop}
              title="Nach oben scrollen"
            >
              <FontAwesomeIcon icon={faArrowUp} />
            </Button>
          </div>
        )}
      </div>
    </>
  );
}

Auswertungen.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};
