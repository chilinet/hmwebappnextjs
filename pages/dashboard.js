import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
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
  faBug
} from '@fortawesome/free-solid-svg-icons';
import { Tree } from '@minoru/react-dnd-treeview';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ReactECharts from 'echarts-for-react';
import TelemetryModal from '../components/TelemetryModal';

export default function Dashboard() {
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
  const [targetTelemetryData, setTargetTelemetryData] = useState([]);
  const [valveTelemetryData, setValveTelemetryData] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [dashboardData, setDashboardData] = useState({
    totalDevices: 0,
    activeDevices: 0,
    inactiveDevices: 0,
    alerts: 0,
    recentActivity: []
  });

  // Child nodes for Details tab
  const [childNodes, setChildNodes] = useState([]);
  const [loadingChildNodes, setLoadingChildNodes] = useState(false);

  // AbortController for cancelling requests
  const [abortController, setAbortController] = useState(null);

  // Time range selection
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d'); // Default: 7 days
  const [showTimeRangeModal, setShowTimeRangeModal] = useState(false);
  const [updatingStatus, setUpdatingStatus] = useState(false);
  const [tempSliderValue, setTempSliderValue] = useState(20.0);
  const [scheduleData, setScheduleData] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [selectedDayPlans, setSelectedDayPlans] = useState({});
  const [originalSchedulerPlan, setOriginalSchedulerPlan] = useState([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [pendingRunStatus, setPendingRunStatus] = useState(null);
  const [pendingFixValue, setPendingFixValue] = useState(null);
  const [originalRunStatus, setOriginalRunStatus] = useState(null);
  const [originalFixValue, setOriginalFixValue] = useState(null);
  const [originalChildLock, setOriginalChildLock] = useState(null);
  const [originalMinTemp, setOriginalMinTemp] = useState(null);
  const [originalMaxTemp, setOriginalMaxTemp] = useState(null);
  const [originalOverruleMinutes, setOriginalOverruleMinutes] = useState(null);
  const [editingNodeId, setEditingNodeId] = useState(null);
  const [editingNodeLabel, setEditingNodeLabel] = useState('');
  const [updatingNodeLabel, setUpdatingNodeLabel] = useState(false);
  const [currentTemperature, setCurrentTemperature] = useState(null);
  const [loadingCurrentTemp, setLoadingCurrentTemp] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [selectedDeviceForTelemetry, setSelectedDeviceForTelemetry] = useState(null);
  const [telemetryModalData, setTelemetryModalData] = useState([]);
  const [loadingTelemetryModal, setLoadingTelemetryModal] = useState(false);

  // Tab navigation
  const [activeTab, setActiveTab] = useState('verlauf'); // Default: Verlauf tab

  // Time range options
  const timeRangeOptions = [
    { value: '1h', label: '1 Stunde' },
    { value: '6h', label: '6 Stunden' },
    { value: '12h', label: '12 Stunden' },
    { value: '1d', label: '1 Tag' },
    { value: '7d', label: '7 Tage' },
    { value: '14d', label: '14 Tage' },
    { value: '30d', label: '30 Tage' },
    { value: '90d', label: '90 Tage' }
  ];

  // Helper function to convert time range to milliseconds
  const getTimeRangeInMs = (timeRange) => {
    const timeMap = {
      '1h': 60 * 60 * 1000,
      '6h': 6 * 60 * 60 * 1000,
      '12h': 12 * 60 * 60 * 1000,
      '1d': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '14d': 14 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
      '90d': 90 * 24 * 60 * 60 * 1000
    };
    return timeMap[timeRange] || timeMap['7d'];
  };

  // Helper function to get display label for time range
  const getTimeRangeLabel = (timeRange) => {
    const option = timeRangeOptions.find(opt => opt.value === timeRange);
    return option ? option.label : '7 Tage';
  };

  const updateRunStatus = (newStatus) => {
    setPendingRunStatus(newStatus);
    setHasUnsavedChanges(true);
  };

  const updateFixValue = (newValue) => {
    setPendingFixValue(newValue);
    setHasUnsavedChanges(true);
  };

  const fetchScheduleData = async (customerId) => {
    if (!customerId) return;
    
    // console.log('--------------------------------');
    // console.log('Fetching schedule data for customer:', customerId);
    // console.log('--------------------------------');  

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
      //console.log('--------------------------------');
      //console.log('Schedule data:', response);
      //console.log('--------------------------------');
      const data = await response.json();
      setScheduleData(data.plans || null);
      //console.log('--------------------------------');
      //console.log('Schedule data:', data.plans);
      //console.log('--------------------------------');
    } catch (error) {
      console.error('Error fetching schedule data:', error);
      setScheduleData(null);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handlePlanChange = (dayIndex, planIndex) => {
    // Update local state only
    setSelectedDayPlans(prev => ({
      ...prev,
      [dayIndex]: planIndex
    }));
    
    // Mark as having unsaved changes
    setHasUnsavedChanges(true);
  };

  const saveChanges = async () => {
    if (!selectedNode?.id) return;

    setSavingSchedule(true);
    try {
      const updateData = {};

      // Handle runStatus change
      if (pendingRunStatus !== null) {
        updateData.runStatus = pendingRunStatus;
      }

      // Handle fixValue change
      if (pendingFixValue !== null) {
        updateData.fixValue = pendingFixValue;
      }

      // Handle schedulerPlan changes
      if (Object.keys(selectedDayPlans).length > 0 && Array.isArray(scheduleData)) {
        let planArray = [...originalSchedulerPlan];
        
        // Ensure array has 7 elements (one for each day)
        while (planArray.length < 7) {
          planArray.push(scheduleData[0]?.[0] || ''); // Use first available plan as default
        }

        // Apply all local changes
        Object.entries(selectedDayPlans).forEach(([dayIndex, planIndex]) => {
          const newPlanName = scheduleData[planIndex]?.[0] || '';
          planArray[parseInt(dayIndex)] = newPlanName;
        });

        updateData.schedulerPlan = JSON.stringify(planArray);
      }

      // Handle other attribute changes (childLock, minTemp, maxTemp, overruleMinutes)
      if (nodeDetails?.attributes) {
        const currentAttrs = nodeDetails.attributes;
        
        // Check if any of the basic attributes changed
        if (currentAttrs.childLock !== undefined) {
          updateData.childLock = currentAttrs.childLock;
        }
        if (currentAttrs.minTemp !== undefined) {
          updateData.minTemp = currentAttrs.minTemp;
        }
        if (currentAttrs.maxTemp !== undefined) {
          updateData.maxTemp = currentAttrs.maxTemp;
        }
        if (currentAttrs.overruleMinutes !== undefined) {
          updateData.overruleMinutes = currentAttrs.overruleMinutes;
        }
      }

      // Only make API call if there are changes
      if (Object.keys(updateData).length > 0) {
        console.log('Sending update data to API:', updateData);
        const response = await fetch(`/api/config/assets/${selectedNode.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify(updateData)
        });

        if (!response.ok) {
          throw new Error('Failed to update asset attributes');
        }

        console.log('Asset attributes updated successfully');
      }
      
      // Reset all states
      setHasUnsavedChanges(false);
      setSelectedDayPlans({});
      setPendingRunStatus(null);
      setPendingFixValue(null);
      
      // Update original values
      if (pendingRunStatus !== null) setOriginalRunStatus(pendingRunStatus);
      if (pendingFixValue !== null) setOriginalFixValue(pendingFixValue);
      if (updateData.schedulerPlan) {
        setOriginalSchedulerPlan(JSON.parse(updateData.schedulerPlan));
      }
      
      // Refresh node details to show updated values
      await fetchNodeDetails(selectedNode.id);
    } catch (error) {
      console.error('Error updating asset attributes:', error);
      setError('Fehler beim Speichern der Änderungen');
    } finally {
      setSavingSchedule(false);
    }
  };

  const cancelChanges = () => {
    setSelectedDayPlans({});
    setPendingRunStatus(null);
    setPendingFixValue(null);
    setHasUnsavedChanges(false);
    
    // Reset slider value to original
    if (originalFixValue !== null) {
      setTempSliderValue(originalFixValue);
    }
    
    // Reset other attributes to original values
    if (nodeDetails?.attributes) {
      setNodeDetails(prev => ({
        ...prev,
        attributes: {
          ...prev.attributes,
          childLock: originalChildLock,
          minTemp: originalMinTemp,
          maxTemp: originalMaxTemp,
          overruleMinutes: originalOverruleMinutes
        }
      }));
    }
  };

  const startEditingLabel = (node) => {
    setEditingNodeId(node.id);
    setEditingNodeLabel(node.text);
  };

  const cancelEditingLabel = () => {
    setEditingNodeId(null);
    setEditingNodeLabel('');
  };

  const saveNodeLabel = async () => {
    if (!editingNodeId || !editingNodeLabel.trim() || updatingNodeLabel) return;

    setUpdatingNodeLabel(true);
    try {
      const response = await fetch(`/api/config/assets/${editingNodeId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          label: editingNodeLabel.trim()
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update node label');
      }

      console.log('Node label updated successfully');
      
      // Update the tree data locally
      setTreeData(prevTreeData => 
        prevTreeData.map(node => 
          node.id === editingNodeId 
            ? { ...node, text: editingNodeLabel.trim() }
            : node
        )
      );

      // Reset editing state
      setEditingNodeId(null);
      setEditingNodeLabel('');

      // Refresh tree data from server
      await fetchTreeData();
    } catch (error) {
      console.error('Error updating node label:', error);
      setError('Fehler beim Aktualisieren des Labels');
    } finally {
      setUpdatingNodeLabel(false);
    }
  };

  const fetchCurrentTemperature = async (nodeId) => {
    if (!nodeId) return;
    
    setLoadingCurrentTemp(true);
    try {
      // Get all devices under this node
      const devicesResponse = await fetch(`/api/thingsboard/devices/by-node/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!devicesResponse.ok) {
        throw new Error('Failed to fetch devices for current temperature');
      }

      const devicesData = await devicesResponse.json();
      
      if (!devicesData.data || devicesData.data.length === 0) {
        setCurrentTemperature(null);
        return;
      }

      const deviceIds = devicesData.data.map(device => device.id?.id || device.id).join(',');
      
      // Get current temperature values (last 5 minutes)
      const endTime = Date.now();
      const startTime = endTime - (5 * 60 * 1000); // 5 minutes ago
      
      const tempResponse = await fetch(
        `/api/thingsboard/devices/telemetry/aggregated?deviceIds=${deviceIds}&startTs=${startTime}&endTs=${endTime}&interval=300000&attribute=sensorTemperature`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        }
      );

      if (!tempResponse.ok) {
        throw new Error('Failed to fetch current temperature data');
      }

      const tempResult = await tempResponse.json();
      
      if (tempResult.data && tempResult.data.length > 0) {
        // Calculate average of latest temperature readings
        let totalTemp = 0;
        let deviceCount = 0;
        
        tempResult.data.forEach(deviceData => {
          if (deviceData.data && deviceData.data.length > 0) {
            // Get the latest temperature reading for this device
            const latestReading = deviceData.data[deviceData.data.length - 1];
            if (latestReading && latestReading.value !== null && latestReading.value !== undefined) {
              totalTemp += parseFloat(latestReading.value);
              deviceCount++;
            }
          }
        });
        
        if (deviceCount > 0) {
          const avgTemp = totalTemp / deviceCount;
          setCurrentTemperature({
            average: avgTemp,
            deviceCount: deviceCount
          });
        } else {
          setCurrentTemperature(null);
        }
      } else {
        setCurrentTemperature(null);
      }
    } catch (error) {
      console.error('Error fetching current temperature:', error);
      setCurrentTemperature(null);
    } finally {
      setLoadingCurrentTemp(false);
    }
  };

  // Handle ESC key to close modal
  useEffect(() => {
    const handleEscKey = (event) => {
      if (event.key === 'Escape' && showTimeRangeModal) {
        setShowTimeRangeModal(false);
      }
    };

    if (showTimeRangeModal) {
      document.addEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'hidden'; // Prevent body scroll
    }

    return () => {
      document.removeEventListener('keydown', handleEscKey);
      document.body.style.overflow = 'unset'; // Restore body scroll
    };
  }, [showTimeRangeModal]);

  useEffect(() => {
    if (session?.token) {
      fetchUserData();
    }
  }, [session]);

  useEffect(() => {
    // Debug session changes
    console.log('Session changed:', {
      status,
      hasSession: !!session,
      hasToken: !!session?.token,
      hasTbToken: !!session?.tbToken,
      sessionKeys: session ? Object.keys(session) : [],
      sessionData: session ? {
        id: session.id,
        user: session.user,
        expires: session.expires
      } : null,
      fullSession: session
    });
    
    // If we get a tbToken and have a selected node, try to fetch alarms
    if (session?.tbToken && selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      console.log('tbToken became available, attempting to fetch alarms');
      fetchAlarms(selectedNode.id, abortController);
    }
  }, [session, status]);

  useEffect(() => {
    if (customerData?.customerid) {
      fetchTreeData();
      fetchDashboardData();
    }
  }, [customerData]);

  useEffect(() => {
    // Initial height
    setWindowHeight(window.innerHeight);

    // Update height on window resize
    const handleResize = () => {
      setWindowHeight(window.innerHeight);
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      setLoadingDevices(true);
      fetchDevices(selectedNode.id)
        .then(data => setDevices(data.assigned || []))
        .finally(() => setLoadingDevices(false));
    } else {
      setDevices([]);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      // Use the current AbortController for this selection
      fetchTelemetryData(selectedNode.id, abortController);
      fetchTargetTelemetryData(selectedNode.id, abortController);
      fetchValveTelemetryData(selectedNode.id, abortController);
    } else {
      setTelemetryData([]);
      setTargetTelemetryData([]);
      setValveTelemetryData([]);
    }
  }, [selectedNode, abortController, selectedTimeRange]);

  useEffect(() => {
    // If tbToken becomes available and we have a selected node, fetch alarms
    if (session?.tbToken && selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      console.log('tbToken available, fetching alarms for selected node');
      // Clear any previous retry attempts for this node
      if (window.alarmRetryAttempts) {
        const retryKey = `${selectedNode.id}_${session.tbToken}`;
        window.alarmRetryAttempts.delete(retryKey);
      }
      fetchAlarms(selectedNode.id, abortController);
    }
  }, [session?.tbToken, selectedNode?.id, abortController]);

  // Retry fetching alarms if tbToken becomes available later
  // Only retry once to prevent infinite loops
  useEffect(() => {
    if (session?.tbToken && selectedNode?.id && !selectedNode.id.startsWith('temp_') && alarms.length === 0 && !loadingAlarms) {
      console.log('Retrying alarms fetch now that tbToken is available');
      // Add a flag to prevent multiple retries
      const retryKey = `${selectedNode.id}_${session.tbToken}`;
      if (!window.alarmRetryAttempts) {
        window.alarmRetryAttempts = new Set();
      }
      
      if (!window.alarmRetryAttempts.has(retryKey)) {
        window.alarmRetryAttempts.add(retryKey);
        fetchAlarms(selectedNode.id, abortController);
      } else {
        console.log('Alarms already retried for this node/token combination, skipping');
      }
    }
  }, [session?.tbToken, selectedNode?.id, abortController, loadingAlarms]);

  // Function to refresh session
  const refreshSession = async () => {
    try {
      console.log('Attempting to refresh session...');
      const response = await fetch('/api/auth/refresh-tb-token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('Token refreshed successfully:', data);
        
        // Update the local session state with the new token
        // This is a temporary fix - ideally the session should be refreshed by NextAuth
        if (data.token) {
          // Force a re-render and try to fetch alarms again
          setLoading(prev => !prev);
          
          // Wait a bit for the state to update, then try to fetch alarms
          setTimeout(() => {
            if (selectedNode?.id) {
              console.log('Attempting to fetch alarms with new token');
              fetchAlarms(selectedNode.id, abortController);
            }
          }, 1000);
        }
      } else {
        console.error('Failed to refresh session:', response.status);
      }
    } catch (error) {
      console.error('Error refreshing session:', error);
    }
  };

  // Function to test ThingsBoard connection
  const testThingsBoardConnection = async () => {
    try {
      console.log('Testing ThingsBoard connection...');
      const response = await fetch('/api/thingsboard/test-connection', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('ThingsBoard connection test result:', data);
        alert(`ThingsBoard connection test successful!\n\nConnection: ${data.connection.url}\nUser: ${data.connection.user?.firstName || 'Unknown'}\nDevices API: ${data.tests.devices.success ? 'OK' : 'Failed'}\nAlarms API: ${data.tests.alarms.success ? 'OK' : 'Failed'}`);
      } else {
        const errorData = await response.json();
        console.error('ThingsBoard connection test failed:', errorData);
        alert(`ThingsBoard connection test failed:\n${errorData.error}\n\nDetails: ${errorData.details || 'No details available'}`);
      }
    } catch (error) {
      console.error('Error testing ThingsBoard connection:', error);
      alert(`Error testing ThingsBoard connection: ${error.message}`);
    }
  };

  // Function to test ThingsBoard alarms specifically
  const testThingsBoardAlarms = async () => {
    try {
      console.log('Testing ThingsBoard alarms...');
      const response = await fetch('/api/thingsboard/test-alarms', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });
      
      if (response.ok) {
        const data = await response.json();
        console.log('ThingsBoard alarms test result:', data);
        
        // Create a detailed report
        let report = 'ThingsBoard Alarms Test Results:\n\n';
        report += `Connection: ${data.connection.url}\n\n`;
        
        report += 'Endpoint Tests:\n';
        Object.entries(data.endpoints).forEach(([name, info]) => {
          report += `- ${name}: ${info.exists ? `✅ ${info.status} (${info.statusText})` : `❌ ${info.error}`}\n`;
        });
        
        if (data.realDeviceTest) {
          report += '\nReal Device Test:\n';
          if (data.realDeviceTest.error) {
            report += `- Error: ${data.realDeviceTest.error}\n`;
          } else {
            report += `- Device ID: ${data.realDeviceTest.deviceId}\n`;
            report += `- Status: ${data.realDeviceTest.status}\n`;
            report += `- Has Alarms: ${data.realDeviceTest.hasAlarms ? 'Yes' : 'No'}\n`;
            if (data.realDeviceTest.alarmCount !== undefined) {
              report += `- Alarm Count: ${data.realDeviceTest.alarmCount}\n`;
            }
          }
        }
        
        alert(report);
      } else {
        const errorData = await response.json();
        console.error('ThingsBoard alarms test failed:', errorData);
        alert(`ThingsBoard alarms test failed:\n${errorData.error}\n\nDetails: ${errorData.details || 'No details available'}`);
      }
    } catch (error) {
      console.error('Error testing ThingsBoard alarms:', error);
      alert(`Error testing ThingsBoard alarms: ${error.message}`);
    }
  };

  // Function to debug alarm data
  const debugAlarmData = async () => {
    if (!selectedNode?.id || !session?.tbToken) {
      alert('Bitte wählen Sie einen Node aus und stellen Sie sicher, dass ein ThingsBoard Token verfügbar ist.');
      return;
    }

    try {
      console.log('Debugging alarm data...');
      
      // First get devices for this node
      const devicesResponse = await fetch(`/api/thingsboard/devices/by-node/${selectedNode.id}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (devicesResponse.ok) {
        const devicesData = await devicesResponse.json();
        console.log('Devices data:', devicesData);
        
        if (devicesData.data && devicesData.data.length > 0) {
          const deviceIds = devicesData.data.map(device => device.id?.id || device.id).join(',');
          console.log('Device IDs for alarms:', deviceIds);
          
          // Now fetch alarms
          const alarmsResponse = await fetch(`/api/thingsboard/devices/alarms?deviceIds=${deviceIds}`, {
            headers: {
              'Authorization': `Bearer ${session.token}`
            }
          });

          if (alarmsResponse.ok) {
            const alarmsData = await alarmsResponse.json();
            console.log('Raw alarms data:', alarmsData);
            
            let debugReport = 'Alarm Debug Report:\n\n';
            debugReport += `Node: ${selectedNode.text}\n`;
            debugReport += `Devices found: ${devicesData.data.length}\n`;
            debugReport += `Alarms found: ${alarmsData.length}\n\n`;
            
            if (alarmsData.length > 0) {
              debugReport += 'Sample Alarm Data:\n';
              const sampleAlarm = alarmsData[0];
              Object.entries(sampleAlarm).forEach(([key, value]) => {
                debugReport += `${key}: ${typeof value} = ${JSON.stringify(value)}\n`;
              });
            }
            
            alert(debugReport);
          } else {
            alert(`Failed to fetch alarms: ${alarmsResponse.status}`);
          }
        } else {
          alert('No devices found for this node.');
        }
      } else {
        alert(`Failed to fetch devices: ${devicesResponse.status}`);
      }
    } catch (error) {
      console.error('Error debugging alarm data:', error);
      alert(`Error debugging alarm data: ${error.message}`);
    }
  };

  // Function to safely render alarm data
  const safeAlarmValue = (value, fallback = 'Unbekannt') => {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') return value;
    if (typeof value === 'number') return value.toString();
    if (typeof value === 'object') {
      // If it's an object, try to extract a meaningful value
      return value.id || value.name || value.message || fallback;
    }
    return fallback;
  };

  const safeDeviceId = (deviceId) => {
    if (deviceId === null || deviceId === undefined) {
      return 'Unbekannt';
    }
    if (typeof deviceId === 'string' || typeof deviceId === 'number') {
      return deviceId;
    }
    if (typeof deviceId === 'object') {
      // If it's an object with an id property, extract it
      if (deviceId.id !== undefined) {
        return deviceId.id;
      }
      // If it's an object with entityType and id, extract the id
      if (deviceId.entityType && deviceId.id !== undefined) {
        return deviceId.id;
      }
      // Otherwise, try to stringify it
      try {
        return JSON.stringify(deviceId);
      } catch {
        return 'Unbekannt';
      }
    }
    return 'Unbekannt';
  };

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
      setCustomerData(data);
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Fehler beim Laden der Benutzerdaten');
    }
  };

  const convertToTreeViewFormat = (nodes, parentId = 0) => {
    return nodes.flatMap(node => {
      const hasChildren = node.children && node.children.length > 0;
      
      const treeNode = {
        id: node.id,
        parent: parentId,
        droppable: true,
        text: node.label || node.name,
        data: {
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

  const fetchTreeData = async () => {
    try {
      const response = await fetch(`/api/config/customers/${customerData.customerid}/tree`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tree data');
      }

      const data = await response.json();
      const formattedData = convertToTreeViewFormat(data);
      setTreeData(formattedData);
    } catch (error) {
      console.error('Error fetching tree data:', error);
      setError('Fehler beim Laden der Strukturdaten');
    } finally {
      setLoading(false);
    }
  };

  const fetchDashboardData = async () => {
    try {
      const response = await fetch(`/api/dashboard/stats?customerId=${customerData.customerid}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setDashboardData(data);
      }
    } catch (error) {
      console.error('Error fetching dashboard data:', error);
    }
  };

  const getInitialOpenNodes = (nodes, level = 0) => {
    if (level >= 2) return [];
    
    return nodes.reduce((acc, node) => {
      if (node.droppable) {
        return [
          ...acc,
          node.id,
          ...getInitialOpenNodes(node.children || [], level + 1)
        ];
      }
      return acc;
    }, []);
  };

  useEffect(() => {
    if (treeData.length > 0) {
      const initialOpenNodes = getInitialOpenNodes(treeData);
      setOpenNodes(initialOpenNodes);
    }
  }, [treeData]);

  const fetchNodeDetails = async (nodeId) => {
    if (!nodeId) return;
    
    setLoadingDetails(true);
    try {
      const response = await fetch(`/api/config/assets/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch node details');
      }

      const data = await response.json();
      setNodeDetails(data);
      
      // Set slider value from fixValue attribute and save original values
      if (data.attributes?.fixValue) {
        const minTemp = data.attributes?.minTemp || 15;
        const maxTemp = data.attributes?.maxTemp || 30;
        const fixValue = parseFloat(data.attributes.fixValue);
        
        // Ensure fixValue is within the valid range
        const clampedValue = Math.min(Math.max(fixValue, minTemp), maxTemp);
        setTempSliderValue(clampedValue);
        setOriginalFixValue(clampedValue);
      } else {
        // Set default value to middle of range if no fixValue exists
        const minTemp = data.attributes?.minTemp || 15;
        const maxTemp = data.attributes?.maxTemp || 30;
        const defaultValue = (minTemp + maxTemp) / 2;
        setTempSliderValue(defaultValue);
        setOriginalFixValue(defaultValue);
      }

      // Save original values and reset pending changes
      setOriginalRunStatus(data.attributes?.runStatus || null);
      setOriginalFixValue(data.attributes?.fixValue || null);
      setOriginalChildLock(data.attributes?.childLock || null);
      setOriginalMinTemp(data.attributes?.minTemp || null);
      setOriginalMaxTemp(data.attributes?.maxTemp || null);
      setOriginalOverruleMinutes(data.attributes?.overruleMinutes || null);
      setPendingRunStatus(null);
      setPendingFixValue(null);
      setSelectedDayPlans({});
      setHasUnsavedChanges(false);
      
      // Fetch current temperature data
      fetchCurrentTemperature(nodeId);

      // Load schedule data if runStatus is 'schedule'
      if (data.attributes?.runStatus === 'schedule' && customerData?.customerid) {
        fetchScheduleData(customerData.customerid);
        
        // Save original scheduler plan
        const schedulerPlanValue = data.attributes?.schedulerPlan;
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
      } else {
        setScheduleData(null);
        setOriginalSchedulerPlan([]);
      }
    } catch (error) {
      console.error('Error fetching node details:', error);
      setError('Fehler beim Laden der Node-Details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchChildNodes = async (nodeId) => {
    if (!nodeId) return;
    
    setLoadingChildNodes(true);
    try {
      const response = await fetch(`/api/config/customers/${customerData.customerid}/tree`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch tree data');
      }

      const treeData = await response.json();
      
      // Find the selected node and get its children
      const findNodeAndChildren = (nodes, targetId) => {
        for (const node of nodes) {
          if (node.id === targetId) {
            return node.children || [];
          }
          if (node.children) {
            const found = findNodeAndChildren(node.children, targetId);
            if (found.length > 0) return found;
          }
        }
        return [];
      };

      const children = findNodeAndChildren(treeData, nodeId);
      setChildNodes(children);
    } catch (error) {
      console.error('Error fetching child nodes:', error);
      setChildNodes([]);
    } finally {
      setLoadingChildNodes(false);
    }
  };

  const handleNodeSelect = (node) => {
    // Cancel any ongoing requests
    if (abortController) {
      abortController.abort();
    }

    // Create new AbortController for this selection
    const newAbortController = new AbortController();
    setAbortController(newAbortController);

    setSelectedNode(node);
    setError(null); // Clear any previous errors
    
    // Reset alarms state immediately to prevent stale data
    setAlarms([]);
    setLoadingAlarms(false);
    
    fetchNodeDetails(node.id, newAbortController);
    fetchChildNodes(node.id);
    fetchDevices(node.id); // Load devices for the selected node
    
    // Debug session object
    console.log('Session in handleNodeSelect:', {
      hasSession: !!session,
      hasToken: !!session?.token,
      hasTbToken: !!session?.tbToken,
      sessionKeys: session ? Object.keys(session) : []
    });
    
    // Only fetch alarms if we have a ThingsBoard token
    if (session?.tbToken) {
      fetchAlarms(node.id, newAbortController);
    } else {
      console.log('Skipping alarms fetch - no ThingsBoard token available');
      setAlarms([]);
      setLoadingAlarms(false);
    }
  };

  const fetchDevices = async (nodeId) => {
    setLoadingDevices(true);
    try {
      // First get devices from our config API
      const configResponse = await fetch(`/api/config/assets/${nodeId}/devices`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!configResponse.ok) {
        throw new Error('Failed to fetch devices from config API');
      }

      const configData = await configResponse.json();
      const configDevices = configData.assigned || [];

      // Then get additional device info from ThingsBoard if we have a token
      if (session?.tbToken) {
        try {
          const tbResponse = await fetch(`/api/thingsboard/devices/by-node/${nodeId}`, {
            headers: {
              'Authorization': `Bearer ${session.token}`
            }
          });

          if (tbResponse.ok) {
            const tbData = await tbResponse.json();
            const tbDevices = tbData.data || [];

            // Merge config devices with ThingsBoard data
            const enhancedDevices = configDevices.map(configDevice => {
              const tbDevice = tbDevices.find(tb => 
                tb.id?.id === configDevice.id || tb.id === configDevice.id
              );

              if (tbDevice) {
                // Determine if device is active based on last activity or ThingsBoard status
                let isActive = false;
                
                // Check if we have last activity timestamp
                if (tbDevice.lastActivity || tbDevice.lastActivityTs) {
                  const lastActivity = tbDevice.lastActivity || tbDevice.lastActivityTs;
                  const lastActivityTime = new Date(lastActivity).getTime();
                  const now = Date.now();
                  const timeDiff = now - lastActivityTime;
                  
                  // Consider device active if last activity was within last 24 hours
                  isActive = timeDiff < (24 * 60 * 60 * 1000);
                } else if (tbDevice.active !== undefined) {
                  // Use ThingsBoard active status if available
                  isActive = tbDevice.active;
                } else {
                  // Default to true if we can't determine status
                  isActive = true;
                }

                return {
                  ...configDevice,
                  name: tbDevice.name || configDevice.name || 'Unbekannt',
                  label: tbDevice.label || configDevice.label || 'Kein Label',
                  type: tbDevice.type || configDevice.type || 'Unbekannt',
                  active: isActive,
                  lastActivity: tbDevice.lastActivity || tbDevice.lastActivityTs || null,
                  additionalInfo: tbDevice.additionalInfo || {}
                };
              } else {
                return {
                  ...configDevice,
                  name: configDevice.name || 'Unbekannt',
                  label: configDevice.label || 'Kein Label',
                  type: configDevice.type || configDevice.type || 'Unbekannt',
                  active: configDevice.active || true, // Default to true for config devices
                  lastActivity: null,
                  additionalInfo: {}
                };
              }
            });

                  // Now fetch telemetry data for all devices
      console.log('Enhanced devices before telemetry:', enhancedDevices);
      
      // Log device status information for debugging
      enhancedDevices.forEach(device => {
        console.log(`Device ${device.id} status:`, {
          name: device.name,
          active: device.active,
          lastActivity: device.lastActivity,
          hasTelemetry: !!device.telemetry
        });
      });
      
      const devicesWithTelemetry = await fetchTelemetryForDevices(enhancedDevices);
      console.log('Devices with telemetry:', devicesWithTelemetry);
      setDevices(devicesWithTelemetry);
      return { assigned: devicesWithTelemetry };
          }
        } catch (tbError) {
          console.warn('Failed to fetch ThingsBoard device data:', tbError);
          // Continue with config devices only
        }
      }

      // Set config devices if ThingsBoard is not available
      setDevices(configDevices);
      return { assigned: configDevices };
    } catch (error) {
      console.error('Error fetching devices:', error);
      setDevices([]);
      return { assigned: [] };
    } finally {
      setLoadingDevices(false);
    }
  };

  const fetchTelemetryForDevices = async (devices) => {
    if (!session?.tbToken || !devices.length) {
      return devices;
    }

    try {
      // Get all device IDs
      const deviceIds = devices.map(device => safeDeviceId(device.id)).filter(id => id && id !== 'Unbekannt');
      
      if (deviceIds.length === 0) {
        return devices;
      }

      console.log('Fetching telemetry for device IDs:', deviceIds);

      // Fetch telemetry data for each device individually using the direct ThingsBoard endpoint
      const devicesWithTelemetry = await Promise.all(
        devices.map(async (device) => {
          try {
            const deviceId = safeDeviceId(device.id);
            if (!deviceId || deviceId === 'Unbekannt') {
              return device;
            }

            // First get the latest values without time range to determine last update
            const latestTelemetryResponse = await fetch(
              `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=fCnt,sensorTemperature,targetTemperature,batteryVoltage,PercentValveOpen,rssi,snr,sf,signalQuality`,
              {
                headers: {
                  'Authorization': `Bearer ${session.token}`
                }
              }
            );

            // Then get the full 24-hour data for the modal
            const endTime = Date.now();
            const startTime = endTime - (24 * 60 * 60 * 1000); // 24 hours ago
            
            const telemetryResponse = await fetch(
              `/api/thingsboard/devices/telemetry?deviceId=${deviceId}&keys=fCnt,sensorTemperature,targetTemperature,batteryVoltage,PercentValveOpen,rssi,snr,sf,signalQuality&startTs=${startTime}&endTs=${endTime}`,
              {
                headers: {
                  'Authorization': `Bearer ${session.token}`
                }
              }
            );

            if (telemetryResponse.ok && latestTelemetryResponse.ok) {
              const telemetryData = await telemetryResponse.json();
              const latestTelemetryData = await latestTelemetryResponse.json();
              
              console.log(`Device ${deviceId} raw telemetry (24h):`, telemetryData);
              console.log(`Device ${deviceId} latest telemetry:`, latestTelemetryData);
              
              // Log the number of data points for each attribute
              Object.keys(telemetryData).forEach(key => {
                if (telemetryData[key] && Array.isArray(telemetryData[key])) {
                  console.log(`Attribute ${key} (24h): ${telemetryData[key].length} data points`);
                }
              });

              // Extract the latest values for each attribute from the latest data
              const telemetry = {};
              
              // Helper function to get latest value for an attribute
              const getLatestValue = (attributeName) => {
                const attributeData = latestTelemetryData[attributeName];
                if (attributeData && Array.isArray(attributeData) && attributeData.length > 0) {
                  // Get the latest reading (last in array)
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

              // Find the latest timestamp from the latest telemetry data (not the 24h data)
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

              // Add the latest timestamp to telemetry data
              telemetry.lastUpdate = latestTimestamp;

              // Store raw telemetry data for modal display
              telemetry.rawData = telemetryData;

              // Update device active status based on telemetry data
              // If we have recent telemetry data, the device is definitely active
              let updatedActive = device.active;
              if (Object.values(telemetry).some(value => value !== null && value !== undefined)) {
                updatedActive = true;
                console.log(`Device ${deviceId} marked as active due to telemetry data`);
              }

              console.log(`Device ${deviceId} processed telemetry:`, telemetry);
              return {
                ...device,
                telemetry,
                active: updatedActive
              };
            } else {
              if (!latestTelemetryResponse.ok) {
                console.warn(`Failed to fetch latest telemetry for device ${deviceId}:`, latestTelemetryResponse.status);
              }
              if (!telemetryResponse.ok) {
                console.warn(`Failed to fetch 24h telemetry for device ${deviceId}:`, telemetryResponse.status);
              }
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
  };

  // Function to fetch raw telemetry data for the last 24 hours
  const fetchRawTelemetryForModal = async (device) => {
    if (!device || !device.telemetry?.rawData) {
      console.warn('No raw telemetry data available for device:', device);
      return [];
    }

    const rawData = device.telemetry.rawData;
    console.log('Raw telemetry data for modal:', rawData);
    
    const now = Date.now();
    const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
    
    // Collect all telemetry entries from the last 24 hours
    const allEntries = [];
    
    Object.keys(rawData).forEach(attributeName => {
      const attributeData = rawData[attributeName];
      console.log(`Processing attribute ${attributeName}:`, attributeData);
      
      if (attributeData && Array.isArray(attributeData)) {
        console.log(`Attribute ${attributeName} has ${attributeData.length} entries`);
        
        attributeData.forEach((entry, index) => {
          console.log(`Entry ${index}:`, entry);
          
          if (entry && entry.ts) {
            const timestamp = Number(entry.ts);
            if (!isNaN(timestamp) && timestamp >= twentyFourHoursAgo) {
              allEntries.push({
                timestamp: timestamp,
                attribute: attributeName,
                value: entry.value,
                formattedTime: new Date(timestamp).toLocaleString('de-DE')
              });
            }
          }
        });
      }
    });

    console.log(`Total entries collected: ${allEntries.length}`);
    console.log('Sample entries:', allEntries.slice(0, 5));

    // Sort by timestamp (newest first)
    allEntries.sort((a, b) => b.timestamp - a.timestamp);
    
    return allEntries;
  };

  // Function to open telemetry modal
  const openTelemetryModal = async (device) => {
    console.log('Opening telemetry modal for device:', device);
    console.log('Device telemetry data:', device.telemetry);
    
    setSelectedDeviceForTelemetry(device);
    setShowTelemetryModal(true);
  };

  const fetchTelemetryData = async (nodeId, controller = null) => {
    setLoadingTelemetry(true);
    //console.log('--------------------------------');
    //console.log('Fetching telemetry data for node:', nodeId);
    //console.log('--------------------------------');

    try {
      // First get all devices under this node (including sub-nodes)
      const devicesResponse = await fetch(`/api/thingsboard/devices/by-node/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        },
        signal: controller?.signal
      });

      if (!devicesResponse.ok) {
        const errorText = await devicesResponse.text();
        console.error('Devices API error:', devicesResponse.status, errorText);
        throw new Error(`Failed to fetch devices for telemetry: ${devicesResponse.status}`);
      }

      const devicesData = await devicesResponse.json();
      //console.log('Devices found:', devicesData.data?.length || 0);
      //console.log('Asset name:', devicesData.assetName);
      
      if (!devicesData.data || devicesData.data.length === 0) {
        console.log('No devices found for telemetry');
        setTelemetryData([]);
        return;
      }

      const deviceIds = devicesData.data.map(device => device.id?.id || device.id).join(',');
      //console.log('Device IDs for telemetry:', deviceIds);

      // Calculate time range based on selected time range
      const endTime = Date.now();
      const startTime = endTime - getTimeRangeInMs(selectedTimeRange);
      
      /*console.log('Time range:', {
        start: new Date(startTime).toISOString(),
        end: new Date(endTime).toISOString(),
        duration: getTimeRangeLabel(selectedTimeRange)
      });*/

      // Fetch telemetry data (3600000 ms = 1 hour)
      const telemetryResponse = await fetch(
        `/api/thingsboard/devices/telemetry/aggregated?deviceIds=${deviceIds}&startTs=${startTime}&endTs=${endTime}&interval=3600000&attribute=sensorTemperature`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`
          },
          signal: controller?.signal
        }
      );

      if (!telemetryResponse.ok) {
        const errorText = await telemetryResponse.text();
        console.error('Telemetry API error:', telemetryResponse.status, errorText);
        throw new Error(`Failed to fetch telemetry data: ${telemetryResponse.status}`);
      }

      const telemetryResult = await telemetryResponse.json();
      //console.log('Telemetry data received:', telemetryResult.data?.length || 0, 'devices');
      setTelemetryData(telemetryResult.data || []);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Telemetry request was cancelled');
        return;
      }
      console.error('Error fetching telemetry data:', error);
      setTelemetryData([]);
    } finally {
      setLoadingTelemetry(false);
    }
  };

  const fetchTargetTelemetryData = async (nodeId, controller = null) => {
    try {
      // First get all devices under this node (including sub-nodes)
      const devicesResponse = await fetch(`/api/thingsboard/devices/by-node/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        },
        signal: controller?.signal
      });

      if (!devicesResponse.ok) {
        const errorText = await devicesResponse.text();
        console.error('Devices API error for target telemetry:', devicesResponse.status, errorText);
        throw new Error(`Failed to fetch devices for target telemetry: ${devicesResponse.status}`);
      }

      const devicesData = await devicesResponse.json();
      //console.log('Devices found for target telemetry:', devicesData.data?.length || 0);
      
      if (!devicesData.data || devicesData.data.length === 0) {
        console.log('No devices found for target telemetry');
        setTargetTelemetryData([]);
        return;
      }

      const deviceIds = devicesData.data.map(device => device.id?.id || device.id).join(',');
      //console.log('Device IDs for target telemetry:', deviceIds);

      // Calculate time range based on selected time range
      const endTime = Date.now();
      const startTime = endTime - getTimeRangeInMs(selectedTimeRange);

      // Fetch target telemetry data (3600000 ms = 1 hour)
      const telemetryResponse = await fetch(
        `/api/thingsboard/devices/telemetry/aggregated?deviceIds=${deviceIds}&startTs=${startTime}&endTs=${endTime}&interval=3600000&attribute=targetTemperature`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`
          },
          signal: controller?.signal
        }
      );

      if (!telemetryResponse.ok) {
        const errorText = await telemetryResponse.text();
        console.error('Target telemetry API error:', telemetryResponse.status, errorText);
        throw new Error(`Failed to fetch target telemetry data: ${telemetryResponse.status}`);
      }

      const telemetryResult = await telemetryResponse.json();
      //console.log('Target telemetry data received:', telemetryResult.data?.length || 0, 'devices');
      setTargetTelemetryData(telemetryResult.data || []);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Target telemetry request was cancelled');
        return;
      }
      console.error('Error fetching target telemetry data:', error);
      setTargetTelemetryData([]);
    }
  };

  const fetchValveTelemetryData = async (nodeId, controller = null) => {
    try {
      // First get all devices under this node (including sub-nodes)
      const devicesResponse = await fetch(`/api/thingsboard/devices/by-node/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        },
        signal: controller?.signal
      });

      if (!devicesResponse.ok) {
        const errorText = await devicesResponse.text();
        console.error('Devices API error for valve telemetry:', devicesResponse.status, errorText);
        throw new Error(`Failed to fetch devices for valve telemetry: ${devicesResponse.status}`);
      }

      const devicesData = await devicesResponse.json();
      //console.log('Devices found for valve telemetry:', devicesData.data?.length || 0);
      
      if (!devicesData.data || devicesData.data.length === 0) {
        console.log('No devices found for valve telemetry');
        setValveTelemetryData([]);
        return;
      }

      const deviceIds = devicesData.data.map(device => device.id?.id || device.id).join(',');
      //console.log('Device IDs for valve telemetry:', deviceIds);

      // Calculate time range based on selected time range
      const endTime = Date.now();
      const startTime = endTime - getTimeRangeInMs(selectedTimeRange);

      // Fetch valve telemetry data (3600000 ms = 1 hour)
      const telemetryResponse = await fetch(
        `/api/thingsboard/devices/telemetry/aggregated?deviceIds=${deviceIds}&startTs=${startTime}&endTs=${endTime}&interval=3600000&attribute=PercentValveOpen`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`
          },
          signal: controller?.signal
        }
      );

      if (!telemetryResponse.ok) {
        const errorText = await telemetryResponse.text();
        console.error('Valve telemetry API error:', telemetryResponse.status, errorText);
        throw new Error(`Failed to fetch valve telemetry data: ${telemetryResponse.status}`);
      }

      const telemetryResult = await telemetryResponse.json();
      //console.log('Valve telemetry data received:', telemetryResult.data?.length || 0, 'devices');
      setValveTelemetryData(telemetryResult.data || []);
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Valve telemetry request was cancelled');
        return;
      }
      console.error('Error fetching valve telemetry data:', error);
      setValveTelemetryData([]);
    }
  };

  const fetchAlarms = async (nodeId, controller = null) => {
    if (!nodeId) return;
    
    if (!session?.tbToken) {
      console.log('No ThingsBoard token available for alarms');
      setAlarms([]);
      setLoadingAlarms(false);
      return;
    }
    
    setLoadingAlarms(true);
    
    // Safety timeout to prevent infinite loading state
    const loadingTimeout = setTimeout(() => {
      console.warn('Alarms loading timeout reached, resetting loading state');
      setLoadingAlarms(false);
    }, 30000); // 30 seconds timeout
    try {
      // First get all devices under this node
      const devicesResponse = await fetch(`/api/thingsboard/devices/by-node/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        },
        signal: controller?.signal
      });

      if (!devicesResponse.ok) {
        throw new Error(`Failed to fetch devices: ${devicesResponse.status}`);
      }

      const devicesData = await devicesResponse.json();
      
      if (!devicesData.data || devicesData.data.length === 0) {
        console.log('No devices found for alarms');
        setAlarms([]);
        setLoadingAlarms(false);
        return;
      }
      
      const deviceIds = devicesData.data.map(device => device.id?.id || device.id).join(',');

      // Get alarms for all devices
      const alarmsResponse = await fetch(`/api/thingsboard/devices/alarms?deviceIds=${deviceIds}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        },
        signal: controller?.signal
      });

      if (!alarmsResponse.ok) {
        throw new Error(`Failed to fetch alarms: ${alarmsResponse.status}`);
      }

      const alarmsData = await alarmsResponse.json();
      setAlarms(alarmsData || []);
      setError(null); // Clear any previous errors
    } catch (error) {
      if (error.name === 'AbortError') {
        console.log('Alarms request was cancelled');
        return;
      }
      console.error('Error fetching alarms:', error);
      setAlarms([]);
      setError(`Fehler beim Laden der Alarme: ${error.message}`);
    } finally {
      clearTimeout(loadingTimeout);
      setLoadingAlarms(false);
    }
  };

  const CustomNode = ({ node, onToggle, dragHandle, isOpen }) => {
    const getIcon = (type) => {
      switch (type?.toLowerCase()) {
        case 'building':
        case 'gebäude':
          return <FontAwesomeIcon icon={faBuilding} className="text-primary" />;
        case 'floor':
        case 'stockwerk':
        case 'etage':
          return <FontAwesomeIcon icon={faLayerGroup} className="text-info" />;
        case 'area':
        case 'bereich':
        case 'zone':
          return <FontAwesomeIcon icon={faHome} className="text-warning" />;
        case 'room':
        case 'raum':
        case 'zimmer':
          return <FontAwesomeIcon icon={faDoorOpen} className="text-success" />;
        case 'device':
        case 'gerät':
        case 'sensor':
          return <FontAwesomeIcon icon={faMicrochip} className="text-danger" />;
        default:
          return <FontAwesomeIcon icon={faBuilding} className="text-secondary" />;
      }
    };

    const isSelected = selectedNode?.id === node.id;
    const isEditing = editingNodeId === node.id;

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
        onClick={() => !isEditing && handleNodeSelect(node)}
        onDoubleClick={(e) => {
          e.preventDefault();
          if (!isEditing) {
            startEditingLabel(node);
          }
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          if (!isEditing) {
            startEditingLabel(node);
          }
        }}
      >
        <div className="d-flex align-items-center">
          <div 
            className="me-2"
            onClick={(e) => {
              e.stopPropagation();
              if (node.droppable && !isEditing) {
                onToggle();
              }
            }}
            style={{ cursor: node.droppable && !isEditing ? 'pointer' : 'default', width: '20px', textAlign: 'center' }}
          >
            {node.droppable && treeData.some(n => n.parent === node.id) && !isEditing && (
              <FontAwesomeIcon 
                icon={isOpen ? faChevronDown : faChevronRight} 
                className="text-muted"
                size="sm"
              />
            )}
          </div>
          <div className="me-2" style={{ width: '20px', textAlign: 'center' }}>
            {getIcon(node.data?.type)}
          </div>
          
          {isEditing ? (
            <div className="flex-grow-1 d-flex align-items-center">
              <input
                type="text"
                className="form-control form-control-sm me-2"
                value={editingNodeLabel}
                onChange={(e) => setEditingNodeLabel(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    saveNodeLabel();
                  } else if (e.key === 'Escape') {
                    cancelEditingLabel();
                  }
                }}
                autoFocus
                style={{ fontSize: '0.9rem' }}
              />
              <button
                className="btn btn-success btn-sm me-1"
                onClick={(e) => {
                  e.stopPropagation();
                  saveNodeLabel();
                }}
                disabled={updatingNodeLabel || !editingNodeLabel.trim()}
                style={{ padding: '2px 6px' }}
              >
                {updatingNodeLabel ? (
                  <span className="spinner-border spinner-border-sm" role="status"></span>
                ) : (
                  <FontAwesomeIcon icon={faCheckCircle} size="sm" />
                )}
              </button>
              <button
                className="btn btn-danger btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  cancelEditingLabel();
                }}
                disabled={updatingNodeLabel}
                style={{ padding: '2px 6px' }}
              >
                <FontAwesomeIcon icon={faTimes} size="sm" />
              </button>
            </div>
          ) : (
            <span 
              className="flex-grow-1"
              style={{
                color: isSelected ? '#fff' : '#000',
                fontWeight: isSelected ? 'bold' : 'normal'
              }}
            >
              {node.text}
            </span>
          )}
        </div>
      </div>
    );
  };

  const nodeMatchesSearch = (node, searchTerm) => {
    if (!searchTerm) return true;
    
    const nodeText = node.text?.toLowerCase() || '';
    const searchLower = searchTerm.toLowerCase();
    
    return nodeText.includes(searchLower);
  };

  const findParentPath = (nodeId, nodes) => {
    const findNode = (id, nodeList, path = []) => {
      for (const node of nodeList) {
        const currentPath = [...path, node];
        if (node.id === id) {
          return currentPath;
        }
        if (node.children) {
          const found = findNode(id, node.children, currentPath);
          if (found) return found;
        }
      }
      return null;
    };
    
    return findNode(nodeId, nodes);
  };

  const getFilteredTreeData = () => {
    if (!treeSearchTerm) return treeData;
    
    const filterNodes = (nodes) => {
      return nodes.filter(node => {
        const matches = nodeMatchesSearch(node, treeSearchTerm);
        const hasMatchingChildren = node.children && filterNodes(node.children).length > 0;
        return matches || hasMatchingChildren;
      });
    };
    
    return filterNodes(treeData);
  };

  const getDeviceStatusIcon = (device) => {
    if (device.active) {
      return <FontAwesomeIcon icon={faCheckCircle} className="text-success" />;
    } else {
      return <FontAwesomeIcon icon={faExclamationTriangle} className="text-warning" />;
    }
  };

  const getDeviceStatusText = (device) => {
    if (device.active) {
      return 'Aktiv';
    } else {
      return 'Inaktiv';
    }
  };

  // ECharts configuration for temperature telemetry
  const getTelemetryChartOption = () => {
    if (!telemetryData || telemetryData.length === 0) {
      return {
        title: {
          text: 'Keine Telemetriedaten verfügbar',
          left: 'center',
          top: 'center',
          textStyle: {
            color: '#333',
            fontSize: 16
          }
        },
        subtitle: {
          text: 'Überprüfen Sie, ob Geräte mit Temperatursensoren vorhanden sind',
          left: 'center',
          top: 'center',
          offsetY: 30,
          textStyle: {
            color: '#666',
            fontSize: 12
          }
        },
        backgroundColor: '#fff'
      };
    }

    const series = [];
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];

    telemetryData.forEach((deviceData, index) => {
      const device = devices.find(d => d.id?.id === deviceData.deviceId || d.id === deviceData.deviceId);
      // Use device label if available, otherwise use name, fallback to device ID
      const deviceName = device ? (device.label || device.name || `Device ${deviceData.deviceId}`) : `Device ${deviceData.deviceId}`;
      const keyName = deviceData.key || 'temperature';
      
      const data = deviceData.data.map(point => [
        new Date(point.ts).toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        point.value
      ]);

      const isCurrentValue = deviceData.isCurrentValue;
      
      series.push({
        name: `${deviceName}${isCurrentValue ? ' - Aktueller Wert' : ''}`,
        type: 'line',
        data: data,
        smooth: true,
        lineStyle: {
          color: colors[index % colors.length],
          width: isCurrentValue ? 3 : 2
        },
        itemStyle: {
          color: colors[index % colors.length]
        },
        symbol: 'circle',
        symbolSize: isCurrentValue ? 8 : 6,
        showSymbol: isCurrentValue
      });
    });

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        textStyle: {
          color: '#333'
        },
        formatter: function(params) {
          let result = `<div style="font-weight: bold; margin-bottom: 5px; color: #333;">${params[0].axisValue}</div>`;
          params.forEach(param => {
            result += `<div style="margin: 3px 0; color: #333;">
              <span style="display: inline-block; width: 10px; height: 10px; background: ${param.color}; margin-right: 5px;"></span>
              <span style="font-weight: bold;">${param.seriesName}:</span> ${param.value[1]}°C
            </div>`;
          });
          return result;
        }
      },
      legend: {
        data: series.map(s => s.name),
        left: 'left',
        top: 'center',
        orient: 'vertical',
        textStyle: {
          color: '#333',
          fontSize: 11
        },
        itemGap: 6,
        itemWidth: 10,
        itemHeight: 6,
        width: '15%',
        height: '70%',
        pageButtonItemGap: 5,
        pageButtonGap: 5,
        pageButtonPosition: 'end',
        pageIconColor: '#333',
        pageIconInactiveColor: '#999',
        pageTextStyle: {
          color: '#333',
          fontSize: 10
        },
        formatter: function(name) {
          if (name.length > 20) {
            return name.substring(0, 17) + '...';
          }
          return name;
        },
        type: 'scroll'
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.length > 0 ? series[0].data.map(item => item[0]) : [],
        axisLabel: {
          color: '#333',
          rotate: 45
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Temperatur (°C)',
        nameTextStyle: {
          color: '#333'
        },
        axisLabel: {
          color: '#333'
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        },
        splitLine: {
          lineStyle: {
            color: '#eee'
          }
        }
      },
      series: series,
      backgroundColor: '#fff'
    };
  };

  // ECharts configuration for target temperature telemetry
  const getTargetTelemetryChartOption = () => {
    if (!targetTelemetryData || targetTelemetryData.length === 0) {
      return {
        title: {
          text: 'Keine Ziel-Temperaturdaten verfügbar',
          left: 'center',
          top: 'center',
          textStyle: {
            color: '#333',
            fontSize: 16
          }
        },
        subtitle: {
          text: 'Überprüfen Sie, ob Geräte mit Ziel-Temperaturdaten vorhanden sind',
          left: 'center',
          top: 'center',
          offsetY: 30,
          textStyle: {
            color: '#666',
            fontSize: 12
          }
        },
        backgroundColor: '#fff'
      };
    }

    const series = [];
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];

    targetTelemetryData.forEach((deviceData, index) => {
      const device = devices.find(d => d.id?.id === deviceData.deviceId || d.id === deviceData.deviceId);
      // Use device label if available, otherwise use name, fallback to device ID
      const deviceName = device ? (device.label || device.name || `Device ${deviceData.deviceId}`) : `Device ${deviceData.deviceId}`;
      
      const data = deviceData.data.map(point => [
        new Date(point.ts).toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        point.value
      ]);

      const isCurrentValue = deviceData.isCurrentValue;
      
      series.push({
        name: `${deviceName}${isCurrentValue ? ' - Aktueller Wert' : ''}`,
        type: 'line',
        data: data,
        smooth: true,
        lineStyle: {
          color: colors[index % colors.length],
          width: isCurrentValue ? 3 : 2
        },
        itemStyle: {
          color: colors[index % colors.length]
        },
        symbol: 'circle',
        symbolSize: isCurrentValue ? 8 : 6,
        showSymbol: isCurrentValue
      });
    });

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        textStyle: {
          color: '#333'
        },
        formatter: function(params) {
          let result = `<div style="font-weight: bold; margin-bottom: 5px; color: #333;">${params[0].axisValue}</div>`;
          params.forEach(param => {
            result += `<div style="margin: 3px 0; color: #333;">
              <span style="display: inline-block; width: 10px; height: 10px; background: ${param.color}; margin-right: 5px;"></span>
              <span style="font-weight: bold;">${param.seriesName}:</span> ${param.value[1]}°C
            </div>`;
          });
          return result;
        }
      },
      legend: {
        data: series.map(s => s.name),
        left: 'left',
        top: 'center',
        orient: 'vertical',
        textStyle: {
          color: '#333',
          fontSize: 11
        },
        itemGap: 6,
        itemWidth: 10,
        itemHeight: 6,
        width: '15%',
        height: '70%',
        pageButtonItemGap: 5,
        pageButtonGap: 5,
        pageButtonPosition: 'end',
        pageIconColor: '#333',
        pageIconInactiveColor: '#999',
        pageTextStyle: {
          color: '#333',
          fontSize: 10
        },
        formatter: function(name) {
          if (name.length > 20) {
            return name.substring(0, 17) + '...';
          }
          return name;
        },
        type: 'scroll'
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.length > 0 ? series[0].data.map(item => item[0]) : [],
        axisLabel: {
          color: '#333',
          rotate: 45
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Ziel-Temperatur (°C)',
        nameTextStyle: {
          color: '#333'
        },
        axisLabel: {
          color: '#333'
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        },
        splitLine: {
          lineStyle: {
            color: '#eee'
          }
        }
      },
      series: series,
      backgroundColor: '#fff'
    };
  };

  // ECharts configuration for valve telemetry
  const getValveTelemetryChartOption = () => {
    if (!valveTelemetryData || valveTelemetryData.length === 0) {
      return {
        title: {
          text: 'Keine Ventil-Daten verfügbar',
          left: 'center',
          top: 'center',
          textStyle: {
            color: '#333',
            fontSize: 16
          }
        },
        subtitle: {
          text: 'Überprüfen Sie, ob Geräte mit Ventil-Daten vorhanden sind',
          left: 'center',
          top: 'center',
          offsetY: 30,
          textStyle: {
            color: '#666',
            fontSize: 12
          }
        },
        backgroundColor: '#fff'
      };
    }

    const series = [];
    const colors = ['#ff6b6b', '#4ecdc4', '#45b7d1', '#96ceb4', '#feca57', '#ff9ff3', '#54a0ff', '#5f27cd'];

    valveTelemetryData.forEach((deviceData, index) => {
      const device = devices.find(d => d.id?.id === deviceData.deviceId || d.id === deviceData.deviceId);
      // Use device label if available, otherwise use name, fallback to device ID
      const deviceName = device ? (device.label || device.name || `Device ${deviceData.deviceId}`) : `Device ${deviceData.deviceId}`;
      
      const data = deviceData.data.map(point => [
        new Date(point.ts).toLocaleString('de-DE', {
          day: '2-digit',
          month: '2-digit',
          hour: '2-digit',
          minute: '2-digit'
        }),
        point.value
      ]);

      const isCurrentValue = deviceData.isCurrentValue;
      
      series.push({
        name: `${deviceName}${isCurrentValue ? ' - Aktueller Wert' : ''}`,
        type: 'line',
        data: data,
        smooth: true,
        lineStyle: {
          color: colors[index % colors.length],
          width: isCurrentValue ? 3 : 2
        },
        itemStyle: {
          color: colors[index % colors.length]
        },
        symbol: 'circle',
        symbolSize: isCurrentValue ? 8 : 6,
        showSymbol: isCurrentValue
      });
    });

    return {
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(255, 255, 255, 0.95)',
        borderColor: '#ddd',
        textStyle: {
          color: '#333'
        },
        formatter: function(params) {
          let result = `<div style="font-weight: bold; margin-bottom: 5px; color: #333;">${params[0].axisValue}</div>`;
          params.forEach(param => {
            result += `<div style="margin: 3px 0; color: #333;">
              <span style="display: inline-block; width: 10px; height: 10px; background: ${param.color}; margin-right: 5px;"></span>
              <span style="font-weight: bold;">${param.seriesName}:</span> ${param.value[1]}%
            </div>`;
          });
          return result;
        }
      },
      legend: {
        data: series.map(s => s.name),
        left: 'left',
        top: 'center',
        orient: 'vertical',
        textStyle: {
          color: '#333',
          fontSize: 11
        },
        itemGap: 6,
        itemWidth: 10,
        itemHeight: 6,
        width: '15%',
        height: '70%',
        pageButtonItemGap: 5,
        pageButtonGap: 5,
        pageButtonPosition: 'end',
        pageIconColor: '#333',
        pageIconInactiveColor: '#999',
        pageTextStyle: {
          color: '#333',
          fontSize: 10
        },
        formatter: function(name) {
          if (name.length > 20) {
            return name.substring(0, 17) + '...';
          }
          return name;
        },
        type: 'scroll'
      },
      grid: {
        left: '15%',
        right: '4%',
        bottom: '3%',
        containLabel: true
      },
      xAxis: {
        type: 'category',
        boundaryGap: false,
        data: series.length > 0 ? series[0].data.map(item => item[0]) : [],
        axisLabel: {
          color: '#333',
          rotate: 45
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        }
      },
      yAxis: {
        type: 'value',
        name: 'Öffnung (%)',
        nameTextStyle: {
          color: '#333'
        },
        axisLabel: {
          color: '#333'
        },
        axisLine: {
          lineStyle: {
            color: '#ddd'
          }
        },
        splitLine: {
          lineStyle: {
            color: '#eee'
          }
        }
      },
      series: series,
      backgroundColor: '#fff'
    };
  };

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
              {/* Header removed */}
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
                >
                  <FontAwesomeIcon 
                    icon={faRotateRight} 
                    className={loading ? 'fa-spin' : ''}
                  />
                </button>
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
                  tree={getFilteredTreeData()}
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
          <div 
            className="card bg-light text-white flex-grow-1" 
            style={{ 
              height: windowHeight ? `${windowHeight - 80}px` : 'auto',
              display: 'flex',
              flexDirection: 'column'
            }}
          >
            <div className="card-header bg-light border-secondary">
              {/* Header removed */}
            </div>
            <div className="card-body d-flex flex-column" style={{ overflow: 'auto' }}>
              {selectedNode ? (
                <div>
                  {/* Time Range Selector */}
                  <div className="d-flex justify-content-end mb-3">
                    <button 
                      className="btn btn-outline-secondary"
                      onClick={() => setShowTimeRangeModal(true)}
                    >
                      <FontAwesomeIcon icon={faClock} className="me-2" />
                      {getTimeRangeLabel(selectedTimeRange)}
                    </button>
                  </div>

                  {/* Tab Navigation */}
                  <div className="nav nav-tabs mb-3" role="tablist">
                    <button
                      className={`nav-link ${activeTab === 'verlauf' ? 'active' : ''}`}
                      onClick={() => setActiveTab('verlauf')}
                    >
                      Verlauf
                    </button>
                    <button
                      className={`nav-link ${activeTab === 'details' ? 'active' : ''}`}
                      onClick={() => setActiveTab('details')}
                    >
                      Details
                    </button>
                    <button
                      className={`nav-link ${activeTab === 'einstellungen' ? 'active' : ''}`}
                      onClick={() => setActiveTab('einstellungen')}
                    >
                      Einstellungen
                    </button>
                    <button
                      className={`nav-link ${activeTab === 'alarme' ? 'active' : ''}`}
                      onClick={() => setActiveTab('alarme')}
                    >
                      Alarme
                    </button>
                    <button
                      className={`nav-link ${activeTab === 'devices' ? 'active' : ''}`}
                      onClick={() => {
                        setActiveTab('devices');
                        // Load devices if not already loaded and we have a selected node
                        if (selectedNode?.id && devices.length === 0 && !loadingDevices) {
                          fetchDevices(selectedNode.id);
                        }
                      }}
                    >
                      Devices
                    </button>
                  </div>

                  {/* Save/Cancel Buttons (shown above tabs if there are unsaved changes) */}
                  {hasUnsavedChanges && (
                    <div className="mt-2 mb-4">
                      <div className="alert alert-warning d-flex justify-content-between align-items-center" role="alert">
                        <div>
                          <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                          Sie haben ungespeicherte Änderungen
                        </div>
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
                      </div>
                    </div>
                  )}

                  {/* Tab Content */}
                  <div className="tab-content">
                    {/* Verlauf Tab */}
                    {activeTab === 'verlauf' && (
                      <div className="tab-pane fade show active">
                        <div className="row">
                          {/* Sensor Temperatur Chart */}
                          <div className="col-12">
                            <div className="card bg-light text-dark mb-4">
                              <div className="card-header d-flex justify-content-between align-items-center">
                                <h6 className="mb-0">
                                  <FontAwesomeIcon icon={faThermometerHalf} className="me-2" />
                                  Sensor Temperatur
                                  {telemetryData.length > 0 && (
                                    <span className="text-muted ms-2">
                                      ({telemetryData.length} Geräte)
                                    </span>
                                  )}
                                </h6>
                              </div>
                              <div className="card-body">
                                {loadingTelemetry ? (
                                  <div className="text-center py-5">
                                    <div className="spinner-border text-secondary" role="status">
                                      <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <p className="mt-2 text-muted">Lade Telemetriedaten...</p>
                                  </div>
                                ) : (
                                  <div style={{ height: '400px' }}>
                                    <ReactECharts 
                                      option={getTelemetryChartOption()} 
                                      style={{ height: '100%' }}
                                      opts={{ renderer: 'canvas' }}
                                    />
                                  </div>
                                )}
                                {!loadingTelemetry && telemetryData.length === 0 && devices.length > 0 && (
                                  <div className="text-center text-muted mt-3">
                                    <p className="mb-0">
                                      <small>
                                        Keine Sensor-Temperaturdaten gefunden.
                                      </small>
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Ziel Temperatur Chart */}
                          <div className="col-12">
                            <div className="card bg-light text-dark mb-4">
                              <div className="card-header d-flex justify-content-between align-items-center">
                                <h6 className="mb-0">
                                  <FontAwesomeIcon icon={faThermometerHalf} className="me-2" />
                                  Ziel Temperatur
                                  {targetTelemetryData.length > 0 && (
                                    <span className="text-muted ms-2">
                                      ({targetTelemetryData.length} Geräte)
                                    </span>
                                  )}
                                </h6>
                              </div>
                              <div className="card-body">
                                {loadingTelemetry ? (
                                  <div className="text-center py-5">
                                    <div className="spinner-border text-secondary" role="status">
                                      <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <p className="mt-2 text-muted">Lade Telemetriedaten...</p>
                                  </div>
                                ) : (
                                  <div style={{ height: '400px' }}>
                                    <ReactECharts 
                                      option={getTargetTelemetryChartOption()} 
                                      style={{ height: '100%' }}
                                      opts={{ renderer: 'canvas' }}
                                    />
                                  </div>
                                )}
                                {!loadingTelemetry && targetTelemetryData.length === 0 && devices.length > 0 && (
                                  <div className="text-center text-muted mt-3">
                                    <p className="mb-0">
                                      <small>
                                        Keine Ziel-Temperaturdaten gefunden.
                                      </small>
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Ventil Öffnung Chart */}
                          <div className="col-12">
                            <div className="card bg-light text-dark mb-4">
                              <div className="card-header d-flex justify-content-between align-items-center">
                                <h6 className="mb-0">
                                  <FontAwesomeIcon icon={faTachometerAlt} className="me-2" />
                                  Ventil Öffnung
                                  {valveTelemetryData.length > 0 && (
                                    <span className="text-muted ms-2">
                                      ({valveTelemetryData.length} Geräte)
                                    </span>
                                  )}
                                </h6>
                              </div>
                              <div className="card-body">
                                {loadingTelemetry ? (
                                  <div className="text-center py-5">
                                    <div className="spinner-border text-secondary" role="status">
                                      <span className="visually-hidden">Loading...</span>
                                    </div>
                                    <p className="mt-2 text-muted">Lade Telemetriedaten...</p>
                                  </div>
                                ) : (
                                  <div style={{ height: '400px' }}>
                                    <ReactECharts 
                                      option={getValveTelemetryChartOption()} 
                                      style={{ height: '100%' }}
                                      opts={{ renderer: 'canvas' }}
                                    />
                                  </div>
                                )}
                                {!loadingTelemetry && valveTelemetryData.length === 0 && devices.length > 0 && (
                                  <div className="text-center text-muted mt-3">
                                    <p className="mb-0">
                                      <small>
                                        Keine Ventil-Öffnungsdaten gefunden.
                                      </small>
                                    </p>
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
                        <div className="col-12">
                          <div className="card bg-light text-dark">
                            <div className="card-header">
                              <h6 className="mb-0">Node Details</h6>
                            </div>
                            <div className="card-body">
                              {loadingDetails ? (
                                <div className="text-center py-5">
                                  <div className="spinner-border text-secondary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                  </div>
                                  <p className="mt-2 text-muted">Lade Node-Details...</p>
                                </div>
                              ) : (
                                <div>

                                  {/* Current Temperature Section */}
                                  <div className="mt-4 mb-3">
                                    <h6><strong>Aktuelle Durchschnittstemperatur:</strong></h6>
                                    <div className="d-flex justify-content-center">
                                      <div className="card" style={{
                                        background: 'linear-gradient(135deg, #e3f2fd 0%, #bbdefb 100%)',
                                        border: '2px solid #2196f3',
                                        borderRadius: '15px',
                                        minWidth: '280px',
                                        maxWidth: '350px',
                                        boxShadow: '0 4px 15px rgba(33, 150, 243, 0.2)'
                                      }}>
                                        <div className="card-body text-center py-3">
                                          {loadingCurrentTemp ? (
                                            <div>
                                              <div className="spinner-border text-primary mb-2" role="status">
                                                <span className="visually-hidden">Loading...</span>
                                              </div>
                                              <div style={{ fontSize: '0.9rem', color: '#666' }}>
                                                Lade aktuelle Temperatur...
                                              </div>
                                            </div>
                                          ) : currentTemperature ? (
                                            <div>
                                              <div style={{
                                                fontSize: '2.2rem',
                                                fontWeight: 'bold',
                                                color: '#1976d2',
                                                lineHeight: '1',
                                                marginBottom: '8px'
                                              }}>
                                                {currentTemperature.average.toFixed(1)}°C
                                              </div>
                                              <div style={{
                                                fontSize: '0.85rem',
                                                color: '#666',
                                                marginBottom: '5px'
                                              }}>
                                                Durchschnitt von {currentTemperature.deviceCount} Thermostat{currentTemperature.deviceCount > 1 ? 'en' : ''}
                                              </div>
                                              <div style={{
                                                fontSize: '0.75rem',
                                                color: '#999'
                                              }}>
                                                <FontAwesomeIcon icon={faClock} className="me-1" />
                                                Aktuell
                                              </div>
                                            </div>
                                          ) : (
                                            <div>
                                              <div style={{
                                                fontSize: '1.2rem',
                                                color: '#666',
                                                marginBottom: '8px'
                                              }}>
                                                <FontAwesomeIcon icon={faThermometerHalf} className="me-2" />
                                                Keine Daten verfügbar
                                              </div>
                                              <div style={{
                                                fontSize: '0.8rem',
                                                color: '#999'
                                              }}>
                                                Keine Thermostate gefunden oder keine aktuellen Messwerte
                                              </div>
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Status Icons Section */}
                                  <div className="mt-4 mb-3">
                                    <h6><strong>Status:</strong></h6>
                                    
                                    {/* Manual Mode Warning */}
                                    {(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'manual' && (
                                      <div className="alert alert-info mb-3" role="alert">
                                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                                        <strong>Manueller Modus:</strong> Alle Thermostate unterhalb dieses Knotens werden nicht mehr über HEATMANAGER gesteuert.
                                      </div>
                                    )}
                                    
                                    <div className="d-flex justify-content-center gap-4">
                                      {/* Manuell Icon */}
                                      <div className="text-center">
                                        <img 
                                          src={(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'manual' ? "/assets/img/hm_manuel_active.svg" : "/assets/img/hm_manuel_inactive.svg"}
                                          alt="Manuell"
                                          style={{ 
                                            width: '60px', 
                                            height: '60px',
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => updateRunStatus('manual')}
                                        />
                                        <div className="mt-2">
                                          <small className="text-muted">Manuell</small>
                                        </div>
                                      </div>

                                      {/* Plan Icon */}
                                      <div className="text-center">
                                        <img 
                                          src={(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'schedule' ? "/assets/img/hm_plan_active.svg" : "/assets/img/hm_plan_inactive.svg"}
                                          alt="Plan"
                                          style={{ 
                                            width: '60px', 
                                            height: '60px',
                                            cursor: 'pointer'
                                          }}
                                          onClick={() => updateRunStatus('schedule')}
                                        />
                                        <div className="mt-2">
                                          <small className="text-muted">Plan</small>
                                        </div>
                                      </div>

                                      {/* Fix Icon */}
                                      <div className="text-center">
                                        <img 
                                          src={(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) === 'fix' ? "/assets/img/hm_fix_active.svg" : "/assets/img/hm_fix_inactive.svg"}
                                          alt="Fix"
                                          style={{ 
                                            width: '60px', 
                                            height: '60px',
                                            cursor: 'pointer'
                                          }}
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
                                    <div className="mt-4 mb-3">
                                      <h6><strong>Fix Temperatur:</strong></h6>
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
                                            
                                            {/* Temperature Slider */}
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
                                    <div className="mt-4 mb-3">
                                      <div className="d-flex justify-content-between align-items-center mb-3">
                                        <h6 className="mb-0"><strong>Wochenplan:</strong></h6>
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
                                          ) : scheduleData ? (
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
                                                              // Parse schedulerPlan array and get plan for this day
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
                                                        
                                                        // Get selected plan index for this day
                                                        let selectedPlanIndex;
                                                        if (selectedDayPlans[dayIndex] !== undefined) {
                                                          selectedPlanIndex = selectedDayPlans[dayIndex];
                                                        } else {
                                                          // Parse schedulerPlan array and get plan for this day
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
                                              Kein Wochenplan verfügbar. Plan &quot;{nodeDetails?.attributes?.schedulerPlan}&quot; nicht gefunden.
                                            </div>
                                          )}
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  
                                  {/* Child Nodes Section */}
                                  {childNodes.length > 0 && (
                                    <div className="mt-4">
                                      <h6><strong>Untergeordnete Nodes:</strong></h6>
                                      <div className="list-group">
                                        {childNodes.map((childNode) => (
                                          <div key={childNode.id} className="list-group-item d-flex align-items-center">
                                            <div className="me-3">
                                              {(() => {
                                                switch (childNode.type?.toLowerCase()) {
                                                  case 'building':
                                                  case 'gebäude':
                                                    return <FontAwesomeIcon icon={faBuilding} className="text-primary" />;
                                                  case 'floor':
                                                  case 'stockwerk':
                                                  case 'etage':
                                                    return <FontAwesomeIcon icon={faLayerGroup} className="text-info" />;
                                                  case 'area':
                                                  case 'bereich':
                                                  case 'zone':
                                                    return <FontAwesomeIcon icon={faHome} className="text-warning" />;
                                                  case 'room':
                                                  case 'raum':
                                                  case 'zimmer':
                                                    return <FontAwesomeIcon icon={faDoorOpen} className="text-success" />;
                                                  case 'device':
                                                  case 'gerät':
                                                  case 'sensor':
                                                    return <FontAwesomeIcon icon={faMicrochip} className="text-danger" />;
                                                  default:
                                                    return <FontAwesomeIcon icon={faBuilding} className="text-secondary" />;
                                                }
                                              })()}
                                            </div>
                                            <div className="flex-grow-1">
                                              <strong>{childNode.label || childNode.name}</strong>
                                              {childNode.type && (
                                                <small className="text-muted ms-2">({childNode.type})</small>
                                              )}
                                            </div>
                                            {childNode.children && childNode.children.length > 0 && (
                                              <small className="text-muted">
                                                {childNode.children.length} Unterelement{childNode.children.length > 1 ? 'e' : ''}
                                              </small>
                                            )}
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                  
                                  {/* Devices Section */}
                                  <div className="mt-4">
                                    <h6><strong>Zugeordnete Geräte:</strong></h6>
                                    {devices.length > 0 ? (
                                      <ul className="list-group">
                                        {devices.map(device => (
                                          <li key={device.id} className="list-group-item d-flex align-items-center">
                                            <div className="me-2">
                                              {getDeviceStatusIcon(device)}
                                            </div>
                                            <div className="flex-grow-1">
                                              {device.label || device.name || `Device ${device.id}`}
                                            </div>
                                            <small className={`badge ${device.active ? 'bg-success' : 'bg-warning'}`}>
                                              {getDeviceStatusText(device)}
                                            </small>
                                          </li>
                                        ))}
                                      </ul>
                                    ) : (
                                      <p className="text-muted">Keine Geräte zugeordnet.</p>
                                    )}
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Einstellungen Tab */}
                    {activeTab === 'einstellungen' && (
                      <div className="tab-pane fade show active">
                        <div className="col-12">
                          <div className="card bg-light text-dark">
                            <div className="card-header">
                              <h6 className="mb-0">Einstellungen</h6>
                            </div>
                            <div className="card-body">
                              {/* Asset Attributes Section */}
                              <div className="mt-2">
                                <h6><strong>Asset Attribute:</strong></h6>
                                <div className="row">
                                  <div className="col-md-6">
                                    <div className="mb-3">
                                      <label className="form-label fw-bold">Child Lock:</label>
                                      <select 
                                        className="form-select"
                                        value={(() => {
                                          const currentValue = nodeDetails?.attributes?.childLock;
                                          if (currentValue === true || currentValue === 'true') return 'true';
                                          if (currentValue === false || currentValue === 'false') return 'false';
                                          return 'false';
                                        })()}
                                        onChange={(e) => {
                                          const newValue = e.target.value === 'true';
                                          
                                          setNodeDetails(prev => ({
                                            ...prev,
                                            attributes: {
                                              ...prev.attributes,
                                              childLock: newValue
                                            }
                                          }));
                                          
                                          // Check if value actually changed
                                          if (newValue !== originalChildLock) {
                                            setHasUnsavedChanges(true);
                                          }
                                        }}
                                      >
                                        <option value="false">Deaktiviert</option>
                                        <option value="true">Aktiviert</option>
                                      </select>
                                    </div>
                                  </div>
                                  <div className="col-md-6">
                                    <div className="mb-3">
                                      <label className="form-label fw-bold">Min. Temperatur (°C):</label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        value={nodeDetails?.attributes?.minTemp || ''}
                                        onChange={(e) => {
                                          const newValue = parseFloat(e.target.value);
                                          
                                          setNodeDetails(prev => ({
                                            ...prev,
                                            attributes: {
                                              ...prev.attributes,
                                              minTemp: newValue
                                            }
                                          }));
                                          
                                          // Check if value actually changed
                                          if (newValue !== originalMinTemp) {
                                            setHasUnsavedChanges(true);
                                          }
                                        }}
                                        step="0.1"
                                        min="-50"
                                        max="50"
                                        placeholder="z.B. 16.0"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="row">
                                  <div className="col-md-6">
                                    <div className="mb-3">
                                      <label className="form-label fw-bold">Max. Temperatur (°C):</label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        value={nodeDetails?.attributes?.maxTemp || ''}
                                        onChange={(e) => {
                                          const newValue = parseFloat(e.target.value);
                                          
                                          setNodeDetails(prev => ({
                                            ...prev,
                                            attributes: {
                                              ...prev.attributes,
                                              maxTemp: newValue
                                            }
                                          }));
                                          
                                          // Check if value actually changed
                                          if (newValue !== originalMaxTemp) {
                                            setHasUnsavedChanges(true);
                                          }
                                        }}
                                        step="0.1"
                                        min="-50"
                                        max="50"
                                        placeholder="z.B. 30.0"
                                      />
                                    </div>
                                  </div>
                                  <div className="col-md-6">
                                    <div className="mb-3">
                                      <label className="form-label fw-bold">Overrule Minuten:</label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        value={nodeDetails?.attributes?.overruleMinutes || ''}
                                        onChange={(e) => {
                                          const newValue = parseInt(e.target.value);
                                          
                                          setNodeDetails(prev => ({
                                            ...prev,
                                            attributes: {
                                              ...prev.attributes,
                                              overruleMinutes: newValue
                                            }
                                          }));
                                          
                                          // Check if value actually changed
                                          if (newValue !== originalOverruleMinutes) {
                                            setHasUnsavedChanges(true);
                                          }
                                        }}
                                        step="1"
                                        min="0"
                                        max="1440"
                                        placeholder="z.B. 30"
                                      />
                                    </div>
                                  </div>
                                </div>
                                <div className="mt-3">
                                  <small className="text-muted">
                                    <FontAwesomeIcon icon={faInfoCircle} className="me-1" />
                                    Änderungen werden gespeichert, wenn Sie den &quot;Speichern&quot;-Button drücken.
                                  </small>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Alarme Tab */}
                    {activeTab === 'alarme' && (
                      <div className="tab-pane fade show active">
                        <div className="col-12">
                          <div className="card bg-light text-dark">
                            <div className="card-header d-flex justify-content-between align-items-center">
                              <h6 className="mb-0">
                                <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                                Alarme der zugeordneten Devices
                              </h6>
                              <div className="d-flex gap-2">
                                {!loadingAlarms && (
                                  <button
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={() => {
                                      if (selectedNode?.id && session?.tbToken) {
                                        fetchAlarms(selectedNode.id, abortController);
                                      } else {
                                        console.log('Cannot retry - missing node ID or tbToken');
                                      }
                                    }}
                                    disabled={!selectedNode?.id || !session?.tbToken}
                                    title={!session?.tbToken ? 'ThingsBoard Token nicht verfügbar' : 'Alarme neu laden'}
                                  >
                                    <FontAwesomeIcon icon={faRotateRight} className="me-1" />
                                    Neu laden
                                  </button>
                                )}
                                {!session?.tbToken && (
                                  <button
                                    className="btn btn-outline-warning btn-sm"
                                    onClick={refreshSession}
                                    title="Session aktualisieren um ThingsBoard Token zu erhalten"
                                  >
                                    <FontAwesomeIcon icon={faRotateRight} className="me-1" />
                                    Token aktualisieren
                                  </button>
                                )}
                                <button
                                  className="btn btn-outline-info btn-sm"
                                  onClick={testThingsBoardConnection}
                                  title="ThingsBoard Verbindung testen"
                                >
                                  <FontAwesomeIcon icon={faInfoCircle} className="me-1" />
                                  Verbindung testen
                                </button>
                                <button
                                  className="btn btn-outline-warning btn-sm"
                                  onClick={() => {
                                    if (selectedNode?.id) {
                                      console.log('Current devices:', devices);
                                      fetchDevices(selectedNode.id);
                                    }
                                  }}
                                  title="Telemetriedaten debuggen"
                                >
                                  <FontAwesomeIcon icon={faBug} className="me-1" />
                                  Debug
                                </button>
                                <button
                                  className="btn btn-outline-primary btn-sm"
                                  onClick={testThingsBoardAlarms}
                                  title="ThingsBoard Alarme testen"
                                >
                                  <FontAwesomeIcon icon={faExclamationTriangle} className="me-1" />
                                  Alarme testen
                                </button>
                                <button
                                  className="btn btn-outline-secondary btn-sm"
                                  onClick={debugAlarmData}
                                  title="Alarm-Daten debuggen"
                                >
                                  <FontAwesomeIcon icon={faInfoCircle} className="me-1" />
                                  Debug
                                </button>
                              </div>
                            </div>
                            <div className="card-body">
                              {loadingAlarms ? (
                                <div className="text-center py-4">
                                  <div className="spinner-border text-secondary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                  </div>
                                  <p className="mt-2 text-muted">Lade Alarme...</p>
                                </div>
                              ) : alarms.length > 0 ? (
                                <div className="table-responsive">
                                  <table className="table table-hover">
                                    <thead className="table-dark">
                                      <tr>
                                        <th>Device (Name + Label)</th>
                                        <th>Alarm Typ</th>
                                        <th>Nachricht</th>
                                        <th>Status</th>
                                        <th>Zeitstempel</th>
                                        <th>Schweregrad</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {alarms.map((alarm, index) => (
                                        <tr key={safeAlarmValue(alarm.id, index)} className={safeAlarmValue(alarm.severity) === 'CRITICAL' ? 'table-danger' : safeAlarmValue(alarm.severity) === 'MAJOR' ? 'table-warning' : 'table-info'}>
                                          <td>
                                            <strong>{safeAlarmValue(alarm.deviceName, 'Unbekannt')}</strong>
                                            <br />
                                            <small className="text-muted">{safeAlarmValue(alarm.deviceLabel, 'Label nicht verfügbar')}</small>
                                          </td>
                                          <td>
                                            <span className={`badge ${safeAlarmValue(alarm.type) === 'TEMPERATURE_HIGH' ? 'bg-danger' : safeAlarmValue(alarm.type) === 'TEMPERATURE_LOW' ? 'bg-warning' : 'bg-secondary'}`}>
                                              {safeAlarmValue(alarm.type, 'Unbekannt')}
                                            </span>
                                          </td>
                                          <td>{safeAlarmValue(alarm.message, 'Keine Nachricht')}</td>
                                          <td>
                                            <span className={`badge ${safeAlarmValue(alarm.status) === 'ACTIVE' ? 'bg-danger' : safeAlarmValue(alarm.status) === 'CLEARED' ? 'bg-success' : 'bg-secondary'}`}>
                                              {safeAlarmValue(alarm.status) === 'ACTIVE' ? 'Aktiv' : safeAlarmValue(alarm.status) === 'CLEARED' ? 'Gelöscht' : safeAlarmValue(alarm.status, 'Unbekannt')}
                                            </span>
                                          </td>
                                          <td>
                                            {alarm.timestamp ? (() => {
                                              try {
                                                const timestamp = Number(alarm.timestamp);
                                                if (isNaN(timestamp)) {
                                                  return 'Ungültiger Zeitstempel';
                                                }
                                                const date = new Date(timestamp);
                                                if (isNaN(date.getTime())) {
                                                  return 'Ungültiger Zeitstempel';
                                                }
                                                return date.toLocaleString('de-DE');
                                              } catch (error) {
                                                console.error('Error formatting timestamp:', error, alarm.timestamp);
                                                return 'Fehler beim Formatieren';
                                              }
                                            })() : 'Unbekannt'}
                                          </td>
                                          <td>
                                            <span className={`badge ${safeAlarmValue(alarm.severity) === 'CRITICAL' ? 'bg-danger' : safeAlarmValue(alarm.severity) === 'MAJOR' ? 'bg-warning' : safeAlarmValue(alarm.severity) === 'MINOR' ? 'bg-info' : 'bg-secondary'}`}>
                                              {safeAlarmValue(alarm.severity) === 'CRITICAL' ? 'Kritisch' : safeAlarmValue(alarm.severity) === 'MAJOR' ? 'Hoch' : safeAlarmValue(alarm.severity) === 'MINOR' ? 'Niedrig' : safeAlarmValue(alarm.severity, 'Unbekannt')}
                                            </span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : status === 'loading' ? (
                                <div className="text-center py-4">
                                  <div className="spinner-border text-secondary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                  </div>
                                  <p className="mt-2 text-muted">Lade Session...</p>
                                </div>
                              ) : status === 'unauthenticated' ? (
                                <div className="text-center py-4">
                                  <FontAwesomeIcon icon={faExclamationTriangle} size="3x" className="text-danger mb-3" />
                                  <h6 className="mb-0">Nicht authentifiziert</h6>
                                  <p className="text-muted mb-0">Bitte melden Sie sich an, um Alarme anzuzeigen.</p>
                                </div>
                              ) : !session?.tbToken ? (
                                <div className="text-center py-4">
                                  <FontAwesomeIcon icon={faExclamationTriangle} size="3x" className="text-warning mb-3" />
                                  <h6 className="mb-0">ThingsBoard Token nicht verfügbar</h6>
                                  <p className="text-muted mb-0">Alarme können nicht geladen werden. Versuchen Sie es später erneut.</p>
                                  <button
                                    className="btn btn-warning btn-sm mt-2"
                                    onClick={refreshSession}
                                  >
                                    <FontAwesomeIcon icon={faRotateRight} className="me-1" />
                                    Token aktualisieren
                                  </button>
                                </div>
                              ) : error ? (
                                <div className="text-center py-4">
                                  <FontAwesomeIcon icon={faExclamationTriangle} size="3x" className="text-danger mb-3" />
                                  <h6 className="mb-0">Fehler beim Laden der Alarme</h6>
                                  <p className="text-muted mb-0">{error}</p>
                                  {error.includes('ThingsBoard token not available') && (
                                    <button
                                      className="btn btn-warning btn-sm mt-2"
                                      onClick={refreshSession}
                                    >
                                      <FontAwesomeIcon icon={faRotateRight} className="me-1" />
                                      Token aktualisieren
                                    </button>
                                  )}
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <FontAwesomeIcon icon={faCheckCircle} size="3x" className="text-success mb-3" />
                                  <h6 className="mb-0">Keine aktiven Alarme</h6>
                                  <p className="text-muted mb-0">Alle zugeordneten Devices funktionieren ordnungsgemäß.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Devices Tab */}
                    {activeTab === 'devices' && (
                      <div className="tab-pane fade show active">
                        <div className="col-12">
                          <div className="card bg-light text-dark">
                            <div className="card-header d-flex justify-content-between align-items-center">
                              <h6 className="mb-0">
                                <FontAwesomeIcon icon={faMicrochip} className="me-2" />
                                Zugeordnete Devices mit Live-Telemetriedaten
                              </h6>
                              <div className="d-flex gap-2">
                                {!loadingDevices && (
                                  <button
                                    className="btn btn-outline-secondary btn-sm"
                                    onClick={() => {
                                      if (selectedNode?.id) {
                                        fetchDevices(selectedNode.id);
                                      }
                                    }}
                                    disabled={!selectedNode?.id}
                                    title="Devices und Telemetriedaten neu laden"
                                  >
                                    <FontAwesomeIcon icon={faRotateRight} className="me-1" />
                                    Neu laden
                                  </button>
                                )}
                                <button
                                  className="btn btn-outline-info btn-sm"
                                  onClick={testThingsBoardConnection}
                                  title="ThingsBoard Verbindung testen"
                                >
                                  <FontAwesomeIcon icon={faInfoCircle} className="me-1" />
                                  Verbindung testen
                                </button>
                              </div>
                            </div>
                            <div className="card-body">
                              {loadingDevices ? (
                                <div className="text-center py-4">
                                  <div className="spinner-border text-secondary" role="status">
                                    <span className="visually-hidden">Loading...</span>
                                  </div>
                                  <p className="mt-2 text-muted">Lade Devices...</p>
                                </div>
                              ) : devices.length > 0 ? (
                                <div className="table-responsive">
                                  <table className="table table-hover">
                                    <thead className="table-dark">
                                      <tr>
                                        <th>Name</th>
                                        <th>Label</th>
                                        <th>Typ</th>
                                        <th>Status</th>
                                        <th>Batterie</th>
                                        <th>Aktuelle Temp.</th>
                                        <th>Ziel Temp.</th>
                                        <th>Ventil</th>
                                        <th>FCnt</th>
                                        <th>Signal</th>
                                        <th>Letzte Aktualisierung</th>
                                        <th>Aktionen</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {devices.map((device) => (
                                        <tr key={safeDeviceId(device.id)} className={Boolean(device.active) ? 'table-success' : 'table-warning'}>
                                          <td>
                                            <strong>{safeAlarmValue(device.name, 'Unbekannt')}</strong>
                                          </td>
                                          <td>
                                            {safeAlarmValue(device.label, 'Kein Label')}
                                          </td>
                                          <td>
                                            <span className="badge bg-info">
                                              {safeAlarmValue(device.type, 'Unbekannt')}
                                            </span>
                                          </td>
                                          <td>
                                            <span className={`badge ${Boolean(device.active) ? 'bg-success' : 'bg-warning'}`}>
                                              {Boolean(device.active) ? 'Aktiv' : 'Inaktiv'}
                                            </span>
                                          </td>
                                          <td>
                                            {device.telemetry?.batteryVoltage ? (
                                              <span className="text-dark">
                                                {Number(device.telemetry.batteryVoltage).toFixed(2)}V
                                              </span>
                                            ) : (
                                              <span className="text-muted" title="Keine Batteriedaten verfügbar">-</span>
                                            )}
                                          </td>
                                          <td>
                                            {device.telemetry?.sensorTemperature ? (
                                              <span className="text-dark">
                                                {Number(device.telemetry.sensorTemperature).toFixed(1)}°C
                                              </span>
                                            ) : (
                                              <span className="text-muted" title="Keine Temperaturdaten verfügbar">-</span>
                                            )}
                                          </td>
                                          <td>
                                            {device.telemetry?.targetTemperature ? (
                                              <span className="text-dark">
                                                {Number(device.telemetry.targetTemperature).toFixed(1)}°C
                                              </span>
                                            ) : (
                                              <span className="text-muted" title="Keine Zieltemperatur verfügbar">-</span>
                                            )}
                                          </td>
                                          <td>
                                            {device.telemetry?.PercentValveOpen ? (
                                              <span className="text-dark">
                                                {Number(device.telemetry.PercentValveOpen).toFixed(0)}%
                                              </span>
                                            ) : (
                                              <span className="text-muted" title="Keine Ventildaten verfügbar">-</span>
                                            )}
                                          </td>
                                          <td>
                                            {device.telemetry?.fCnt ? (
                                              <span className="text-dark">
                                                {device.telemetry.fCnt}
                                              </span>
                                            ) : (
                                              <span className="text-muted" title="Keine Frame Counter Daten verfügbar">-</span>
                                            )}
                                          </td>
                                          <td>
                                            <div className="small">
                                              {device.telemetry?.rssi ? (
                                                <div className="text-dark">
                                                  RSSI: {Number(device.telemetry.rssi).toFixed(1)}dBm
                                                </div>
                                              ) : null}
                                              {device.telemetry?.snr ? (
                                                <div className="text-dark">
                                                  SNR: {Number(device.telemetry.snr).toFixed(1)}dB
                                              </div>
                                              ) : null}
                                              {device.telemetry?.sf ? (
                                                <div className="text-dark">
                                                  SF: {device.telemetry.sf}
                                                </div>
                                              ) : null}
                                              {device.telemetry?.signalQuality ? (
                                                <div className="text-dark">
                                                  Qualität: {device.telemetry.signalQuality}
                                                </div>
                                              ) : null}
                                              {!device.telemetry?.rssi && !device.telemetry?.snr && !device.telemetry?.sf && !device.telemetry?.signalQuality ? (
                                                <span className="text-muted" title="Keine Signaldaten verfügbar">-</span>
                                              ) : null}
                                            </div>
                                          </td>
                                          <td>
                                            {device.telemetry?.lastUpdate ? (
                                              <span className="text-dark" title={new Date(device.telemetry.lastUpdate).toLocaleString('de-DE')}>
                                                {(() => {
                                                  try {
                                                    const timestamp = Number(device.telemetry.lastUpdate);
                                                    if (isNaN(timestamp)) {
                                                      return 'Ungültig';
                                                    }
                                                    const date = new Date(timestamp);
                                                    if (isNaN(date.getTime())) {
                                                      return 'Ungültig';
                                                    }
                                                    
                                                    const now = Date.now();
                                                    const lastUpdate = date.getTime();
                                                    const diff = now - lastUpdate;
                                                    const minutes = Math.floor(diff / (1000 * 60));
                                                    const hours = Math.floor(diff / (1000 * 60 * 60));
                                                    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
                                                    
                                                    if (minutes < 60) {
                                                      return `${minutes} Min.`;
                                                    } else if (hours < 24) {
                                                      return `${hours} Std.`;
                                                    } else {
                                                      return `${days} Tage`;
                                                    }
                                                  } catch (error) {
                                                    return 'Fehler';
                                                  }
                                                })()}
                                              </span>
                                            ) : (
                                              <span className="text-muted" title="Keine Aktualisierungsdaten verfügbar">-</span>
                                            )}
                                          </td>
                                          <td>
                                            <div className="btn-group btn-group-sm" role="group">
                                              <button
                                                className="btn btn-outline-primary btn-sm"
                                                title="Device-Details anzeigen"
                                                onClick={() => {
                                                  // Hier könnte eine Modal oder Detail-Ansicht geöffnet werden
                                                  console.log('Device details for:', device);
                                                }}
                                              >
                                                <FontAwesomeIcon icon={faInfoCircle} />
                                              </button>
                                              <button
                                                className="btn btn-outline-secondary btn-sm"
                                                title="Telemetriedaten anzeigen"
                                                onClick={() => openTelemetryModal(device)}
                                              >
                                                <FontAwesomeIcon icon={faChartLine} />
                                              </button>
                                            </div>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              ) : (
                                <div className="text-center py-4">
                                  <FontAwesomeIcon icon={faMicrochip} size="3x" className="text-muted mb-3" />
                                  <h6 className="mb-0">Keine Devices zugeordnet</h6>
                                  <p className="text-muted mb-0">Dieser Node hat keine Devices zugeordnet.</p>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  </div>
                </div>
              ) : (
                <div className="text-center text-muted py-5">
                  <FontAwesomeIcon icon={faBuilding} size="3x" className="mb-3" />
                  <h5>Willkommen im Dashboard</h5>
                  <p>Wählen Sie einen Node aus der Hierarchie aus, um dessen Details und Geräte anzuzeigen.</p>
                  

                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Telemetry Modal */}
      <TelemetryModal
        isOpen={showTelemetryModal}
        onClose={() => setShowTelemetryModal(false)}
        device={selectedDeviceForTelemetry}
        telemetryData={selectedDeviceForTelemetry?.telemetry?.rawData}
        isLoading={false}
      />

      {/* Time Range Selection Modal */}
      {showTimeRangeModal && (
        <div 
          style={{ 
            position: 'fixed',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 1050,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0, 0, 0, 0.2)',
            backdropFilter: 'blur(2px)'
          }} 
          onClick={() => setShowTimeRangeModal(false)}
        >
          <div 
            className="bg-white rounded-lg shadow-2xl p-4"
            style={{
              maxWidth: '500px',
              width: '90%',
              animation: 'slideIn 0.3s ease-out'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="d-flex justify-content-between align-items-center mb-3">
              <h5 className="mb-0">Zeitbereich auswählen</h5>
              <button 
                type="button" 
                className="btn-close" 
                onClick={() => setShowTimeRangeModal(false)}
              ></button>
            </div>
            <div className="row">
              {timeRangeOptions.map((option) => (
                <div key={option.value} className="col-6 mb-2">
                  <button
                    className={`btn w-100 ${selectedTimeRange === option.value ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => {
                      setSelectedTimeRange(option.value);
                      setShowTimeRangeModal(false);
                    }}
                  >
                    {option.label}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes slideIn {
          from { 
            opacity: 0;
            transform: translateY(-20px) scale(0.95);
          }
          to { 
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }
      `}</style>
    </DndProvider>
  );
} 