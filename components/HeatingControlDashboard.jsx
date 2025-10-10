import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faThermometerHalf, 
  faCog, 
  faSpinner, 
  faExclamationTriangle,
  faBuilding,
  faHome,
  faDoorOpen,
  faLayerGroup,
  faStairs,
  faMapMarkerAlt
} from '@fortawesome/free-solid-svg-icons';
import HeatingControlTreeView from './HeatingControlTreeView';

const HeatingControlDashboard = () => {
  const [treeData, setTreeData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedNode, setSelectedNode] = useState(null);

  useEffect(() => {
    loadTreeData();
  }, []);

  const loadTreeData = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await fetch('/api/heating-control/tree');
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      const data = await response.json();
      setTreeData(data);
    } catch (err) {
      console.error('Error loading tree data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleNodeClick = (node) => {
    setSelectedNode(node);
  };

  const getNodeTypeLabel = (type) => {
    const typeLabels = {
      'Property': 'Eigentum',
      'Building': 'Gebäude',
      'Floor': 'Etage',
      'Room': 'Raum',
      'Area': 'Bereich',
      'Device': 'Gerät',
      'vicki': 'Vicki Thermostat',
      'LHT52': 'LHT52 Sensor',
      'LW-eTRV': 'LW-eTRV Ventil',
      'dnt-lw-wth': 'Wandthermostat',
      'mcpanel': 'Wandpanel'
    };
    return typeLabels[type] || type;
  };

  const getNodeIcon = (type) => {
    const iconMap = {
      'Property': faMapMarkerAlt,
      'Building': faBuilding,
      'Floor': faStairs,
      'Room': faDoorOpen,
      'Area': faLayerGroup,
      'Device': faThermometerHalf,
      'vicki': faThermometerHalf,
      'LHT52': faThermometerHalf,
      'LW-eTRV': faThermometerHalf,
      'dnt-lw-wth': faCog,
      'mcpanel': faCog
    };
    return iconMap[type] || faHome;
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <FontAwesomeIcon icon={faSpinner} spin className="text-primary mb-3" size="2x" />
          <p className="text-muted">Lade Gebäudestruktur...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="alert alert-danger" role="alert">
        <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
        <strong>Fehler beim Laden der Daten:</strong> {error}
      </div>
    );
  }

  return (
    <div className="heating-control-dashboard">
      <div className="row g-0 h-100">
        {/* Linke Seite - Tree View */}
        <div className="col-md-4 border-end">
          <HeatingControlTreeView 
            treeData={treeData}
            onNodeClick={handleNodeClick}
            selectedNodeId={selectedNode?.id}
          />
        </div>
        
        {/* Rechte Seite - Details */}
        <div className="col-md-8">
          <div className="p-4">
            {selectedNode ? (
              <div className="node-details">
                <div className="d-flex align-items-center mb-3">
                  <FontAwesomeIcon 
                    icon={getNodeIcon(selectedNode.type)} 
                    className="me-3 text-primary" 
                    size="2x"
                  />
                  <div>
                    <h4 className="mb-1">{selectedNode.label || selectedNode.name}</h4>
                    <span className="badge bg-secondary">
                      {getNodeTypeLabel(selectedNode.type)}
                    </span>
                  </div>
                </div>
                
                <div className="row">
                  <div className="col-md-6">
                    <h6 className="text-muted mb-3">Grundinformationen</h6>
                    <table className="table table-sm">
                      <tbody>
                        <tr>
                          <td><strong>ID:</strong></td>
                          <td><code>{selectedNode.id}</code></td>
                        </tr>
                        <tr>
                          <td><strong>Name:</strong></td>
                          <td>{selectedNode.name}</td>
                        </tr>
                        <tr>
                          <td><strong>Typ:</strong></td>
                          <td>{getNodeTypeLabel(selectedNode.type)}</td>
                        </tr>
                        <tr>
                          <td><strong>Hat Geräte:</strong></td>
                          <td>
                            {selectedNode.hasDevices ? (
                              <span className="badge bg-success">Ja</span>
                            ) : (
                              <span className="badge bg-secondary">Nein</span>
                            )}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                  
                  <div className="col-md-6">
                    {selectedNode.relatedDevices && selectedNode.relatedDevices.length > 0 && (
                      <>
                        <h6 className="text-muted mb-3">Zugehörige Geräte</h6>
                        <div className="list-group">
                          {selectedNode.relatedDevices.map((device, index) => (
                            <div key={index} className="list-group-item">
                              <div className="d-flex align-items-center">
                                <FontAwesomeIcon 
                                  icon={getNodeIcon(device.type)} 
                                  className="me-2 text-primary"
                                />
                                <div>
                                  <div className="fw-bold">{device.label}</div>
                                  <small className="text-muted">{device.name}</small>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
                
                {/* Heizungsspezifische Informationen */}
                {(selectedNode.operationalMode !== undefined || 
                  selectedNode.fixValue !== undefined || 
                  selectedNode.maxTemp !== undefined ||
                  selectedNode.runStatus !== undefined) && (
                  <div className="mt-4">
                    <h6 className="text-muted mb-3">Heizungseinstellungen</h6>
                    <div className="row">
                      <div className="col-md-3">
                        <div className="card h-100">
                          <div className="card-body text-center">
                            <FontAwesomeIcon icon={faThermometerHalf} className="text-primary mb-2" size="lg" />
                            <h6 className="card-title">Betriebsmodus</h6>
                            <p className="card-text">
                              {selectedNode.operationalMode === 0 ? 'Aus' :
                               selectedNode.operationalMode === 1 ? 'Manuell' :
                               selectedNode.operationalMode === 2 ? 'Automatisch' :
                               selectedNode.operationalMode === 10 ? 'Zeitplan' :
                               selectedNode.operationalMode}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="col-md-3">
                        <div className="card h-100">
                          <div className="card-body text-center">
                            <FontAwesomeIcon icon={faCog} className="text-success mb-2" size="lg" />
                            <h6 className="card-title">Solltemperatur</h6>
                            <p className="card-text">
                              {selectedNode.fixValue ? `${selectedNode.fixValue}°C` : 'Nicht gesetzt'}
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="col-md-3">
                        <div className="card h-100">
                          <div className="card-body text-center">
                            <FontAwesomeIcon icon={faThermometerHalf} className="text-warning mb-2" size="lg" />
                            <h6 className="card-title">Temperaturbereich</h6>
                            <p className="card-text">
                              {selectedNode.minTemp && selectedNode.maxTemp 
                                ? `${selectedNode.minTemp}°C - ${selectedNode.maxTemp}°C`
                                : 'Nicht definiert'
                              }
                            </p>
                          </div>
                        </div>
                      </div>
                      
                      <div className="col-md-3">
                        <div className="card h-100">
                          <div className="card-body text-center">
                            <FontAwesomeIcon icon={faCog} className="text-info mb-2" size="lg" />
                            <h6 className="card-title">Status</h6>
                            <p className="card-text">
                              {selectedNode.runStatus === 'manual' ? 'Manuell' :
                               selectedNode.runStatus === 'schedule' ? 'Zeitplan' :
                               selectedNode.runStatus === 'fix' ? 'Fest' :
                               selectedNode.runStatus || 'Unbekannt'}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted py-5">
                <FontAwesomeIcon icon={faBuilding} size="3x" className="mb-3" />
                <h5>Wählen Sie einen Bereich aus</h5>
                <p>Klicken Sie auf einen Bereich in der linken Strukturansicht, um Details anzuzeigen.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeatingControlDashboard;
