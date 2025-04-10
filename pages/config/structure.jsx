import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBuilding, faIndustry, faMicrochip, faChevronDown, faChevronRight, faRotateRight, faPlus, faCheck, faXmark, faMinus, faSearch, faTimes } from '@fortawesome/free-solid-svg-icons';
import { Tree } from '@minoru/react-dnd-treeview';
import { DndProvider } from 'react-dnd';
import { HTML5Backend } from 'react-dnd-html5-backend';

export default function Structure() {
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
        data: {
          type: node.type,
          hasDevices: node.hasDevices,
          label: node.label,
          name: node.name
        }
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
      type: ''
    });
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
          <span className={node.data?.hasDevices ? 'text-warning' : 'text-white'}>
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
          body: JSON.stringify(editedDetails)
        });

        if (!assetResponse.ok) {
          throw new Error('Failed to create asset');
        }

        const newAsset = await assetResponse.json();

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
              label: editedDetails.label
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
          body: JSON.stringify(editedDetails)
        });

        if (!assetResponse.ok) {
          throw new Error('Failed to update asset');
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
            label: editedDetails.label
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

  // Funktion zum Filtern der nicht zugeordneten Geräte
  const filteredUnassignedDevices = unassignedDevices.filter(device => {
    const searchLower = searchTerm.toLowerCase();
    return (
      device.name.toLowerCase().includes(searchLower) ||
      (device.label && device.label.toLowerCase().includes(searchLower)) ||
      device.type.toLowerCase().includes(searchLower)
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
    return editedDetails?.label && editedDetails?.type && editedDetails?.label.trim() !== '' && editedDetails?.type.trim() !== '';
  };

  return (
    <DndProvider backend={HTML5Backend}>
      <div className="container mt-4">
        <div className="d-flex justify-content-between align-items-center mb-4">
          <div className="d-flex align-items-center">
            <button 
              className="btn btn-outline-light me-3"
              onClick={() => router.push('/config')}
            >
              <FontAwesomeIcon icon={faArrowLeft} />
            </button>
            <h2 className="mb-0 text-white">Gebäudestruktur</h2>
          </div>
        </div>

        <div className="d-flex gap-4">
          {/* Tree Container */}
          <div 
            className="card bg-dark text-white" 
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
                  <span className="input-group-text bg-dark text-white border-secondary">
                    <FontAwesomeIcon icon={faSearch} />
                  </span>
                  <input
                    type="text"
                    className="form-control bg-dark text-white border-secondary"
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
                    <div className="bg-dark text-white p-2 rounded">
                      {node.text}
                    </div>
                  )}
                />
              )}
            </div>
          </div>

          {/* Tabs Container */}
          <div 
            className="card bg-dark text-white flex-grow-1" 
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
              </ul>

              {activeTab === 'details' && (
                <div className="p-3">
                  {selectedNode ? (
                    // Existierendes Formular
                    <>
                      <div className="mb-3">
                        <label className="form-label">Name</label>
                        <input
                          type="text"
                          className="form-control bg-dark text-white"
                          value={editedDetails?.name || ''}
                          disabled={true}
                          readOnly={true}
                          style={{
                            backgroundColor: '#212529 !important',
                            color: '#fff !important',
                            cursor: 'not-allowed'
                          }}
                        />
                      </div>
                      
                      <div className="mb-3">
                        <label className="form-label">Label *</label>
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
                        <label className="form-label">Typ *</label>
                        <select
                          className="form-select bg-dark text-white"
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
                    <h5 className="text-white mb-3">Zugeordnete Geräte</h5>
                    <div className="table-responsive" style={{ height: 'calc(100% - 40px)', overflow: 'auto' }}>
                      {loadingDevices ? (
                        <div className="text-center py-3">
                          <div className="spinner-border text-light" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : devices.length > 0 ? (
                        <table className="table table-dark table-hover mb-0">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Label</th>
                              <th>Typ</th>
                              <th>Status</th>
                              <th>Letzte Aktivität</th>
                              <th>Aktionen</th>
                            </tr>
                          </thead>
                          <tbody>
                            {devices.map(device => (
                              <tr key={device.id.id}>
                                <td>{device.name}</td>
                                <td>
                                  {editingLabel === device.id.id ? (
                                    <div className="input-group input-group-sm">
                                      <input
                                        type="text"
                                        className="form-control form-control-sm bg-dark text-white border-secondary"
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
                          Keine Geräte zugeordnet
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Trennlinie */}
                  <hr className="border-secondary my-3" />

                  {/* Untere Hälfte: Nicht zugeordnete Geräte */}
                  <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <h5 className="text-white mb-0">Nicht zugeordnete Geräte</h5>
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
                          <span className="input-group-text bg-dark text-white border-secondary">
                            <FontAwesomeIcon icon={faSearch} />
                          </span>
                          <input
                            type="text"
                            className="form-control bg-dark text-white border-secondary"
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
                          <div className="spinner-border text-light" role="status">
                            <span className="visually-hidden">Loading...</span>
                          </div>
                        </div>
                      ) : filteredUnassignedDevices.length > 0 ? (
                        <table className="table table-dark table-hover mb-0">
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Label</th>
                              <th>Typ</th>
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
                                        className="form-control form-control-sm bg-dark text-white border-secondary"
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
          <div className="spinner-border text-light" role="status">
            <span className="visually-hidden">Loading...</span>
          </div>
        </div>
      )}

      <style jsx global>{`
        .tree-root {
          color: white;
          list-style-type: none;
          padding-left: 0;
          width: 100%;
        }
        .tree-node {
          padding: 4px 0;
          color: white;
        }
        .tree-root span {
          color: white !important;
        }
        .tree-root span.text-warning {
          color: white !important;
        }
        .text-warning {
          color: white !important;
        }
        /* Hover-Effekt für Nodes */
        .tree-root div:hover {
          background-color: rgba(44, 123, 229, 0.2);
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
          border-bottom-color: #495057;
        }
        .nav-tabs .nav-link {
          color: #6c757d;
          border: none;
          border-bottom: 2px solid transparent;
        }
        .nav-tabs .nav-link:hover {
          border-color: transparent;
          color: #fff;
        }
        .nav-tabs .nav-link.active {
          background-color: transparent;
          border-bottom: 2px solid #fff;
          color: #fff;
        }
        .form-control {
          background-color: white !important;
          color: black !important;
          border: 1px solid #ced4da;
        }
        .form-control:focus {
          background-color: white !important;
          color: black !important;
          border-color: #fd7e14;
          box-shadow: 0 0 0 0.25rem rgba(253, 126, 20, 0.25);
        }
        .form-control::placeholder {
          color: #6c757d;
        }
        /* Button Styling */
        .btn-warning {
          background-color: #fd7e14 !important;
          border-color: #fd7e14 !important;
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
      `}
      </style>
    </DndProvider>
  );
}