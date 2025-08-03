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
  faClock
} from '@fortawesome/free-solid-svg-icons';
import { Tree } from '@minoru/react-dnd-treeview';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ReactECharts from 'echarts-for-react';

export default function Dashboard() {
  const router = useRouter();
  const { data: session } = useSession({
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

  // AbortController for cancelling requests
  const [abortController, setAbortController] = useState(null);

  // Time range selection
  const [selectedTimeRange, setSelectedTimeRange] = useState('7d'); // Default: 7 days
  const [showTimeRangeModal, setShowTimeRangeModal] = useState(false);

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
    } catch (error) {
      console.error('Error fetching node details:', error);
      setError('Fehler beim Laden der Node-Details');
    } finally {
      setLoadingDetails(false);
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
    fetchNodeDetails(node.id, newAbortController);
  };

  const fetchDevices = async (nodeId) => {
    try {
      const response = await fetch(`/api/config/assets/${nodeId}/devices`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch devices');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error('Error fetching devices:', error);
      return { assigned: [] };
    }
  };

  const fetchTelemetryData = async (nodeId, controller = null) => {
    setLoadingTelemetry(true);
    console.log('--------------------------------');
    console.log('Fetching telemetry data for node:', nodeId);
    console.log('--------------------------------');

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

  const CustomNode = ({ node, onToggle, dragHandle, isOpen }) => {
    const getIcon = (type) => {
      switch (type?.toLowerCase()) {
        case 'building':
        case 'gebäude':
          return <FontAwesomeIcon icon={faBuilding} className="text-primary" />;
        case 'industry':
        case 'industrie':
        case 'factory':
        case 'fabrik':
          return <FontAwesomeIcon icon={faIndustry} className="text-warning" />;
        case 'device':
        case 'gerät':
        case 'sensor':
          return <FontAwesomeIcon icon={faMicrochip} className="text-success" />;
        default:
          return <FontAwesomeIcon icon={faBuilding} className="text-secondary" />;
      }
    };

    const isSelected = selectedNode?.id === node.id;

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
          <div 
            className="me-2"
            onClick={(e) => {
              e.stopPropagation();
              onToggle();
            }}
            style={{ cursor: 'pointer', width: '20px', textAlign: 'center' }}
          >
            {node.droppable && (
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
          <span 
            className="flex-grow-1"
            style={{
              color: isSelected ? '#fff' : '#000',
              fontWeight: isSelected ? 'bold' : 'normal'
            }}
          >
            {node.text}
          </span>
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
                  </div>

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
                                  <p><strong>Name:</strong> {nodeDetails?.name || 'N/A'}</p>
                                  <p><strong>Typ:</strong> {nodeDetails?.type || 'N/A'}</p>
                                  <p><strong>Beschreibung:</strong> {nodeDetails?.description || 'N/A'}</p>
                                  <p><strong>Erstellt am:</strong> {nodeDetails?.createdTime ? new Date(nodeDetails.createdTime).toLocaleDateString() : 'N/A'}</p>
                                  <p><strong>Aktualisiert am:</strong> {nodeDetails?.updatedTime ? new Date(nodeDetails.updatedTime).toLocaleDateString() : 'N/A'}</p>
                                  <p><strong>Geräte:</strong></p>
                                  <ul>
                                    {devices.map(device => (
                                      <li key={device.id}>
                                        {getDeviceStatusIcon(device)} {device.label || device.name || `Device ${device.id}`} ({getDeviceStatusText(device)})
                                      </li>
                                    ))}
                                  </ul>
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
                              <p>Diese Seite befindet sich noch in der Entwicklung.</p>
                              <p>Hier können Sie die Einstellungen für den ausgewählten Node vornehmen.</p>
                              {/* Hier könnten weitere Einstellungen hinzugefügt werden */}
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
                  
                  {/* Dashboard Übersicht */}
                  <div className="row mt-4">
                    <div className="col-md-3">
                      <div className="card bg-secondary text-white">
                        <div className="card-body text-center">
                          <FontAwesomeIcon icon={faMicrochip} size="2x" className="mb-2" />
                          <h4>{dashboardData.totalDevices}</h4>
                          <p className="mb-0">Gesamt Geräte</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="card bg-success text-white">
                        <div className="card-body text-center">
                          <FontAwesomeIcon icon={faCheckCircle} size="2x" className="mb-2" />
                          <h4>{dashboardData.activeDevices}</h4>
                          <p className="mb-0">Aktive Geräte</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="card bg-warning text-white">
                        <div className="card-body text-center">
                          <FontAwesomeIcon icon={faExclamationTriangle} size="2x" className="mb-2" />
                          <h4>{dashboardData.inactiveDevices}</h4>
                          <p className="mb-0">Inaktive Geräte</p>
                        </div>
                      </div>
                    </div>
                    <div className="col-md-3">
                      <div className="card bg-danger text-white">
                        <div className="card-body text-center">
                          <FontAwesomeIcon icon={faThermometerHalf} size="2x" className="mb-2" />
                          <h4>{dashboardData.alerts}</h4>
                          <p className="mb-0">Alerts</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

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