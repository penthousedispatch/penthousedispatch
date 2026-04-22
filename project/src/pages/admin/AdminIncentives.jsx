import React, { useEffect, useState } from 'react';
import IncentivesPanel from '../dispatcher/IncentivesPanel';
import { useApp } from '../../context/AppContext';
import { supabase } from '../../lib/supabase';
import { handleSupabaseError } from '../../utils/errorHandler';

export default function AdminIncentives() {
  const { adminPreviewCompany, loadDrivers } = useApp();
  const [orgId, setOrgId] = useState(null);
  const [previewDrivers, setPreviewDrivers] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadPreviewScope() {
      if (!adminPreviewCompany?.id) {
        setOrgId(null);
        setPreviewDrivers([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const nextDrivers = await loadDrivers({ companyId: adminPreviewCompany.id }).catch(() => []);
      const ownerUserId = adminPreviewCompany.owner_user_id || null;

      let membership = null;
      let membershipError = null;

      if (ownerUserId) {
        const result = await supabase
          .from('org_members')
          .select('org_id')
          .eq('user_id', ownerUserId)
          .limit(1)
          .maybeSingle();
        membership = result.data;
        membershipError = result.error;
      }

      if (!active) return;

      if (membershipError) {
        handleSupabaseError(membershipError, 'AdminIncentives:orgMembership', { silent: true });
      }

      setPreviewDrivers(Array.isArray(nextDrivers) ? nextDrivers : []);
      setOrgId(membership?.org_id || null);
      setLoading(false);
    }

    loadPreviewScope();

    return () => {
      active = false;
    };
  }, [adminPreviewCompany?.id, adminPreviewCompany?.owner_user_id]);

  if (!adminPreviewCompany?.id) {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ background: '#07090d', color: '#e5e7eb' }}>
        <div className="max-w-md w-full rounded-2xl p-6 text-center" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-lg font-700 mb-2" style={{ color: '#c9a84c', fontWeight: 700 }}>Select A Company Preview</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            Open a company from the admin companies page first so incentives stay scoped to that company instead of the platform admin workspace.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.45)' }}>
        Loading incentives workspace...
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="h-full flex items-center justify-center p-6" style={{ background: '#07090d', color: '#e5e7eb' }}>
        <div className="max-w-md w-full rounded-2xl p-6 text-center" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <p className="text-lg font-700 mb-2" style={{ color: '#ff4757', fontWeight: 700 }}>Incentives Setup Is Unavailable</p>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            This preview company does not have an org membership linked yet, so the incentives module cannot load safely from the admin app.
          </p>
        </div>
      </div>
    );
  }

  return <IncentivesPanel orgIdOverride={orgId} driversOverride={previewDrivers} />;
}
