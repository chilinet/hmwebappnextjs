import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBuilding, 
  faIndustry, 
  faMicrochip, 
  faChevronDown, 
  faChevronRight, 
  faArrowLeft,
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
  faFolder,
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
  faBullseye,
  faPlay
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
  const [forceExpand, setForceExpand] = useState(false);
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
  const [currentValveOpen, setCurrentValveOpen] = useState(null);
  const [valveOpenHistory, setValveOpenHistory] = useState([]);
  const [loadingCurrentTemp, setLoadingCurrentTemp] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [ws, setWs] = useState(null);
  const treeRef = useRef(null); 

  // Temperature state (API only)
  const [deviceTemperatures, setDeviceTemperatures] = useState({});

  // AbortController for cancelling requests
  const [abortController, setAbortController] = useState(null);

  // Time range selection
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d'); // Default: 7 days
  const [showTimeRangeModal, setShowTimeRangeModal] = useState(false);
  
  // Responsive state
  const [isMobile, setIsMobile] = useState(false);
  const [showTree, setShowTree] = useState(true);
  
  // Target temperature page state
  

  // Heating control state
  const [tempSliderValue, setTempSliderValue] = useState(20.0);
  const [scheduleData, setScheduleData] = useState(null);
  const [selectedDayPlans, setSelectedDayPlans] = useState({});
  const [originalSchedulerPlan, setOriginalSchedulerPlan] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [pendingRunStatus, setPendingRunStatus] = useState(null);
  const [pendingFixValue, setPendingFixValue] = useState(null);
  const [originalRunStatus, setOriginalRunStatus] = useState(null);
  const [originalFixValue, setOriginalFixValue] = useState(null);
  const [originalChildLock, setOriginalChildLock] = useState(null);
  const [originalMinTemp, setOriginalMinTemp] = useState(null);
  const [originalMaxTemp, setOriginalMaxTemp] = useState(null);
  const [originalOverruleMinutes, setOriginalOverruleMinutes] = useState(null);
  
  // Telemetry data for subordinate nodes
  const [subordinateTelemetry, setSubordinateTelemetry] = useState({});
  const [loadingSubordinateTelemetry, setLoadingSubordinateTelemetry] = useState(false);

  const timeRangeOptions = [
    { value: '1d', label: '1 Tag' },
    { value: '3d', label: '3 Tage' },
    { value: '7d', label: '7 Tage' },
    { value: '14d', label: '14 Tage' },
    { value: '30d', label: '30 Tage' },
    { value: '90d', label: '90 Tage' }
  ];

  const getTimeRangeInMs = (timeRange) => {
    const now = Date.now();
    switch (timeRange) {
      case '1d': return now - (1 * 24 * 60 * 60 * 1000);
      case '3d': return now - (3 * 24 * 60 * 60 * 1000);
      case '7d': return now - (7 * 24 * 60 * 60 * 1000);
      case '14d': return now - (14 * 24 * 60 * 60 * 1000);
      case '30d': return now - (30 * 24 * 60 * 60 * 1000);
      case '90d': return now - (90 * 24 * 60 * 60 * 1000);
      default: return now - (7 * 24 * 60 * 60 * 1000);
    }
  };

  const getTimeRangeLabel = (timeRange) => {
    const option = timeRangeOptions.find(opt => opt.value === timeRange);
    return option ? option.label : '7 Tage';
  };

  // Heating control functions
  const updateRunStatus = (newStatus) => {
    setPendingRunStatus(newStatus);
    setHasUnsavedChanges(true);
    
    // Load schedule data when switching to schedule mode
    if (newStatus === 'schedule' && customerData?.customerid && !scheduleData) {
      fetchScheduleData(customerData.customerid);
    }
  };

  const updateFixValue = (newValue) => {
    setPendingFixValue(newValue);
    setHasUnsavedChanges(true);
  };

  const fetchScheduleData = async (customerId) => {
    if (!customerId) return;
    
    setLoadingSchedule(true);
    try {
      const response = await fetch(`/api/config/customers/${customerId}/plans`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schedule data');
      }

      const data = await response.json();
      console.log('Schedule data received:', data);
      console.log('Plans array:', data.plans);
      setScheduleData(data.plans || null);
    } catch (error) {
      console.error('Error fetching schedule data:', error);
      setScheduleData(null);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handlePlanChange = (dayIndex, planIndex) => {
    setSelectedDayPlans(prev => ({
      ...prev,
      [dayIndex]: planIndex
    }));
    setHasUnsavedChanges(true);
  };

  const saveChanges = async () => {
    if (!selectedNode) return;
    
    setSavingSchedule(true);
    try {
      const updateData = {};

      if (pendingRunStatus !== null) {
        updateData.runStatus = pendingRunStatus;
      }

      if (pendingFixValue !== null) {
        updateData.fixValue = pendingFixValue;
      }

      // Handle schedulerPlan changes - always save if switching to schedule mode or if there are plan changes
      if (pendingRunStatus === 'schedule' || Object.keys(selectedDayPlans).length > 0) {
        if (Array.isArray(scheduleData)) {
          let planArray = [...originalSchedulerPlan];
          
          // Ensure we have 7 days (one for each day of the week)
          while (planArray.length < 7) {
            planArray.push(scheduleData[0]?.[0] || '');
          }

          // Apply any plan changes
          Object.entries(selectedDayPlans).forEach(([dayIndex, planIndex]) => {
            const newPlanName = scheduleData[planIndex]?.[0] || '';
            planArray[parseInt(dayIndex)] = newPlanName;
          });

          updateData.schedulerPlan = JSON.stringify(planArray);
        }
      }

      console.log('Saving heating control data:', updateData);
      console.log('Selected day plans:', selectedDayPlans);
      console.log('Original scheduler plan:', originalSchedulerPlan);
      console.log('Schedule data:', scheduleData);

      const response = await fetch(`/api/config/assets/${selectedNode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to save changes');
      }

      setHasUnsavedChanges(false);
      setSelectedDayPlans({});
      setPendingRunStatus(null);
      setPendingFixValue(null);
      
      if (pendingRunStatus !== null) setOriginalRunStatus(pendingRunStatus);
      if (pendingFixValue !== null) setOriginalFixValue(pendingFixValue);
      if (updateData.schedulerPlan) {
        setOriginalSchedulerPlan(JSON.parse(updateData.schedulerPlan));
      }
      
      fetchNodeDetails(selectedNode.id);
    } catch (error) {
      console.error('Error saving changes:', error);
    } finally {
      setSavingSchedule(false);
    }
  };

  const cancelChanges = () => {
    setSelectedDayPlans({});
    setPendingRunStatus(null);
    setPendingFixValue(null);
    setHasUnsavedChanges(false);
    
    if (originalFixValue !== null) {
      setTempSliderValue(originalFixValue);
    }
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

  // Hilfsfunktion um alle Knoten-IDs rekursiv zu sammeln
  const getAllNodeIds = (nodes) => {
    const nodeIds = [];
    
    const collectIds = (nodeList) => {
      if (!Array.isArray(nodeList)) return;
      
      nodeList.forEach(node => {
        if (node.id) {
          nodeIds.push(node.id);
        }
        if (node.children && Array.isArray(node.children)) {
          collectIds(node.children);
        }
      });
    };
    
    collectIds(nodes);
    return nodeIds;
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
      
      // Alle Knoten beim Laden aufklappen
      const allNodeIds = getAllNodeIds(data);
      console.log('🔓 Opening all nodes:', allNodeIds);
      setOpenNodes(allNodeIds);
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
      
      // Update original scheduler plan from node details
      const schedulerPlanValue = nodeData?.attributes?.schedulerPlan;
      if (schedulerPlanValue) {
        try {
          const planArray = JSON.parse(schedulerPlanValue);
          setOriginalSchedulerPlan(Array.isArray(planArray) ? planArray : []);
        } catch (error) {
          console.error('Error parsing schedulerPlan in fetchNodeDetails:', error);
          setOriginalSchedulerPlan([]);
        }
      } else {
        setOriginalSchedulerPlan([]);
      }
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
          // Fetch latest data from reporting API
          const response = await fetch(
            `/api/reporting-proxy?entity_id=${extTempDevice}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
            {
              headers: {
                'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            console.log('External temperature API response:', data);
            if (data.success && data.data && data.data.length > 0) {
              const latestData = data.data[0];
              console.log('External temperature latest data:', latestData);
              const temperature = latestData.sensor_temperature;
              const targetTemperature = latestData.target_temperature;
              const valveOpen = latestData.percent_valve_open;
              
              console.log('External temperature raw value:', temperature);
              console.log('External target temperature raw value:', targetTemperature);
              console.log('External valve open raw value:', valveOpen);
              
              if (temperature !== undefined && temperature !== null) {
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
              
              if (targetTemperature !== undefined && targetTemperature !== null) {
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
              
              // For operationalMode 2, calculate average valve open from all devices
              // instead of using external device valve open
              const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
              console.log('DEBUG: relatedDevices for valve open:', relatedDevices);
              console.log('DEBUG: relatedDevices length:', relatedDevices.length);
              if (relatedDevices.length > 0) {
                console.log('Calculating average valve open from all devices for operationalMode 2');
                // Extract device IDs from relatedDevices objects
                const deviceIds = relatedDevices.map(device => {
                  if (typeof device === 'string') {
                    return device;
                  } else if (device.id) {
                    return device.id;
                  } else if (device.deviceId) {
                    return device.deviceId;
                  }
                  return null;
                }).filter(id => id !== null);
                
                console.log('DEBUG: extracted device IDs:', deviceIds);
                
                const valveOpenPromises = deviceIds.map(async (deviceId) => {
                  try {
                    const response = await fetch(
                      `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                      {
                        headers: {
                          'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                        }
                      }
                    );
                    
                    if (response.ok) {
                      const data = await response.json();
                      if (data.success && data.data && data.data.length > 0) {
                        const valveOpen = data.data[0].percent_valve_open;
                        return valveOpen !== null && valveOpen !== undefined ? Number(valveOpen) : 0;
                      }
                    }
                    return 0;
                  } catch (error) {
                    console.warn(`Error fetching valve open for device ${deviceId}:`, error);
                    return 0;
                  }
                });
                
                const valveOpenValues = await Promise.all(valveOpenPromises);
                const validValveValues = valveOpenValues.filter(val => !isNaN(val) && val >= 0 && val <= 100);
                const averageValveOpen = validValveValues.length > 0 
                  ? validValveValues.reduce((sum, val) => sum + val, 0) / validValveValues.length 
                  : 0;
                
                console.log('Average valve open from all devices:', averageValveOpen);
                setCurrentValveOpen({
                  value: averageValveOpen,
                  source: 'average',
                  deviceCount: validValveValues.length
                });
              } else {
                console.warn('No related devices found for valve open calculation');
                setCurrentValveOpen({
                  value: 0,
                  source: 'average',
                  deviceCount: 0
                });
              }
            }
          }
        }
      } else if (operationalMode === 10) {
        // Use external temperature device for temperature only, average for target temperature and valve open
        if (extTempDevice) {
          const response = await fetch(
            `/api/reporting-proxy?entity_id=${extTempDevice}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
            {
              headers: {
                'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
              }
            }
          );
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              const latestData = data.data[0];
              const temperature = latestData.sensor_temperature;
              console.log('External temperature raw value:', temperature);
              
              if (temperature !== undefined && temperature !== null) {
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
        }
        
        // Load target temperature and valve open from related devices (average)
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
                  `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return data.data[0].target_temperature;
                  }
                  return null;
                }
              } catch (error) {
                console.warn(`Error fetching target temperature for device ${deviceId}:`, error);
              }
              return null;
            });

            const valveOpenPromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return data.data[0].percent_valve_open;
                  }
                  return null;
                }
              } catch (error) {
                console.warn(`Error fetching valve open for device ${deviceId}:`, error);
              }
              return null;
            });
            
            const targetTemperatures = await Promise.all(targetTemperaturePromises);
            const valveOpens = await Promise.all(valveOpenPromises);
            
            const validTargetTemperatures = targetTemperatures
              .filter(temp => temp !== null && temp !== undefined)
              .map(temp => Number(temp))
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100);

            const validValveOpens = valveOpens
              .filter(valve => valve !== null && valve !== undefined)
              .map(valve => Number(valve))
              .filter(valve => !isNaN(valve) && valve >= 0 && valve <= 100);
            
            if (validTargetTemperatures.length > 0) {
              const avgTargetTemp = validTargetTemperatures.reduce((sum, temp) => sum + temp, 0) / validTargetTemperatures.length;
              setCurrentTargetTemperature({
                value: avgTargetTemp,
                source: 'average',
                deviceCount: validTargetTemperatures.length
              });
            }

            if (validValveOpens.length > 0) {
              const avgValveOpen = validValveOpens.reduce((sum, valve) => sum + valve, 0) / validValveOpens.length;
              setCurrentValveOpen({
                value: avgValveOpen,
                source: 'average',
                deviceCount: validValveOpens.length
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
            // Fetch latest data for all devices
            const sensorTemperaturePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return {
                      temperature: data.data[0].sensor_temperature
                    };
                  }
                }
              } catch (error) {
                console.warn(`Error fetching temperature for device ${deviceId}:`, error);
              }
              return { temperature: null };
            });

            // Fetch target temperature
            const targetTemperaturePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return {
                      targetTemperature: data.data[0].target_temperature
                    };
                  }
                }
              } catch (error) {
                console.warn(`Error fetching target temperature for device ${deviceId}:`, error);
              }
              return { targetTemperature: null };
            });

            // Fetch valve open percentage
            const valveOpenPromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return {
                      valveOpen: data.data[0].percent_valve_open
                    };
                  }
                }
              } catch (error) {
                console.warn(`Error fetching valve open for device ${deviceId}:`, error);
              }
              return { valveOpen: null };
            });
            
            const sensorResults = await Promise.all(sensorTemperaturePromises);
            const targetResults = await Promise.all(targetTemperaturePromises);
            const valveOpenResults = await Promise.all(valveOpenPromises);
            console.log('Raw sensor temperature data from API:', sensorResults);
            console.log('Raw target temperature data from API:', targetResults);
            console.log('Raw valve open data from API:', valveOpenResults);
            
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

            const validValveOpen = valveOpenResults
              .filter(data => data.valveOpen !== null && data.valveOpen !== undefined)
              .map(data => {
                const numValveOpen = Number(data.valveOpen);
                console.log('Converting valve open:', data.valveOpen, 'to number:', numValveOpen);
                return numValveOpen;
              })
              .filter(valve => !isNaN(valve) && valve >= 0 && valve <= 100); // Reasonable valve range

            console.log('Valid temperatures after filtering:', validTemperatures);
            console.log('Valid target temperatures after filtering:', validTargetTemperatures);
            console.log('Valid valve open after filtering:', validValveOpen);
            
            if (validTemperatures.length > 0) {
              const averageTemp = validTemperatures.reduce((sum, temp) => sum + temp, 0) / validTemperatures.length;
              console.log('Calculated average temperature:', averageTemp);
              
              let avgTargetTemp = null;
              if (validTargetTemperatures.length > 0) {
                avgTargetTemp = validTargetTemperatures.reduce((sum, temp) => sum + temp, 0) / validTargetTemperatures.length;
                console.log('Calculated AVG target temperature:', avgTargetTemp);
              }
              
              let avgValveOpen = null;
              if (validValveOpen.length > 0) {
                avgValveOpen = validValveOpen.reduce((sum, valve) => sum + valve, 0) / validValveOpen.length;
                console.log('Calculated AVG valve open:', avgValveOpen);
              }
              
              setCurrentTemperature({
                value: averageTemp,
                source: 'average',
                deviceCount: validTemperatures.length
              });
              
              if (avgTargetTemp !== null) {
                setCurrentTargetTemperature({
                  value: avgTargetTemp,
                  source: 'average',
                  deviceCount: validTargetTemperatures.length
                });
              }
              
              if (avgValveOpen !== null) {
                setCurrentValveOpen({
                  value: avgValveOpen,
                  source: 'average',
                  deviceCount: validValveOpen.length
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

  const fetchTemperatureHistory = async (node, timeRange = null) => {
    if (!node || !session?.token) return;
    
    try {
      setLoadingTemperatureHistory(true);
      setTemperatureHistory([]);
      setTargetTemperatureHistory([]);
      
      const operationalMode = node.data?.operationalMode || node.operationalMode;
      const extTempDevice = node.data?.extTempDevice || node.extTempDevice;
      
      console.log('Fetching temperature history for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      
      // Calculate time range based on selected time range or provided timeRange parameter
      const endTime = Date.now();
      const timeRangeToUse = timeRange || selectedTimeRange;
      const startTime = getTimeRangeInMs(timeRangeToUse);
      
      console.log('Fetching temperature history for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      console.log('Time range - Start:', new Date(startTime).toISOString(), 'End:', new Date(endTime).toISOString());
      console.log('Time range in days:', (endTime - startTime) / (24 * 60 * 60 * 1000));
      console.log('Using time range:', timeRangeToUse);
      
      // Convert timestamps to ISO date strings for the reporting API
      const startDate = new Date(startTime).toISOString().split('T')[0];
      // Use current date as endDate to ensure we get data up to today
      const endDate = new Date().toISOString().split('T')[0];
      
      console.log('API query parameters:', {
        startDate,
        endDate,
        currentTime: new Date().toISOString(),
        currentDate: new Date().toISOString().split('T')[0]
      });
      
      if (operationalMode === 2) {
        // Use external temperature device for both temperature and target temperature
        if (extTempDevice) {
          // Fetch data from reporting API with date range
          // Try without end_date to get all available data, then filter client-side
            const response = await fetch(
              `/api/reporting-proxy?entity_id=${extTempDevice}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
              {
                headers: {
                  'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                }
              }
            );
          
          if (response.ok) {
            const data = await response.json();
            console.log('External temperature history API response:', data);
            if (data.success && data.data && data.data.length > 0) {
              console.log('External temperature history raw data sample:', data.data.slice(0, 3));
              console.log('External temperature history raw data sample (last 3):', data.data.slice(-3));
              console.log('Total data points received:', data.data.length);
              
              // Process temperature history
              // First sort the raw data by bucket_10m to ensure chronological order
              const sortedData = data.data.sort((a, b) => new Date(a.bucket_10m) - new Date(b.bucket_10m));
              console.log('Raw data time range:', {
                first: sortedData[0]?.bucket_10m,
                last: sortedData[sortedData.length - 1]?.bucket_10m
              });
              
              // Filter data to only include data up to current time
              const currentTime = new Date();
              const filteredData = sortedData.filter(item => {
                const itemTime = new Date(item.bucket_10m);
                return itemTime <= currentTime;
              });
              console.log('Filtered data time range:', {
                first: filteredData[0]?.bucket_10m,
                last: filteredData[filteredData.length - 1]?.bucket_10m,
                currentTime: currentTime.toISOString()
              });
              
              const historyData = filteredData
                .filter(item => item.sensor_temperature !== null && item.sensor_temperature !== undefined)
                .map(item => ({
                  time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                  timestamp: new Date(item.bucket_10m).getTime(),
                  temperature: Number(item.sensor_temperature)
                }))
                .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100);
              
              // Process target temperature history
              const targetHistoryData = filteredData
                .filter(item => item.target_temperature !== null && item.target_temperature !== undefined)
                .map(item => ({
                  time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                  timestamp: new Date(item.bucket_10m).getTime(),
                  temperature: Number(item.target_temperature)
                }))
                .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100);
              
              // For operationalMode 2, calculate average valve open from all devices
              // instead of using external device valve open
              const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
              let valveOpenHistoryData = [];
              
              console.log('DEBUG: relatedDevices for valve open history:', relatedDevices);
              console.log('DEBUG: relatedDevices length for history:', relatedDevices.length);
              if (relatedDevices.length > 0) {
                console.log('Calculating average valve open history from all devices for operationalMode 2');
                
                // Extract device IDs from relatedDevices objects
                const deviceIds = relatedDevices.map(device => {
                  if (typeof device === 'string') {
                    return device;
                  } else if (device.id) {
                    return device.id;
                  } else if (device.deviceId) {
                    return device.deviceId;
                  }
                  return null;
                }).filter(id => id !== null);
                
                console.log('DEBUG: extracted device IDs for history:', deviceIds);
                
                // Fetch valve open data from all devices
                const allDeviceValveData = await Promise.all(
                  deviceIds.map(async (deviceId) => {
                    try {
                      const response = await fetch(
                        `/api/reporting-proxy?entity_id=${deviceId}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                        {
                          headers: {
                            'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                          }
                        }
                      );
                      
                      if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.data && data.data.length > 0) {
                          return data.data.map(item => ({
                            timestamp: new Date(item.bucket_10m).getTime(),
                            valveOpen: item.percent_valve_open !== null && item.percent_valve_open !== undefined 
                              ? Number(item.percent_valve_open) 
                              : 0
                          }));
                        }
                      }
                      return [];
                    } catch (error) {
                      console.warn(`Error fetching valve open history for device ${deviceId}:`, error);
                      return [];
                    }
                  })
                );
                
                // Flatten and group by timestamp
                const valveOpenTimestampMap = new Map();
                const currentTime = new Date();
                
                allDeviceValveData.flat().forEach(item => {
                  // Filter by current time like we do for temperature data
                  const itemTime = new Date(item.timestamp);
                  if (itemTime <= currentTime && !isNaN(item.valveOpen) && item.valveOpen >= 0 && item.valveOpen <= 100) {
                    if (!valveOpenTimestampMap.has(item.timestamp)) {
                      valveOpenTimestampMap.set(item.timestamp, []);
                    }
                    valveOpenTimestampMap.get(item.timestamp).push(item.valveOpen);
                  }
                });
                
                // Calculate average for each timestamp
                valveOpenHistoryData = Array.from(valveOpenTimestampMap.entries())
                  .map(([timestamp, valves]) => ({
                    time: new Date(timestamp).toLocaleString('de-DE'),
                    timestamp: timestamp,
                    valveOpen: valves.reduce((sum, valve) => sum + valve, 0) / valves.length
                  }))
                  .sort((a, b) => a.timestamp - b.timestamp);
              } else {
                console.warn('No related devices found for valve open history calculation');
                valveOpenHistoryData = [];
              }
              
              console.log('External temperature history:', historyData);
              console.log('External target temperature history:', targetHistoryData);
              console.log('External valve open history:', valveOpenHistoryData);
              console.log('Temperature data points count:', historyData.length);
              console.log('Target temperature data points count:', targetHistoryData.length);
              console.log('Valve open data points count:', valveOpenHistoryData.length);
              
              // Debug: Show time range of processed data
              if (historyData.length > 0) {
                console.log('Processed temperature data time range:', {
                  first: new Date(historyData[0].timestamp).toLocaleString('de-DE'),
                  last: new Date(historyData[historyData.length - 1].timestamp).toLocaleString('de-DE'),
                  current: new Date().toLocaleString('de-DE')
                });
              }
              
              setTemperatureHistory(historyData);
              setTargetTemperatureHistory(targetHistoryData);
              setValveOpenHistory(valveOpenHistoryData);
            }
          }
        }
      } else if (operationalMode === 10) {
        // Use external temperature device for temperature only, average for target temperature and valve open
        if (extTempDevice) {
          // Fetch temperature data from external device
            const response = await fetch(
              `/api/reporting-proxy?entity_id=${extTempDevice}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
              {
                headers: {
                  'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                }
              }
            );
          
          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              // Process temperature history
              // First sort the raw data by bucket_10m to ensure chronological order
              const sortedData = data.data.sort((a, b) => new Date(a.bucket_10m) - new Date(b.bucket_10m));
              
              // Filter data to only include data up to current time
              const currentTime = new Date();
              const filteredData = sortedData.filter(item => {
                const itemTime = new Date(item.bucket_10m);
                return itemTime <= currentTime;
              });
              
              const historyData = filteredData
                .filter(item => item.sensor_temperature !== null && item.sensor_temperature !== undefined)
                .map(item => ({
                  time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                  timestamp: new Date(item.bucket_10m).getTime(),
                  temperature: Number(item.sensor_temperature)
                }))
                .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100);
              
              console.log('External temperature history:', historyData);
              console.log('Temperature data points count:', historyData.length);
              setTemperatureHistory(historyData);
            }
          }
        }
        
        // Load target temperature and valve open history from related devices (average)
        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices.map(device => {
            if (typeof device.id === 'object' && device.id?.id) {
              return device.id.id;
            }
            return device.id;
          }).filter(id => id);
          
          if (deviceIds.length > 0) {
            console.log('Fetching target temperature and valve open data for', deviceIds.length, 'devices');
            
            const allTargetTemperatureData = [];
            const allValveOpenData = [];
            
            // Fetch data for all related devices
            const devicePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return data.data;
                  }
                }
              } catch (error) {
                console.warn(`Error fetching data for device ${deviceId}:`, error);
              }
              return [];
            });
            
            const deviceResults = await Promise.all(devicePromises);
            const allDeviceData = deviceResults.flat();
            
            // Filter data to only include data up to current time
            const currentTime = new Date();
            const filteredDeviceData = allDeviceData.filter(item => {
              const itemTime = new Date(item.bucket_10m);
              return itemTime <= currentTime;
            });
            
            // Process target temperature data
            const targetHistoryData = filteredDeviceData
              .filter(item => item.target_temperature !== null && item.target_temperature !== undefined)
              .map(item => ({
                time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                timestamp: new Date(item.bucket_10m).getTime(),
                temperature: Number(item.target_temperature)
              }))
              .filter(item => !isNaN(item.temperature) && item.temperature > -50 && item.temperature < 100)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            // Process valve open data
            const valveOpenHistoryData = filteredDeviceData
              .map(item => ({
                time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                timestamp: new Date(item.bucket_10m).getTime(),
                valveOpen: item.percent_valve_open !== null && item.percent_valve_open !== undefined 
                  ? Number(item.percent_valve_open) 
                  : 0 // Use 0% when valve open data is not available
              }))
              .filter(item => !isNaN(item.valveOpen) && item.valveOpen >= 0 && item.valveOpen <= 100)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            console.log('AVG target temperature history:', targetHistoryData);
            console.log('AVG valve open history:', valveOpenHistoryData);
            setTargetTemperatureHistory(targetHistoryData);
            setValveOpenHistory(valveOpenHistoryData);
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
            console.log('Fetching temperature, target temperature and valve open data for', deviceIds.length, 'devices');
            
            // Fetch data for all related devices
            const devicePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    }
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return data.data;
                  }
                }
              } catch (error) {
                console.warn(`Error fetching data for device ${deviceId}:`, error);
              }
              return [];
            });
            
            const deviceResults = await Promise.all(devicePromises);
            const allDeviceData = deviceResults.flat();
            
            // Filter data to only include data up to current time
            const currentTime = new Date();
            const filteredDeviceData = allDeviceData.filter(item => {
              const itemTime = new Date(item.bucket_10m);
              return itemTime <= currentTime;
            });
            
            // Group by timestamp and calculate average for temperatures
            const timestampMap = new Map();
            const targetTimestampMap = new Map();
            const valveOpenTimestampMap = new Map();
            
            filteredDeviceData.forEach(item => {
              const bucketTime = new Date(item.bucket_10m).getTime();
              
              // Process sensor temperature
              if (item.sensor_temperature !== null && item.sensor_temperature !== undefined) {
                const temp = Number(item.sensor_temperature);
                if (!isNaN(temp) && temp > -50 && temp < 100) {
                  if (!timestampMap.has(bucketTime)) {
                    timestampMap.set(bucketTime, []);
                  }
                  timestampMap.get(bucketTime).push(temp);
                }
              }
              
              // Process target temperature
              if (item.target_temperature !== null && item.target_temperature !== undefined) {
                const temp = Number(item.target_temperature);
                if (!isNaN(temp) && temp > -50 && temp < 100) {
                  if (!targetTimestampMap.has(bucketTime)) {
                    targetTimestampMap.set(bucketTime, []);
                  }
                  targetTimestampMap.get(bucketTime).push(temp);
                }
              }
              
              // Process valve open
              const valve = item.percent_valve_open !== null && item.percent_valve_open !== undefined 
                ? Number(item.percent_valve_open) 
                : 0; // Use 0% when valve open data is not available
              
              if (!isNaN(valve) && valve >= 0 && valve <= 100) {
                if (!valveOpenTimestampMap.has(bucketTime)) {
                  valveOpenTimestampMap.set(bucketTime, []);
                }
                valveOpenTimestampMap.get(bucketTime).push(valve);
              }
            });
            
            const historyData = Array.from(timestampMap.entries())
              .map(([timestamp, temps]) => ({
                time: new Date(timestamp).toLocaleString('de-DE'),
                timestamp: timestamp,
                temperature: temps.reduce((sum, temp) => sum + temp, 0) / temps.length
              }))
              .sort((a, b) => a.timestamp - b.timestamp);
            
            const targetHistoryData = Array.from(targetTimestampMap.entries())
              .map(([timestamp, temps]) => ({
                time: new Date(timestamp).toLocaleString('de-DE'),
                timestamp: timestamp,
                temperature: temps.length > 0 ? temps.reduce((sum, temp) => sum + temp, 0) / temps.length : null
              }))
              .filter(item => item.temperature !== null)
              .sort((a, b) => a.timestamp - b.timestamp);

            const valveOpenHistoryData = Array.from(valveOpenTimestampMap.entries())
              .map(([timestamp, valves]) => ({
                time: new Date(timestamp).toLocaleString('de-DE'),
                timestamp: timestamp,
                valveOpen: valves.reduce((sum, valve) => sum + valve, 0) / valves.length
              }))
              .filter(item => item.valveOpen !== null)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            console.log('Average temperature history:', historyData);
            console.log('AVG target temperature history:', targetHistoryData);
            console.log('AVG valve open history:', valveOpenHistoryData);
            console.log('Temperature data points count:', historyData.length);
            console.log('Target temperature data points count:', targetHistoryData.length);
            console.log('Valve open data points count:', valveOpenHistoryData.length);
            console.log('First temperature data point:', historyData[0]);
            console.log('Last temperature data point:', historyData[historyData.length - 1]);
            setTemperatureHistory(historyData);
            setTargetTemperatureHistory(targetHistoryData);
            setValveOpenHistory(valveOpenHistoryData);
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
    if (!session?.token || !devices.length) {
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

      // Define the attributes we want to fetch
      const attributes = ['sensorTemperature', 'targetTemperature', 'PercentValveOpen', 'batteryVoltage', 'signalQuality'];
      
      // Fetch telemetry data for each device individually
      const devicesWithTelemetry = await Promise.all(
        devices.map(async (device) => {
          try {
            const deviceId = typeof device.id === 'object' && device.id?.id ? device.id.id : device.id;
            if (!deviceId) {
              return device;
            }

            // Fetch each attribute using the aggregated API
            const telemetry = {};
            
            for (const attribute of attributes) {
              try {
                const response = await fetch(
                  `/api/thingsboard/devices/telemetry/aggregated?deviceIds=${deviceId}&attribute=${attribute}&limit=1`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session.token}`
                    }
                  }
                );

                if (response.ok) {
                  const data = await response.json();
                  
                  if (data.success && data.data && data.data.length > 0) {
                    const deviceData = data.data[0];
                    if (deviceData.data && deviceData.data.length > 0) {
                      const latestValue = deviceData.data[deviceData.data.length - 1];
                      telemetry[attribute] = latestValue.value;
                      
                      // Debug logging for signalQuality
                      if (attribute === 'signalQuality') {
                        console.log(`SignalQuality for device ${deviceId}:`, {
                          rawValue: latestValue.value,
                          type: typeof latestValue.value,
                          fullData: latestValue
                        });
                      }
                    }
                  } else {
                    console.log(`No data found for ${attribute} on device ${deviceId}`);
                  }
                } else {
                  console.log(`API error for ${attribute} on device ${deviceId}:`, response.status, response.statusText);
                }
              } catch (error) {
                console.warn(`Error fetching ${attribute} for device ${deviceId}:`, error);
              }
            }
            
            console.log('Telemetry data for device', deviceId, ':', telemetry);

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
          } catch (error) {
            console.warn(`Error fetching telemetry for device ${deviceId}:`, error);
            return device;
          }
        })
      );

      console.log('Devices with telemetry:', devicesWithTelemetry);
      return devicesWithTelemetry;
    } catch (error) {
      console.error('Error fetching telemetry data:', error);
      return devices;
    }
  }, [session?.token]);

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
      
      // Also try to get additional device info from reporting API if we have devices
      if (devices.length > 0) {
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
  }, [treeData, fetchTelemetryForDevices]);

  const handleNodeSelect = (node) => {
    console.log('Node selected:', node);
    console.log('Node data:', node.data);
    console.log('Node operationalMode:', node.operationalMode);
    console.log('Node hasDevices:', node.hasDevices);
    console.log('=== hasDevices VALUE ===', node.hasDevices, '=== TYPE ===', typeof node.hasDevices);
    
    // Set loading state and clear previous data
    setLoadingNodeData(true);
    setSelectedNode(null);
    setNodeDetails(null);
    
    // Use the full node object, not just node.data
    setSelectedNode(node);
    
    // Set active tab based on hasDevices - check both node.hasDevices and node.data.hasDevices
    const hasDevices = node.hasDevices !== undefined ? node.hasDevices : (node.data?.hasDevices !== undefined ? node.data.hasDevices : false);
    console.log('Final hasDevices value:', hasDevices);
    
    if (!hasDevices) {
      console.log('Setting activeTab to "empty" (Übersicht) for node without devices');
      setActiveTab('empty');  // Übersicht für Nodes ohne Geräte
    } else {
      console.log('Setting activeTab to "overview" (Verlauf) for node with devices');
      setActiveTab('overview');  // Verlauf für Nodes mit Geräten
    }
    
    fetchNodeDetails(node.id);
    fetchTemperature(node);
    fetchTemperatureHistory(node);
    
    // Initialize scheduler plan from node data
    const schedulerPlanValue = node.data?.schedulerPlan;
    if (schedulerPlanValue) {
      try {
        const planArray = JSON.parse(schedulerPlanValue);
        setOriginalSchedulerPlan(Array.isArray(planArray) ? planArray : []);
      } catch (error) {
        console.error('Error parsing schedulerPlan in handleNodeSelect:', error);
        setOriginalSchedulerPlan([]);
      }
    } else {
      setOriginalSchedulerPlan([]);
    }
    
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
      // Fetch telemetry data for the devices
      fetchTelemetryForDevices(relatedDevices).then(devicesWithTelemetry => {
        setDevices(devicesWithTelemetry);
      });
    } else {
      console.log('No relatedDevices in selected node, fetching from API...');
      fetchDevices(node.id).then(result => {
        if (result && result.assigned) {
          setDevices(result.assigned);
        }
      });
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


  // Function to get all subordinate nodes (children and their descendants)
  const getAllSubordinateNodes = useCallback((nodeId, nodes = treeData) => {
    const findNode = (nodeList, targetId) => {
      for (const node of nodeList) {
        if (node.id === targetId) {
          return node;
        }
        if (node.children) {
          const found = findNode(node.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };

    const getNodePath = (nodeId, nodes = treeData, path = []) => {
      for (const node of nodes) {
        const currentPath = [...path, node];
        if (node.id === nodeId) {
          return currentPath;
        }
        if (node.children) {
          const found = getNodePath(nodeId, node.children, currentPath);
          if (found) return found;
        }
      }
      return null;
    };

    const collectAllChildren = (node) => {
      let allChildren = [];
      if (node.children) {
        for (const child of node.children) {
          allChildren.push(child);
          allChildren = allChildren.concat(collectAllChildren(child));
        }
      }
      return allChildren;
    };

    const targetNode = findNode(nodes, nodeId);
    if (!targetNode) return { path: [], subordinates: [] };

    const path = getNodePath(nodeId, nodes);
    const subordinates = collectAllChildren(targetNode);

    // Add path information to each subordinate node and filter only nodes with devices
    const subordinatesWithPaths = subordinates
      .filter(subNode => subNode.hasDevices === true)
      .map(subNode => {
        const subNodePath = getNodePath(subNode.id, nodes);
        return {
          ...subNode,
          path: subNodePath || []
        };
      });

    return { path: path || [], subordinates: subordinatesWithPaths };
  }, [treeData]);

  // Function to fetch telemetry data for a node
  const fetchNodeTelemetry = async (node) => {
    if (!node || !node.relatedDevices || node.relatedDevices.length === 0) {
      return { currentTemp: null, targetTemp: null, valvePosition: null, batteryVoltage: null, rssi: null, runStatus: node.runStatus || null };
    }

    try {
      const deviceIds = node.relatedDevices.map(device => {
        if (typeof device.id === 'object' && device.id?.id) {
          return device.id.id;
        }
        return device.id;
      }).filter(id => id);

      if (deviceIds.length === 0) {
        return { currentTemp: null, targetTemp: null, valvePosition: null, batteryVoltage: null, rssi: null, runStatus: node.runStatus || null };
      }

      // Fetch latest data for all devices
      const devicePromises = deviceIds.map(async (deviceId) => {
        try {
          const response = await fetch(
            `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
            {
              headers: {
                'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              const latestData = data.data[0];
              return {
                sensorTemperature: latestData.sensor_temperature,
                targetTemperature: latestData.target_temperature,
                valvePosition: latestData.percent_valve_open,
                batteryVoltage: latestData.battery_voltage,
                rssi: latestData.rssi
              };
            }
          }
        } catch (error) {
          console.warn(`Error fetching telemetry for device ${deviceId}:`, error);
        }
        return { sensorTemperature: null, targetTemperature: null, valvePosition: null, batteryVoltage: null, rssi: null };
      });

      const deviceResults = await Promise.all(devicePromises);
      
      // Calculate averages
      const validTemperatures = deviceResults
        .filter(data => data.sensorTemperature !== null && data.sensorTemperature !== undefined)
        .map(data => Number(data.sensorTemperature))
        .filter(temp => !isNaN(temp) && temp > -50 && temp < 100);

      const validTargetTemperatures = deviceResults
        .filter(data => data.targetTemperature !== null && data.targetTemperature !== undefined)
        .map(data => Number(data.targetTemperature))
        .filter(temp => !isNaN(temp) && temp > -50 && temp < 100);

      const validValvePositions = deviceResults
        .filter(data => data.valvePosition !== null && data.valvePosition !== undefined)
        .map(data => Number(data.valvePosition))
        .filter(pos => !isNaN(pos) && pos >= 0 && pos <= 100);

      const validBatteryVoltages = deviceResults
        .filter(data => data.batteryVoltage !== null && data.batteryVoltage !== undefined)
        .map(data => Number(data.batteryVoltage))
        .filter(voltage => !isNaN(voltage) && voltage > 0 && voltage < 10);

      const validRssiValues = deviceResults
        .filter(data => data.rssi !== null && data.rssi !== undefined)
        .map(data => Number(data.rssi))
        .filter(rssi => !isNaN(rssi) && rssi > -200 && rssi < 0);

      const avgCurrentTemp = validTemperatures.length > 0 
        ? validTemperatures.reduce((sum, temp) => sum + temp, 0) / validTemperatures.length 
        : null;

      const avgTargetTemp = validTargetTemperatures.length > 0 
        ? validTargetTemperatures.reduce((sum, temp) => sum + temp, 0) / validTargetTemperatures.length 
        : null;

      const avgValvePosition = validValvePositions.length > 0 
        ? validValvePositions.reduce((sum, pos) => sum + pos, 0) / validValvePositions.length 
        : null;

      const avgBatteryVoltage = validBatteryVoltages.length > 0 
        ? validBatteryVoltages.reduce((sum, voltage) => sum + voltage, 0) / validBatteryVoltages.length 
        : null;

      const avgRssi = validRssiValues.length > 0 
        ? validRssiValues.reduce((sum, rssi) => sum + rssi, 0) / validRssiValues.length 
        : null;

      return {
        currentTemp: avgCurrentTemp,
        targetTemp: avgTargetTemp,
        valvePosition: avgValvePosition,
        batteryVoltage: avgBatteryVoltage,
        rssi: avgRssi,
        runStatus: node.runStatus || null
      };
    } catch (error) {
      console.error('Error fetching node telemetry:', error);
      return { currentTemp: null, targetTemp: null, valvePosition: null, batteryVoltage: null, rssi: null, runStatus: node.runStatus || null };
    }
  };

  // Function to fetch telemetry for all subordinate nodes
  const fetchSubordinateTelemetry = useCallback(async (subordinates) => {
    if (!subordinates || subordinates.length === 0) {
      setSubordinateTelemetry({});
      return;
    }

    setLoadingSubordinateTelemetry(true);
    try {
      const telemetryPromises = subordinates.map(async (node) => {
        const telemetry = await fetchNodeTelemetry(node);
        return { nodeId: node.id, telemetry };
      });

      const results = await Promise.all(telemetryPromises);
      const telemetryMap = {};
      
      results.forEach(({ nodeId, telemetry }) => {
        telemetryMap[nodeId] = telemetry;
      });

      setSubordinateTelemetry(telemetryMap);
    } catch (error) {
      console.error('Error fetching subordinate telemetry:', error);
      setSubordinateTelemetry({});
    } finally {
      setLoadingSubordinateTelemetry(false);
    }
  }, []);

  // Funktion zur Synchronisation aller Datenquellen in 10-Minuten-Zeitscheiben
  const synchronizeChartData = () => {
    const hasTemperatureData = temperatureHistory && temperatureHistory.length > 0;
    const hasTargetTemperatureData = targetTemperatureHistory && targetTemperatureHistory.length > 0;
    const hasValveOpenData = valveOpenHistory && valveOpenHistory.length > 0;
    
    if (!hasTemperatureData && !hasTargetTemperatureData && !hasValveOpenData) {
      return { temperatureData: [], targetTemperatureData: [], valveOpenData: [] };
    }

    // Finde den gemeinsamen Zeitbereich
    const allTimestamps = [];
    if (hasTemperatureData) allTimestamps.push(...temperatureHistory.map(item => item.timestamp));
    if (hasTargetTemperatureData) allTimestamps.push(...targetTemperatureHistory.map(item => item.timestamp));
    if (hasValveOpenData) allTimestamps.push(...valveOpenHistory.map(item => item.timestamp));
    
    if (allTimestamps.length === 0) {
      return { temperatureData: [], targetTemperatureData: [], valveOpenData: [] };
    }

    const minTimestamp = Math.min(...allTimestamps);
    const maxTimestamp = Math.max(...allTimestamps);
    
    console.log('Synchronizing data from', new Date(minTimestamp), 'to', new Date(maxTimestamp));
    
    // Erstelle 10-Minuten-Zeitscheiben
    const timeSlices = [];
    const intervalMs = 10 * 60 * 1000; // 10 Minuten in Millisekunden
    
    for (let timestamp = minTimestamp; timestamp <= maxTimestamp; timestamp += intervalMs) {
      timeSlices.push(timestamp);
    }
    
    console.log('Created', timeSlices.length, 'time slices (10-minute intervals)');
    
    // Hilfsfunktion: Finde den nächstgelegenen Wert zu einem Zeitpunkt
    const findNearestValue = (dataArray, targetTimestamp, maxDistanceMs = 30 * 60 * 1000) => {
      if (!dataArray || dataArray.length === 0) return null;
      
      let nearestItem = null;
      let minDistance = Infinity;
      
      for (const item of dataArray) {
        const distance = Math.abs(item.timestamp - targetTimestamp);
        if (distance < minDistance && distance <= maxDistanceMs) {
          minDistance = distance;
          nearestItem = item;
        }
      }
      
      return nearestItem;
    };
    
    // Synchronisiere alle Datenquellen
    const synchronizedData = {
      temperatureData: [],
      targetTemperatureData: [],
      valveOpenData: []
    };
    
    timeSlices.forEach(sliceTimestamp => {
      // Finde Temperatur-Wert für diese Zeitscheibe
      const tempItem = hasTemperatureData ? findNearestValue(temperatureHistory, sliceTimestamp) : null;
      if (tempItem) {
        const temp = Number(tempItem.temperature);
        if (!isNaN(temp)) {
          synchronizedData.temperatureData.push([sliceTimestamp, temp]);
        }
      }
      
      // Finde Zieltemperatur-Wert für diese Zeitscheibe
      const targetItem = hasTargetTemperatureData ? findNearestValue(targetTemperatureHistory, sliceTimestamp) : null;
      if (targetItem) {
        const targetTemp = Number(targetItem.temperature);
        if (!isNaN(targetTemp)) {
          synchronizedData.targetTemperatureData.push([sliceTimestamp, targetTemp]);
        }
      }
      
      // Finde Ventilöffnung-Wert für diese Zeitscheibe
      const valveItem = hasValveOpenData ? findNearestValue(valveOpenHistory, sliceTimestamp) : null;
      if (valveItem) {
        const valve = Number(valveItem.valveOpen);
        if (!isNaN(valve)) {
          synchronizedData.valveOpenData.push([sliceTimestamp, valve]);
        }
      }
    });
    
    console.log('Synchronized data points:', {
      temperature: synchronizedData.temperatureData.length,
      targetTemperature: synchronizedData.targetTemperatureData.length,
      valveOpen: synchronizedData.valveOpenData.length
    });
    
    return synchronizedData;
  };

  const getTemperatureChartOption = (timeRange = null) => {
    // Verwende synchronisierte Daten
    const synchronizedData = synchronizeChartData();
    const { temperatureData, targetTemperatureData, valveOpenData } = synchronizedData;
    
    const timeRangeToUse = timeRange || selectedTimeRange;
    
    console.log('Chart data - temperatureData length:', temperatureData.length);
    console.log('Chart data - targetTemperatureData length:', targetTemperatureData.length);
    console.log('Chart data - valveOpenData length:', valveOpenData.length);
    console.log('Chart data - valveOpenData sample:', valveOpenData.slice(0, 3));
    
    const hasTemperatureData = temperatureData.length > 0;
    const hasTargetTemperatureData = targetTemperatureData.length > 0;
    const hasValveOpenData = valveOpenData.length > 0;
    
    console.log('Chart flags - hasTemperatureData:', hasTemperatureData);
    console.log('Chart flags - hasTargetTemperatureData:', hasTargetTemperatureData);
    console.log('Chart flags - hasValveOpenData:', hasValveOpenData);
    
    if (!hasTemperatureData && !hasTargetTemperatureData && !hasValveOpenData) {
      return {
        xAxis: {
          type: 'time',
          name: 'Zeit',
          nameLocation: 'middle',
          nameGap: 30,
          axisLabel: {
            color: '#666',
            formatter: function(value) {
              return new Date(value).toLocaleDateString('de-DE', {
                day: '2-digit',
                month: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
              });
            }
          },
          axisLine: {
            lineStyle: {
              color: '#ddd'
            }
          },
          splitLine: {
            lineStyle: {
              color: '#f0f0f0'
            }
          }
        },
        yAxis: {
          type: 'value',
          name: 'Temperatur (°C)',
          nameLocation: 'middle',
          nameGap: 50,
          axisLabel: {
            color: '#666',
            formatter: '{value}°C'
          },
          axisLine: {
            lineStyle: {
              color: '#ddd'
            }
          },
          splitLine: {
            lineStyle: {
              color: '#f0f0f0'
            }
          }
        },
        series: [],
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(255, 255, 255, 0.95)',
          borderColor: '#ddd',
          borderWidth: 1,
          textStyle: {
            color: '#333'
          },
          formatter: function(params) {
            return 'Keine Daten verfügbar';
          }
        },
        grid: {
          left: '10%',
          right: '10%',
          bottom: '15%',
          top: '15%',
          backgroundColor: 'transparent'
        },
        backgroundColor: 'transparent'
      };
    }

    console.log('Synchronized chart data points:', {
      temperature: temperatureData.length,
      targetTemperature: targetTemperatureData.length,
      valveOpen: valveOpenData.length
    });
    
    return {
      legend: {
        data: [
          ...(hasTemperatureData ? ['Aktuelle Temperatur'] : []),
          ...(hasTargetTemperatureData ? ['Zieltemperatur'] : []),
          ...(hasValveOpenData ? ['Ventilöffnung'] : [])
        ],
        top: 10,
        left: 'center',
        textStyle: {
          color: '#333',
          fontSize: 12
        },
        itemGap: 20,
        itemWidth: 14,
        itemHeight: 14
      },
      xAxis: {
        type: 'time',
        name: 'Zeit',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: {
          color: '#666',
          formatter: function(value) {
            return new Date(value).toLocaleDateString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              hour: '2-digit',
              minute: '2-digit'
            });
          }
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        },
        splitLine: {
          lineStyle: {
            color: '#f0f0f0'
          }
        },
        scale: true,
        minInterval: 3600000 // 1 hour minimum interval
      },
      yAxis: [
        {
          type: 'value',
          name: 'Temperatur (°C)',
          nameLocation: 'middle',
          nameGap: 50,
          position: 'left',
          axisLabel: {
            color: '#666',
            formatter: '{value}°C'
          },
          axisLine: {
            lineStyle: {
              color: '#ddd'
            }
          },
          splitLine: {
            lineStyle: {
              color: '#f0f0f0'
            }
          }
        },
        {
          type: 'value',
          name: 'Ventilöffnung (%)',
          nameLocation: 'middle',
          nameGap: 50,
          position: 'right',
          min: 0,
          max: 100,
          axisLabel: {
            color: '#666',
            formatter: '{value}%'
          },
          axisLine: {
            lineStyle: {
              color: '#ddd'
            }
          },
          splitLine: {
            show: false
          }
        }
      ],
      series: [
        ...(hasTemperatureData ? [{
          name: 'Aktuelle Temperatur',
          type: 'line',
          data: temperatureData,
          smooth: true,
          symbol: 'none',
          symbolSize: 0,
          connectNulls: true,
          encode: {
            x: 0,
            y: 1
          },
          lineStyle: {
            color: '#2196F3',
            width: 2
          },
          itemStyle: {
            color: '#2196F3'
          },
          areaStyle: {
            color: {
              type: 'linear',
              x: 0,
              y: 0,
              x2: 0,
              y2: 1,
              colorStops: [{
                offset: 0, color: 'rgba(33, 150, 243, 0.3)'
              }, {
                offset: 1, color: 'rgba(33, 150, 243, 0.05)'
              }]
            }
          }
        }] : []),
        ...(hasTargetTemperatureData ? [{
          name: 'Zieltemperatur',
          type: 'line',
          data: targetTemperatureData,
          smooth: true,
          symbol: 'none',
          symbolSize: 0,
          connectNulls: true,
          encode: {
            x: 0,
            y: 1
          },
          lineStyle: {
            color: '#4CAF50',
            width: 2,
            type: 'dashed'
          },
          itemStyle: {
            color: '#4CAF50'
          }
        }] : []),
        ...(hasValveOpenData ? [{
          name: 'Ventilöffnung',
          type: 'line',
          data: valveOpenData,
          smooth: true,
          symbol: 'none',
          symbolSize: 0,
          connectNulls: true,
          yAxisIndex: 1,
          encode: {
            x: 0,
            y: 1
          },
          lineStyle: {
            color: '#FF9800',
            width: 2
          },
          itemStyle: {
            color: '#FF9800'
          }
        }] : [])
      ],
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        borderWidth: 1,
        textStyle: {
          color: '#333',
          fontSize: 12
        },
        formatter: function(params) {
          console.log('Tooltip params:', params);
          
          if (params && params.length > 0) {
            // Get the timestamp from the first parameter
            const timestamp = params[0].axisValue;
            console.log('Tooltip timestamp:', timestamp, 'Date:', new Date(timestamp));
            
            const date = new Date(timestamp).toLocaleString('de-DE', {
              day: '2-digit',
              month: '2-digit',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            });
            let tooltipText = `<div style="font-weight: bold; margin-bottom: 5px;">${date}</div>`;
            
            params.forEach((param, index) => {
              console.log(`Param ${index}:`, param);
              
              // For time series data, param.value is an array [timestamp, value]
              const value = Array.isArray(param.value) ? param.value[1] : param.value;
              const seriesName = param.seriesName;
              const color = param.color;
              const displayValue = !isNaN(Number(value)) ? Number(value).toFixed(1) : 'N/A';
              
              console.log(`Series ${index}: ${seriesName}, value: ${value}, displayValue: ${displayValue}`);
              
              // Determine unit based on series name
              const unit = seriesName === 'Ventilöffnung' ? '%' : '°C';
              
              tooltipText += `<div style="display: flex; align-items: center; margin: 2px 0;">
                <span style="color:${color}; margin-right: 8px;">●</span> 
                <span style="font-weight: 500;">${seriesName}:</span> 
                <span style="margin-left: 8px; font-weight: bold;">${displayValue}${unit}</span>
              </div>`;
            });
            
            console.log('Final tooltip text:', tooltipText);
            return tooltipText;
          }
          return '';
        }
      },
      grid: {
        left: '10%',
        right: '10%',
        bottom: '15%', // Space for dataZoom slider
        top: '15%', // Space for legend
        backgroundColor: 'transparent'
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
        bottom: 15,
        backgroundColor: 'rgba(240, 240, 240, 0.3)',
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
        },
        handleStyle: {
          color: '#1890ff'
        }
      }],
      backgroundColor: 'transparent',
      animation: true,
      animationDuration: 1000,
      animationEasing: 'cubicOut'
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
      const mobile = window.innerWidth < 800;
      setIsMobile(mobile);
      if (mobile) {
        setShowTree(false);
      } else {
        setShowTree(true);
      }
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

  // Load telemetry data for subordinate nodes when activeTab changes to 'empty'
  useEffect(() => {
    if (activeTab === 'empty' && selectedNode) {
      const { subordinates } = getAllSubordinateNodes(selectedNode.id);
      if (subordinates.length > 0) {
        fetchSubordinateTelemetry(subordinates);
      }
    }
  }, [activeTab, selectedNode, getAllSubordinateNodes, fetchSubordinateTelemetry]);


  // Function to find path to selected node
  const getPathToNode = useCallback((nodeId, nodes = treeData) => {
    const findPath = (nodeList, targetId, currentPath = []) => {
      for (const node of nodeList) {
        const newPath = [...currentPath, node.id];
        
        if (node.id === targetId) {
          return newPath;
        }
        
        if (node.children && node.children.length > 0) {
          const childPath = findPath(node.children, targetId, newPath);
          if (childPath) {
            return childPath;
          }
        }
      }
      return null;
    };
    
    return findPath(nodes, nodeId);
  }, [treeData]);

  // Expand all nodes when tree data is loaded
  useEffect(() => {
    if (treeData && treeData.length > 0) {
      const allNodeIds = getAllNodeIds(treeData);
      console.log('Tree data loaded, expanding all nodes:', allNodeIds);
      console.log('Current openNodes before setting:', openNodes);
      setOpenNodes(allNodeIds);
      setForceExpand(true);
      
      // Force re-render after a short delay to ensure the tree is ready
      setTimeout(() => {
        console.log('Setting openNodes after delay:', allNodeIds);
        setOpenNodes(allNodeIds);
        setForceExpand(true);
      }, 100);
    }
  }, [treeData]);

  // Expand path to selected node when a node is selected
  useEffect(() => {
    if (selectedNode && treeData && treeData.length > 0) {
      const pathToNode = getPathToNode(selectedNode.id);
      if (pathToNode) {
        console.log('Selected node:', selectedNode.label);
        console.log('Path to selected node:', pathToNode);
        setOpenNodes(pathToNode);
        setForceExpand(false); // Disable force expand, use specific path
      }
    }
  }, [selectedNode, treeData, getPathToNode]);

  // Fallback function to fetch temperatures via API
  const fetchTemperaturesViaAPI = useCallback(async (deviceIds) => {
    if (!session?.token || !deviceIds.length) return;

    try {
      console.log('🌡️ Fetching temperatures via API for devices:', deviceIds);
      
      const temperaturePromises = deviceIds.map(async (deviceId) => {
        try {
          const response = await fetch(
            `/api/reporting-proxy?entity_id=${deviceId}&limit=1&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
            {
              headers: {
                'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
              }
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              const temperature = data.data[0].sensor_temperature;
              
              if (temperature !== undefined && temperature !== null) {
                setDeviceTemperatures(prev => ({
                  ...prev,
                  [deviceId]: {
                    temperature: temperature,
                    timestamp: Date.now()
                  }
                }));
              }
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
  }, [session?.token]);

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
      <div className="container-fluid p-0 heating-control-page">
        <div className="d-flex" style={{ height: windowHeight ? `${windowHeight - 80}px` : 'calc(100vh - 80px)' }}>
          {/* Mobile Toggle Button */}
          {isMobile && (
            <button
              className="btn btn-primary position-fixed shadow"
              style={{ 
                top: '10px', 
                left: '10px', 
                zIndex: 1050,
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)'
              }}
              onClick={() => setShowTree(!showTree)}
              title="Struktur anzeigen/verstecken"
            >
              <FontAwesomeIcon icon={faBuilding} />
            </button>
          )}
          
          {/* Mobile Overlay */}
          {isMobile && showTree && (
            <div 
              className="position-fixed w-100 h-100 bg-dark"
              style={{ 
                top: 0, 
                left: 0, 
                zIndex: 1035,
                opacity: 0.5
              }}
              onClick={() => setShowTree(false)}
            />
          )}
          
           {/* Linke Seite: Hierarchie */}
           <div 
             className={`card bg-light text-white ${isMobile ? (showTree ? 'd-block' : 'd-none') : 'd-block'}`}
             style={{ 
               minWidth: isMobile ? '100%' : '400px',
               width: isMobile ? '100%' : '400px',
               height: windowHeight ? `${windowHeight - 80}px` : 'calc(100vh - 80px)',
               position: isMobile ? 'fixed' : 'relative',
               top: isMobile ? '0' : 'auto',
               left: isMobile ? '0' : 'auto',
               zIndex: isMobile ? 1040 : 'auto',
               display: 'flex',
               flexDirection: 'column',
               overflow: 'hidden'
             }}
           >
                  <div className="card-header bg-light border-secondary">
                    <h5 className="mb-0 d-flex align-items-center justify-content-between">
                      <div className="d-flex align-items-center">
                        <FontAwesomeIcon icon={faBuilding} className="me-2 text-primary" />
                        Heizungssteuerung
                      </div>
                      {isMobile && (
                        <button
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setShowTree(false)}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </h5>
                  </div>
            <div className="card-body tree-container" style={{ flex: 1, minHeight: 0 }}>
              {/* Suchfeld für Tree */}
              <div className="tree-header">
                <div className="d-flex gap-2">
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
                      <button 
                        className="btn btn-outline-info btn-sm ms-1"
                        onClick={() => {
                          if (openNodes.length === 0) {
                            // Alle Knoten aufklappen
                            const allNodeIds = getAllNodeIds(treeData);
                            setOpenNodes(allNodeIds);
                            //setOpenNodes("4db7a8b0-0816-11f0-bf3e-fdfa06a0145e");
                          } else {
                            // Alle Knoten zuklappen
                            setOpenNodes([]);
                          }
                        }}
                        title={openNodes.length === 0 ? "Alle aufklappen" : "Alle zuklappen"}
                      >
                        <FontAwesomeIcon 
                          icon={openNodes.length === 0 ? faChevronDown : faChevronRight} 
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
              </div>

              {/* Scrollbarer Bereich für Tree */}
              <div className="tree-content">
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
                  ref={treeRef}
                  tree={(() => {
                    const filtered = getFilteredTreeData();
                    const converted = convertToTreeViewFormat(filtered);
                    console.log('Filtered tree data:', filtered);
                    console.log('Converted tree data:', converted);
                    return converted;
                  })()}
                  initialOpen={openNodes}  
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
                  //openNodes={getAllNodeIds(treeData)}
                  //onToggle={(id) => {
                  //  setOpenNodes((prevOpenNodes) => {
                  //    const isOpen = prevOpenNodes.includes(id);
                  //    return isOpen
                  //      ? prevOpenNodes.filter((nodeId) => nodeId !== id)
                  //      : [...prevOpenNodes, id];
                  //  });
                  //}}
                  //canDrop={() => false}
                  //canDrag={() => false}
                // />
                openIds={openNodes}    
                onChangeOpen={setOpenNodes}
                canDrop={() => false}
                canDrag={() => false}
                />
                )}
              </div>
            </div>
          </div>

          {/* Rechte Seite: Dashboard Content */}
          <div className={`flex-grow-1 d-flex flex-column main-content ${isMobile && showTree ? 'd-none' : 'd-flex'}`}>
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
                    {selectedNode && (selectedNode.hasDevices === false || (selectedNode.data?.hasDevices === false)) && (
                      <li className="nav-item" role="presentation">
                        <button
                          className={`nav-link ${activeTab === 'empty' ? 'active' : ''}`}
                          onClick={() => setActiveTab('empty')}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faFolder} className="me-2" />
                          Übersicht
                        </button>
                      </li>
                    )}
                    {selectedNode && (selectedNode.hasDevices === true || (selectedNode.data?.hasDevices === true)) && (
                      <li className="nav-item" role="presentation">
                        <button
                          className={`nav-link ${activeTab === 'overview' ? 'active' : ''}`}
                          onClick={() => setActiveTab('overview')}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faChartLine} className="me-2" />
                          Verlauf
                        </button>
                      </li>
                    )}
                    {selectedNode && (
                      <li className="nav-item" role="presentation">
                        <button
                          className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
                          onClick={() => setActiveTab('settings')}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faBullseye} className="me-2" />
                          Einstellungen
                        </button>
                      </li>
                    )}
                    {selectedNode && (selectedNode.hasDevices === true || (selectedNode.data?.hasDevices === true)) && (
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
                    )}
                  </ul>

                  {/* Tab Content */}
                  <div className="tab-content">
                    {/* Übersicht Tab */}
                    {activeTab === 'overview' && (
                      <div className="tab-pane fade show active">
                        {/* Aktuelle Temperaturen */}
                        <div className="responsive-cards mb-4">
                          <div className="responsive-card">
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
                                  </div>
                                ) : (
                                  <div className="text-muted">
                                    <p>Keine Temperaturdaten verfügbar</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          <div className="responsive-card">
                            <div className="card" style={{ cursor: 'pointer' }} onClick={() => {
                              setActiveTab('settings');
                              // Initialize heating control state
                              if (selectedNode) {
                                const runStatus = nodeDetails?.attributes?.runStatus || selectedNode.data?.runStatus || selectedNode.runStatus;
                                const fixValue = nodeDetails?.attributes?.fixValue || selectedNode.data?.fixValue || selectedNode.fixValue;
                                
                                // Set original values
                                setOriginalRunStatus(runStatus);
                                setOriginalFixValue(fixValue);
                                
                                // Initialize slider value
                                if (fixValue) {
                                  setTempSliderValue(parseFloat(fixValue));
                                } else {
                                  const minTemp = nodeDetails?.attributes?.minTemp || selectedNode.data?.minTemp || 15;
                                  const maxTemp = nodeDetails?.attributes?.maxTemp || selectedNode.data?.maxTemp || 30;
                                  setTempSliderValue((minTemp + maxTemp) / 2);
                                }
                                
                                // Load schedule data if customer data is available
                                if (customerData?.customerid) {
                                  fetchScheduleData(customerData.customerid);
                                  
                                  // Parse existing scheduler plan
                                  const schedulerPlanValue = nodeDetails?.attributes?.schedulerPlan || selectedNode.data?.schedulerPlan;
                                  if (schedulerPlanValue) {
                                    try {
                                      const planArray = JSON.parse(schedulerPlanValue);
                                      setOriginalSchedulerPlan(Array.isArray(planArray) ? planArray : []);
                                    } catch (error) {
                                      console.error('Error parsing original schedulerPlan:', error);
                                      setOriginalSchedulerPlan([]);
                                    }
                                  } else {
                                    setOriginalSchedulerPlan([]);
                                  }
                                }
                                
                                // Reset pending changes
                                setPendingRunStatus(null);
                                setPendingFixValue(null);
                                setSelectedDayPlans({});
                                setHasUnsavedChanges(false);
                              }
                            }}>
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
                                  </div>
                                ) : (
                                  <div className="text-muted">
                                    <p>Keine Zieltemperaturdaten verfügbar</p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="responsive-card">
                            <div className="card">
                              <div className="card-body text-center">
                                <FontAwesomeIcon icon={faCog} className="text-warning mb-3" size="2x" />
                                <h4 className="card-title">Ventilöffnung</h4>
                                {loadingTemperature ? (
                                  <div className="d-flex align-items-center justify-content-center">
                                    <div className="spinner-border me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    <span>Lade Ventilöffnung...</span>
                                  </div>
                                ) : currentValveOpen ? (
                                  <div>
                                    <div className="display-4 text-warning mb-2">
                                      {Number(currentValveOpen.value).toFixed(1)}%
                                    </div>
                                  </div>
                                ) : (
                                  <div className="text-muted">
                                    <p>Keine Ventilöffnungsdaten verfügbar</p>
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
                                <div className="d-flex justify-content-between align-items-center">
                                  <h6 
                                    className="mb-0" 
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setShowTimeRangeModal(true)}
                                    title="Klicken um Zeitbereich zu ändern"
                                  >
                                    <FontAwesomeIcon icon={faChartLine} className="me-2" />
                                    Temperaturverlauf ({getTimeRangeLabel(selectedTimeRange)})
                                    <FontAwesomeIcon 
                                      icon={faCog} 
                                      className="ms-2" 
                                      size="sm"
                                    />
                                  </h6>
                                </div>
                              </div>
                              <div className="card-body" style={{ maxHeight: '500px', overflowY: 'auto' }}>
                                {loadingTemperatureHistory ? (
                                  <div className="d-flex align-items-center justify-content-center" style={{ height: '400px' }}>
                                    <div className="spinner-border me-2" role="status">
                                      <span className="visually-hidden">Laden...</span>
                                    </div>
                                    <span>Lade Temperaturverlauf...</span>
                                  </div>
                                ) : temperatureHistory && temperatureHistory.length > 0 ? (
                                  <div style={{ 
                                    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                                    borderRadius: '10px',
                                    padding: '15px',
                                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                                    minHeight: '400px'
                                  }}>
                                    <ReactECharts
                                      option={getTemperatureChartOption()}
                                      style={{ height: '400px', width: '100%' }}
                                      opts={{ renderer: 'canvas' }}
                                    />
                                  </div>
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
                    <div className="col-12">
                      {console.log('Rendering devices:', devices, 'Length:', devices?.length)}
                      {devices && devices.length > 0 && (
                        <>
                          <div className="d-flex justify-content-between align-items-center mb-3">
                            <h6 className="text-muted mb-0">
                              <FontAwesomeIcon icon={faMicrochip} className="me-2" />
                              Zugehörige Geräte ({devices.length})
                            </h6>
                          </div>
                          <div className="list-group">
                            {devices.map((device, index) => {
                              // Debug: Log device telemetry data
                              console.log('Device', index, 'telemetry data:', device.telemetry);
                              return (
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
                                    <div className="d-flex flex-wrap gap-2">
                                      {(deviceTemperatures[device.id]?.temperature || device.telemetry?.sensorTemperature) && (
                                        <div className="bg-light border rounded p-2 text-center" style={{ minWidth: '80px', flex: '0 0 auto' }}>
                                          <small className="text-muted d-block">
                                            Temperatur
                                            {deviceTemperatures[device.id]?.temperature && (
                                              <span className="badge bg-info ms-1" style={{ fontSize: '0.5em' }}>
                                                API
                                              </span>
                                            )}
                                          </small>
                                          <div className="fw-bold text-primary" style={{ fontSize: '0.9rem' }}>
                                            {Number(deviceTemperatures[device.id]?.temperature || device.telemetry?.sensorTemperature).toFixed(1)}°C
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.targetTemperature !== undefined && device.telemetry?.targetTemperature !== null && (
                                        <div className="bg-light border rounded p-2 text-center" style={{ minWidth: '80px', flex: '0 0 auto' }}>
                                          <small className="text-muted d-block">Ziel</small>
                                          <div className="fw-bold text-success" style={{ fontSize: '0.9rem' }}>
                                            {Number(device.telemetry.targetTemperature).toFixed(1)}°C
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.batteryVoltage !== undefined && device.telemetry?.batteryVoltage !== null && (
                                        <div className="bg-light border rounded p-2 text-center" style={{ minWidth: '80px', flex: '0 0 auto' }}>
                                          <small className="text-muted d-block">Batterie</small>
                                          <div className="fw-bold text-warning" style={{ fontSize: '0.9rem' }}>
                                            {Number(device.telemetry.batteryVoltage).toFixed(2)}V
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.PercentValveOpen !== undefined && device.telemetry?.PercentValveOpen !== null && (
                                        <div className="bg-light border rounded p-2 text-center" style={{ minWidth: '80px', flex: '0 0 auto' }}>
                                          <small className="text-muted d-block">Ventil</small>
                                          <div className="fw-bold text-info" style={{ fontSize: '0.9rem' }}>
                                            {Number(device.telemetry.PercentValveOpen).toFixed(0)}%
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.signalQuality !== undefined && device.telemetry?.signalQuality !== null && device.telemetry?.signalQuality !== 0 && (
                                        <div className="bg-light border rounded p-2 text-center" style={{ minWidth: '80px', flex: '0 0 auto' }}>
                                          <small className="text-muted d-block">Signal</small>
                                          <div className="fw-bold text-secondary" style={{ fontSize: '0.8rem' }}>
                                            {String(device.telemetry.signalQuality)}
                                          </div>
                                        </div>
                                      )}
                                      {!deviceTemperatures[device.id]?.temperature && !device.telemetry?.sensorTemperature && (
                                        <div className="bg-warning border rounded p-2 text-center" style={{ minWidth: '120px', flex: '0 0 auto' }}>
                                          <small className="text-muted">
                                            <span className="badge bg-warning me-1" style={{ fontSize: '0.5em' }}>
                                              Warten...
                                            </span>
                                            Keine Daten
                                          </small>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                )}
                              </div>
                              );
                            })}
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
                  

                      </div>
                    )}

                    {/* Einstellungen Tab */}
                    {activeTab === 'settings' && (
                      <div className="tab-pane fade show active">
                        <div className="row">
                          <div className="col-12">

                            {/* Status Icons Section */}
                            <div className="mb-4">
                              <h5><strong>Status:</strong></h5>
                              {(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'manual' && (
                                <div className="alert alert-info mb-3" role="alert">
                                  <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                                  <strong>Manueller Modus:</strong> Alle Thermostate unterhalb dieses Knotens werden nicht mehr über HEATMANAGER gesteuert.
                                </div>
                              )}
                              <div className="d-flex justify-content-center gap-4">
                                <div className="text-center">
                                  <img 
                                    src={(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'manual' ? "/assets/img/hm_manuel_active.svg" : "/assets/img/hm_manuel_inactive.svg"}
                                    alt="Manuell"
                                    style={{ width: '60px', height: '60px', cursor: 'pointer' }}
                                    onClick={() => updateRunStatus('manual')}
                                  />
                                  <div className="mt-2">
                                    <small className="text-muted">Manuell</small>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <img 
                                    src={(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'schedule' ? "/assets/img/hm_plan_active.svg" : "/assets/img/hm_plan_inactive.svg"}
                                    alt="Plan"
                                    style={{ width: '60px', height: '60px', cursor: 'pointer' }}
                                    onClick={() => updateRunStatus('schedule')}
                                  />
                                  <div className="mt-2">
                                    <small className="text-muted">Plan</small>
                                  </div>
                                </div>
                                <div className="text-center">
                                  <img 
                                    src={(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'fix' ? "/assets/img/hm_fix_active.svg" : "/assets/img/hm_fix_inactive.svg"}
                                    alt="Fix"
                                    style={{ width: '60px', height: '60px', cursor: 'pointer' }}
                                    onClick={() => updateRunStatus('fix')}
                                  />
                                  <div className="mt-2">
                                    <small className="text-muted">Fix</small>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Fix Temperature Widget */}
                            {(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'fix' && (
                              <div className="mb-4">
                                <h5><strong>Fix Temperatur:</strong></h5>
                                <div className="d-flex justify-content-center">
                                  <div className="card" style={{
                                    background: 'linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%)',
                                    border: '3px solid #fbbc29',
                                    borderRadius: '20px',
                                    minWidth: '300px',
                                    maxWidth: '400px',
                                    boxShadow: '0 4px 15px rgba(251, 188, 41, 0.2)'
                                  }}>
                                    <div className="card-body text-center py-4">
                                      <div style={{
                                        fontSize: '2.5rem',
                                        fontWeight: 'bold',
                                        color: '#333',
                                        lineHeight: '1',
                                        marginBottom: '10px'
                                      }}>
                                        {pendingFixValue !== null ? pendingFixValue : tempSliderValue}°
                                      </div>
                                      <div style={{
                                        fontSize: '0.9rem',
                                        color: '#666',
                                        marginBottom: '20px'
                                      }}>
                                        Zieltemperatur
                                      </div>
                                      <div className="px-3">
                                        <input
                                          type="range"
                                          className="form-range"
                                          min={nodeDetails?.attributes?.minTemp || 15}
                                          max={nodeDetails?.attributes?.maxTemp || 30}
                                          step="0.5"
                                          value={pendingFixValue !== null ? pendingFixValue : tempSliderValue}
                                          onChange={(e) => {
                                            const newValue = parseFloat(e.target.value);
                                            setTempSliderValue(newValue);
                                            updateFixValue(newValue);
                                          }}
                                          style={{
                                            background: `linear-gradient(to right, #fbbc29 0%, #fbbc29 ${(((pendingFixValue !== null ? pendingFixValue : tempSliderValue) - (nodeDetails?.attributes?.minTemp || 15)) / ((nodeDetails?.attributes?.maxTemp || 30) - (nodeDetails?.attributes?.minTemp || 15))) * 100}%, #ddd ${(((pendingFixValue !== null ? pendingFixValue : tempSliderValue) - (nodeDetails?.attributes?.minTemp || 15)) / ((nodeDetails?.attributes?.maxTemp || 30) - (nodeDetails?.attributes?.minTemp || 15))) * 100}%, #ddd 100%)`,
                                            height: '8px',
                                            borderRadius: '5px',
                                            outline: 'none',
                                            cursor: 'pointer'
                                          }}
                                        />
                                        <div className="d-flex justify-content-between mt-2">
                                          <small className="text-muted">{nodeDetails?.attributes?.minTemp || 15}°</small>
                                          <small className="text-muted">{nodeDetails?.attributes?.maxTemp || 30}°</small>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Schedule Table Widget */}
                            {(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'schedule' && (
                              <div className="mb-4">
                                <div className="d-flex justify-content-between align-items-center mb-3">
                                  <h5 className="mb-0"><strong>Wochenplan:</strong></h5>
                                  {hasUnsavedChanges && (
                                    <div className="d-flex gap-2">
                                      <button
                                        className="btn btn-outline-secondary btn-sm"
                                        onClick={cancelChanges}
                                        disabled={savingSchedule}
                                      >
                                        <FontAwesomeIcon icon={faTimes} className="me-1" />
                                        Abbrechen
                                      </button>
                                      <button
                                        className="btn btn-warning btn-sm"
                                        onClick={saveChanges}
                                        disabled={savingSchedule}
                                      >
                                        {savingSchedule ? (
                                          <>
                                            <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                                            Speichern...
                                          </>
                                        ) : (
                                          <>
                                            <FontAwesomeIcon icon={faCheckCircle} className="me-1" />
                                            Speichern
                                          </>
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </div>
                                <div className="card" style={{
                                  border: '2px solid #fbbc29',
                                  borderRadius: '15px',
                                  boxShadow: '0 4px 15px rgba(251, 188, 41, 0.1)'
                                }}>
                                  <div className="card-body">
                                    {loadingSchedule ? (
                                      <div className="text-center py-5">
                                        <div className="spinner-border text-warning" role="status">
                                          <span className="visually-hidden">Loading...</span>
                                        </div>
                                        <p className="mt-2 text-muted">Lade Wochenplan...</p>
                                      </div>
                                    ) : scheduleData && Array.isArray(scheduleData) && scheduleData.length > 0 ? (
                                      <div className="table-responsive">
                                        <table className="table table-sm table-bordered">
                                          <thead className="table-warning">
                                            <tr>
                                              <th style={{ width: '60px' }}>Std</th>
                                              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day, dayIndex) => (
                                                <th key={day} className="text-center" style={{ 
                                                  minWidth: '120px',
                                                  fontSize: '0.9rem',
                                                  padding: '0.5rem 0.25rem'
                                                }}>
                                                  <div className="fw-bold">{day}</div>
                                                  <div style={{ marginTop: '5px' }}>
                                                    <select 
                                                      className="form-select form-select-sm"
                                                      value={(() => {
                                                        if (selectedDayPlans[dayIndex] !== undefined) {
                                                          return selectedDayPlans[dayIndex];
                                                        }
                                                        const schedulerPlanValue = nodeDetails?.attributes?.schedulerPlan;
                                                        if (schedulerPlanValue && Array.isArray(scheduleData)) {
                                                          try {
                                                            const planArray = JSON.parse(schedulerPlanValue);
                                                            if (Array.isArray(planArray) && planArray[dayIndex]) {
                                                              const planNameForDay = planArray[dayIndex];
                                                              const foundIndex = scheduleData.findIndex(plan => plan[0] === planNameForDay);
                                                              return foundIndex !== -1 ? foundIndex : 0;
                                                            }
                                                          } catch (error) {
                                                            console.error('Error parsing schedulerPlan:', error);
                                                          }
                                                        }
                                                        return 0;
                                                      })()}
                                                      onChange={(e) => handlePlanChange(dayIndex, parseInt(e.target.value))}
                                                      style={{ 
                                                        fontSize: '0.7rem',
                                                        border: '1px solid #dee2e6'
                                                      }}
                                                    >
                                                      {Array.isArray(scheduleData) ? scheduleData.map((plan, planIndex) => (
                                                        <option key={planIndex} value={planIndex}>
                                                          {plan[0]}
                                                        </option>
                                                      )) : null}
                                                    </select>
                                                  </div>
                                                </th>
                                              ))}
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {Array.from({ length: 24 }, (_, hour) => (
                                              <tr key={hour}>
                                                <td className="fw-bold text-muted text-center" style={{ 
                                                  backgroundColor: hour % 2 === 0 ? '#ffffff' : '#e8e8e8',
                                                  fontSize: '0.8rem'
                                                }}>
                                                  {hour.toString().padStart(2, '0')}
                                                </td>
                                                {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day, dayIndex) => {
                                                  const availablePlans = Array.isArray(scheduleData) ? scheduleData : [];
                                                  let selectedPlanIndex;
                                                  if (selectedDayPlans[dayIndex] !== undefined) {
                                                    selectedPlanIndex = selectedDayPlans[dayIndex];
                                                  } else {
                                                    const schedulerPlanValue = nodeDetails?.attributes?.schedulerPlan;
                                                    if (schedulerPlanValue && Array.isArray(scheduleData)) {
                                                      try {
                                                        const planArray = JSON.parse(schedulerPlanValue);
                                                        if (Array.isArray(planArray) && planArray[dayIndex]) {
                                                          const planNameForDay = planArray[dayIndex];
                                                          const foundIndex = scheduleData.findIndex(plan => plan[0] === planNameForDay);
                                                          selectedPlanIndex = foundIndex !== -1 ? foundIndex : 0;
                                                        } else {
                                                          selectedPlanIndex = 0;
                                                        }
                                                      } catch (error) {
                                                        console.error('Error parsing schedulerPlan:', error);
                                                        selectedPlanIndex = 0;
                                                      }
                                                    } else {
                                                      selectedPlanIndex = 0;
                                                    }
                                                  }
                                                  const selectedPlanData = availablePlans[selectedPlanIndex];
                                                  const planSchedule = selectedPlanData?.[1] || [];
                                                  const temp = planSchedule?.[hour];
                                                  return (
                                                    <td key={dayIndex} className="text-center" style={{ 
                                                      padding: '0.5rem 0.25rem',
                                                      fontSize: '0.8rem',
                                                      backgroundColor: hour % 2 === 0 ? '#ffffff' : '#e8e8e8',
                                                      color: temp ? '#856404' : '#6c757d',
                                                      fontWeight: temp ? 'bold' : 'normal'
                                                    }}>
                                                      {temp ? `${temp}°` : '-'}
                                                    </td>
                                                  );
                                                })}
                                              </tr>
                                            ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    ) : (
                                      <div className="alert alert-info">
                                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                                        <div>
                                          <strong>Kein Wochenplan verfügbar.</strong>
                                          <br />
                                          <small>
                                            {scheduleData ? 
                                              'Keine gültigen Plan-Daten gefunden.' : 
                                              'Plan-Daten werden geladen oder sind nicht verfügbar.'
                                            }
                                          </small>
                                          {nodeDetails?.attributes?.schedulerPlan && (
                                            <div className="mt-2">
                                              <small className="text-muted">
                                                Aktueller Plan: &quot;{nodeDetails.attributes.schedulerPlan}&quot;
                                              </small>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Action Buttons */}
                            <div className="mt-4">
                              <button
                                className="btn btn-secondary me-2"
                                onClick={() => setActiveTab('overview')}
                              >
                                Abbrechen
                              </button>
                              {hasUnsavedChanges && (
                                <button
                                  className="btn btn-success"
                                  onClick={saveChanges}
                                  disabled={savingSchedule}
                                >
                                  {savingSchedule ? (
                                    <>
                                      <span className="spinner-border spinner-border-sm me-1" role="status"></span>
                                      Speichern...
                                    </>
                                  ) : (
                                    <>
                                      <FontAwesomeIcon icon={faCheckCircle} className="me-1" />
                                      Speichern
                                    </>
                                  )}
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Übersicht Tab - shown when node doesn't have devices */}
                    {activeTab === 'empty' && selectedNode && (selectedNode.hasDevices === false || (selectedNode.data?.hasDevices === false)) && (
                      <div className="tab-pane fade show active">
                        {(() => {
                          const { path, subordinates } = getAllSubordinateNodes(selectedNode?.id);
                          
                          // Get all subordinates without filtering to calculate the difference
                          const getAllSubordinatesWithoutFilter = (nodeId, nodes = treeData) => {
                            const findNode = (nodeList, targetId) => {
                              for (const node of nodeList) {
                                if (node.id === targetId) {
                                  return node;
                                }
                                if (node.children) {
                                  const found = findNode(node.children, targetId);
                                  if (found) return found;
                                }
                              }
                              return null;
                            };

                            const collectAllChildren = (node) => {
                              let allChildren = [];
                              if (node.children) {
                                for (const child of node.children) {
                                  allChildren.push(child);
                                  allChildren = allChildren.concat(collectAllChildren(child));
                                }
                              }
                              return allChildren;
                            };

                            const targetNode = findNode(nodes, nodeId);
                            if (!targetNode) return [];

                            return collectAllChildren(targetNode);
                          };
                          
                          const allSubordinates = getAllSubordinatesWithoutFilter(selectedNode?.id);
                          const subordinatesWithDevices = subordinates.length;
                          const emptySubordinates = allSubordinates.filter(node => node.hasDevices === false).length;
                          
                          return (
                            <div>
                              {/* Strukturpfad */}
                              <div className="mb-4">
                                <h6 className="text-muted mb-3">
                                  <FontAwesomeIcon icon={faMapMarkerAlt} className="me-2" />
                                  Strukturpfad
                                </h6>
                                <nav aria-label="breadcrumb">
                                  <ol className="breadcrumb">
                                    {path.map((node, index) => (
                                      <li key={node.id} className={`breadcrumb-item ${index === path.length - 1 ? 'active' : ''}`}>
                                        <FontAwesomeIcon 
                                          icon={getIconForType(node.type)} 
                                          className="me-1" 
                                          style={{ color: index === path.length - 1 ? '#6c757d' : '#007bff' }}
                                        />
                                        {node.label || node.name || node.text}
                                        {node.hasDevices && (
                                          <FontAwesomeIcon 
                                            icon={faThermometerHalf} 
                                            className="ms-1" 
                                            style={{ fontSize: '12px', color: '#28a745' }}
                                            title="Hat Geräte"
                                          />
                                        )}
                                      </li>
                                    ))}
                                  </ol>
                                </nav>
                              </div>

                              {/* Untergeordnete Nodes */}
                              <div className="mb-4">
                                <h6 className="text-muted mb-3">
                                  <FontAwesomeIcon icon={faLayerGroup} className="me-2" />
                                  Untergeordnete Bereiche ({subordinates.length})
                                </h6>
                                
                                {subordinates.length > 0 ? (
                                  <div className="row">
                                    {subordinates.map((node) => (
                                      <div key={node.id} className="col-md-6 col-lg-4 mb-3">
                                        <div className="card h-100">
                                          <div className="card-body">
                                            <div className="d-flex align-items-center mb-2">
                                              <FontAwesomeIcon 
                                                icon={getIconForType(node.type)} 
                                                className="me-2 text-primary"
                                              />
                                              <h6 className="card-title mb-0">
                                                {node.label || node.name || node.text}
                                              </h6>
                                              {node.hasDevices && (
                                                <FontAwesomeIcon 
                                                  icon={faThermometerHalf} 
                                                  className="ms-2 text-success"
                                                  title="Hat Geräte"
                                                />
                                              )}
                                            </div>
                                            
                                            {/* Breadcrumb Path */}
                                            {node.path && node.path.length > 0 && (
                                              <div className="mb-2">
                                                <nav aria-label="breadcrumb">
                                                  <ol className="breadcrumb breadcrumb-sm mb-0">
                                                    {node.path.map((pathNode, index) => (
                                                      <li key={pathNode.id} className={`breadcrumb-item ${index === node.path.length - 1 ? 'active' : ''}`}>
                                                        <FontAwesomeIcon 
                                                          icon={getIconForType(pathNode.type)} 
                                                          className="me-1" 
                                                          style={{ fontSize: '10px' }}
                                                        />
                                                        <span style={{ fontSize: '11px' }}>
                                                          {pathNode.label || pathNode.name || pathNode.text}
                                                        </span>
                                                      </li>
                                                    ))}
                                                  </ol>
                                                </nav>
                                              </div>
                                            )}
                                            
                                            <p className="card-text small text-muted mb-2">
                                              <strong>Typ:</strong> {getNodeTypeLabel(node.type)}
                                            </p>
                                            {node.data?.operationalMode !== undefined && (
                                              <p className="card-text small text-muted mb-2">
                                                <strong>Betriebsmodus:</strong> {node.data.operationalMode}
                                              </p>
                                            )}
                                            
                                            {/* Temperature and Valve Data */}
                                            {subordinateTelemetry[node.id] && (
                                              <div className="mt-3">
                                                <div className="row text-center">
                                                  {subordinateTelemetry[node.id].currentTemp !== null && (
                                                    <div className="col-3">
                                                      <div className="d-flex align-items-center justify-content-center mb-1">
                                                        <FontAwesomeIcon 
                                                          icon={faThermometerHalf} 
                                                          className="text-danger me-1" 
                                                          style={{ fontSize: '12px' }}
                                                        />
                                                        <small className="text-muted">Aktuell</small>
                                                      </div>
                                                      <div className="fw-bold text-danger" style={{ fontSize: '14px' }}>
                                                        {subordinateTelemetry[node.id].currentTemp.toFixed(1)}°C
                                                      </div>
                                                    </div>
                                                  )}
                                                  {subordinateTelemetry[node.id].targetTemp !== null && (
                                                    <div className="col-3">
                                                      <div className="d-flex align-items-center justify-content-center mb-1">
                                                        <FontAwesomeIcon 
                                                          icon={faBullseye} 
                                                          className="text-success me-1" 
                                                          style={{ fontSize: '12px' }}
                                                        />
                                                        <small className="text-muted">Ziel</small>
                                                      </div>
                                                      <div className="fw-bold text-success" style={{ fontSize: '14px' }}>
                                                        {subordinateTelemetry[node.id].targetTemp.toFixed(1)}°C
                                                      </div>
                                                    </div>
                                                  )}
                                                  {subordinateTelemetry[node.id].valvePosition !== null && (
                                                    <div className="col-3">
                                                      <div className="d-flex align-items-center justify-content-center mb-1">
                                                        <FontAwesomeIcon 
                                                          icon={faCog} 
                                                          className="text-info me-1" 
                                                          style={{ fontSize: '12px' }}
                                                        />
                                                        <small className="text-muted">Ventil</small>
                                                      </div>
                                                      <div className="fw-bold text-info" style={{ fontSize: '14px' }}>
                                                        {subordinateTelemetry[node.id].valvePosition.toFixed(0)}%
                                                      </div>
                                                    </div>
                                                  )}
                                                  {subordinateTelemetry[node.id].runStatus !== null && subordinateTelemetry[node.id].runStatus !== undefined && subordinateTelemetry[node.id].runStatus !== '' && (
                                                    <div className="col-3">
                                                      <div className="d-flex align-items-center justify-content-center mb-1">
                                                        <FontAwesomeIcon 
                                                          icon={faPlay} 
                                                          className="text-warning me-1" 
                                                          style={{ fontSize: '12px' }}
                                                        />
                                                        <small className="text-muted">Status</small>
                                                      </div>
                                                      <div className="fw-bold text-warning" style={{ fontSize: '12px' }}>
                                                        {subordinateTelemetry[node.id].runStatus}
                                                      </div>
                                                    </div>
                                                  )}
                                                </div>
                                                {loadingSubordinateTelemetry && (
                                                  <div className="text-center mt-2">
                                                    <div className="spinner-border spinner-border-sm text-primary" role="status">
                                                      <span className="visually-hidden">Laden...</span>
                                                    </div>
                                                  </div>
                                                )}
                                              </div>
                                            )}
                                            
                                            <button
                                              className="btn btn-sm btn-outline-primary mt-2"
                                              onClick={() => handleNodeSelect(node)}
                                            >
                                              <FontAwesomeIcon icon={faSearch} className="me-1" />
                                              Anzeigen
                                            </button>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <div className="text-center text-muted py-4">
                                    <FontAwesomeIcon icon={faFolder} size="2x" className="mb-3" />
                                    <p className="mb-0">Keine untergeordneten Bereiche vorhanden</p>
                                  </div>
                                )}
                              </div>

                              {/* Zusammenfassung */}
                              <div className="card">
                                <div className="card-body">
                                  <h6 className="card-title">
                                    <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                                    Zusammenfassung
                                  </h6>
                                  <div className="row">
                                    <div className="col-md-6">
                                      <div className="text-center">
                                        <FontAwesomeIcon icon={faThermometerHalf} className="text-success mb-2" size="lg" />
                                        <h5 className="mb-1">{subordinatesWithDevices}</h5>
                                        <small className="text-muted">Bereiche mit Geräten</small>
                                      </div>
                                    </div>
                                    <div className="col-md-6">
                                      <div className="text-center">
                                        <FontAwesomeIcon icon={faInfoCircle} className="text-info mb-2" size="lg" />
                                        <h5 className="mb-1">{emptySubordinates}</h5>
                                        <small className="text-muted">Leere Bereiche (ausgeblendet)</small>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })()}
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

      {/* Time Range Selection Modal */}
      {showTimeRangeModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <div className="modal-dialog modal-dialog-centered">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FontAwesomeIcon icon={faClock} className="me-2" />
                  Zeitbereich auswählen
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setShowTimeRangeModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="row g-3">
                  {timeRangeOptions.map((option) => (
                    <div key={option.value} className="col-6 col-md-4">
                      <button
                        className={`btn w-100 ${selectedTimeRange === option.value ? 'btn-primary' : 'btn-outline-primary'}`}
                        onClick={() => {
                          setSelectedTimeRange(option.value);
                          setShowTimeRangeModal(false);
                          if (selectedNode) {
                            fetchTemperatureHistory(selectedNode, option.value);
                          }
                        }}
                      >
                        {option.label}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => setShowTimeRangeModal(false)}
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      
    </DndProvider>
  );
}

