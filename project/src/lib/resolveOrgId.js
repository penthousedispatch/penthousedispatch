import { supabase } from './supabase';
import { ensurePlatformAdminOrg } from './platformAdminOrg';

export async function resolveOrgIdForAdmin({
  orgId = null,
  user = null,
  isPlatformOwner = false,
  role = '',
}) {
  if (orgId) return orgId;
  if (!user?.id) return null;

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (membership?.org_id) return membership.org_id;

  if (isPlatformOwner || role === 'admin') {
    try {
      const platformOrg = await ensurePlatformAdminOrg(user, { forceBootstrap: true });
      if (platformOrg?.id) return platformOrg.id;
    } catch {
      // Fall through to generic org fallback.
    }
  }

  const { data: latestAiRow } = await supabase
    .from('ai_settings')
    .select('org_id')
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestAiRow?.org_id) return latestAiRow.org_id;

  const { data: earliestOrg } = await supabase
    .from('organizations')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return earliestOrg?.id || null;
}
