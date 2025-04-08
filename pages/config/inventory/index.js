import { useSession } from "next-auth/react";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import Layout from "@/components/Layout";
import { useState, useMemo, useEffect } from 'react';

function Inventory() {
  const { data: session } = useSession();
  const [devices, setDevices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [modalMode, setModalMode] = useState('view'); // 'view', 'edit', 'add'

  // Fetch devices
  const fetchDevices = async () => {
    try {
      const response = await fetch('/api/inventory');
      if (!response.ok) throw new Error('Fehler beim Laden der Geräte');
      const data = await response.json();
      setDevices(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDevices();
  }, []);

  // Filter devices based on search term
  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    if (!searchTerm) return devices;

    const searchLower = searchTerm.toLowerCase();
    return devices.filter(device => 
      device.devicename?.toLowerCase().includes(searchLower) ||
      device.devicenbr?.toLowerCase().includes(searchLower) ||
      device.deveui?.toLowerCase().includes(searchLower)
    );
  }, [devices, searchTerm]);

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

  const handleClose = () => {
    setShowModal(false);
    setSelectedDevice(null);
    setModalMode('view');
  };

  const handleRowClick = (device) => {
    setSelectedDevice(device);
    setModalMode('view');
    setShowModal(true);
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  return (
    <div className="container mt-4">
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
          {error}
        </div>
      )}

      {/* Search Bar */}
      <div className="mb-4">
        <InputGroup>
          <InputGroup.Text>
            <FontAwesomeIcon icon={faSearch} />
          </InputGroup.Text>
          <Form.Control
            placeholder="Suche nach Gerätenummer, Name oder DevEUI..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </InputGroup>
      </div>

      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Gerätenummer</th>
            <th>Name</th>
            <th>DevEUI</th>
            <th>JoinEUI</th>
            <th>Seriennummer</th>
            <th>Status</th>
            <th>Aktionen</th>
          </tr>
        </thead>
        <tbody>
          {filteredDevices.map((device) => (
            <tr key={device.id}>
              <td>{device.devicenbr}</td>
              <td>{device.devicename}</td>
              <td>{device.deveui}</td>
              <td>{device.joineui}</td>
              <td>{device.serialnbr}</td>
              <td>{device.status}</td>
              <td>
                <Button
                  variant="info"
                  size="sm"
                  className="me-2"
                  onClick={() => handleRowClick(device)}
                >
                  <FontAwesomeIcon icon={faEdit} />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(device.id)}
                >
                  <FontAwesomeIcon icon={faTrash} />
                </Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>

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
              <Form.Label>Gerätenummer</Form.Label>
              <Form.Control
                type="text"
                value={selectedDevice?.devicenbr || ''}
                onChange={(e) => setSelectedDevice({
                  ...selectedDevice,
                  devicenbr: e.target.value
                })}
                disabled={modalMode === 'view'}
              />
            </Form.Group>
            {/* Weitere Formularfelder hier */}
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
    </div>
  );
}

Inventory.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

export default Inventory; 