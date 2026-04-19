import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
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
  faSlidersH,
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
  faPlay,
  faCloud,
  faWindowMaximize,
  faUser,
  faTable
} from '@fortawesome/free-solid-svg-icons';
import { Tree } from '@minoru/react-dnd-treeview';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';
import ReactECharts from 'echarts-for-react';
import TelemetryModal from '../components/TelemetryModal';
import {
  debugLog,
  debugWarn,
  timeRangeOptions,
  getTimeRangeInMs,
  getTimeRangeLabel,
  getIconForType,
  getIconColor,
  getNodeTypeLabel,
  convertToTreeViewFormat,
  getAllNodeIds,
  getFirstLevelNodeIds,
  getPathToNode,
  getAllSubordinateNodeIds,
  getAllSubordinateNodes,
  getFilteredTreeData,
  getAttributeDisplayName,
  synchronizeChartData,
  getTemperatureChartOption,
  mergeRoomTimeseriesPoints,
  findFlatTreeNodeByAssetId,
  extractSubtreeRootedAtAssetId,
  mergeCustomerPlansWithAssetPlans
} from '../lib/heating-control';
import TreeNode from '../components/HeatingControl/TreeNode';

/** ThingsBoard liefert runStatus teils als "pir", UI nutzt "PIR" – für Vergleiche normalisieren. */
function isPirRunStatus(status) {
  return status != null && String(status).toLowerCase() === 'pir';
}

function deviceIsWs202(device) {
  const t = String(device?.type || '').toLowerCase();
  return t.includes('ws202');
}

/** Fensterkontakt dnt-LW-WSCI (ThingsBoard device type). */
function deviceIsWsci(device) {
  const t = String(device?.type || device?.device_type || '').toLowerCase();
  return t.includes('wsci');
}

/** Modal/Telemetrie: Tabelle statt Diagramm (PIR, Licht, WSCI-Fenster). */
function telemetryUsesTableModal(device, attribute) {
  if (!attribute) return false;
  if (attribute === 'pir' || attribute === 'light') return true;
  if (attribute === 'hall_sensor_state' && deviceIsWsci(device)) return true;
  return false;
}

/** WS202 PIR: typisch "normal" | "triggert" (auch triggered/trigger). */
function formatPirTelemetryLabel(v) {
  if (v === undefined || v === null || v === '') return '–';
  const s = String(v).trim().toLowerCase();
  if (s === 'triggert' || s === 'triggered' || s === 'trigger') return 'Triggert';
  if (s === 'normal') return 'Normal';
  if (s === 'high' || s === 'on' || s === '1' || s === 'true' || v === 1 || v === true) return 'Triggert';
  if (s === 'low' || s === 'off' || s === '0' || s === 'false' || v === 0 || v === false) return 'Normal';
  return String(v);
}

/** WS202 Licht: typisch "light" | "dark". */
function formatLightTelemetryLabel(v) {
  if (v === undefined || v === null || v === '') return '–';
  const s = String(v).trim().toLowerCase();
  if (s === 'light' || s === 'hell' || s === 'bright') return 'Hell';
  if (s === 'dark' || s === 'dunkel') return 'Dunkel';
  const n = Number(v);
  if (!Number.isNaN(n) && String(v).trim() !== '') {
    return n % 1 === 0 ? String(n) : n.toFixed(2);
  }
  return String(v);
}

/** WSCI / hall_sensor_state: LOW = offen, HIGH = geschlossen (wie Fenster-Status). */
function formatHallSensorTelemetryLabel(v) {
  if (v === undefined || v === null || v === '') return '–';
  const s = String(v).trim().toUpperCase();
  if (s === 'LOW' || s === 'OPEN' || s === 'OFFEN' || s === '0' || s === 'FALSE' || v === 0 || v === false) {
    return 'Offen';
  }
  if (s === 'HIGH' || s === 'CLOSED' || s === 'GESCHLOSSEN' || s === '1' || s === 'TRUE' || v === 1 || v === true) {
    return 'Geschlossen';
  }
  const n = Number(v);
  if (!Number.isNaN(n) && String(v).trim() !== '') {
    return n > 0 ? 'Geschlossen' : 'Offen';
  }
  return String(v);
}

const REPORTING_PROXY_KEY = 'QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD';
/** Kurzzeit-Cache + In-Flight-Dedupe für reporting-proxy limit=1 (Kacheln / Unterräume). */
const REPORTING_LATEST_TTL_MS = 45_000;
const reportingLatestByDeviceId = new Map();
const reportingLatestInflight = new Map();

function peekReportingLatest(deviceId) {
  const e = reportingLatestByDeviceId.get(deviceId);
  if (!e) return null;
  if (Date.now() - e.t > REPORTING_LATEST_TTL_MS) {
    reportingLatestByDeviceId.delete(deviceId);
    return null;
  }
  return e.row;
}

function storeReportingLatest(deviceId, row) {
  if (!row) return;
  reportingLatestByDeviceId.set(deviceId, { t: Date.now(), row });
}

/**
 * Neueste Zeile (limit=1) pro Gerät; zwischen Räumen wiederverwendbar.
 * @param {string} deviceId
 * @param {{ signal?: AbortSignal; skipCache?: boolean }} [options]
 */
async function fetchReportingLatestRow(deviceId, options = {}) {
  const { signal, skipCache = false } = options;
  if (!deviceId) return null;
  if (!skipCache) {
    const cached = peekReportingLatest(deviceId);
    if (cached) return cached;
    const pending = reportingLatestInflight.get(deviceId);
    if (pending) {
      try {
        return await pending;
      } catch {
        return null;
      }
    }
  }

  const task = (async () => {
    try {
      const response = await fetch(
        `/api/reporting-proxy?entity_id=${encodeURIComponent(deviceId)}&limit=1&key=${REPORTING_PROXY_KEY}`,
        {
          headers: { Authorization: `Bearer ${REPORTING_PROXY_KEY}` },
          signal
        }
      );
      if (!response.ok) return null;
      const data = await response.json();
      if (!data.success || !data.data?.length) return null;
      const row = data.data[0];
      if (!skipCache) storeReportingLatest(deviceId, row);
      return row;
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      return null;
    } finally {
      if (!skipCache) reportingLatestInflight.delete(deviceId);
    }
  })();

  if (!skipCache) reportingLatestInflight.set(deviceId, task);
  return task;
}

/** Übersicht (Unterknoten-Telemetrie): Snapshot pro Eltern-Knoten + Mandant, 5 Min gültig. */
const OVERVIEW_TELEMETRY_TTL_MS = 5 * 60 * 1000;
const OVERVIEW_TELEMETRY_SS_PREFIX = 'hmOverviewTel:v1:';
const overviewTelemetryByKey = new Map();
/** Zuletzt gesetzter Mandant für Übersicht-Cache (Modul-Scope: kein Ref nötig, robust bei HMR). */
let overviewTelemetryLastCustomerId = null;

function overviewTelemetryCacheKey(parentNodeId, customerId) {
  return `${customerId || 'nocust'}:${parentNodeId || 'noparent'}`;
}

function overviewTelemetrySessionKey(cacheKey) {
  return `${OVERVIEW_TELEMETRY_SS_PREFIX}${cacheKey}`;
}

function clearOverviewTelemetryStores() {
  overviewTelemetryByKey.clear();
  if (typeof sessionStorage === 'undefined') return;
  try {
    const toRemove = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k?.startsWith(OVERVIEW_TELEMETRY_SS_PREFIX)) toRemove.push(k);
    }
    toRemove.forEach((k) => sessionStorage.removeItem(k));
  } catch {
    /* ignore quota / private mode */
  }
}

function readOverviewTelemetryFromSession(key) {
  if (typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(overviewTelemetrySessionKey(key));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed.t !== 'number' ||
      !parsed.data ||
      typeof parsed.data !== 'object'
    ) {
      sessionStorage.removeItem(overviewTelemetrySessionKey(key));
      return null;
    }
    if (Date.now() - parsed.t > OVERVIEW_TELEMETRY_TTL_MS) {
      sessionStorage.removeItem(overviewTelemetrySessionKey(key));
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeOverviewTelemetryToSession(key, entry) {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      overviewTelemetrySessionKey(key),
      JSON.stringify(entry)
    );
  } catch {
    /* ignore quota */
  }
}

function getOverviewTelemetryCached(parentNodeId, customerId) {
  const key = overviewTelemetryCacheKey(parentNodeId, customerId);
  let e = overviewTelemetryByKey.get(key);
  if (!e) {
    e = readOverviewTelemetryFromSession(key);
    if (e) overviewTelemetryByKey.set(key, e);
  }
  if (!e) return null;
  if (Date.now() - e.t > OVERVIEW_TELEMETRY_TTL_MS) {
    overviewTelemetryByKey.delete(key);
    if (typeof sessionStorage !== 'undefined') {
      try {
        sessionStorage.removeItem(overviewTelemetrySessionKey(key));
      } catch {
        /* ignore */
      }
    }
    return null;
  }
  return e.data;
}

function setOverviewTelemetryCached(parentNodeId, customerId, telemetryMap) {
  if (!parentNodeId || !customerId || !telemetryMap) return;
  const key = overviewTelemetryCacheKey(parentNodeId, customerId);
  const entry = { t: Date.now(), data: { ...telemetryMap } };
  overviewTelemetryByKey.set(key, entry);
  writeOverviewTelemetryToSession(key, entry);
}

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
  const [usePresenceSensor, setUsePresenceSensor] = useState(false);
  const [openNodes, setOpenNodes] = useState([]);
  const [forceExpand, setForceExpand] = useState(false);
  const [windowHeight, setWindowHeight] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [loadingNodeData, setLoadingNodeData] = useState(false);
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [loadingTemperature, setLoadingTemperature] = useState(false);
  /** Verdichteter Verlauf: ein Eintrag pro timestamp mit optionalen sensor_temperature, target_temperature, percent_valve_open */
  const [roomTimeseries, setRoomTimeseries] = useState([]);
  const [loadingTemperatureHistory, setLoadingTemperatureHistory] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [telemetryData, setTelemetryData] = useState([]);
  const [loadingTelemetry, setLoadingTelemetry] = useState(false);
  const [weatherData, setWeatherData] = useState(null);
  const [loadingWeather, setLoadingWeather] = useState(false);
  const [currentTemperature, setCurrentTemperature] = useState(null);
  const [currentTargetTemperature, setCurrentTargetTemperature] = useState(null);
  const [plannedTargetTemperature, setPlannedTargetTemperature] = useState(null);
  const [currentValveOpen, setCurrentValveOpen] = useState(null);
  const [loadingCurrentTemp, setLoadingCurrentTemp] = useState(false);
  const [alarms, setAlarms] = useState([]);
  const [loadingAlarms, setLoadingAlarms] = useState(false);
  const [showTelemetryModal, setShowTelemetryModal] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showTelemetryChartModal, setShowTelemetryChartModal] = useState(false);
  const [selectedTelemetryAttribute, setSelectedTelemetryAttribute] = useState(null);
  const [selectedTelemetryDevice, setSelectedTelemetryDevice] = useState(null);
  const [telemetryChartData, setTelemetryChartData] = useState([]);
  const [loadingTelemetryChart, setLoadingTelemetryChart] = useState(false);
  const [selectedChartTimeRange, setSelectedChartTimeRange] = useState('7d'); // Default: 7 days
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [ws, setWs] = useState(null);
  const treeRef = useRef(null);
  const treeScrollContainerRef = useRef(null); 
  const lastLoadedCustomerIdRef = useRef(null); // Track last loaded customer ID to prevent unnecessary reloads
  /** Einstieg nur einmal pro Mandant ohne „Vorrang“, sonst bei jedem treeData-Laden erneut (Admin-Zwang) */
  const defaultEntryAppliedRef = useRef(false);

  /** Baum ohne Vorfahren des Admin-Einstiegs – nur sichtbarer Teil für diesen Benutzer */
  const visibleTreeData = useMemo(() => {
    if (!treeData?.length || !customerData?.defaultEntryAssetId) {
      return treeData;
    }
    return extractSubtreeRootedAtAssetId(treeData, customerData.defaultEntryAssetId);
  }, [treeData, customerData?.defaultEntryAssetId]);

  // Temperature state (API only)
  const [deviceTemperatures, setDeviceTemperatures] = useState({});

  /** Erhöht bei jedem Knotenwechsel — verhindert veraltete setState nach schnellem Umschalten. */
  const roomLoadGenerationRef = useRef(0);
  /** Bricht laufende Node-Fetches ab (Reporting, Verlauf) beim neuen Knoten. */
  const roomDataAbortRef = useRef(null);

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
  const [selectedDayPlansPIR, setSelectedDayPlansPIR] = useState({});
  const [originalSchedulerPlanPIR, setOriginalSchedulerPlanPIR] = useState([]);
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
  const [originalWindowSensor, setOriginalWindowSensor] = useState(null);
  const [pendingMinTemp, setPendingMinTemp] = useState(null);
  const [pendingMaxTemp, setPendingMaxTemp] = useState(null);
  const [pendingOverruleMinutes, setPendingOverruleMinutes] = useState(null);
  const [pendingWindowSensor, setPendingWindowSensor] = useState(null);
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Telemetry data for subordinate nodes
  const [subordinateTelemetry, setSubordinateTelemetry] = useState({});
  const [loadingSubordinateTelemetry, setLoadingSubordinateTelemetry] = useState(false);

  // Heating control functions
  const updateRunStatus = (newStatus) => {
    setPendingRunStatus(newStatus);
    setHasUnsavedChanges(true);
    
    // Load schedule data when switching to schedule or PIR mode (both use plan table)
    if ((newStatus === 'schedule' || isPirRunStatus(newStatus)) && customerData?.customerid) {
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
      debugLog('Schedule data received:', data);
      debugLog('Plans array:', data.plans);
      setScheduleData(data.plans || null);
    } catch (error) {
      console.error('Error fetching schedule data:', error);
      setScheduleData(null);
    } finally {
      setLoadingSchedule(false);
    }
  };

  /** Kunden-`plans` + Asset-`heatingPlans` für Wochenplan-Auswahl und Anzeige */
  const mergedScheduleData = useMemo(
    () => mergeCustomerPlansWithAssetPlans(scheduleData, nodeDetails?.attributes?.heatingPlans),
    [scheduleData, nodeDetails?.attributes?.heatingPlans]
  );

  const handlePlanChange = (dayIndex, planIndex) => {
    setSelectedDayPlans(prev => ({
      ...prev,
      [dayIndex]: planIndex
    }));
    setHasUnsavedChanges(true);
  };

  const handlePlanChangePIR = (dayIndex, planIndex) => {
    setSelectedDayPlansPIR(prev => ({
      ...prev,
      [dayIndex]: planIndex
    }));
    setHasUnsavedChanges(true);
  };

  // Funktion zur Berechnung der geplanten Zieltemperatur
  const calculatePlannedTargetTemperature = useCallback(() => {
    if (!nodeDetails || !nodeDetails.attributes) {
      setPlannedTargetTemperature(null);
      return;
    }

    const runStatus = pendingRunStatus !== null ? pendingRunStatus : nodeDetails.attributes.runStatus;
    
    // Wenn fixe Temperatur eingestellt ist
    if (runStatus === 'fix') {
      const fixValue = pendingFixValue !== null ? pendingFixValue : nodeDetails.attributes.fixValue;
      if (fixValue !== null && fixValue !== undefined) {
        setPlannedTargetTemperature(Number(fixValue));
      } else {
        setPlannedTargetTemperature(null);
      }
      return;
    }

    // Wenn Schedule oder PIR (Bewegung) eingestellt ist – gleiche Logik, unterschiedliches Attribut
    if (runStatus === 'schedule' || isPirRunStatus(runStatus)) {
      const schedulerPlanValue = isPirRunStatus(runStatus)
        ? nodeDetails.attributes.schedulerPlanPIR
        : nodeDetails.attributes.schedulerPlan;
      if (!schedulerPlanValue || !mergedScheduleData || !Array.isArray(mergedScheduleData)) {
        setPlannedTargetTemperature(null);
        return;
      }

      try {
        // Parse schedulerPlan Array (7 Werte für Montag-Sonntag)
        const planArray = JSON.parse(schedulerPlanValue);
        if (!Array.isArray(planArray) || planArray.length === 0) {
          setPlannedTargetTemperature(null);
          return;
        }

        // Aktuellen Wochentag bestimmen (0 = Sonntag, 1 = Montag, ..., 6 = Samstag)
        const now = new Date();
        let dayOfWeek = now.getDay(); // 0 = Sonntag, 1 = Montag, etc.
        
        // schedulerPlan Array: [Montag, Dienstag, Mittwoch, Donnerstag, Freitag, Samstag, Sonntag]
        // Array-Index: [0, 1, 2, 3, 4, 5, 6]
        // JavaScript getDay(): Sonntag=0, Montag=1, ..., Samstag=6
        // Mapping: Sonntag (0) -> Index 6, Montag (1) -> Index 0, etc.
        let planArrayIndex;
        if (dayOfWeek === 0) {
          planArrayIndex = 6; // Sonntag
        } else {
          planArrayIndex = dayOfWeek - 1; // Montag=0, Dienstag=1, etc.
        }

        const planName = planArray[planArrayIndex];
        if (!planName) {
          setPlannedTargetTemperature(null);
          return;
        }

        // Plan aus Mandanten- + Asset-Plänen (heatingPlans)
        const plan = mergedScheduleData.find(p => Array.isArray(p) && p[0] === planName);
        if (!plan || !Array.isArray(plan[1]) || plan[1].length !== 24) {
          setPlannedTargetTemperature(null);
          return;
        }

        // Aktuelle Stunde bestimmen (0-23)
        const currentHour = now.getHours();
        const temperature = plan[1][currentHour];

        if (temperature !== null && temperature !== undefined) {
          setPlannedTargetTemperature(Number(temperature));
        } else {
          setPlannedTargetTemperature(null);
        }
      } catch (error) {
        console.error('Error calculating planned target temperature:', error);
        setPlannedTargetTemperature(null);
      }
      return;
    }

    // Wenn weder fix noch schedule
    setPlannedTargetTemperature(null);
  }, [nodeDetails, pendingRunStatus, pendingFixValue, mergedScheduleData]);

  // Berechne geplante Zieltemperatur wenn sich relevante Daten ändern
  useEffect(() => {
    calculatePlannedTargetTemperature();
  }, [calculatePlannedTargetTemperature]);

  // Debug: Log runStatus changes
  useEffect(() => {
    const currentRunStatus = pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus;
    debugLog('🟣 [DEBUG] runStatus changed - pendingRunStatus:', pendingRunStatus, 'nodeDetails?.attributes?.runStatus:', nodeDetails?.attributes?.runStatus, 'currentRunStatus:', currentRunStatus);
  }, [pendingRunStatus, nodeDetails?.attributes?.runStatus]);

  // Update selectedNode.data when nodeDetails changes to keep them in sync.
  // Only depend on nodeDetails and selectedNode.id (not selectedNode) to avoid infinite loop:
  // setSelectedNode creates a new object → selectedNode reference changes → effect re-runs.
  const selectedNodeId = selectedNode?.id;
  useEffect(() => {
    if (!nodeDetails || !selectedNodeId || selectedNodeId !== nodeDetails.id) return;
    debugLog('🟠 [DEBUG] Syncing selectedNode.data with nodeDetails - runStatus:', nodeDetails?.attributes?.runStatus);
    setSelectedNode(prev => {
      if (!prev || prev.id !== nodeDetails.id) return prev;
      return {
        ...prev,
        data: {
          ...prev.data,
          runStatus: nodeDetails?.attributes?.runStatus,
          fixValue: nodeDetails?.attributes?.fixValue,
          schedulerPlan: nodeDetails?.attributes?.schedulerPlan
        }
      };
    });
  }, [nodeDetails, selectedNodeId]);

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
        if (Array.isArray(mergedScheduleData) && mergedScheduleData.length > 0) {
          let planArray = [...originalSchedulerPlan];
          
          // Ensure we have 7 days (one for each day of the week)
          while (planArray.length < 7) {
            planArray.push(mergedScheduleData[0]?.[0] || '');
          }

          // Apply any plan changes
          Object.entries(selectedDayPlans).forEach(([dayIndex, planIndex]) => {
            const newPlanName = mergedScheduleData[planIndex]?.[0] || '';
            planArray[parseInt(dayIndex)] = newPlanName;
          });

          updateData.schedulerPlan = JSON.stringify(planArray);
        }
      }

      // Handle schedulerPlanPIR changes - when PIR mode or PIR plan changes
      if (isPirRunStatus(pendingRunStatus) || Object.keys(selectedDayPlansPIR).length > 0) {
        if (Array.isArray(mergedScheduleData) && mergedScheduleData.length > 0) {
          let planArrayPIR = [...originalSchedulerPlanPIR];
          while (planArrayPIR.length < 7) {
            planArrayPIR.push(mergedScheduleData[0]?.[0] || '');
          }
          Object.entries(selectedDayPlansPIR).forEach(([dayIndex, planIndex]) => {
            const newPlanName = mergedScheduleData[planIndex]?.[0] || '';
            planArrayPIR[parseInt(dayIndex)] = newPlanName;
          });
          updateData.schedulerPlanPIR = JSON.stringify(planArrayPIR);
        }
      }

      debugLog('🔵 [DEBUG] Saving heating control data:', updateData);
      debugLog('🔵 [DEBUG] pendingRunStatus before save:', pendingRunStatus);
      debugLog('🔵 [DEBUG] Selected day plans:', selectedDayPlans);
      debugLog('🔵 [DEBUG] Original scheduler plan:', originalSchedulerPlan);
      debugLog('🔵 [DEBUG] Merged schedule data:', mergedScheduleData);

      const response = await fetch(`/api/config/assets/${selectedNode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(updateData)
      });

      debugLog('🔵 [DEBUG] Save response status:', response.status, response.statusText);
      
      if (!response.ok) {
        throw new Error('Failed to save changes');
      }
      
      const savedData = await response.json();
      debugLog('🔵 [DEBUG] Saved asset data:', savedData);
      debugLog('🔵 [DEBUG] Saved runStatus:', savedData?.attributes?.runStatus);

      // Save original values BEFORE resetting pending values
      debugLog('🔵 [DEBUG] Setting originalRunStatus to:', pendingRunStatus);
      if (pendingRunStatus !== null) setOriginalRunStatus(pendingRunStatus);
      if (pendingFixValue !== null) setOriginalFixValue(pendingFixValue);
      if (updateData.schedulerPlan) {
        setOriginalSchedulerPlan(JSON.parse(updateData.schedulerPlan));
      }
      if (updateData.schedulerPlanPIR) {
        setOriginalSchedulerPlanPIR(JSON.parse(updateData.schedulerPlanPIR));
      }

      setHasUnsavedChanges(false);
      setSelectedDayPlans({});
      setSelectedDayPlansPIR({});
      setPendingRunStatus(null);
      setPendingFixValue(null);
      
      // Update selectedNode.data with the new runStatus immediately
      if (pendingRunStatus !== null && selectedNode) {
        debugLog('🔵 [DEBUG] Updating selectedNode.data.runStatus to:', pendingRunStatus);
        setSelectedNode(prev => {
          if (!prev) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              runStatus: pendingRunStatus
            }
          };
        });
      }
      
      debugLog('🔵 [DEBUG] Calling fetchNodeDetails after save...');
      fetchNodeDetails(selectedNode.id);
    } catch (error) {
      console.error('Error saving changes:', error);
    } finally {
      setSavingSchedule(false);
    }
  };

  const cancelChanges = () => {
    setSelectedDayPlans({});
    setSelectedDayPlansPIR({});
    setPendingRunStatus(null);
    setPendingFixValue(null);
    setHasUnsavedChanges(false);
    
    if (originalFixValue !== null) {
      setTempSliderValue(originalFixValue);
    }
  };

  const saveSettings = async () => {
    if (!selectedNode) return;
    
    setSavingSettings(true);
    try {
      const updateData = {};

      if (pendingMinTemp !== null) {
        updateData.minTemp = pendingMinTemp;
      }
      if (pendingMaxTemp !== null) {
        updateData.maxTemp = pendingMaxTemp;
      }
      if (pendingOverruleMinutes !== null) {
        updateData.overruleMinutes = pendingOverruleMinutes;
      }
      if (pendingWindowSensor !== null) {
        updateData.windowSensor = pendingWindowSensor;
      }

      if (Object.keys(updateData).length === 0) {
        return; // Nothing to save
      }

      debugLog('Saving settings data:', updateData);

      // Step 1: Save only the current asset in ThingsBoard (ThingsBoard will distribute to children automatically)
      const response = await fetch(`/api/config/assets/${selectedNode.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify(updateData)
      });

      if (!response.ok) {
        throw new Error('Failed to save settings');
      }

      // Step 2: Update all subordinate nodes in the tree
      const subordinateNodeIds = getAllSubordinateNodeIds(selectedNode.id, visibleTreeData);
      debugLog('Updating subordinate nodes in tree:', subordinateNodeIds);
      
      // Update each subordinate node in the tree (but not in ThingsBoard)
      const treeUpdatePromises = subordinateNodeIds.map(async (nodeId) => {
        try {
          // Use a flag to indicate this is a tree-only update
          const treeUpdateResponse = await fetch(`/api/config/assets/${nodeId}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.token}`,
              'X-Tree-Only-Update': 'true' // Flag to indicate tree-only update
            },
            body: JSON.stringify(updateData)
          });
          
          if (!treeUpdateResponse.ok) {
            debugWarn(`Failed to update tree for node ${nodeId}`);
          }
        } catch (error) {
          debugWarn(`Error updating tree for node ${nodeId}:`, error);
        }
      });

      await Promise.all(treeUpdatePromises);

      // Update original values
      if (pendingMinTemp !== null) setOriginalMinTemp(pendingMinTemp);
      if (pendingMaxTemp !== null) setOriginalMaxTemp(pendingMaxTemp);
      if (pendingOverruleMinutes !== null) setOriginalOverruleMinutes(pendingOverruleMinutes);
      if (pendingWindowSensor !== null) setOriginalWindowSensor(pendingWindowSensor);
      
      // Clear pending values
      setPendingMinTemp(null);
      setPendingMaxTemp(null);
      setPendingOverruleMinutes(null);
      setPendingWindowSensor(null);
      
      // Refresh node details only (settings don't change tree structure)
      fetchNodeDetails(selectedNode.id);
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('Fehler beim Speichern der Einstellungen');
    } finally {
      setSavingSettings(false);
    }
  };

  const cancelSettings = () => {
    setPendingMinTemp(null);
    setPendingMaxTemp(null);
    setPendingOverruleMinutes(null);
    setPendingWindowSensor(null);
  };





  const fetchUserData = useCallback(async () => {
    try {
      debugLog('🔍 Fetching user data...');
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
      debugLog('✅ User data fetched successfully:', userData);
      setCustomerData(userData);
    } catch (err) {
      console.error('❌ Error fetching user data:', err);
      // Set a fallback customer ID if available in session
      if (session?.user?.customerid) {
        debugLog('🔄 Using fallback customer ID from session:', session.user.customerid);
        setCustomerData({ customerid: session.user.customerid });
      }
    }
  }, [session?.token, session?.user?.customerid]);

  // Load customer attributes (e.g. usePresenceSensor) when customer is known
  useEffect(() => {
    if (!customerData?.customerid || !session?.token) {
      setUsePresenceSensor(false);
      return;
    }
    let cancelled = false;
    fetch(`/api/config/customers/${customerData.customerid}/attributes`, {
      headers: { 'Authorization': `Bearer ${session.token}` }
    })
      .then(res => res.ok ? res.json() : { usePresenceSensor: false })
      .then(data => { if (!cancelled) setUsePresenceSensor(!!data.usePresenceSensor); })
      .catch(() => { if (!cancelled) setUsePresenceSensor(false); });
    return () => { cancelled = true; };
  }, [customerData?.customerid, session?.token]);

  const fetchTreeData = useCallback(async () => {
    if (!customerData?.customerid) {
      debugLog('⏳ No customer ID available for tree data');
      setLoading(false);
      return;
    }
    
    try {
      setLoading(true);
      setError(null);
      debugLog('🌳 Fetching tree data for customer:', customerData.customerid);
      
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
      debugLog('✅ Tree data received:', data);
      setTreeData(data);
      
      // Alle Knoten beim Laden aufklappen
      const allNodeIds = getAllNodeIds(data);
      debugLog('🔓 Opening all nodes:', allNodeIds);
      setOpenNodes(allNodeIds);
    } catch (err) {
      console.error('❌ Error loading tree data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [customerData?.customerid, session?.token]);

  const fetchNodeDetails = async (nodeId, loadGen, signal) => {
    if (!nodeId || !customerData?.customerid) return;
    const stillCurrent = () =>
      loadGen === undefined || loadGen === roomLoadGenerationRef.current;
    
    try {
      if (stillCurrent()) {
        setLoadingDetails(true);
        setNodeDetails(null);
      }
      
      debugLog('🟢 [DEBUG] fetchNodeDetails - Fetching asset:', nodeId);
      const response = await fetch(`/api/config/assets/${nodeId}`, {
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Cache-Control': 'no-cache'
        },
        cache: 'no-store',
        signal
      });

      debugLog('🟢 [DEBUG] fetchNodeDetails - Response status:', response.status, response.statusText);
      debugLog('🟢 [DEBUG] fetchNodeDetails - Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        throw new Error('Failed to fetch node details');
      }

      const nodeData = await response.json();
      debugLog('🟢 [DEBUG] fetchNodeDetails - Full nodeData:', nodeData);
      debugLog('🟢 [DEBUG] fetchNodeDetails - nodeData.attributes:', nodeData?.attributes);
      debugLog('🟢 [DEBUG] fetchNodeDetails - runStatus from API:', nodeData?.attributes?.runStatus);
      debugLog('🟢 [DEBUG] fetchNodeDetails - runStatus type:', typeof nodeData?.attributes?.runStatus);
      debugLog('🟢 [DEBUG] fetchNodeDetails - runStatus is PIR:', isPirRunStatus(nodeData?.attributes?.runStatus));
      debugLog('🟢 [DEBUG] fetchNodeDetails - runStatus === "fix":', nodeData?.attributes?.runStatus === 'fix');

      if (!stillCurrent()) return;
      setNodeDetails(nodeData);
      
      // Update selectedNode.data to keep it in sync with nodeDetails
      if (selectedNode && selectedNode.id === nodeId) {
        debugLog('🟢 [DEBUG] fetchNodeDetails - Updating selectedNode.data with new runStatus:', nodeData?.attributes?.runStatus);
        setSelectedNode(prev => {
          if (!prev || prev.id !== nodeId) return prev;
          return {
            ...prev,
            data: {
              ...prev.data,
              runStatus: nodeData?.attributes?.runStatus,
              fixValue: nodeData?.attributes?.fixValue,
              schedulerPlan: nodeData?.attributes?.schedulerPlan
            }
          };
        });
      }
      
      // Update original runStatus from node details
      if (nodeData?.attributes?.runStatus !== undefined) {
        debugLog('🟢 [DEBUG] fetchNodeDetails - Setting originalRunStatus to:', nodeData.attributes.runStatus);
        setOriginalRunStatus(nodeData.attributes.runStatus);
      } else {
        debugLog('🟢 [DEBUG] fetchNodeDetails - runStatus is undefined in nodeData.attributes');
      }
      
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

      const schedulerPlanPIRValue = nodeData?.attributes?.schedulerPlanPIR;
      if (schedulerPlanPIRValue) {
        try {
          const planArrayPIR = JSON.parse(schedulerPlanPIRValue);
          setOriginalSchedulerPlanPIR(Array.isArray(planArrayPIR) ? planArrayPIR : []);
        } catch (error) {
          console.error('Error parsing schedulerPlanPIR in fetchNodeDetails:', error);
          setOriginalSchedulerPlanPIR([]);
        }
      } else {
        setOriginalSchedulerPlanPIR([]);
      }
      
      // Update original settings values from node details (direkt aus ThingsBoard)
      // Diese Werte werden immer direkt aus ThingsBoard geholt, nicht aus dem tree Feld
      if (nodeData?.attributes?.minTemp !== undefined) {
        setOriginalMinTemp(nodeData.attributes.minTemp);
      } else {
        setOriginalMinTemp(16); // Fallback-Wert
      }
      if (nodeData?.attributes?.maxTemp !== undefined) {
        setOriginalMaxTemp(nodeData.attributes.maxTemp);
      } else {
        setOriginalMaxTemp(26); // Fallback-Wert
      }
      if (nodeData?.attributes?.overruleMinutes !== undefined) {
        setOriginalOverruleMinutes(nodeData.attributes.overruleMinutes);
      } else {
        setOriginalOverruleMinutes(360); // Fallback-Wert
      }
      if (nodeData?.attributes?.windowSensor !== undefined) {
        setOriginalWindowSensor(nodeData.attributes.windowSensor);
      } else {
        setOriginalWindowSensor(false); // Fallback-Wert
      }
    } catch (err) {
      if (err?.name === 'AbortError') return;
      console.error('Error fetching node details:', err);
    } finally {
      if (stillCurrent()) setLoadingDetails(false);
    }
  };

  const fetchTemperature = async (node, loadGen, signal) => {
    if (!node || !session?.token) return;
    const canApply = () =>
      loadGen === undefined || loadGen === roomLoadGenerationRef.current;
    
    try {
      if (canApply()) {
        setLoadingTemperature(true);
        setCurrentTemperature(null);
      }
      
      const operationalMode = node.data?.operationalMode || node.operationalMode;
      const extTempDevice = node.data?.extTempDevice || node.extTempDevice;
      
      debugLog('Fetching temperature for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      
      if (operationalMode === 2) {
        if (extTempDevice) {
          let latestData;
          try {
            latestData = await fetchReportingLatestRow(extTempDevice, { signal });
          } catch (e) {
            if (e?.name === 'AbortError') return;
            throw e;
          }
          if (!canApply()) return;
          if (latestData) {
            debugLog('External temperature latest data:', latestData);
            const temperature = latestData.sensor_temperature;
            const targetTemperature = latestData.target_temperature;
            debugLog('External temperature raw value:', temperature);
            debugLog('External target temperature raw value:', targetTemperature);
            if (temperature !== undefined && temperature !== null) {
              const numTemp = Number(temperature);
              debugLog('External temperature converted:', numTemp);
              if (!isNaN(numTemp) && numTemp > -50 && numTemp < 100 && canApply()) {
                setCurrentTemperature({
                  value: numTemp,
                  source: 'external',
                  deviceId: extTempDevice
                });
              } else if (!isNaN(numTemp)) {
                debugWarn('External temperature out of reasonable range:', numTemp);
              }
            }
            if (targetTemperature !== undefined && targetTemperature !== null) {
              const numTargetTemp = Number(targetTemperature);
              debugLog('External target temperature converted:', numTargetTemp);
              if (!isNaN(numTargetTemp) && numTargetTemp > -50 && numTargetTemp < 100 && canApply()) {
                setCurrentTargetTemperature({
                  value: numTargetTemp,
                  source: 'external',
                  deviceId: extTempDevice
                });
              } else if (!isNaN(numTargetTemp)) {
                debugWarn('External target temperature out of reasonable range:', numTargetTemp);
              }
            }
            const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
            debugLog('DEBUG: relatedDevices for valve open:', relatedDevices);
            if (relatedDevices.length > 0) {
              const deviceIds = relatedDevices.map(device => {
                if (typeof device === 'string') return device;
                if (device.id) return device.id;
                if (device.deviceId) return device.deviceId;
                return null;
              }).filter(id => id !== null);
              const valveOpenPromises = deviceIds.map(async (deviceId) => {
                try {
                  const row = await fetchReportingLatestRow(deviceId, { signal });
                  const vo = row?.percent_valve_open;
                  return vo !== null && vo !== undefined ? Number(vo) : 0;
                } catch (e) {
                  if (e?.name === 'AbortError') throw e;
                  debugWarn(`Error fetching valve open for device ${deviceId}:`, e);
                  return 0;
                }
              });
              const valveOpenValues = await Promise.all(valveOpenPromises);
              if (!canApply()) return;
              const validValveValues = valveOpenValues.filter(val => !isNaN(val) && val >= 0 && val <= 100);
              const averageValveOpen = validValveValues.length > 0
                ? validValveValues.reduce((sum, val) => sum + val, 0) / validValveValues.length
                : 0;
              debugLog('Average valve open from all devices:', averageValveOpen);
              if (canApply()) {
                setCurrentValveOpen({
                  value: averageValveOpen,
                  source: 'average',
                  deviceCount: validValveValues.length
                });
              }
            } else {
              debugWarn('No related devices found for valve open calculation');
              if (canApply()) {
                setCurrentValveOpen({ value: 0, source: 'average', deviceCount: 0 });
              }
            }
          }
        }
      } else if (operationalMode === 10) {
        // Use external temperature device for temperature only, average for target temperature and valve open
        if (extTempDevice) {
          let latestData;
          try {
            latestData = await fetchReportingLatestRow(extTempDevice, { signal });
          } catch (e) {
            if (e?.name === 'AbortError') return;
            throw e;
          }
          if (!canApply()) return;
          if (latestData) {
            const temperature = latestData.sensor_temperature;
            debugLog('External temperature raw value:', temperature);
            if (temperature !== undefined && temperature !== null) {
              const numTemp = Number(temperature);
              if (!isNaN(numTemp) && numTemp > -50 && numTemp < 100 && canApply()) {
                setCurrentTemperature({
                  value: numTemp,
                  source: 'external',
                  deviceId: extTempDevice
                });
              } else if (!isNaN(numTemp)) {
                debugWarn('External temperature out of reasonable range:', numTemp);
              }
            }
          }
        }
        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices.map(device => {
            if (typeof device.id === 'object' && device.id?.id) {
              return device.id.id;
            }
            return device.id;
          }).filter(id => id);
          if (deviceIds.length > 0) {
            const perDeviceRows = await Promise.all(
              deviceIds.map(async (deviceId) => {
                try {
                  return await fetchReportingLatestRow(deviceId, { signal });
                } catch (e) {
                  if (e?.name === 'AbortError') throw e;
                  debugWarn(`Error fetching telemetry for device ${deviceId}:`, e);
                  return null;
                }
              })
            );
            if (!canApply()) return;
            const targetTemperatures = perDeviceRows.map((row) => row?.target_temperature ?? null);
            const valveOpens = perDeviceRows.map((row) => row?.percent_valve_open ?? null);
            const validTargetTemperatures = targetTemperatures
              .filter(temp => temp !== null && temp !== undefined)
              .map(temp => Number(temp))
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100);
            const validValveOpens = valveOpens
              .filter(valve => valve !== null && valve !== undefined)
              .map(valve => Number(valve))
              .filter(valve => !isNaN(valve) && valve >= 0 && valve <= 100);
            if (validTargetTemperatures.length > 0 && canApply()) {
              const avgTargetTemp = validTargetTemperatures.reduce((sum, temp) => sum + temp, 0) / validTargetTemperatures.length;
              setCurrentTargetTemperature({
                value: avgTargetTemp,
                source: 'average',
                deviceCount: validTargetTemperatures.length
              });
            }
            if (validValveOpens.length > 0 && canApply()) {
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
            const perDeviceRows = await Promise.all(
              deviceIds.map(async (deviceId) => {
                try {
                  return await fetchReportingLatestRow(deviceId, { signal });
                } catch (e) {
                  if (e?.name === 'AbortError') throw e;
                  debugWarn(`Error fetching temperature row for device ${deviceId}:`, e);
                  return null;
                }
              })
            );
            if (!canApply()) return;
            const sensorResults = perDeviceRows.map((row) =>
              row ? { sensor_temperature: row.sensor_temperature } : { sensor_temperature: null }
            );
            const targetResults = perDeviceRows.map((row) =>
              row ? { targetTemperature: row.target_temperature } : { targetTemperature: null }
            );
            const valveOpenResults = perDeviceRows.map((row) =>
              row ? { valveOpen: row.percent_valve_open } : { valveOpen: null }
            );
            debugLog('Raw sensor temperature data from API:', sensorResults);
            debugLog('Raw target temperature data from API:', targetResults);
            debugLog('Raw valve open data from API:', valveOpenResults);
            
            const validTemperatures = sensorResults
              .filter(data => data.sensor_temperature !== null && data.sensor_temperature !== undefined)
              .map(data => {
                const numTemp = Number(data.sensor_temperature);
                debugLog('Converting temperature:', data.sensor_temperature, 'to number:', numTemp);
                return numTemp;
              })
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100); // Reasonable temperature range
            
            const validTargetTemperatures = targetResults
              .filter(data => data.targetTemperature !== null && data.targetTemperature !== undefined)
              .map(data => {
                const numTemp = Number(data.targetTemperature);
                debugLog('Converting target temperature:', data.targetTemperature, 'to number:', numTemp);
                return numTemp;
              })
              .filter(temp => !isNaN(temp) && temp > -50 && temp < 100); // Reasonable temperature range

            const validValveOpen = valveOpenResults
              .filter(data => data.valveOpen !== null && data.valveOpen !== undefined)
              .map(data => {
                const numValveOpen = Number(data.valveOpen);
                debugLog('Converting valve open:', data.valveOpen, 'to number:', numValveOpen);
                return numValveOpen;
              })
              .filter(valve => !isNaN(valve) && valve >= 0 && valve <= 100); // Reasonable valve range

            debugLog('Valid temperatures after filtering:', validTemperatures);
            debugLog('Valid target temperatures after filtering:', validTargetTemperatures);
            debugLog('Valid valve open after filtering:', validValveOpen);
            
            if (validTemperatures.length > 0 && canApply()) {
              const averageTemp = validTemperatures.reduce((sum, temp) => sum + temp, 0) / validTemperatures.length;
              debugLog('Calculated average temperature:', averageTemp);
              
              let avgTargetTemp = null;
              if (validTargetTemperatures.length > 0) {
                avgTargetTemp = validTargetTemperatures.reduce((sum, temp) => sum + temp, 0) / validTargetTemperatures.length;
                debugLog('Calculated AVG target temperature:', avgTargetTemp);
              }
              
              let avgValveOpen = null;
              if (validValveOpen.length > 0) {
                avgValveOpen = validValveOpen.reduce((sum, valve) => sum + valve, 0) / validValveOpen.length;
                debugLog('Calculated AVG valve open:', avgValveOpen);
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
      if (error?.name === 'AbortError') return;
      console.error('Error fetching temperature:', error);
    } finally {
      if (canApply()) setLoadingTemperature(false);
    }
  };

  const fetchTemperatureHistory = async (node, timeRange = null, loadGen, historySignal) => {
    if (!node || !session?.token) return;
    const canApplyHist = () =>
      loadGen === undefined || loadGen === roomLoadGenerationRef.current;
    
    try {
      if (canApplyHist()) {
        setLoadingTemperatureHistory(true);
        setRoomTimeseries([]);
      }
      
      const operationalMode = node.data?.operationalMode || node.operationalMode;
      const extTempDevice = node.data?.extTempDevice || node.extTempDevice;
      
      debugLog('Fetching temperature history for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      
      // Calculate time range based on selected time range or provided timeRange parameter
      const endTime = Date.now();
      const timeRangeToUse = timeRange || selectedTimeRange;
      const startTime = getTimeRangeInMs(timeRangeToUse);
      
      debugLog('Fetching temperature history for operationalMode:', operationalMode, 'extTempDevice:', extTempDevice);
      debugLog('Time range - Start:', new Date(startTime).toISOString(), 'End:', new Date(endTime).toISOString());
      debugLog('Time range in days:', (endTime - startTime) / (24 * 60 * 60 * 1000));
      debugLog('Using time range:', timeRangeToUse);
      
      // Convert timestamps to ISO date strings for the reporting API
      const startDate = new Date(startTime).toISOString().split('T')[0];
      // Use current date as endDate to ensure we get data up to today
      const endDate = new Date().toISOString().split('T')[0];
      
      debugLog('API query parameters:', {
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
                },
                signal: historySignal
              }
            );
          
          if (response.ok) {
            const data = await response.json();
            debugLog('External temperature history API response:', data);
            if (data.success && data.data && data.data.length > 0) {
              debugLog('External temperature history raw data sample:', data.data.slice(0, 3));
              debugLog('External temperature history raw data sample (last 3):', data.data.slice(-3));
              debugLog('Total data points received:', data.data.length);
              
              // Process temperature history
              // First sort the raw data by bucket_10m to ensure chronological order
              const sortedData = data.data.sort((a, b) => new Date(a.bucket_10m) - new Date(b.bucket_10m));
              debugLog('Raw data time range:', {
                first: sortedData[0]?.bucket_10m,
                last: sortedData[sortedData.length - 1]?.bucket_10m
              });
              
              // Filter data to only include data up to current time
              const currentTime = new Date();
              const filteredData = sortedData.filter(item => {
                const itemTime = new Date(item.bucket_10m);
                return itemTime <= currentTime;
              });
              debugLog('Filtered data time range:', {
                first: filteredData[0]?.bucket_10m,
                last: filteredData[filteredData.length - 1]?.bucket_10m,
                currentTime: currentTime.toISOString()
              });
              
              const historyData = filteredData
                .filter(item => item.sensor_temperature !== null && item.sensor_temperature !== undefined)
                .map(item => ({
                  time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                  timestamp: new Date(item.bucket_10m).getTime(),
                  sensor_temperature: Number(item.sensor_temperature)
                }))
                .filter(item => !isNaN(item.sensor_temperature) && item.sensor_temperature > -50 && item.sensor_temperature < 100);
              
              // Process target temperature history
              const targetHistoryData = filteredData
                .filter(item => item.target_temperature !== null && item.target_temperature !== undefined)
                .map(item => ({
                  time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                  timestamp: new Date(item.bucket_10m).getTime(),
                  target_temperature: Number(item.target_temperature)
                }))
                .filter(item => !isNaN(item.target_temperature) && item.target_temperature > -50 && item.target_temperature < 100);
              
              // For operationalMode 2, calculate average valve open from all devices
              // instead of using external device valve open
              const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
              let valveOpenHistoryData = [];
              
              debugLog('DEBUG: relatedDevices for valve open history:', relatedDevices);
              debugLog('DEBUG: relatedDevices length for history:', relatedDevices.length);
              if (relatedDevices.length > 0) {
                debugLog('Calculating average valve open history from all devices for operationalMode 2');
                
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
                
                debugLog('DEBUG: extracted device IDs for history:', deviceIds);
                
                // Fetch valve open data from all devices
                const allDeviceValveData = await Promise.all(
                  deviceIds.map(async (deviceId) => {
                    try {
                      const response = await fetch(
                        `/api/reporting-proxy?entity_id=${deviceId}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                        {
                          headers: {
                            'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                          },
                          signal: historySignal
                        }
                      );
                      
                      if (response.ok) {
                        const data = await response.json();
                        if (data.success && data.data && data.data.length > 0) {
                          return data.data.map(item => ({
                            timestamp: new Date(item.bucket_10m).getTime(),
                            percent_valve_open:
                              item.percent_valve_open !== null && item.percent_valve_open !== undefined
                                ? Number(item.percent_valve_open)
                                : 0
                          }));
                        }
                      }
                      return [];
                    } catch (error) {
                      debugWarn(`Error fetching valve open history for device ${deviceId}:`, error);
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
                  if (
                    itemTime <= currentTime &&
                    !isNaN(item.percent_valve_open) &&
                    item.percent_valve_open >= 0 &&
                    item.percent_valve_open <= 100
                  ) {
                    if (!valveOpenTimestampMap.has(item.timestamp)) {
                      valveOpenTimestampMap.set(item.timestamp, []);
                    }
                    valveOpenTimestampMap.get(item.timestamp).push(item.percent_valve_open);
                  }
                });
                
                // Calculate average for each timestamp
                valveOpenHistoryData = Array.from(valveOpenTimestampMap.entries())
                  .map(([timestamp, valves]) => ({
                    time: new Date(timestamp).toLocaleString('de-DE'),
                    timestamp: timestamp,
                    percent_valve_open: valves.reduce((sum, valve) => sum + valve, 0) / valves.length
                  }))
                  .sort((a, b) => a.timestamp - b.timestamp);
              } else {
                debugWarn('No related devices found for valve open history calculation');
                valveOpenHistoryData = [];
              }
              
              debugLog('External temperature history:', historyData);
              debugLog('External target temperature history:', targetHistoryData);
              debugLog('External valve open history:', valveOpenHistoryData);
              debugLog('Temperature data points count:', historyData.length);
              debugLog('Target temperature data points count:', targetHistoryData.length);
              debugLog('Valve open data points count:', valveOpenHistoryData.length);
              
              // Debug: Show time range of processed data
              if (historyData.length > 0) {
                debugLog('Processed temperature data time range:', {
                  first: new Date(historyData[0].timestamp).toLocaleString('de-DE'),
                  last: new Date(historyData[historyData.length - 1].timestamp).toLocaleString('de-DE'),
                  current: new Date().toLocaleString('de-DE')
                });
              }
              
              if (!canApplyHist()) return;
              setRoomTimeseries(
                mergeRoomTimeseriesPoints(historyData, targetHistoryData, valveOpenHistoryData)
              );
            }
          }
        }
      } else if (operationalMode === 10) {
        let sensorHist = [];
        let targetHist = [];
        let valveHist = [];

        if (extTempDevice) {
          const response = await fetch(
            `/api/reporting-proxy?entity_id=${extTempDevice}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
            {
              headers: {
                Authorization: `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
              },
              signal: historySignal
            }
          );

          if (response.ok) {
            const data = await response.json();
            if (data.success && data.data && data.data.length > 0) {
              const sortedData = data.data.sort((a, b) => new Date(a.bucket_10m) - new Date(b.bucket_10m));
              const currentTime = new Date();
              const filteredData = sortedData.filter((item) => {
                const itemTime = new Date(item.bucket_10m);
                return itemTime <= currentTime;
              });

              sensorHist = filteredData
                .filter((item) => item.sensor_temperature !== null && item.sensor_temperature !== undefined)
                .map((item) => ({
                  time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                  timestamp: new Date(item.bucket_10m).getTime(),
                  sensor_temperature: Number(item.sensor_temperature)
                }))
                .filter(
                  (item) =>
                    !isNaN(item.sensor_temperature) &&
                    item.sensor_temperature > -50 &&
                    item.sensor_temperature < 100
                );

              debugLog('External temperature history:', sensorHist);
              debugLog('Temperature data points count:', sensorHist.length);
            }
          }
        }

        const relatedDevices = node.relatedDevices || node.data?.relatedDevices || [];
        if (relatedDevices.length > 0) {
          const deviceIds = relatedDevices
            .map((device) => {
              if (typeof device.id === 'object' && device.id?.id) {
                return device.id.id;
              }
              return device.id;
            })
            .filter((id) => id);

          if (deviceIds.length > 0) {
            debugLog('Fetching target temperature and valve open data for', deviceIds.length, 'devices');

            const devicePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    },
                    signal: historySignal
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return data.data;
                  }
                }
              } catch (error) {
                debugWarn(`Error fetching data for device ${deviceId}:`, error);
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
                target_temperature: Number(item.target_temperature)
              }))
              .filter(item => !isNaN(item.target_temperature) && item.target_temperature > -50 && item.target_temperature < 100)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            // Process valve open data
            const valveOpenHistoryData = filteredDeviceData
              .map(item => ({
                time: new Date(item.bucket_10m).toLocaleString('de-DE'),
                timestamp: new Date(item.bucket_10m).getTime(),
                percent_valve_open:
                  item.percent_valve_open !== null && item.percent_valve_open !== undefined
                    ? Number(item.percent_valve_open)
                    : 0 // Use 0% when valve open data is not available
              }))
              .filter(item => !isNaN(item.percent_valve_open) && item.percent_valve_open >= 0 && item.percent_valve_open <= 100)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            debugLog('AVG target temperature history:', targetHistoryData);
            debugLog('AVG valve open history:', valveOpenHistoryData);
            targetHist = targetHistoryData;
            valveHist = valveOpenHistoryData;
          }
        }
        if (!canApplyHist()) return;
        setRoomTimeseries(mergeRoomTimeseriesPoints(sensorHist, targetHist, valveHist));
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
            debugLog('Fetching temperature, target temperature and valve open data for', deviceIds.length, 'devices');
            
            // Fetch data for all related devices
            const devicePromises = deviceIds.map(async (deviceId) => {
              try {
                const response = await fetch(
                  `/api/reporting-proxy?entity_id=${deviceId}&start_date=${startDate}&limit=2000&key=QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`,
                  {
                    headers: {
                      'Authorization': `Bearer QbyfQaiKCaedFdPJbPzTcXD7EkNJHTgotB8QPXD`
                    },
                    signal: historySignal
                  }
                );
                
                if (response.ok) {
                  const data = await response.json();
                  if (data.success && data.data && data.data.length > 0) {
                    return data.data;
                  }
                }
              } catch (error) {
                debugWarn(`Error fetching data for device ${deviceId}:`, error);
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
                sensor_temperature: temps.reduce((sum, temp) => sum + temp, 0) / temps.length
              }))
              .sort((a, b) => a.timestamp - b.timestamp);
            
            const targetHistoryData = Array.from(targetTimestampMap.entries())
              .map(([timestamp, temps]) => ({
                time: new Date(timestamp).toLocaleString('de-DE'),
                timestamp: timestamp,
                target_temperature: temps.length > 0 ? temps.reduce((sum, temp) => sum + temp, 0) / temps.length : null
              }))
              .filter(item => item.target_temperature !== null)
              .sort((a, b) => a.timestamp - b.timestamp);

            const valveOpenHistoryData = Array.from(valveOpenTimestampMap.entries())
              .map(([timestamp, valves]) => ({
                time: new Date(timestamp).toLocaleString('de-DE'),
                timestamp: timestamp,
                percent_valve_open: valves.reduce((sum, valve) => sum + valve, 0) / valves.length
              }))
              .filter(item => item.percent_valve_open !== null)
              .sort((a, b) => a.timestamp - b.timestamp);
            
            debugLog('Average temperature history:', historyData);
            debugLog('AVG target temperature history:', targetHistoryData);
            debugLog('AVG valve open history:', valveOpenHistoryData);
            debugLog('Temperature data points count:', historyData.length);
            debugLog('Target temperature data points count:', targetHistoryData.length);
            debugLog('Valve open data points count:', valveOpenHistoryData.length);
            debugLog('First temperature data point:', historyData[0]);
            debugLog('Last temperature data point:', historyData[historyData.length - 1]);
            if (!canApplyHist()) return;
            setRoomTimeseries(
              mergeRoomTimeseriesPoints(historyData, targetHistoryData, valveOpenHistoryData)
            );
          }
        }
      }
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Error fetching temperature history:', error);
    } finally {
      if (canApplyHist()) setLoadingTemperatureHistory(false);
    }
  };

  // Function to fetch weather data for Gelnhausen
  const fetchWeatherData = useCallback(async () => {
    try {
      setLoadingWeather(true);
      // Using OpenWeatherMap API for Gelnhausen, Germany
      const response = await fetch(
        `https://api.openweathermap.org/data/2.5/weather?q=Gelnhausen,DE&appid=${process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY}&units=metric`
      );
      
      if (response.ok) {
        const data = await response.json();
        setWeatherData({
          temperature: data.main.temp,
          description: data.weather[0].description,
          city: data.name
        });
      } else {
        console.error('Weather API error:', response.status);
        setWeatherData({
          temperature: null,
          description: 'API Fehler',
          city: 'Gelnhausen'
        });
      }
    } catch (error) {
      console.error('Error fetching weather data:', error);
      setWeatherData({
        temperature: null,
        description: 'Verbindungsfehler',
        city: 'Gelnhausen'
      });
    } finally {
      setLoadingWeather(false);
    }
  }, []);

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

      debugLog('Fetching telemetry for device IDs:', deviceIds);

      // Define the attributes we want to fetch (pir/light: WS202 u. a.)
      const attributes = ['sensorTemperature', 'targetTemperature', 'PercentValveOpen', 'batteryVoltage', 'signalQuality', 'hall_sensor_state', 'pir', 'light'];
      
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
            
            // Hall / PIR / Licht: aktuelle Werte aus Details-API (Timeseries-Keys inkl. pir, light)
            const detailKeys = ['hall_sensor_state', 'pir', 'light'];
            if (detailKeys.some((k) => attributes.includes(k))) {
              try {
                const detailsResponse = await fetch(
                  `/api/thingsboard/devices/${deviceId}/details`,
                  {
                    headers: {
                      'Authorization': `Bearer ${session.token}`
                    }
                  }
                );

                if (detailsResponse.ok) {
                  const detailsData = await detailsResponse.json();
                  const current = detailsData.success ? detailsData.data?.telemetry?.current : null;
                  if (current && typeof current === 'object') {
                    detailKeys.forEach((key) => {
                      if (!attributes.includes(key)) return;
                      const raw = current[key];
                      if (raw !== undefined && raw !== null) {
                        telemetry[key] = raw;
                        debugLog(`${key} from details API for device ${deviceId}:`, raw);
                      }
                    });
                  }
                }
              } catch (error) {
                debugWarn(`Error fetching telemetry from details API for device ${deviceId}:`, error);
              }
            }

            // Fetch other attributes using the aggregated API
            for (const attribute of attributes) {
              if (detailKeys.includes(attribute) && telemetry[attribute] !== undefined) {
                continue;
              }

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
                        debugLog(`SignalQuality for device ${deviceId}:`, {
                          rawValue: latestValue.value,
                          type: typeof latestValue.value,
                          fullData: latestValue
                        });
                      }
                    }
                  } else {
                    debugLog(`No data found for ${attribute} on device ${deviceId}`);
                  }
                } else {
                  debugLog(`API error for ${attribute} on device ${deviceId}:`, response.status, response.statusText);
                }
              } catch (error) {
                debugWarn(`Error fetching ${attribute} for device ${deviceId}:`, error);
              }
            }
            
            debugLog('Telemetry data for device', deviceId, ':', telemetry);

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
            debugWarn(`Error fetching telemetry for device ${deviceId}:`, error);
            return device;
          }
        })
      );

      debugLog('Devices with telemetry:', devicesWithTelemetry);
      return devicesWithTelemetry;
    } catch (error) {
      console.error('Error fetching telemetry data:', error);
      return devices;
    }
  }, [session?.token]);

  const fetchTelemetryHistory = useCallback(async (deviceId, attribute, timeRange = '7d', hallSensorAsTable = false) => {
    if (!deviceId || !attribute || !session?.token) {
      return [];
    }

    try {
      setLoadingTelemetryChart(true);
      const endTime = Date.now();
      const startTime = getTimeRangeInMs(timeRange);

      // Use timeseries endpoint to get real values (not aggregated)
      const response = await fetch(
        `/api/thingsboard/devices/${deviceId}/timeseries?attribute=${attribute}&startTs=${startTime}&endTs=${endTime}&limit=1000`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        }
      );

      if (response.ok) {
        const data = await response.json();
        if (data.success && data.data?.telemetry?.values && data.data.telemetry.values.length > 0) {
          let debugCount = 0;
          const chartData = data.data.telemetry.values.map(point => {
            let value = point.value;
            
            // PIR/Licht: Rohwerte für Tabelle (WS202: normal/triggert, light/dark)
            if (attribute === 'pir' || attribute === 'light') {
              return {
                timestamp: point.timestamp,
                time: new Date(point.timestamp).toLocaleString('de-DE'),
                rawValue: point.value,
                displayLabel: attribute === 'pir'
                  ? formatPirTelemetryLabel(point.value)
                  : formatLightTelemetryLabel(point.value),
                value: point.value
              };
            }

            // WSCI Fenster: Rohwerte für Tabelle (LOW/HIGH)
            if (attribute === 'hall_sensor_state' && hallSensorAsTable) {
              return {
                timestamp: point.timestamp,
                time: new Date(point.timestamp).toLocaleString('de-DE'),
                rawValue: point.value,
                displayLabel: formatHallSensorTelemetryLabel(point.value),
                value: point.value
              };
            }

            // Hall: Text zu 0/1 für Diagramm
            if (attribute === 'hall_sensor_state') {
              const valueStr = String(value).toUpperCase().trim();
              if (debugCount < 3) {
                debugLog('hall_sensor_state conversion:', { value, valueStr });
                debugCount++;
              }
              if (valueStr === 'HIGH' || valueStr === 'ON' || valueStr === '1' || valueStr === 'TRUE' || value === 1 || value === true) {
                value = 1;
              } else if (valueStr === 'LOW' || valueStr === 'OFF' || valueStr === '0' || valueStr === 'FALSE' || value === 0 || value === false) {
                value = 0;
              } else {
                const numValue = Number(value);
                if (!isNaN(numValue)) {
                  value = numValue > 0 ? 1 : 0;
                } else {
                  value = 0;
                }
              }
            }

            return {
              timestamp: point.timestamp,
              value: value,
              time: new Date(point.timestamp).toLocaleString('de-DE')
            };
          });
          
          if (attribute === 'hall_sensor_state' && chartData.length > 0 && !hallSensorAsTable) {
            debugLog(`${attribute} converted data sample:`, chartData.slice(0, 5));
            debugLog(`${attribute} value range:`, {
              min: Math.min(...chartData.map(d => d.value)),
              max: Math.max(...chartData.map(d => d.value)),
              uniqueValues: [...new Set(chartData.map(d => d.value))]
            });
          }
          if ((attribute === 'pir' || attribute === 'light' || (attribute === 'hall_sensor_state' && hallSensorAsTable)) && chartData.length > 0) {
            debugLog(`${attribute} table rows sample:`, chartData.slice(0, 5));
          }
          
          setTelemetryChartData(chartData);
          return chartData;
        }
      }
      setTelemetryChartData([]);
      return [];
    } catch (error) {
      console.error('Error fetching telemetry history:', error);
      setTelemetryChartData([]);
      return [];
    } finally {
      setLoadingTelemetryChart(false);
    }
  }, [session?.token]);

  const handleTelemetryValueClick = useCallback(async (device, attribute) => {
    const deviceId = typeof device.id === 'object' && device.id?.id ? device.id.id : device.id;
    if (!deviceId) return;

    setSelectedTelemetryDevice(device);
    setSelectedTelemetryAttribute(attribute);
    setSelectedChartTimeRange('7d'); // Reset to default
    setShowTelemetryChartModal(true);
    const hallSensorAsTable = attribute === 'hall_sensor_state' && deviceIsWsci(device);
    await fetchTelemetryHistory(deviceId, attribute, '7d', hallSensorAsTable);
  }, [fetchTelemetryHistory]);

  const handleChartTimeRangeChange = useCallback(async (timeRange) => {
    setSelectedChartTimeRange(timeRange);
    if (selectedTelemetryDevice && selectedTelemetryAttribute) {
      const deviceId = typeof selectedTelemetryDevice.id === 'object' && selectedTelemetryDevice.id?.id 
        ? selectedTelemetryDevice.id.id 
        : selectedTelemetryDevice.id;
      if (deviceId) {
        const hallSensorAsTable =
          selectedTelemetryAttribute === 'hall_sensor_state' && deviceIsWsci(selectedTelemetryDevice);
        await fetchTelemetryHistory(deviceId, selectedTelemetryAttribute, timeRange, hallSensorAsTable);
      }
    }
  }, [selectedTelemetryDevice, selectedTelemetryAttribute, fetchTelemetryHistory]);

  const fetchDevices = useCallback(async (nodeId) => {
    if (!nodeId) {
      debugLog('fetchDevices: Missing nodeId');
      return { assigned: [] };
    }
    
    try {
      setLoadingDevices(true);
      debugLog('fetchDevices: Starting to fetch devices for node:', nodeId);
      
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
      
      const node = findNodeInTree(visibleTreeData, nodeId);
      debugLog('Found node:', node);
      debugLog('Node relatedDevices:', node?.relatedDevices);
      
      let devices = [];
      if (node && node.relatedDevices) {
        devices = node.relatedDevices;
        debugLog('Related devices from node:', devices);
      } else {
        debugLog('No relatedDevices found in node');
      }
      
      // Also try to get additional device info from reporting API if we have devices
      if (devices.length > 0) {
        debugLog('Fetching additional telemetry data for devices...');
        const devicesWithTelemetry = await fetchTelemetryForDevices(devices);
        debugLog('Devices with telemetry:', devicesWithTelemetry);
        return { assigned: devicesWithTelemetry };
      }
      
      debugLog('Returning devices without telemetry:', devices);
      return { assigned: devices };
    } catch (err) {
      console.error('Error fetching devices:', err);
      return { assigned: [] };
    } finally {
      setLoadingDevices(false);
    }
  }, [visibleTreeData, fetchTelemetryForDevices]);

  const handleNodeSelect = (node) => {
    debugLog('Node selected:', node);
    debugLog('Node data:', node.data);
    debugLog('Node operationalMode:', node.operationalMode);
    debugLog('Node hasDevices:', node.hasDevices);
    debugLog('=== hasDevices VALUE ===', node.hasDevices, '=== TYPE ===', typeof node.hasDevices);

    roomDataAbortRef.current?.abort();
    roomDataAbortRef.current = new AbortController();
    const nodeFetchSignal = roomDataAbortRef.current.signal;
    const loadGen = ++roomLoadGenerationRef.current;
    
    // Set loading state and clear previous data
    setLoadingNodeData(true);
    setSelectedNode(null);
    setNodeDetails(null);
    
    // Use the full node object, not just node.data
    setSelectedNode(node);
    
    // Set active tab based on hasDevices - check both node.hasDevices and node.data.hasDevices
    const hasDevices = node.hasDevices !== undefined ? node.hasDevices : (node.data?.hasDevices !== undefined ? node.data.hasDevices : false);
    debugLog('Final hasDevices value:', hasDevices);
    
    if (!hasDevices) {
      debugLog('Setting activeTab to "empty" (Übersicht) for node without devices');
      setActiveTab('empty');  // Übersicht für Nodes ohne Geräte
    } else {
      debugLog('Setting activeTab to "overview" (Verlauf) for node with devices');
      setActiveTab('overview');  // Verlauf für Nodes mit Geräten
    }
    
    fetchNodeDetails(node.id, loadGen, nodeFetchSignal);
    fetchTemperature(node, loadGen, nodeFetchSignal);
    fetchTemperatureHistory(node, null, loadGen, nodeFetchSignal);
    
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
    const schedulerPlanPIRValue = node.data?.schedulerPlanPIR;
    if (schedulerPlanPIRValue) {
      try {
        const planArrayPIR = JSON.parse(schedulerPlanPIRValue);
        setOriginalSchedulerPlanPIR(Array.isArray(planArrayPIR) ? planArrayPIR : []);
      } catch (error) {
        console.error('Error parsing schedulerPlanPIR in handleNodeSelect:', error);
        setOriginalSchedulerPlanPIR([]);
      }
    } else {
      setOriginalSchedulerPlanPIR([]);
    }
    
    // Settings values werden jetzt immer direkt aus ThingsBoard geladen (in fetchNodeDetails)
    // Keine Initialisierung aus node.data mehr, da diese aus dem tree Feld kommen könnten
    
    // Clear loading state after a short delay to ensure data is loaded
    setTimeout(() => {
      setLoadingNodeData(false);
    }, 100);
    
    // Load devices immediately from the node's relatedDevices
    // Check both node.relatedDevices and node.data.relatedDevices
    const relatedDevices = node.relatedDevices || node.data?.relatedDevices;
    
    if (relatedDevices && relatedDevices.length > 0) {
      debugLog('Loading devices from node.relatedDevices:', relatedDevices);
      setDevices(relatedDevices);
      // Fetch telemetry data for the devices
      fetchTelemetryForDevices(relatedDevices).then(devicesWithTelemetry => {
        setDevices(devicesWithTelemetry);
      });
    } else {
      debugLog('No relatedDevices in selected node, fetching from API...');
      fetchDevices(node.id).then(result => {
        if (result && result.assigned) {
          setDevices(result.assigned);
        }
      });
    }
  };

  // Function to fetch telemetry data for a node
  const fetchNodeTelemetry = async (node, loadGen, signal) => {
    const stale = () =>
      loadGen !== undefined && loadGen !== roomLoadGenerationRef.current;

    const fetchAssetRunStatus = async () => {
      if (!node?.id) return null;
      try {
        const assetResponse = await fetch(`/api/config/assets/${node.id}`, { signal });
        if (assetResponse.ok) {
          const assetData = await assetResponse.json();
          return assetData.attributes?.runStatus || null;
        }
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        debugWarn(`Error fetching runStatus for node ${node.id}:`, error);
      }
      return null;
    };

    if (!node) {
      return {
        currentTemp: null,
        targetTemp: null,
        valvePosition: null,
        batteryVoltage: null,
        rssi: null,
        runStatus: null
      };
    }

    if (!node.relatedDevices || node.relatedDevices.length === 0) {
      const runStatus = await fetchAssetRunStatus();
      return {
        currentTemp: null,
        targetTemp: null,
        valvePosition: null,
        batteryVoltage: null,
        rssi: null,
        runStatus: runStatus || node.runStatus || null
      };
    }

    try {
      const deviceIds = node.relatedDevices.map(device => {
        if (typeof device.id === 'object' && device.id?.id) {
          return device.id.id;
        }
        return device.id;
      }).filter(id => id);

      if (deviceIds.length === 0) {
        const runStatus = await fetchAssetRunStatus();
        return {
          currentTemp: null,
          targetTemp: null,
          valvePosition: null,
          batteryVoltage: null,
          rssi: null,
          runStatus: runStatus || node.runStatus || null
        };
      }

      // runStatus (Asset) und Reporting-Zeilen pro Gerät parallel (reporting-proxy)
      const devicePromises = deviceIds.map(async (deviceId) => {
        try {
          const latestData = await fetchReportingLatestRow(deviceId, { signal });
          if (latestData) {
            return {
              sensorTemperature: latestData.sensor_temperature,
              targetTemperature: latestData.target_temperature,
              valvePosition: latestData.percent_valve_open,
              batteryVoltage: latestData.battery_voltage,
              rssi: latestData.rssi
            };
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          debugWarn(`Error fetching telemetry for device ${deviceId}:`, error);
        }
        return { sensorTemperature: null, targetTemperature: null, valvePosition: null, batteryVoltage: null, rssi: null };
      });

      const [runStatus, deviceResults] = await Promise.all([
        fetchAssetRunStatus(),
        Promise.all(devicePromises)
      ]);
      if (stale()) {
        return {
          currentTemp: null,
          targetTemp: null,
          valvePosition: null,
          batteryVoltage: null,
          rssi: null,
          runStatus: runStatus || node.runStatus || null
        };
      }
      
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

      if (stale()) {
        return {
          currentTemp: null,
          targetTemp: null,
          valvePosition: null,
          batteryVoltage: null,
          rssi: null,
          runStatus: runStatus || node.runStatus || null
        };
      }
      return {
        currentTemp: avgCurrentTemp,
        targetTemp: avgTargetTemp,
        valvePosition: avgValvePosition,
        batteryVoltage: avgBatteryVoltage,
        rssi: avgRssi,
        runStatus: runStatus || node.runStatus || null
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return {
          currentTemp: null,
          targetTemp: null,
          valvePosition: null,
          batteryVoltage: null,
          rssi: null,
          runStatus: node.runStatus || null
        };
      }
      console.error('Error fetching node telemetry:', error);
      // Try to fetch runStatus even on error
      let runStatus = null;
      if (node.id) {
        try {
          const assetResponse = await fetch(`/api/config/assets/${node.id}`);
          if (assetResponse.ok) {
            const assetData = await assetResponse.json();
            runStatus = assetData.attributes?.runStatus || null;
          }
        } catch (fetchError) {
          debugWarn(`Error fetching runStatus for node ${node.id}:`, fetchError);
        }
      }
      return { currentTemp: null, targetTemp: null, valvePosition: null, batteryVoltage: null, rssi: null, runStatus: runStatus || node.runStatus || null };
    }
  };

  // Function to fetch telemetry for all subordinate nodes
  // options.policy: 'prefer-cache' = innerhalb TTL nur Cache; sonst Netzwerk. 'network' = immer laden (z. B. Intervall).
  // options.silent: true = Ladezustand nicht anfassen (Hintergrund-Refresh).
  const fetchSubordinateTelemetry = useCallback(
    async (subordinates, loadGen, signal, options = {}) => {
      const { parentNodeId, customerId, policy = 'network', silent = false } = options;

      if (!subordinates || subordinates.length === 0) {
        setSubordinateTelemetry({});
        return;
      }

      if (
        policy === 'prefer-cache' &&
        parentNodeId &&
        customerId
      ) {
        const cached = getOverviewTelemetryCached(parentNodeId, customerId);
        if (cached) {
          debugLog('Übersicht: Telemetrie aus Cache (≤5 min)', parentNodeId);
          setSubordinateTelemetry({ ...cached });
          if (!silent) setLoadingSubordinateTelemetry(false);
          return;
        }
      }

      if (!silent) {
        setSubordinateTelemetry({});
        setLoadingSubordinateTelemetry(true);
      }
      try {
        const telemetryPromises = subordinates.map(async (node) => {
          const telemetry = await fetchNodeTelemetry(node, loadGen, signal);
          return { nodeId: node.id, telemetry };
        });

        const results = await Promise.all(telemetryPromises);
        if (loadGen !== undefined && loadGen !== roomLoadGenerationRef.current) {
          return;
        }
        const telemetryMap = {};

        results.forEach(({ nodeId, telemetry }) => {
          telemetryMap[nodeId] = telemetry;
        });

        setSubordinateTelemetry(telemetryMap);
        if (parentNodeId && customerId) {
          setOverviewTelemetryCached(parentNodeId, customerId, telemetryMap);
        }
      } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Error fetching subordinate telemetry:', error);
        setSubordinateTelemetry({});
      } finally {
        if (
          !silent &&
          (loadGen === undefined || loadGen === roomLoadGenerationRef.current)
        ) {
          setLoadingSubordinateTelemetry(false);
        }
      }
    },
    []
  );

  const getTemperatureChartOptionForRender = (timeRange = null) => {
    const synchronizedData = synchronizeChartData(roomTimeseries, debugLog);
    return getTemperatureChartOption(synchronizedData, timeRange || selectedTimeRange, debugLog);
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
        debugLog('ws message: ' + event.data);
      };
      
      websocket.onopen = () => {
        debugLog('ws open');
      };
      
      websocket.onclose = () => {
        debugLog('ws close');
      };
      
      websocket.onerror = (event) => {
        debugLog('ws error: ' + event);
      };

      setWs(websocket);

      // Check connection status after 1 second
      setTimeout(() => {
        if (websocket.readyState === WebSocket.OPEN) {
          debugLog("WS Verbindung ist stabil 👍");
        } else {
          debugWarn("WS ist NICHT offen, Zustand:", websocket.readyState);
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
    // Only reload tree data if customerid actually changed, not on every render/focus
    const currentCustomerId = customerData?.customerid;
    if (currentCustomerId && currentCustomerId !== lastLoadedCustomerIdRef.current) {
      lastLoadedCustomerIdRef.current = currentCustomerId;
      fetchTreeData();
    } else if (customerData != null && !currentCustomerId) {
      setLoading(false);
    }
  }, [customerData?.customerid, customerData, fetchTreeData]);

  useEffect(() => {
    defaultEntryAppliedRef.current = false;
  }, [customerData?.customerid]);

  useEffect(() => {
    if (!visibleTreeData?.length || !customerData?.defaultEntryAssetId) return;
    const node = findFlatTreeNodeByAssetId(
      convertToTreeViewFormat(visibleTreeData),
      customerData.defaultEntryAssetId
    );
    if (!node) return;

    if (customerData.defaultEntryOverrideUser) {
      handleNodeSelect(node);
      return;
    }
    if (defaultEntryAppliedRef.current) return;
    defaultEntryAppliedRef.current = true;
    handleNodeSelect(node);
    // Absichtlich ohne handleNodeSelect in deps: nur bei Baum/Mandant/Default ändern
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    visibleTreeData,
    customerData?.defaultEntryAssetId,
    customerData?.defaultEntryOverrideUser,
    customerData?.customerid
  ]);

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
      const { subordinates } = getAllSubordinateNodes(selectedNode.id, visibleTreeData);
      if (subordinates.length > 0) {
        const gen = roomLoadGenerationRef.current;
        const signal = roomDataAbortRef.current?.signal;
        fetchSubordinateTelemetry(subordinates, gen, signal, {
          parentNodeId: selectedNode.id,
          customerId: customerData?.customerid,
          policy: 'prefer-cache',
        });
      }
    }
  }, [activeTab, selectedNode, visibleTreeData, customerData?.customerid, fetchSubordinateTelemetry]);

  // Übersicht alle 5 Minuten im Hintergrund aktualisieren (nur Tab „Übersicht“)
  useEffect(() => {
    if (activeTab !== 'empty' || !selectedNode?.id || !customerData?.customerid) return;

    const id = setInterval(() => {
      const { subordinates } = getAllSubordinateNodes(selectedNode.id, visibleTreeData);
      if (subordinates.length === 0) return;
      const gen = roomLoadGenerationRef.current;
      const signal = roomDataAbortRef.current?.signal;
      debugLog('Übersicht: periodische Aktualisierung (5 min)');
      fetchSubordinateTelemetry(subordinates, gen, signal, {
        parentNodeId: selectedNode.id,
        customerId: customerData.customerid,
        policy: 'network',
        silent: true,
      });
    }, 5 * 60 * 1000);

    return () => clearInterval(id);
  }, [
    activeTab,
    selectedNode?.id,
    visibleTreeData,
    customerData?.customerid,
    fetchSubordinateTelemetry,
  ]);

  useEffect(() => {
    const id = customerData?.customerid;
    if (id == null || id === '') return;
    const prev = overviewTelemetryLastCustomerId;
    if (prev != null && prev !== id) {
      clearOverviewTelemetryStores();
    }
    overviewTelemetryLastCustomerId = id;
  }, [customerData?.customerid]);

  // Update settings values from nodeDetails when they are loaded (direkt aus ThingsBoard)
  // Diese Werte werden immer direkt aus ThingsBoard geholt, nicht aus dem tree Feld
  useEffect(() => {
    if (activeTab === 'config' && nodeDetails?.attributes) {
      // Aktualisiere nur wenn nodeDetails geladen ist (direkt aus ThingsBoard)
      if (nodeDetails.attributes.minTemp !== undefined) {
        setOriginalMinTemp(nodeDetails.attributes.minTemp);
      }
      if (nodeDetails.attributes.maxTemp !== undefined) {
        setOriginalMaxTemp(nodeDetails.attributes.maxTemp);
      }
      if (nodeDetails.attributes.overruleMinutes !== undefined) {
        setOriginalOverruleMinutes(nodeDetails.attributes.overruleMinutes);
      }
      if (nodeDetails.attributes.windowSensor !== undefined) {
        setOriginalWindowSensor(nodeDetails.attributes.windowSensor);
      }
    }
  }, [activeTab, nodeDetails]);


  // Expand only Level 1 (first level) when tree data is loaded
  useEffect(() => {
    if (visibleTreeData && visibleTreeData.length > 0) {
      const firstLevelNodeIds = getFirstLevelNodeIds(visibleTreeData);
      debugLog('Tree data loaded, expanding Level 1:', firstLevelNodeIds);
      debugLog('Current openNodes before setting:', openNodes);
      setOpenNodes(firstLevelNodeIds);
      setForceExpand(true);
      
      // Force re-render after a short delay to ensure the tree is ready
      setTimeout(() => {
        debugLog('Setting openNodes after delay:', firstLevelNodeIds);
        setOpenNodes(firstLevelNodeIds);
        setForceExpand(true);
      }, 100);
    }
  }, [visibleTreeData]);

  // Expand path to selected node when a node is selected
  useEffect(() => {
    if (selectedNode && visibleTreeData && visibleTreeData.length > 0) {
      const pathToNode = getPathToNode(selectedNode.id, visibleTreeData);
      if (pathToNode) {
        debugLog('Selected node:', selectedNode.label);
        debugLog('Path to selected node:', pathToNode);
        setOpenNodes(pathToNode);
        setForceExpand(false); // Disable force expand, use specific path
      }
    }
  }, [selectedNode, visibleTreeData]);

  // Scroll to selected node when it changes
  useEffect(() => {
    if (selectedNode && treeScrollContainerRef.current) {
      // Wait for DOM to update after opening nodes
      const timeoutId = setTimeout(() => {
        const selectedNodeElement = treeScrollContainerRef.current?.querySelector(
          `[data-node-id="${selectedNode.id}"]`
        );
        
        if (selectedNodeElement) {
          selectedNodeElement.scrollIntoView({
            behavior: 'smooth',
            block: 'center',
            inline: 'nearest'
          });
        }
      }, 300); // Delay to allow tree to expand first

      return () => clearTimeout(timeoutId);
    }
  }, [selectedNode, openNodes]);

  // Fallback function to fetch temperatures via API (nutzt gleichen Kurz-Cache wie Unterräume)
  const fetchTemperaturesViaAPI = useCallback(async (deviceIds, options = {}) => {
    if (!deviceIds?.length) return;
    const { signal, skipCache = false } = options;

    try {
      debugLog('🌡️ Fetching temperatures via API for devices:', deviceIds);
      
      const temperaturePromises = deviceIds.map(async (deviceId) => {
        try {
          const row = await fetchReportingLatestRow(deviceId, { signal, skipCache });
          const temperature = row?.sensor_temperature;
          if (temperature !== undefined && temperature !== null) {
            setDeviceTemperatures(prev => ({
              ...prev,
              [deviceId]: {
                temperature,
                timestamp: Date.now()
              }
            }));
          }
        } catch (error) {
          if (error?.name === 'AbortError') throw error;
          debugWarn(`Error fetching temperature for device ${deviceId}:`, error);
        }
      });

      await Promise.all(temperaturePromises);
    } catch (error) {
      if (error?.name === 'AbortError') return;
      console.error('Error fetching temperatures via API:', error);
    }
  }, []);

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
        const ac = new AbortController();
        debugLog('🌡️ Fetching temperatures via API...');
        fetchTemperaturesViaAPI(deviceIds, { signal: ac.signal });
        
        const interval = setInterval(() => {
          debugLog('🔄 Auto-refreshing temperatures...');
          fetchTemperaturesViaAPI(deviceIds, { signal: ac.signal, skipCache: true });
        }, 30000);
        
        return () => {
          ac.abort();
          clearInterval(interval);
        };
      }
    }
  }, [devices, fetchTemperaturesViaAPI]);

  // Fetch weather data on component mount
  useEffect(() => {
    fetchWeatherData();
  }, [fetchWeatherData]);

  if (status === 'loading') {
    return (
      <div
        className="d-flex flex-column justify-content-center align-items-center bg-white"
        style={{ minHeight: '100vh', width: '100%' }}
      >
        <div
          className="spinner-border text-primary"
          role="status"
          style={{ width: '3rem', height: '3rem' }}
        >
          <span className="visually-hidden">Laden…</span>
        </div>
        <p className="mt-3 text-muted mb-0 small">Laden…</p>
      </div>
    );
  }

  if (!session) {
    return null; // Will redirect
  }

  return (
    <DndProvider backend={HTML5Backend}>
      {loading && (
        <div
          className="position-fixed top-0 start-0 w-100 h-100 d-flex flex-column align-items-center justify-content-center"
          style={{
            zIndex: 1080,
            backgroundColor: 'rgba(255, 255, 255, 0.92)',
            pointerEvents: 'all'
          }}
          aria-busy="true"
          aria-live="polite"
        >
          <div
            className="spinner-border text-primary"
            role="status"
            style={{ width: '3rem', height: '3rem' }}
          >
            <span className="visually-hidden">Struktur wird geladen…</span>
          </div>
          <p className="mt-3 text-muted mb-0 small">Struktur wird geladen…</p>
        </div>
      )}
      <style jsx>{`
        .responsive-cards {
          display: flex;
          flex-wrap: wrap;
          gap: 0.5rem;
          justify-content: flex-start;
        }
        
        .responsive-card {
          flex: 1 1 calc(50% - 0.5rem) !important;
          min-width: calc(50% - 0.5rem) !important;
          max-width: calc(50% - 0.5rem) !important;
        }
        
        .responsive-card .card {
          height: 200px !important;
          width: 100% !important;
          max-width: 200px !important;
          margin-left: auto !important;
          margin-right: auto !important;
        }
        
        .responsive-card .card-body {
          padding: 0.75rem;
        }
        
        /* Force smaller headings on tiles (Bootstrap h4 defaults are large) */
        .responsive-card .card-title,
        .responsive-card h4.card-title {
          font-size: 0.8rem !important;
          line-height: 1.15 !important;
          font-weight: 500 !important;
          margin-bottom: 0.4rem !important;
        }
        
        .responsive-card .display-4 {
          font-size: 1.5rem;
        }
        
        .responsive-card .text-muted {
          font-size: 0.75rem;
        }
        
        .responsive-card .spinner-border {
          width: 1rem;
          height: 1rem;
        }
        
        /* >=768px: tiles should never exceed 200px, but may shrink to fit */
        @media (min-width: 768px) {
          .responsive-card {
            flex: 1 1 200px !important;   /* preferred size */
            min-width: 0 !important;      /* allow shrinking */
            max-width: 200px !important;  /* hard cap */
          }
        }

        /* >=1400px: keep the same 200px cap */
        @media (min-width: 1400px) {
          .responsive-card {
            flex: 1 1 200px !important;
            min-width: 0 !important;
            max-width: 200px !important;
          }
        }
        
        @media (max-width: 575px) {
          .responsive-card {
            flex: 1 1 100% !important;
            min-width: 100% !important;
            max-width: 100% !important;
          }
        }

         .disabled-card {
           opacity: 0.5;
           filter: grayscale(100%);
         }
         
         /* Ensure card uses full height and is flex container */
         .heating-control-page .card {
           display: flex !important;
           flex-direction: column !important;
           overflow: hidden !important;
         }
         
         .tree-container {
           display: flex !important;
           flex-direction: column !important;
           min-height: 0 !important;
           overflow: hidden !important;
           flex: 1 1 auto !important;
           height: 0 !important; /* Force flexbox to calculate height */
         }
         
         .tree-header {
           flex-shrink: 0;
           flex-grow: 0;
         }
         
         .tree-content {
           flex: 1 1 auto !important;
           min-height: 0 !important;
           overflow-y: auto !important;
           overflow-x: hidden !important;
           height: 0 !important; /* Force flexbox to calculate height */
         }
         
         /* Smaller temperature chart header */
         .card-header h6.mb-0 {
           font-size: 1.0rem !important;
         }
         
         /* Smaller headings in subordinate node cards */
         .col-md-6 .card .card-body h6.card-title,
         .col-lg-4 .card .card-body h6.card-title {
           font-size: 0.875rem !important;
         }
         
         /* Hide tab text in responsive mode, show only icons */
         @media (max-width: 991.98px) {
           .nav-tabs .nav-link {
             padding: 0.5rem 0.75rem;
             justify-content: center;
           }
           
           .nav-tabs .nav-link .me-2 {
             margin-right: 0 !important;
           }
           
           .nav-tabs .nav-link .tab-text {
             display: none;
           }
         }
      `}</style>
      <div className="container-fluid p-0 heating-control-page" style={{ height: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'white', overflow: 'hidden' }}>
        <div className="d-flex" style={{ flex: 1, minHeight: 0, height: '100%', overflow: 'hidden' }}>
          {/* Mobile Overlay */}
          {isMobile && showTree && (
            <div 
              className="position-fixed w-100 h-100 bg-dark"
              style={{ 
                top: 0, 
                left: 0, 
                zIndex: 1035,
                opacity: 0.5,
                pointerEvents: 'auto'
              }}
              onClick={() => setShowTree(false)}
            />
          )}
          
          {/* Mobile Toggle Button - placed after overlay to ensure it's on top */}
          {isMobile && (
            <button
              className="btn btn-primary position-fixed shadow"
              type="button"
              style={{ 
                bottom: '20px', 
                left: '20px', 
                zIndex: 1060,
                borderRadius: '50%',
                width: '50px',
                height: '50px',
                boxShadow: '0 4px 8px rgba(0,0,0,0.3)',
                pointerEvents: 'auto',
                touchAction: 'manipulation',
                border: 'none'
              }}
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTree(prev => !prev);
              }}
              onTouchStart={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowTree(prev => !prev);
              }}
              title="Struktur anzeigen/verstecken"
            >
              <FontAwesomeIcon icon={faBuilding} />
            </button>
          )}
          
           {/* Linke Seite: Hierarchie */}
           <div 
             className="card bg-white text-dark"
             style={{ 
               minWidth: isMobile ? '100%' : '400px',
               width: isMobile ? '100%' : '400px',
               height: isMobile ? '100vh' : '100%',
               maxHeight: isMobile ? '100vh' : '100%',
               position: isMobile ? 'fixed' : 'relative',
               top: isMobile ? '0' : 'auto',
               left: isMobile ? '0' : 'auto',
               zIndex: isMobile ? 1040 : 'auto',
               display: isMobile ? (showTree ? 'flex' : 'none') : 'flex',
               flexDirection: 'column',
               overflow: 'hidden'
             }}
           >
                  {isMobile && (
                    <div className="card-header bg-white border-secondary py-2" style={{ flexShrink: 0 }}>
                      <div className="d-flex justify-content-end">
                        <button
                          type="button"
                          className="btn btn-sm btn-outline-secondary"
                          onClick={() => setShowTree(false)}
                          aria-label="Struktur schließen"
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      </div>
                    </div>
                  )}
            <div className="card-body tree-container" style={{ flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              {/* Suchfeld für Tree */}
              <div className="tree-header" style={{ flexShrink: 0 }}>
                <div className="d-flex gap-2">
                <div className="input-group">
                  <span className="input-group-text bg-white text-dark border-secondary">
                    <FontAwesomeIcon icon={faSearch} />
                  </span>
                  <input
                    type="text"
                    className="form-control bg-white text-dark border-secondary"
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
                            const allNodeIds = getAllNodeIds(visibleTreeData);
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
                            fetchTemperaturesViaAPI(deviceIds, { skipCache: true });
                          }}
                          title="Temperaturen aktualisieren"
                        >
                          <FontAwesomeIcon icon={faThermometerHalf} />
                        </button>
                      )}
                </div>
              </div>

              {/* Scrollbarer Bereich für Tree */}
              <div 
                ref={treeScrollContainerRef}
                className="tree-content"
                style={{
                  overflowY: 'auto',
                  overflowX: 'hidden',
                  flex: 1,
                  minHeight: 0,
                  height: 0, // Force flexbox to calculate height
                  WebkitOverflowScrolling: 'touch' // Smooth scrolling on iOS
                }}
              >
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
                    const filtered = getFilteredTreeData(visibleTreeData, treeSearchTerm);
                    const converted = convertToTreeViewFormat(filtered);
                    debugLog('Filtered tree data:', filtered);
                    debugLog('Converted tree data:', converted);
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
                    <TreeNode
                      node={node}
                      onToggle={onToggle}
                      isOpen={isOpen}
                      selectedNode={selectedNode}
                      onSelect={handleNodeSelect}
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
          <div 
            className="flex-grow-1 flex-column main-content"
            style={{ 
              minHeight: 0, 
              height: '100%', 
              overflow: 'hidden', 
              backgroundColor: 'white',
              display: isMobile ? (showTree ? 'none' : 'flex') : 'flex'
            }}
          >
            {selectedNode ? (
              <div className="flex-grow-1 d-flex flex-column" style={{ minHeight: 0, height: '100%', overflow: 'hidden' }}>
                {/* Fixed Header and Tabs - not scrollable */}
                <div className="p-4 pb-0" style={{ flexShrink: 0, backgroundColor: 'white', borderBottom: '1px solid #dee2e6' }}>
                  <div className="node-details">
                    <div className="mb-3">
                      <h4 className="mb-1">{selectedNode.label || selectedNode.name}</h4>
                      <span className="badge bg-secondary">
                        {getNodeTypeLabel(selectedNode.type)}
                      </span>
                    </div>

                    {/* Tab Navigation */}
                    <ul className="nav nav-tabs mb-0" id="nodeTabs" role="tablist" style={{ borderBottom: 'none' }}>
                    {selectedNode && (selectedNode.hasDevices === false || (selectedNode.data?.hasDevices === false)) && (
                      <li className="nav-item" role="presentation">
                        <button
                          className={`nav-link ${activeTab === 'empty' ? 'active' : ''}`}
                          onClick={() => setActiveTab('empty')}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faFolder} className="me-2" />
                          <span className="tab-text">Übersicht</span>
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
                          <span className="tab-text">Verlauf</span>
                        </button>
                      </li>
                    )}
                    {selectedNode && (
                      <li className="nav-item" role="presentation">
                        <button
                          className={`nav-link ${activeTab === 'settings' ? 'active' : ''}`}
                          onClick={() => {
                            setActiveTab('settings');
                            // Initialize heating control state when opening settings tab
                            // Always prefer nodeDetails over selectedNode.data, as nodeDetails is always fresh from API
                            if (selectedNode) {
                              const runStatus = nodeDetails?.attributes?.runStatus ?? selectedNode.data?.runStatus ?? selectedNode.runStatus;
                              const fixValue = nodeDetails?.attributes?.fixValue ?? selectedNode.data?.fixValue ?? selectedNode.fixValue;
                              
                              debugLog('🟡 [DEBUG] Opening settings tab');
                              debugLog('🟡 [DEBUG] nodeDetails?.attributes?.runStatus:', nodeDetails?.attributes?.runStatus);
                              debugLog('🟡 [DEBUG] selectedNode.data?.runStatus:', selectedNode.data?.runStatus);
                              debugLog('🟡 [DEBUG] selectedNode.runStatus:', selectedNode.runStatus);
                              debugLog('🟡 [DEBUG] Final runStatus (preferring nodeDetails):', runStatus);
                              debugLog('🟡 [DEBUG] runStatus is PIR:', isPirRunStatus(runStatus));
                              debugLog('🟡 [DEBUG] runStatus === "fix":', runStatus === 'fix');
                              
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
                              
                              // Load schedule data if customer data is available AND current status is 'schedule'
if (customerData?.customerid && (runStatus === 'schedule' || isPirRunStatus(runStatus))) {
                                fetchScheduleData(customerData.customerid);
                              }

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
                              const schedulerPlanPIRValue = nodeDetails?.attributes?.schedulerPlanPIR || selectedNode.data?.schedulerPlanPIR;
                              if (schedulerPlanPIRValue) {
                                try {
                                  const planArrayPIR = JSON.parse(schedulerPlanPIRValue);
                                  setOriginalSchedulerPlanPIR(Array.isArray(planArrayPIR) ? planArrayPIR : []);
                                } catch (error) {
                                  setOriginalSchedulerPlanPIR([]);
                                }
                              } else {
                                setOriginalSchedulerPlanPIR([]);
                              }
                              
                              // Reset pending changes
                              setPendingRunStatus(null);
                              setPendingFixValue(null);
                              setSelectedDayPlans({});
                              setSelectedDayPlansPIR({});
                              setHasUnsavedChanges(false);
                            }
                          }}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faBullseye} className="me-2" />
                          <span className="tab-text">Temperatur</span>
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
                          <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                          <span className="tab-text">Details</span>
                        </button>
                      </li>
                    )}
                    {selectedNode && (
                      <li className="nav-item" role="presentation">
                        <button
                          className={`nav-link ${activeTab === 'config' ? 'active' : ''}`}
                          onClick={async () => {
                            setActiveTab('config');
                            // Lade immer die neuesten Werte direkt aus ThingsBoard
                            if (selectedNode) {
                              // Rufe fetchNodeDetails auf, um die neuesten Werte aus ThingsBoard zu holen
                              // Die Werte werden dann automatisch über den useEffect aktualisiert
                              await fetchNodeDetails(selectedNode.id);
                              
                              // Setze pending values zurück
                              setPendingMinTemp(null);
                              setPendingMaxTemp(null);
                              setPendingOverruleMinutes(null);
                              setPendingWindowSensor(null);
                            }
                          }}
                          type="button"
                        >
                          <FontAwesomeIcon icon={faCog} className="me-2" />
                          <span className="tab-text">Einstellungen</span>
                        </button>
                      </li>
                    )}
                  </ul>
                  </div>
                </div>
                
                {/* Scrollable Tab Content */}
                <div className="flex-grow-1 p-4 pt-0" style={{ overflow: 'auto', minHeight: 0 }}>
                  <div className="tab-content" style={{ paddingTop: '1rem' }}>
                    {/* Übersicht Tab */}
                    {activeTab === 'overview' && (
                      <div className="tab-pane fade show active">
                        {/* Aktuelle Temperaturen */}
                        <div className="responsive-cards mb-5">
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
                              // Always prefer nodeDetails over selectedNode.data, as nodeDetails is always fresh from API
                              if (selectedNode) {
                                const runStatus = nodeDetails?.attributes?.runStatus ?? selectedNode.data?.runStatus ?? selectedNode.runStatus;
                                const fixValue = nodeDetails?.attributes?.fixValue ?? selectedNode.data?.fixValue ?? selectedNode.fixValue;
                                
                                debugLog('🟡 [DEBUG] Opening settings tab (from card)');
                                debugLog('🟡 [DEBUG] nodeDetails?.attributes?.runStatus:', nodeDetails?.attributes?.runStatus);
                                debugLog('🟡 [DEBUG] selectedNode.data?.runStatus:', selectedNode.data?.runStatus);
                                debugLog('🟡 [DEBUG] selectedNode.runStatus:', selectedNode.runStatus);
                                debugLog('🟡 [DEBUG] Final runStatus (preferring nodeDetails):', runStatus);
                                debugLog('🟡 [DEBUG] runStatus is PIR:', isPirRunStatus(runStatus));
                                debugLog('🟡 [DEBUG] runStatus === "fix":', runStatus === 'fix');
                                
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
                                
                                // Load schedule data if customer data is available AND current status is 'schedule'
                                if (customerData?.customerid && (runStatus === 'schedule' || isPirRunStatus(runStatus))) {
                                  fetchScheduleData(customerData.customerid);
                                }
                                
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
                                const schedulerPlanPIRValue = nodeDetails?.attributes?.schedulerPlanPIR || selectedNode.data?.schedulerPlanPIR;
                                if (schedulerPlanPIRValue) {
                                  try {
                                    const planArrayPIR = JSON.parse(schedulerPlanPIRValue);
                                    setOriginalSchedulerPlanPIR(Array.isArray(planArrayPIR) ? planArrayPIR : []);
                                  } catch (error) {
                                    setOriginalSchedulerPlanPIR([]);
                                  }
                                } else {
                                  setOriginalSchedulerPlanPIR([]);
                                }
                                
                                // Reset pending changes
                                setPendingRunStatus(null);
                                setPendingFixValue(null);
                                setSelectedDayPlans({});
                                setSelectedDayPlansPIR({});
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
                                    {plannedTargetTemperature !== null && (
                                      <div className="mt-2">
                                        <small className="text-muted d-block">Geplante Zieltemperatur</small>
                                        <div className="text-info fw-bold">
                                          {Number(plannedTargetTemperature).toFixed(1)}°C
                                        </div>
                                      </div>
                                    )}
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
                                <FontAwesomeIcon icon={faSlidersH} className="text-secondary mb-3" size="2x" />
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
                                    <div className="display-4 text-secondary mb-2">
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
                          
                          {(() => {
                            // Parse windowStates from nodeDetails or selectedNode
                            const windowStatesValue = nodeDetails?.attributes?.windowStates || selectedNode?.data?.windowStates;
                            let windowStates = null;
                            let windowCount = 0;
                            let closedCount = 0;
                            let openCount = 0;
                            
                            if (windowStatesValue) {
                              try {
                                windowStates = typeof windowStatesValue === 'string' 
                                  ? JSON.parse(windowStatesValue) 
                                  : windowStatesValue;
                                
                                if (windowStates && typeof windowStates === 'object') {
                                  windowCount = Object.keys(windowStates).length;
                                  closedCount = Object.values(windowStates).filter(status => status === true).length;
                                  openCount = windowCount - closedCount;
                                }
                              } catch (error) {
                                console.error('Error parsing windowStates:', error);
                              }
                            }
                            
                            return (
                              <div className={`responsive-card ${!windowStates ? 'disabled-card' : ''}`}>
                                <div className="card">
                                  <div className="card-body text-center">
                                    <FontAwesomeIcon 
                                      icon={faWindowMaximize} 
                                      className={`mb-3 ${openCount > 0 ? 'text-danger' : windowStates ? 'text-success' : 'text-warning'}`} 
                                      size="2x" 
                                    />
                                    <h4 className="card-title">Fenster</h4>
                                    {windowStates ? (
                                      <div>
                                        <div className="display-4 mb-2" style={{ 
                                          color: openCount > 0 ? '#dc3545' : '#28a745',
                                          fontSize: '1.5rem'
                                        }}>
                                          {windowCount}
                                        </div>
                                        <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                          {closedCount} geschlossen
                                          {openCount > 0 && (
                                            <span className="text-danger ms-1">
                                              • {openCount} offen
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    ) : (
                                      <div className="text-muted">
                                        <p>Kein Fensterkontakt gefunden</p>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
                          
                          {(() => {
                            const attrTruthy = (v) => (
                              v === true ||
                              v === 1 ||
                              (typeof v === 'string' && (v.toLowerCase() === 'true' || v === '1'))
                            );
                            const hasPirAttr = attrTruthy(nodeDetails?.attributes?.hasPir) || attrTruthy(selectedNode?.data?.hasPir);
                            if (!hasPirAttr) return null;
                            const isOccupied = attrTruthy(nodeDetails?.attributes?.occupied) || attrTruthy(selectedNode?.data?.occupied);
                            return (
                              <div className="responsive-card">
                                <div className="card">
                                  <div className="card-body text-center">
                                    <FontAwesomeIcon
                                      icon={faUser}
                                      className={`mb-3 ${isOccupied ? 'text-primary' : 'text-secondary'}`}
                                      size="2x"
                                    />
                                    <h4 className="card-title">Anwesenheit</h4>
                                    <div className="display-4 mb-2" style={{
                                      fontSize: '1.5rem',
                                      fontWeight: 'bold',
                                      color: isOccupied ? '#0d6efd' : '#6c757d'
                                    }}>
                                      {isOccupied ? 'Belegt' : 'Unbelegt'}
                                    </div>
                                    <div className="text-muted" style={{ fontSize: '0.75rem' }}>
                                      {isOccupied ? 'Raum als belegt erkannt' : 'Keine Belegung erkannt'}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })()}
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
                                ) : roomTimeseries?.length > 0 ? (
                                  <div style={{ 
                                    background: 'linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%)',
                                    borderRadius: '10px',
                                    padding: '15px',
                                    boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                                    minHeight: '400px'
                                  }}>
                                    <ReactECharts
                                      option={getTemperatureChartOptionForRender()}
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
                              <div className="card-footer bg-light">
                                <small className="text-muted">
                                  <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                                  Die angezeigten Werte entsprechen den vom Gerät zurückgesendeten Daten.
                                </small>
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
                      {debugLog('Rendering devices:', devices, 'Length:', devices?.length)}
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
                              debugLog('Device', index, 'telemetry data:', device.telemetry);
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
                                        <div 
                                          className="bg-light border rounded p-2 text-center" 
                                          style={{ minWidth: '80px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'sensorTemperature')}
                                          title="Klicken für Verlauf"
                                        >
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
                                        <div 
                                          className="bg-light border rounded p-2 text-center" 
                                          style={{ minWidth: '80px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'targetTemperature')}
                                          title="Klicken für Verlauf"
                                        >
                                          <small className="text-muted d-block">Ziel</small>
                                          <div className="fw-bold text-success" style={{ fontSize: '0.9rem' }}>
                                            {Number(device.telemetry.targetTemperature).toFixed(1)}°C
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.batteryVoltage !== undefined && device.telemetry?.batteryVoltage !== null && (
                                        <div 
                                          className="bg-light border rounded p-2 text-center" 
                                          style={{ minWidth: '80px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'batteryVoltage')}
                                          title="Klicken für Verlauf"
                                        >
                                          <small className="text-muted d-block">Batterie</small>
                                          <div className="fw-bold text-warning" style={{ fontSize: '0.9rem' }}>
                                            {Number(device.telemetry.batteryVoltage).toFixed(2)}V
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.PercentValveOpen !== undefined && device.telemetry?.PercentValveOpen !== null && (
                                        <div 
                                          className="bg-light border rounded p-2 text-center" 
                                          style={{ minWidth: '80px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'PercentValveOpen')}
                                          title="Klicken für Verlauf"
                                        >
                                          <small className="text-muted d-block">Ventil</small>
                                          <div className="fw-bold text-info" style={{ fontSize: '0.9rem' }}>
                                            {Number(device.telemetry.PercentValveOpen).toFixed(0)}%
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.signalQuality !== undefined && device.telemetry?.signalQuality !== null && device.telemetry?.signalQuality !== 0 && (
                                        <div 
                                          className="bg-light border rounded p-2 text-center" 
                                          style={{ minWidth: '80px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'signalQuality')}
                                          title="Klicken für Verlauf"
                                        >
                                          <small className="text-muted d-block">Signal</small>
                                          <div className="fw-bold text-secondary" style={{ fontSize: '0.8rem' }}>
                                            {String(device.telemetry.signalQuality)}
                                          </div>
                                        </div>
                                      )}
                                      {device.telemetry?.hall_sensor_state !== undefined && device.telemetry?.hall_sensor_state !== null && (
                                        <div 
                                          className="bg-light border rounded p-2 text-center" 
                                          style={{ minWidth: '100px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'hall_sensor_state')}
                                          title={deviceIsWsci(device) ? 'Klicken für Messwerte-Tabelle' : 'Klicken für Verlauf'}
                                        >
                                          <small className="text-muted d-block">
                                            {deviceIsWsci(device) ? 'Fenster (WSCI)' : 'Hall Sensor'}
                                          </small>
                                          <div className="fw-bold" style={{ 
                                            fontSize: '0.9rem',
                                            color: (() => {
                                              const value = device.telemetry.hall_sensor_state;
                                              const isHigh = String(value).toUpperCase() === 'HIGH' || value === 1 || value === '1' || value === true;
                                              return isHigh ? '#28a745' : '#dc3545';
                                            })()
                                          }}>
                                            {deviceIsWsci(device)
                                              ? formatHallSensorTelemetryLabel(device.telemetry.hall_sensor_state)
                                              : (() => {
                                                  const value = String(device.telemetry.hall_sensor_state).toUpperCase();
                                                  if (value === 'HIGH' || value === '1' || value === 'TRUE') {
                                                    return 'geschlossen';
                                                  }
                                                  return 'offen';
                                                })()}
                                          </div>
                                        </div>
                                      )}
                                      {(deviceIsWs202(device) || (device.telemetry && Object.prototype.hasOwnProperty.call(device.telemetry, 'pir'))) && (
                                        <div
                                          className="bg-light border rounded p-2 text-center"
                                          style={{ minWidth: '100px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'pir')}
                                          title="Klicken für Messwerte-Tabelle"
                                        >
                                          <small className="text-muted d-block">PIR</small>
                                          <div className="fw-bold" style={{
                                            fontSize: '0.9rem',
                                            color: (() => {
                                              const v = device.telemetry?.pir;
                                              const s = String(v ?? '').trim().toLowerCase();
                                              const trig = s === 'triggert' || s === 'triggered' || s === 'trigger' || s === 'high' || s === 'on' || s === '1' || s === 'true' || v === 1 || v === true;
                                              return trig ? '#fd7e14' : '#6c757d';
                                            })()
                                          }}>
                                            {formatPirTelemetryLabel(device.telemetry?.pir)}
                                          </div>
                                        </div>
                                      )}
                                      {(deviceIsWs202(device) || (device.telemetry && Object.prototype.hasOwnProperty.call(device.telemetry, 'light'))) && (
                                        <div
                                          className="bg-light border rounded p-2 text-center"
                                          style={{ minWidth: '100px', flex: '0 0 auto', cursor: 'pointer' }}
                                          onClick={() => handleTelemetryValueClick(device, 'light')}
                                          title="Klicken für Messwerte-Tabelle"
                                        >
                                          <small className="text-muted d-block">Licht</small>
                                          <div className="fw-bold text-warning" style={{ fontSize: '0.9rem' }}>
                                            {formatLightTelemetryLabel(device.telemetry?.light)}
                                          </div>
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

                    {/* Temperatur Tab */}
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
                                {usePresenceSensor && (
                                  <div className="text-center">
                                    <img 
                                      src={isPirRunStatus(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) ? "/assets/img/hm_pir_active.svg" : "/assets/img/hm_pir_inactive.svg"}
                                      alt="Bewegung"
                                      style={{ width: '60px', height: '60px', cursor: 'pointer' }}
                                      onClick={() => updateRunStatus('PIR')}
                                    />
                                    <div className="mt-2">
                                      <small className="text-muted">Bewegung</small>
                                    </div>
                                  </div>
                                )}
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
                                    ) : mergedScheduleData && Array.isArray(mergedScheduleData) && mergedScheduleData.length > 0 ? (
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
                                                        if (schedulerPlanValue && Array.isArray(mergedScheduleData)) {
                                                          try {
                                                            const planArray = JSON.parse(schedulerPlanValue);
                                                            if (Array.isArray(planArray) && planArray[dayIndex]) {
                                                              const planNameForDay = planArray[dayIndex];
                                                              const foundIndex = mergedScheduleData.findIndex(plan => plan[0] === planNameForDay);
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
                                                      {Array.isArray(mergedScheduleData) ? mergedScheduleData.map((plan, planIndex) => (
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
                                                  const availablePlans = Array.isArray(mergedScheduleData) ? mergedScheduleData : [];
                                                  let selectedPlanIndex;
                                                  if (selectedDayPlans[dayIndex] !== undefined) {
                                                    selectedPlanIndex = selectedDayPlans[dayIndex];
                                                  } else {
                                                    const schedulerPlanValue = nodeDetails?.attributes?.schedulerPlan;
                                                    if (schedulerPlanValue && Array.isArray(mergedScheduleData)) {
                                                      try {
                                                        const planArray = JSON.parse(schedulerPlanValue);
                                                        if (Array.isArray(planArray) && planArray[dayIndex]) {
                                                          const planNameForDay = planArray[dayIndex];
                                                          const foundIndex = mergedScheduleData.findIndex(plan => plan[0] === planNameForDay);
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
                                            {mergedScheduleData ? 
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

                            {/* PIR (Bewegung) – Wochenplan-Tabelle analog zu Plan, Daten aus schedulerPlanPIR */}
                            {isPirRunStatus(pendingRunStatus !== null ? pendingRunStatus : nodeDetails?.attributes?.runStatus) && usePresenceSensor && (
                              <div className="mb-4">
                                {hasUnsavedChanges && (Object.keys(selectedDayPlansPIR).length > 0 || isPirRunStatus(pendingRunStatus)) && (
                                  <div className="d-flex justify-content-end gap-2 mb-2">
                                    <button
                                      className="btn btn-outline-secondary btn-sm"
                                      onClick={cancelChanges}
                                      type="button"
                                    >
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
                                <div className="card" style={{
                                  border: '2px solid #17a2b8',
                                  borderRadius: '15px',
                                  boxShadow: '0 4px 15px rgba(23, 162, 184, 0.1)'
                                }}>
                                  <div className="card-body">
                                    <h5 className="card-title text-info mb-3">
                                      <FontAwesomeIcon icon={faBullseye} className="me-2" />
                                      Wochenplan Bewegung (PIR)
                                    </h5>
                                    {loadingSchedule ? (
                                      <div className="text-center py-5">
                                        <div className="spinner-border text-info" role="status">
                                          <span className="visually-hidden">Loading...</span>
                                        </div>
                                        <p className="mt-2 text-muted">Lade Wochenplan...</p>
                                      </div>
                                    ) : mergedScheduleData && Array.isArray(mergedScheduleData) && mergedScheduleData.length > 0 ? (
                                      <div className="table-responsive">
                                        <table className="table table-sm table-bordered">
                                          <thead className="table-info">
                                            <tr>
                                              <th style={{ width: '60px' }}>Std</th>
                                              {['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'].map((day, dayIndex) => (
                                                <th key={day} className="text-center" style={{ minWidth: '120px', fontSize: '0.9rem', padding: '0.5rem 0.25rem' }}>
                                                  <div className="fw-bold">{day}</div>
                                                  <div style={{ marginTop: '5px' }}>
                                                    <select
                                                      className="form-select form-select-sm"
                                                      value={(() => {
                                                        if (selectedDayPlansPIR[dayIndex] !== undefined) {
                                                          return selectedDayPlansPIR[dayIndex];
                                                        }
                                                        const val = nodeDetails?.attributes?.schedulerPlanPIR;
                                                        if (val && Array.isArray(mergedScheduleData)) {
                                                          try {
                                                            const arr = JSON.parse(val);
                                                            if (Array.isArray(arr) && arr[dayIndex]) {
                                                              const foundIndex = mergedScheduleData.findIndex(plan => plan[0] === arr[dayIndex]);
                                                              return foundIndex !== -1 ? foundIndex : 0;
                                                            }
                                                          } catch (e) { /* ignore */ }
                                                        }
                                                        return 0;
                                                      })()}
                                                      onChange={(e) => handlePlanChangePIR(dayIndex, parseInt(e.target.value))}
                                                      style={{ fontSize: '0.7rem', border: '1px solid #dee2e6' }}
                                                    >
                                                      {Array.isArray(mergedScheduleData) ? mergedScheduleData.map((plan, planIndex) => (
                                                        <option key={planIndex} value={planIndex}>{plan[0]}</option>
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
                                                  const availablePlans = Array.isArray(mergedScheduleData) ? mergedScheduleData : [];
                                                  let selectedPlanIndex;
                                                  if (selectedDayPlansPIR[dayIndex] !== undefined) {
                                                    selectedPlanIndex = selectedDayPlansPIR[dayIndex];
                                                  } else {
                                                    const val = nodeDetails?.attributes?.schedulerPlanPIR;
                                                    if (val && Array.isArray(mergedScheduleData)) {
                                                      try {
                                                        const arr = JSON.parse(val);
                                                        if (Array.isArray(arr) && arr[dayIndex]) {
                                                          const foundIndex = mergedScheduleData.findIndex(plan => plan[0] === arr[dayIndex]);
                                                          selectedPlanIndex = foundIndex !== -1 ? foundIndex : 0;
                                                        } else {
                                                          selectedPlanIndex = 0;
                                                        }
                                                      } catch (e) {
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
                                                      color: temp ? '#0c5460' : '#6c757d',
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
                                        <strong>Kein Wochenplan verfügbar.</strong>
                                        <br />
                                        <small>
                                          {mergedScheduleData ? 'Keine gültigen Plan-Daten gefunden.' : 'Plan-Daten werden geladen oder sind nicht verfügbar.'}
                                        </small>
                                        {nodeDetails?.attributes?.schedulerPlanPIR && (
                                          <div className="mt-2">
                                            <small className="text-muted">
                                              PIR-Wochenplan ist konfiguriert.
                                            </small>
                                          </div>
                                        )}
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
                          const { path, subordinates } = getAllSubordinateNodes(selectedNode?.id, visibleTreeData);
                          const subordinatesSorted = [...subordinates].sort((a, b) => {
                            const la = String(a.label ?? a.name ?? a.text ?? '').toLocaleLowerCase('de');
                            const lb = String(b.label ?? b.name ?? b.text ?? '').toLocaleLowerCase('de');
                            return la.localeCompare(lb, 'de', { sensitivity: 'base' });
                          });

                          // Get all subordinates without filtering to calculate the difference
                          const getAllSubordinatesWithoutFilter = (nodeId, nodes = visibleTreeData) => {
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
                                {subordinatesSorted.length > 0 ? (
                                  <div className="row">
                                    {subordinatesSorted.map((node) => (
                                      <div key={node.id} className="col-md-6 col-lg-4 mb-3">
                                        <div className="card h-100">
                                          <div className="card-body">
                                            <div className="d-flex align-items-center mb-2">
                                              <FontAwesomeIcon 
                                                icon={getIconForType(node.type)} 
                                                className="me-2 text-primary"
                                              />
                                              <h6 className="card-title mb-0" style={{ fontSize: '0.875rem' }}>
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
                                            
                                            {/* Temperature and Valve Data — Spinner pro Kachel solange Telemetrie lädt */}
                                            <div className="mt-3" style={{ minHeight: '4.5rem' }}>
                                              {loadingSubordinateTelemetry ? (
                                                <div className="d-flex align-items-center justify-content-center py-3">
                                                  <div
                                                    className="spinner-border spinner-border-sm text-primary"
                                                    role="status"
                                                    aria-busy="true"
                                                  >
                                                    <span className="visually-hidden">Lade Daten…</span>
                                                  </div>
                                                </div>
                                              ) : subordinateTelemetry[node.id] ? (
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
                                              ) : (
                                                <div className="text-center text-muted small py-2">
                                                  Keine Telemetriedaten
                                                </div>
                                              )}
                                            </div>
                                            
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
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {/* Einstellungen Tab */}
                    {activeTab === 'config' && (
                      <div className="tab-pane fade show active">
                        <div className="row">
                          <div className="col-12">
                            <h5 className="mb-4">
                              <FontAwesomeIcon icon={faCog} className="me-2" />
                              Einstellungen
                            </h5>
                            <div className="card">
                              <div className="card-body">
                                <form>
                                  <div className="row mb-3">
                                    <div className="col-md-4">
                                      <label htmlFor="minTemp" className="form-label">
                                        <FontAwesomeIcon icon={faThermometerHalf} className="me-2" />
                                        Minimale Temperatur (°C)
                                      </label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        id="minTemp"
                                        min="5"
                                        max="30"
                                        step="0.5"
                                        value={pendingMinTemp !== null ? pendingMinTemp : (originalMinTemp !== null ? originalMinTemp : 16)}
                                        onChange={(e) => {
                                          const value = parseFloat(e.target.value);
                                          setPendingMinTemp(value);
                                        }}
                                      />
                                    </div>
                                    <div className="col-md-4">
                                      <label htmlFor="maxTemp" className="form-label">
                                        <FontAwesomeIcon icon={faThermometerHalf} className="me-2" />
                                        Maximale Temperatur (°C)
                                      </label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        id="maxTemp"
                                        min="5"
                                        max="30"
                                        step="0.5"
                                        value={pendingMaxTemp !== null ? pendingMaxTemp : (originalMaxTemp !== null ? originalMaxTemp : 26)}
                                        onChange={(e) => {
                                          const value = parseFloat(e.target.value);
                                          setPendingMaxTemp(value);
                                        }}
                                      />
                                    </div>
                                    <div className="col-md-4">
                                      <label htmlFor="overruleMinutes" className="form-label">
                                        <FontAwesomeIcon icon={faClock} className="me-2" />
                                        Overrule Minuten
                                      </label>
                                      <input
                                        type="number"
                                        className="form-control"
                                        id="overruleMinutes"
                                        min="0"
                                        max="1440"
                                        step="1"
                                        value={pendingOverruleMinutes !== null ? pendingOverruleMinutes : (originalOverruleMinutes !== null ? originalOverruleMinutes : 360)}
                                        onChange={(e) => {
                                          const value = parseInt(e.target.value);
                                          setPendingOverruleMinutes(value);
                                        }}
                                      />
                                    </div>
                                    <div className="col-md-12 mt-3">
                                      <div className="form-check">
                                        <input
                                          className="form-check-input"
                                          type="checkbox"
                                          id="windowSensor"
                                          checked={pendingWindowSensor !== null ? pendingWindowSensor : (originalWindowSensor !== null ? originalWindowSensor : false)}
                                          onChange={(e) => {
                                            setPendingWindowSensor(e.target.checked);
                                          }}
                                        />
                                        <label className="form-check-label" htmlFor="windowSensor">
                                          <FontAwesomeIcon icon={faWindowMaximize} className="me-2" />
                                          Fenstersensor aktivieren
                                        </label>
                                      </div>
                                    </div>
                                  </div>
                                  
                                  {(pendingMinTemp !== null || pendingMaxTemp !== null || pendingOverruleMinutes !== null || pendingWindowSensor !== null) && (
                                    <div className="d-flex gap-2 mb-3">
                                      <button
                                        type="button"
                                        className="btn btn-primary"
                                        onClick={saveSettings}
                                        disabled={savingSettings}
                                      >
                                        {savingSettings ? (
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
                                      <button
                                        type="button"
                                        className="btn btn-secondary"
                                        onClick={cancelSettings}
                                        disabled={savingSettings}
                                      >
                                        <FontAwesomeIcon icon={faTimes} className="me-1" />
                                        Abbrechen
                                      </button>
                                    </div>
                                  )}
                                </form>
                              </div>
                            </div>
                          </div>
                        </div>
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
                            fetchTemperatureHistory(
                              selectedNode,
                              option.value,
                              roomLoadGenerationRef.current,
                              undefined
                            );
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

      {/* Telemetry Chart Modal */}
      {showTelemetryChartModal && selectedTelemetryDevice && selectedTelemetryAttribute && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)', zIndex: 1055 }}>
          <div className="modal-dialog modal-dialog-centered modal-xl">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FontAwesomeIcon
                    icon={telemetryUsesTableModal(selectedTelemetryDevice, selectedTelemetryAttribute) ? faTable : faChartLine}
                    className="me-2"
                  />
                  {telemetryUsesTableModal(selectedTelemetryDevice, selectedTelemetryAttribute) ? 'Messwerte' : 'Verlauf'} – {selectedTelemetryAttribute === 'hall_sensor_state' && deviceIsWsci(selectedTelemetryDevice) ? 'Fenster (WSCI)' : getAttributeDisplayName(selectedTelemetryAttribute)} ({selectedTelemetryDevice.label || selectedTelemetryDevice.name})
                </h5>
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => {
                    setShowTelemetryChartModal(false);
                    setSelectedTelemetryAttribute(null);
                    setSelectedTelemetryDevice(null);
                    setTelemetryChartData([]);
                  }}
                ></button>
              </div>
              <div className="modal-body">
                {/* Time Range Selection */}
                <div className="mb-3 d-flex justify-content-center align-items-center gap-2">
                  <label className="mb-0">Zeitbereich:</label>
                  {['1d', '3d', '7d', '30d', '90d'].map((range) => (
                    <button
                      key={range}
                      className={`btn btn-sm ${selectedChartTimeRange === range ? 'btn-primary' : 'btn-outline-primary'}`}
                      onClick={() => handleChartTimeRangeChange(range)}
                      disabled={loadingTelemetryChart}
                    >
                      {range === '1d' ? '1 Tag' : 
                       range === '3d' ? '3 Tage' : 
                       range === '7d' ? '7 Tage' : 
                       range === '30d' ? '30 Tage' : 
                       '90 Tage'}
                    </button>
                  ))}
                </div>

                {loadingTelemetryChart ? (
                  <div className="d-flex align-items-center justify-content-center" style={{ height: '400px' }}>
                    <div className="spinner-border me-2" role="status">
                      <span className="visually-hidden">Laden...</span>
                    </div>
                    <span>
                      {telemetryUsesTableModal(selectedTelemetryDevice, selectedTelemetryAttribute)
                        ? 'Lade Messwerte...'
                        : 'Lade Verlaufsdaten...'}
                    </span>
                  </div>
                ) : telemetryChartData && telemetryChartData.length > 0 && telemetryUsesTableModal(selectedTelemetryDevice, selectedTelemetryAttribute) ? (
                  <div className="table-responsive" style={{ maxHeight: '520px', overflowY: 'auto' }}>
                    <table className="table table-sm table-striped table-hover mb-0">
                      <thead className="table-light sticky-top">
                        <tr>
                          <th>Zeit</th>
                          <th>Rohwert</th>
                          <th>Anzeige</th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...telemetryChartData]
                          .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
                          .map((row, idx) => (
                            <tr key={`${row.timestamp}-${idx}`}>
                              <td className="text-nowrap">{row.time}</td>
                              <td><code className="small">{row.rawValue !== undefined && row.rawValue !== null ? String(row.rawValue) : '–'}</code></td>
                              <td>{row.displayLabel ?? '–'}</td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : telemetryChartData && telemetryChartData.length > 0 ? (
                  <div>
                    <ReactECharts
                      option={{
                        title: {
                          text: `Verlauf - ${getTimeRangeLabel(selectedChartTimeRange)}`,
                          left: 'center',
                          textStyle: {
                            fontSize: 16,
                            fontWeight: 'bold'
                          }
                        },
                        tooltip: {
                          trigger: 'axis',
                          formatter: function(params) {
                            if (params && params.length > 0) {
                              const timestamp = params[0].axisValue;
                              const date = new Date(timestamp).toLocaleString('de-DE', {
                                day: '2-digit',
                                month: '2-digit',
                                year: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit'
                              });
                              let tooltipText = `<div style="font-weight: bold; margin-bottom: 5px;">${date}</div>`;
                              params.forEach((param) => {
                                const value = Array.isArray(param.value) ? param.value[1] : param.value;
                                let displayValue;
                                let unit = '';
                                
                                if (selectedTelemetryAttribute === 'hall_sensor_state') {
                                  displayValue = Number(value) === 1 ? 'geschlossen' : 'offen';
                                } else if (selectedTelemetryAttribute === 'pir') {
                                  displayValue = Number(value) === 1 ? 'Bewegung' : 'ruhig';
                                } else if (selectedTelemetryAttribute === 'light') {
                                  const n = Number(value);
                                  displayValue = !isNaN(n) ? (n % 1 === 0 ? String(n) : n.toFixed(2)) : String(value);
                                  unit = !isNaN(n) ? ' (Licht)' : '';
                                } else {
                                  displayValue = !isNaN(Number(value)) ? Number(value).toFixed(2) : String(value);
                                  unit = selectedTelemetryAttribute === 'batteryVoltage' ? 'V' : 
                                         selectedTelemetryAttribute === 'sensorTemperature' || selectedTelemetryAttribute === 'targetTemperature' ? '°C' :
                                         selectedTelemetryAttribute === 'PercentValveOpen' ? '%' : '';
                                }
                                
                                tooltipText += `<div style="display: flex; align-items: center; margin: 2px 0;">
                                  <span style="color:${param.color}; margin-right: 8px;">●</span> 
                                  <span style="font-weight: 500;">${param.seriesName}:</span> 
                                  <span style="margin-left: 8px; font-weight: bold;">${displayValue}${unit}</span>
                                </div>`;
                              });
                              return tooltipText;
                            }
                            return '';
                          }
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
                          }
                        },
                        yAxis: {
                          type: 'value',
                          name: selectedTelemetryAttribute === 'batteryVoltage' ? 'Spannung (V)' : 
                                selectedTelemetryAttribute === 'sensorTemperature' || selectedTelemetryAttribute === 'targetTemperature' ? 'Temperatur (°C)' :
                                selectedTelemetryAttribute === 'PercentValveOpen' ? 'Ventilöffnung (%)' :
                                selectedTelemetryAttribute === 'hall_sensor_state' ? 'Status' :
                                selectedTelemetryAttribute === 'pir' ? 'PIR' :
                                selectedTelemetryAttribute === 'light' ? 'Licht' : 'Wert',
                          nameLocation: 'middle',
                          nameGap: 50,
                          min: (selectedTelemetryAttribute === 'hall_sensor_state' || selectedTelemetryAttribute === 'pir') ? 0 : undefined,
                          max: (selectedTelemetryAttribute === 'hall_sensor_state' || selectedTelemetryAttribute === 'pir') ? 1 : undefined,
                          interval: (selectedTelemetryAttribute === 'hall_sensor_state' || selectedTelemetryAttribute === 'pir') ? 1 : undefined,
                          axisLabel: selectedTelemetryAttribute === 'hall_sensor_state' ? {
                            formatter: function(value) {
                              return value === 1 ? 'geschlossen' : value === 0 ? 'offen' : value;
                            }
                          } : selectedTelemetryAttribute === 'pir' ? {
                            formatter: function(value) {
                              return value === 1 ? 'Bewegung' : value === 0 ? 'ruhig' : value;
                            }
                          } : undefined
                        },
                        series: [{
                          name: getAttributeDisplayName(selectedTelemetryAttribute),
                          type: 'line',
                          data: telemetryChartData.map(point => [point.timestamp, point.value]),
                          smooth: true,
                          symbol: 'none',
                          symbolSize: 0,
                          connectNulls: true,
                          lineStyle: {
                            color: '#1890ff',
                            width: 2
                          },
                          areaStyle: {
                            color: {
                              type: 'linear',
                              x: 0,
                              y: 0,
                              x2: 0,
                              y2: 1,
                              colorStops: [{
                                offset: 0, color: 'rgba(24, 144, 255, 0.3)'
                              }, {
                                offset: 1, color: 'rgba(24, 144, 255, 0.05)'
                              }]
                            }
                          }
                        }],
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
                          bottom: 15
                        }]
                      }}
                      style={{ height: '500px', width: '100%' }}
                      opts={{ renderer: 'canvas' }}
                    />
                  </div>
                ) : (
                  <div className="text-center text-muted" style={{ height: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div>
                      <FontAwesomeIcon
                        icon={telemetryUsesTableModal(selectedTelemetryDevice, selectedTelemetryAttribute) ? faTable : faChartLine}
                        size="2x"
                        className="mb-3"
                      />
                      <p>
                        {telemetryUsesTableModal(selectedTelemetryDevice, selectedTelemetryAttribute)
                          ? 'Keine Messwerte verfügbar'
                          : 'Keine Verlaufsdaten verfügbar'}
                      </p>
                    </div>
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary" 
                  onClick={() => {
                    setShowTelemetryChartModal(false);
                    setSelectedTelemetryAttribute(null);
                    setSelectedTelemetryDevice(null);
                    setTelemetryChartData([]);
                  }}
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


