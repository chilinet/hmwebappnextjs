import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { useState, useEffect, useCallback } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faArrowLeft,
  faCalendarAlt,
  faInfoCircle,
  faPlus,
  faEdit,
  faTrash,
  faSave,
  faTimes,
  faSearch,
  faChevronRight,
  faChevronDown,
  faLayerGroup,
} from '@fortawesome/free-solid-svg-icons';

import { extractSubtreeRootedAtAssetId } from '../../lib/heating-control/treeUtils';

/** Anzeigetext in der Struktur: bevorzugt Label (wie in der Objektstruktur), nicht der technische Name */
function getTreeNodeLabel(node) {
  if (!node) return '—';
  const id = node.id != null ? String(node.id) : '';
  const raw =
    node.label ??
    node.data?.label ??
    node.text ??
    node.name ??
    '';
  const s = String(raw).trim();
  return s || id || '—';
}

/** ThingsBoard-Attribut heatingPlans: wie Kunden-Pläne [[name, number[24]], ...] */
function normalizeHeatingPlans(raw) {
  if (raw == null) return [];
  let v = raw;
  if (typeof v === 'string') {
    try {
      v = JSON.parse(v);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(v)) return [];
  return v.filter(
    (p) =>
      Array.isArray(p) &&
      p.length >= 2 &&
      typeof p[0] === 'string' &&
      Array.isArray(p[1]) &&
      p[1].length >= 0
  );
}

function StructureTreeNodes({
  nodes,
  depth,
  selectedId,
  onSelect,
  openIds,
  onToggle,
 searchLower,
}) {
  if (!Array.isArray(nodes) || nodes.length === 0) return null;

  return nodes.map((node) => {
    const id = node.id != null ? String(node.id) : '';
    const label = getTreeNodeLabel(node);
    const children = node.children;
    const hasChildren = Array.isArray(children) && children.length > 0;
    const isOpen = openIds.has(id);
    const matches =
      !searchLower ||
      label.toLowerCase().includes(searchLower) ||
      (hasChildren && childMatches(children, searchLower));

    if (!matches) return null;

    const rowSelected = selectedId === id;

    return (
      <div key={id || label + depth}>
        <div
          className={`d-flex align-items-center py-1 pe-2 rounded ${rowSelected ? 'bg-warning bg-opacity-25' : ''}`}
          style={{ paddingLeft: 6, cursor: 'pointer' }}
          onClick={() => id && onSelect({ id, label })}
        >
          {hasChildren ? (
            <button
              type="button"
              className="btn btn-sm btn-link p-0 me-1 text-dark"
              aria-label={isOpen ? 'Einklappen' : 'Aufklappen'}
              onClick={(e) => {
                e.stopPropagation();
                onToggle(id);
              }}
            >
              <FontAwesomeIcon icon={isOpen ? faChevronDown : faChevronRight} size="sm" />
            </button>
          ) : (
            <span className="me-1 text-secondary" style={{ width: '1.25rem', display: 'inline-block' }} aria-hidden />
          )}
          <span className="small text-truncate flex-grow-1 min-w-0" title={label}>
            {label}
          </span>
        </div>
        {hasChildren && isOpen && (
          <div
            className="structure-tree-branch"
            style={{
              marginLeft: '1.1rem',
              paddingLeft: '0.65rem',
              borderLeft: '2px solid #dee2e6',
            }}
          >
            <StructureTreeNodes
              nodes={children}
              depth={depth + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              openIds={openIds}
              onToggle={onToggle}
              searchLower={searchLower}
            />
          </div>
        )}
      </div>
    );
  });
}

function childMatches(children, searchLower) {
  for (const node of children) {
    const label = getTreeNodeLabel(node).toLowerCase();
    if (label.includes(searchLower)) return true;
    if (node.children?.length && childMatches(node.children, searchLower)) return true;
  }
  return false;
}

export default function HeatingSchedulesAsset() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [customerData, setCustomerData] = useState(null);
  const [treeData, setTreeData] = useState([]);
  const [treeLoading, setTreeLoading] = useState(true);
  const [treeError, setTreeError] = useState(null);
  const [treeSearch, setTreeSearch] = useState('');
  const [openIds, setOpenIds] = useState(() => new Set());

  const [selectedAsset, setSelectedAsset] = useState(null);
  const [loadingAsset, setLoadingAsset] = useState(false);
  const [scheduleData, setScheduleData] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanIndex, setEditingPlanIndex] = useState(null);
  const [planName, setPlanName] = useState('');
  const [planTemperatures, setPlanTemperatures] = useState(Array(24).fill(''));
  const [saving, setSaving] = useState(false);
  const [planSearchTerm, setPlanSearchTerm] = useState('');

  const collectAllIds = useCallback((nodes, acc = []) => {
    if (!Array.isArray(nodes)) return acc;
    for (const n of nodes) {
      if (n.id) acc.push(String(n.id));
      if (n.children?.length) collectAllIds(n.children, acc);
    }
    return acc;
  }, []);

  useEffect(() => {
    if (!session?.token) return;
    (async () => {
      try {
        const response = await fetch('/api/config/users/me', {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!response.ok) throw new Error('Benutzerdaten');
        const data = await response.json();
        setCustomerData(data);
      } catch (e) {
        console.error(e);
        setTreeError('Fehler beim Laden der Benutzerdaten');
        setTreeLoading(false);
      }
    })();
  }, [session?.token]);

  useEffect(() => {
    if (!session?.token || !customerData?.customerid) return;
    (async () => {
      setTreeLoading(true);
      setTreeError(null);
      try {
        const res = await fetch(`/api/config/customers/${customerData.customerid}/tree`, {
          headers: { Authorization: `Bearer ${session.token}` },
        });
        if (!res.ok) throw new Error('Struktur');
        const tree = await res.json();
        let roots = Array.isArray(tree) ? tree : [];
        const entryId = customerData?.defaultEntryAssetId;
        if (entryId) {
          roots = extractSubtreeRootedAtAssetId(roots, entryId);
        }
        setTreeData(roots);
        setOpenIds(new Set(collectAllIds(roots)));
      } catch (e) {
        console.error(e);
        setTreeError('Struktur konnte nicht geladen werden');
        setTreeData([]);
      } finally {
        setTreeLoading(false);
      }
    })();
  }, [session?.token, customerData?.customerid, customerData?.defaultEntryAssetId, collectAllIds]);

  const loadAssetPlans = async (assetId) => {
    if (!session?.token || !assetId) return;
    setLoadingAsset(true);
    setError(null);
    setSelectedPlanIndex(null);
    setScheduleData(null);
    try {
      const res = await fetch(`/api/config/assets/${assetId}`, {
        headers: { Authorization: `Bearer ${session.token}` },
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || 'Asset nicht geladen');
      }
      const data = await res.json();
      const plans = normalizeHeatingPlans(data.attributes?.heatingPlans);
      setScheduleData(plans);
    } catch (e) {
      console.error(e);
      setError(e.message || 'Fehler beim Laden der Asset-Heizpläne');
      setScheduleData([]);
    } finally {
      setLoadingAsset(false);
    }
  };

  const handleSelectAsset = (node) => {
    if (!node?.id) return;
    setSelectedAsset(node);
    loadAssetPlans(node.id);
  };

  const toggleOpen = (id) => {
    setOpenIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const persistPlans = async (updatedPlans) => {
    if (!selectedAsset?.id || !session?.token) return;
    const res = await fetch(`/api/config/assets/${selectedAsset.id}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${session.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ heatingPlans: updatedPlans }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || err.error || 'Speichern fehlgeschlagen');
    }
    setScheduleData(updatedPlans);
  };

  const handleCreatePlan = () => {
    setError(null);
    setEditingPlanIndex(null);
    setPlanName('');
    setPlanTemperatures(Array(24).fill(''));
    setShowPlanModal(true);
  };

  const handleEditPlan = (planIndex) => {
    if (!scheduleData || !scheduleData[planIndex]) return;
    setError(null);
    const plan = scheduleData[planIndex];
    setEditingPlanIndex(planIndex);
    setPlanName(plan[0]);
    const temps = plan[1];
    setPlanTemperatures(
      Array.from({ length: 24 }, (_, h) =>
        temps[h] !== null && temps[h] !== undefined ? String(temps[h]) : ''
      )
    );
    setShowPlanModal(true);
  };

  const handleDeletePlan = async (planIndex) => {
    if (!scheduleData || !scheduleData[planIndex]) return;
    const name = scheduleData[planIndex][0];
    if (!confirm(`Plan „${name}“ wirklich löschen?`)) return;
    setLoading(true);
    setError(null);
    try {
      const updated = scheduleData.filter((_, i) => i !== planIndex);
      await persistPlans(updated);
      if (selectedPlanIndex === planIndex) setSelectedPlanIndex(null);
      else if (selectedPlanIndex > planIndex) setSelectedPlanIndex(selectedPlanIndex - 1);
      setSuccess('Plan gelöscht');
      setTimeout(() => setSuccess(null), 3000);
    } catch (e) {
      setError(e.message || 'Löschen fehlgeschlagen');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) {
      setError('Bitte Plan-Namen eingeben');
      return;
    }
    const temperatures = planTemperatures.map((temp, index) => {
      const num = parseFloat(temp);
      if (temp === '' || Number.isNaN(num) || num < 0 || num > 50) {
        setError(`Ungültige Temperatur bei Stunde ${index}`);
        return null;
      }
      return num;
    });
    if (temperatures.some((t) => t === null)) return;

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let updated = [...(scheduleData || [])];
      if (editingPlanIndex !== null) {
        updated[editingPlanIndex] = [planName.trim(), temperatures];
      } else {
        updated.push([planName.trim(), temperatures]);
      }
      await persistPlans(updated);
      setShowPlanModal(false);
      setSuccess(editingPlanIndex !== null ? 'Plan aktualisiert' : 'Plan angelegt');
      setTimeout(() => setSuccess(null), 4000);
      if (editingPlanIndex !== null) setSelectedPlanIndex(editingPlanIndex);
      else setSelectedPlanIndex(updated.length - 1);
    } catch (e) {
      setError(e.message || 'Speichern fehlgeschlagen');
    } finally {
      setSaving(false);
    }
  };

  const handleCloseModal = () => {
    setShowPlanModal(false);
    setEditingPlanIndex(null);
    setPlanName('');
    setPlanTemperatures(Array(24).fill(''));
    setError(null);
  };

  const filteredPlans =
    scheduleData && Array.isArray(scheduleData)
      ? scheduleData.filter((plan) => {
          if (!planSearchTerm.trim()) return true;
          return plan[0].toLowerCase().includes(planSearchTerm.toLowerCase());
        })
      : [];

  const selectedPlan =
    selectedPlanIndex !== null && scheduleData?.[selectedPlanIndex]
      ? scheduleData[selectedPlanIndex]
      : null;
  const planSchedule = selectedPlan?.[1] || [];

  const treeSearchLower = treeSearch.trim().toLowerCase();

  return (
    <div className="container-fluid mt-4 px-3">
      <div className="d-flex align-items-center mb-3">
        <button
          type="button"
          className="btn btn-outline-secondary me-3"
          onClick={() => router.push('/config')}
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <FontAwesomeIcon icon={faLayerGroup} className="me-3" size="2x" style={{ color: '#fd7e14' }} />
        <h1 className="mb-0" style={{ color: '#fd7e14', fontWeight: 'bold' }}>
          Heizpläne (Asset)
        </h1>
      </div>
      <p className="text-muted small mb-4">
        Struktur ab dem in der Benutzerverwaltung hinterlegten Einstiegsknoten (bzw. volle Kundenstruktur).
        Pläne werden im ThingsBoard-Attribut <strong>heatingPlans</strong> des gewählten Assets gespeichert.
      </p>

      {error && (
        <div className="alert alert-danger alert-dismissible" role="alert">
          {error}
          <button type="button" className="btn-close" onClick={() => setError(null)} aria-label="Schließen" />
        </div>
      )}
      {success && (
        <div className="alert alert-success alert-dismissible" role="alert">
          {success}
          <button type="button" className="btn-close" onClick={() => setSuccess(null)} aria-label="Schließen" />
        </div>
      )}

      <div className="row g-3">
        <div className="col-lg-4">
          <div className="card h-100 border">
            <div className="card-header fw-bold d-flex align-items-center">
              <FontAwesomeIcon icon={faCalendarAlt} className="me-2 text-secondary" />
              Struktur
            </div>
            <div className="card-body p-2" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              {treeError && <div className="alert alert-warning py-2 small mb-2">{treeError}</div>}
              {treeLoading ? (
                <div className="text-center py-4">
                  <div className="spinner-border text-secondary" role="status" />
                </div>
              ) : (
                <>
                  <input
                    type="search"
                    className="form-control form-control-sm mb-2"
                    placeholder="Knoten suchen…"
                    value={treeSearch}
                    onChange={(e) => setTreeSearch(e.target.value)}
                  />
                  <StructureTreeNodes
                    nodes={treeData}
                    depth={0}
                    selectedId={selectedAsset?.id}
                    onSelect={handleSelectAsset}
                    openIds={openIds}
                    onToggle={toggleOpen}
                    searchLower={treeSearchLower}
                  />
                </>
              )}
            </div>
          </div>
        </div>

        <div className="col-lg-8">
          {!selectedAsset ? (
            <div className="card border">
              <div className="card-body text-muted">
                Bitte links ein Asset auswählen, um dessen Heizpläne (<code>heatingPlans</code>) zu bearbeiten.
              </div>
            </div>
          ) : loadingAsset ? (
            <div className="card border">
              <div className="card-body text-center py-5">
                <div className="spinner-border" style={{ color: '#fd7e14' }} role="status" />
                <p className="mt-2 mb-0">Lade Asset …</p>
              </div>
            </div>
          ) : (
            <>
              <div className="card mb-3 border">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3 flex-wrap gap-2">
                    <h5 className="card-title mb-0 fw-bold">
                      Verfügbare Heizpläne ({scheduleData?.length ?? 0}) —{' '}
                      <span className="text-secondary fw-normal small">{selectedAsset.label}</span>
                    </h5>
                    <button
                      type="button"
                      className="btn btn-success btn-sm"
                      onClick={handleCreatePlan}
                      disabled={loading}
                    >
                      <FontAwesomeIcon icon={faPlus} className="me-2" />
                      Neuer Plan
                    </button>
                  </div>

                  <div className="mb-3">
                    <div className="input-group input-group-sm">
                      <span className="input-group-text bg-light">
                        <FontAwesomeIcon icon={faSearch} />
                      </span>
                      <input
                        type="text"
                        className="form-control"
                        placeholder="Plan suchen…"
                        value={planSearchTerm}
                        onChange={(e) => setPlanSearchTerm(e.target.value)}
                      />
                      {planSearchTerm && (
                        <button
                          type="button"
                          className="btn btn-outline-secondary"
                          onClick={() => setPlanSearchTerm('')}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="mb-3">
                    <label htmlFor="planSelectAsset" className="form-label fw-bold small">
                      Plan auswählen
                    </label>
                    <select
                      id="planSelectAsset"
                      className="form-select form-select-sm"
                      value={selectedPlanIndex !== null ? selectedPlanIndex : ''}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSelectedPlanIndex(v === '' ? null : parseInt(v, 10));
                      }}
                    >
                      <option value="">— Bitte wählen —</option>
                      {filteredPlans.map((plan) => {
                        const originalIndex = scheduleData.findIndex((p) => p[0] === plan[0]);
                        return (
                          <option key={`${originalIndex}-${plan[0]}`} value={originalIndex}>
                            {plan[0]}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {selectedPlanIndex !== null && scheduleData?.[selectedPlanIndex] && (
                    <div className="d-flex gap-2 mb-3 flex-wrap">
                      <button
                        type="button"
                        className="btn btn-warning flex-grow-1"
                        onClick={() => handleEditPlan(selectedPlanIndex)}
                        disabled={loading}
                      >
                        <FontAwesomeIcon icon={faEdit} className="me-2" />
                        Plan „{scheduleData[selectedPlanIndex][0]}“ bearbeiten
                      </button>
                      <button
                        type="button"
                        className="btn btn-danger"
                        onClick={() => handleDeletePlan(selectedPlanIndex)}
                        disabled={loading}
                      >
                        <FontAwesomeIcon icon={faTrash} className="me-2" />
                        Löschen
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {selectedPlanIndex !== null && selectedPlan && (
                <div className="card border">
                  <div className="card-body">
                    <h5 className="card-title mb-3 fw-bold">
                      Plan: <span style={{ color: '#fd7e14' }}>{selectedPlan[0]}</span>
                    </h5>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered mb-0">
                        <thead style={{ backgroundColor: '#fd7e14', color: 'white' }}>
                          <tr>
                            <th style={{ width: '80px' }}>Stunde</th>
                            <th className="text-center">Temperatur</th>
                          </tr>
                        </thead>
                        <tbody>
                          {Array.from({ length: 24 }, (_, hour) => {
                            const temp = planSchedule[hour];
                            return (
                              <tr key={hour}>
                                <td
                                  className="fw-bold text-center"
                                  style={{
                                    backgroundColor: hour % 2 === 0 ? '#f8f9fa' : '#ffffff',
                                    fontSize: '0.9rem',
                                  }}
                                >
                                  {hour.toString().padStart(2, '0')}:00
                                </td>
                                <td
                                  className="text-center fw-bold"
                                  style={{
                                    backgroundColor: hour % 2 === 0 ? '#f8f9fa' : '#ffffff',
                                    color: temp != null ? '#fd7e14' : '#6c757d',
                                  }}
                                >
                                  {temp != null && temp !== '' ? `${temp}°C` : '—'}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {selectedPlanIndex === null && scheduleData?.length > 0 && (
                <div className="alert alert-info mb-0">
                  <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                  Plan auswählen, um die Stundenwerte anzuzeigen.
                </div>
              )}

              {scheduleData?.length === 0 && (
                <div className="card border">
                  <div className="card-body text-center">
                    <p className="mb-3">Noch keine Pläne in <code>heatingPlans</code> für dieses Asset.</p>
                    <button type="button" className="btn btn-success" onClick={handleCreatePlan} disabled={loading}>
                      <FontAwesomeIcon icon={faPlus} className="me-2" />
                      Neuen Plan erstellen
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {showPlanModal && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header border-bottom">
                <h5 className="modal-title fw-bold">
                  {editingPlanIndex !== null ? 'Plan bearbeiten' : 'Neuen Plan erstellen'}
                </h5>
                <button type="button" className="btn-close" onClick={handleCloseModal} aria-label="Schließen" />
              </div>
              <div className="modal-body">
                {error && (
                  <div className="alert alert-danger" role="alert">
                    {error}
                  </div>
                )}
                <div className="mb-3">
                  <label htmlFor="planNameAsset" className="form-label fw-bold">
                    Plan-Name
                  </label>
                  <input
                    type="text"
                    className="form-control"
                    id="planNameAsset"
                    value={planName}
                    onChange={(e) => setPlanName(e.target.value)}
                    placeholder="z. B. Standard"
                  />
                </div>
                <div className="mb-3">
                  <label className="form-label fw-bold">Temperaturen (0–23 Uhr)</label>
                  <div className="table-responsive">
                    <table className="table table-sm table-bordered">
                      <thead style={{ backgroundColor: '#fd7e14', color: 'white' }}>
                        <tr>
                          <th style={{ width: '80px' }}>Stunde</th>
                          <th>Temperatur (°C)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {Array.from({ length: 24 }, (_, hour) => (
                          <tr key={hour}>
                            <td
                              className="fw-bold text-center"
                              style={{
                                backgroundColor: hour % 2 === 0 ? '#f8f9fa' : '#fff',
                              }}
                            >
                              {hour.toString().padStart(2, '0')}:00
                            </td>
                            <td style={{ backgroundColor: hour % 2 === 0 ? '#f8f9fa' : '#fff' }}>
                              <input
                                type="number"
                                className="form-control form-control-sm"
                                min="0"
                                max="50"
                                step="0.5"
                                value={planTemperatures[hour]}
                                onChange={(e) => {
                                  const next = [...planTemperatures];
                                  next[hour] = e.target.value;
                                  setPlanTemperatures(next);
                                }}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
              <div className="modal-footer border-top">
                <button
                  type="button"
                  className="btn btn-outline-secondary"
                  onClick={handleCloseModal}
                  disabled={saving}
                >
                  <FontAwesomeIcon icon={faTimes} className="me-2" />
                  Abbrechen
                </button>
                <button
                  type="button"
                  className="btn btn-success"
                  onClick={handleSavePlan}
                  disabled={saving}
                >
                  {saving ? (
                    <>
                      <span className="spinner-border spinner-border-sm me-2" role="status" />
                      Speichern…
                    </>
                  ) : (
                    <>
                      <FontAwesomeIcon icon={faSave} className="me-2" />
                      Speichern
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);
  if (!session) {
    return {
      redirect: { destination: '/auth/signin', permanent: false },
    };
  }
  return { props: {} };
}
