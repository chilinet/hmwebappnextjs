/**
 * Heating Control – Baum- und Knoten-Hilfsfunktionen
 */
import {
  faMapMarkerAlt,
  faBuilding,
  faStairs,
  faDoorOpen,
  faLayerGroup,
  faThermometerHalf,
  faCog,
  faDesktop,
  faHome
} from '@fortawesome/free-solid-svg-icons';

export function getIconForType(type) {
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
    case 'vicki':
    case 'LHT52':
    case 'LW-eTRV':
      return faThermometerHalf;
    case 'dnt-lw-wth':
      return faCog;
    case 'mcpanel':
      return faDesktop;
    default:
      return faHome;
  }
}

export function getIconColor(type) {
  switch (type) {
    case 'Property':
      return '#6c757d';
    case 'Building':
      return '#0d6efd';
    case 'Floor':
      return '#198754';
    case 'Room':
      return '#fd7e14';
    case 'Area':
      return '#6f42c1';
    case 'Device':
    case 'vicki':
    case 'LHT52':
    case 'LW-eTRV':
    case 'dnt-lw-wth':
    case 'mcpanel':
      return '#dc3545';
    default:
      return '#6c757d';
  }
}

export function getNodeTypeLabel(type) {
  const typeLabels = {
    'Property': 'Eigentum',
    'Building': 'Gebäude',
    'Floor': 'Etage',
    'Room': 'Raum',
    'Area': 'Bereich',
    'Device': 'Gerät',
    'vicki': 'Vicki Thermostat',
    'LHT52': 'LHT52 Sensor',
    'LW-eTRV': 'LW-eTRV Ventil',
    'dnt-lw-wth': 'Wandthermostat',
    'mcpanel': 'Wandpanel'
  };
  return typeLabels[type] || type;
}

export function convertToTreeViewFormat(nodes, parentId = 0) {
  if (!nodes || !Array.isArray(nodes)) return [];

  return nodes.flatMap(node => {
    const hasChildren = node.children && node.children.length > 0;
    const treeNode = {
      id: node.id,
      parent: parentId,
      droppable: true,
      text: node.label || node.name,
      data: {
        ...node,
        type: node.type,
        hasDevices: node.hasDevices,
        label: node.label,
        name: node.name
      }
    };
    if (hasChildren) {
      return [treeNode, ...convertToTreeViewFormat(node.children, node.id)];
    }
    return [treeNode];
  });
}

export function getAllNodeIds(nodes) {
  const nodeIds = [];
  function collectIds(nodeList) {
    if (!Array.isArray(nodeList)) return;
    nodeList.forEach(node => {
      if (node.id) nodeIds.push(node.id);
      if (node.children && Array.isArray(node.children)) collectIds(node.children);
    });
  }
  collectIds(nodes);
  return nodeIds;
}

export function getFirstLevelNodeIds(nodes) {
  if (!Array.isArray(nodes)) return [];
  return nodes.filter(n => n.id).map(n => n.id);
}

export function getPathToNode(nodeId, nodes) {
  function findPath(nodeList, targetId, currentPath = []) {
    for (const node of nodeList) {
      const newPath = [...currentPath, node.id];
      if (node.id === targetId) return newPath;
      if (node.children && node.children.length > 0) {
        const childPath = findPath(node.children, targetId, newPath);
        if (childPath) return childPath;
      }
    }
    return null;
  }
  return findPath(nodes, nodeId);
}

export function getAllSubordinateNodeIds(nodeId, nodes) {
  function findNode(nodeList, targetId) {
    for (const node of nodeList) {
      if (node.id === targetId) return node;
      if (node.children && Array.isArray(node.children)) {
        const found = findNode(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }
  function collectAllChildrenIds(node) {
    let childIds = [];
    if (node.children && Array.isArray(node.children)) {
      for (const child of node.children) {
        childIds.push(child.id);
        childIds = childIds.concat(collectAllChildrenIds(child));
      }
    }
    return childIds;
  }
  const targetNode = findNode(nodes, nodeId);
  if (!targetNode) return [];
  return collectAllChildrenIds(targetNode);
}

export function getAllSubordinateNodes(nodeId, nodes) {
  function findNode(nodeList, targetId) {
    for (const node of nodeList) {
      if (node.id === targetId) return node;
      if (node.children) {
        const found = findNode(node.children, targetId);
        if (found) return found;
      }
    }
    return null;
  }
  function getNodePath(nid, nodeList, path = []) {
    for (const node of nodeList) {
      const currentPath = [...path, node];
      if (node.id === nid) return currentPath;
      if (node.children) {
        const found = getNodePath(nid, node.children, currentPath);
        if (found) return found;
      }
    }
    return null;
  }
  function collectAllChildren(node) {
    let all = [];
    if (node.children) {
      for (const child of node.children) {
        all.push(child);
        all = all.concat(collectAllChildren(child));
      }
    }
    return all;
  }
  const targetNode = findNode(nodes, nodeId);
  if (!targetNode) return { path: [], subordinates: [] };
  const path = getNodePath(nodeId, nodes);
  const subordinates = collectAllChildren(targetNode);
  const subordinatesWithPaths = subordinates
    .filter(sub => sub.hasDevices === true)
    .map(sub => ({
      ...sub,
      path: getNodePath(sub.id, nodes) || []
    }));
  return { path: path || [], subordinates: subordinatesWithPaths };
}

export function nodeMatchesSearch(node, searchTerm) {
  if (!searchTerm) return true;
  const term = searchTerm.toLowerCase();
  return (
    (node.label && node.label.toLowerCase().includes(term)) ||
    (node.name && node.name.toLowerCase().includes(term)) ||
    (node.type && node.type.toLowerCase().includes(term))
  );
}

export function getFilteredTreeData(treeData, treeSearchTerm) {
  if (!treeSearchTerm) return treeData;
  function filterNodes(nodes) {
    return nodes
      .filter(node => {
        const matches = nodeMatchesSearch(node, treeSearchTerm);
        const childrenMatch = node.children ? filterNodes(node.children).length > 0 : false;
        return matches || childrenMatch;
      })
      .map(node => ({
        ...node,
        children: node.children ? filterNodes(node.children) : []
      }));
  }
  return filterNodes(treeData);
}
