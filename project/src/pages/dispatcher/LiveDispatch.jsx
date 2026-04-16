import React, { useState, useCallback } from 'react';
import {
  RefreshCw, Plus, Upload,
  Users, Navigation, Trash2, CheckSquare, Square, BookOpen
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { sentryApi } from '../../lib/sentryApi';
import { haversineDistance } from '../../lib/geocode';
import { fbSet } from '../../lib/firebase';
import { detectServiceZone, getZonePreferenceBonus, normalizePreferredZones } from '../../lib/serviceZones';
import DriverCard from '../../components/drivers/DriverCard';
import DriverDetailPanel from '../../components/drivers/DriverDetailPanel';
import TripCard from '../../components/trips/TripCard';
import MapView from '../../components/map/MapView';
import Take5Modal from '../../components/dispatch/Take5Modal';
import AddDriverModal from '../../components/drivers/AddDriverModal';
import CSVImportModal from '../../components/drivers/CSVImportModal';
import DeleteConfirmModal from '../../components/drivers/DeleteConfirmModal';
import DispatchWalkthrough from '../../components/dispatch/DispatchWalkthrough';
import ChatPanel from '../../components/chat/ChatPanel';

export default function LiveDispatch() {
  const { profile, company, drivers, trips, assignments, loadDrivers, loadTrips, loadAssignments, refreshTripsFromSentry, sentryStatus } = useApp();
  const [refreshing, setRefreshing] = useState(false);
  const [take5Driver, setTake5Driver] = useState(null);
  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showCSVImport, setShowCSVImport] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [selectedTrip, setSelectedTrip] = useState(null);
  const [search, setSearch] = useState('');
  const [assigning, setAssigning] = useState(null);
  const [companyTripView, setCompanyTripView] = useState('queue');

  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());

  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [showDeleteSelectedModal, setShowDeleteSelectedModal] = useState(false);
  const [showDeleteSingleModal, setShowDeleteSingleModal] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteToast, setDeleteToast] = useState(null);

  const isCompanyUser = profile?.role === 'company';
  const canManageFleet = isCompanyUser;

  const assignedTripIds = new Set(assignments.filter(a => a.status !== 'rejected').map(a => a.trip_id));

  const availableTrips = trips.filter(t => {
    if (t.status !== 'available') return false;
    if (search) {
      const q = search.toLowerCase();
      return (t.pu_address || '').toLowerCase().includes(q) ||
             (t.do_address || '').toLowerCase().includes(q) ||
             (t.sentry_trip_id || '').toLowerCase().includes(q);
    }
    return true;
  });

  async function handleRefresh() {
    setRefreshing(true);
    await refreshTripsFromSentry();
    await loadDrivers();
    setRefreshing(false);
  }

  async function assignTrip(trip, driver) {
    setAssigning(trip.sentry_trip_id);

    const lastModifiedAt = trip.sentry_last_modified_at || '';

    const { error } = await supabase.from('trip_assignments').insert({
      trip_id: trip.sentry_trip_id,
      driver_id: driver.id,
      company_id: driver.company_id || company?.id || null,
      driver_name: driver.full_name,
      status: 'pending',
      trip_processing_status_id: 0,
      pu_address: trip.pu_address,
      do_address: trip.do_address,
      pu_time: trip.pu_time,
      delivery_price: parseFloat(trip.delivery_price) || 0,
      mileage: parseFloat(trip.mileage) || 0,
    });

    if (!error) {
      await supabase
        .from('marketplace_trips')
        .update({
          status: 'assigned',
          taken_by: driver.id,
          company_id: driver.company_id || company?.id || null,
        })
        .eq('sentry_trip_id', trip.sentry_trip_id);

      await fbSet(`driver_notifications/${driver.id}`, {
        type: 'new_trip',
        tripId: trip.sentry_trip_id,
        lastModifiedAt,
        puAddress: trip.pu_address,
        doAddress: trip.do_address,
        puTime: trip.pu_time,
        deliveryPrice: trip.delivery_price,
        mileage: trip.mileage,
        assignedAt: Date.now(),
      });

      if (sentryApi.enabled && sentryApi.features.marketplaceTrips) {
        const takeResult = await sentryApi.takeMarketplaceTrip(trip.sentry_trip_id);
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'marketplace_take',
          direction: 'export',
          record_type: 'trip',
          external_id: trip.sentry_trip_id,
          status: takeResult.ok ? 'success' : 'failed',
          error_message: takeResult.ok ? '' : (takeResult.error || `HTTP ${takeResult.status}`),
          payload: { driver_id: driver.id, driver_name: driver.full_name },
        });
      }

      if (sentryApi.enabled && sentryApi.features.tripAcceptReject) {
        const processedResult = await sentryApi.reportTripProcessed(trip.sentry_trip_id, lastModifiedAt);
        await supabase.from('sentry_sync_log').insert({
          sync_type: 'trip_processed',
          direction: 'export',
          record_type: 'trip',
          external_id: trip.sentry_trip_id,
          status: processedResult.ok ? 'success' : 'failed',
          error_message: processedResult.ok ? '' : (processedResult.error || `HTTP ${processedResult.status}`),
          payload: { driver_id: driver.id, driver_name: driver.full_name, trip_processing_status_id: 0 },
        });
      }

      await loadTrips();
      await loadAssignments();
    }
    setAssigning(null);
  }

  const scoredTrips = availableTrips.map(t => {
    let score = parseFloat(t.delivery_price) || 0;
    const serviceZone = detectServiceZone(t.pu_address || '');
    if (selectedDriver?.start_coords && t.coords) {
      const dist = haversineDistance(
        selectedDriver.start_coords.lat, selectedDriver.start_coords.lng,
        t.coords.lat, t.coords.lng
      );
      score += Math.max(0, 10 - dist) * 2;
    }
    score += getZonePreferenceBonus(serviceZone, normalizePreferredZones(selectedDriver?.preferred_zones), 10);
    return { ...t, score, serviceZone };
  }).sort((a, b) => b.score - a.score);

  const activeAssignments = assignments.filter(a => !['completed', 'cancelled', 'rejected'].includes(a.status));
  const visibleAssignments = activeAssignments.filter(a => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (a.pu_address || '').toLowerCase().includes(q) ||
           (a.do_address || '').toLowerCase().includes(q) ||
           (a.driver_name || '').toLowerCase().includes(q) ||
           (a.trip_id || '').toLowerCase().includes(q);
  });
  const companyOpenTrips = scoredTrips.filter(trip => !assignedTripIds.has(trip.sentry_trip_id));

  function showToast(msg, type = 'success') {
    setDeleteToast({ msg, type });
    setTimeout(() => setDeleteToast(null), 4000);
  }

  async function hardDeleteDriver(driver) {
    if (driver.sentry_driver_id && sentryApi.enabled && sentryApi.features.drivers) {
      const result = await sentryApi.deactivateDriver(driver.sentry_driver_id);
      await supabase.from('sentry_sync_log').insert({
        sync_type: 'driver_hard_delete',
        direction: 'export',
        record_type: 'driver',
        external_id: driver.sentry_driver_id,
        internal_id: driver.id,
        status: result.ok ? 'success' : 'failed',
        error_message: result.ok ? '' : (result.error || `HTTP ${result.status}`),
        payload: { full_name: driver.full_name },
      });
    }
    await supabase.from('drivers').delete().eq('id', driver.id);
  }

  async function handleDeleteAll() {
    setDeleting(true);
    try {
      for (const driver of drivers) {
        await hardDeleteDriver(driver);
      }
      const count = drivers.length;
      await loadDrivers();
      setShowDeleteAllModal(false);
      showToast(`${count} driver${count !== 1 ? 's' : ''} permanently deleted`);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeleting(false);
  }

  async function handleDeleteSelected() {
    setDeleting(true);
    try {
      const toDelete = drivers.filter(d => selectedIds.has(d.id));
      for (const driver of toDelete) {
        await hardDeleteDriver(driver);
      }
      const count = toDelete.length;
      await loadDrivers();
      setShowDeleteSelectedModal(false);
      setSelectMode(false);
      setSelectedIds(new Set());
      showToast(`${count} driver${count !== 1 ? 's' : ''} permanently deleted`);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeleting(false);
  }

  async function handleDeleteSingle() {
    if (!showDeleteSingleModal) return;
    setDeleting(true);
    try {
      await hardDeleteDriver(showDeleteSingleModal);
      await loadDrivers();
      setShowDeleteSingleModal(null);
      showToast(`${showDeleteSingleModal.full_name} permanently deleted`);
    } catch (err) {
      showToast('Delete failed: ' + err.message, 'error');
    }
    setDeleting(false);
  }

  function toggleSelectAll() {
    if (selectedIds.size === drivers.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(drivers.map(d => d.id)));
    }
  }

  function toggleSelectDriver(id) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectedDriverNames = drivers
    .filter(d => selectedIds.has(d.id))
    .map(d => d.full_name);

  return (
    <div className="flex h-full overflow-hidden relative">
      {deleteToast && (
        <div
          className="fixed top-4 left-1/2 z-50 px-4 py-2.5 rounded-xl text-sm font-600 shadow-lg"
          style={{
            transform: 'translateX(-50%)',
            background: deleteToast.type === 'error' ? 'rgba(255,71,87,0.15)' : 'rgba(0,229,160,0.12)',
            border: `1px solid ${deleteToast.type === 'error' ? 'rgba(255,71,87,0.3)' : 'rgba(0,229,160,0.3)'}`,
            color: deleteToast.type === 'error' ? '#ff4757' : '#00e5a0',
            fontWeight: 600,
          }}
        >
          {deleteToast.msg}
        </div>
      )}

      <aside className="w-72 flex-shrink-0 flex flex-col border-r overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#07090d' }}>
        <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              {selectMode && (
                <button
                  onClick={toggleSelectAll}
                  className="flex items-center justify-center"
                  title={selectedIds.size === drivers.length ? 'Deselect all' : 'Select all'}
                >
                  {selectedIds.size === drivers.length ? (
                    <CheckSquare className="w-4 h-4" style={{ color: '#c9a84c' }} />
                  ) : (
                    <Square className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                  )}
                </button>
              )}
              <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
                {selectMode && selectedIds.size > 0
                  ? `${selectedIds.size} of ${drivers.length} selected`
                  : `Fleet — ${drivers.length}`}
              </p>
            </div>
            <div className="flex gap-1">
              {!selectMode ? (
                <>
                  {canManageFleet && (
                    <>
                      <button onClick={() => setShowCSVImport(true)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1">
                        <Upload className="w-3 h-3" /> CSV
                      </button>
                      <button onClick={() => setShowAddDriver(true)} className="btn-ghost px-2 py-1 text-xs flex items-center gap-1">
                        <Plus className="w-3 h-3" /> Add
                      </button>
                      {drivers.length > 0 && (
                        <>
                          <button
                            onClick={() => setSelectMode(true)}
                            className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                            title="Select drivers to delete"
                          >
                            <CheckSquare className="w-3 h-3" />
                          </button>
                          <button
                            onClick={() => setShowDeleteAllModal(true)}
                            className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all"
                            style={{ background: 'rgba(255,71,87,0.08)', border: '1px solid rgba(255,71,87,0.2)', color: 'rgba(255,71,87,0.7)' }}
                            title="Delete all drivers"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </>
                      )}
                    </>
                  )}
                </>
              ) : (
                <>
                  <button
                    onClick={() => {
                      if (selectedIds.size > 0) setShowDeleteSelectedModal(true);
                    }}
                    disabled={selectedIds.size === 0}
                    className="px-2 py-1 rounded-lg text-xs flex items-center gap-1 transition-all"
                    style={{
                      background: selectedIds.size > 0 ? 'rgba(255,71,87,0.1)' : 'rgba(255,71,87,0.03)',
                      border: `1px solid ${selectedIds.size > 0 ? 'rgba(255,71,87,0.3)' : 'rgba(255,71,87,0.1)'}`,
                      color: selectedIds.size > 0 ? '#ff4757' : 'rgba(255,71,87,0.3)',
                    }}
                  >
                    <Trash2 className="w-3 h-3" />
                    {selectedIds.size > 0 ? `Delete ${selectedIds.size}` : 'Delete'}
                  </button>
                  <button
                    onClick={() => { setSelectMode(false); setSelectedIds(new Set()); }}
                    className="btn-ghost px-2 py-1 text-xs"
                  >
                    Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {drivers.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                <Users className="w-6 h-6" style={{ color: '#c9a84c' }} />
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {canManageFleet
                  ? 'No drivers yet. Import CSV or add manually.'
                  : 'No company drivers are loaded yet. Drivers are managed inside each company account.'}
              </p>
              {canManageFleet && (
                <button onClick={() => setShowCSVImport(true)} className="btn-gold text-xs px-4 py-2">Import CSV</button>
              )}
            </div>
          ) : (
            drivers.map(driver => (
              <div key={driver.id} className="relative">
                {selectMode && (
                  <button
                    onClick={() => toggleSelectDriver(driver.id)}
                    className="absolute top-2 left-2 z-10 w-5 h-5 flex items-center justify-center"
                    style={{ background: 'rgba(13,17,23,0.9)', borderRadius: 4 }}
                  >
                    {selectedIds.has(driver.id) ? (
                      <CheckSquare className="w-4 h-4" style={{ color: '#c9a84c' }} />
                    ) : (
                      <Square className="w-4 h-4" style={{ color: 'rgba(255,255,255,0.3)' }} />
                    )}
                  </button>
                )}
                <DriverCard
                  driver={driver}
                  selected={!selectMode && selectedDriver?.id === driver.id}
                  onClick={() => {
                    if (selectMode) {
                      toggleSelectDriver(driver.id);
                    } else {
                      setSelectedDriver(prev => prev?.id === driver.id ? null : driver);
                    }
                  }}
                  onTake5={() => setTake5Driver(driver)}
                  onPhotoUpdate={() => loadDrivers()}
                  onRemove={() => setShowDeleteSingleModal(driver)}
                  tripCount={assignments.filter(a => a.driver_id === driver.id && a.status !== 'completed').length}
                />
              </div>
            ))
          )}
        </div>
      </aside>

      <div className="flex-1 relative overflow-hidden">
        <MapView
          drivers={drivers}
          trips={availableTrips}
          selectedDriver={selectedDriver}
          onDriverClick={(driver) => {
            setSelectedDriver(prev => prev?.id === driver.id ? null : driver);
          }}
        />

        {selectedDriver && (
          <DriverDetailPanel
            driver={selectedDriver}
            assignments={assignments}
            availableTrips={scoredTrips}
            onClose={() => setSelectedDriver(null)}
            onDriverUpdated={async (updatedDriver) => {
              if (updatedDriver) {
                setSelectedDriver(updatedDriver);
              }
              const refreshedDrivers = await loadDrivers();
              const refreshedDriver = refreshedDrivers.find(driver => driver.id === (updatedDriver?.id || selectedDriver.id));
              if (refreshedDriver) {
                setSelectedDriver(refreshedDriver);
              }
            }}
            onAssignTrip={(trip) => {
              assignTrip(trip, selectedDriver);
            }}
          />
        )}
      </div>

      <aside className="w-72 flex-shrink-0 flex flex-col border-l overflow-hidden" style={{ borderColor: 'rgba(255,255,255,0.06)', background: '#07090d' }}>
        <div className="p-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-700 uppercase tracking-wider" style={{ color: 'rgba(255,255,255,0.4)', fontWeight: 700 }}>
              {isCompanyUser
                ? companyTripView === 'queue'
                  ? `Open Trips — ${companyOpenTrips.length}`
                  : `Active Trips — ${visibleAssignments.length}`
                : `Trips — ${availableTrips.length}`}
            </p>
            <div className="flex gap-1.5">
              {!isCompanyUser && (
                <>
                  <button
                    onClick={() => setShowWalkthrough(true)}
                    className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                    title="Test dispatch walkthrough"
                  >
                    <BookOpen className="w-3 h-3" /> Test
                  </button>
                  <button
                    onClick={handleRefresh}
                    disabled={refreshing}
                    className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${refreshing ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </>
              )}
            </div>
          </div>
          {isCompanyUser && (
            <div className="flex gap-1 p-1 rounded-lg mb-2" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)' }}>
              {[
                { key: 'queue', label: 'Open Queue' },
                { key: 'active', label: 'Assigned' },
              ].map(option => (
                <button
                  key={option.key}
                  type="button"
                  onClick={() => setCompanyTripView(option.key)}
                  className="flex-1 px-3 py-1.5 rounded-lg text-xs transition-all"
                  style={{
                    background: companyTripView === option.key ? 'rgba(201,168,76,0.15)' : 'transparent',
                    color: companyTripView === option.key ? '#c9a84c' : 'rgba(255,255,255,0.45)',
                    fontWeight: companyTripView === option.key ? 600 : 400,
                  }}
                >
                  {option.label}
                </button>
              ))}
            </div>
          )}
          <input
            placeholder={
              isCompanyUser
                ? companyTripView === 'queue'
                  ? 'Search open trips...'
                  : 'Search active trips...'
                : 'Search trips...'
            }
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full text-xs py-1.5"
            style={{ fontSize: 12 }}
          />
        </div>

        <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
          {isCompanyUser ? (
            companyTripView === 'queue' ? (
              companyOpenTrips.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                    <Navigation className="w-6 h-6" style={{ color: '#c9a84c' }} />
                  </div>
                  <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                    No open trips are available for dispatch right now.
                  </p>
                  <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.28)' }}>
                    Imported provider trips will appear here for your company dispatch team to assign.
                  </p>
                </div>
              ) : (
                companyOpenTrips.map(trip => (
                  <TripCard
                    key={trip.id}
                    trip={trip}
                    selected={selectedTrip?.id === trip.id}
                    onClick={() => setSelectedTrip(prev => prev?.id === trip.id ? null : trip)}
                    onAssign={selectedDriver ? () => assignTrip(trip, selectedDriver) : null}
                    assigning={assigning === trip.sentry_trip_id}
                    assigned={assignedTripIds.has(trip.sentry_trip_id)}
                  />
                ))
              )
            ) : visibleAssignments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                  <Navigation className="w-6 h-6" style={{ color: '#c9a84c' }} />
                </div>
                <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  {company?.company_name
                    ? `No active trips for ${company.company_name} right now.`
                    : 'No active trips for this company right now.'}
                </p>
              </div>
            ) : (
              visibleAssignments.map(assignment => (
                <div
                  key={assignment.id}
                  className="rounded-xl p-3"
                  style={{
                    background: 'rgba(255,255,255,0.03)',
                    border: '1px solid rgba(255,255,255,0.06)',
                  }}
                >
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <p className="text-xs font-700 uppercase tracking-wider" style={{ color: '#c9a84c', fontWeight: 700 }}>
                      {assignment.status || 'assigned'}
                    </p>
                    <p className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                      {assignment.driver_name || assignment.drivers?.full_name || 'Unassigned'}
                    </p>
                  </div>
                  <p className="text-sm" style={{ color: '#e5e7eb' }}>{assignment.pu_address || 'Unknown pickup'}</p>
                  <p className="text-xs mt-1" style={{ color: 'rgba(255,255,255,0.45)' }}>{assignment.do_address || 'Unknown dropoff'}</p>
                  <div className="flex items-center justify-between mt-3 text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>
                    <span>{assignment.pu_time || 'No pickup time'}</span>
                    <span>${parseFloat(assignment.delivery_price || 0).toFixed(2)}</span>
                  </div>
                </div>
              ))
            )
          ) : scoredTrips.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 gap-3 text-center px-4">
              <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(201,168,76,0.1)' }}>
                <Navigation className="w-6 h-6" style={{ color: '#c9a84c' }} />
              </div>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
                {sentryStatus.ok ? 'No trips available. Click Refresh.' : 'Connect Sentry API in Settings.'}
              </p>
              <button onClick={handleRefresh} disabled={refreshing} className="btn-gold text-xs px-4 py-2">
                {refreshing ? 'Loading...' : 'Refresh Trips'}
              </button>
            </div>
          ) : (
            scoredTrips.map(trip => (
              <TripCard
                key={trip.id}
                trip={trip}
                selected={selectedTrip?.id === trip.id}
                onClick={() => setSelectedTrip(prev => prev?.id === trip.id ? null : trip)}
                onAssign={selectedDriver ? () => assignTrip(trip, selectedDriver) : null}
                assigning={assigning === trip.sentry_trip_id}
                assigned={assignedTripIds.has(trip.sentry_trip_id)}
              />
            ))
          )}
        </div>
      </aside>

      {take5Driver && (
        <Take5Modal
          driver={take5Driver}
          trips={scoredTrips.slice(0, 5)}
          onClose={() => setTake5Driver(null)}
          onAssign={(trip) => assignTrip(trip, take5Driver)}
        />
      )}

      {canManageFleet && showAddDriver && (
        <AddDriverModal onClose={() => { setShowAddDriver(false); loadDrivers(); }} />
      )}

      {canManageFleet && showCSVImport && (
        <CSVImportModal onClose={() => { setShowCSVImport(false); loadDrivers(); }} />
      )}

      {canManageFleet && showDeleteAllModal && (
        <DeleteConfirmModal
          title="Delete All Drivers"
          subtitle={`This will permanently remove all ${drivers.length} drivers`}
          names={drivers.map(d => d.full_name)}
          requireTyping={true}
          confirmWord="DELETE ALL"
          confirmLabel={`Delete All ${drivers.length} Drivers`}
          onConfirm={handleDeleteAll}
          onClose={() => setShowDeleteAllModal(false)}
          loading={deleting}
        />
      )}

      {canManageFleet && showDeleteSelectedModal && (
        <DeleteConfirmModal
          title={`Delete ${selectedIds.size} Driver${selectedIds.size !== 1 ? 's' : ''}`}
          subtitle="Selected drivers will be permanently removed"
          names={selectedDriverNames}
          requireTyping={false}
          confirmLabel={`Delete ${selectedIds.size} Driver${selectedIds.size !== 1 ? 's' : ''}`}
          onConfirm={handleDeleteSelected}
          onClose={() => setShowDeleteSelectedModal(false)}
          loading={deleting}
        />
      )}

      {canManageFleet && showDeleteSingleModal && (
        <DeleteConfirmModal
          title={`Delete ${showDeleteSingleModal.full_name}`}
          subtitle="This driver will be permanently removed"
          names={[showDeleteSingleModal.full_name]}
          requireTyping={false}
          confirmLabel="Delete Driver"
          onConfirm={handleDeleteSingle}
          onClose={() => setShowDeleteSingleModal(null)}
          loading={deleting}
        />
      )}

      {!isCompanyUser && showWalkthrough && (
        <DispatchWalkthrough
          onClose={() => setShowWalkthrough(false)}
          onTriggerAction={(action) => {
            if (action === 'csv') {
              setShowWalkthrough(false);
              setShowCSVImport(true);
            }
          }}
        />
      )}

      <ChatPanel />
    </div>
  );
}
