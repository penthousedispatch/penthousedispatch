import { supabase } from './supabase';

const PLATFORM_OWNER_EMAILS = new Set([
  'frankny84@gmail.com',
  'thepenthousebrandcorp@gmail.com',
]);

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function buildOwnerOrgSlug(userId) {
  return `penthouse-platform-${String(userId || '').slice(0, 8)}`;
}

export function isPlatformOwnerUser(user) {
  return PLATFORM_OWNER_EMAILS.has(normalizeEmail(user?.email));
}

export async function ensurePlatformAdminOrg(user, options = {}) {
  if (!user?.id) return null;
  const forceBootstrap = options.forceBootstrap === true;

  const { data: membership } = await supabase
    .from('org_members')
    .select('org_id, role, organizations(*)')
    .eq('user_id', user.id)
    .in('role', ['admin', 'superadmin'])
    .limit(1)
    .maybeSingle();

  if (membership?.organizations) {
    return membership.organizations;
  }

  if (!isPlatformOwnerUser(user) && !forceBootstrap) {
    return null;
  }

  const slug = buildOwnerOrgSlug(user.id);
  const orgName = 'Penthouse Platform Admin';

  const { data: existingPlatformOrg } = await supabase
    .from('organizations')
    .select('*')
    .or(`slug.eq.${slug},name.eq.${orgName}`)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (existingPlatformOrg?.id) {
    const { error: existingMemberError } = await supabase
      .from('org_members')
      .upsert(
        {
          org_id: existingPlatformOrg.id,
          user_id: user.id,
          role: 'admin',
        },
        { onConflict: 'org_id,user_id' }
      );

    if (existingMemberError && !String(existingMemberError.message || '').toLowerCase().includes('duplicate')) {
      throw existingMemberError;
    }

    return existingPlatformOrg;
  }

  const { data: createdOrg, error: createOrgError } = await supabase
    .from('organizations')
    .insert({
      name: orgName,
      slug,
      plan: 'enterprise',
      settings: {
        kind: 'platform_admin',
        owner_email: normalizeEmail(user.email),
      },
    })
    .select('*')
    .maybeSingle();

  if (createOrgError && !String(createOrgError.message || '').toLowerCase().includes('duplicate')) {
    throw createOrgError;
  }

  let orgRow = createdOrg;

  if (!orgRow) {
    const { data: existingMembership } = await supabase
      .from('org_members')
      .select('org_id, organizations(*)')
      .eq('user_id', user.id)
      .in('role', ['admin', 'superadmin'])
      .limit(1)
      .maybeSingle();

    if (existingMembership?.organizations) {
      return existingMembership.organizations;
    }

    const { data: earliestOrg } = await supabase
      .from('organizations')
      .select('*')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    orgRow = earliestOrg || null;
  }

  if (!orgRow?.id) {
    return null;
  }

  const { error: memberError } = await supabase
    .from('org_members')
    .upsert(
      {
        org_id: orgRow.id,
        user_id: user.id,
        role: 'admin',
      },
      { onConflict: 'org_id,user_id' }
    );

  if (memberError && !String(memberError.message || '').toLowerCase().includes('duplicate')) {
    throw memberError;
  }

  return orgRow;
}
