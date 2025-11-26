import { useRouter } from 'next/router';
import { useSession, getSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowLeft, faCalendarAlt, faInfoCircle, faPlus, faEdit, faTrash, faSave, faTimes, faSearch } from '@fortawesome/free-solid-svg-icons';

export default function HeatingSchedules() {
  const router = useRouter();
  const { data: session } = useSession({
    required: true,
    onUnauthenticated() {
      router.push('/auth/signin');
    },
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [customerData, setCustomerData] = useState(null);
  const [scheduleData, setScheduleData] = useState(null);
  const [loadingSchedule, setLoadingSchedule] = useState(false);
  const [selectedPlanIndex, setSelectedPlanIndex] = useState(null);
  const [showPlanModal, setShowPlanModal] = useState(false);
  const [editingPlanIndex, setEditingPlanIndex] = useState(null);
  const [planName, setPlanName] = useState('');
  const [planTemperatures, setPlanTemperatures] = useState(Array(24).fill(''));
  const [saving, setSaving] = useState(false);
  const [updatingAssets, setUpdatingAssets] = useState(false);
  const [planSearchTerm, setPlanSearchTerm] = useState('');

  useEffect(() => {
    if (session?.token) {
      fetchUserData();
    }
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
      
      // Load schedule data after getting customer data
      if (data.customerid) {
        fetchScheduleData(data.customerid);
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
      setError('Fehler beim Laden der Benutzerdaten');
    }
  };

  const fetchScheduleData = async (customerId) => {
    if (!customerId) return;
    
    setLoadingSchedule(true);
    setError(null);
    try {
      const response = await fetch(`/api/config/customers/${customerId}/plans`, {
        headers: {
          'Authorization': `Bearer ${session.token}`
        }
      });

      if (!response.ok) {
        throw new Error('Failed to fetch schedule data');
      }

      const data = await response.json();
      console.log('Schedule data received:', data);
      setScheduleData(data.plans || null);
    } catch (error) {
      console.error('Error fetching schedule data:', error);
      setError('Fehler beim Laden der Heizpläne');
      setScheduleData(null);
    } finally {
      setLoadingSchedule(false);
    }
  };

  const handleCreatePlan = () => {
    setEditingPlanIndex(null);
    setPlanName('');
    setPlanTemperatures(Array(24).fill(''));
    setShowPlanModal(true);
  };

  const handleEditPlan = (planIndex) => {
    if (!scheduleData || !scheduleData[planIndex]) return;
    
    const plan = scheduleData[planIndex];
    setEditingPlanIndex(planIndex);
    setPlanName(plan[0]);
    setPlanTemperatures(plan[1].map(t => t !== null && t !== undefined ? t.toString() : ''));
    setShowPlanModal(true);
  };

  const handleDeletePlan = async (planIndex) => {
    if (!scheduleData || !customerData?.customerid) return;
    
    const planName = scheduleData[planIndex][0];
    
    if (!confirm(`Möchten Sie den Plan "${planName}" wirklich löschen?`)) {
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Prüfe, ob der Plan in Assets verwendet wird
      const checkResponse = await fetch(
        `/api/config/customers/${customerData.customerid}/plans/check-usage?planName=${encodeURIComponent(planName)}`,
        {
          headers: {
            'Authorization': `Bearer ${session.token}`
          }
        }
      );

      if (!checkResponse.ok) {
        throw new Error('Fehler beim Prüfen der Plan-Verwendung');
      }

      const usageData = await checkResponse.json();
      
      if (usageData.isUsed && usageData.usedInAssets.length > 0) {
        const assetNames = usageData.usedInAssets.map(a => a.assetName).join(', ');
        setError(
          `Der Plan "${planName}" kann nicht gelöscht werden, da er in folgenden Assets verwendet wird: ${assetNames}`
        );
        setLoading(false);
        return;
      }

      // Plan kann gelöscht werden
      const updatedPlans = scheduleData.filter((_, index) => index !== planIndex);
      
      const response = await fetch(`/api/config/customers/${customerData.customerid}/plans`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plans: updatedPlans })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to delete plan');
      }

      setScheduleData(updatedPlans);
      if (selectedPlanIndex === planIndex) {
        setSelectedPlanIndex(null);
      } else if (selectedPlanIndex > planIndex) {
        setSelectedPlanIndex(selectedPlanIndex - 1);
      }
      setSuccess('Plan erfolgreich gelöscht');
      setTimeout(() => setSuccess(null), 3000);
    } catch (error) {
      console.error('Error deleting plan:', error);
      setError(error.message || 'Fehler beim Löschen des Plans');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePlan = async () => {
    if (!planName.trim()) {
      setError('Bitte geben Sie einen Plan-Namen ein');
      return;
    }

    // Validate temperatures
    const temperatures = planTemperatures.map((temp, index) => {
      const num = parseFloat(temp);
      if (isNaN(num) || num < 0 || num > 50) {
        setError(`Ungültige Temperatur bei Stunde ${index}: ${temp}`);
        return null;
      }
      return num;
    });

    if (temperatures.some(t => t === null)) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let updatedPlans = [...(scheduleData || [])];
      let oldPlanName = null;
      let assetUpdateSuccess = true;
      let assetUpdateMessage = '';
      
      if (editingPlanIndex !== null) {
        // Check if plan name changed
        const oldPlan = scheduleData[editingPlanIndex];
        oldPlanName = oldPlan[0];
        const newPlanName = planName.trim();
        
        // Update existing plan
        updatedPlans[editingPlanIndex] = [newPlanName, temperatures];
        
        // If plan name changed, update all assets that use this plan
        if (oldPlanName !== newPlanName) {
          setUpdatingAssets(true);
          try {
            const updateResponse = await fetch(
              `/api/config/customers/${customerData.customerid}/plans/update-assets`,
              {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${session.token}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  oldPlanName: oldPlanName,
                  newPlanName: newPlanName
                })
              }
            );

            if (!updateResponse.ok) {
              const errorData = await updateResponse.json();
              throw new Error(errorData.error || 'Failed to update plan name in assets');
            }

            const updateData = await updateResponse.json();
            if (updateData.updatedAssets > 0) {
              assetUpdateMessage = ` und in ${updateData.updatedAssets} Asset(s) aktualisiert`;
              console.log(`Updated plan name in ${updateData.updatedAssets} assets`);
            } else {
              assetUpdateMessage = ' (keine Assets gefunden, die diesen Plan verwenden)';
            }
          } catch (updateError) {
            console.error('Error updating plan name in assets:', updateError);
            assetUpdateSuccess = false;
            assetUpdateMessage = ` - Warnung: Fehler beim Aktualisieren der Assets: ${updateError.message}`;
          } finally {
            setUpdatingAssets(false);
          }
        }
      } else {
        // Add new plan
        updatedPlans.push([planName.trim(), temperatures]);
      }

      const response = await fetch(`/api/config/customers/${customerData.customerid}/plans`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${session.token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ plans: updatedPlans })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to save plan');
      }

      setScheduleData(updatedPlans);
      setShowPlanModal(false);
      
      // Show success message with asset update info
      if (editingPlanIndex !== null && oldPlanName !== planName.trim()) {
        if (assetUpdateSuccess) {
          setSuccess(`Plan erfolgreich umbenannt${assetUpdateMessage}`);
        } else {
          setSuccess(`Plan erfolgreich umbenannt${assetUpdateMessage}`);
          // Also show error for the warning
          setTimeout(() => {
            setError(`Plan wurde umbenannt, aber es gab Probleme beim Aktualisieren einiger Assets. Bitte prüfen Sie die Assets manuell.`);
          }, 100);
        }
      } else {
        setSuccess(editingPlanIndex !== null ? 'Plan erfolgreich aktualisiert' : 'Plan erfolgreich erstellt');
      }
      setTimeout(() => setSuccess(null), 5000);
      
      // Select the saved plan
      if (editingPlanIndex !== null) {
        setSelectedPlanIndex(editingPlanIndex);
      } else {
        setSelectedPlanIndex(updatedPlans.length - 1);
      }
    } catch (error) {
      console.error('Error saving plan:', error);
      setError(error.message || 'Fehler beim Speichern des Plans');
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

  const handlePlanSelect = (planIndex) => {
    setSelectedPlanIndex(planIndex);
  };

  // Filter plans based on search term
  const filteredPlans = scheduleData && Array.isArray(scheduleData) 
    ? scheduleData.filter((plan, index) => {
        if (!planSearchTerm.trim()) return true;
        const searchLower = planSearchTerm.toLowerCase();
        return plan[0].toLowerCase().includes(searchLower);
      })
    : [];

  const getSelectedPlanData = () => {
    if (selectedPlanIndex === null || !scheduleData || !Array.isArray(scheduleData)) {
      return null;
    }
    return scheduleData[selectedPlanIndex] || null;
  };

  const selectedPlan = getSelectedPlanData();
  const planSchedule = selectedPlan?.[1] || [];

  return (
    <div className="container mt-4">
      <div className="card bg-dark text-white">
        <div className="card-body">
          <div className="d-flex justify-content-between align-items-center mb-4">
            <div className="d-flex align-items-center">
              <button 
                className="btn btn-outline-light me-3"
                onClick={() => router.push('/config')}
              >
                <FontAwesomeIcon icon={faArrowLeft} />
              </button>
              <FontAwesomeIcon icon={faCalendarAlt} className="me-3" size="2x" />
              <h2 className="mb-0">Heizpläne</h2>
            </div>
          </div>

          {error && (
            <div className="alert alert-danger alert-dismissible" role="alert">
              {error}
              <button type="button" className="btn-close" onClick={() => setError(null)}></button>
            </div>
          )}

          {success && (
            <div className="alert alert-success alert-dismissible" role="alert">
              {success}
              <button type="button" className="btn-close" onClick={() => setSuccess(null)}></button>
            </div>
          )}

          {loadingSchedule ? (
            <div className="text-center py-4">
              <div className="spinner-border text-light" role="status">
                <span className="visually-hidden">Lädt...</span>
              </div>
              <p className="mt-2">Heizpläne werden geladen...</p>
            </div>
          ) : scheduleData && Array.isArray(scheduleData) && scheduleData.length > 0 ? (
            <>
              <div className="card mb-3 bg-secondary">
                <div className="card-body">
                  <div className="d-flex justify-content-between align-items-center mb-3">
                    <h5 className="card-title mb-0">Verfügbare Heizpläne ({scheduleData.length})</h5>
                    <button
                      className="btn btn-success"
                      onClick={handleCreatePlan}
                      disabled={loading}
                    >
                      <FontAwesomeIcon icon={faPlus} className="me-2" />
                      Neuer Plan
                    </button>
                  </div>
                  
                  {/* Search Bar */}
                  <div className="mb-3">
                    <div className="input-group">
                      <span className="input-group-text bg-dark text-white border-secondary">
                        <FontAwesomeIcon icon={faSearch} />
                      </span>
                      <input
                        type="text"
                        className="form-control bg-dark text-white border-secondary"
                        placeholder="Plan suchen..."
                        value={planSearchTerm}
                        onChange={(e) => setPlanSearchTerm(e.target.value)}
                      />
                      {planSearchTerm && (
                        <button
                          className="btn btn-outline-secondary"
                          type="button"
                          onClick={() => setPlanSearchTerm('')}
                        >
                          <FontAwesomeIcon icon={faTimes} />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Plan Selection Dropdown */}
                  <div className="mb-3">
                    <label htmlFor="planSelect" className="form-label">Plan auswählen</label>
                    <select
                      id="planSelect"
                      className="form-select bg-dark text-white border-secondary"
                      value={selectedPlanIndex !== null ? selectedPlanIndex : ''}
                      onChange={(e) => {
                        const index = e.target.value === '' ? null : parseInt(e.target.value);
                        setSelectedPlanIndex(index);
                      }}
                    >
                      <option value="">-- Bitte wählen Sie einen Plan --</option>
                      {filteredPlans.map((plan, filteredIndex) => {
                        // Find original index in scheduleData
                        const originalIndex = scheduleData.findIndex(p => p[0] === plan[0]);
                        return (
                          <option key={originalIndex} value={originalIndex}>
                            {plan[0]}
                          </option>
                        );
                      })}
                    </select>
                    {planSearchTerm && filteredPlans.length === 0 && (
                      <small className="text-muted d-block mt-1">
                        Keine Pläne gefunden, die "{planSearchTerm}" enthalten.
                      </small>
                    )}
                  </div>

                  {/* Action Buttons for Selected Plan */}
                  {selectedPlanIndex !== null && scheduleData[selectedPlanIndex] && (
                    <div className="d-flex gap-2 mb-3">
                      <button
                        className="btn btn-warning flex-grow-1"
                        onClick={() => handleEditPlan(selectedPlanIndex)}
                        disabled={loading}
                      >
                        <FontAwesomeIcon icon={faEdit} className="me-2" />
                        Plan "{scheduleData[selectedPlanIndex][0]}" bearbeiten
                      </button>
                      <button
                        className="btn btn-danger"
                        onClick={() => handleDeletePlan(selectedPlanIndex)}
                        disabled={loading}
                      >
                        <FontAwesomeIcon icon={faTrash} className="me-2" />
                        Löschen
                      </button>
                    </div>
                  )}

                  {/* Alternative: Scrollable List View (if many plans) */}
                  {scheduleData.length > 10 && (
                    <div className="mt-3">
                      <small className="text-muted">
                        <FontAwesomeIcon icon={faInfoCircle} className="me-1" />
                        Tipp: Verwenden Sie die Suche, um schnell einen Plan zu finden.
                      </small>
                    </div>
                  )}
                </div>
              </div>

              {selectedPlanIndex !== null && selectedPlan && (
                <div className="card mb-3 bg-secondary">
                  <div className="card-body">
                    <h5 className="card-title mb-3">
                      Plan: <strong>{selectedPlan[0]}</strong>
                    </h5>
                    <div className="table-responsive">
                      <table className="table table-sm table-bordered table-dark">
                        <thead className="table-warning">
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
                                <td className="fw-bold text-center" style={{ 
                                  backgroundColor: hour % 2 === 0 ? '#343a40' : '#495057',
                                  fontSize: '0.9rem'
                                }}>
                                  {hour.toString().padStart(2, '0')}:00
                                </td>
                                <td className="text-center" style={{ 
                                  backgroundColor: hour % 2 === 0 ? '#343a40' : '#495057',
                                  fontSize: '1rem',
                                  color: temp ? '#ffc107' : '#6c757d',
                                  fontWeight: temp ? 'bold' : 'normal'
                                }}>
                                  {temp ? `${temp}°C` : '-'}
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

              {selectedPlanIndex === null && (
                <div className="alert alert-info">
                  <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                  Bitte wählen Sie einen Plan aus, um die Temperaturwerte anzuzeigen.
                </div>
              )}
            </>
          ) : scheduleData && Array.isArray(scheduleData) && scheduleData.length === 0 ? (
            <div className="card mb-3 bg-secondary">
              <div className="card-body text-center">
                <h5 className="card-title">Keine Heizpläne vorhanden</h5>
                <p className="card-text mb-3">Erstellen Sie Ihren ersten Heizplan.</p>
                <button
                  className="btn btn-success"
                  onClick={handleCreatePlan}
                  disabled={loading}
                >
                  <FontAwesomeIcon icon={faPlus} className="me-2" />
                  Neuen Plan erstellen
                </button>
              </div>
            </div>
          ) : (
            <div className="card mb-3 bg-secondary">
              <div className="card-body">
                <h5 className="card-title">Keine Heizpläne verfügbar</h5>
                <p className="card-text">
                  {scheduleData ? 
                    'Keine gültigen Plan-Daten gefunden.' : 
                    'Plan-Daten werden geladen oder sind nicht verfügbar.'
                  }
                </p>
              </div>
            </div>
          )}

          {/* Plan Modal */}
          {showPlanModal && (
            <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
              <div className="modal-dialog modal-lg modal-dialog-scrollable">
                <div className="modal-content bg-dark text-white">
                  <div className="modal-header">
                    <h5 className="modal-title">
                      {editingPlanIndex !== null ? 'Plan bearbeiten' : 'Neuen Plan erstellen'}
                    </h5>
                    <button
                      type="button"
                      className="btn-close btn-close-white"
                      onClick={handleCloseModal}
                    ></button>
                  </div>
                  <div className="modal-body">
                    {error && (
                      <div className="alert alert-danger" role="alert">
                        {error}
                      </div>
                    )}
                    
                    {updatingAssets && (
                      <div className="alert alert-info mb-3" role="alert">
                        <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                        <strong>Assets werden aktualisiert...</strong> Dieser Vorgang kann je nach Anzahl der Assets bis zu 1 Minute dauern. Bitte schließen Sie dieses Fenster nicht.
                      </div>
                    )}
                    
                    <div className="mb-3">
                      <label htmlFor="planName" className="form-label">Plan-Name</label>
                      <input
                        type="text"
                        className="form-control bg-secondary text-white border-secondary"
                        id="planName"
                        value={planName}
                        onChange={(e) => setPlanName(e.target.value)}
                        placeholder="z.B. Standard, Wochenende, etc."
                      />
                      {editingPlanIndex !== null && scheduleData && scheduleData[editingPlanIndex] && (
                        <div className="mt-2">
                          {planName.trim() !== scheduleData[editingPlanIndex][0] ? (
                            <div className="alert alert-warning mb-0" role="alert">
                              <FontAwesomeIcon icon={faInfoCircle} className="me-2" />
                              <strong>Hinweis:</strong> Beim Umbenennen des Plans werden alle Assets durchsucht und aktualisiert. 
                              Dieser Vorgang kann je nach Anzahl der Assets bis zu 1 Minute dauern. Bitte haben Sie Geduld.
                            </div>
                          ) : (
                            <small className="text-muted">
                              <FontAwesomeIcon icon={faInfoCircle} className="me-1" />
                              Wenn Sie den Plan-Namen ändern, werden automatisch alle Assets aktualisiert, die diesen Plan verwenden.
                            </small>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="mb-3">
                      <label className="form-label">Temperaturen pro Stunde (0-23 Uhr)</label>
                      <div className="table-responsive">
                        <table className="table table-sm table-bordered table-dark">
                          <thead className="table-warning">
                            <tr>
                              <th style={{ width: '80px' }}>Stunde</th>
                              <th>Temperatur (°C)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {Array.from({ length: 24 }, (_, hour) => (
                              <tr key={hour}>
                                <td className="fw-bold text-center" style={{ 
                                  backgroundColor: hour % 2 === 0 ? '#343a40' : '#495057'
                                }}>
                                  {hour.toString().padStart(2, '0')}:00
                                </td>
                                <td style={{ 
                                  backgroundColor: hour % 2 === 0 ? '#343a40' : '#495057'
                                }}>
                                  <input
                                    type="number"
                                    className="form-control form-control-sm bg-secondary text-white border-secondary"
                                    min="0"
                                    max="50"
                                    step="0.5"
                                    value={planTemperatures[hour]}
                                    onChange={(e) => {
                                      const newTemps = [...planTemperatures];
                                      newTemps[hour] = e.target.value;
                                      setPlanTemperatures(newTemps);
                                    }}
                                    placeholder="z.B. 20"
                                  />
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                  <div className="modal-footer">
                    <button
                      type="button"
                      className="btn btn-secondary"
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
                          <span className="spinner-border spinner-border-sm me-2" role="status"></span>
                          {updatingAssets ? 'Aktualisiere Assets...' : 'Speichere...'}
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
      </div>
    </div>
  );
}

export async function getServerSideProps(context) {
  const session = await getSession(context);

  if (!session) {
    return {
      redirect: {
        destination: '/auth/signin',
        permanent: false,
      },
    };
  }

  return {
    props: {}
  };
}

