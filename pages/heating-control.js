import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBuilding, 
  faIndustry, 
  faMicrochip, 
  faChevronDown, 
  faChevronRight, 
  faRotateRight, 
  faSearch, 
  faTimes,
  faChartLine,
  faThermometerHalf,
  faTachometerAlt,
  faExclamationTriangle,
  faCheckCircle,
  faClock,
  faInfoCircle,
  faLayerGroup,
  faHome,
  faDoorOpen,
  faBug,
  faImage,
  faStar,
  faCog,
  faMapMarkerAlt,
  faStairs,
  faWarehouse,
  faToilet,
  faUtensils,
  faBook,
  faUsers,
  faDesktop,
  faChalkboardTeacher,
  faCrown,
  faTowerObservation,
  faTree
} from '@fortawesome/free-solid-svg-icons';
import { Tree } from '@minoru/react-dnd-treeview';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ReactECharts from 'echarts-for-react';
import TelemetryModal from '../components/TelemetryModal';

export default function HeatingControl() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [customerData, setCustomerData] = useState(null);
  const [openNodes, setOpenNodes] = useState([]);
  const [windowHeight, setWindowHeight] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [telemetryData, setTelemetryData] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [currentTemperature, setCurrentTemperature] = useState(null);
  const [loadingCurrentTemp, setLoadingCurrentTemp] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);

  // Temperature state (API only)
  const [deviceTemperatures, setDeviceTemperatures] = useState({});

  // AbortController for cancelling requests
  const [abortController, setAbortController] = useState(null);

  // Time range selection
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d'); // Default: 7 days
  const [showTimeRangeModal, setShowTimeRangeModal] = useState(false);

  const timeRangeOptions = [
    { value: '1h', label: '1 Stunde' },
    { value: '6h', label: '6 Stunden' },
    { value: '1d', label: '1 Tag' },
    { value: '7d', label: '7 Tage' },
    { value: '30d', label: '30 Tage' },
    { value: '90d', label: '90 Tage' }
  ];

  const getTimeRangeInMs = (timeRange) => {
    const now = Date.now();
    switch (timeRange) {
      case '1h': return now - (1 * 60 * 60 * 1000);
      case '6h': return now - (6 * 60 * 60 * 1000);
      case '1d': return now - (24 * 60 * 60 * 1000);
      case '7d': return now - (7 * 24 * 60 * 60 * 1000);
      case '30d': return now - (30 * 24 * 60 * 60 * 1000);
      case '90d': return now - (90 * 24 * 60 * 60 * 1000);
      default: return now - (7 * 24 * 60 * 60 * 1000);
    }
  };

  const getTimeRangeLabel = (timeRange) => {
    const option = timeRangeOptions.find(opt => opt.value === timeRange);
    return option ? option.label : '7 Tage';
  };





  const getIconForType = (type) => {
    switch (type) {
      case 'Property':
        return faMapMarkerAlt;
      case 'Building':
        return faBuilding;
      case 'Floor':
        return faStairs;
      case 'Room':
        return faDoorOpen;
      case 'Area':
        return faLayerGroup;
      case 'Device':
        return faThermometerHalf;
      case 'vicki':
        return faThermometerHalf;
      case 'LHT52':
        return faThermometerHalf;
      case 'LW-eTRV':
        return faThermometerHalf;
      case 'dnt-lw-wth':
        return faCog;
      case 'mcpanel':
        return faDesktop;
      default:
        return faHome;
    }
  };

  const getIconColor = (type) => {
    switch (type) {
      case 'Property':
        return '#6c757d'; // Gray
      case 'Building':
        return '#0d6efd'; // Blue
      case 'Floor':
        return '#198754'; // Green
      case 'Room':
        return '#fd7e14'; // Orange
      case 'Area':
        return '#6f42c1'; // Purple
      case 'Device':
      case 'vicki':
      case 'LHT52':
      case 'LW-eTRV':
      case 'dnt-lw-wth':
      case 'mcpanel':
        return '#dc3545'; // Red
      default:
        return '#6c757d'; // Gray
    }
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

  const fetchUserData = useCallback(async () => {
    try {
      console.log('🔍 Fetching user data...');
      const response = await fetch('/api/config/users/me', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        console.error('❌ User data fetch failed:', response.status, response.statusText);
        throw new Error(`Failed to fetch user data: ${response.status} ${response.statusText}`);
      }

      const userData = await response.json();
      console.log('✅ User data fetched successfully:', userData);
      setCustomerData(userData);
    } catch (err) {
      console.error('❌ Error fetching user data:', err);
      // Set a fallback customer ID if available in session
      if (session?.user?.customerid) {
        console.log('🔄 Using fallback customer ID from session:', session.user.customerid);
        setCustomerData({ customerid: session.user.customerid });
      }
    }
  }, [session?.token, session?.user?.customerid]);

  const convertToTreeViewFormat = (nodes, parentId = 0) => {
    if (!nodes || !Array.isArray(nodes)) return [];
    
    return nodes.flatMap(node => {
      const hasChildren = node.children && node.children.length > 0;
      
      const treeNode = {
        id: node.id,
        parent: parentId,
        droppable: true,
        text: node.label || node.name,
        data: {
          ...node, // Copy all properties from the original node
          type: node.type,
          hasDevices: node.hasDevices,
          label: node.label,
          name: node.name
        }
      };
      
      if (hasChildren) {
        return [treeNode, ...convertToTreeViewFormat(node.children, node.id)];
      }

      return [treeNode];
    });
  };

  const fetchTreeData = useCallback(async () => {
    if (!customerData?.customerid) {
      console.log('⏳ No customer ID available for tree data');
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      console.log('🌳 Fetching tree data for customer:', customerData.customerid);
      
      const response = await fetch(`/api/config/customers/${customerData.customerid}/tree`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      
      if (!response.ok) {
        console.error('❌ Tree data fetch failed:', response.status, response.statusText);
        throw new Error(`HTTP error! status: ${response.status} - ${response.statusText}`);
      }
      
      const data = await response.json();
      console.log('✅ Tree data received:', data);
      setTreeData(data);
    } catch (err) {
      console.error('❌ Error loading tree data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerData?.customerid, session?.token]);

  const fetchNodeDetails = async (nodeId) => {
    if (!nodeId || !customerData?.customerid) return;
    
    try {
      setLoadingDetails(true);
      setNodeDetails(null);
      
      const response = await fetch(`/api/config/assets/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch node details');
      }

      const nodeData = await response.json();
      setNodeDetails(nodeData);
    } catch (err) {
      console.error('Error fetching node details:', err);
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchTelemetryForDevices = useCallback(async (devices) => {
    if (!session?.tbToken || !devices.length) {
      return devices;
    }

    try {
      // Get all device IDs
      const deviceIds = devices.map(device => {
        if (typeof device.id === 'object' && device.id?.id) {
          return device.id.id;
        }
        return device.id;
      }).filter(id => id);

      if (deviceIds.length === 0) {
        return devices;
      }

      console.log('Fetching telemetry for device IDs:', deviceIds);

      // Fetch telemetry data for each device individually
      const devicesWithTelemetry = await Promise.all(
        devices.map(async (device) => {
          try {
            const deviceId = typeof device.id === 'object' && device.id?.id ? device.id.id : device.id;
            if (!deviceId) {
              return device;
            }

            // Get the latest values
            const latestTelemetryResponse = await fetch(
              `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=fCnt,sensorTemperature,targetTemperature,batteryVoltage,PercentValveOpen,rssi,snr,sf,signalQuality`,
              {
                headers: {
                  'Authorization': `Bearer ${session.token}`
                }
              }
            );

            if (latestTelemetryResponse.ok) {
              const latestTelemetryData = await latestTelemetryResponse.json();
              
              // Extract the latest values for each attribute
              const telemetry = {};
              
              const getLatestValue = (attributeName) => {
                const attributeData = latestTelemetryData[attributeName];
                if (attributeData && Array.isArray(attributeData) && attributeData.length > 0) {
                  const latestReading = attributeData[attributeData.length - 1];
                  return latestReading && latestReading.value !== null && latestReading.value !== undefined 
                    ? latestReading.value 
                    : null;
                }
                return null;
              };

              // Extract all attributes from latest data
              telemetry.batteryVoltage = getLatestValue('batteryVoltage');
              telemetry.fCnt = getLatestValue('fCnt');
              telemetry.PercentValveOpen = getLatestValue('PercentValveOpen');
              telemetry.rssi = getLatestValue('rssi');
              telemetry.sensorTemperature = getLatestValue('sensorTemperature');
              telemetry.targetTemperature = getLatestValue('targetTemperature');
              telemetry.sf = getLatestValue('sf');
              telemetry.signalQuality = getLatestValue('signalQuality');
              telemetry.snr = getLatestValue('snr');

              // Find the latest timestamp
              let latestTimestamp = null;
              Object.keys(latestTelemetryData).forEach(key => {
                if (latestTelemetryData[key] && Array.isArray(latestTelemetryData[key]) && latestTelemetryData[key].length > 0) {
                  const lastEntry = latestTelemetryData[key][latestTelemetryData[key].length - 1];
                  if (lastEntry && lastEntry.ts) {
                    const ts = lastEntry.ts;
                    if (!latestTimestamp || ts > latestTimestamp) {
                      latestTimestamp = ts;
                    }
                  }
                }
              });

              telemetry.lastUpdate = latestTimestamp;

              // Update device active status based on telemetry data
              let updatedActive = device.active;
              if (Object.values(telemetry).some(value => value !== null && value !== undefined)) {
                updatedActive = true;
              }

              return {
                ...device,
                telemetry,
                active: updatedActive
              };
            }
          } catch (error) {
            console.warn(`Error fetching telemetry for device ${device.id}:`, error);
          }
          
          return device;
        })
      );

      return devicesWithTelemetry;
    } catch (error) {
      console.error('Error fetching telemetry data:', error);
      return devices;
    }
  }, [session?.tbToken, session?.token]);

  const fetchDevices = useCallback(async (nodeId) => {
    if (!nodeId) {
      console.log('fetchDevices: Missing nodeId');
      return { assigned: [] };
    }
    
    try {
      setLoadingDevices(true);
      console.log('fetchDevices: Starting to fetch devices for node:', nodeId);
      
      // Get devices from the selected node's relatedDevices
      const findNodeInTree = (nodes, targetId) => {
        if (!nodes || !Array.isArray(nodes)) return null;
        
        for (const node of nodes) {
          if (node.id === targetId) {
            return node;
          }
          if (node.children && Array.isArray(node.children)) {
            const found = findNodeInTree(node.children, targetId);
            if (found) return found;
          }
        }
        return null;
      };
      
      const node = findNodeInTree(treeData, nodeId);
      console.log('Found node:', node);
      console.log('Node relatedDevices:', node?.relatedDevices);
      
      let devices = [];
      if (node && node.relatedDevices) {
        devices = node.relatedDevices;
        console.log('Related devices from node:', devices);
      } else {
        console.log('No relatedDevices found in node');
      }
      
      // Also try to get additional device info from ThingsBoard if we have a token
      if (session?.tbToken && devices.length > 0) {
        console.log('Fetching additional telemetry data for devices...');
        const devicesWithTelemetry = await fetchTelemetryForDevices(devices);
        console.log('Devices with telemetry:', devicesWithTelemetry);
        return { assigned: devicesWithTelemetry };
      }
      
      console.log('Returning devices without telemetry:', devices);
      return { assigned: devices };
    } catch (err) {
      console.error('Error fetching devices:', err);
      return { assigned: [] };
    } finally {
      setLoadingDevices(false);
    }
  }, [treeData, session?.tbToken, fetchTelemetryForDevices]);

  const handleNodeSelect = (node) => {
    console.log('Node selected:', node);
    console.log('Node data:', node.data);
    setSelectedNode(node);
    fetchNodeDetails(node.id);
    
    // Load devices immediately from the node's relatedDevices
    // Check both node.relatedDevices and node.data.relatedDevices
    const relatedDevices = node.relatedDevices || node.data?.relatedDevices;
    
    if (relatedDevices && relatedDevices.length > 0) {
      console.log('Loading devices from node.relatedDevices:', relatedDevices);
      setDevices(relatedDevices);
    } else {
      console.log('No relatedDevices in selected node, fetching from API...');
      fetchDevices(node.id);
    }
  };

  const nodeMatchesSearch = (node, searchTerm) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return (
      (node.label && node.label.toLowerCase().includes(term)) ||
      (node.name && node.name.toLowerCase().includes(term)) ||
      (node.type && node.type.toLowerCase().includes(term))
    );
  };

  const getFilteredTreeData = () => {
    if (!treeSearchTerm) return treeData;
    
    const filterNodes = (nodes) => {
      return nodes.filter(node => {
        const matches = nodeMatchesSearch(node, treeSearchTerm);
        const childrenMatch = node.children ? filterNodes(node.children).length > 0 : false;
        return matches || childrenMatch;
      }).map(node => ({
        ...node,
        children: node.children ? filterNodes(node.children) : []
      }));
    };
    
    return filterNodes(treeData);
  };

  const CustomNode = ({ node, onToggle, dragHandle, isOpen }) => {
    const isSelected = selectedNode?.id === node.id;
    const hasChildren = node.droppable;
    const icon = getIconForType(node.data?.type);
    const iconColor = getIconColor(node.data?.type);

    return (
      <div 
        className={`tree-node ${isSelected ? 'selected' : ''}`}
        style={{
          padding: '8px 12px',
          cursor: 'pointer',
          backgroundColor: isSelected ? '#fd7e14' : 'transparent',
          borderRadius: '4px',
          margin: '2px 0',
          border: isSelected ? '1px solid #fd7e14' : '1px solid transparent',
          transition: 'all 0.2s ease'
        }}
        onClick={() => handleNodeSelect(node.data)}
      >
        <div className="d-flex align-items-center">
          {hasChildren && (
            <button
              className="btn btn-sm p-0 me-2 border-0 bg-transparent"
              onClick={(e) => {
                e.stopPropagation();
                onToggle();
              }}
              style={{ 
                width: '16px', 
                height: '16px',
                color: isSelected ? 'white' : '#6c757d'
              }}
            >
              <FontAwesomeIcon 
                icon={isOpen ? faChevronDown : faChevronRight} 
                size="xs"
              />
            </button>
          )}
          
          {!hasChildren && <div style={{ width: '16px', marginRight: '8px' }} />}
          
          <FontAwesomeIcon 
            icon={icon} 
            className="me-2" 
            style={{ color: isSelected ? 'white' : iconColor, fontSize: '14px' }}
          />
          
          <span className="flex-grow-1" style={{ fontSize: '14px', color: isSelected ? 'white' : '#333' }}>
            {node.text}
          </span>
          
          {node.data?.hasDevices && (
            <FontAwesomeIcon 
              icon={faThermometerHalf} 
              className="ms-2" 
              style={{ 
                color: isSelected ? 'white' : '#28a745', 
                fontSize: '12px' 
              }}
              title="Hat Geräte"
            />
          )}
        </div>
      </div>
    );
  };

  // Effects
  useEffect(() => {
    if (session?.token) {
      fetchUserData();
    }
  }, [session, fetchUserData]);


  useEffect(() => {
    if (customerData?.customerid) {
      fetchTreeData();
    }
  }, [customerData, fetchTreeData]);

  useEffect(() => {
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };

    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    // Devices are now loaded directly in handleNodeSelect
    // This useEffect is kept for cleanup when no node is selected
    if (!selectedNode?.id) {
      setDevices([]);
    }
  }, [selectedNode]);

  // Fallback function to fetch temperatures via API
  const fetchTemperaturesViaAPI = useCallback(async (deviceIds) => {
    if (!session?.tbToken || !deviceIds.length) return;

    try {
      console.log('🌡️ Fetching temperatures via API for devices:', deviceIds);
      
      const temperaturePromises = deviceIds.map(async (deviceId) => {
        try {
          const response = await fetch(
            `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=sensorTemperature`,
            {
              headers: {
                'Authorization': `Bearer ${session.token}`
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            const temperature = data.sensorTemperature?.[0]?.value;
            
            if (temperature !== undefined) {
              setDeviceTemperatures(prev => ({
                ...prev,
                [deviceId]: {
                  temperature: temperature,
                  timestamp: Date.now()
                }
              }));
            }
          }
        } catch (error) {
          console.warn(`Error fetching temperature for device ${deviceId}:`, error);
        }
      });

      await Promise.all(temperaturePromises);
    } catch (error) {
      console.error('Error fetching temperatures via API:', error);
    }
  }, [session?.tbToken, session?.token]);

  // Subscribe to device temperatures when devices change
  useEffect(() => {
    if (devices && devices.length > 0) {
      const deviceIds = devices.map(device => {
        if (typeof device.id === 'object' && device.id?.id) {
          return device.id.id;
        }
        return device.id;
      }).filter(id => id);

      if (deviceIds.length > 0) {
        console.log('🌡️ Fetching temperatures via API...');
        // Fetch temperatures via API
        fetchTemperaturesViaAPI(deviceIds);
        
        // Set up automatic refresh every 30 seconds
        const interval = setInterval(() => {
          console.log('🔄 Auto-refreshing temperatures...');
          fetchTemperaturesViaAPI(deviceIds);
        }, 30000);
        
        return () => {
          clearInterval(interval);
        };
      }
    }
  }, [devices, fetchTemperaturesViaAPI]);

  if (status === 'loading') {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="spinner-border text-primary" role="status">
          <span className="visually-hidden">Laden...</span>
        </div>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container-fluid p-0">
        <div className="d-flex" style={{ height: windowHeight ? `${windowHeight - 80}px` : '100vh' }}>
          {/* Linke Seite: Hierarchie */}
          <div 
            className="card bg-light text-white" 
            style={{ 
              minWidth: '400px',
              width: '400px',
              height: windowHeight ? `${windowHeight - 80}px` : 'auto'
            }}
          >
                  <div className="card-header bg-light border-secondary">
                    <h5 className="mb-0 d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center">
                        <FontAwesomeIcon icon={faBuilding} className="me-2 text-primary" />
                        Heizungssteuerung
                      </div>
                      <div className="d-flex align-items-center">
                        <span className="badge bg-warning me-2">
                          <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
                          API (30s)
                        </span>
                      </div>
                    </h5>
                  </div>
            <div className="card-body" style={{ overflowY: 'auto' }}>
              {/* Suchfeld für Tree */}
              <div className="d-flex gap-2 mb-3">
                <div className="input-group">
                  <span className="input-group-text bg-light text-white border-secondary">
                    <FontAwesomeIcon icon={faSearch} />
                  </span>
                  <input
                    type="text"
                    className="form-control bg-light text-white border-secondary"
                    placeholder="Suchen..."
                    value={treeSearchTerm}
                    onChange={(e) => setTreeSearchTerm(e.target.value)}
                  />
                  {treeSearchTerm && (
                    <button
                      className="btn btn-outline-secondary"
                      type="button"
                      onClick={() => setTreeSearchTerm('')}
                    >
                      <FontAwesomeIcon icon={faTimes} />
                    </button>
                  )}
                </div>
                      <button 
                        className="btn btn-outline-light btn-sm"
                        onClick={fetchTreeData}
                        disabled={loading}
                        title="Struktur aktualisieren"
                      >
                        <FontAwesomeIcon 
                          icon={faRotateRight} 
                          className={loading ? 'fa-spin' : ''}
                        />
                      </button>
                      {devices && devices.length > 0 && (
                        <button 
                          className="btn btn-outline-success btn-sm"
                          onClick={() => {
                            const deviceIds = devices.map(device => {
                              if (typeof device.id === 'object' && device.id?.id) {
                                return device.id.id;
                              }
                              return device.id;
                            }).filter(id => id);
                            fetchTemperaturesViaAPI(deviceIds);
                          }}
                          title="Temperaturen aktualisieren"
                        >
                          <FontAwesomeIcon icon={faThermometerHalf} />
                        </button>
                      )}
              </div>

              {error && (
                <div className="alert alert-danger" role="alert">
                  {error}
                </div>
              )}

              {loading ? (
                <div className="text-center">
                  <div className="spinner-border text-light" role="status">
                    <span className="visually-hidden">Loading...</span>
                  </div>
                </div>
              ) : (
                <Tree
                  tree={(() => {
                    const filtered = getFilteredTreeData();
                    const converted = convertToTreeViewFormat(filtered);
                    console.log('Filtered tree data:', filtered);
                    console.log('Converted tree data:', converted);
                    return converted;
                  })()}
                  rootId={0}
                  classes={{
                    root: 'tree-root',
                    draggingSource: 'dragging-source',
                    dropTarget: 'drop-target'
                  }}
                  render={(node, { onToggle, dragHandle, isOpen }) => (
                    <CustomNode
                      node={node}
                      onToggle={onToggle}
                      dragHandle={dragHandle}
                      isOpen={isOpen}
                    />
                  )}
                  openNodes={openNodes}
                  onToggle={(id) => {
                    setOpenNodes((prevOpenNodes) => {
                      const isOpen = prevOpenNodes.includes(id);
                      return isOpen
                        ? prevOpenNodes.filter((nodeId) => nodeId !== id)
                        : [...prevOpenNodes, id];
                    });
                  }}
                  canDrop={() => false}
                  canDrag={() => false}
                />
              )}
            </div>
          </div>

          {/* Rechte Seite: Dashboard Content */}
          <div className="flex-grow-1 d-flex flex-column">
            {selectedNode ? (
              <div className="flex-grow-1 p-4">
                <div className="node-details">
                  <div className="d-flex align-items-center mb-3">
                    <FontAwesomeIcon 
                      icon={getIconForType(selectedNode.type)} 
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
                      {console.log('Rendering devices:', devices, 'Length:', devices?.length)}
                      {devices && devices.length > 0 && (
                        <>
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="text-muted mb-0">
                              <FontAwesomeIcon icon={faMicrochip} className="me-2" />
                              Zugehörige Geräte ({devices.length})
                            </h6>
                            <div className="d-flex align-items-center">
                              <span className="badge bg-info me-2">
                                API (30s)
                              </span>
                            </div>
                          </div>
                          <div className="list-group">
                            {devices.map((device, index) => (
                              <div key={index} className="list-group-item">
                                <div className="d-flex align-items-center">
                                  <FontAwesomeIcon 
                                    icon={getIconForType(device.type)} 
                                    className="me-2 text-primary"
                                  />
                                  <div className="flex-grow-1">
                                    <div className="fw-bold">{device.label || device.name}</div>
                                    <small className="text-muted">
                                      {device.name || device.id} • {device.type || 'Unbekannt'}
                                    </small>
                                  </div>
                                  {device.active !== undefined && (
                                    <span className={`badge ${device.active ? 'bg-success' : 'bg-warning'}`}>
                                      {device.active ? 'Aktiv' : 'Inaktiv'}
                                    </span>
                                  )}
                                </div>
                                {(device.telemetry || deviceTemperatures[device.id]) && (
                                  <div className="mt-2">
                                    <div className="row text-center">
                                      {(deviceTemperatures[device.id]?.temperature || device.telemetry?.sensorTemperature) && (
                                        <div className="col-4">
                                          <small className="text-muted">
                                            Temperatur
                                            {deviceTemperatures[device.id]?.temperature && (
                                              <span className="badge bg-info ms-1" style={{ fontSize: '0.6em' }}>
                                                API
                                              </span>
                                            )}
                                          </small>
                                          <div className="fw-bold text-primary">
                                            {Number(deviceTemperatures[device.id]?.temperature || device.telemetry?.sensorTemperature).toFixed(1)}°C
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.targetTemperature && (
                                        <div className="col-4">
                                          <small className="text-muted">Ziel</small>
                                          <div className="fw-bold text-success">
                                            {Number(device.telemetry.targetTemperature).toFixed(1)}°C
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.batteryVoltage && (
                                        <div className="col-4">
                                          <small className="text-muted">Batterie</small>
                                          <div className="fw-bold text-warning">
                                            {Number(device.telemetry.batteryVoltage).toFixed(2)}V
                                          </div>
                                        </div>
                                      )}
                                      {!deviceTemperatures[device.id]?.temperature && !device.telemetry?.sensorTemperature && (
                                        <div className="col-12">
                                          <small className="text-muted">
                                            <span className="badge bg-warning me-1" style={{ fontSize: '0.6em' }}>
                                              Warten...
                                            </span>
                                            Keine Temperaturdaten verfügbar
                                          </small>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </>
                      )}
                      {(!devices || devices.length === 0) && (
                        <div className="text-center text-muted py-3">
                          <FontAwesomeIcon icon={faMicrochip} size="2x" className="mb-2" />
                          <p className="mb-0">Keine Geräte zugeordnet</p>
                        </div>
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
              </div>
            ) : (
              <div className="flex-grow-1 d-flex align-items-center justify-content-center">
                <div className="text-center text-muted">
                  <FontAwesomeIcon icon={faBuilding} size="3x" className="mb-3" />
                  <h5>Wählen Sie einen Bereich aus</h5>
                  <p>Klicken Sie auf einen Bereich in der linken Strukturansicht, um Details anzuzeigen.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </DndProvider>
  );
}

