import { useSession } from "next-auth/react";
import { useRouter } from "next/router";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup, Alert, ProgressBar } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch, faEllipsisV, faUserEdit, faExclamationTriangle, faArrowUp, faFileExcel, faUpload, faCheck, faTimes, faCloudUpload } from "@fortawesome/free-solid-svg-icons";
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
    try {
      const response = await fetch('/api/inventory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(deviceData)
      });
      
      if (!response.ok) throw new Error('Fehler beim Erstellen des Geräts');
      
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
    setNewCustomerId(''); // Empty string means remove assignment
    setShowChangeCustomerModal(true);
    setActiveActionDropdown(null);
  };

  const handleSaveCustomerChange = async () => {
    if (!selectedCustomerForChange) return;
    
    // Check if we're trying to assign to the same customer (only if we're not removing assignment)
    if (newCustomerId && selectedCustomerForChange.customerid === newCustomerId) {
      setError('Der neue Customer ist identisch mit dem aktuellen Customer');
      return;
    }
    
    setIsUpdatingCustomer(true);
    setUpdateStatus(null);
    setError(null);
    
    try {
      // 1. Aktualisiere lokale Datenbank
      const localResponse = await fetch('/api/inventory', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...selectedCustomerForChange,
          customerid: newCustomerId === '__REMOVE__' ? null : newCustomerId
        })
      });
      
      if (!localResponse.ok) throw new Error('Fehler beim Ändern des Customers in der lokalen Datenbank');
      
      // 2. Aktualisiere ThingsBoard (nur wenn tbconnectionid vorhanden ist)
      let thingsboardSuccess = false;
      if (selectedCustomerForChange.tbconnectionid) {
        try {
          // Finde den aktuellen und neuen Customer für ThingsBoard
          const currentCustomer = devices.find(d => d.customerid === selectedCustomerForChange.customerid);
          const newCustomer = devices.find(d => d.customerid === newCustomerId);
          
          if (currentCustomer && selectedCustomerForChange.tbconnectionid) {
            // 1. Entferne die aktuelle Zuordnung (setze auf TENANT)
            const removeResponse = await fetch(`/api/thingsboard/owner?type=TENANT&customerId=${currentCustomer.customerid}&deviceId=${selectedCustomerForChange.tbconnectionid}`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify([])
            });
            
            if (!removeResponse.ok) {
              const removeError = await removeResponse.json().catch(() => ({}));
              console.warn('Fehler beim Entfernen der Customer-Zuordnung in ThingsBoard:', removeError);
            } else {
              console.log('Customer-Zuordnung erfolgreich entfernt');
            }
            
            // 2. Wenn ein neuer Customer zugewiesen wird, weise ihn zu
            if (newCustomerId && newCustomerId !== '__REMOVE__') {
              const newCustomer = devices.find(d => d.customerid === newCustomerId);
              if (newCustomer) {
                const assignResponse = await fetch(`/api/thingsboard/owner?type=CUSTOMER&customerId=${newCustomer.customerid}&deviceId=${selectedCustomerForChange.tbconnectionid}`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify([])
                });
                
                if (assignResponse.ok) {
                  thingsboardSuccess = true;
                  console.log('Customer erfolgreich in ThingsBoard neu zugeordnet');
                } else {
                  const assignError = await assignResponse.json().catch(() => ({}));
                  console.warn('ThingsBoard Neuzuordnung fehlgeschlagen:', assignError);
                }
              }
            } else {
              // Wenn kein neuer Customer oder __REMOVE__, dann war es eine Entfernung - ThingsBoard ist bereits auf TENANT gesetzt
              thingsboardSuccess = true;
              console.log('Customer-Zuordnung erfolgreich entfernt - Device ist jetzt dem Tenant zugeordnet');
            }
          }
        } catch (tbError) {
          console.warn('ThingsBoard Update fehlgeschlagen:', tbError);
        }
      } else {
        console.log('Keine tbconnectionid vorhanden - ThingsBoard Update übersprungen');
      }
      
      await fetchDevices(); // Refresh the list
      
      // Status setzen
      if (!selectedCustomerForChange.tbconnectionid) {
        setUpdateStatus({
          type: 'success',
          message: 'Customer erfolgreich in lokaler Datenbank geändert! (Keine ThingsBoard-Integration verfügbar)'
        });
      } else if (thingsboardSuccess) {
        if (newCustomerId && newCustomerId !== '__REMOVE__') {
          setUpdateStatus({
            type: 'success',
            message: `Customer erfolgreich von "${selectedCustomerForChange.customer_name}" zu "${devices.find(d => d.customerid === newCustomerId)?.customer_name}" geändert!`
          });
        } else {
          setUpdateStatus({
            type: 'success',
            message: `Customer-Zuordnung erfolgreich entfernt! Device "${selectedCustomerForChange.deviceLabel || selectedCustomerForChange.id}" ist jetzt dem Tenant zugeordnet.`
          });
        }
      } else {
        setUpdateStatus({
          type: 'warning',
          message: 'Customer in lokaler Datenbank geändert, aber ThingsBoard Update fehlgeschlagen. Bitte überprüfen Sie die Konsole für Details.'
        });
      }
      
      // Modal nach kurzer Verzögerung schließen
      setTimeout(() => {
        setShowChangeCustomerModal(false);
        setSelectedCustomerForChange(null);
        setNewCustomerId('');
        setUpdateStatus(null);
      }, 2000);
      
    } catch (err) {
      setError(err.message);
      setUpdateStatus({
        type: 'error',
        message: `Fehler: ${err.message}`
      });
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
        <h2 className="text-white">Inventory</h2>
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
            {Array.from(new Set(devices.map(d => d.customer_name).filter(Boolean))).sort().map(customer => (
              <option key={customer} value={customer}>{customer}</option>
            ))}
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
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Devicelabel</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Customer</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Brand</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Model</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Distributor</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Lieferschein</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Lieferdatum</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>DevEUI</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>JoinEUI</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Seriennummer</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Status</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Has Relation</th>
              <th className="text-start" style={{ backgroundColor: 'var(--bs-table-bg)', borderBottom: '2px solid var(--bs-border-color)' }}>Aktionen</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((device) => (
              <tr key={device.id}>
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
                <td>{device.serialnbr}</td>
                <td>{device.status}</td>
                <td>
                  <span className={`badge ${device.hasrelation ? 'bg-success' : 'bg-secondary'}`}>
                    {device.hasrelation ? 'True' : 'False'}
                  </span>
                </td>
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
                            disabled={device.tbconnectionid} // Disable if already exists in ThingsBoard
                          >
                            <FontAwesomeIcon icon={faCloudUpload} className="me-2" />
                            {device.tbconnectionid ? 'Bereits in ThingsBoard' : 'In ThingsBoard anlegen'}
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
              <Form.Label>Brand</Form.Label>
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
              <Form.Label>Model</Form.Label>
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
              <Form.Label>DevEUI</Form.Label>
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
              <Form.Label>JoinEUI</Form.Label>
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
              <Form.Label>Seriennummer</Form.Label>
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
        onHide={() => setShowChangeCustomerModal(false)}
        size="md"
        centered
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {newCustomerId ? 'Change Customer' : 'Remove Customer Assignment'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label>Aktueller Customer</Form.Label>
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
                {Array.from(new Set(devices.map(d => d.customer_name).filter(Boolean))).sort().map(customerName => {
                  const customerDevice = devices.find(d => d.customer_name === customerName);
                  return (
                    <option key={customerDevice.customerid} value={customerDevice.customerid}>
                      {customerName}
                    </option>
                  );
                })}
              </Form.Select>
              {newCustomerId === '__REMOVE__' && (
                <Form.Text className="text-warning">
                  <strong>Warnung:</strong> Das Gerät wird dem Tenant zugeordnet und die Customer-ID wird aus der lokalen Datenbank entfernt.
                </Form.Text>
              )}
            </Form.Group>
            
            {/* ThingsBoard-Status */}
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
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowChangeCustomerModal(false)}>
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
              newCustomerId === '__REMOVE__' ? 'Customer-Zuordnung entfernen' : 'Customer ändern'
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