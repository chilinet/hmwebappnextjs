import { useRouter } from 'next/router';
import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faBuilding, faIndustry, faMicrochip, faChevronDown, faChevronRight, faRotateRight, faPlus, faCheck, faXmark } from '@fortawesome/free-solid-svg-icons';
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
    // Erstelle einen temporären Node für die Bearbeitung
    const tempNode = {
      id: 'temp_' + Date.now(), // Temporäre ID
      parent: parentNode.id,
      text: '',
      data: {
        type: '',
        label: '',
        name: ''
      }
    };
    
    setSelectedNode(tempNode);
    setEditedDetails({
      name: '',
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
          cursor: 'pointer', // Immer pointer, da jetzt alle droppable sind
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

          {/* Add Node Button */}
          <button
            className="btn btn-sm btn-outline-light add-node-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleAddNode(node);
            }}
            style={{
              padding: '0.1rem 0.3rem',
              fontSize: '0.8rem'
            }}
          >
            <FontAwesomeIcon icon={faPlus} />
          </button>
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
              <div className="d-flex justify-content-end mb-3">
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
                  tree={treeData}
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
              height: windowHeight ? `${windowHeight - 80}px` : 'auto'
            }}
          >
            <div className="card-body">
              <ul className="nav nav-tabs" role="tablist">
                <li className="nav-item" role="presentation">
                  <button
                    className="nav-link active text-white"
                    data-bs-toggle="tab"
                    data-bs-target="#settings"
                    type="button"
                    role="tab"
                  >
                    Einstellungen
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className="nav-link text-white"
                    data-bs-toggle="tab"
                    data-bs-target="#devices"
                    type="button"
                    role="tab"
                  >
                    Devices
                  </button>
                </li>
                <li className="nav-item" role="presentation">
                  <button
                    className="nav-link text-white"
                    data-bs-toggle="tab"
                    data-bs-target="#unassigned"
                    type="button"
                    role="tab"
                  >
                    Nodes ohne Zuordnung
                  </button>
                </li>
              </ul>

              <div className="tab-content mt-3">
                <div
                  className="tab-pane fade show active"
                  id="settings"
                  role="tabpanel"
                >
                  {loadingDetails ? (
                    <div className="text-center">
                      <div className="spinner-border text-light" role="status">
                        <span className="visually-hidden">Loading...</span>
                      </div>
                    </div>
                  ) : selectedNode ? (
                    <div className="p-3">
                      <div className="mb-3">
                        <label className="form-label text-white">Name</label>
                        <input
                          type="text"
                          className="form-control bg-white text-dark"
                          value={editedDetails?.name || ''}
                          onChange={(e) => handleInputChange('name', e.target.value)}
                          placeholder={isNewNode ? "Neuer Name" : ""}
                        />
                      </div>
                      
                      <div className="mb-3">
                        <label className="form-label text-white">Label</label>
                        <input
                          type="text"
                          className="form-control bg-white text-dark"
                          value={editedDetails?.label || ''}
                          onChange={(e) => handleInputChange('label', e.target.value)}
                          placeholder={isNewNode ? "Neues Label" : ""}
                        />
                      </div>

                      <div className="mb-3">
                        <label className="form-label text-white">Typ</label>
                        <select
                          className="form-select bg-white text-dark"
                          value={editedDetails?.type || ''}
                          onChange={(e) => handleInputChange('type', e.target.value)}
                        >
                          <option value="">Bitte wählen...</option>
                          {assetProfiles.map(profile => (
                            <option key={profile.id?.id || profile.id} value={profile.name}>
                              {profile.name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <button 
                        className="btn btn-warning"
                        onClick={saveChanges}
                        disabled={loadingDetails}
                        style={{ backgroundColor: '#fd7e14', borderColor: '#fd7e14' }}
                      >
                        {isNewNode ? 'Erstellen' : 'Speichern'}
                      </button>
                    </div>
                  ) : (
                    <p className="text-white p-3">Bitte wählen Sie einen Node aus</p>
                  )}
                </div>
                <div
                  className="tab-pane fade"
                  id="devices"
                  role="tabpanel"
                >
                  <h4 className="text-white">Devices</h4>
                  {/* Devices Content */}
                </div>
                <div
                  className="tab-pane fade"
                  id="unassigned"
                  role="tabpanel"
                >
                  <h4 className="text-white">Nodes ohne Zuordnung</h4>
                  {/* Unassigned Nodes Content */}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

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
          transition: opacity 0.2s ease-in-out;
        }
        
        .tree-node:hover .add-node-btn {
          opacity: 1;
        }
        
        .selected-node .add-node-btn {
          opacity: 1;
        }
        
        .add-node-btn:hover {
          background-color: #fd7e14 !important;
          border-color: #fd7e14 !important;
          color: white !important;
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
      `}</style>
    </DndProvider>
  );
} 