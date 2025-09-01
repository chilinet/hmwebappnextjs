import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBuilding, faIndustry, faMicrochip, faChevronDown, faChevronRight, faRotateRight, faPlus, faCheck, faXmark, faMinus, faSearch, faTimes, faImage, faUpload, faTrash, faEye, faStar, faEdit } from '@fortawesome/free-solid-svg-icons';
import { Tree } from '@minoru/react-dnd-treeview';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export default function Structure() {
  const router = useRouter();
  const { data: session, status } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

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

  // Show loading or access denied if not Superadmin
  if (status === 'loading') {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="spinner-border" role="status">
          <span className="visually-hidden">Loading...</span>
        </div>
      </div>
    );
  }

  if (!session || session.user?.role !== 1) {
    return (
      <div className="d-flex justify-content-center align-items-center" style={{ minHeight: '400px' }}>
        <div className="text-center">
          <h3>Keine Berechtigung</h3>
          <p>Sie haben keine Berechtigung, diese Seite aufzurufen.</p>
          <button 
            className="btn btn-primary"
            onClick={() => router.push('/config')}
          >
            Zurück zur Konfiguration
          </button>
        </div>
      </div>
    );
  }

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [customerData, setCustomerData] = useState(null);
  const [openNodes, setOpenNodes] = useState([]);
  const [windowHeight, setWindowHeight] = useState(0);
  const [selectedNode, setSelectedNode] = useState(null);
  const [nodeDetails, setNodeDetails] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [editedDetails, setEditedDetails] = useState(null);
  const [assetProfiles, setAssetProfiles] = useState([]);
  const [isNewNode, setIsNewNode] = useState(false);
  const [draggedNode, setDraggedNode] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [devices, setDevices] = useState([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [activeTab, setActiveTab] = useState('details');
  const [unassignedDevices, setUnassignedDevices] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [assignedSearchTerm, setAssignedSearchTerm] = useState('');
  const [assigningDevice, setAssigningDevice] = useState(false);
  const [unassigningDevice, setUnassigningDevice] = useState(null);
  const [editingLabel, setEditingLabel] = useState(null);
  const [editedLabel, setEditedLabel] = useState('');
  const [savingLabel, setSavingLabel] = useState(null);
  const [treeSearchTerm, setTreeSearchTerm] = useState('');
  const [lastUnassignedFetch, setLastUnassignedFetch] = useState(null);
  const [loadingUnassignedDevices, setLoadingUnassignedDevices] = useState(false);
  const [customerPrefix, setCustomerPrefix] = useState('');
  const [lastNodeId, setLastNodeId] = useState(0);
  const [operationalMode, setOperationalMode] = useState('0');
  
  // Image upload states
  const [images, setImages] = useState([]);
  const [loadingImages, setLoadingImages] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [selectedImage, setSelectedImage] = useState(null);
  const [showImageModal, setShowImageModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingImage, setEditingImage] = useState(null);
  const [imageDescription, setImageDescription] = useState('');
  const [imageFile, setImageFile] = useState(null);
  const [imageType, setImageType] = useState('Raum');
  const [imageText, setImageText] = useState('');
  const [selectedDevice, setSelectedDevice] = useState('');
  const [heaterDevices, setHeaterDevices] = useState([]);
  const [operationalDevice, setOperationalDevice] = useState('');

  useEffect(() => {
    if (session?.token) {
      fetchUserData();
    }
  }, [session]);

  useEffect(() => {
    if (customerData?.customerid) {
      fetchTreeData();
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
    if (nodeDetails) {
      setEditedDetails(nodeDetails);
      // Setze den operationalDevice basierend auf den geladenen Daten
      if (nodeDetails.operationalDevice) {
        setOperationalDevice(nodeDetails.operationalDevice);
      } else {
        setOperationalDevice('');
      }
    }
  }, [nodeDetails]);

  useEffect(() => {
    fetchAssetProfiles();
  }, [session]);

  useEffect(() => {
    if (selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      setLoadingDevices(true);
      fetchDevices(selectedNode.id)
        .then(data => setDevices(data.assigned))
        .finally(() => setLoadingDevices(false));
    } else {
      setDevices([]);
    }
  }, [selectedNode]);

  useEffect(() => {
    if (customerData?.customerid) {
      fetchCustomerSettings();
    }
  }, [customerData]);

  // Load images when a node is selected
  useEffect(() => {
    if (selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      fetchImages(selectedNode.id);
    } else {
      setImages([]);
    }
  }, [selectedNode]);

  // Load devices when image type changes to "Heizkörper"
  useEffect(() => {
    if (imageType === 'Heizkörper' && selectedNode?.id && !selectedNode.id.startsWith('temp_')) {
      console.log('Lade Geräte für Node:', selectedNode.id);
      fetchHeaterDevices(selectedNode.id);
    } else {
      setHeaterDevices([]);
      setSelectedDevice('');
    }
  }, [imageType, selectedNode]);

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
    //console.log('Converting nodes:', nodes); // Debug: Eingangsdaten
    return nodes.flatMap(node => {
      const hasChildren = node.children && node.children.length > 0;
      
      const treeNode = {
        id: node.id,
        parent: parentId,
        droppable: true,  // Alle Nodes als droppable markieren, unabhängig von hasChildren
        text: node.label || node.name,
        type: node.type,
        hasDevices: node.hasDevices,
        label: node.label,
        name: node.name,
        operationalMode: node.operationalMode || '0',
        operationalDevice: node.operationalDevice || '',
        relatedDevices: node.relatedDevices || []
      };
      //console.log('Created tree node:', treeNode); // Debug: Konvertierte Daten
      
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
      //console.log('Fetched data:', data); // Debug: API-Antwort
      const formattedData = convertToTreeViewFormat(data);
      //console.log('Formatted tree data:', formattedData); // Debug: Formatierte Daten
      setTreeData(formattedData);
    } catch (error) {
      console.error('Error fetching tree data:', error);
      setError('Fehler beim Laden der Strukturdaten');
    } finally {
      setLoading(false);
    }
  };

  // Funktion zum Sammeln der IDs der ersten beiden Ebenen
  const getInitialOpenNodes = (nodes, level = 0) => {
    if (level >= 2) return [];
    
    return nodes.reduce((acc, node) => {
      // Füge alle Nodes bis zum 2. Level hinzu
      const result = [...acc, node.id];
      
      // Wenn wir noch nicht beim 2. Level sind und die Node Kinder hat, öffne sie auch
      if (level < 1 && node.droppable && node.children && node.children.length > 0) {
        result.push(...getInitialOpenNodes(node.children, level + 1));
      }
      
      return result;
    }, []);
  };

  // Setze die offenen Nodes nach dem Laden der Daten
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
      
      // Setze den operationalMode basierend auf den geladenen Daten
      if (data.operationalMode !== undefined) {
        setOperationalMode(data.operationalMode.toString());
      } else {
        setOperationalMode('0');
      }
    } catch (error) {
      console.error('Error fetching node details:', error);
      setError('Fehler beim Laden der Node-Details');
    } finally {
      setLoadingDetails(false);
    }
  };

  const handleNodeSelect = (node) => {
    setSelectedNode(node);
    fetchNodeDetails(node.id);
  };

  const handleAddNode = (parentNode) => {
    // Generiere die neue Node-Nummer
    const newNodeNumber = (lastNodeId + 1).toString().padStart(4, '0');
    const generatedName = `${customerPrefix}_${newNodeNumber}`;
    
    const tempNode = {
      id: 'temp_' + Date.now(),
      parent: parentNode.id,
      text: generatedName,
      data: {
        type: '',
        label: '',
        name: generatedName
      }
    };
    
    setSelectedNode(tempNode);
    setEditedDetails({
      name: generatedName,
      label: '',
      type: '',
      operationalMode: '0',
      operationalDevice: ''
    });
    setOperationalMode('0');
    setOperationalDevice('');
    setIsNewNode(true);
  };

  const handleDrop = async (node, parent) => {
    try {
      console.log('Moving node:', node.id, 'to parent:', parent.id);
      
      // Nur UI-Aktualisierung, keine API-Calls
      const newTree = treeData.map(item => {
        if (item.id === node.id) {
          return { ...item, parent: parent.id };
        }
        return item;
      });
      setTreeData(newTree);
      
      // Zeige die Bestätigungsbuttons
      setDraggedNode(node);
      setDropTarget(parent);
      setShowConfirmation(true);

    } catch (error) {
      console.error('Error moving node:', error);
      setError('Fehler beim Verschieben des Elements');
      await fetchTreeData(); // Reset bei Fehler
    }
  };

  const handleConfirmMove = async () => {
    try {
      // Jetzt den API-Call durchführen
      const response = await fetch(`/api/config/assets/${draggedNode.id}/move`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          newParentId: dropTarget.id
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.message || 'Failed to move node');
      }

      await fetchTreeData(); // Aktualisiere den Tree nach erfolgreicher Speicherung
    } catch (error) {
      console.error('Error confirming move:', error);
      setError('Fehler beim Speichern der Verschiebung');
      await fetchTreeData(); // Reset bei Fehler
    } finally {
      setShowConfirmation(false);
      setDraggedNode(null);
      setDropTarget(null);
    }
  };

  const handleCancelMove = async () => {
    try {
      // Mache die Änderung rückgängig
      await fetchTreeData();
    } finally {
      setShowConfirmation(false);
      setDraggedNode(null);
      setDropTarget(null);
    }
  };

  const handleDelete = async (e) => {
    e.stopPropagation();
    if (window.confirm('Möchten Sie diesen Eintrag wirklich löschen?')) {
      try {
        const response = await fetch(`/api/config/assets/${selectedNode.id}`, {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        });

        if (!response.ok) {
          throw new Error('Failed to delete node');
        }

        await fetchTreeData(); // Tree neu laden
        setSelectedNode(null); // Selektion aufheben wenn der gelöschte Node selektiert war
        setNodeDetails(null);
      } catch (error) {
        console.error('Error deleting node:', error);
        setError('Fehler beim Löschen des Elements');
      }
    }
  };

  const CustomNode = ({ node, onToggle, dragHandle, isOpen }) => {
    const isSelected = selectedNode && selectedNode.id === node.id;
    const isMoving = draggedNode && draggedNode.id === node.id;
    
    // Prüfen ob der Node tatsächlich Kinder im Tree hat
    const hasChildren = treeData.some(item => item.parent === node.id);
    
    const getIcon = (type) => {
      switch (type?.toLowerCase()) {
        case 'area':
          return faIndustry;
        case 'building':
          return faBuilding;
        case 'property':
          return faBuilding;
        case 'floor':
          return faBuilding;
        case 'room':
          return faMicrochip;
        default:
          return faMicrochip;
      }
    };

    return (
      <div
        style={{
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          padding: '4px 8px',
          backgroundColor: isSelected ? '#fd7e14' : 'transparent',
          borderRadius: '4px',
          width: '100%',
          justifyContent: 'space-between'
        }}
        ref={dragHandle}
        onClick={() => handleNodeSelect(node)}
        className={`tree-node ${isSelected ? 'selected-node' : ''}`}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {hasChildren && ( // Nur anzeigen wenn tatsächlich Kinder vorhanden sind
            <div onClick={(e) => {
              e.stopPropagation();
              onToggle(node.id);
            }} style={{ cursor: 'pointer', padding: '0 4px' }}>
              <FontAwesomeIcon
                icon={isOpen ? faChevronDown : faChevronRight}
                className="me-2 text-secondary"
              />
            </div>
          )}
          <FontAwesomeIcon
            icon={getIcon(node.data?.type)}
            className={`me-2 ${node.data?.hasDevices ? 'text-warning' : 'text-secondary'}`}
          />
                          <span className={node.data?.hasDevices ? 'text-warning' : ''}>
            {node.text}
          </span>
        </div>
        
        <div className="d-flex align-items-center">
          {/* Bestätigungsbuttons */}
          {isMoving && showConfirmation && (
            <div className="d-flex gap-2 me-2">
              <button
                className="btn btn-sm btn-success"
                onClick={(e) => {
                  e.stopPropagation();
                  handleConfirmMove();
                }}
              >
                <FontAwesomeIcon icon={faCheck} />
              </button>
              <button
                className="btn btn-sm btn-danger"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCancelMove();
                }}
              >
                <FontAwesomeIcon icon={faXmark} />
              </button>
            </div>
          )}

          {/* Delete Button - nur anzeigen wenn Node selektiert ist UND keine Kinder hat */}
          {isSelected && !hasChildren && (
            <button
              className="btn btn-sm btn-outline-danger me-2"
              onClick={handleDelete}
              style={{
                padding: '0.1rem 0.3rem',
                fontSize: '0.8rem'
              }}
              title="Löschen"
            >
              <FontAwesomeIcon icon={faMinus} />
            </button>
          )}

          {/* Add Node Button - nur anzeigen wenn Node selektiert ist */}
          {isSelected && (
            <button
              className="btn btn-sm btn-outline-light"
              onClick={(e) => {
                e.stopPropagation();
                handleAddNode(node);
              }}
              style={{
                padding: '0.1rem 0.3rem',
                fontSize: '0.8rem'
              }}
              title="Hinzufügen"
            >
              <FontAwesomeIcon icon={faPlus} />
            </button>
          )}
        </div>
      </div>
    );
  };

  const handleInputChange = (field, value) => {
    setEditedDetails(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleOperationalModeChange = (value) => {
    setOperationalMode(value);
    setEditedDetails(prev => ({
      ...prev,
      operationalMode: value
    }));
    // Reset device selection when mode changes
    if (value !== '2' && value !== '10') {
      setOperationalDevice('');
      setEditedDetails(prev => ({
        ...prev,
        operationalDevice: ''
      }));
    }
  };

  const handleOperationalDeviceChange = (deviceId) => {
    setOperationalDevice(deviceId);
    setEditedDetails(prev => ({
      ...prev,
      operationalDevice: deviceId
    }));
  };

  const saveChanges = async () => {
    if (!editedDetails || !selectedNode || !customerData) return;
    
    setLoadingDetails(true);
    try {
      if (isNewNode) {
        // Erstelle neues Asset in Thingsboard
        const assetResponse = await fetch('/api/config/assets', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            ...editedDetails,
            operationalMode: operationalMode,
            operationalDevice: operationalDevice
          })
        });

        if (!assetResponse.ok) {
          throw new Error('Failed to create asset');
        }

        const newAsset = await assetResponse.json();

        // Speichere die Device-ID als Attribut extTempDevice am Asset
        if (operationalDevice && (operationalMode === '2' || operationalMode === '10')) {
          const attributesResponse = await fetch(`/api/config/assets/${newAsset.id.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.token}`
            },
            body: JSON.stringify({
              extTempDevice: operationalDevice
            })
          });

          if (!attributesResponse.ok) {
            console.warn('Failed to save extTempDevice attribute, but asset was created');
          }
        }

        // Create relation to parent node
        const relationResponse = await fetch('/api/config/relations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            fromId: selectedNode.parent,
            fromType: 'ASSET',
            toId: newAsset.id.id,
            toType: 'ASSET',
            relationType: 'Contains'
          })
        });

        if (!relationResponse.ok) {
          throw new Error('Failed to create relation');
        }
        
        const updateResponse = await fetch(`/api/config/customers/${customerData.customerid}/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            lastnodeid: lastNodeId + 1
          })
        });

        if (updateResponse.ok) {
          setLastNodeId(prev => prev + 1);
        }

        // Update Tree
        const treeResponse = await fetch(`/api/config/customers/${customerData.customerid}/tree`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            parentId: selectedNode.parent,
            nodeData: {
              id: newAsset.id.id,
              name: editedDetails.name,
              type: editedDetails.type,
              label: editedDetails.label,
              operationalMode: operationalMode,
              operationalDevice: operationalDevice
            }
          })
        });

        if (!treeResponse.ok) {
          throw new Error('Failed to update tree');
        }

        setIsNewNode(false);
      } else {
        // Bestehenden Node aktualisieren (bisherige Logik)
        const assetResponse = await fetch(`/api/config/assets/${selectedNode.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            ...editedDetails,
            operationalMode: operationalMode,
            operationalDevice: operationalDevice
          })
        });

        if (!assetResponse.ok) {
          throw new Error('Failed to update asset');
        }

        // Speichere die Device-ID als Attribut extTempDevice am Asset
        if (operationalDevice && (operationalMode === '2' || operationalMode === '10')) {
          const attributesResponse = await fetch(`/api/config/assets/${selectedNode.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.token}`
            },
            body: JSON.stringify({
              extTempDevice: operationalDevice
            })
          });

          if (!attributesResponse.ok) {
            console.warn('Failed to save extTempDevice attribute, but asset was updated');
          }
        } else {
          // Wenn kein externes Gerät ausgewählt ist, entferne das Attribut
          const attributesResponse = await fetch(`/api/config/assets/${selectedNode.id}`, {
            method: 'PUT',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${session.token}`
            },
            body: JSON.stringify({
              extTempDevice: null
            })
          });

          if (!attributesResponse.ok) {
            console.warn('Failed to remove extTempDevice attribute');
          }
        }

        // Update Tree
        const treeResponse = await fetch(`/api/config/customers/${customerData.customerid}/tree`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            nodeId: selectedNode.id,
            name: editedDetails.name,
            type: editedDetails.type,
            label: editedDetails.label,
            operationalMode: operationalMode,
            operationalDevice: operationalDevice
          })
        });

        if (!treeResponse.ok) {
          throw new Error('Failed to update tree');
        }
      }

      // Aktualisiere die UI
      setNodeDetails(editedDetails);
      
      // Tree neu laden
      await fetchTreeData();

    } catch (error) {
      console.error('Error updating node:', error);
      setError('Fehler beim Speichern der Änderungen');
    } finally {
      setLoadingDetails(false);
    }
  };

  const fetchAssetProfiles = async () => {
    if (!session?.token) return;
    
    try {
      const response = await fetch('/api/config/assetProfiles', {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch asset profiles');
      }

      const data = await response.json();
      // Überprüfen der Datenstruktur und setzen der Profile
      const profiles = Array.isArray(data) ? data : data.data || [];
      setAssetProfiles(profiles);
    } catch (error) {
      console.error('Error fetching asset profiles:', error);
      setError('Fehler beim Laden der Asset-Profile');
    }
  };

  const fetchUnassignedDevices = async () => {
    if (loadingUnassignedDevices) return;
    
    setLoadingUnassignedDevices(true);
    try {
      const response = await fetch(`/api/config/devices/unassigned`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch unassigned devices');
      }

      const data = await response.json();
      setUnassignedDevices(data);
      setLastUnassignedFetch(Date.now());
    } catch (error) {
      console.error('Error fetching unassigned devices:', error);
      setError('Fehler beim Laden der nicht zugeordneten Geräte');
    } finally {
      setLoadingUnassignedDevices(false);
    }
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
      setDevices(data.assigned);
      
      // Aktualisiere die nicht zugeordneten Geräte nur wenn:
      // 1. Sie noch nie geladen wurden
      // 2. Der letzte Fetch ist älter als 5 Minuten
      // 3. Nach einer Zuordnungs-/Entfernungsaktion
      if (!lastUnassignedFetch || Date.now() - lastUnassignedFetch > 300000) {
        await fetchUnassignedDevices();
      }
      
      return data;
    } catch (error) {
      console.error('Error fetching devices:', error);
      setError('Fehler beim Laden der Geräte');
      return { assigned: [], unassigned: [] };
    }
  };

  // Hilfsfunktion zum Finden des SerialNbr-Attributs
  const getSerialNumber = (device) => {
    const attributes = device.serverAttributes || {};
    return attributes.serialNbr || 
           attributes.serialNumber || 
           attributes.SerialNbr || 
           attributes.SerialNumber || 
           attributes.serial || 
           attributes.Serial || 
           '-';
  };

  // Funktion zum Filtern der zugeordneten Geräte
  const filteredAssignedDevices = (devices || []).filter(device => {
    if (!device) return false;
    const searchLower = (assignedSearchTerm || '').toLowerCase();
    const serialNumber = getSerialNumber(device).toLowerCase();
    return (
      (device.name || '').toLowerCase().includes(searchLower) ||
      (device.label && device.label.toLowerCase().includes(searchLower)) ||
      (device.type || '').toLowerCase().includes(searchLower) ||
      serialNumber.includes(searchLower)
    );
  });

  // Funktion zum Filtern der nicht zugeordneten Geräte
  const filteredUnassignedDevices = (unassignedDevices || []).filter(device => {
    if (!device) return false;
    const searchLower = (searchTerm || '').toLowerCase();
    const serialNumber = getSerialNumber(device).toLowerCase();
    return (
      (device.name || '').toLowerCase().includes(searchLower) ||
      (device.label && device.label.toLowerCase().includes(searchLower)) ||
      (device.type || '').toLowerCase().includes(searchLower) ||
      serialNumber.includes(searchLower)
    );
  });

  const handleAssignDevice = async (deviceId) => {
    if (!selectedNode || !deviceId) {
      setError('Kein Node ausgewählt oder ungültige Device ID');
      return;
    }

    setAssigningDevice(true);
    try {
      const response = await fetch('/api/config/relations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          fromId: selectedNode.id,
          fromType: 'ASSET',
          toId: deviceId,
          toType: 'DEVICE',
          relationType: 'Contains'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to assign device');
      }

      await fetchDevices(selectedNode.id);
      await fetchUnassignedDevices(); // Aktualisiere die nicht zugeordneten Geräte

    } catch (error) {
      console.error('Error assigning device:', error);
      setError('Fehler beim Zuordnen des Geräts');
    } finally {
      setAssigningDevice(false);
    }
  };

  const handleUnassignDevice = async (deviceId) => {
    if (!selectedNode || !deviceId) {
      setError('Kein Node ausgewählt oder ungültige Device ID');
      return;
    }

    setUnassigningDevice(deviceId);
    try {
      const response = await fetch('/api/config/relations', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          fromId: selectedNode.id,
          fromType: 'ASSET',
          toId: deviceId,
          toType: 'DEVICE',
          relationType: 'Contains'
        })
      });

      if (!response.ok) {
        throw new Error('Failed to unassign device');
      }

      await fetchDevices(selectedNode.id);
      await fetchUnassignedDevices(); // Aktualisiere die nicht zugeordneten Geräte

    } catch (error) {
      console.error('Error unassigning device:', error);
      setError('Fehler beim Entfernen der Zuordnung');
    } finally {
      setUnassigningDevice(null);
    }
  };

  const handleSaveLabel = async (deviceId) => {
    try {
      setSavingLabel(deviceId);
      const device = [...devices, ...unassignedDevices].find(d => d.id.id === deviceId);
      
      const response = await fetch(`/api/config/devices/${deviceId}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          label: editedLabel,
          type: device.type,
          name: device.name
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Failed to update label: ${data.message || response.statusText}`);
      }

      // Aktualisiere die Device-Listen
      await fetchDevices(selectedNode.id);
      
      // Reset edit state
      setEditingLabel(null);
      setEditedLabel('');

    } catch (error) {
      console.error('Error updating label:', error);
      setError(`Fehler beim Aktualisieren des Labels: ${error.message}`);
    } finally {
      setSavingLabel(null);
    }
  };

  const startEditingLabel = (device) => {
    setEditingLabel(device.id.id);
    setEditedLabel(device.label || '');
  };

  // Hilfsfunktion um zu prüfen, ob ein Node oder seine Kinder den Suchbegriff enthalten
  const nodeMatchesSearch = (node, searchTerm) => {
    const searchLower = searchTerm.toLowerCase();
    return (
      node.text?.toLowerCase().includes(searchLower) ||
      node.data?.label?.toLowerCase().includes(searchLower) ||
      node.data?.name?.toLowerCase().includes(searchLower)
    );
  };

  // Hilfsfunktion um alle Parent-IDs eines Nodes zu finden
  const findParentPath = (nodeId, nodes) => {
    const path = [];
    let currentNode = nodes.find(n => n.id === nodeId);
    while (currentNode && currentNode.parent !== 0) {
      path.push(currentNode.parent);
      currentNode = nodes.find(n => n.id === currentNode.parent);
    }
    return path;
  };

  // Filterfunktion ohne setState
  const getFilteredTreeData = () => {
    if (!treeSearchTerm) return treeData;
    
    // Finde alle Nodes, die den Suchbegriff enthalten
    const matchingNodes = treeData.filter(node => nodeMatchesSearch(node, treeSearchTerm));
    
    // Sammle alle Parent-IDs der gefundenen Nodes
    const parentIds = new Set();
    matchingNodes.forEach(node => {
      findParentPath(node.id, treeData).forEach(id => parentIds.add(id));
    });
    
    // Gib alle Nodes zurück, die entweder den Suchbegriff enthalten
    // oder Eltern von Nodes sind, die den Suchbegriff enthalten
    return treeData.filter(node => 
      nodeMatchesSearch(node, treeSearchTerm) || parentIds.has(node.id)
    );
  };

  // Neuer useEffect für das Aufklappen der Nodes
  useEffect(() => {
    if (treeSearchTerm) {
      const matchingNodes = treeData.filter(node => nodeMatchesSearch(node, treeSearchTerm));
      const parentIds = new Set();
      matchingNodes.forEach(node => {
        findParentPath(node.id, treeData).forEach(id => parentIds.add(id));
      });
      const nodesToOpen = [...parentIds, ...matchingNodes.map(node => node.id)];
      setOpenNodes((prev) => Array.from(new Set([...prev, ...nodesToOpen])));
    } else {
      // Wenn die Suche leer ist, setze auf die ursprünglichen offenen Nodes zurück
      const initialOpenNodes = getInitialOpenNodes(treeData);
      setOpenNodes(initialOpenNodes);
    }
  }, [treeSearchTerm, treeData]); // Abhängigkeiten des Effects

  const fetchCustomerSettings = async () => {
    try {
      const response = await fetch(`/api/config/customers/${customerData.customerid}/settings`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch customer settings');
      }

      const data = await response.json();
      setCustomerPrefix(data.data.prefix || '');
      setLastNodeId(data.data.lastnodeid || 0);
    } catch (error) {
      console.error('Error fetching customer settings:', error);
    }
  };

  const saveNode = async () => {
    try {
      // ... vorhandener Save-Code ...

      if (response.ok) {
        // Nach erfolgreichem Speichern, erhöhe lastnodeid
        const updateResponse = await fetch(`/api/config/customers/${customerData.customerid}/settings`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.token}`
          },
          body: JSON.stringify({
            lastnodeid: lastNodeId + 1
          })
        });

        if (updateResponse.ok) {
          setLastNodeId(prev => prev + 1);
        }

        await fetchTreeData();
        setIsNewNode(false);
        setSelectedNode(null);
        setEditedDetails(null);
      }
    } catch (error) {
      console.error('Error saving node:', error);
      setError('Fehler beim Speichern des Elements');
    }
  };

  // Neue Funktion zur Validierung der Pflichtfelder
  const isFormValid = () => {
    const hasRequiredFields = editedDetails?.label && editedDetails?.type && editedDetails?.label.trim() !== '' && editedDetails?.type.trim() !== '';
    
    // Wenn ein externes Gerät ausgewählt ist, muss auch ein Device ausgewählt werden
    if (operationalMode === '2' || operationalMode === '10') {
      return hasRequiredFields && operationalDevice && operationalDevice.trim() !== '';
    }
    
    return hasRequiredFields;
  };

  // Image management functions
  const fetchImages = async (assetId) => {
    if (!assetId) return;
    
    setLoadingImages(true);
    try {
      // Lade sowohl Bilder als auch Geräte parallel
      const [imagesResponse, devicesResponse] = await Promise.all([
        fetch(`/api/structure/images/${assetId}`, {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        }),
        fetch(`/api/config/assets/${assetId}/devices`, {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        })
      ]);

      if (!imagesResponse.ok) {
        throw new Error('Failed to fetch images');
      }

      if (!devicesResponse.ok) {
        throw new Error('Failed to fetch devices');
      }

      const imagesData = await imagesResponse.json();
      const devicesData = await devicesResponse.json();
      
      // Setze die Geräte für die Device-Label-Funktion
      setDevices(devicesData.assigned || []);
      
      // Setze die Bilder
      setImages(imagesData.images || []);
      
      console.log('Bilder und Geräte geladen:', {
        images: imagesData.images,
        devices: devicesData.assigned
      });
      
    } catch (error) {
      console.error('Error fetching images:', error);
      setError('Fehler beim Laden der Bilder');
    } finally {
      setLoadingImages(false);
    }
  };

  const handleImageUpload = async () => {
    if (!imageFile || !selectedNode) return;

    // Validierung für Heizkörper-Bilder
    if (imageType === 'Heizkörper' && !selectedDevice) {
      setError('Bitte wählen Sie ein Gerät aus');
      return;
    }

    const formData = new FormData();
    formData.append('image', imageFile);
    formData.append('assetId', selectedNode.id);
    formData.append('description', imageDescription);
    formData.append('imageType', imageType);
    formData.append('imageText', imageText);
    formData.append('selectedDevice', selectedDevice);
    formData.append('isPrimary', images.length === 0 ? 'true' : 'false'); // Erstes Bild als Hauptbild

    setUploadingImage(true);
    try {
      const response = await fetch('/api/structure/upload-image', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.token}`
        },
        body: formData
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed');
      }

      // Reset form
      setImageFile(null);
      setImageDescription('');
      setImageType('Raum');
      setImageText('');
      setSelectedDevice('');
      setShowImageModal(false);
      
      // Reload images
      await fetchImages(selectedNode.id);
      
    } catch (error) {
      console.error('Error uploading image:', error);
      setError(`Fehler beim Hochladen: ${error.message}`);
    } finally {
      setUploadingImage(false);
    }
  };

  const handleImageDelete = async (imageId) => {
    if (!window.confirm('Möchten Sie dieses Bild wirklich löschen?')) return;

    try {
      const response = await fetch(`/api/structure/image/${imageId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to delete image');
      }

      // Reload images
      await fetchImages(selectedNode.id);
      
    } catch (error) {
      console.error('Error deleting image:', error);
      setError('Fehler beim Löschen des Bildes');
    }
  };

  const handleSetPrimaryImage = async (imageId) => {
    try {
      const response = await fetch(`/api/structure/image/${imageId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          isPrimary: true
        })
      });

      if (!response.ok) {
        throw new Error('Failed to set primary image');
      }

      // Reload images
      await fetchImages(selectedNode.id);
      
    } catch (error) {
      console.error('Error setting primary image:', error);
      setError('Fehler beim Setzen des Hauptbildes');
    }
  };

  const handleFileSelect = (event) => {
    const file = event.target.files[0];
    if (file) {
      // Validate file type
      if (!['image/jpeg', 'image/png'].includes(file.type)) {
        setError('Nur JPG und PNG Dateien sind erlaubt');
        return;
      }
      
      // Validate file size (10MB limit)
      if (file.size > 10 * 1024 * 1024) {
        setError('Datei ist zu groß. Maximum 10MB erlaubt.');
        return;
      }
      
      setImageFile(file);
    }
  };

  const handleEditImage = (image) => {
    setEditingImage(image);
    setImageType(image.imageType);
    setImageText(image.imageText || '');
    setImageDescription(image.description || '');
    setSelectedDevice(image.selectedDevice || '');
    setShowEditModal(true);
  };

  const handleSaveImageEdit = async () => {
    if (!editingImage) return;

    try {
      const response = await fetch(`/api/structure/image/${editingImage.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.token}`
        },
        body: JSON.stringify({
          imageType: imageType,
          imageText: imageText,
          description: imageDescription,
          selectedDevice: selectedDevice
        })
      });

      if (!response.ok) {
        throw new Error('Failed to update image');
      }

      // Reload images
      await fetchImages(selectedNode.id);
      
      // Reset form and close modal
      setShowEditModal(false);
      setEditingImage(null);
      setImageType('Raum');
      setImageText('');
      setImageDescription('');
      setSelectedDevice('');
      
    } catch (error) {
      console.error('Error updating image:', error);
      setError('Fehler beim Aktualisieren des Bildes');
    }
  };

  // Funktion zum Laden der verfügbaren Geräte für Heizkörper-Bilder
  const fetchHeaterDevices = async (nodeId) => {
    if (!nodeId) return;
    
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
      
      // Zeige alle verfügbaren Geräte an, nicht nur solche mit "Heizkörper" im Namen
      // Der Benutzer kann selbst entscheiden, welches Gerät relevant ist
      const availableDevices = data.assigned || [];
      setHeaterDevices(availableDevices);
      
      // Debug-Ausgabe
      console.log('Verfügbare Geräte für Node:', nodeId, availableDevices);
      
    } catch (error) {
      console.error('Error fetching devices:', error);
      setHeaterDevices([]);
    }
  };

  // Hilfsfunktion um das Device-Label aus der Device-ID zu finden
  const getDeviceLabel = (deviceId) => {
    if (!deviceId) return '';
    
    // Suche in den aktuell geladenen Geräten des Nodes
    if (devices && devices.length > 0) {
      // Versuche verschiedene ID-Formate
      let device = devices.find(d => d.id.id === deviceId);
      if (!device) {
        device = devices.find(d => d.id === deviceId);
      }
      if (!device) {
        device = devices.find(d => d.deviceId === deviceId);
      }
      
      if (device) {
        return device.label || device.name || deviceId;
      }
    }
    
    // Fallback: Suche in den Heizkörper-Geräten (falls geladen)
    if (heaterDevices && heaterDevices.length > 0) {
      // Versuche verschiedene ID-Formate
      let device = heaterDevices.find(d => d.id.id === deviceId);
      if (!device) {
        device = heaterDevices.find(d => d.id === deviceId);
      }
      if (!device) {
        device = heaterDevices.find(d => d.deviceId === deviceId);
      }
      
      if (device) {
        return device.label || device.name || deviceId;
      }
    }
    
    return deviceId;
  };



  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container-fluid px-4 mt-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div className="d-flex align-items-center">
            <button 
              className="btn btn-outline-light me-3"
              onClick={() => router.push('/config')}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <h2 className="mb-0">Gebäudestruktur</h2>
          </div>
        </div>

        <div className="d-flex gap-4">
          {/* Tree Container */}
          <div 
            className="card" 
            style={{ 
              minWidth: '400px',
              width: '400px',
              height: windowHeight ? `${windowHeight - 80}px` : 'auto'
            }}
          >
            <div className="card-body" style={{ overflowY: 'auto' }}>
              {/* Suchfeld für Tree */}
              <div className="d-flex gap-2 mb-3">
                <div className="input-group">
                  <span className="input-group-text">
                    <FontAwesomeIcon icon={faSearch} />
                  </span>
                  <input
                    type="text"
                    className="form-control"
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
                  <div className="spinner-border" role="status">
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
                  canDrop={(tree, { dragSource, dropTarget }) => {
                    // Sicherheitscheck für dropTarget
                    if (!dropTarget || typeof dropTarget.droppable === 'undefined') {
                      return false;
                    }
                    // Erlaubt das Droppen nur auf Nodes, die droppable sind
                    return dropTarget.droppable;
                  }}
                  onDrop={(tree, { dragSource, dropTarget }) => {
                    // Sicherheitscheck für beide Objekte
                    if (!dragSource || !dropTarget) {
                      console.error('Invalid drag and drop operation');
                      return;
                    }
                    console.log('Drag and drop:', { dragSource, dropTarget });
                    handleDrop(dragSource, dropTarget);
                  }}
                  dragPreviewRender={(node) => (
                    <div className="p-2 rounded border">
                      {node.text}
                    </div>
                  )}
                />
              )}
            </div>
          </div>

          {/* Tabs Container */}
          <div 
            className="card flex-grow-1" 
            style={{ 
              height: windowHeight ? `${windowHeight - 80}px` : 'auto',
              display: 'flex',
              flexDirection: 'column'  // Wichtig für die innere Flexbox-Struktur
            }}
          >
            <div className="card-body d-flex flex-column" style={{ overflow: 'hidden' }}>  {/* overflow: hidden wichtig */}
              <ul className="nav nav-tabs mb-3">
                <li className="nav-item">
                  <button 
                    className={`nav-link ${activeTab === 'details' ? 'active' : ''}`}
                    onClick={() => setActiveTab('details')}
                  >
                    Details
                  </button>
                </li>
                <li className="nav-item">
                  <button 
                    className={`nav-link ${activeTab === 'devices' ? 'active' : ''}`}
                    onClick={() => setActiveTab('devices')}
                  >
                    Devices
                  </button>
                </li>
                <li className="nav-item">
                  <button 
                    className={`nav-link ${activeTab === 'images' ? 'active' : ''}`}
                    onClick={() => setActiveTab('images')}
                  >
                    <FontAwesomeIcon icon={faImage} className="me-2" />
                    Bilder
                    {images.length > 0 && (
                      <span className="badge bg-secondary ms-2">{images.length}</span>
                    )}
                  </button>
                </li>
              </ul>

              {activeTab === 'details' && (
                <div className="p-3">
                  {selectedNode ? (
                    // Existierendes Formular
                    <>
                      <div className="mb-3">
                        <label className="form-label fw-bold">Name</label>
                        <input
                          type="text"
                          className="form-control"
                          value={editedDetails?.name || ''}
                          disabled={true}
                          readOnly={true}
                          style={{
                            cursor: 'not-allowed'
                          }}
                        />
                      </div>
                      
                      <div className="mb-3">
                        <label className="form-label fw-bold">Label *</label>
                        <input
                          type="text"
                          className="form-control"
                          name="label"
                          value={editedDetails?.label || ''}
                          onChange={(e) => handleInputChange('label', e.target.value)}
                          required
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Typ *</label>
                        <select
                          className="form-select"
                          name="type"
                          value={editedDetails?.type || ''}
                          onChange={(e) => handleInputChange('type', e.target.value)}
                          required
                        >
                          <option value="">Bitte wählen...</option>
                          {assetProfiles.map(profile => (
                            <option key={profile.id} value={profile.name}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="mb-3">
                        <label className="form-label fw-bold">Betriebsmodus</label>
                        <div className="d-flex flex-column gap-2">
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="operationalMode"
                              id="operationalMode0"
                              value="0"
                              checked={operationalMode === '0'}
                              onChange={(e) => handleOperationalModeChange(e.target.value)}
                            />
                            <label className="form-check-label text-dark" htmlFor="operationalMode0">
                              Kein
                            </label>
                          </div>
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="operationalMode"
                              id="operationalMode2"
                              value="2"
                              checked={operationalMode === '2'}
                              onChange={(e) => handleOperationalModeChange(e.target.value)}
                            />
                            <label className="form-check-label text-dark" htmlFor="operationalMode2">
                              Externes Wandpanel
                            </label>
                          </div>
                          <div className="form-check">
                            <input
                              className="form-check-input"
                              type="radio"
                              name="operationalMode"
                              id="operationalMode10"
                              value="10"
                              checked={operationalMode === '10'}
                              onChange={(e) => handleOperationalModeChange(e.target.value)}
                            />
                            <label className="form-check-label text-dark" htmlFor="operationalMode10">
                              Externes Thermometer
                            </label>
                          </div>
                        </div>
                      </div>

                      {/* Device Selection Dropdown for External Panel/Thermometer */}
                      {(operationalMode === '2' || operationalMode === '10') && (
                        <div className="mb-3">
                          <label className="form-label fw-bold">
                            {operationalMode === '2' ? 'Wandpanel-Gerät' : 'Thermometer-Gerät'} *
                          </label>
                          {devices.length > 0 ? (
                            <select
                              className="form-select"
                              value={operationalDevice}
                              onChange={(e) => handleOperationalDeviceChange(e.target.value)}
                              required
                            >
                              <option value="">Bitte Gerät auswählen...</option>
                              {devices.map(device => (
                                <option key={device.id.id} value={device.id.id}>
                                  {device.label || device.name} ({device.type})
                                </option>
                              ))}
                            </select>
                          ) : (
                            <div className="alert alert-warning">
                              <small>
                                Keine Geräte in diesem Node gefunden. 
                                Bitte ordnen Sie zuerst Geräte diesem Node zu.
                              </small>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="d-flex justify-content-end mt-3">
                        <button
                          type="submit"
                          className="btn btn-primary"
                          disabled={isNewNode ? (!isFormValid() || loadingDetails) : loadingDetails}
                          onClick={saveChanges}
                          style={{
                            backgroundColor: (isNewNode ? isFormValid() : true) ? '#fd7e14' : '#6c757d',
                            borderColor: (isNewNode ? isFormValid() : true) ? '#fd7e14' : '#6c757d',
                            opacity: (isNewNode ? isFormValid() : true) ? 1 : 0.65
                          }}
                        >
                          {loadingDetails ? 'Wird geladen...' : (isNewNode ? 'Speichern' : 'Speichern')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="text-center text-muted py-5">
                      <h5>Bitte wählen Sie einen Node aus</h5>
                      <p>Wählen Sie einen Node aus der Baumstruktur aus, um dessen Details anzuzeigen.</p>
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'devices' && (
                <div className="devices-container d-flex flex-column" style={{ flex: 1, overflow: 'hidden' }}>
                  {/* Obere Hälfte: Zugeordnete Geräte */}
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h5 className="mb-0">Zugeordnete Geräte</h5>
                      <div className="input-group" style={{ width: '300px' }}>
                                                  <span className="input-group-text">
                            <FontAwesomeIcon icon={faSearch} />
                          </span>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Suchen..."
                            value={assignedSearchTerm}
                            onChange={(e) => setAssignedSearchTerm(e.target.value)}
                          />
                        {assignedSearchTerm && (
                          <button
                            className="btn btn-outline-secondary"
                            type="button"
                            onClick={() => setAssignedSearchTerm('')}
                          >
                            <FontAwesomeIcon icon={faTimes} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="table-responsive" style={{ height: 'calc(100% - 50px)', overflow: 'auto' }}>
                      {loadingDevices ? (
                        <div className="text-center py-3">
                          <div className="spinner-border" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : filteredAssignedDevices.length > 0 ? (
                        <table className="table table-hover mb-0">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Label</th>
                              <th>Typ</th>
                              <th>SerialNbr</th>
                              <th>Status</th>
                              <th>Letzte Aktivität</th>
                              <th>Aktionen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredAssignedDevices.map(device => (
                              <tr key={device.id.id}>
                                <td>{device.name}</td>
                                <td>
                                  {editingLabel === device.id.id ? (
                                    <div className="input-group input-group-sm">
                                      <input
                                        type="text"
                                        className="form-control form-control-sm bg-dark text-black border-secondary"
                                        value={editedLabel}
                                        onChange={(e) => setEditedLabel(e.target.value)}
                                        onKeyPress={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveLabel(device.id.id);
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <button
                                        className="btn btn-sm btn-outline-success"
                                        onClick={() => handleSaveLabel(device.id.id)}
                                        disabled={savingLabel === device.id.id}
                                      >
                                        {savingLabel === device.id.id ? (
                                          <div className="spinner-border spinner-border-sm" role="status">
                                            <span className="visually-hidden">Loading...</span>
                                          </div>
                                        ) : (
                                          <FontAwesomeIcon icon={faCheck} />
                                        )}
                                      </button>
                                      <button
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => {
                                          setEditingLabel(null);
                                          setEditedLabel('');
                                        }}
                                        disabled={savingLabel === device.id.id}
                                      >
                                        <FontAwesomeIcon icon={faXmark} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span 
                                      onClick={() => startEditingLabel(device)}
                                      style={{ cursor: 'pointer' }}
                                      className="text-decoration-underline"
                                      title="Klicken zum Bearbeiten"
                                    >
                                      {device.label || '-'}
                                    </span>
                                  )}
                                </td>
                                <td>{device.type}</td>
                                <td>{getSerialNumber(device)}</td>
                                <td>
                                  <span className={`badge ${device.serverAttributes?.active ? 'bg-success' : 'bg-danger'}`}>
                                    {device.serverAttributes?.active ? 'Online' : 'Offline'}
                                  </span>
                                </td>
                                <td>
                                  {device.serverAttributes?.lastActivityTime ? 
                                    new Date(device.serverAttributes.lastActivityTime).toLocaleString() : 
                                    'Keine Aktivität'
                                  }
                                </td>
                                <td>
                                  <button
                                    className="btn btn-sm btn-outline-danger"
                                    onClick={() => handleUnassignDevice(device.id.id)}
                                    disabled={unassigningDevice === device.id.id}
                                    title="Zuordnung entfernen"
                                  >
                                    {unassigningDevice === device.id.id ? (
                                      <div className="spinner-border spinner-border-sm" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                      </div>
                                    ) : (
                                      <FontAwesomeIcon icon={faMinus} />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center text-muted py-3">
                          {assignedSearchTerm ? 'Keine Geräte gefunden' : 'Keine Geräte zugeordnet'}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trennlinie */}
                  <hr className="border-secondary my-3" />

                  {/* Untere Hälfte: Nicht zugeordnete Geräte */}
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h5 className="mb-0">Nicht zugeordnete Geräte</h5>
                      <div className="d-flex align-items-center gap-2">
                        <button 
                          className="btn btn-sm btn-outline-light"
                          onClick={fetchUnassignedDevices}
                          disabled={loadingUnassignedDevices}
                          title="Liste aktualisieren"
                        >
                          <FontAwesomeIcon 
                            icon={faRotateRight} 
                            className={loadingUnassignedDevices ? 'fa-spin' : ''}
                          />
                        </button>
                        <div className="input-group" style={{ width: '300px' }}>
                          <span className="input-group-text">
                            <FontAwesomeIcon icon={faSearch} />
                          </span>
                          <input
                            type="text"
                            className="form-control"
                            placeholder="Suchen..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                          />
                          {searchTerm && (
                            <button
                              className="btn btn-outline-secondary"
                              type="button"
                              onClick={() => setSearchTerm('')}
                            >
                              <FontAwesomeIcon icon={faTimes} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div 
                      className="table-responsive" 
                      style={{ 
                        height: 'calc(100% - 50px)',
                        overflow: 'auto',
                        scrollbarWidth: 'thin',
                        '&::-webkit-scrollbar': {
                          width: '8px'
                        },
                        '&::-webkit-scrollbar-track': {
                          background: '#343a40'
                        },
                        '&::-webkit-scrollbar-thumb': {
                          background: '#666',
                          borderRadius: '4px'
                        }
                      }}
                    >
                                          {loadingDevices ? (
                      <div className="text-center py-3">
                        <div className="spinner-border" role="status">
                          <span className="visually-hidden">Loading...</span>
                        </div>
                      </div>
                    ) : filteredUnassignedDevices.length > 0 ? (
                        <table className="table table-hover mb-0">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Label</th>
                              <th>Typ</th>
                              <th>SerialNbr</th>
                              <th>Status</th>
                              <th>Letzte Aktivität</th>
                              <th>Aktionen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredUnassignedDevices.map(device => (
                              <tr key={device.id.id}>
                                <td>{device.name}</td>
                                <td>
                                  {editingLabel === device.id.id ? (
                                    <div className="input-group input-group-sm">
                                      <input
                                        type="text"
                                        className="form-control form-control-sm bg-dark text-black border-secondary"
                                        value={editedLabel}
                                        onChange={(e) => setEditedLabel(e.target.value)}
                                        onKeyPress={(e) => {
                                          if (e.key === 'Enter') {
                                            handleSaveLabel(device.id.id);
                                          }
                                        }}
                                        autoFocus
                                      />
                                      <button
                                        className="btn btn-sm btn-outline-success"
                                        onClick={() => handleSaveLabel(device.id.id)}
                                        disabled={savingLabel === device.id.id}
                                      >
                                        {savingLabel === device.id.id ? (
                                          <div className="spinner-border spinner-border-sm" role="status">
                                            <span className="visually-hidden">Loading...</span>
                                          </div>
                                        ) : (
                                          <FontAwesomeIcon icon={faCheck} />
                                        )}
                                      </button>
                                      <button
                                        className="btn btn-sm btn-outline-danger"
                                        onClick={() => {
                                          setEditingLabel(null);
                                          setEditedLabel('');
                                        }}
                                        disabled={savingLabel === device.id.id}
                                      >
                                        <FontAwesomeIcon icon={faXmark} />
                                      </button>
                                    </div>
                                  ) : (
                                    <span 
                                      onClick={() => startEditingLabel(device)}
                                      style={{ cursor: 'pointer' }}
                                      className="text-decoration-underline"
                                      title="Klicken zum Bearbeiten"
                                    >
                                      {device.label || '-'}
                                    </span>
                                  )}
                                </td>
                                <td>{device.type}</td>
                                <td>{getSerialNumber(device)}</td>
                                <td>
                                  <span className={`badge ${device.serverAttributes?.active ? 'bg-success' : 'bg-danger'}`}>
                                    {device.serverAttributes?.active ? 'Online' : 'Offline'}
                                  </span>
                                </td>
                                <td>
                                  {device.serverAttributes?.lastActivityTime ? 
                                    new Date(device.serverAttributes.lastActivityTime).toLocaleString() : 
                                    'Keine Aktivität'
                                  }
                                </td>
                                <td>
                                  <button
                                    className="btn btn-sm btn-outline-warning"
                                    onClick={() => handleAssignDevice(device.id.id)}
                                    disabled={!selectedNode || assigningDevice}
                                    title={!selectedNode ? 'Bitte wählen Sie zuerst einen Node aus' : 'Gerät diesem Node zuordnen'}
                                  >
                                    {assigningDevice ? (
                                      <div className="spinner-border spinner-border-sm" role="status">
                                        <span className="visually-hidden">Loading...</span>
                                      </div>
                                    ) : (
                                      <FontAwesomeIcon icon={faPlus} />
                                    )}
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="text-center text-muted py-3">
                          {searchTerm ? 'Keine Geräte gefunden' : 'Keine nicht zugeordneten Geräte vorhanden'}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === 'images' && (
                <div className="p-3">
                  {selectedNode ? (
                    <div>
                      {/* Upload Button */}
                      <div className="d-flex justify-content-between align-items-center mb-4">
                        <h5 className="mb-0">Bilder für {selectedNode.text}</h5>
                        <button
                          className="btn btn-primary"
                          onClick={() => setShowImageModal(true)}
                          disabled={selectedNode.id.startsWith('temp_')}
                        >
                          <FontAwesomeIcon icon={faUpload} className="me-2" />
                          Bild hochladen
                        </button>
                      </div>

                      {/* Images Grid */}
                      {loadingImages ? (
                        <div className="text-center py-4">
                          <div className="spinner-border" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : images.length > 0 ? (
                        <div className="row g-3">
                          {images.map((image) => (
                            <div key={image.id} className="col-md-4 col-lg-3">
                              <div className="card h-100">
                                <div className="position-relative">
                                  <img
                                    src={image.imageUrl}
                                    alt={image.filename}
                                    className="card-img-top"
                                    style={{
                                      height: '200px',
                                      objectFit: 'cover',
                                      cursor: 'pointer'
                                    }}
                                    onClick={() => setSelectedImage(image)}
                                  />
                                  {image.isPrimary && (
                                    <div 
                                      className="position-absolute top-0 start-0 m-2 badge bg-warning"
                                      title="Hauptbild"
                                    >
                                      <FontAwesomeIcon icon={faStar} />
                                    </div>
                                  )}
                                </div>
                                <div className="card-body p-2">
                                  <h6 className="card-title text-truncate" title={image.filename}>
                                    {image.filename}
                                  </h6>
                                  <div className="mb-2">
                                    <span className={`badge ${
                                      image.imageType === 'Heizkörper' ? 'bg-danger' :
                                      image.imageType === 'Raum' ? 'bg-primary' :
                                      'bg-success'
                                    }`}>
                                      {image.imageType}
                                    </span>
                                  </div>
                                  <p className="card-text small text-muted">
                                    {(image.fileSize / 1024).toFixed(1)} KB
                                  </p>
                                  {image.imageText && (
                                    <p className="card-text small fw-bold">
                                      {image.imageText}
                                    </p>
                                  )}
                                  {image.selectedDevice && (
                                    <p className="card-text small text-info">
                                      <strong>Gerät:</strong> {getDeviceLabel(image.selectedDevice)}
                                    </p>
                                  )}
                                  {image.description && (
                                    <p className="card-text small text-muted">
                                      {image.description}
                                    </p>
                                  )}
                                </div>
                                <div className="card-footer p-2">
                                  <div className="btn-group w-100" role="group">
                                    <button
                                      className="btn btn-sm btn-outline-info"
                                      onClick={() => setSelectedImage(image)}
                                      title="Anzeigen"
                                    >
                                      <FontAwesomeIcon icon={faEye} />
                                    </button>
                                    <button
                                      className="btn btn-sm btn-outline-secondary"
                                      onClick={() => handleEditImage(image)}
                                      title="Bearbeiten"
                                    >
                                      <FontAwesomeIcon icon={faEdit} />
                                    </button>
                                    {!image.isPrimary && (
                                      <button
                                        className="btn btn-sm btn-outline-warning"
                                        onClick={() => handleSetPrimaryImage(image.id)}
                                        title="Als Hauptbild setzen"
                                      >
                                        <FontAwesomeIcon icon={faStar} />
                                      </button>
                                    )}
                                    <button
                                      className="btn btn-sm btn-outline-danger"
                                      onClick={() => handleImageDelete(image.id)}
                                      title="Löschen"
                                    >
                                      <FontAwesomeIcon icon={faTrash} />
                                    </button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-center py-5">
                          <FontAwesomeIcon icon={faImage} size="3x" className="text-muted mb-3" />
                          <h5 className="text-muted">Keine Bilder vorhanden</h5>
                          <p className="text-muted">Laden Sie Ihr erstes Bild für diesen Node hoch.</p>
                          <button
                            className="btn btn-primary"
                            onClick={() => setShowImageModal(true)}
                            disabled={selectedNode.id.startsWith('temp_')}
                          >
                            <FontAwesomeIcon icon={faUpload} className="me-2" />
                            Erstes Bild hochladen
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center text-muted py-5">
                      <FontAwesomeIcon icon={faImage} size="3x" className="mb-3" />
                      <h5>Bitte wählen Sie einen Node aus</h5>
                      <p>Wählen Sie einen Node aus der Baumstruktur aus, um dessen Bilder anzuzeigen.</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {(assigningDevice || unassigningDevice) && (
        <div 
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center'
          }}
        >
          <div className="spinner-border" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      {/* Upload Modal */}
      {showImageModal && (
        <div 
          className="modal show d-block" 
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowImageModal(false)}
        >
          <div 
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FontAwesomeIcon icon={faUpload} className="me-2" />
                  Bild hochladen
                </h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowImageModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Datei auswählen</label>
                  <input
                    type="file"
                    className="form-control"
                    accept="image/jpeg,image/png"
                    onChange={handleFileSelect}
                  />
                  <div className="form-text">
                    Erlaubte Formate: JPG, PNG (max. 10MB)
                  </div>
                </div>
                
                {imageFile && (
                  <div className="mb-3">
                    <div className="alert alert-info">
                      <strong>Ausgewählte Datei:</strong> {imageFile.name} 
                      ({(imageFile.size / 1024).toFixed(1)} KB)
                    </div>
                  </div>
                )}
                
                <div className="mb-3">
                  <label className="form-label">Bildtyp *</label>
                  <select
                    className="form-select"
                    value={imageType}
                    onChange={(e) => setImageType(e.target.value)}
                    required
                  >
                    <option value="Raum">Raum</option>
                    <option value="Heizkörper">Heizkörper</option>
                    <option value="Grundriss">Grundriss</option>
                  </select>
                </div>

                {imageType === 'Heizkörper' && (
                  <div className="mb-3">
                    <label className="form-label">Gerät auswählen *</label>
                    {heaterDevices.length > 0 ? (
                      <select
                        className="form-select"
                        value={selectedDevice}
                        onChange={(e) => setSelectedDevice(e.target.value)}
                        required
                      >
                        <option value="">Bitte Gerät auswählen...</option>
                        {heaterDevices.map(device => (
                          <option key={device.id.id} value={device.id.id}>
                            {device.label || device.name} ({device.type})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="alert alert-warning">
                        <small>
                          Keine Geräte in diesem Node gefunden. 
                          Bitte ordnen Sie zuerst Geräte diesem Node zu.
                        </small>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="mb-3">
                  <label className="form-label">Text (optional)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={imageText}
                    onChange={(e) => setImageText(e.target.value)}
                    placeholder="Text für das Bild..."
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Beschreibung (optional)</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={imageDescription}
                    onChange={(e) => setImageDescription(e.target.value)}
                    placeholder="Beschreibung des Bildes..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowImageModal(false)}
                >
                  Abbrechen
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleImageUpload}
                  disabled={!imageFile || uploadingImage || (imageType === 'Heizkörper' && !selectedDevice)}
                >
                  {uploadingImage ? (
                    <>
                      <div className="spinner-border spinner-border-sm me-2" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                      Wird hochgeladen...
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faUpload} className="me-2" />
                      Hochladen
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Preview Modal */}
      {selectedImage && (
        <div 
          className="modal show d-block" 
          style={{ backgroundColor: 'rgba(0,0,0,0.8)' }}
          onClick={() => setSelectedImage(null)}
        >
          <div 
            className="modal-dialog modal-xl modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
                              <div className="modal-header">
                  <h5 className="modal-title">
                    <FontAwesomeIcon icon={faEye} className="me-2" />
                    {selectedImage.filename}
                    <span className={`badge ms-2 ${
                      selectedImage.imageType === 'Heizkörper' ? 'bg-danger' :
                      selectedImage.imageType === 'Raum' ? 'bg-primary' :
                      'bg-success'
                    }`}>
                      {selectedImage.imageType}
                    </span>
                    {selectedImage.isPrimary && (
                      <span className="badge bg-warning ms-2">
                        <FontAwesomeIcon icon={faStar} /> Hauptbild
                      </span>
                    )}
                  </h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setSelectedImage(null)}
                ></button>
              </div>
              <div className="modal-body text-center">
                <img
                  src={selectedImage.imageUrl}
                  alt={selectedImage.filename}
                  className="img-fluid"
                  style={{ maxHeight: '70vh' }}
                />
                
                {selectedImage.imageText && (
                  <div className="mt-3">
                    <p className="fw-bold">{selectedImage.imageText}</p>
                  </div>
                )}
                
                {selectedImage.selectedDevice && (
                  <div className="mt-3">
                    <p className="text-info">
                      <strong>Gerät:</strong> {getDeviceLabel(selectedImage.selectedDevice)}
                    </p>
                  </div>
                )}
                
                {selectedImage.description && (
                  <div className="mt-3">
                    <p className="text-muted">{selectedImage.description}</p>
                  </div>
                )}
                
                <div className="mt-3">
                  <small className="text-muted">
                    Größe: {(selectedImage.fileSize / 1024).toFixed(1)} KB | 
                    Hochgeladen: {new Date(selectedImage.uploadedAt).toLocaleString('de-DE')}
                    {selectedImage.uploadedBy && (
                      <> | von: {selectedImage.uploadedBy}</>
                    )}
                  </small>
                </div>
              </div>
              <div className="modal-footer">
                {!selectedImage.isPrimary && (
                  <button 
                    type="button" 
                    className="btn btn-warning"
                    onClick={() => {
                      handleSetPrimaryImage(selectedImage.id);
                      setSelectedImage(null);
                    }}
                  >
                    <FontAwesomeIcon icon={faStar} className="me-2" />
                    Als Hauptbild setzen
                  </button>
                )}
                <button 
                  type="button" 
                  className="btn btn-danger"
                  onClick={() => {
                    handleImageDelete(selectedImage.id);
                    setSelectedImage(null);
                  }}
                >
                  <FontAwesomeIcon icon={faTrash} className="me-2" />
                  Löschen
                </button>
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setSelectedImage(null)}
                >
                  Schließen
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Image Modal */}
      {showEditModal && editingImage && (
        <div 
          className="modal show d-block" 
          style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
          onClick={() => setShowEditModal(false)}
        >
          <div 
            className="modal-dialog modal-dialog-centered"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">
                  <FontAwesomeIcon icon={faEdit} className="me-2" />
                  Bild bearbeiten: {editingImage.filename}
                </h5>
                <button 
                  type="button" 
                  className="btn-close"
                  onClick={() => setShowEditModal(false)}
                ></button>
              </div>
              <div className="modal-body">
                <div className="mb-3">
                  <label className="form-label">Bildtyp *</label>
                  <select
                    className="form-select"
                    value={imageType}
                    onChange={(e) => setImageType(e.target.value)}
                    required
                  >
                    <option value="Raum">Raum</option>
                    <option value="Heizkörper">Heizkörper</option>
                    <option value="Grundriss">Grundriss</option>
                  </select>
                </div>

                {imageType === 'Heizkörper' && (
                  <div className="mb-3">
                    <label className="form-label">Gerät auswählen *</label>
                    {heaterDevices.length > 0 ? (
                      <select
                        className="form-select"
                        value={selectedDevice}
                        onChange={(e) => setSelectedDevice(e.target.value)}
                        required
                      >
                        <option value="">Bitte Gerät auswählen...</option>
                        {heaterDevices.map(device => (
                          <option key={device.id.id} value={device.id.id}>
                            {device.label || device.name} ({device.type})
                          </option>
                        ))}
                      </select>
                    ) : (
                      <div className="alert alert-warning">
                        <small>
                          Keine Geräte in diesem Node gefunden. 
                          Bitte ordnen Sie zuerst Geräte diesem Node zu.
                        </small>
                      </div>
                    )}
                  </div>
                )}
                
                <div className="mb-3">
                  <label className="form-label">Text</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={imageText}
                    onChange={(e) => setImageText(e.target.value)}
                    placeholder="Text für das Bild..."
                  />
                </div>
                
                <div className="mb-3">
                  <label className="form-label">Beschreibung</label>
                  <textarea
                    className="form-control"
                    rows="3"
                    value={imageDescription}
                    onChange={(e) => setImageDescription(e.target.value)}
                    placeholder="Beschreibung des Bildes..."
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button 
                  type="button" 
                  className="btn btn-secondary"
                  onClick={() => setShowEditModal(false)}
                >
                  Abbrechen
                </button>
                <button 
                  type="button" 
                  className="btn btn-primary"
                  onClick={handleSaveImageEdit}
                  disabled={imageType === 'Heizkörper' && !selectedDevice}
                >
                  <FontAwesomeIcon icon={faCheck} className="me-2" />
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      <style jsx global>{`
        .tree-root {
          color: inherit;
          list-style-type: none;
          padding-left: 0;
          width: 100%;
        }
        .tree-node {
          padding: 4px 0;
          color: inherit;
        }
        .tree-root span {
          color: inherit !important;
        }
        .tree-root span.text-warning {
          color: #000 !important;
        }
        .text-warning {
          color: #000 !important;
        }
        /* Hover-Effekt für Nodes */
        .tree-root div:hover {
          background-color: rgba(0, 0, 0, 0.1);
          border-radius: 4px;
        }
        /* Aktiver Node */
        .selected-node {
          background-color: #fd7e14 !important;
          border-radius: 4px;
        }
        .selected-node:hover {
          background-color: #fd7e14 !important;
        }
        .selected-node .text-warning {
          color: white !important;
        }
        .btn-link:hover {
          opacity: 0.8;
        }
        .tree-root ul {
          list-style-type: none;
          padding-left: 20px;
        }
        .tree-root > ul {
          padding-left: 0;
        }
        .tree-root > li {
          list-style-type: none;
        }
        .tree-root div:not(:has(> div[style*="cursor: pointer"])) {
          padding-left: 32px;
        }
        /* Tab Styles */
        .nav-tabs {
          border-bottom-color: var(--bs-border-color);
        }
        .nav-tabs .nav-link {
          color: var(--bs-body-color);
          border: none;
          border-bottom: 2px solid transparent;
        }
        .nav-tabs .nav-link:hover {
          border-color: transparent;
          color: var(--bs-primary);
        }
        .nav-tabs .nav-link.active {
          background-color: transparent;
          border-bottom: 2px solid var(--bs-primary);
          color: var(--bs-primary);
        }
        .form-control {
          background-color: white !important;
          color: black !important;
          border: 1px solid #ced4da;
        }
        .form-control:focus {
          background-color: white !important;
          color: black !important;
          border-color: #000;
          box-shadow: 0 0 0 0.25rem rgba(0, 0, 0, 0.25);
        }
        .form-control::placeholder {
          color: #6c757d;
        }
        /* Suchfeld-Styles mit höherer Spezifität */
        .input-group-text,
        .input-group .input-group-text {
          background-color: white !important;
          color: black !important;
          border: 1px solid #ced4da !important;
        }
        .input-group .form-control,
        .form-control.bg-dark,
        .form-control.bg-dark.text-black {
          background-color: white !important;
          color: black !important;
          border: 1px solid #ced4da !important;
        }
        .input-group .form-control:focus,
        .form-control.bg-dark:focus,
        .form-control.bg-dark.text-black:focus {
          background-color: white !important;
          color: black !important;
          border-color: #000 !important;
          box-shadow: 0 0 0 0.25rem rgba(0, 0, 0, 0.25) !important;
        }
        /* Überschreibe alle Bootstrap-Dark-Klassen mit höchster Spezifität */
        .bg-dark,
        .form-control.bg-dark,
        .input-group .form-control.bg-dark,
        .input-group-sm .form-control.bg-dark {
          background-color: white !important;
        }
        .text-black,
        .form-control.text-black,
        .input-group .form-control.text-black,
        .input-group-sm .form-control.text-black {
          color: black !important;
        }
        .border-secondary,
        .form-control.border-secondary,
        .input-group .form-control.border-secondary,
        .input-group-sm .form-control.border-secondary {
          border-color: #ced4da !important;
        }
        /* Spezifische Überschreibung für alle Suchfelder */
        .form-control.bg-dark.text-black.border-secondary {
          background-color: white !important;
          color: black !important;
          border-color: #ced4da !important;
        }
        /* Button Styling */
        .btn-warning {
          background-color: #000 !important;
          border-color: #000 !important;
          color: white !important;
        }
        .btn-warning:hover {
          background-color: #e96c11 !important;
          border-color: #e96c11 !important;
        }
        .btn-warning:focus {
          box-shadow: 0 0 0 0.25rem rgba(253, 126, 20, 0.25) !important;
        }
        .btn-warning:disabled {
          background-color: #fd7e14 !important;
          border-color: #fd7e14 !important;
          opacity: 0.65;
        }
        
        /* Refresh Button Styles */
        .btn-outline-light.btn-sm {
          padding: 0.25rem 0.5rem;
          font-size: 0.875rem;
          border-radius: 0.2rem;
        }
        
        .fa-spin {
          animation: fa-spin 1s infinite linear;
        }
        
        @keyframes fa-spin {
          0% {
            transform: rotate(0deg);
          }
          100% {
            transform: rotate(360deg);
          }
        }

        /* Select Field Styles */
        .form-select {
          background-color: white !important;
          color: black !important;
          border: 1px solid #ced4da;
        }
        
        .form-select:focus {
          background-color: white !important;
          color: black !important;
          border-color: #fd7e14;
          box-shadow: 0 0 0 0.25rem rgba(253, 126, 20, 0.25);
        }

        /* Add Node Button Styles */
        .tree-node .add-node-btn {
          opacity: 0;
          transition: none;
        }
        
        .tree-node:hover .add-node-btn {
          opacity: 0;
        }
        
        .selected-node .add-node-btn {
          opacity: 1;
        }
        
        .add-node-btn:focus {
          box-shadow: none !important;
        }

        .dragging-source {
          opacity: 0.3;
        }
        .drop-target {
          background-color: rgba(253, 126, 20, 0.2);
          border-radius: 4px;
        }
        .tree-node .confirmation-buttons {
          display: none;
        }
        .tree-node:hover .confirmation-buttons {
          display: flex;
        }

        /* Suchfeld Styles */
        .input-group .form-control {
          background-color: #343a40 !important;
          color: white !important;
          border-color: #6c757d;
        }
        
        .input-group .form-control:focus {
          box-shadow: none;
          border-color: #fd7e14;
        }
        
        .input-group-text {
          background-color: #343a40 !important;
          color: #6c757d !important;
          border-color: #6c757d;
        }
        
        .input-group .btn-outline-secondary {
          color: #6c757d;
          border-color: #6c757d;
        }
        
        .input-group .btn-outline-secondary:hover {
          background-color: #6c757d;
          color: white;
        }

        /* Spezielle Styles für das deaktivierte Namensfeld */
        .form-control:disabled,
        .form-control[readonly] {
          background-color: #212529 !important;
          color: #fff !important;
          border: 1px solid #495057;
          opacity: 1;
        }

        .form-control:disabled:hover,
        .form-control[readonly]:hover {
          cursor: not-allowed;
        }

        .btn-primary:not(:disabled):hover {
          background-color: #ff8c2a !important;
          border-color: #ff8c2a !important;
        }

        .btn-primary:disabled {
          cursor: not-allowed;
        }

        /* Radiobutton Styles */
        .form-check-input {
          background-color: #343a40;
          border-color: #6c757d;
        }
        
        .form-check-input:checked {
          background-color: #fd7e14;
          border-color: #fd7e14;
        }
        
        .form-check-input:focus {
          box-shadow: 0 0 0 0.25rem rgba(253, 126, 20, 0.25);
        }
        
        .form-check-label {
          color: #fff;
          cursor: pointer;
        }
        
        .form-check:hover .form-check-label {
          color: #fd7e14;
        }
      `}
      </style>
    </DndProvider>
  );
}