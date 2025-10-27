import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import Layout from '@/components/Layout';
import { Card, Badge, ProgressBar } from 'react-bootstrap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faFire, 
  faTachometerAlt, 
  faThermometerHalf, 
  faCog,
  faExclamationTriangle,
  faCheckCircle,
  faArrowUp,
  faArrowDown,
  faBolt,
  faHome,
  faShieldAlt,
  faChartLine,
  faUsers,
  faCloud,
  faCloudRain,
  faSun,
  faHeartbeat,
  faWarning,
  faInfoCircle
} from '@fortawesome/free-solid-svg-icons';
import Head from 'next/head';

export default function Home() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [dashboardData, setDashboardData] = useState(null);
  const [heatDemandData, setHeatDemandData] = useState(null);
  const [alarmsData, setAlarmsData] = useState(null);
  const [weatherHistoryData, setWeatherHistoryData] = useState(null);
  const [batteryData, setBatteryData] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showTimeModal, setShowTimeModal] = useState(false);
  const [selectedTimePeriod, setSelectedTimePeriod] = useState('24h');

  // Time period options
  const timePeriodOptions = [
    { value: '24h', label: '24 Stunden', days: 1 },
    { value: '7d', label: '7 Tage', days: 7 },
    { value: '30d', label: '30 Tage', days: 30 },
    { value: '90d', label: '90 Tage', days: 90 }
  ];

  // Helper function to get date range based on time period
  const getDateRange = (period) => {
    const now = new Date();
    const startDate = new Date(now);
    
    switch (period) {
      case '24h':
        // Rolling 24 hours: from 24 hours ago to now
        startDate.setTime(now.getTime() - 24 * 60 * 60 * 1000);
        break;
      case '7d':
        startDate.setDate(startDate.getDate() - 7);
        break;
      case '30d':
        startDate.setDate(startDate.getDate() - 30);
        break;
      case '90d':
        startDate.setDate(startDate.getDate() - 90);
        break;
      default:
        startDate.setTime(now.getTime() - 24 * 60 * 60 * 1000);
    }
    
    return {
      startDate: startDate.toISOString(),
      endDate: now.toISOString()
    };
  };

  // Function to handle time period change
  const handleTimePeriodChange = async (period) => {
    console.log('handleTimePeriodChange called with period:', period);
    setSelectedTimePeriod(period);
    setShowTimeModal(false);
    
    if (session?.user?.customerid) {
      try {
        const { startDate, endDate } = getDateRange(period);
        const limit = period === '24h' ? 24 : period === '7d' ? 168 : period === '30d' ? 720 : 2160;
        
        console.log('Fetching data for period:', period, 'startDate:', startDate, 'endDate:', endDate, 'limit:', limit);
        
        const heatDemandResponse = await fetch(`/api/dashboard/heat-demand?customer_id=${session.user.customerid}&start_date=${startDate}&end_date=${endDate}&limit=${limit}`);
        
        if (heatDemandResponse.ok) {
          const heatDemandData = await heatDemandResponse.json();
          console.log('Heat demand data received for period:', period, heatDemandData);
          setHeatDemandData(heatDemandData);
        } else {
          console.warn('Failed to fetch heat demand data for period:', period);
        }
      } catch (err) {
        console.error('Error fetching heat demand data for period:', period, err);
      }
    } else {
      console.warn('No customer ID in session');
    }
  };

  // Helper function to calculate heat demand statistics
  const getHeatDemandStats = () => {
    if (!heatDemandData?.data || heatDemandData.data.length === 0) {
      return { current: '--%', average: '--%' };
    }

    const data = heatDemandData.data;
    // Sort data chronologically to get the most recent (last) value
    const sortedData = [...data].sort((a, b) => new Date(a.hour_start) - new Date(b.hour_start));
    const lastHour = sortedData[sortedData.length - 1]; // Last (most recent) hour
    const averageValveOpen = data.reduce((sum, hour) => sum + hour.avg_percentvalveopen, 0) / data.length;
    
    return {
      current: lastHour ? `${Math.round(lastHour.avg_percentvalveopen)}%` : '--%',
      average: `${Math.round(averageValveOpen)}%`
    };
  };

  // Helper function to get chart data for heat demand
  const getHeatDemandChartData = () => {
    if (!heatDemandData?.data || heatDemandData.data.length === 0) {
      return [];
    }

    const data = heatDemandData.data;
    const maxItems = selectedTimePeriod === '24h' ? 24 : selectedTimePeriod === '7d' ? 7 : selectedTimePeriod === '30d' ? 15 : 20;
    
    // Sort data by hour_start in ascending order (oldest first) for all periods
    // This ensures the chart shows time progression from left to right
    const sortedData = [...data].sort((a, b) => new Date(a.hour_start) - new Date(b.hour_start));
    
    return sortedData.slice(0, maxItems).map(hour => {
      let timeLabel;
      const date = new Date(hour.hour_start);
      
      if (selectedTimePeriod === '24h') {
        timeLabel = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
      } else if (selectedTimePeriod === '7d') {
        timeLabel = date.toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit' });
      } else {
        timeLabel = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
      }
      
      return {
        time: timeLabel,
        value: Math.round(hour.avg_percentvalveopen),
        temperature: Math.round(hour.avg_sensortemperature * 10) / 10
      };
    });
  };

  // Helper function to calculate alarm statistics (same logic as alarms page)
  const getAlarmStats = () => {
    if (!alarmsData?.data || alarmsData.data.length === 0) {
      return { 
        total: 0, 
        critical: 0, 
        info: 0,
        criticalLabel: '-- kritisch',
        infoLabel: '-- Info'
      };
    }

    const alarms = alarmsData.data;
    
    // Same severity mapping as alarms page
    const critical = alarms.filter(alarm => {
      const severity = alarm.severity?.toLowerCase();
      return severity === 'critical' || severity === 'major';
    }).length;
    
    const info = alarms.filter(alarm => {
      const severity = alarm.severity?.toLowerCase();
      return severity === 'minor' || severity === 'warning' || severity === 'indeterminate';
    }).length;

    return {
      total: alarms.length,
      critical: critical,
      info: info,
      criticalLabel: critical > 0 ? `${critical} kritisch` : '-- kritisch',
      infoLabel: info > 0 ? `${info} Info` : '-- Info'
    };
  };

  // Helper function to calculate battery statistics
  const getBatteryStats = () => {
    if (!batteryData?.data || batteryData.data.length === 0) {
      return { 
        total: 0, 
        good: 0, 
        critical: 0, 
        empty: 0,
        goodLabel: 'gut → --',
        criticalLabel: 'kritisch → --',
        emptyLabel: 'leer → --'
      };
    }

    const devices = batteryData.data;
    const good = devices.filter(d => d.battery_status === 'gut').length;
    const critical = devices.filter(d => d.battery_status === 'kritisch').length;
    const empty = devices.filter(d => d.battery_status === 'leer').length;

    return {
      total: devices.length,
      good: good,
      critical: critical,
      empty: empty,
      goodLabel: `gut → ${good}`,
      criticalLabel: `kritisch → ${critical}`,
      emptyLabel: `leer → ${empty}`
    };
  };


  // Helper function to get weather history chart data
  const getWeatherHistoryChartData = () => {
    console.log('Weather history data structure:', weatherHistoryData);
    
    if (!weatherHistoryData?.list || weatherHistoryData.list.length === 0) {
      console.log('No weather history data available');
      return [];
    }

    // Take all 24 hours (hourly data) and sort chronologically (oldest first, newest last)
    const data = weatherHistoryData.list;
    console.log('Processing weather data:', data.length, 'items');
    
    // Sort data by timestamp (dt) in ascending order (oldest first, newest last)
    // This ensures the chart shows time progression from left to right
    const sortedData = [...data].sort((a, b) => a.dt - b.dt);
    
    console.log('Sorted weather data (first 3 items):', sortedData.slice(0, 3).map(item => ({
      dt: item.dt,
      time: new Date(item.dt * 1000).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' }),
      temp: item.main.temp
    })));
    
    return sortedData.map(item => {
      const date = new Date(item.dt * 1000);
      const timeLabel = date.toLocaleTimeString('de-DE', { 
        hour: '2-digit', 
        minute: '2-digit' 
      });
      
      return {
        time: timeLabel,
        temperature: Math.round(item.main.temp),
        description: item.weather[0].description,
        icon: item.weather[0].icon
      };
    });
  };

  // Helper function to get recent alarms
  const getRecentAlarms = () => {
    if (!alarmsData?.data || alarmsData.data.length === 0) {
      return [];
    }

    // Sort by createdTime descending (newest first) and take first 3
    const sortedAlarms = [...alarmsData.data]
      .sort((a, b) => new Date(b.createdTime || b.startTs) - new Date(a.createdTime || a.startTs))
      .slice(0, 3);

    return sortedAlarms.map(alarm => {
      const alarmTime = new Date(alarm.createdTime || alarm.startTs);
      const timeString = alarmTime.toLocaleString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
      });
      const dateString = alarmTime.toLocaleDateString('de-DE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
      });

      return {
        id: alarm.id?.id,
        type: alarm.type || 'Unbekannter Alarm',
        severity: alarm.severity || 'UNKNOWN',
        device: alarm.originatorLabel || alarm.device?.name || 'Unbekanntes Gerät',
        time: timeString,
        date: dateString,
        acknowledged: !!alarm.ackTs,
        cleared: !!alarm.clearTs
      };
    });
  };

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/auth/signin");
    }
  }, [status, router]);

  useEffect(() => {
    async function fetchDashboardData() {
      if (session?.user?.customerid) {
        try {
          // Fetch basic dashboard stats
          const statsResponse = await fetch(`/api/dashboard/stats?customerId=${session.user.customerid}`);
          
          if (!statsResponse.ok) {
            const errorData = await statsResponse.json();
            throw new Error(errorData.error || 'Failed to fetch dashboard data');
          }
          
          const statsData = await statsResponse.json();
          console.log('Dashboard stats received:', statsData);
          setDashboardData(statsData);

          // Fetch heat demand data for last 24 hours (rolling window)
          const now = new Date();
          const startTime = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 24 hours ago
          
          const startDate = startTime.toISOString(); // Full UTC timestamp
          const endDate = now.toISOString(); // Full UTC timestamp
          
          const heatDemandResponse = await fetch(`/api/dashboard/heat-demand?customer_id=${session.user.customerid}&start_date=${startDate}&end_date=${endDate}&limit=24`);
          
          if (heatDemandResponse.ok) {
            const heatDemandData = await heatDemandResponse.json();
            console.log('Heat demand data received:', heatDemandData);
            setHeatDemandData(heatDemandData);
          } else {
            console.warn('Failed to fetch heat demand data, using fallback');
          }

          // Fetch all active alarms for statistics
          const alarmsResponse = await fetch(`/api/alarms?customer_id=${session.user.customerid}&status=ACTIVE&limit=100`);
          
          if (alarmsResponse.ok) {
            const alarmsData = await alarmsResponse.json();
            console.log('All alarms data received:', alarmsData);
            setAlarmsData(alarmsData);
          } else {
            console.warn('Failed to fetch alarms data, using fallback');
          }

          // Load customer data from ThingsBoard
          const customerResponse = await fetch(`/api/thingsboard/customers/${session.user.customerid}`);
          
          let customerData = null;
          if (customerResponse.ok) {
            customerData = await customerResponse.json();
            console.log('+++++++++++++++++++++++++++++++++++++++++++++++');
            console.log('Customer data received:', customerData);
            console.log('+++++++++++++++++++++++++++++++++++++++++++++');
            setCustomerData(customerData);
          } else {
            console.warn('Failed to fetch customer data, using fallback');
          }

          // Load weather history with customer address or fallback
          try {
            console.log('Loading weather history...');
            
            // Build complete address from customer data if available, otherwise fallback to Gelnhausen
            let location = 'Gelnhausen, DE';
            if (customerData?.address || customerData?.city || customerData?.country || customerData?.zip) {
              // Build complete address string from available fields
              const addressParts = [];
              if (customerData.address) addressParts.push(customerData.address);
              if (customerData.zip) addressParts.push(customerData.zip);
              if (customerData.city) addressParts.push(customerData.city);
              if (customerData.country) addressParts.push(customerData.country);
              location = addressParts.join(', ');
            }
            console.log('Using location for weather:', location);
            
            const weatherResponse = await fetch(`/api/weather/history?location=${encodeURIComponent(location)}`);
            console.log('Weather history response status:', weatherResponse.status);
            
            if (weatherResponse.ok) {
              const weatherData = await weatherResponse.json();
              console.log('Weather history data received:', weatherData);
              setWeatherHistoryData(weatherData);
            } else {
              const errorText = await weatherResponse.text();
              console.warn('Failed to fetch weather history data:', weatherResponse.status, errorText);
            }
          } catch (error) {
            console.error('Error fetching weather history:', error);
          }

          // Load battery status data
          const reportingUrl = process.env.REPORTING_URL || 'https://webapptest.heatmanager.cloud';
          const batteryResponse = await fetch(`${reportingUrl}/api/reporting/battery-status?key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD&customer_id=${session.user.customerid}`);

          if (batteryResponse.ok) {
            const batteryData = await batteryResponse.json();
            console.log('Battery status data received:', batteryData);
            setBatteryData(batteryData);
          } else {
            console.warn('Failed to fetch battery status data, using fallback');
          }
        } catch (err) {
          console.error('Error fetching dashboard data:', err);
          setError(err.message);
        } finally {
          setLoading(false);
        }
      } else {
        console.log('No customerid in session:', session?.user);
        setLoading(false);
      }
    }

    if (session) {
      fetchDashboardData();
    } else {
      setLoading(false);
    }
  }, [session]);

  if (status === "loading") {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-muted">Session wird geladen...</p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="spinner-border text-primary" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
          <p className="mt-3 text-muted">Dashboard-Daten werden geladen...</p>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="light-theme min-vh-100 d-flex align-items-center justify-content-center">
        <div className="text-center">
          <div className="alert alert-warning">
            Keine Session gefunden. Bitte melden Sie sich an.
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="light-theme">
        <div className="container mt-4">
          <div className="alert alert-danger">
            <strong>Fehler:</strong> {error}
          </div>
        </div>
      </div>
    );
  }

  return (
    <>
      <Head>
        <title>HeatManager - Dashboard</title>
        <meta name="description" content="HeatManager - Intelligente Heizungssteuerung und -überwachung" />
      </Head>
      
      <div className="light-theme" style={{ backgroundColor: '#f5f5f5', minHeight: '100vh' }}>
        <div className="container-fluid py-4">
          {/* Top Row - Status Cards */}
          <div className="row g-3 mb-4">
            {/* Active Devices Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card 
                className="status-card shadow-sm" 
                style={{ cursor: 'pointer' }}
                onClick={() => router.push('/config/devices?status=active')}
              >
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-success me-3">
                      <FontAwesomeIcon icon={faCheckCircle} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-success fw-bold">{dashboardData?.activeDevices || '--'}</h3>
                      <p className="mb-0 text-muted small">AKTIVE GERÄTE</p>
                      <p className="mb-0 text-muted small">Gesamt {dashboardData?.devices || '--'}</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Heat Demand Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-secondary me-3">
                      <FontAwesomeIcon icon={faThermometerHalf} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-secondary fw-bold">{getHeatDemandStats().current}</h3>
                      <p className="mb-0 text-muted small">WÄRMEANFORDERUNG</p>
                      <p className="mb-0 text-muted small">Ø Ventilöffnung {getHeatDemandStats().average}</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Open Windows Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-info me-3">
                      <FontAwesomeIcon icon={faHome} />
                    </div>
                    <div>
                      <h3 className="mb-0 text-info fw-bold">--</h3>
                      <p className="mb-0 text-muted small">OFFENE FENSTER</p>
                      <p className="mb-0 text-muted small">Keine Fensterkontakte vorhanden</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Battery Status Card */}
            <div className="col-xl-3 col-lg-6 col-md-6">
              <Card 
                className="status-card shadow-sm"
                style={{ cursor: 'pointer' }}
                onClick={() => router.push('/battery-status')}
              >
                <Card.Body className="p-4">
                  <div className="d-flex align-items-center mb-3">
                    <div className="status-icon bg-success me-3">
                      <FontAwesomeIcon icon={faBolt} />
                    </div>
                    <div>
                      <p className="mb-0 text-muted small">BATTERIESTATUS</p>
                      <p className="mb-0 text-muted small">{getBatteryStats().goodLabel}</p>
                      <p className="mb-0 text-muted small">{getBatteryStats().criticalLabel}</p>
                      <p className="mb-0 text-muted small">{getBatteryStats().emptyLabel}</p>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Full Width Card */}
            <div className="col-12">
              <Card className="status-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-center align-items-center">
                    <button 
                      className="btn btn-warning btn-lg"
                      style={{ width: '400px' }}
                      onClick={() => router.push('/heating-control')}
                    >
                      Heatmanager starten
                    </button>
                  </div>
                </Card.Body>
              </Card>
            </div>

          </div>

          {/* Middle Row - Charts and Weather */}
          <div className="row g-4 mb-4">
            {/* Heating Control & Heat Demand Chart */}
            <div className="col-12">
              <Card 
                className="chart-card shadow-sm" 
                style={{ cursor: 'pointer' }}
                onClick={() => router.push('/heating-control')}
              >
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="mb-0 fw-bold">HEIZUNGSSTEUERUNG & WÄRMEANFORDERUNG</h5>
                    <button 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={(e) => {
                        e.stopPropagation(); // Prevent card click when button is clicked
                        console.log('Opening time modal...');
                        setShowTimeModal(true);
                      }}
                    >
                      {timePeriodOptions.find(opt => opt.value === selectedTimePeriod)?.label || 'Letzte 24 h'}
                    </button>
                  </div>
                  <div className="heat-demand-chart">
                    {heatDemandData?.data && heatDemandData.data.length > 0 ? (
                      <div className="chart-container">
                        <div className="chart-header mb-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <span className="text-muted small">
                              Wärmeanforderung über {timePeriodOptions.find(opt => opt.value === selectedTimePeriod)?.label || '24h'}
                            </span>
                            <span className="text-muted small">
                              {heatDemandData.data.length} Datenpunkte
                            </span>
                          </div>
                        </div>
                        <div className="chart-bars">
                          {getHeatDemandChartData().map((item, index) => (
                            <div key={index} className="chart-bar-container">
                              <div className="chart-bar" style={{ 
                                height: `${Math.min(item.value * 2, 100)}px`,
                                backgroundColor: '#9E9E9E'
                              }}>
                                <div className="chart-value-inside">{item.value}%</div>
                              </div>
                               <div className="chart-label">{item.time}</div>
                               <div className="chart-values">
                                 <div className="chart-value temp-value">{item.temperature}°C</div>
                               </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-5">
                        <FontAwesomeIcon icon={faChartLine} size="3x" className="text-muted mb-3" />
                        <p className="text-muted">Chart-Daten werden geladen...</p>
                      </div>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </div>

          </div>

          {/* Weather History Row */}
          <div className="row g-4 mb-4">
            <div className="col-12">
              <Card className="weather-history-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="mb-0 fw-bold">WETTERHISTORIE</h5>
                    <div className="text-end">
                      <small className="text-muted">
                        <FontAwesomeIcon icon={faHome} className="me-1" />
                        {weatherHistoryData?.metadata?.location || 
                         (customerData ? [customerData.address, customerData.zip, customerData.city, customerData.country].filter(Boolean).join(', ') : 'Gelnhausen, DE')}
                      </small>
                    </div>
                  </div>
                  
                  <div className="weather-history-chart">
                    {weatherHistoryData?.list && weatherHistoryData.list.length > 0 ? (
                      <div className="weather-chart-container">
                        <div className="weather-chart-header mb-3">
                          <div className="d-flex justify-content-between align-items-center">
                            <span className="text-muted small">
                              Temperaturverlauf der letzten 24h
                            </span>
                            <span className="text-muted small">
                              {getWeatherHistoryChartData().length} Stunden
                            </span>
                          </div>
                        </div>
                        <div className="weather-chart-bars">
                          {getWeatherHistoryChartData().map((item, index) => (
                            <div key={index} className="weather-chart-bar-container">
                              <div className="weather-chart-bar" style={{ 
                                height: `${Math.max(20, Math.min(100, (item.temperature + 20) * 2))}px`,
                                backgroundColor: item.temperature > 20 ? '#ff6b6b' : item.temperature > 10 ? '#4ecdc4' : '#45b7d1'
                              }}>
                                <div className="weather-chart-value-inside">{item.temperature}°C</div>
                              </div>
                              <div className="weather-chart-label">{item.time}</div>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-5">
                        <FontAwesomeIcon icon={faThermometerHalf} size="3x" className="text-muted mb-3" />
                        <p className="text-muted">
                          {weatherHistoryData ? 'Keine Wetterdaten verfügbar' : 'Wetterdaten werden geladen...'}
                        </p>
                        {weatherHistoryData && (
                          <p className="text-muted small">
                            Debug: {JSON.stringify(weatherHistoryData).substring(0, 100)}...
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>

          {/* Bottom Row - Consumption and Alerts */}
          <div className="row g-4">
            {/* Consumption & Efficiency Chart */}
            <div className="col-xl-8 col-lg-7">
              <Card className="chart-card shadow-sm">
                <Card.Body className="p-4">
                  <h5 className="mb-4 fw-bold">VERBRAUCH & EFFIZIENZ</h5>
                  <div className="chart-placeholder">
                    <div className="text-center py-5">
                      <FontAwesomeIcon icon={faChartLine} size="3x" className="text-muted mb-3" />
                      <p className="text-muted">Verbrauchsdaten werden geladen...</p>
                    </div>
                  </div>
                  <div className="mt-3">
                    <div className="d-flex justify-content-between align-items-center">
                      <span className="text-muted">Energieeinsparung ggü. Referenz:</span>
                      <Badge bg="success">--%</Badge>
                    </div>
                  </div>
                </Card.Body>
              </Card>
            </div>

            {/* Alarms & Messages */}
            <div className="col-xl-4 col-lg-5">
              <Card className="alerts-card shadow-sm">
                <Card.Body className="p-4">
                  <div className="d-flex justify-content-between align-items-center mb-4">
                    <h5 className="mb-0 fw-bold">ALARME & MELDUNGEN</h5>
                    <button 
                      className="btn btn-outline-secondary btn-sm"
                      onClick={() => router.push('/alarms')}
                    >
                      Alarm-Center öffnen
                    </button>
                  </div>
                  
                  <div className="alerts-list">
                    {getRecentAlarms().length > 0 ? (
                      getRecentAlarms().map((alarm, index) => {
                        const getAlarmIcon = (severity) => {
                          switch (severity?.toLowerCase()) {
                            case 'critical':
                            case 'major':
                              return faExclamationTriangle;
                            case 'warning':
                            case 'minor':
                              return faWarning;
                            default:
                              return faInfoCircle;
                          }
                        };

                        const getAlarmColor = (severity) => {
                          switch (severity?.toLowerCase()) {
                            case 'critical':
                            case 'major':
                              return 'danger';
                            case 'warning':
                            case 'minor':
                              return 'warning';
                            default:
                              return 'info';
                          }
                        };

                        const getSeverityLabel = (severity) => {
                          switch (severity?.toLowerCase()) {
                            case 'critical':
                              return 'Kritisch';
                            case 'major':
                              return 'Hoch';
                            case 'warning':
                              return 'Warnung';
                            case 'minor':
                              return 'Niedrig';
                            default:
                              return 'Info';
                          }
                        };

                        return (
                          <div key={alarm.id || index} className="alert-item mb-3">
                            <div className="d-flex align-items-start">
                              <FontAwesomeIcon 
                                icon={getAlarmIcon(alarm.severity)} 
                                className={`text-${getAlarmColor(alarm.severity)} me-2 mt-1`} 
                              />
                              <div className="flex-grow-1">
                                <p className="mb-1 fw-semibold">{alarm.type}</p>
                                <small className="text-muted">
                                  {getSeverityLabel(alarm.severity)} · {alarm.date} {alarm.time} Uhr
                                </small>
                                <br />
                                <small className="text-muted">
                                  Gerät: {alarm.device}
                                </small>
                                {alarm.acknowledged && (
                                  <Badge bg="success" className="ms-2">Bestätigt</Badge>
                                )}
                                {alarm.cleared && (
                                  <Badge bg="info" className="ms-2">Behoben</Badge>
                                )}
                              </div>
                              <button 
                                className={`btn btn-outline-${getAlarmColor(alarm.severity)} btn-sm`}
                                onClick={() => router.push('/alarms')}
                              >
                                Details
                              </button>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="text-center py-3">
                        <FontAwesomeIcon icon={faCheckCircle} size="2x" className="text-success mb-2" />
                        <p className="text-muted mb-0">Keine aktiven Alarme</p>
                        <small className="text-muted">Alle Systeme funktionieren normal</small>
                      </div>
                    )}
                  </div>
                </Card.Body>
              </Card>
            </div>
          </div>
        </div>
      </div>

      {/* Time Period Selection Modal */}
      {showTimeModal && (
        <div 
          className="modal-overlay"
          onClick={() => setShowTimeModal(false)}
        >
          <div 
            className="modal-content-custom"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header-custom">
              <h5 className="modal-title">Zeitraum auswählen</h5>
              <button 
                type="button" 
                className="btn-close-custom" 
                onClick={() => setShowTimeModal(false)}
              >
                ×
              </button>
            </div>
            <div className="modal-body-custom">
              <div className="row g-3">
                {timePeriodOptions.map((option) => (
                  <div key={option.value} className="col-6">
                    <button
                      type="button"
                      className={`btn w-100 ${selectedTimePeriod === option.value ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => {
                        console.log('Selected time period:', option.value);
                        handleTimePeriodChange(option.value);
                      }}
                    >
                      {option.label}
                    </button>
                  </div>
                ))}
              </div>
            </div>
            <div className="modal-footer-custom">
              <button 
                type="button" 
                className="btn btn-secondary" 
                onClick={() => setShowTimeModal(false)}
              >
                Abbrechen
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .status-card {
          border-radius: 12px;
          border: none;
          background: white;
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        
        .status-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1) !important;
        }
        
        .status-card[style*="cursor: pointer"]:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.15) !important;
          background-color: #f8f9fa;
        }
        
        .status-icon {
          width: 48px;
          height: 48px;
          border-radius: 8px;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 1.2rem;
        }
        
        .chart-card, .weather-card, .weather-history-card, .alerts-card {
          border-radius: 12px;
          border: none;
          background: white;
          transition: transform 0.2s ease-in-out, box-shadow 0.2s ease-in-out;
        }
        
        .chart-card:hover, .weather-card:hover, .weather-history-card:hover, .alerts-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0,0,0,0.1) !important;
        }
        
        .chart-card[style*="cursor: pointer"]:hover {
          transform: translateY(-3px);
          box-shadow: 0 10px 25px rgba(0,0,0,0.15) !important;
          background-color: #f8f9fa;
        }
        
        .chart-placeholder {
          background: #f8f9fa;
          border-radius: 8px;
          border: 2px dashed #dee2e6;
        }
        
        .weather-forecast {
          border-top: 1px solid #dee2e6;
          padding-top: 1rem;
        }
        
        .alert-item {
          border-bottom: 1px solid #f0f0f0;
          padding-bottom: 1rem;
        }
        
        .alert-item:last-child {
          border-bottom: none;
          padding-bottom: 0;
        }
        
        .btn-outline-secondary {
          border-color: #6c757d;
          color: #6c757d;
        }
        
        .btn-outline-secondary:hover {
          background-color: #6c757d;
          border-color: #6c757d;
          color: white;
        }
        
        .heat-demand-chart {
          min-height: 200px;
        }
        
        .chart-container {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
        }
        
        .chart-bars {
          display: flex;
          align-items: end;
          gap: 4px;
          height: 150px;
          padding: 0 4px;
          overflow-x: auto;
        }
        
        .chart-bar-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 0;
          flex-shrink: 0;
        }
        
        .chart-bar {
          width: 100%;
          min-height: 4px;
          border-radius: 2px 2px 0 0;
          transition: all 0.3s ease;
          margin-bottom: 8px;
          position: relative;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        
        .chart-value-inside {
          font-size: 0.75rem;
          font-weight: 600;
          text-align: center;
          color: white;
          padding: 2px;
          text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
          white-space: nowrap;
          word-break: keep-all;
        }
        
        .chart-label {
          font-size: 0.7rem;
          color: #6c757d;
          text-align: center;
          margin-bottom: 4px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .chart-values {
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .chart-value {
          font-size: 0.6rem;
          font-weight: 600;
          text-align: center;
        }
        
        .valve-value {
          color: #9E9E9E;
        }
        
        .temp-value {
          color: #4ecdc4;
        }
        
        .weather-history-chart {
          min-height: 200px;
        }
        
        .weather-chart-container {
          background: #f8f9fa;
          border-radius: 8px;
          padding: 1rem;
        }
        
        .weather-chart-bars {
          display: flex;
          align-items: end;
          gap: 2px;
          height: 150px;
          padding: 0 2px;
          overflow-x: auto;
        }
        
        .weather-chart-bar-container {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 0;
          flex-shrink: 0;
        }
        
        .weather-chart-bar {
          width: 100%;
          min-height: 2px;
          border-radius: 1px 1px 0 0;
          transition: all 0.3s ease;
          margin-bottom: 4px;
          position: relative;
          display: flex;
          align-items: flex-end;
          justify-content: center;
        }
        
        .weather-chart-value-inside {
          font-size: 0.9rem;
          font-weight: 600;
          text-align: center;
          color: white;
          padding: 2px;
          text-shadow: 0 0 3px rgba(0, 0, 0, 0.5);
          white-space: nowrap;
          word-break: keep-all;
        }
        
        .weather-chart-label {
          font-size: 0.6rem;
          color: #6c757d;
          text-align: center;
          margin-bottom: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        
        .weather-chart-value {
          font-size: 0.5rem;
          font-weight: 600;
          text-align: center;
          color: #495057;
        }
        
        .modal-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background-color: rgba(0, 0, 0, 0.5);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1050;
        }
        
        .modal-content-custom {
          background: white;
          border-radius: 8px;
          box-shadow: 0 10px 25px rgba(0, 0, 0, 0.2);
          max-width: 500px;
          width: 90%;
          max-height: 90vh;
          overflow-y: auto;
        }
        
        .modal-header-custom {
          padding: 1rem 1.5rem;
          border-bottom: 1px solid #dee2e6;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        
        .modal-title {
          margin: 0;
          font-size: 1.25rem;
          font-weight: 600;
        }
        
        .btn-close-custom {
          background: none;
          border: none;
          font-size: 1.5rem;
          cursor: pointer;
          color: #6c757d;
          padding: 0;
          width: 30px;
          height: 30px;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        
        .btn-close-custom:hover {
          color: #000;
        }
        
        .modal-body-custom {
          padding: 1.5rem;
        }
        
        .modal-footer-custom {
          padding: 1rem 1.5rem;
          border-top: 1px solid #dee2e6;
          display: flex;
          justify-content: flex-end;
        }
      `}</style>
    </>
  );
}

Home.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

