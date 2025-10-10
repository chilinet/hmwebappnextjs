import { useState } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { 
  faBuilding, 
  faHome, 
  faDoorOpen, 
  faChevronRight, 
  faChevronDown,
  faThermometerHalf,
  faLayerGroup,
  faCog,
  faMapMarkerAlt,
  faWarehouse,
  faStairs,
  faToilet,
  faUtensils,
  faBook,
  faUsers,
  faDesktop,
  faChalkboardTeacher,
  faCrown,
  faTowerObservation,
  faTree,
  faIndustry
} from '@fortawesome/free-solid-svg-icons';

const getIconForType = (type) => {
  switch (type) {
    case 'Property':
      return faMapMarkerAlt;
    case 'Building':
      return faBuilding;
    case 'Floor':
      return faStairs;
    case 'Room':
      return faDoorOpen;
    case 'Area':
      return faLayerGroup;
    case 'Device':
      return faThermometerHalf;
    case 'vicki':
      return faThermometerHalf;
    case 'LHT52':
      return faThermometerHalf;
    case 'LW-eTRV':
      return faThermometerHalf;
    case 'dnt-lw-wth':
      return faCog;
    case 'mcpanel':
      return faDesktop;
    default:
      return faHome;
  }
};

const getIconColor = (type) => {
  switch (type) {
    case 'Property':
      return '#6c757d'; // Gray
    case 'Building':
      return '#0d6efd'; // Blue
    case 'Floor':
      return '#198754'; // Green
    case 'Room':
      return '#fd7e14'; // Orange
    case 'Area':
      return '#6f42c1'; // Purple
    case 'Device':
    case 'vicki':
    case 'LHT52':
    case 'LW-eTRV':
    case 'dnt-lw-wth':
    case 'mcpanel':
      return '#dc3545'; // Red
    default:
      return '#6c757d'; // Gray
  }
};

const TreeNode = ({ node, level = 0, onNodeClick, selectedNodeId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasChildren = node.children && node.children.length > 0;
  const isSelected = selectedNodeId === node.id;
  
  const handleToggle = () => {
    if (hasChildren) {
      setIsExpanded(!isExpanded);
    }
  };

  const handleNodeClick = () => {
    onNodeClick(node);
  };

  const icon = getIconForType(node.type);
  const iconColor = getIconColor(node.type);

  return (
    <div className="tree-node">
        <div 
          className={`tree-node-content d-flex align-items-center py-1 px-2 ${
            isSelected ? 'bg-primary text-white' : ''
          }`}
          style={{ 
            paddingLeft: `${level * 20 + 8}px`,
            cursor: 'pointer',
            borderRadius: '4px',
            margin: '1px 0',
            transition: 'background-color 0.2s ease'
          }}
          onClick={handleNodeClick}
          onMouseEnter={(e) => {
            if (!isSelected) {
              e.target.style.backgroundColor = '#f8f9fa';
            }
          }}
          onMouseLeave={(e) => {
            if (!isSelected) {
              e.target.style.backgroundColor = 'transparent';
            }
          }}
        >
        {hasChildren && (
          <button
            className="btn btn-sm p-0 me-2 border-0 bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              handleToggle();
            }}
            style={{ 
              width: '16px', 
              height: '16px',
              color: isSelected ? 'white' : '#6c757d'
            }}
          >
            <FontAwesomeIcon 
              icon={isExpanded ? faChevronDown : faChevronRight} 
              size="xs"
            />
          </button>
        )}
        
        {!hasChildren && <div style={{ width: '16px', marginRight: '8px' }} />}
        
        <FontAwesomeIcon 
          icon={icon} 
          className="me-2" 
          style={{ color: isSelected ? 'white' : iconColor, fontSize: '14px' }}
        />
        
        <span className="flex-grow-1" style={{ fontSize: '14px' }}>
          {node.label || node.name}
        </span>
        
        {node.hasDevices && (
          <FontAwesomeIcon 
            icon={faThermometerHalf} 
            className="ms-2" 
            style={{ 
              color: isSelected ? 'white' : '#28a745', 
              fontSize: '12px' 
            }}
            title="Hat Geräte"
          />
        )}
      </div>
      
      {hasChildren && isExpanded && (
        <div className="tree-children">
          {node.children.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              level={level + 1}
              onNodeClick={onNodeClick}
              selectedNodeId={selectedNodeId}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const HeatingControlTreeView = ({ treeData, onNodeClick, selectedNodeId }) => {
  if (!treeData || !Array.isArray(treeData)) {
    return (
      <div className="text-center text-muted py-4">
        <FontAwesomeIcon icon={faTree} className="me-2" />
        Keine Strukturdaten verfügbar
      </div>
    );
  }

  return (
    <div className="heating-control-tree">
      <div className="tree-header p-3 border-bottom">
        <h5 className="mb-0 d-flex align-items-center">
          <FontAwesomeIcon icon={faBuilding} className="me-2 text-primary" />
          Gebäudestruktur
        </h5>
      </div>
      
      <div className="tree-body" style={{ maxHeight: '70vh', overflowY: 'auto', padding: '8px' }}>
        {treeData.map((node) => (
          <TreeNode
            key={node.id}
            node={node}
            onNodeClick={onNodeClick}
            selectedNodeId={selectedNodeId}
          />
        ))}
      </div>
    </div>
  );
};

export default HeatingControlTreeView;
