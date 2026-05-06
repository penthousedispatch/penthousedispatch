import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Building2, ClipboardList } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useApp } from '../../context/AppContext';
import { CompanyPrograms } from '../company/CompanyDashboard';

export default function AdminPrograms() {
  const navigate = useNavigate();
  const { adminPreviewCompany, setAdminPreviewCompany } = useApp();
  const [companies, setCompanies] = useState([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState(adminPreviewCompany?.id || '');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function loadCompanies() {
      const { data } = await supabase
        .from('companies')
        .select('id, company_name, app_display_name, is_approved, onboarding_status, is_suspended')
        .order('company_name');
      if (!mounted) return;
      const approved = (data || []).filter(companyRow => (
        !companyRow.is_suspended &&
        (companyRow.is_approved || String(companyRow.onboarding_status || '').toLowerCase() === 'approved')
      ));
      setCompanies(approved);
      setLoading(false);
    }
    loadCompanies();
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (adminPreviewCompany?.id) {
      setSelectedCompanyId(adminPreviewCompany.id);
    }
  }, [adminPreviewCompany?.id]);

  const selectedCompany = useMemo(() => (
    companies.find(companyRow => companyRow.id === selectedCompanyId) || adminPreviewCompany || null
  ), [companies, selectedCompanyId, adminPreviewCompany]);

  function handleScopeCompany() {
    if (!selectedCompany) return;
    setAdminPreviewCompany(selectedCompany);
    navigate(`/admin/company-preview/${selectedCompany.id}/programs`);
  }

  if (loading) {
    return <div className="h-full flex items-center justify-center" style={{ color: 'rgba(255,255,255,0.45)' }}>Loading programs workspace…</div>;
  }

  return (
    <div className="h-full overflow-y-auto pb-16" style={{ background: '#07090d', color: '#e5e7eb' }}>
      <div className="max-w-7xl mx-auto px-5 py-5 space-y-4">
        <div className="rounded-2xl p-4" style={{ background: '#0d1117', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
            <div>
              <p className="text-lg font-700" style={{ color: '#c9a84c', fontWeight: 700 }}>Partner programs</p>
              <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.48)', lineHeight: 1.6 }}>
                Choose a company, then edit partner sites and child rosters—the same records the company sees under Programs.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <select
                value={selectedCompanyId}
                onChange={event => setSelectedCompanyId(event.target.value)}
                className="min-w-[240px] rounded-xl px-3 py-2.5 text-sm"
                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#e5e7eb' }}
              >
                <option value="">Select company…</option>
                {companies.map(companyRow => (
                  <option key={companyRow.id} value={companyRow.id}>
                    {companyRow.app_display_name || companyRow.company_name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleScopeCompany}
                disabled={!selectedCompany}
                className="px-3 py-2.5 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(201,168,76,0.12)', border: '1px solid rgba(201,168,76,0.24)', color: '#c9a84c', opacity: selectedCompany ? 1 : 0.55 }}
              >
                Open Company Preview
              </button>
            </div>
          </div>

          {!selectedCompany && (
            <div className="mt-4 rounded-xl p-4" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="flex items-start gap-3">
                <Building2 className="w-5 h-5 mt-0.5" style={{ color: '#7dd3fc' }} />
                <div>
                  <p className="text-sm font-700" style={{ fontWeight: 700 }}>Pick a company first</p>
                  <p className="text-sm mt-1" style={{ color: 'rgba(255,255,255,0.48)', lineHeight: 1.6 }}>
                    Pick a company above to load its directory, or open one from Companies first.
                  </p>
                  <Link
                    to="/admin/companies"
                    className="inline-flex items-center gap-2 mt-3 px-3 py-2 rounded-xl text-sm"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', color: '#e5e7eb', textDecoration: 'none' }}
                  >
                    <ClipboardList className="w-4 h-4" />
                    Go to Companies
                  </Link>
                </div>
              </div>
            </div>
          )}
        </div>

        {selectedCompany && <CompanyPrograms company={selectedCompany} />}
      </div>
    </div>
  );
}
