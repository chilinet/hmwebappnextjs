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
  faTree,
  faBullseye
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
  const [loadingNodeData, setLoadingNodeData] = useState(false);
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [loadingTemperature, setLoadingTemperature] = useState(false);
  const [temperatureHistory, setTemperatureHistory] = useState([]);
  const [targetTemperatureHistory, setTargetTemperatureHistory] = useState([]);
  const [loadingTemperatureHistory, setLoadingTemperatureHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [telemetryData, setTelemetryData] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [currentTemperature, setCurrentTemperature] = useState(null);
  const [currentTargetTemperature, setCurrentTargetTemperature] = useState(null);
  const [loadingCurrentTemp, setLoadingCurrentTemp] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [ws, setWs] = useState(null);
  
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

  const fetchTemperature = async (node) => {
    if (!node || !session?.token) return;
    
    try {
      setLoadingTemperature(true);
      setCurrentTemperature(null);
      
      const operationalMode = node.data?.operationalMode || node.operationalMode;
      const extTempDevice = node.data?.extTempDevice || node.extTempDevice;
      
      console.log('Fetching temperature for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      
      if (operationalMode === 2) {
        // Use external temperature device for both temperature and target temperature
        if (extTempDevice) {
          // Fetch sensor temperature with AVG
          const sensorResponse = await fetch(
            `/api/thingsboard/devices/telemetry?deviceId=${extTempDevice}&keys=sensorTemperature&interval=600000&agg=AVG&limit=2000`,
            {
              headers: {
                'Authorization': `Bearer ${session.token}`
              }
            }
          );
          
          // Fetch target temperature with MAX
          const targetResponse = await fetch(
            `/api/thingsboard/devices/telemetry?deviceId=${extTempDevice}&keys=targetTemperature&interval=600000&agg=MAX&limit=2000`,
            {
              headers: {
                'Authorization': `Bearer ${session.token}`
              }
            }
          );
          
          if (sensorResponse.ok && targetResponse.ok) {
            const sensorData = await sensorResponse.json();
            const targetData = await targetResponse.json();
            const temperature = sensorData.sensorTemperature?.[0]?.value;
            const targetTemperature = targetData.targetTemperature?.[0]?.value;
            console.log('External temperature raw value:', temperature);
            console.log('External target temperature raw value:', targetTemperature);
            
            if (temperature !== undefined) {
              const numTemp = Number(temperature);
              console.log('External temperature converted:', numTemp);
              
              if (!isNaN(numTemp) && numTemp > -50 && numTemp < 100) {
                setCurrentTemperature({
                  value: numTemp,
                  source: 'external',
                  deviceId: extTempDevice
                });
              } else {
                console.warn('External temperature out of reasonable range:', numTemp);
              }
            }
            
            if (targetTemperature !== undefined) {
              const numTargetTemp = Number(targetTemperature);
              console.log('External target temperature converted:', numTargetTemp);
              
              if (!isNaN(numTargetTemp) && numTargetTemp > -50 && numTargetTemp < 100) {
                setCurrentTargetTemperature({
                  value: numTargetTemp,
                  source: 'external',
                  deviceId: extTempDevice
                });
              } else {
                console.warn('External target temperature out of reasonable range:', numTargetTemp);
              }
            }
          }
        }
      } else if (operationalMode === 10) {
        // Use external temperature device for temperature only, MAX for target temperature
        if (extTempDevice) {
          const response = await fetch(
            `/api/thingsboard/devices/telemetry?deviceId=${extTempDevice}&keys=sensorTemperature&interval=600000&agg=AVG&limit=2000`,
            {
              headers: {
                'Authorization': `Bearer ${session.token}`
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            const temperature = data.sensorTemperature?.[0]?.value;
            console.log('External temperature raw value:', temperature);
            
            if (temperature !== undefined) {
              const numTemp = Number(temperature);
              console.log('External temperature converted:', numTemp);
              
              if (!isNaN(numTemp) && numTemp > -50 && numTemp < 100) {
                setCurrentTemperature({
                  value: numTemp,
                  source: 'external',
                  deviceId: extTempDevice
                });
              } else {
                console.warn('External temperature out of reasonable range:', numTemp);
              }
            }
          }
        }
        
        // Load target temperature from related devices (average)
        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices.map(device => {
            if (typeof device.id === 'object' && device.id?.id) {
              return device.id.id;
            }
            return device.id;
          }).filter(id => id);
          
          if (deviceIds.length > 0) {
            const targetTemperaturePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=targetTemperature&interval=600000&agg=MAX&limit=2000`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session.token}`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  return data.targetTemperature?.[0]?.value;
                }
              } catch (error) {
                console.warn(`Error fetching target temperature for device ${deviceId}:`, error);
              }
              return null;
            });
            
            const targetTemperatures = await Promise.all(targetTemperaturePromises);
            const validTargetTemperatures = targetTemperatures
              .filter(temp => temp !== null && temp !== undefined)
              .map(temp => Number(temp))
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100);
            
            if (validTargetTemperatures.length > 0) {
              const maxTargetTemp = Math.max(...validTargetTemperatures); // Use MAX instead of AVG
              setCurrentTargetTemperature({
                value: maxTargetTemp,
                source: 'max',
                deviceCount: validTargetTemperatures.length
              });
            }
          }
        }
      } else {
        // Use average temperature from related devices
        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices.map(device => {
            if (typeof device.id === 'object' && device.id?.id) {
              return device.id.id;
            }
            return device.id;
          }).filter(id => id);
          
          if (deviceIds.length > 0) {
            // Fetch sensor temperature with AVG
            const sensorTemperaturePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=sensorTemperature&interval=600000&agg=AVG&limit=2000`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session.token}`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  return {
                    temperature: data.sensorTemperature?.[0]?.value
                  };
                }
              } catch (error) {
                console.warn(`Error fetching temperature for device ${deviceId}:`, error);
              }
              return { temperature: null };
            });

            // Fetch target temperature with MAX
            const targetTemperaturePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=targetTemperature&interval=600000&agg=MAX&limit=2000`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session.token}`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  return {
                    targetTemperature: data.targetTemperature?.[0]?.value
                  };
                }
              } catch (error) {
                console.warn(`Error fetching target temperature for device ${deviceId}:`, error);
              }
              return { targetTemperature: null };
            });
            
            const sensorResults = await Promise.all(sensorTemperaturePromises);
            const targetResults = await Promise.all(targetTemperaturePromises);
            console.log('Raw sensor temperature data from API:', sensorResults);
            console.log('Raw target temperature data from API:', targetResults);
            
            const validTemperatures = sensorResults
              .filter(data => data.temperature !== null && data.temperature !== undefined)
              .map(data => {
                const numTemp = Number(data.temperature);
                console.log('Converting temperature:', data.temperature, 'to number:', numTemp);
                return numTemp;
              })
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100); // Reasonable temperature range
            
            const validTargetTemperatures = targetResults
              .filter(data => data.targetTemperature !== null && data.targetTemperature !== undefined)
              .map(data => {
                const numTemp = Number(data.targetTemperature);
                console.log('Converting target temperature:', data.targetTemperature, 'to number:', numTemp);
                return numTemp;
              })
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100); // Reasonable temperature range

            console.log('Valid temperatures after filtering:', validTemperatures);
            console.log('Valid target temperatures after filtering:', validTargetTemperatures);
            
            if (validTemperatures.length > 0) {
              const averageTemp = validTemperatures.reduce((sum, temp) => sum + temp, 0) / validTemperatures.length;
              console.log('Calculated average temperature:', averageTemp);
              
              let maxTargetTemp = null;
              if (validTargetTemperatures.length > 0) {
                maxTargetTemp = Math.max(...validTargetTemperatures); // Use MAX instead of AVG
                console.log('Calculated MAX target temperature:', maxTargetTemp);
              }
              setCurrentTemperature({
                value: averageTemp,
                source: 'average',
                deviceCount: validTemperatures.length
              });
              
              if (maxTargetTemp !== null) {
                setCurrentTargetTemperature({
                  value: maxTargetTemp,
                  source: 'max',
                  deviceCount: validTargetTemperatures.length
                });
              }
            }
          }
        }
      }
    } catch (error) {
      console.error('Error fetching temperature:', error);
    } finally {
      setLoadingTemperature(false);
    }
  };

  const fetchTemperatureHistory = async (node) => {
    if (!node || !session?.token) return;
    
    try {
      setLoadingTemperatureHistory(true);
      setTemperatureHistory([]);
      setTargetTemperatureHistory([]);
      
      const operationalMode = node.data?.operationalMode || node.operationalMode;
      const extTempDevice = node.data?.extTempDevice || node.extTempDevice;
      
      console.log('Fetching temperature history for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      
      // Calculate time range (7 days ago to now)
      const endTime = Date.now();
      const startTime = endTime - (7 * 24 * 60 * 60 * 1000); // 7 days in milliseconds
      
      console.log('Fetching temperature history for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      console.log('Time range - Start:', new Date(startTime).toISOString(), 'End:', new Date(endTime).toISOString());
      console.log('Time range in days:', (endTime - startTime) / (24 * 60 * 60 * 1000));
      
      if (operationalMode === 2) {
        // Use external temperature device for both temperature and target temperature
        if (extTempDevice) {
          // Split the 7-day period into smaller chunks to get all data
          const chunkSize = 24 * 60 * 60 * 1000; // 1 day in milliseconds
          const chunks = [];
          
          for (let i = 0; i < 7; i++) {
            const chunkStart = startTime + (i * chunkSize);
            const chunkEnd = Math.min(startTime + ((i + 1) * chunkSize), endTime);
            chunks.push({ start: chunkStart, end: chunkEnd });
          }
          
          console.log('Fetching data in', chunks.length, 'chunks');
          
          const allTemperatureData = [];
          const allTargetTemperatureData = [];
          
          for (const chunk of chunks) {
            try {
              // Fetch sensor temperature with AVG
              const sensorResponse = await fetch(
                `/api/thingsboard/devices/telemetry?deviceId=${extTempDevice}&keys=sensorTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=AVG&limit=2000`,
                {
                  headers: {
                    'Authorization': `Bearer ${session.token}`
                  }
                }
              );
              
              // Fetch target temperature with MAX
              const targetResponse = await fetch(
                `/api/thingsboard/devices/telemetry?deviceId=${extTempDevice}&keys=targetTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=MAX&limit=2000`,
                {
                  headers: {
                    'Authorization': `Bearer ${session.token}`
                  }
                }
              );
              
              if (sensorResponse.ok && targetResponse.ok) {
                const sensorData = await sensorResponse.json();
                const targetData = await targetResponse.json();
                const temperatureData = sensorData.sensorTemperature || [];
                const targetTemperatureData = targetData.targetTemperature || [];
                
                allTemperatureData.push(...temperatureData);
                allTargetTemperatureData.push(...targetTemperatureData);
                
                console.log(`Chunk ${chunks.indexOf(chunk) + 1}: Got ${temperatureData.length} temp points, ${targetTemperatureData.length} target temp points`);
              }
            } catch (error) {
              console.warn(`Error fetching chunk ${chunks.indexOf(chunk) + 1}:`, error);
            }
          }
          
          const historyData = allTemperatureData
            .filter(item => item && item.value !== null && item.value !== undefined)
            .map(item => ({
              time: new Date(item.ts).toLocaleString('de-DE'),
              timestamp: item.ts,
              temperature: Number(item.value)
            }))
            .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100)
            .sort((a, b) => a.timestamp - b.timestamp);
          
          const targetHistoryData = allTargetTemperatureData
            .filter(item => item && item.value !== null && item.value !== undefined)
            .map(item => ({
              time: new Date(item.ts).toLocaleString('de-DE'),
              timestamp: item.ts,
              temperature: Number(item.value)
            }))
            .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100)
            .sort((a, b) => a.timestamp - b.timestamp);
          
          console.log('External temperature history:', historyData);
          console.log('External MAX target temperature history:', targetHistoryData);
          console.log('Temperature data points count:', historyData.length);
          console.log('Target temperature data points count:', targetHistoryData.length);
          console.log('First temperature data point:', historyData[0]);
          console.log('Last temperature data point:', historyData[historyData.length - 1]);
          setTemperatureHistory(historyData);
          setTargetTemperatureHistory(targetHistoryData);
        }
      } else if (operationalMode === 10) {
        // Use external temperature device for temperature only, MAX for target temperature
        if (extTempDevice) {
          // Split the 7-day period into smaller chunks to get all data
          const chunkSize = 24 * 60 * 60 * 1000; // 1 day in milliseconds
          const chunks = [];
          
          for (let i = 0; i < 7; i++) {
            const chunkStart = startTime + (i * chunkSize);
            const chunkEnd = Math.min(startTime + ((i + 1) * chunkSize), endTime);
            chunks.push({ start: chunkStart, end: chunkEnd });
          }
          
          console.log('Fetching temperature data in', chunks.length, 'chunks');
          
          const allTemperatureData = [];
          const allTargetTemperatureData = [];
          
          for (const chunk of chunks) {
            try {
              // Fetch sensor temperature with AVG
              const sensorResponse = await fetch(
                `/api/thingsboard/devices/telemetry?deviceId=${extTempDevice}&keys=sensorTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=AVG&limit=2000`,
                {
                  headers: {
                    'Authorization': `Bearer ${session.token}`
                  }
                }
              );
              
              // Fetch target temperature with MAX from related devices
              const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
              const deviceIds = relatedDevices.map(device => {
                if (typeof device.id === 'object' && device.id?.id) {
                  return device.id.id;
                }
                return device.id;
              }).filter(id => id);
              
              let targetTemperatureData = [];
              if (deviceIds.length > 0) {
                const targetPromises = deviceIds.map(async (deviceId) => {
                  try {
                    const response = await fetch(
                      `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=targetTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=MAX&limit=2000`,
                      {
                        headers: {
                          'Authorization': `Bearer ${session.token}`
                        }
                      }
                    );
                    
                    if (response.ok) {
                      const data = await response.json();
                      return data.targetTemperature || [];
                    }
                  } catch (error) {
                    console.warn(`Error fetching target temperature for device ${deviceId}:`, error);
                  }
                  return [];
                });
                
                const targetResults = await Promise.all(targetPromises);
                targetTemperatureData = targetResults.flat();
              }
              
              if (sensorResponse.ok) {
                const data = await sensorResponse.json();
                const temperatureData = data.sensorTemperature || [];
                allTemperatureData.push(...temperatureData);
                allTargetTemperatureData.push(...targetTemperatureData);
                console.log(`Chunk ${chunks.indexOf(chunk) + 1}: Got ${temperatureData.length} temp points, ${targetTemperatureData.length} target temp points`);
              }
            } catch (error) {
              console.warn(`Error fetching temperature chunk ${chunks.indexOf(chunk) + 1}:`, error);
            }
          }
          
          const historyData = allTemperatureData
            .filter(item => item && item.value !== null && item.value !== undefined)
            .map(item => ({
              time: new Date(item.ts).toLocaleString('de-DE'),
              timestamp: item.ts,
              temperature: Number(item.value)
            }))
            .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100)
            .sort((a, b) => a.timestamp - b.timestamp);
          
          console.log('External temperature history:', historyData);
          console.log('Temperature data points count:', historyData.length);
          setTemperatureHistory(historyData);
          
          // Process target temperature history
          const targetHistoryData = allTargetTemperatureData
            .filter(item => item && item.value !== null && item.value !== undefined)
            .map(item => ({
              time: new Date(item.ts).toLocaleString('de-DE'),
              timestamp: item.ts,
              temperature: Number(item.value)
            }))
            .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100)
            .sort((a, b) => a.timestamp - b.timestamp);
          
          console.log('MAX target temperature history:', targetHistoryData);
          console.log('Target temperature data points count:', targetHistoryData.length);
          setTargetTemperatureHistory(targetHistoryData);
        }
        
        // Load target temperature history from related devices (average) - fallback
        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices.map(device => {
            if (typeof device.id === 'object' && device.id?.id) {
              return device.id.id;
            }
            return device.id;
          }).filter(id => id);
          
          if (deviceIds.length > 0) {
            // Split the 7-day period into smaller chunks
            const chunkSize = 24 * 60 * 60 * 1000; // 1 day in milliseconds
            const chunks = [];
            
            for (let i = 0; i < 7; i++) {
              const chunkStart = startTime + (i * chunkSize);
              const chunkEnd = Math.min(startTime + ((i + 1) * chunkSize), endTime);
              chunks.push({ start: chunkStart, end: chunkEnd });
            }
            
            console.log('Fetching target temperature data in', chunks.length, 'chunks for', deviceIds.length, 'devices');
            
            const allTargetTemperatureData = [];
            
            for (const chunk of chunks) {
              const targetHistoryPromises = deviceIds.map(async (deviceId) => {
                try {
                  const response = await fetch(
                    `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=targetTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=AVG&limit=2000`,
                    {
                      headers: {
                        'Authorization': `Bearer ${session.token}`
                      }
                    }
                  );
                  
                  if (response.ok) {
                    const data = await response.json();
                    return data.targetTemperature || [];
                  }
                } catch (error) {
                  console.warn(`Error fetching target temperature history for device ${deviceId} chunk ${chunks.indexOf(chunk) + 1}:`, error);
                }
                return [];
              });
              
              const chunkData = await Promise.all(targetHistoryPromises);
              allTargetTemperatureData.push(...chunkData.flat());
              console.log(`Chunk ${chunks.indexOf(chunk) + 1}: Got ${chunkData.flat().length} target temp points`);
            }
            
            // Group by timestamp and calculate MAX for target temperatures
            const targetTimestampMap = new Map();
            
            allTargetTemperatureData.forEach(item => {
              if (item && item.value !== null && item.value !== undefined) {
                const temp = Number(item.value);
                if (!isNaN(temp) && temp > -50 && temp < 100) {
                  if (!targetTimestampMap.has(item.ts)) {
                    targetTimestampMap.set(item.ts, []);
                  }
                  targetTimestampMap.get(item.ts).push(temp);
                }
              }
            });
            
            const targetHistoryData = Array.from(targetTimestampMap.entries())
              .map(([timestamp, temps]) => ({
                time: new Date(Number(timestamp)).toLocaleString('de-DE'),
                timestamp: Number(timestamp),
                temperature: temps.length > 0 ? Math.max(...temps) : null // Use MAX instead of AVG
              }))
              .filter(item => item.temperature !== null)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            console.log('MAX target temperature history:', targetHistoryData);
            setTargetTemperatureHistory(targetHistoryData);
          }
        }
      } else {
        // Use average temperature from related devices
        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices.map(device => {
            if (typeof device.id === 'object' && device.id?.id) {
              return device.id.id;
            }
            return device.id;
          }).filter(id => id);
          
          if (deviceIds.length > 0) {
            // Split the 7-day period into smaller chunks
            const chunkSize = 24 * 60 * 60 * 1000; // 1 day in milliseconds
            const chunks = [];
            
            for (let i = 0; i < 7; i++) {
              const chunkStart = startTime + (i * chunkSize);
              const chunkEnd = Math.min(startTime + ((i + 1) * chunkSize), endTime);
              chunks.push({ start: chunkStart, end: chunkEnd });
            }
            
            console.log('Fetching temperature and target temperature data in', chunks.length, 'chunks for', deviceIds.length, 'devices');
            
            const allTemperatureData = [];
            const allTargetTemperatureData = [];
            
            for (const chunk of chunks) {
              // Fetch sensor temperature with AVG
              const sensorHistoryPromises = deviceIds.map(async (deviceId) => {
                try {
                  const response = await fetch(
                    `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=sensorTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=AVG&limit=2000`,
                    {
                      headers: {
                        'Authorization': `Bearer ${session.token}`
                      }
                    }
                  );
                  
                  if (response.ok) {
                    const data = await response.json();
                    return data.sensorTemperature || [];
                  }
                } catch (error) {
                  console.warn(`Error fetching sensor temperature history for device ${deviceId} chunk ${chunks.indexOf(chunk) + 1}:`, error);
                }
                return [];
              });
              
              // Fetch target temperature with MAX
              const targetHistoryPromises = deviceIds.map(async (deviceId) => {
                try {
                  const response = await fetch(
                    `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=targetTemperature&startTs=${chunk.start}&endTs=${chunk.end}&interval=600000&agg=MAX&limit=2000`,
                    {
                      headers: {
                        'Authorization': `Bearer ${session.token}`
                      }
                    }
                  );
                  
                  if (response.ok) {
                    const data = await response.json();
                    return data.targetTemperature || [];
                  }
                } catch (error) {
                  console.warn(`Error fetching target temperature history for device ${deviceId} chunk ${chunks.indexOf(chunk) + 1}:`, error);
                }
                return [];
              });
              
              const sensorChunkData = await Promise.all(sensorHistoryPromises);
              const targetChunkData = await Promise.all(targetHistoryPromises);
              
              allTemperatureData.push(...sensorChunkData.flat());
              allTargetTemperatureData.push(...targetChunkData.flat());
              
              console.log(`Chunk ${chunks.indexOf(chunk) + 1}: Got ${sensorChunkData.flat().length} sensor temp points, ${targetChunkData.flat().length} target temp points`);
            }
            
            // Group by timestamp and calculate average for temperatures
            const timestampMap = new Map();
            const targetTimestampMap = new Map();
            
            allTemperatureData.forEach(item => {
              if (item && item.value !== null && item.value !== undefined) {
                const temp = Number(item.value);
                if (!isNaN(temp) && temp > -50 && temp < 100) {
                  if (!timestampMap.has(item.ts)) {
                    timestampMap.set(item.ts, []);
                  }
                  timestampMap.get(item.ts).push(temp);
                }
              }
            });
            
            // Process target temperature data
            allTargetTemperatureData.forEach(item => {
              if (item && item.value !== null && item.value !== undefined) {
                const temp = Number(item.value);
                if (!isNaN(temp) && temp > -50 && temp < 100) {
                  if (!targetTimestampMap.has(item.ts)) {
                    targetTimestampMap.set(item.ts, []);
                  }
                  targetTimestampMap.get(item.ts).push(temp);
                }
              }
            });
            
            const historyData = Array.from(timestampMap.entries())
              .map(([timestamp, temps]) => ({
                time: new Date(Number(timestamp)).toLocaleString('de-DE'),
                timestamp: Number(timestamp),
                temperature: temps.reduce((sum, temp) => sum + temp, 0) / temps.length
              }))
              .sort((a, b) => a.timestamp - b.timestamp);
            
            const targetHistoryData = Array.from(targetTimestampMap.entries())
              .map(([timestamp, temps]) => ({
                time: new Date(Number(timestamp)).toLocaleString('de-DE'),
                timestamp: Number(timestamp),
                temperature: temps.length > 0 ? Math.max(...temps) : null // Use MAX instead of AVG
              }))
              .filter(item => item.temperature !== null)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            console.log('Average temperature history:', historyData);
            console.log('MAX target temperature history:', targetHistoryData);
            console.log('Temperature data points count:', historyData.length);
            console.log('Target temperature data points count:', targetHistoryData.length);
            console.log('First temperature data point:', historyData[0]);
            console.log('Last temperature data point:', historyData[historyData.length - 1]);
            setTemperatureHistory(historyData);
            setTargetTemperatureHistory(targetHistoryData);
          }
        }
      }
    } catch (error) {
      console.error('Error fetching temperature history:', error);
    } finally {
      setLoadingTemperatureHistory(false);
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
    console.log('Node operationalMode:', node.operationalMode);
    
    // Set loading state and clear previous data
    setLoadingNodeData(true);
    setSelectedNode(null);
    setNodeDetails(null);
    
    // Use the full node object, not just node.data
    setSelectedNode(node);
    fetchNodeDetails(node.id);
    fetchTemperature(node);
    fetchTemperatureHistory(node);
    
    // Clear loading state after a short delay to ensure data is loaded
    setTimeout(() => {
      setLoadingNodeData(false);
    }, 100);
    
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

  const getTemperatureChartOption = () => {
    const hasTemperatureData = temperatureHistory && temperatureHistory.length > 0;
    const hasTargetTemperatureData = targetTemperatureHistory && targetTemperatureHistory.length > 0;
    
    if (!hasTemperatureData && !hasTargetTemperatureData) {
      return {
        title: {
          text: 'Temperaturverlauf (7 Tage)',
          left: 'center',
          textStyle: {
            fontSize: 16
          }
        },
        xAxis: {
          type: 'time',
          name: 'Zeit',
          nameLocation: 'middle',
          nameGap: 30
        },
        yAxis: {
          type: 'value',
          name: 'Temperatur (°C)',
          nameLocation: 'middle',
          nameGap: 50
        },
        series: [],
        tooltip: {
          trigger: 'axis',
          formatter: function(params) {
            return 'Keine Daten verfügbar';
          }
        },
        grid: {
          left: '10%',
          right: '10%',
          bottom: '15%',
          top: '15%'
        }
      };
    }

    const temperatureData = hasTemperatureData ? temperatureHistory.map(item => {
      const temp = Number(item.temperature);
      return [item.timestamp, !isNaN(temp) ? temp : null];
    }).filter(item => item[1] !== null) : [];

    const targetTemperatureData = hasTargetTemperatureData ? targetTemperatureHistory.map(item => {
      const temp = Number(item.temperature);
      return [item.timestamp, !isNaN(temp) ? temp : null];
    }).filter(item => item[1] !== null) : [];
    
    // Debug: Check timestamp ranges
    if (temperatureData.length > 0 && targetTemperatureData.length > 0) {
      const tempStart = new Date(temperatureData[0][0]);
      const tempEnd = new Date(temperatureData[temperatureData.length - 1][0]);
      const targetStart = new Date(targetTemperatureData[0][0]);
      const targetEnd = new Date(targetTemperatureData[targetTemperatureData.length - 1][0]);
      
      console.log('Temperature range:', tempStart.toISOString(), 'to', tempEnd.toISOString());
      console.log('Target temperature range:', targetStart.toISOString(), 'to', targetEnd.toISOString());
      console.log('Time difference (hours):', (targetStart - tempStart) / (1000 * 60 * 60));
      
      // Synchronize data ranges - use the overlapping time range
      const commonStart = Math.max(tempStart.getTime(), targetStart.getTime());
      const commonEnd = Math.min(tempEnd.getTime(), targetEnd.getTime());
      
      console.log('Common time range:', new Date(commonStart).toISOString(), 'to', new Date(commonEnd).toISOString());
      
      // Filter data to common time range
      const filteredTemperatureData = temperatureData.filter(item => 
        item[0] >= commonStart && item[0] <= commonEnd
      );
      const filteredTargetTemperatureData = targetTemperatureData.filter(item => 
        item[0] >= commonStart && item[0] <= commonEnd
      );
      
      console.log('Filtered temperature data points:', filteredTemperatureData.length);
      console.log('Filtered target temperature data points:', filteredTargetTemperatureData.length);
      
      // Use filtered data if we have overlapping data
      if (filteredTemperatureData.length > 0 && filteredTargetTemperatureData.length > 0) {
        temperatureData.splice(0, temperatureData.length, ...filteredTemperatureData);
        targetTemperatureData.splice(0, targetTemperatureData.length, ...filteredTargetTemperatureData);
      }
    }
    
    console.log('Chart data points count:', temperatureData.length);
    console.log('Target chart data points count:', targetTemperatureData.length);
    console.log('First chart data point:', temperatureData[0]);
    console.log('Last chart data point:', temperatureData[temperatureData.length - 1]);
    console.log('First target chart data point:', targetTemperatureData[0]);
    console.log('Last target chart data point:', targetTemperatureData[targetTemperatureData.length - 1]);
    console.log('Raw targetTemperatureHistory:', targetTemperatureHistory);
    console.log('Raw temperatureHistory:', temperatureHistory);
    
    return {
      title: {
        text: 'Temperaturverlauf (7 Tage)',
        left: 'center',
        textStyle: {
          fontSize: 16
        }
      },
      xAxis: {
        type: 'time',
        name: 'Zeit',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          formatter: function(value) {
            return new Date(value).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Temperatur (°C)',
        nameLocation: 'middle',
        nameGap: 50,
        axisLabel: {
          formatter: '{value}°C'
        }
      },
      series: [
        ...(hasTemperatureData ? [{
          name: 'Aktuelle Temperatur',
          type: 'line',
          data: temperatureData,
          smooth: true,
          symbol: 'circle',
          symbolSize: 4,
          lineStyle: {
            color: '#dc3545',
            width: 2
          },
          itemStyle: {
            color: '#dc3545'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(220, 53, 69, 0.3)'
              }, {
                offset: 1, color: 'rgba(220, 53, 69, 0.05)'
              }]
            }
          }
        }] : []),
        ...(hasTargetTemperatureData ? [{
          name: 'Zieltemperatur',
          type: 'line',
          data: targetTemperatureData,
          smooth: true,
          symbol: 'diamond',
          symbolSize: 6,
          connectNulls: true,
          lineStyle: {
            color: '#28a745',
            width: 2,
            type: 'dashed'
          },
          itemStyle: {
            color: '#28a745'
          }
        }] : [])
      ],
      tooltip: {
        trigger: 'axis',
        formatter: function(params) {
          if (params && params.length > 0) {
            const date = new Date(params[0].axisValue).toLocaleString('de-DE');
            let tooltipText = date + '<br/>';
            
            params.forEach(param => {
              const value = Number(param.value);
              const seriesName = param.seriesName;
              const color = param.color;
              tooltipText += `<span style="color:${color}">●</span> ${seriesName}: ${!isNaN(value) ? value.toFixed(1) : 'N/A'}°C<br/>`;
            });
            
            return tooltipText;
          }
          return '';
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%',
        top: '15%'
      },
      dataZoom: [{
        type: 'inside',
        start: 0,
        end: 100
      }, {
        type: 'slider',
        start: 0,
        end: 100,
        height: 20,
        bottom: 10,
        dataBackground: {
          areaStyle: {
            color: '#f0f0f0'
          },
          lineStyle: {
            color: '#ccc'
          }
        },
        selectedDataBackground: {
          areaStyle: {
            color: '#e6f3ff'
          },
          lineStyle: {
            color: '#1890ff'
          }
        }
      }]
    };
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
        onClick={() => handleNodeSelect(node)}
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

  // WebSocket connection effect
  useEffect(() => {
    if (session?.token) {
      const wsUrl = `${process.env.NEXT_PUBLIC_THINGSBOARD_WSS_URL}/api/ws/plugins/telemetry?token=${session.token}`;
      const websocket = new WebSocket(wsUrl);
      
      websocket.onmessage = (event) => {
        console.log('ws message: ' + event.data);
      };
      
      websocket.onopen = () => {
        console.log('ws open');
      };
      
      websocket.onclose = () => {
        console.log('ws close');
      };
      
      websocket.onerror = (event) => {
        console.log('ws error: ' + event);
      };

      setWs(websocket);

      // Check connection status after 1 second
      setTimeout(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          console.log("WS Verbindung ist stabil 👍");
        } else {
          console.warn("WS ist NICHT offen, Zustand:", websocket.readyState);
        }
      }, 1000);

      // Cleanup function
      return () => {
        if (websocket.readyState === WebSocket.OPEN || websocket.readyState === WebSocket.CONNECTING) {
          websocket.close();
        }
      };
    }
  }, [session?.token]);


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

                  {/* Tab Navigation */}
                  <ul className="nav nav-tabs mb-4" id="nodeTabs" role="tablist">
                    <li className="nav-item" role="presentation">
                      <button
                        className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                        onClick={() => setActiveTab('overview')}
                        type="button"
                      >
                        <FontAwesomeIcon icon={faChartLine} className="me-2" />
                        Übersicht
                      </button>
                    </li>
                    <li className="nav-item" role="presentation">
                      <button
                        className={`nav-link ${activeTab === 'details' ? 'active' : ''}`}
                        onClick={() => setActiveTab('details')}
                        type="button"
                      >
                        <FontAwesomeIcon icon={faCog} className="me-2" />
                        Details
                      </button>
                    </li>
                  </ul>

                  {/* Tab Content */}
                  <div className="tab-content">
                    {/* Übersicht Tab */}
                    {activeTab === 'overview' && (
                      <div className="tab-pane fade show active">
                        {/* Aktuelle Temperaturen */}
                        <div className="row mb-4">
                          <div className="col-md-6">
                            <div className="card">
                              <div className="card-body text-center">
                                <FontAwesomeIcon icon={faThermometerHalf} className="text-danger mb-3" size="2x" />
                                <h4 className="card-title">Aktuelle Temperatur</h4>
                                {loadingTemperature ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    <span>Lade Temperatur...</span>
                                  </div>
                                ) : currentTemperature ? (
                                  <div>
                                    <div className="display-4 text-primary mb-2">
                                      {Number(currentTemperature.value).toFixed(1)}°C
                                    </div>
                                    <p className="text-muted mb-0">
                                      {currentTemperature.source === 'external' ? (
                                        <>Externe Temperatur (Device: {currentTemperature.deviceId?.substring(0, 8)}...)</>
                                      ) : (
                                        <>Durchschnittstemperatur ({currentTemperature.deviceCount} Geräte)</>
                                      )}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="text-muted">
                                    <p>Keine Temperaturdaten verfügbar</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="col-md-6">
                            <div className="card">
                              <div className="card-body text-center">
                                <FontAwesomeIcon icon={faBullseye} className="text-success mb-3" size="2x" />
                                <h4 className="card-title">Zieltemperatur</h4>
                                {loadingTemperature ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    <span>Lade Zieltemperatur...</span>
                                  </div>
                                ) : currentTargetTemperature ? (
                                  <div>
                                    <div className="display-4 text-success mb-2">
                                      {Number(currentTargetTemperature.value).toFixed(1)}°C
                                    </div>
                                    <p className="text-muted mb-0">
                                      {currentTargetTemperature.source === 'external' ? (
                                        <>Externe Zieltemperatur (Device: {currentTargetTemperature.deviceId?.substring(0, 8)}...)</>
                                      ) : (
                                        <>Maximale Zieltemperatur ({currentTargetTemperature.deviceCount} Geräte)</>
                                      )}
                                    </p>
                                  </div>
                                ) : (
                                  <div className="text-muted">
                                    <p>Keine Zieltemperaturdaten verfügbar</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Temperaturverlauf Chart */}
                        <div className="row">
                          <div className="col-12">
                            <div className="card">
                              <div className="card-header">
                                <h6 className="mb-0">
                                  <FontAwesomeIcon icon={faChartLine} className="me-2" />
                                  Temperaturverlauf (7 Tage)
                                </h6>
                              </div>
                              <div className="card-body">
                                {loadingTemperatureHistory ? (
                                  <div className="d-flex align-items-center justify-content-center" style={{ height: '400px' }}>
                                    <div className="spinner-border me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    <span>Lade Temperaturverlauf...</span>
                                  </div>
                                ) : temperatureHistory && temperatureHistory.length > 0 ? (
                                  <ReactECharts
                                    option={getTemperatureChartOption()}
                                    style={{ height: '400px', width: '100%' }}
                                    opts={{ renderer: 'canvas' }}
                                  />
                                ) : (
                                  <div className="text-center text-muted" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <div>
                                      <FontAwesomeIcon icon={faThermometerHalf} size="2x" className="mb-3" />
                                      <p>Keine Temperaturverlaufsdaten verfügbar</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Details Tab */}
                    {activeTab === 'details' && (
                      <div className="tab-pane fade show active">
                  
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
                  {((selectedNode.data?.operationalMode || selectedNode.operationalMode) !== undefined || 
                    (selectedNode.data?.fixValue || selectedNode.fixValue) !== undefined || 
                    (selectedNode.data?.maxTemp || selectedNode.maxTemp) !== undefined ||
                    (selectedNode.data?.runStatus || selectedNode.runStatus) !== undefined) && (
                    <div className="mt-4">
                      <h6 className="text-muted mb-3">Heizungseinstellungen</h6>
                      <div className="row">
                        <div className="col-md-3">
                          <div className="card h-100">
                            <div className="card-body text-center">
                              <FontAwesomeIcon icon={faThermometerHalf} className="text-primary mb-2" size="lg" />
                              <h6 className="card-title">Betriebsmodus</h6>
                              <p className="card-text">
                                {loadingNodeData ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border spinner-border-sm me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    Laden...
                                  </div>
                                ) : (
                                  selectedNode.data?.operationalMode || selectedNode.operationalMode
                                )}
                                {console.log('Displaying operationalMode:', selectedNode.data?.operationalMode || selectedNode.operationalMode, 'for node:', selectedNode.id)}
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
                                {loadingNodeData ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border spinner-border-sm me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    Laden...
                                  </div>
                                ) : (
                                  (selectedNode.data?.fixValue || selectedNode.fixValue) ? `${selectedNode.data?.fixValue || selectedNode.fixValue}°C` : 'Nicht gesetzt'
                                )}
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
                                {loadingNodeData ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border spinner-border-sm me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    Laden...
                                  </div>
                                ) : (
                                  (selectedNode.data?.minTemp || selectedNode.minTemp) && (selectedNode.data?.maxTemp || selectedNode.maxTemp)
                                    ? `${selectedNode.data?.minTemp || selectedNode.minTemp}°C - ${selectedNode.data?.maxTemp || selectedNode.maxTemp}°C`
                                    : 'Nicht definiert'
                                )}
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
                                {loadingNodeData ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border spinner-border-sm me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    Laden...
                                  </div>
                                ) : (
                                  (() => {
                                    const runStatus = selectedNode.data?.runStatus || selectedNode.runStatus;
                                    return runStatus === 'manual' ? 'Manuell' :
                                           runStatus === 'schedule' ? 'Zeitplan' :
                                           runStatus === 'fix' ? 'Fest' :
                                           runStatus || 'Unbekannt';
                                  })()
                                )}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                      </div>
                    )}
                  </div>
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

