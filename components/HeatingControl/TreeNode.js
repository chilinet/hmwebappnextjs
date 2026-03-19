import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faChevronDown, faChevronRight, faThermometerHalf } from '@fortawesome/free-solid-svg-icons';
import { getIconForType, getIconColor } from '../../lib/heating-control/treeUtils';

/**
 * Einzelner Baum-Knoten für die Heating-Control-Seite.
 * Erhält getIconForType/getIconColor aus treeUtils und handleNodeSelect/selectedNode als Props.
 */
export default function TreeNode({ node, onToggle, isOpen, selectedNode, onSelect }) {
  const isSelected = selectedNode?.id === node.id;
  const hasChildren = node.droppable;
  const icon = getIconForType(node.data?.type);
  const iconColor = getIconColor(node.data?.type);

  return (
    <div
      className={`tree-node ${isSelected ? 'selected' : ''}`}
      data-node-id={node.id}
      style={{
        padding: '8px 12px',
        cursor: 'pointer',
        backgroundColor: isSelected ? '#fd7e14' : 'transparent',
        borderRadius: '4px',
        margin: '2px 0',
        border: isSelected ? '1px solid #fd7e14' : '1px solid transparent',
        transition: 'all 0.2s ease'
      }}
      onClick={() => onSelect && onSelect(node)}
    >
      <div className="d-flex align-items-center">
        {hasChildren && (
          <button
            className="btn btn-sm p-0 me-2 border-0 bg-transparent"
            onClick={(e) => {
              e.stopPropagation();
              onToggle && onToggle();
            }}
            style={{
              width: '16px',
              height: '16px',
              color: isSelected ? 'white' : '#6c757d'
            }}
          >
            <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} size="xs" />
          </button>
        )}
        {!hasChildren && <div style={{ width: '16px', marginRight: '8px' }} />}
        <FontAwesomeIcon
          icon={icon}
          className="me-2"
          style={{ color: isSelected ? 'white' : iconColor, fontSize: '14px' }}
        />
        <span className="flex-grow-1" style={{ fontSize: '14px', color: isSelected ? 'white' : '#333' }}>
          {node.text}
        </span>
        {node.data?.hasDevices && (
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
    </div>
  );
}
