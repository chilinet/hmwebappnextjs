import { useSession } from "next-auth/react";
import { Table, Spinner, Button, Modal, Nav, Tab, Form, InputGroup, FormControl } from "react-bootstrap";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEdit, faTrash, faPlus, faSearch } from "@fortawesome/free-solid-svg-icons";
import Layout from "@/components/Layout";
import { useDevices } from '@/lib/hooks/useDevices';
import { useState, useMemo, useEffect } from 'react';
import { useThingsboard } from '@/contexts/ThingsboardContext';

function Devices() {
  const { data: session } = useSession();
  const { tbToken, isLoading } = useThingsboard();
  const { data: devices, error } = useDevices(tbToken);
  const [selectedDevice, setSelectedDevice] = useState(null);
  const [showModal, setShowModal] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedType, setSelectedType] = useState('all');

  // Filter devices based on search term
  const filteredDevices = useMemo(() => {
    if (!devices) return [];
    if (!searchTerm) return devices;

    const searchLower = searchTerm.toLowerCase();
    return devices.filter(device => {
      const matchesSearch = 
        device.name.toLowerCase().includes(searchLower) ||
        device.label.toLowerCase().includes(searchLower) ||
        device.type.toLowerCase().includes(searchLower) ||
        device.asset?.pathString?.toLowerCase().includes(searchLower);

      const matchesType = selectedType === 'all' || device.type === selectedType;

      return matchesSearch && matchesType;
    });
  }, [devices, searchTerm, selectedType]);

  const handleClose = () => {
    setShowModal(false);
    setSelectedDevice(null);
  };

  const handleRowClick = (device) => {
    setSelectedDevice(device);
    setShowModal(true);
  };

  if (isLoading || !tbToken) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ height: '100vh' }}>
        <Spinner animation="border" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mt-4">
        <div className="alert alert-danger">
          Error loading devices: {error.message}
        </div>
      </div>
    );
  }

  if (!devices) {
    return (
      <div className="container mt-4">
        <div className="alert alert-info">
          Keine Geräte gefunden
        </div>
      </div>
    );
  }

  return (
    <div className="container mt-4">
      <div className="d-flex justify-content-between align-items-center mb-4">
        <h2 className="text-white">Geräte</h2>
      </div>

      {/* Search Bar */}
      <div className="mb-4">
        <InputGroup>
          <InputGroup.Text style={{ 
            backgroundColor: '#34495E', 
            borderColor: '#2C3E50',
            color: 'white'
          }}>
            <FontAwesomeIcon icon={faSearch} />
          </InputGroup.Text>
          <FormControl
            placeholder="Suche nach Gerät, Label, Typ oder Pfad..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              backgroundColor: '#2C3E50',
              borderColor: '#34495E',
              color: 'white',
              '&::placeholder': {
                color: 'rgba(255, 255, 255, 0.5)'
              }
            }}
          />
        </InputGroup>
      </div>

      <div style={{ 
        position: 'relative', 
        height: 'calc(100vh - 260px)', // Adjusted for search bar
        overflow: 'auto'
      }}>
        <Table 
          striped 
          bordered 
          hover 
          variant="dark" 
          className="shadow"
          style={{
            backgroundColor: '#2C3E50',
            borderColor: '#34495E',
            position: 'relative',
            borderCollapse: 'separate',
            borderSpacing: 0,
          }}
        >
          <thead style={{
            position: 'sticky',
            top: 0,
            zIndex: 1,
            backgroundColor: '#34495E',
          }}>
            <tr style={{ backgroundColor: '#34495E' }}>
              <th>Name</th>
              <th>Label</th>
              <th>Typ</th>
              <th>Pfad</th>
              <th>Batterie</th>
              <th>FCnt</th>
              <th>Ventil</th>
              <th>RSSI</th>
              <th>SF</th>
              <th>SNR</th>
              <th>Status</th>
              <th>Letzte Aktivität</th>
            </tr>
          </thead>
          <tbody>
            {filteredDevices.map((device) => (
              <tr 
                key={device.id}
                onClick={() => handleRowClick(device)}
                style={{ 
                  cursor: 'pointer',
                  '&:hover': {
                    backgroundColor: '#34495E'
                  }
                }}
              >
                <td>{device.name}</td>
                <td>{device.label}</td>
                <td>{device.type}</td>
                <td>{device.asset?.pathString || '-'}</td>
                <td>
                  {device.telemetry?.batteryVoltage ? (
                    <div className="text-white">{device.telemetry.batteryVoltage}V</div>
                  ) : '-'}
                </td>
                <td>
                  {device.telemetry?.fCnt || '-'}
                </td>
                <td>
                  {device.telemetry?.PercentValveOpen !== undefined ? (
                    <div className="text-white">
                      {Math.round(device.telemetry.PercentValveOpen)}%
                    </div>
                  ) : '-'}
                </td>
                <td>
                  {device.telemetry?.rssi ? (
                    <div className="text-white">{device.telemetry.rssi}dBm</div>
                  ) : '-'}
                </td>
                <td>
                  {device.telemetry?.sf || '-'}
                </td>
                <td>
                  {device.telemetry?.snr ? `${device.telemetry.snr}dB` : '-'}
                </td>
                <td>
                  <span className={`badge ${device.active ? 'bg-success' : 'bg-danger'}`}>
                    {device.active ? 'Aktiv' : 'Inaktiv'}
                  </span>
                </td>
                <td className="text-white">
                  {device.telemetry?.lastActivityTime ? 
                    new Date(parseInt(device.telemetry.lastActivityTime)).toLocaleString('de-DE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    }) : 
                    device.lastActivityTime ? 
                      new Date(parseInt(device.lastActivityTime)).toLocaleString('de-DE', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                        second: '2-digit'
                      }) : 
                      'Nie'
                  }
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
        backdrop="static"
        className="custom-modal"
      >
        <Modal.Header closeButton style={{ backgroundColor: '#2C3E50', color: 'white' }}>
          <Modal.Title>{selectedDevice?.name}</Modal.Title>
        </Modal.Header>
        <Modal.Body style={{ backgroundColor: '#2C3E50', color: 'white' }}>
          <Tab.Container defaultActiveKey="settings">
            <Nav variant="tabs" className="mb-3">
              <Nav.Item>
                <Nav.Link 
                  eventKey="settings"
                  style={{ 
                    color: 'white',
                    backgroundColor: 'transparent',
                    border: '1px solid #34495E'
                  }}
                >
                  Einstellungen
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link 
                  eventKey="history"
                  style={{ 
                    color: 'white',
                    backgroundColor: 'transparent',
                    border: '1px solid #34495E'
                  }}
                >
                  Historische Daten
                </Nav.Link>
              </Nav.Item>
            </Nav>
            <Tab.Content>
              <Tab.Pane eventKey="settings">
                <div className="p-3">
                  <h5>Geräteinformationen</h5>
                  <div className="mb-3">
                    <strong>ID:</strong> {selectedDevice?.id}
                  </div>
                  <div className="mb-3">
                    <strong>Typ:</strong> {selectedDevice?.type}
                  </div>
                  <div className="mb-3">
                    <strong>Label:</strong> {selectedDevice?.label}
                  </div>
                  {/* Weitere Geräteinformationen hier */}
                </div>
              </Tab.Pane>
              <Tab.Pane eventKey="history">
                <div className="p-3">
                  <h5>Historische Daten</h5>
                  {/* Hier kommt später die Implementierung der historischen Daten */}
                  <p>Historische Daten werden hier angezeigt...</p>
                </div>
              </Tab.Pane>
            </Tab.Content>
          </Tab.Container>
        </Modal.Body>
      </Modal>
    </div>
  );
}

Devices.getLayout = function getLayout(page) {
  return <Layout>{page}</Layout>;
};

export default Devices; 