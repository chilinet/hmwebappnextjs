import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup, Alert, ProgressBar } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch, faEllipsisV, faUserEdit, faExclamationTriangle, faArrowUp, faFileExcel, faUpload, faCheck, faTimes, faCloudUpload, faCircleNodes } from "@fortawesome/free-solid-svg-icons";
import Layout from "@/components/Layout";
import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

function Inventory() {
  const { data: session, status } = useSession();
  const router = useRouter();

  // All state declarations must be at the top, before any early returns
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalMode, setModalMode] = useState('view'); // 'view', 'edit', 'add'
  const [customerFilter, setCustomerFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [modelFilter, setModelFilter] = useState('');
  const [distributorFilter, setDistributorFilter] = useState('');
  const [hasRelationFilter, setHasRelationFilter] = useState('');
  const [activeActionDropdown, setActiveActionDropdown] = useState(null);
  const [showChangeCustomerModal, setShowChangeCustomerModal] = useState(false);
  const [selectedCustomerForChange, setSelectedCustomerForChange] = useState(null);
  const [newCustomerId, setNewCustomerId] = useState('');
  const [isUpdatingCustomer, setIsUpdatingCustomer] = useState(false);
  const [updateStatus, setUpdateStatus] = useState(null);
  const [showScrollToTop, setShowScrollToTop] = useState(false);
  const tableContainerRef = useRef(null);
  const selectAllCheckboxRef = useRef(null);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState([]);
  const [bulkDeviceIdsForCustomerChange, setBulkDeviceIdsForCustomerChange] = useState(null);
  const [bulkActionDropdownOpen, setBulkActionDropdownOpen] = useState(false);

  // Assign LNS modal
  const [showAssignLnsModal, setShowAssignLnsModal] = useState(false);
  const [assignLnsSelectedLns, setAssignLnsSelectedLns] = useState('');
  const [assignLnsSelectedOffer, setAssignLnsSelectedOffer] = useState('');
  const [melitaOffers, setMelitaOffers] = useState([]);
  const [melitaOffersLoading, setMelitaOffersLoading] = useState(false);
  const [melitaOffersError, setMelitaOffersError] = useState(null);
  const [melitaProfiles, setMelitaProfiles] = useState([]);
  const [melitaProfilesLoading, setMelitaProfilesLoading] = useState(false);
  const [melitaProfilesError, setMelitaProfilesError] = useState(null);
  const [thingsstackApplications, setThingsstackApplications] = useState([]);
  const [thingsstackApplicationsLoading, setThingsstackApplicationsLoading] = useState(false);
  const [thingsstackApplicationsError, setThingsstackApplicationsError] = useState(null);
  const [thingsstackInputMethod, setThingsstackInputMethod] = useState('manual'); // manual | repository
  const [thingsstackFrequencyPlanId, setThingsstackFrequencyPlanId] = useState('EU_863_870');
  const [thingsstackMacVersion, setThingsstackMacVersion] = useState('MAC_V1_0_2');
  const [thingsstackPhyVersion, setThingsstackPhyVersion] = useState('PHY_V1_0_2_REV_B');
  const [thingsstackBrands, setThingsstackBrands] = useState([]);
  const [thingsstackBrandsLoading, setThingsstackBrandsLoading] = useState(false);
  const [thingsstackBrandsError, setThingsstackBrandsError] = useState(null);
  const [thingsstackBrandId, setThingsstackBrandId] = useState('');
  const [thingsstackModels, setThingsstackModels] = useState([]);
  const [thingsstackModelsLoading, setThingsstackModelsLoading] = useState(false);
  const [thingsstackModelsError, setThingsstackModelsError] = useState(null);
  const [thingsstackModelId, setThingsstackModelId] = useState('');
  const [assignLnsSelectedProfile, setAssignLnsSelectedProfile] = useState('');
  const [isAssigningLns, setIsAssigningLns] = useState(false);
  const [assignLnsError, setAssignLnsError] = useState(null);
  const [isRemovingLns, setIsRemovingLns] = useState(false);
  const LNS_OPTIONS = [{ value: 'melita', label: 'Melita' }, { value: 'thingsstack', label: 'Thingsstack' }];

  // Excel Import States
  const [showImportModal, setShowImportModal] = useState(false);
  const [importFile, setImportFile] = useState(null);
  const [excelData, setExcelData] = useState([]);
  const [excelHeaders, setExcelHeaders] = useState([]);
  const [columnMapping, setColumnMapping] = useState({});
  const [importPreview, setImportPreview] = useState([]);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const [importResults, setImportResults] = useState(null);
  const [importStep, setImportStep] = useState('upload'); // 'upload', 'mapping', 'preview', 'importing', 'results'

  // Customer list for filter dropdown (same source as Customers page: ThingsBoard via /api/config/customers)
  const [customerList, setCustomerList] = useState([]);

  // Fetch customer list for dropdown (matches Customers page)
  useEffect(() => {
    if (!session?.token) return;
    const loadCustomers = async () => {
      try {
        const response = await fetch('/api/config/customers', {
          headers: { 'Authorization': `Bearer ${session.token}` },
        });
        if (response.ok) {
          const data = await response.json();
          setCustomerList(data.data || []);
        }
      } catch (err) {
        console.error('Error loading customers for filter:', err);
      }
    };
    loadCustomers();
  }, [session?.token]);

  // Fetch Melita offers when Assign LNS modal is open and Melita is selected
  useEffect(() => {
    if (!showAssignLnsModal || assignLnsSelectedLns !== 'melita' || !session?.token) {
      if (assignLnsSelectedLns !== 'melita') {
        setMelitaOffers([]);
        setMelitaOffersError(null);
      }
      return;
    }
    let cancelled = false;
    setMelitaOffersLoading(true);
    setMelitaOffersError(null);
    fetch('/api/lns/melita/offers', {
      headers: { 'Authorization': `Bearer ${session.token}` },
    })
      .then((res) => {
        if (cancelled) return res;
        if (!res.ok) return res.json().then((body) => { throw new Error(body?.error || body?.details?.message || res.statusText); });
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setMelitaOffers(data?.offers ?? []);
          setMelitaOffersError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMelitaOffers([]);
          setMelitaOffersError(err.message || 'Fehler beim Laden der Offers');
        }
      })
      .finally(() => {
        if (!cancelled) setMelitaOffersLoading(false);
      });
    return () => { cancelled = true; };
  }, [showAssignLnsModal, assignLnsSelectedLns, session?.token]);

  // Fetch Thingsstack Device Repository brands
  useEffect(() => {
    if (!showAssignLnsModal || assignLnsSelectedLns !== 'thingsstack' || thingsstackInputMethod !== 'repository' || !session?.token) {
      if (assignLnsSelectedLns !== 'thingsstack' || thingsstackInputMethod !== 'repository') {
        setThingsstackBrands([]);
        setThingsstackBrandsError(null);
        setThingsstackBrandId('');
        setThingsstackModels([]);
        setThingsstackModelsError(null);
        setThingsstackModelId('');
      }
      return;
    }
    let cancelled = false;
    setThingsstackBrandsLoading(true);
    setThingsstackBrandsError(null);
    fetch('/api/lns/thingsstack/device-repository/brands', {
      headers: { 'Authorization': `Bearer ${session.token}` },
    })
      .then((res) => {
        if (cancelled) return res;
        if (!res.ok) return res.json().then((body) => { throw new Error(body?.error || body?.details || res.statusText); });
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setThingsstackBrands(data?.brands ?? []);
          setThingsstackBrandsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setThingsstackBrands([]);
          setThingsstackBrandsError(err.message || 'Fehler beim Laden der Device Repository Brands');
        }
      })
      .finally(() => {
        if (!cancelled) setThingsstackBrandsLoading(false);
      });
    return () => { cancelled = true; };
  }, [showAssignLnsModal, assignLnsSelectedLns, thingsstackInputMethod, session?.token]);

  // Fetch Thingsstack Device Repository models for selected brand
  useEffect(() => {
    if (!showAssignLnsModal || assignLnsSelectedLns !== 'thingsstack' || thingsstackInputMethod !== 'repository' || !thingsstackBrandId || !session?.token) {
      if (!thingsstackBrandId) {
        setThingsstackModels([]);
        setThingsstackModelsError(null);
        setThingsstackModelId('');
      }
      return;
    }
    let cancelled = false;
    setThingsstackModelsLoading(true);
    setThingsstackModelsError(null);
    setThingsstackModelId('');
    fetch(`/api/lns/thingsstack/device-repository/models?brandId=${encodeURIComponent(thingsstackBrandId)}`, {
      headers: { 'Authorization': `Bearer ${session.token}` },
    })
      .then((res) => {
        if (cancelled) return res;
        if (!res.ok) return res.json().then((body) => { throw new Error(body?.error || body?.details || res.statusText); });
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setThingsstackModels(data?.models ?? []);
          setThingsstackModelsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setThingsstackModels([]);
          setThingsstackModelsError(err.message || 'Fehler beim Laden der Device Repository Models');
        }
      })
      .finally(() => {
        if (!cancelled) setThingsstackModelsLoading(false);
      });
    return () => { cancelled = true; };
  }, [showAssignLnsModal, assignLnsSelectedLns, thingsstackInputMethod, thingsstackBrandId, session?.token]);

  // Fetch Melita device profiles when contract is selected (for Assign LNS)
  useEffect(() => {
    if (!showAssignLnsModal || assignLnsSelectedLns !== 'melita' || !assignLnsSelectedOffer || !session?.token) {
      if (!assignLnsSelectedOffer) {
        setMelitaProfiles([]);
        setAssignLnsSelectedProfile('');
        setMelitaProfilesError(null);
      }
      return;
    }
    let cancelled = false;
    setMelitaProfilesLoading(true);
    setMelitaProfilesError(null);
    setAssignLnsSelectedProfile('');
    fetch('/api/lns/melita/device-profiles', {
      headers: { 'Authorization': `Bearer ${session.token}` },
    })
      .then((res) => {
        if (cancelled) return res;
        if (!res.ok) return res.json().then((body) => { throw new Error(body?.error || body?.details?.message || res.statusText); });
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setMelitaProfiles(data?.profiles ?? []);
          setMelitaProfilesError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setMelitaProfiles([]);
          setMelitaProfilesError(err.message || 'Fehler beim Laden der Device Profiles');
        }
      })
      .finally(() => {
        if (!cancelled) setMelitaProfilesLoading(false);
      });
    return () => { cancelled = true; };
  }, [showAssignLnsModal, assignLnsSelectedLns, assignLnsSelectedOffer, session?.token]);

  // Fetch Thingsstack applications when Assign LNS modal is open and Thingsstack is selected
  useEffect(() => {
    if (!showAssignLnsModal || assignLnsSelectedLns !== 'thingsstack' || !session?.token) {
      if (assignLnsSelectedLns !== 'thingsstack') {
        setThingsstackApplications([]);
        setThingsstackApplicationsError(null);
      }
      return;
    }
    let cancelled = false;
    setThingsstackApplicationsLoading(true);
    setThingsstackApplicationsError(null);
    fetch('/api/lns/thingsstack/applications', {
      headers: { 'Authorization': `Bearer ${session.token}` },
    })
      .then((res) => {
        if (cancelled) return res;
        if (!res.ok) return res.json().then((body) => { throw new Error(body?.error || body?.details?.message || body?.details || res.statusText); });
        return res.json();
      })
      .then((data) => {
        if (!cancelled) {
          setThingsstackApplications(data?.offers ?? []);
          setThingsstackApplicationsError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setThingsstackApplications([]);
          setThingsstackApplicationsError(err.message || 'Fehler beim Laden der Thingsstack Applications');
        }
      })
      .finally(() => {
        if (!cancelled) setThingsstackApplicationsLoading(false);
      });
    return () => { cancelled = true; };
  }, [showAssignLnsModal, assignLnsSelectedLns, session?.token]);

  // Fetch devices with retry mechanism
  const fetchDevices = useCallback(async (retryCount = 0) => {
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 503 && (errorData.code === 'DB_CONNECTION_LOST' || errorData.code === 'DB_CONNECTION_RESET')) {
          if (retryCount < 3) {
            console.log(`Database connection lost, retrying... (${retryCount + 1}/3)`);
            // Wait 2 seconds before retrying
            await new Promise(resolve => setTimeout(resolve, 2000));
            return fetchDevices(retryCount + 1);
          } else {
            throw new Error('Datenbankverbindung konnte nach mehreren Versuchen nicht hergestellt werden. Bitte versuchen Sie es später erneut.');
          }
        } else {
          throw new Error(errorData.error || 'Fehler beim Laden der Geräte');
        }
      }
      
      const data = await response.json();
      setDevices(data);
      setError(null);
    } catch (err) {
      setError(err.message);
      console.error('Error fetching devices:', err);
    } finally {
      setLoading(false);
    }
  }, []);

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
    fetchDevices();
  }, [fetchDevices]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (!event.target.closest('.dropdown')) {
        setActiveActionDropdown(null);
      }
      if (!event.target.closest('[data-bulk-action-dropdown]')) {
        setBulkActionDropdownOpen(false);
      }
    };

    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  // Handle scroll events for scroll-to-top button
  useEffect(() => {
    const handleScroll = () => {
      const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
      setShowScrollToTop(scrollTop > 100); // Show button after scrolling 100px
    };

    // Also listen to table scroll events
    const handleTableScroll = (event) => {
      const scrollTop = event.target.scrollTop;
      setShowScrollToTop(scrollTop > 100);
    };

    window.addEventListener('scroll', handleScroll);
    
    // Add table scroll listener after component mounts
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
    const tableContainer = tableContainerRef.current;
    if (tableContainer) {
      const handleTableScroll = (event) => {
        const scrollTop = event.target.scrollTop;
        setShowScrollToTop(scrollTop > 50); // Show button after scrolling 50px in table
      };

      tableContainer.addEventListener('scroll', handleTableScroll);
      
      return () => {
        tableContainer.removeEventListener('scroll', handleTableScroll);
      };
    }
  }, [devices]); // Re-run when devices change

  // Filter devices based on search term and filters
  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    
    // Debug: Log hasrelation values
    if (hasRelationFilter !== '') {
      console.log('HasRelation Filter:', hasRelationFilter);
      console.log('Sample devices hasrelation values:', devices.slice(0, 3).map(d => ({ 
        id: d.id, 
        hasrelation: d.hasrelation, 
        type: typeof d.hasrelation 
      })));
    }
    
    return devices.filter(device => {
      // Text search filter
      if (searchTerm) {
        const searchLower = searchTerm.toLowerCase();
        const matchesSearch = 
          device.deviceLabel?.toLowerCase().includes(searchLower) ||
          device.customer_name?.toLowerCase().includes(searchLower) ||
          device.customer_title?.toLowerCase().includes(searchLower) ||
          device.brand_name?.toLowerCase().includes(searchLower) ||
          device.model_name?.toLowerCase().includes(searchLower) ||
          device.distributor_name?.toLowerCase().includes(searchLower) ||
          device.ordernbr?.toLowerCase().includes(searchLower) ||
          device.deveui?.toLowerCase().includes(searchLower) ||
          device.serialnbr?.toLowerCase().includes(searchLower);
        
        if (!matchesSearch) return false;
      }
      
      // Customer filter
      if (customerFilter && device.customer_name !== customerFilter) return false;
      
      // Brand filter
      if (brandFilter && device.brand_name !== brandFilter) return false;
      
      // Model filter
      if (modelFilter && device.model_name !== modelFilter) return false;
      
      // Distributor filter
      if (distributorFilter && device.distributor_name !== distributorFilter) return false;
      
      // Has Relation filter
      if (hasRelationFilter !== '') {
        const hasRelation = hasRelationFilter === 'true';
        // Robustere Überprüfung für verschiedene Datentypen
        const deviceHasRelation = device.hasrelation === 1 || device.hasrelation === '1' || device.hasrelation === true;
        if (hasRelation !== deviceHasRelation) return false;
      }
      
      return true;
    });
  }, [devices, searchTerm, customerFilter, brandFilter, modelFilter, distributorFilter, hasRelationFilter]);

  // Keep "select all" checkbox indeterminate in sync
  useEffect(() => {
    const el = selectAllCheckboxRef.current;
    if (!el) return;
    const someSelected = filteredDevices.some(d => selectedDeviceIds.includes(d.id));
    const allSelected = filteredDevices.length > 0 && filteredDevices.every(d => selectedDeviceIds.includes(d.id));
    el.indeterminate = someSelected && !allSelected;
  }, [filteredDevices, selectedDeviceIds]);

  // Show loading or access denied if not Superadmin
  if (status === 'loading') {
    return (
      <Layout>
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <Spinner animation="border" role="status">
            <span className="visually-hidden">Loading...</span>
          </Spinner>
        </div>
      </Layout>
    );
  }

  if (!session || session.user?.role !== 1) {
    return (
      <Layout>
        <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
          <div className="text-center">
            <h3>Keine Berechtigung</h3>
            <p>Sie haben keine Berechtigung, diese Seite aufzurufen.</p>
            <Button onClick={() => router.push('/config')} variant="primary">
              Zurück zur Konfiguration
            </Button>
          </div>
        </div>
      </Layout>
    );
  }

  // CRUD Operations
  const handleAdd = async (deviceData) => {
    const deveui = (deviceData.deveui ?? '').toString().trim();
    if (!deveui) {
      setError('DevEUI ist ein Pflichtfeld und darf nicht leer sein.');
      return;
    }
    const brandName = (deviceData.brand_name ?? '').toString().trim();
    if (!brandName) {
      setError('Brand ist ein Pflichtfeld und darf nicht leer sein.');
      return;
    }
    const modelName = (deviceData.model_name ?? '').toString().trim();
    if (!modelName) {
      setError('Model ist ein Pflichtfeld und darf nicht leer sein.');
      return;
    }
    const joineui = (deviceData.joineui ?? '').toString().trim();
    if (!joineui) {
      setError('JoinEUI ist ein Pflichtfeld und darf nicht leer sein.');
      return;
    }
    const serialnbr = (deviceData.serialnbr ?? '').toString().trim();
    if (!serialnbr) {
      setError('Seriennummer ist ein Pflichtfeld und darf nicht leer sein.');
      return;
    }
    try {
      setError(null);
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });

      const responseData = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(responseData.message || responseData.error || 'Fehler beim Erstellen des Geräts');
      }

      await fetchDevices(); // Refresh the list
      handleClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleUpdate = async (deviceData) => {
    try {
      const response = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });
      
      if (!response.ok) throw new Error('Fehler beim Aktualisieren des Geräts');
      
      await fetchDevices(); // Refresh the list
      handleClose();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleClose = () => {
    setShowModal(false);
    setSelectedDevice(null);
    setModalMode('view');
  };

  const resetFilters = () => {
    setSearchTerm('');
    setCustomerFilter('');
    setBrandFilter('');
    setModelFilter('');
    setDistributorFilter('');
    setHasRelationFilter('');
  };

  const handleActionClick = (deviceId, event) => {
    const isCurrentlyOpen = activeActionDropdown === deviceId;
    setActiveActionDropdown(isCurrentlyOpen ? null : deviceId);
    
    // Position the dropdown to avoid overflow
    if (!isCurrentlyOpen && event) {
      setTimeout(() => {
        const dropdown = document.querySelector('.dropdown-menu.show');
        const button = event.target.closest('button');
        
        if (dropdown && button) {
          const buttonRect = button.getBoundingClientRect();
          const dropdownWidth = 200; // minWidth from CSS
          const viewportWidth = window.innerWidth;
          
          // Check if dropdown would overflow on the right
          if (buttonRect.left + dropdownWidth > viewportWidth) {
            // Position dropdown to the left of the button
            dropdown.style.left = 'auto';
            dropdown.style.right = '0';
          } else {
            // Default position (left of button)
            dropdown.style.left = '0';
            dropdown.style.right = 'auto';
          }
        }
      }, 0);
    }
  };

  const handleChangeCustomer = (device) => {
    setSelectedCustomerForChange(device);
    setNewCustomerId(device.customerid || '');
    setShowChangeCustomerModal(true);
    setActiveActionDropdown(null);
  };

  const handleMarkAsDefect = (device) => {
    console.log('Mark as Defect for device:', device.id);
    // TODO: Implement defect marking functionality
    setActiveActionDropdown(null);
  };

  const handleCreateInThingsBoard = async (device) => {
    if (!confirm(`Möchten Sie das Gerät "${device.deviceLabel || device.deveui}" in ThingsBoard anlegen?`)) {
      setActiveActionDropdown(null);
      return;
    }

    try {
      setError(null);
      
      // Create device in ThingsBoard
      const response = await fetch('/api/thingsboard/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: device.deviceLabel || `Device_${device.deveui}`,
          type: device.model_name || 'Default',
          label: device.deviceLabel || device.deveui,
          deveui: device.deveui,
          // Add device attributes
          attributes: {
            deveui: device.deveui,
            joineui: device.joineui,
            serialnbr: device.serialnbr,
            brand: device.brand_name,
            model: device.model_name,
            distributor: device.distributor_name,
            ordernbr: device.ordernbr,
            orderdate: device.orderdate
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Fehler beim Anlegen des Geräts in ThingsBoard');
      }

      const result = await response.json();
      
      // Update local device with ThingsBoard connection ID
      const updateResponse = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...device,
          tbconnectionid: result.id?.id || result.id
        })
      });

      if (!updateResponse.ok) {
        console.warn('Gerät wurde in ThingsBoard angelegt, aber lokale Aktualisierung fehlgeschlagen');
      }

      // Refresh device list
      await fetchDevices();
      
      alert(`Gerät "${device.deviceLabel || device.deveui}" wurde erfolgreich in ThingsBoard angelegt!`);
      
    } catch (error) {
      setError(`Fehler beim Anlegen in ThingsBoard: ${error.message}`);
      console.error('Error creating device in ThingsBoard:', error);
    } finally {
      setActiveActionDropdown(null);
    }
  };

  const handleRemoveCustomerAssignment = (device) => {
    setSelectedCustomerForChange(device);
    setNewCustomerId('__REMOVE__'); // Pre-select "remove assignment" so user can confirm without picking another customer
    setShowChangeCustomerModal(true);
    setActiveActionDropdown(null);
  };

  const handleBulkAddToThingsBoard = async () => {
    if (selectedDeviceIds.length === 0) return;
    const toAdd = devices.filter(d => selectedDeviceIds.includes(d.id));
    const withoutTb = toAdd.filter(d => !d.tbconnectionid || String(d.tbconnectionid).trim() === '' || String(d.tbconnectionid) === '0');
    const withTb = toAdd.filter(d => d.tbconnectionid && String(d.tbconnectionid) !== '0' && String(d.tbconnectionid).length > 10);
    // Allow all: create new or re-link existing (backend returns existing id if device already in TB)
    const msg = withTb.length > 0 && withoutTb.length > 0
      ? `${withoutTb.length} Gerät(e) anlegen, ${withTb.length} Verknüpfung prüfen/aktualisieren. Fortfahren?`
      : withTb.length > 0
        ? `${toAdd.length} Gerät(e): Verknüpfung mit ThingsBoard prüfen bzw. erneut anlegen. Fortfahren?`
        : `${withoutTb.length} Gerät(e) in ThingsBoard anlegen?`;
    if (!confirm(msg)) {
      setBulkActionDropdownOpen(false);
      return;
    }
    setError(null);
    setBulkActionDropdownOpen(false);
    let done = 0;
    let failed = 0;
    for (const device of toAdd) {
      try {
        const response = await fetch('/api/thingsboard/devices', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: device.deviceLabel || `Device_${device.deveui}`,
            type: device.model_name || 'Default',
            label: device.deviceLabel || device.deveui,
            deveui: device.deveui,
            attributes: {
              deveui: device.deveui,
              joineui: device.joineui,
              serialnbr: device.serialnbr,
              brand: device.brand_name,
              model: device.model_name,
              distributor: device.distributor_name,
              ordernbr: device.ordernbr,
              orderdate: device.orderdate
            }
          })
        });
        if (!response.ok) {
          const errData = await response.json().catch(() => ({}));
          throw new Error(errData.error || errData.details || response.statusText);
        }
        const result = await response.json();
        const tbId = result.id?.id ?? result.id;
        const updateResponse = await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...device, tbconnectionid: tbId })
        });
        if (!updateResponse.ok) {
          console.warn('Device created in ThingsBoard but inventory update failed for', device.id);
        }
        done++;
      } catch (err) {
        failed++;
        setError(`ThingsBoard: ${err.message} (Gerät: ${device.deviceLabel || device.deveui})`);
      }
    }
    await fetchDevices();
    if (failed === 0) {
      setError(null);
      alert(`${done} Gerät(e) erfolgreich in ThingsBoard angelegt.`);
    } else if (done > 0) {
      alert(`${done} angelegt, ${failed} fehlgeschlagen.`);
    }
  };

  const handleBulkRemoveCustomerAssignment = async () => {
    if (selectedDeviceIds.length === 0) return;
    if (!confirm(`Customer-Zuordnung für ${selectedDeviceIds.length} Gerät(e) entfernen?`)) return;

    setError(null);
    try {
      const toUpdate = devices.filter(d => selectedDeviceIds.includes(d.id));
      for (const device of toUpdate) {
        const localResponse = await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...device, customerid: null })
        });
        if (!localResponse.ok) throw new Error(`Fehler beim Aktualisieren von Gerät ${device.id}`);
        // Always unassign in ThingsBoard when device has a connection (API only needs deviceId for type=TENANT)
        const validTbId = device.tbconnectionid && String(device.tbconnectionid).trim() !== '' && String(device.tbconnectionid) !== '0' && String(device.tbconnectionid).length > 10;
        if (validTbId) {
          const unassignRes = await fetch(`/api/thingsboard/owner?type=TENANT&deviceId=${encodeURIComponent(device.tbconnectionid)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify([])
          });
          if (!unassignRes.ok) {
            const err = await unassignRes.json().catch(() => ({}));
            throw new Error(err?.details || err?.error || `ThingsBoard Unassign: ${unassignRes.status}`);
          }
        }
      }
      await fetchDevices();
      setSelectedDeviceIds([]);
      setError(null);
    } catch (err) {
      setError(err.message);
    }
  };

  const handleAssignLns = async () => {
    if (!assignLnsSelectedLns || selectedDeviceIds.length === 0) {
      setAssignLnsError('Bitte LNS und mindestens ein Gerät auswählen.');
      return;
    }
    if (!assignLnsSelectedOffer || assignLnsSelectedOffer.trim() === '') {
      setAssignLnsError(assignLnsSelectedLns === 'thingsstack' ? 'Bitte Application auswählen.' : 'Bitte Offer/Contract auswählen.');
      return;
    }
    if (assignLnsSelectedLns === 'thingsstack' && thingsstackInputMethod === 'repository' && (!thingsstackBrandId || !thingsstackModelId)) {
      setAssignLnsError('Bitte Device Repository Brand und Model auswählen.');
      return;
    }
    if (assignLnsSelectedLns === 'melita' && (!assignLnsSelectedProfile || assignLnsSelectedProfile.trim() === '')) {
      setAssignLnsError('Bitte Device Profile auswählen.');
      return;
    }
    setAssignLnsError(null);
    setIsAssigningLns(true);
    try {
      const lnsName = LNS_OPTIONS.find((o) => o.value === assignLnsSelectedLns)?.label || assignLnsSelectedLns || 'Melita';
      const endpoint = assignLnsSelectedLns === 'thingsstack' ? '/api/lns/thingsstack/assign' : '/api/lns/melita/assign';
      const body = assignLnsSelectedLns === 'thingsstack'
        ? {
            deviceIds: selectedDeviceIds,
            applicationId: assignLnsSelectedOffer.trim(),
            lnsAssignmentName: lnsName,
            thingsstackConfig: {
              inputMethod: thingsstackInputMethod,
              frequencyPlanId: thingsstackFrequencyPlanId,
              macVersion: thingsstackMacVersion,
              phyVersion: thingsstackPhyVersion,
              brandId: thingsstackBrandId,
              modelId: thingsstackModelId,
            },
          }
        : {
            deviceIds: selectedDeviceIds,
            contractId: assignLnsSelectedOffer.trim(),
            deviceProfileId: assignLnsSelectedProfile.trim(),
            lnsAssignmentName: lnsName,
          };
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.details || res.statusText);
      }
      const { success, failed, errors } = data;
      const selectedTarget = assignLnsSelectedOffer;
      await fetchDevices();
      setShowAssignLnsModal(false);
      setAssignLnsSelectedLns('');
      setAssignLnsSelectedOffer('');
      setAssignLnsSelectedProfile('');
      setThingsstackInputMethod('manual');
      setThingsstackFrequencyPlanId('EU_863_870');
      setThingsstackMacVersion('MAC_V1_0_2');
      setThingsstackPhyVersion('PHY_V1_0_2_REV_B');
      setThingsstackBrandId('');
      setThingsstackModelId('');
      setSelectedDeviceIds([]);
      if (failed > 0 && errors?.length) {
        setError(`${success} zugewiesen, ${failed} fehlgeschlagen: ${errors.slice(0, 2).join('; ')}`);
      } else if (success > 0) {
        setError(null);
        if (assignLnsSelectedLns === 'thingsstack') {
          alert(`${success} Gerät(e) erfolgreich zu Thingsstack (Application ${selectedTarget}) zugewiesen.`);
        } else {
          alert(`${success} Gerät(e) erfolgreich zu Melita LNS (Contract ${selectedTarget}) zugewiesen.`);
        }
      }
    } catch (err) {
      setAssignLnsError(err.message);
    } finally {
      setIsAssigningLns(false);
    }
  };

  const handleRemoveLns = async () => {
    if (selectedDeviceIds.length === 0) {
      setError('Bitte mindestens ein Gerät auswählen.');
      return;
    }
    if (!window.confirm(`LNS-Zuordnung für ${selectedDeviceIds.length} Gerät(e) entfernen? Die Geräte werden bei Melita entfernt und die Zuordnung in der Inventarliste gelöscht.`)) {
      return;
    }
    setError(null);
    setIsRemovingLns(true);
    try {
      const res = await fetch('/api/lns/melita/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceIds: selectedDeviceIds }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data?.error || data?.details || res.statusText);
      }
      const { success, melitaRemoved, errors } = data;
      await fetchDevices();
      setSelectedDeviceIds([]);
      if (errors?.length) {
        setError(`${success} Geräte aktualisiert, ${errors.length} Melita-Fehler: ${errors.slice(0, 2).join('; ')}`);
      } else {
        setError(null);
        alert(`${melitaRemoved ?? success} Gerät(e) erfolgreich von LNS entfernt.`);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsRemovingLns(false);
    }
  };

  const handleSaveCustomerChange = async () => {
    const isBulk = bulkDeviceIdsForCustomerChange?.length > 0;
    const devicesToUpdate = isBulk
      ? devices.filter(d => bulkDeviceIdsForCustomerChange.includes(d.id))
      : (selectedCustomerForChange ? [selectedCustomerForChange] : []);

    if (devicesToUpdate.length === 0) return;
    if (!newCustomerId && !isBulk) return;
    if (isBulk && !newCustomerId) {
      setError('Bitte wählen Sie einen Customer aus.');
      return;
    }
    if (!isBulk && newCustomerId && selectedCustomerForChange.customerid === newCustomerId) {
      setError('Der neue Customer ist identisch mit dem aktuellen Customer');
      return;
    }

    setIsUpdatingCustomer(true);
    setUpdateStatus(null);
    setError(null);

    try {
      let allLocalOk = true;
      let thingsboardSuccess = true;
      let anyDeviceHadTbConnection = false;
      for (const device of devicesToUpdate) {
        const localResponse = await fetch('/api/inventory', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...device,
            customerid: newCustomerId === '__REMOVE__' ? null : newCustomerId
          })
        });
        if (!localResponse.ok) {
          allLocalOk = false;
          throw new Error('Fehler beim Ändern des Customers in der lokalen Datenbank');
        }
        const validTbId = device.tbconnectionid && String(device.tbconnectionid).trim() !== '' && String(device.tbconnectionid) !== '0' && String(device.tbconnectionid).length > 10;
        if (validTbId && (newCustomerId === '__REMOVE__' || newCustomerId)) {
          anyDeviceHadTbConnection = true;
          try {
            // When removing assignment, always unassign in ThingsBoard (API only needs deviceId for type=TENANT)
            if (newCustomerId === '__REMOVE__') {
              const unassignRes = await fetch(`/api/thingsboard/owner?type=TENANT&deviceId=${encodeURIComponent(device.tbconnectionid)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([])
              });
              if (!unassignRes.ok) {
                const err = await unassignRes.json().catch(() => ({}));
                throw new Error(err.details || err.error || `Unassign: ${unassignRes.status}`);
              }
            }
            if (newCustomerId && newCustomerId !== '__REMOVE__') {
              // Use newCustomerId directly (ThingsBoard customer UUID from dropdown), not from devices
              const assignResponse = await fetch(`/api/thingsboard/owner?type=CUSTOMER&customerId=${encodeURIComponent(newCustomerId)}&deviceId=${encodeURIComponent(device.tbconnectionid)}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify([])
              });
              if (!assignResponse.ok) {
                const errData = await assignResponse.json().catch(() => ({}));
                throw new Error(errData.details || errData.error || `ThingsBoard Assign: ${assignResponse.status}`);
              }
            }
          } catch (tbError) {
            thingsboardSuccess = false;
            throw tbError;
          }
        }
      }

      await fetchDevices();
      if (isBulk) {
        setSelectedDeviceIds(prev => prev.filter(id => !bulkDeviceIdsForCustomerChange.includes(id)));
        setBulkDeviceIdsForCustomerChange(null);
      }
      const newCustomerName = customerList.find(c => (c.id?.id ?? c.id) === newCustomerId)?.name ?? devices.find(d => d.customerid === newCustomerId)?.customer_name;
      const tbSkipped = !anyDeviceHadTbConnection && devicesToUpdate.some(d => !d.tbconnectionid);
      const isBulkRemove = isBulk && newCustomerId === '__REMOVE__';
      setUpdateStatus({
        type: tbSkipped ? 'warning' : 'success',
        message: tbSkipped
          ? (isBulkRemove
            ? `Geräte nur lokal: Customer-Zuordnung entfernt. Keine ThingsBoard-Aktualisierung: ausgewählte Geräte haben keine ThingsBoard-Verbindung (tbconnectionid).`
            : isBulk
              ? `Geräte nur lokal zu "${newCustomerName}" zugeordnet. Keine ThingsBoard-Aktualisierung: ausgewählte Geräte haben keine ThingsBoard-Verbindung (tbconnectionid). Bitte zuerst "In ThingsBoard anlegen" ausführen.`
              : `Customer nur lokal geändert. Gerät "${selectedCustomerForChange?.deviceLabel || selectedCustomerForChange?.id}" ist nicht in ThingsBoard angelegt (keine tbconnectionid). Bitte zuerst über "In ThingsBoard anlegen" das Gerät in ThingsBoard erstellen, dann erneut die Customer-Zuordnung ändern.`)
          : (isBulkRemove
            ? `Customer-Zuordnung für ${devicesToUpdate.length} Gerät(e) erfolgreich entfernt (lokal und ThingsBoard).`
            : isBulk
              ? `${devicesToUpdate.length} Geräte erfolgreich zu "${newCustomerName}" zugewiesen (lokal und ThingsBoard).`
              : (newCustomerId === '__REMOVE__'
                ? `Customer-Zuordnung erfolgreich entfernt! Device "${selectedCustomerForChange.deviceLabel || selectedCustomerForChange.id}" ist jetzt dem Tenant zugeordnet.`
                : `Customer erfolgreich zu "${newCustomerName}" geändert (lokal und ThingsBoard).`))
      });
      setTimeout(() => {
        setShowChangeCustomerModal(false);
        setSelectedCustomerForChange(null);
        setNewCustomerId('');
        setUpdateStatus(null);
      }, 2000);
    } catch (err) {
      setError(err.message);
      setUpdateStatus({ type: 'error', message: `Fehler: ${err.message}` });
    } finally {
      setIsUpdatingCustomer(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Sind Sie sicher, dass Sie dieses Gerät löschen möchten?')) return;
    
    try {
      const response = await fetch(`/api/inventory?id=${id}`, {
        method: 'DELETE'
      });
      
      if (!response.ok) throw new Error('Fehler beim Löschen des Geräts');
      
      await fetchDevices(); // Refresh the list
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRowClick = (device) => {
    setSelectedDevice(device);
    setModalMode('view');
    setShowModal(true);
  };

  const scrollToTop = () => {
    // Scroll page to top
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
    
    // Also scroll table to top if it has scroll position
    if (tableContainerRef.current) {
      tableContainerRef.current.scrollTo({
        top: 0,
        behavior: 'smooth'
      });
    }
  };

  // Excel Import Functions
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    // Validate file type
    const validTypes = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
      'application/vnd.ms-excel', // .xls
      'text/csv' // .csv
    ];

    if (!validTypes.includes(file.type)) {
      setError('Bitte wählen Sie eine gültige Excel-Datei (.xlsx, .xls) oder CSV-Datei aus.');
      return;
    }

    setImportFile(file);
    setError(null);

    // Read the file
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false });

        if (jsonData.length === 0) {
          setError('Die Excel-Datei ist leer oder konnte nicht gelesen werden.');
          return;
        }

        // First row contains headers
        const headers = jsonData[0];
        const dataRows = jsonData.slice(1);

        setExcelHeaders(headers);
        setExcelData(dataRows);
        setImportStep('mapping');
      } catch (error) {
        setError('Fehler beim Lesen der Excel-Datei: ' + error.message);
      }
    };

    reader.readAsArrayBuffer(file);
  };

  // Helper function to get field value (from Excel or fixed value)
  const getFieldValue = (dbField, row) => {
    const mapping = columnMapping[dbField];
    if (!mapping || mapping === '') return '';
    
    if (mapping === '__FIXED_VALUE__') {
      return columnMapping[`${dbField}_fixed`] || '';
    }
    
    const colIndex = excelHeaders.indexOf(mapping);
    if (colIndex < 0 || row[colIndex] === undefined) return '';
    
    let value = row[colIndex];
    
    // Special handling for date fields
    if (dbField === 'orderdate' && value) {
      try {
        // Handle different date formats
        if (typeof value === 'number') {
          // Excel serial date number
          const excelDate = new Date((value - 25569) * 86400 * 1000);
          return excelDate.toISOString().split('T')[0]; // YYYY-MM-DD format
        } else if (typeof value === 'string') {
          // Try to parse German date format (DD.MM.YYYY)
          if (value.match(/^\d{1,2}\.\d{1,2}\.\d{4}$/)) {
            const [day, month, year] = value.split('.');
            const date = new Date(year, month - 1, day);
            return date.toISOString().split('T')[0]; // YYYY-MM-DD format
          }
          // Try to parse other common formats
          const parsedDate = new Date(value);
          if (!isNaN(parsedDate.getTime())) {
            return parsedDate.toISOString().split('T')[0];
          }
        } else if (value instanceof Date) {
          return value.toISOString().split('T')[0];
        }
      } catch (error) {
        console.warn(`Error parsing date value "${value}" for field ${dbField}:`, error);
        return '';
      }
    }
    
    return value;
  };

  const handleColumnMapping = () => {
    // Validate that required fields are mapped
    const requiredFields = ['deveui', 'joineui', 'serialnbr'];
    const missingRequired = requiredFields.filter(field => !columnMapping[field] || columnMapping[field] === '');
    
    if (missingRequired.length > 0) {
      setError(`Folgende Pflichtfelder müssen zugeordnet werden: ${missingRequired.join(', ')}`);
      return;
    }

    // Create preview data
    const preview = excelData.slice(0, 5).map((row, index) => {
      const mappedRow = {};
      
      // Map all database fields
      const dbFields = ['devicenbr', 'devicename', 'deveui', 'joineui', 'serialnbr', 'appkey', 
                       'brand_id', 'model_id', 'hardwareversion', 'firmwareversion', 'owner_id', 
                       'group_id', 'distributor_id', 'status_id', 'invoicenbr', 'ordernbr', 'orderdate'];
      
      dbFields.forEach(field => {
        if (field === 'status_id') {
          mappedRow[field] = 0; // Always set to 0
        } else {
          mappedRow[field] = getFieldValue(field, row);
        }
      });
      
      return { ...mappedRow, _rowIndex: index + 2 }; // +2 because we skip header and start from 1
    });

    setImportPreview(preview);
    setImportStep('preview');
  };

  const handleImport = async () => {
    setIsImporting(true);
    setImportProgress(0);
    setImportStep('importing');
    setError(null);

    try {
      const results = {
        success: 0,
        errors: 0,
        errorDetails: []
      };

      // Process data in batches
      const batchSize = 10;
      const totalRows = excelData.length;

      for (let i = 0; i < excelData.length; i += batchSize) {
        const batch = excelData.slice(i, i + batchSize);
        
        // Process batch
        for (let j = 0; j < batch.length; j++) {
          const row = batch[j];
          const rowIndex = i + j + 2; // +2 because we skip header and start from 1
          
          try {
            // Map Excel data to database fields
            const deviceData = {};
            
            // Map all database fields
            const dbFields = ['devicenbr', 'devicename', 'deveui', 'joineui', 'serialnbr', 'appkey', 
                             'brand_id', 'model_id', 'hardwareversion', 'firmwareversion', 'owner_id', 
                             'group_id', 'distributor_id', 'status_id', 'invoicenbr', 'ordernbr', 'orderdate'];
            
            dbFields.forEach(field => {
              if (field === 'status_id') {
                deviceData[field] = 0; // Always set to 0
              } else {
                deviceData[field] = getFieldValue(field, row);
              }
            });

            // Validate required fields
            if (!deviceData.deveui || !deviceData.joineui || !deviceData.serialnbr) {
              throw new Error('Pflichtfelder fehlen: DevEUI, JoinEUI oder Seriennummer');
            }

            // Validate date format for orderdate if present
            if (deviceData.orderdate && deviceData.orderdate !== '') {
              try {
                const testDate = new Date(deviceData.orderdate);
                if (isNaN(testDate.getTime())) {
                  throw new Error(`Ungültiges Datumsformat für orderdate: ${deviceData.orderdate}`);
                }
              } catch (error) {
                throw new Error(`Fehler beim Verarbeiten des Datums: ${error.message}`);
              }
            }

            // Send to API
            const response = await fetch('/api/inventory', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(deviceData)
            });

            if (!response.ok) {
              const errorData = await response.json().catch(() => ({}));
              throw new Error(errorData.error || 'Fehler beim Speichern');
            }

            results.success++;
          } catch (error) {
            results.errors++;
            results.errorDetails.push({
              row: rowIndex,
              error: error.message
            });
          }
        }

        // Update progress
        const progress = Math.round(((i + batchSize) / totalRows) * 100);
        setImportProgress(Math.min(progress, 100));
      }

      setImportResults(results);
      setImportStep('results');
      
      // Refresh device list
      await fetchDevices();
    } catch (error) {
      setError('Fehler beim Import: ' + error.message);
    } finally {
      setIsImporting(false);
    }
  };

  const resetImport = () => {
    setImportFile(null);
    setExcelData([]);
    setExcelHeaders([]);
    setColumnMapping({});
    setImportPreview([]);
    setImportResults(null);
    setImportStep('upload');
    setImportProgress(0);
    setError(null);
  };

  const closeImportModal = () => {
    setShowImportModal(false);
    resetImport();
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="container-fluid px-4 mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="text-black">Inventory</h2>
        <div>
          <Button 
            variant="success" 
            className="me-2"
            onClick={() => setShowImportModal(true)}
          >
            <FontAwesomeIcon icon={faFileExcel} /> Excel Import
          </Button>
          <Button 
            variant="primary" 
            onClick={() => {
              setModalMode('add');
              setSelectedDevice(null);
              setShowModal(true);
            }}
          >
            <FontAwesomeIcon icon={faPlus} /> Neues Gerät
          </Button>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger">
          <div className="d-flex justify-content-between align-items-center">
            <span>{error}</span>
            {error.includes('Datenbankverbindung') && (
              <Button 
                variant="outline-danger" 
                size="sm"
                onClick={() => {
                  setError(null);
                  setLoading(true);
                  fetchDevices();
                }}
              >
                Erneut versuchen
              </Button>
            )}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-4">
        <InputGroup>
          <InputGroup.Text>
            <FontAwesomeIcon icon={faSearch} />
          </InputGroup.Text>
          <Form.Control
            placeholder="Suche nach Devicelabel, Customer, Brand, Model, Distributor, Lieferschein, DevEUI oder Seriennummer..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </div>

      {/* Filter Row */}
      <div className="row mb-4 g-3">
        <div className="col-md-2">
          <Form.Select 
            value={customerFilter} 
            onChange={(e) => setCustomerFilter(e.target.value)}
            className="form-select-sm"
          >
            <option value="">Alle Customers</option>
            <option value="Keine Zuordnung">Keine Zuordnung</option>
            {customerList.map((customer) => {
              const name = customer.name || '';
              if (!name) return null;
              return (
                <option key={customer.id?.id ?? customer.id} value={name}>{name}</option>
              );
            })}
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Form.Select 
            value={brandFilter} 
            onChange={(e) => setBrandFilter(e.target.value)}
            className="form-select-sm"
          >
            <option value="">Alle Brands</option>
            {Array.from(new Set(devices.map(d => d.brand_name).filter(Boolean))).sort().map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Form.Select 
            value={modelFilter} 
            onChange={(e) => setModelFilter(e.target.value)}
            className="form-select-sm"
          >
            <option value="">Alle Models</option>
            {Array.from(new Set(devices.map(d => d.model_name).filter(Boolean))).sort().map(model => (
              <option key={model} value={model}>{model}</option>
            ))}
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Form.Select 
            value={distributorFilter} 
            onChange={(e) => setDistributorFilter(e.target.value)}
            className="form-select-sm"
          >
            <option value="">Alle Distributors</option>
            {Array.from(new Set(devices.map(d => d.distributor_name).filter(Boolean))).sort().map(distributor => (
              <option key={distributor} value={distributor}>{distributor}</option>
            ))}
          </Form.Select>
        </div>
        <div className="col-md-2">
          <Form.Select 
            value={hasRelationFilter} 
            onChange={(e) => setHasRelationFilter(e.target.value)}
            className="form-select-sm"
          >
            <option value="">Alle Relations</option>
            <option value="true">True</option>
            <option value="false">False</option>
          </Form.Select>
        </div>
        <div className="col-md-2 d-flex align-items-center">
          <div className="dropdown" data-bulk-action-dropdown>
            <Button
              variant="outline-primary"
              size="sm"
              id="bulk-action-dropdown"
              className="dropdown-toggle d-flex align-items-center"
              disabled={selectedDeviceIds.length === 0}
              onClick={() => setBulkActionDropdownOpen(prev => !prev)}
              aria-expanded={bulkActionDropdownOpen}
              aria-haspopup="true"
            >
              Aktionen {selectedDeviceIds.length > 0 && `(${selectedDeviceIds.length})`}
            </Button>
            {bulkActionDropdownOpen && selectedDeviceIds.length > 0 && (
              <>
                <div
                  className="dropdown-menu show position-absolute"
                  style={{ zIndex: 1050, minWidth: '200px' }}
                  aria-labelledby="bulk-action-dropdown"
                >
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setBulkDeviceIdsForCustomerChange([...selectedDeviceIds]);
                      setSelectedCustomerForChange({
                        customer_name: `${selectedDeviceIds.length} Geräte ausgewählt`,
                        customerid: null
                      });
                      setNewCustomerId('');
                      setShowChangeCustomerModal(true);
                      setBulkActionDropdownOpen(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faUserEdit} className="me-2" />
                    Assign Device
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setBulkDeviceIdsForCustomerChange([...selectedDeviceIds]);
                      setSelectedCustomerForChange({
                        customer_name: `${selectedDeviceIds.length} Geräte ausgewählt`,
                        customerid: null
                      });
                      setNewCustomerId('__REMOVE__');
                      setShowChangeCustomerModal(true);
                      setBulkActionDropdownOpen(false);
                    }}
                  >
                    <FontAwesomeIcon icon={faUserEdit} className="me-2" />
                    Remove Assignment
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => {
                      setBulkActionDropdownOpen(false);
                      setAssignLnsSelectedLns('');
                      setAssignLnsSelectedOffer('');
                      setShowAssignLnsModal(true);
                    }}
                  >
                    <FontAwesomeIcon icon={faCircleNodes} className="me-2" />
                    Assign LNS
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    disabled={isRemovingLns || selectedDeviceIds.length === 0}
                    onClick={() => {
                      setBulkActionDropdownOpen(false);
                      handleRemoveLns();
                    }}
                  >
                    <FontAwesomeIcon icon={faCircleNodes} className="me-2" />
                    Remove LNS
                  </button>
                  <button
                    type="button"
                    className="dropdown-item"
                    onClick={() => handleBulkAddToThingsBoard()}
                  >
                    <FontAwesomeIcon icon={faCloudUpload} className="me-2" />
                    Add to Thingsboard
                  </button>
                </div>
                <div
                  className="position-fixed"
                  style={{ top: 0, left: 0, right: 0, bottom: 0, zIndex: 1040 }}
                  onClick={() => setBulkActionDropdownOpen(false)}
                  aria-hidden="true"
                />
              </>
            )}
          </div>
        </div>
      </div>

      {/* Filter Reset Button */}
      {(customerFilter || brandFilter || modelFilter || distributorFilter || hasRelationFilter) && (
        <div className="mb-3">
          <Button 
            variant="outline-secondary" 
            size="sm" 
            onClick={resetFilters}
            className="me-2"
          >
            Filter zurücksetzen
          </Button>
          <small className="text-muted">
            {filteredDevices.length} von {devices.length} Geräten angezeigt
          </small>
        </div>
      )}

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
              <th className="text-center" style={{ width: 44, backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>
                <Form.Check
                  type="checkbox"
                  ref={selectAllCheckboxRef}
                  checked={filteredDevices.length > 0 && filteredDevices.every(d => selectedDeviceIds.includes(d.id))}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setSelectedDeviceIds(filteredDevices.map(d => d.id));
                    } else {
                      setSelectedDeviceIds(prev => prev.filter(id => !filteredDevices.some(d => d.id === id)));
                    }
                  }}
                  aria-label="Alle auswählen"
                />
              </th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Devicelabel</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Customer</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Brand</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Model</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Distributor</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Lieferschein</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Lieferdatum</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>DevEUI</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>JoinEUI</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)', maxWidth: 130, width: 130 }}>Seriennummer</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Status</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Has Relation</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>LNS Assignment</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((device) => (
              <tr key={device.id}>
                <td className="text-center" style={{ width: 44, verticalAlign: 'middle' }}>
                  <Form.Check
                    type="checkbox"
                    checked={selectedDeviceIds.includes(device.id)}
                    onChange={(e) => {
                      e.stopPropagation();
                      setSelectedDeviceIds(prev =>
                        e.target.checked
                          ? [...prev, device.id]
                          : prev.filter(id => id !== device.id)
                      );
                    }}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Gerät ${device.deviceLabel || device.id} auswählen`}
                  />
                </td>
                <td>{device.deviceLabel || 'Kein Label'}</td>
                <td>
                  <div>
                    <strong>{device.customer_name || 'Nicht verfügbar'}</strong>
                    {device.customer_title && (
                      <div className="small text-muted">{device.customer_title}</div>
                    )}
                  </div>
                </td>
                <td>{device.brand_name || 'Kein Brand'}</td>
                <td>{device.model_name || 'Kein Model'}</td>
                <td>{device.distributor_name || 'Kein Distributor'}</td>
                <td>{device.ordernbr || '-'}</td>
                <td>{device.orderdate ? new Date(device.orderdate).toLocaleDateString('de-DE') : '-'}</td>
                <td>{device.deveui}</td>
                <td>{device.joineui}</td>
                <td style={{ maxWidth: 130 }}>{device.serialnbr}</td>
                <td>{device.status}</td>
                <td>
                  <span className={`badge ${device.hasrelation ? 'bg-success' : 'bg-secondary'}`}>
                    {device.hasrelation ? 'True' : 'False'}
                  </span>
                </td>
                <td>{device.lns_assignment_name ?? '—'}</td>
                <td>
                  <Button
                    variant="info"
                    size="sm"
                    className="me-2"
                    onClick={() => handleRowClick(device)}
                  >
                    <FontAwesomeIcon icon={faEdit} />
                  </Button>
                  <div className="dropdown d-inline-block position-relative">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={(e) => handleActionClick(device.id, e)}
                      className="dropdown-toggle"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      <FontAwesomeIcon icon={faEllipsisV} />
                    </Button>
                    {activeActionDropdown === device.id && (
                      <ul 
                        className="dropdown-menu show position-absolute" 
                        style={{
                          zIndex: 1050,
                          minWidth: '200px',
                          top: '100%',
                          left: '0',
                          marginTop: '2px'
                        }}
                      >
                        <li>
                          <button 
                            className="dropdown-item" 
                            onClick={() => handleChangeCustomer(device)}
                          >
                            <FontAwesomeIcon icon={faUserEdit} className="me-2" />
                            Change Customer
                          </button>
                        </li>
                        <li>
                          <button 
                            className="dropdown-item" 
                            onClick={() => handleRemoveCustomerAssignment(device)}
                          >
                            <FontAwesomeIcon icon={faUserEdit} className="me-2" />
                            Remove Customer Assignment
                          </button>
                        </li>
                        <li>
                          <button 
                            className="dropdown-item" 
                            onClick={() => handleMarkAsDefect(device)}
                          >
                            <FontAwesomeIcon icon={faExclamationTriangle} className="me-2" />
                            Mark as Defect
                          </button>
                        </li>
                        <li>
                          <button 
                            className="dropdown-item" 
                            onClick={() => handleCreateInThingsBoard(device)}
                          >
                            <FontAwesomeIcon icon={faCloudUpload} className="me-2" />
                            {device.tbconnectionid && String(device.tbconnectionid) !== '0' && String(device.tbconnectionid).length > 10
                              ? 'In ThingsBoard anlegen / Verknüpfung aktualisieren'
                              : 'In ThingsBoard anlegen'}
                          </button>
                        </li>
                        <li><hr className="dropdown-divider" /></li>
                        <li>
                          <button 
                            className="dropdown-item text-danger" 
                            onClick={() => handleDelete(device.id)}
                          >
                            <FontAwesomeIcon icon={faTrash} className="me-2" />
                            Delete
                          </button>
                        </li>
                      </ul>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </Table>
      </div>

      <Modal
        show={showModal}
        onHide={handleClose}
        size="lg"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {modalMode === 'add' ? 'Neues Gerät' : 
             modalMode === 'edit' ? 'Gerät bearbeiten' : 
             'Gerät Details'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {modalMode !== 'view' && (
            <p className="text-muted small mb-3">
              <span className="text-danger">*</span> = Pflichtfeld
            </p>
          )}
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Devicelabel</Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.deviceLabel || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  deviceLabel: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Geräte-Label eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Customer</Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.customer_name || ''}
                disabled={true}
                placeholder="Customer wird aus ThingsBoard geladen"
              />
              {selectedDevice?.customer_title && (
                <Form.Text className="text-muted">
                  {selectedDevice.customer_title}
                </Form.Text>
              )}
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Brand <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.brand_name || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  brand_name: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Brand eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Model <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.model_name || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  model_name: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Model eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Distributor</Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.distributor_name || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  distributor_name: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Distributor eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Lieferscheinnummer</Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.ordernbr || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  ordernbr: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Lieferscheinnummer eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Lieferdatum</Form.Label>
              <Form.Control
                type="date"
                value={selectedDevice?.orderdate ? selectedDevice.orderdate.split('T')[0] : ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  orderdate: e.target.value
                })}
                disabled={modalMode === 'view'}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                DevEUI <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.deveui || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  deveui: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="DevEUI eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                JoinEUI <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.joineui || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  joineui: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="JoinEUI eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                Seriennummer <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.serialnbr || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  serialnbr: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Seriennummer eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>
                AppKey <span className="text-danger">*</span>
              </Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.appkey || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  appkey: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="AppKey eingeben"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Status</Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.status || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  status: e.target.value
                })}
                disabled={modalMode === 'view'}
                placeholder="Status eingeben"
              />
            </Form.Group>
            
            {/* Status Anzeige */}
            {updateStatus && (
              <div className={`alert alert-${updateStatus.type === 'success' ? 'success' : updateStatus.type === 'warning' ? 'warning' : 'danger'} mt-3`}>
                {updateStatus.message}
              </div>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleClose}>
            Schließen
          </Button>
          {modalMode !== 'view' && (
            <Button 
              variant="primary"
              disabled={modalMode === 'add' && (
                !(selectedDevice?.deveui ?? '').toString().trim() ||
                !(selectedDevice?.joineui ?? '').toString().trim() ||
                !(selectedDevice?.serialnbr ?? '').toString().trim() ||
                !(selectedDevice?.brand_name ?? '').toString().trim() ||
                !(selectedDevice?.model_name ?? '').toString().trim()
              )}
              onClick={() => {
                if (modalMode === 'add') {
                  handleAdd(selectedDevice);
                } else {
                  handleUpdate(selectedDevice);
                }
              }}
            >
              {modalMode === 'add' ? 'Erstellen' : 'Speichern'}
            </Button>
          )}
          {modalMode === 'view' && (
            <Button 
              variant="primary"
              onClick={() => setModalMode('edit')}
            >
              Bearbeiten
            </Button>
          )}
        </Modal.Footer>
      </Modal>

      {/* Change Customer Modal */}
      <Modal
        show={showChangeCustomerModal}
        onHide={() => {
          setShowChangeCustomerModal(false);
          setBulkDeviceIdsForCustomerChange(null);
        }}
        size="md"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {bulkDeviceIdsForCustomerChange?.length && newCustomerId === '__REMOVE__'
              ? `Customer-Zuordnung entfernen (${bulkDeviceIdsForCustomerChange.length} Geräte)`
              : bulkDeviceIdsForCustomerChange?.length
                ? `Assign Device (${bulkDeviceIdsForCustomerChange.length} Geräte)`
                : (newCustomerId && newCustomerId !== '__REMOVE__' ? 'Change Customer' : 'Remove Customer Assignment')}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>{bulkDeviceIdsForCustomerChange?.length ? 'Ausgewählte Geräte' : 'Aktueller Customer'}</Form.Label>
              <Form.Control
                type="text"
                value={selectedCustomerForChange?.customer_name || 'Kein Customer zugeordnet'}
                disabled={true}
                className="bg-light"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Neuer Customer</Form.Label>
              <Form.Select
                value={newCustomerId}
                onChange={(e) => setNewCustomerId(e.target.value)}
              >
                <option value="">Customer auswählen...</option>
                <option value="__REMOVE__">-- Customer-Zuordnung entfernen --</option>
                {customerList.map((customer) => {
                  const id = customer.id?.id ?? customer.id;
                  const name = customer.name || '';
                  if (!id || !name) return null;
                  return (
                    <option key={id} value={id}>{name}</option>
                  );
                })}
              </Form.Select>
              {newCustomerId === '__REMOVE__' && (
                <Form.Text className="text-warning">
                  <strong>Warnung:</strong> {bulkDeviceIdsForCustomerChange?.length
                    ? 'Die Geräte werden dem Tenant zugeordnet und die Customer-ID wird aus der lokalen Datenbank entfernt.'
                    : 'Das Gerät wird dem Tenant zugeordnet und die Customer-ID wird aus der lokalen Datenbank entfernt.'}
                </Form.Text>
              )}
            </Form.Group>
            
            {/* ThingsBoard-Status - hide in bulk or show generic message */}
            {!bulkDeviceIdsForCustomerChange?.length && (
              <Form.Group className="mb-3">
                <Form.Label>ThingsBoard-Status</Form.Label>
                <Form.Control
                  type="text"
                  value={selectedCustomerForChange?.tbconnectionid ?
                    `Verfügbar (ID: ${selectedCustomerForChange.tbconnectionid})` :
                    'Nicht verfügbar - Nur lokale Änderung möglich'
                  }
                  disabled={true}
                  className={`bg-light ${selectedCustomerForChange?.tbconnectionid ? 'text-success' : 'text-muted'}`}
                />
                <Form.Text className="text-muted">
                  {selectedCustomerForChange?.tbconnectionid ?
                    (newCustomerId === '__REMOVE__' ?
                      'Gerät wird dem Tenant zugeordnet und Customer-ID entfernt' :
                      'Gerät wird auch in ThingsBoard aktualisiert'
                    ) :
                    'Gerät existiert nur in der lokalen Datenbank'
                  }
                </Form.Text>
              </Form.Group>
            )}
            {bulkDeviceIdsForCustomerChange?.length > 0 && (
              <Form.Text className="text-muted">
                {newCustomerId === '__REMOVE__'
                  ? 'Die ausgewählten Geräte werden dem Tenant zugeordnet und die Customer-ID wird entfernt.'
                  : 'Verbundene Geräte werden auch in ThingsBoard aktualisiert.'}
              </Form.Text>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => { setShowChangeCustomerModal(false); setBulkDeviceIdsForCustomerChange(null); }}>
            Abbrechen
          </Button>
          <Button 
            variant="primary"
            onClick={handleSaveCustomerChange}
            disabled={isUpdatingCustomer}
          >
            {isUpdatingCustomer ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Wird aktualisiert...
              </>
            ) : (
              bulkDeviceIdsForCustomerChange?.length && newCustomerId !== '__REMOVE__'
                ? 'Geräte zuweisen'
                : (newCustomerId === '__REMOVE__' ? 'Customer-Zuordnung entfernen' : 'Customer ändern')
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Assign LNS Modal */}
      <Modal
        show={showAssignLnsModal}
        onHide={() => {
          setShowAssignLnsModal(false);
          setAssignLnsSelectedLns('');
          setAssignLnsSelectedOffer('');
          setAssignLnsSelectedProfile('');
          setThingsstackInputMethod('manual');
          setThingsstackFrequencyPlanId('EU_863_870');
          setThingsstackMacVersion('MAC_V1_0_2');
          setThingsstackPhyVersion('PHY_V1_0_2_REV_B');
          setThingsstackBrandId('');
          setThingsstackModelId('');
          setThingsstackBrands([]);
          setThingsstackModels([]);
          setThingsstackBrandsError(null);
          setThingsstackModelsError(null);
        }}
        size="md"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Assign LNS {selectedDeviceIds.length > 0 && `(${selectedDeviceIds.length} Geräte)`}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>LNS</Form.Label>
              <Form.Select
                value={assignLnsSelectedLns}
                onChange={(e) => {
                  setAssignLnsSelectedLns(e.target.value);
                  setAssignLnsSelectedOffer('');
                  setAssignLnsSelectedProfile('');
                  setThingsstackInputMethod('manual');
                  setThingsstackFrequencyPlanId('EU_863_870');
                  setThingsstackMacVersion('MAC_V1_0_2');
                  setThingsstackPhyVersion('PHY_V1_0_2_REV_B');
                  setThingsstackBrandId('');
                  setThingsstackModelId('');
                }}
              >
                <option value="">LNS auswählen...</option>
                {LNS_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>{assignLnsSelectedLns === 'thingsstack' ? 'Application' : 'Offer / Contract'}</Form.Label>
              <Form.Select
                value={assignLnsSelectedOffer}
                onChange={(e) => {
                  setAssignLnsSelectedOffer(e.target.value);
                  setAssignLnsSelectedProfile('');
                }}
                disabled={
                  !assignLnsSelectedLns ||
                  (assignLnsSelectedLns === 'melita' && melitaOffersLoading) ||
                  (assignLnsSelectedLns === 'thingsstack' && thingsstackApplicationsLoading)
                }
              >
                <option value="">
                  {!assignLnsSelectedLns
                    ? 'Zuerst LNS auswählen'
                    : assignLnsSelectedLns === 'melita' && melitaOffersLoading
                      ? 'Lade Offers...'
                      : assignLnsSelectedLns === 'thingsstack' && thingsstackApplicationsLoading
                        ? 'Lade Applications...'
                      : assignLnsSelectedLns === 'melita'
                        ? 'Offer/Contract auswählen...'
                        : 'Application auswählen...'}
                </option>
                {assignLnsSelectedLns === 'melita' && melitaOffers.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
                {assignLnsSelectedLns === 'thingsstack' && thingsstackApplications.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </Form.Select>
              {assignLnsSelectedLns === 'melita' && melitaOffersError && (
                <Form.Text className="text-danger">{melitaOffersError}</Form.Text>
              )}
              {assignLnsSelectedLns === 'melita' && !melitaOffersError && (
                <Form.Text className="text-muted">
                  Offers werden aus dem Melita LNS geladen.
                </Form.Text>
              )}
              {assignLnsSelectedLns && assignLnsSelectedLns !== 'melita' && (
                <Form.Text className="text-muted">
                  Applications werden aus Thingsstack geladen (via mwconnections APIkey/URL).
                </Form.Text>
              )}
              {assignLnsSelectedLns === 'thingsstack' && thingsstackApplicationsError && (
                <Form.Text className="text-danger">{thingsstackApplicationsError}</Form.Text>
              )}
            </Form.Group>
            {assignLnsSelectedLns === 'thingsstack' && assignLnsSelectedOffer && (
              <>
                <Form.Group className="mb-3">
                  <Form.Label>Input method</Form.Label>
                  <Form.Select
                    value={thingsstackInputMethod}
                    onChange={(e) => {
                      const mode = e.target.value;
                      setThingsstackInputMethod(mode);
                      setThingsstackBrandId('');
                      setThingsstackModelId('');
                    }}
                  >
                    <option value="manual">Enter device specifics manually</option>
                    <option value="repository">Select device in Device Repository</option>
                  </Form.Select>
                </Form.Group>
                {thingsstackInputMethod === 'manual' && (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label>Frequency plan</Form.Label>
                      <Form.Select
                        value={thingsstackFrequencyPlanId}
                        onChange={(e) => setThingsstackFrequencyPlanId(e.target.value)}
                      >
                        <option value="EU_863_870">EU_863_870</option>
                        <option value="EU_863_870_TTN">EU_863_870_TTN</option>
                        <option value="US_902_928_FSB_2">US_902_928_FSB_2</option>
                      </Form.Select>
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>LoRaWAN MAC version</Form.Label>
                      <Form.Select
                        value={thingsstackMacVersion}
                        onChange={(e) => setThingsstackMacVersion(e.target.value)}
                      >
                        <option value="MAC_V1_0_2">MAC_V1_0_2</option>
                        <option value="MAC_V1_0_3">MAC_V1_0_3</option>
                        <option value="MAC_V1_1">MAC_V1_1</option>
                      </Form.Select>
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>LoRaWAN PHY version</Form.Label>
                      <Form.Select
                        value={thingsstackPhyVersion}
                        onChange={(e) => setThingsstackPhyVersion(e.target.value)}
                      >
                        <option value="PHY_V1_0_2_REV_B">PHY_V1_0_2_REV_B</option>
                        <option value="PHY_V1_0_3_REV_A">PHY_V1_0_3_REV_A</option>
                        <option value="PHY_V1_1_REV_B">PHY_V1_1_REV_B</option>
                      </Form.Select>
                    </Form.Group>
                  </>
                )}
                {thingsstackInputMethod === 'repository' && (
                  <>
                    <Form.Group className="mb-3">
                      <Form.Label>End device brand</Form.Label>
                      <Form.Select
                        value={thingsstackBrandId}
                        onChange={(e) => setThingsstackBrandId(e.target.value)}
                        disabled={thingsstackBrandsLoading}
                      >
                        <option value="">{thingsstackBrandsLoading ? 'Lade Brands...' : 'Brand auswählen...'}</option>
                        {thingsstackBrands.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </Form.Select>
                      {thingsstackBrandsError && <Form.Text className="text-danger">{thingsstackBrandsError}</Form.Text>}
                    </Form.Group>
                    <Form.Group className="mb-3">
                      <Form.Label>Model</Form.Label>
                      <Form.Select
                        value={thingsstackModelId}
                        onChange={(e) => setThingsstackModelId(e.target.value)}
                        disabled={!thingsstackBrandId || thingsstackModelsLoading}
                      >
                        <option value="">
                          {!thingsstackBrandId ? 'Zuerst Brand auswählen' : (thingsstackModelsLoading ? 'Lade Models...' : 'Model auswählen...')}
                        </option>
                        {thingsstackModels.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </Form.Select>
                      {thingsstackModelsError && <Form.Text className="text-danger">{thingsstackModelsError}</Form.Text>}
                    </Form.Group>
                  </>
                )}
              </>
            )}
            {assignLnsSelectedLns === 'melita' && assignLnsSelectedOffer && (
              <Form.Group className="mb-3">
                <Form.Label>Device Profile</Form.Label>
                <Form.Select
                  value={assignLnsSelectedProfile}
                  onChange={(e) => setAssignLnsSelectedProfile(e.target.value)}
                  disabled={melitaProfilesLoading}
                >
                  <option value="">
                    {melitaProfilesLoading ? 'Lade Device Profiles...' : 'Device Profile auswählen...'}
                  </option>
                  {melitaProfiles.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </Form.Select>
                {melitaProfilesError && (
                  <Form.Text className="text-danger">{melitaProfilesError}</Form.Text>
                )}
              </Form.Group>
            )}
            {assignLnsError && (
              <Alert variant="danger" onClose={() => setAssignLnsError(null)} dismissible>
                {assignLnsError}
              </Alert>
            )}
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => {
              setShowAssignLnsModal(false);
              setAssignLnsSelectedLns('');
              setAssignLnsSelectedOffer('');
              setAssignLnsSelectedProfile('');
              setThingsstackInputMethod('manual');
              setThingsstackFrequencyPlanId('EU_863_870');
              setThingsstackMacVersion('MAC_V1_0_2');
              setThingsstackPhyVersion('PHY_V1_0_2_REV_B');
              setThingsstackBrandId('');
              setThingsstackModelId('');
              setAssignLnsError(null);
            }}
            disabled={isAssigningLns}
          >
            Abbrechen
          </Button>
          <Button
            variant="primary"
            onClick={handleAssignLns}
            disabled={
              !assignLnsSelectedLns ||
              !assignLnsSelectedOffer ||
              (assignLnsSelectedLns === 'thingsstack' && thingsstackInputMethod === 'repository' && (!thingsstackBrandId || !thingsstackModelId)) ||
              (assignLnsSelectedLns === 'melita' && (!assignLnsSelectedOffer || !assignLnsSelectedProfile)) ||
              isAssigningLns
            }
          >
            {isAssigningLns ? (
              <>
                <Spinner animation="border" size="sm" className="me-2" />
                Wird zugewiesen...
              </>
            ) : (
              'Assign LNS'
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Excel Import Modal */}
      <Modal
        show={showImportModal}
        onHide={closeImportModal}
        size="xl"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            <FontAwesomeIcon icon={faFileExcel} className="me-2" />
            Excel Import
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {importStep === 'upload' && (
            <div className="text-center py-4">
              <FontAwesomeIcon icon={faUpload} size="3x" className="text-muted mb-3" />
              <h5>Excel-Datei hochladen</h5>
              <p className="text-muted">
                Wählen Sie eine Excel-Datei (.xlsx, .xls) oder CSV-Datei aus, die die Gerätedaten enthält.
              </p>
              <Form.Group>
                <Form.Control
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileUpload}
                  className="mb-3"
                />
              </Form.Group>
              <Alert variant="info" className="text-start">
                <strong>Unterstützte Datenbankfelder:</strong>
                <ul className="mb-0 mt-2">
                  <li><strong>Pflichtfelder:</strong> deveui, joineui, serialnbr</li>
                  <li><strong>Optionale Felder:</strong> devicenbr, devicename, appkey, brand_id, model_id, hardwareversion, firmwareversion, owner_id, group_id, distributor_id, status_id, invoicenbr, ordernbr, orderdate</li>
                </ul>
                <small className="text-muted">
                  Die Excel-Spalten werden im nächsten Schritt den Datenbankfeldern zugeordnet. Für jedes Feld kann auch ein fester Wert vergeben werden.
                </small>
              </Alert>
            </div>
          )}

          {importStep === 'mapping' && (
            <div>
              <h5>Spaltenzuordnung</h5>
              <p className="text-muted mb-3">
                Ordnen Sie die Excel-Spalten den Datenbankfeldern zu. Pflichtfelder sind mit * markiert.
              </p>
              
              {/* Inventory Database Fields */}
              <div className="row">
                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>devicenbr</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.devicenbr || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        devicenbr: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.devicenbr === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="text"
                        placeholder="Festen Wert eingeben..."
                        value={columnMapping.devicenbr_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          devicenbr_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>devicename</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.devicename || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        devicename: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.devicename === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="text"
                        placeholder="Festen Wert eingeben..."
                        value={columnMapping.devicename_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          devicename_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>deveui *</strong>
                      <span className="text-danger"> (Pflichtfeld)</span>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.deveui || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        deveui: e.target.value
                      })}
                    >
                      <option value="">-- Bitte auswählen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.deveui === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="text"
                        placeholder="Festen Wert eingeben..."
                        value={columnMapping.deveui_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          deveui_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>joineui *</strong>
                      <span className="text-danger"> (Pflichtfeld)</span>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.joineui || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        joineui: e.target.value
                      })}
                    >
                      <option value="">-- Bitte auswählen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.joineui === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="text"
                        placeholder="Festen Wert eingeben..."
                        value={columnMapping.joineui_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          joineui_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>serialnbr *</strong>
                      <span className="text-danger"> (Pflichtfeld)</span>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.serialnbr || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        serialnbr: e.target.value
                      })}
                    >
                      <option value="">-- Bitte auswählen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.serialnbr === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="text"
                        placeholder="Festen Wert eingeben..."
                        value={columnMapping.serialnbr_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          serialnbr_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>appkey</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.appkey || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        appkey: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>brand_id</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.brand_id || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        brand_id: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>model_id</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.model_id || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        model_id: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>hardwareversion</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.hardwareversion || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        hardwareversion: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>firmwareversion</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.firmwareversion || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        firmwareversion: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>owner_id</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.owner_id || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        owner_id: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>group_id</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.group_id || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        group_id: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>distributor_id</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.distributor_id || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        distributor_id: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>status_id</strong>
                      <span className="text-info ms-2">(wird automatisch auf 0 gesetzt)</span>
                    </Form.Label>
                    <Form.Control
                      type="text"
                      value="0 (automatisch gesetzt)"
                      disabled
                      className="bg-light"
                    />
                    <Form.Text className="text-muted">
                      Dieses Feld wird beim Import automatisch auf 0 gesetzt, unabhängig von der Excel-Zuordnung.
                    </Form.Text>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>invoicenbr</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.invoicenbr || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        invoicenbr: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>ordernbr</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.ordernbr || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        ordernbr: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.ordernbr === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="text"
                        placeholder="Festen Wert eingeben..."
                        value={columnMapping.ordernbr_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          ordernbr_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>

                <div className="col-md-6 mb-3">
                  <Form.Group>
                    <Form.Label>
                      <strong>orderdate</strong>
                    </Form.Label>
                    <Form.Select
                      value={columnMapping.orderdate || ''}
                      onChange={(e) => setColumnMapping({
                        ...columnMapping,
                        orderdate: e.target.value
                      })}
                    >
                      <option value="">-- Nicht zuordnen --</option>
                      <option value="__FIXED_VALUE__">-- Fester Wert --</option>
                      {excelHeaders.map((header, index) => (
                        <option key={index} value={header}>
                          {header} (Spalte {String.fromCharCode(65 + index)})
                        </option>
                      ))}
                    </Form.Select>
                    {columnMapping.orderdate === '__FIXED_VALUE__' && (
                      <Form.Control
                        type="date"
                        value={columnMapping.orderdate_fixed || ''}
                        onChange={(e) => setColumnMapping({
                          ...columnMapping,
                          orderdate_fixed: e.target.value
                        })}
                        className="mt-2"
                      />
                    )}
                  </Form.Group>
                </div>
              </div>

              <div className="d-flex justify-content-end">
                <Button variant="primary" onClick={handleColumnMapping}>
                  <FontAwesomeIcon icon={faCheck} className="me-2" />
                  Vorschau anzeigen
                </Button>
              </div>
            </div>
          )}

          {importStep === 'preview' && (
            <div>
              <h5>Import-Vorschau</h5>
              <p className="text-muted mb-3">
                Überprüfen Sie die ersten 5 Zeilen der zu importierenden Daten:
              </p>
              <div className="table-responsive" style={{ maxHeight: '400px' }}>
                <Table striped bordered hover size="sm">
                  <thead>
                    <tr>
                      {Object.keys(importPreview[0] || {}).filter(key => key !== '_rowIndex').map(key => (
                        <th key={key}>{key}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {importPreview.map((row, index) => (
                      <tr key={index}>
                        {Object.entries(row).filter(([key]) => key !== '_rowIndex').map(([key, value]) => (
                          <td key={key}>{value || '-'}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <Alert variant="warning" className="mt-3">
                <strong>Hinweis:</strong> Es werden {excelData.length} Zeilen importiert. 
                Die Vorschau zeigt nur die ersten 5 Zeilen.
              </Alert>
              <div className="d-flex justify-content-between">
                <Button variant="secondary" onClick={() => setImportStep('mapping')}>
                  <FontAwesomeIcon icon={faTimes} className="me-2" />
                  Zurück zur Zuordnung
                </Button>
                <Button variant="success" onClick={handleImport}>
                  <FontAwesomeIcon icon={faUpload} className="me-2" />
                  Import starten
                </Button>
              </div>
            </div>
          )}

          {importStep === 'importing' && (
            <div className="text-center py-4">
              <Spinner animation="border" size="lg" className="mb-3" />
              <h5>Import läuft...</h5>
              <p className="text-muted">
                Bitte warten Sie, während die Daten importiert werden.
              </p>
              <ProgressBar 
                now={importProgress} 
                label={`${importProgress}%`}
                className="mb-3"
              />
              <small className="text-muted">
                {excelData.length} Zeilen werden verarbeitet...
              </small>
            </div>
          )}

          {importStep === 'results' && importResults && (
            <div>
              <h5>Import abgeschlossen</h5>
              <Alert variant={importResults.errors === 0 ? 'success' : 'warning'}>
                <div className="d-flex justify-content-between align-items-center">
                  <div>
                    <strong>Import-Ergebnis:</strong>
                    <ul className="mb-0 mt-2">
                      <li>Erfolgreich importiert: {importResults.success}</li>
                      <li>Fehler: {importResults.errors}</li>
                    </ul>
                  </div>
                  <FontAwesomeIcon 
                    icon={importResults.errors === 0 ? faCheck : faExclamationTriangle} 
                    size="2x"
                    className={importResults.errors === 0 ? 'text-success' : 'text-warning'}
                  />
                </div>
              </Alert>

              {importResults.errorDetails.length > 0 && (
                <div className="mt-3">
                  <h6>Fehlerdetails:</h6>
                  <div className="table-responsive" style={{ maxHeight: '200px' }}>
                    <Table striped bordered hover size="sm">
                      <thead>
                        <tr>
                          <th>Zeile</th>
                          <th>Fehler</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importResults.errorDetails.slice(0, 10).map((error, index) => (
                          <tr key={index}>
                            <td>{error.row}</td>
                            <td className="text-danger">{error.error}</td>
                          </tr>
                        ))}
                      </tbody>
                    </Table>
                  </div>
                  {importResults.errorDetails.length > 10 && (
                    <small className="text-muted">
                      ... und {importResults.errorDetails.length - 10} weitere Fehler
                    </small>
                  )}
                </div>
              )}

              <div className="d-flex justify-content-end mt-3">
                <Button variant="primary" onClick={closeImportModal}>
                  Schließen
                </Button>
              </div>
            </div>
          )}
        </Modal.Body>
      </Modal>

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
            opacity: showScrollToTop ? 1 : 0.3 // Make it visible but dimmed when not needed
          }}
          onClick={scrollToTop}
          title="Nach oben scrollen"
        >
          <FontAwesomeIcon icon={faArrowUp} />
        </Button>
    </div>
  );
}

Inventory.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

export default Inventory; 