import { useSession } from "next-auth/react";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch, faEllipsisV, faUserEdit, faExclamationTriangle, faArrowUp } from "@fortawesome/free-solid-svg-icons";
import Layout from "@/components/Layout";
import { useState, useMemo, useEffect, useRef } from 'react';

function Inventory() {
  const { data: session } = useSession();
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

  // Fetch devices with retry mechanism
  const fetchDevices = async (retryCount = 0) => {
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
  };

  useEffect(() => {
    fetchDevices();
  }, []);

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
    if (tableContainerRef.current) {
      const handleTableScroll = (event) => {
        const scrollTop = event.target.scrollTop;
        setShowScrollToTop(scrollTop > 50); // Show button after scrolling 50px in table
      };

      tableContainerRef.current.addEventListener('scroll', handleTableScroll);
      
      return () => {
        if (tableContainerRef.current) {
          tableContainerRef.current.removeEventListener('scroll', handleTableScroll);
        }
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

  const handleActionClick = (deviceId) => {
    setActiveActionDropdown(activeActionDropdown === deviceId ? null : deviceId);
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
                  <div className="dropdown d-inline-block">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => handleActionClick(device.id)}
                      className="dropdown-toggle"
                      data-bs-toggle="dropdown"
                      aria-expanded="false"
                    >
                      <FontAwesomeIcon icon={faEllipsisV} />
                    </Button>
                    {activeActionDropdown === device.id && (
                      <ul className="dropdown-menu show position-absolute">
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