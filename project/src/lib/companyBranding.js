import { supabase } from './supabase';

export const DEFAULT_BRANDING = {
  company_name: 'Penthouse Dispatch',
  app_display_name: 'Penthouse Dispatch',
  logo_url: '',
  brand_primary: '#c9a84c',
  brand_accent: '#00e5a0',
  white_label_enabled: false,
};

export async function loadCompanyBranding(companyId = null) {
  let query = supabase
    .from('companies')
    .select('company_name, app_display_name, logo_url, brand_primary, brand_accent, white_label_enabled, is_approved, updated_at');

  if (companyId) {
    query = query.eq('id', companyId).maybeSingle();
  } else {
    query = query.eq('white_label_enabled', true).eq('is_approved', true).order('updated_at', { ascending: false }).limit(1).maybeSingle();
  }

  const { data, error } = await query;
  if (error || !data) return DEFAULT_BRANDING;
  return {
    ...DEFAULT_BRANDING,
    ...data,
    app_display_name: data.app_display_name || data.company_name || DEFAULT_BRANDING.app_display_name,
  };
}
