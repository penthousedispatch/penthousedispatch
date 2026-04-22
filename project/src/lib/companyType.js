export const COMPANY_SEGMENTS = {
  transport_company: {
    id: 'transport_company',
    label: 'Transportation Company',
    shortLabel: 'Transport',
    description: 'Dispatch company running drivers, trips, billing, and marketplace operations.',
    accent: '#c9a84c',
  },
  daycare_provider: {
    id: 'daycare_provider',
    label: 'Daycare Provider',
    shortLabel: 'Daycare',
    description: 'Daycare or early-childhood operator using family packets, release rules, and future ride readiness.',
    accent: '#00e5a0',
  },
  program_provider: {
    id: 'program_provider',
    label: 'Program Provider',
    shortLabel: 'Program',
    description: 'After-school, youth, sports, and program operators who need provider-admin transport controls.',
    accent: '#0ea5e9',
  },
  other_provider: {
    id: 'other_provider',
    label: 'Other Provider',
    shortLabel: 'Other',
    description: 'Any other partner organization that still needs provider-admin enrollment and compliance workflows.',
    accent: '#f59e0b',
  },
};

export const DEFAULT_COMPANY_SEGMENT = 'transport_company';

function readNoteTag(notes, key) {
  const match = String(notes || '').match(new RegExp(`${key}:([^\\n]+)`));
  return match?.[1]?.trim()?.toLowerCase() || '';
}

export function normalizeCompanySegment(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return COMPANY_SEGMENTS[normalized] ? normalized : DEFAULT_COMPANY_SEGMENT;
}

export function getCompanySegment(company) {
  const dbSegment = normalizeCompanySegment(company?.company_segment);
  if (company?.company_segment && COMPANY_SEGMENTS[dbSegment]) return dbSegment;

  const taggedSegment =
    readNoteTag(company?.notes, 'COMPANY_SEGMENT') ||
    readNoteTag(company?.notes, 'PROVIDER_TYPE');

  return normalizeCompanySegment(taggedSegment);
}

export function getCompanySegmentMeta(company) {
  return COMPANY_SEGMENTS[getCompanySegment(company)] || COMPANY_SEGMENTS[DEFAULT_COMPANY_SEGMENT];
}

export function isDaycareStyleCompany(company) {
  const segment = getCompanySegment(company);
  return segment === 'daycare_provider' || segment === 'program_provider' || segment === 'other_provider';
}

export function upsertCompanySegmentNote(notes, segment) {
  const normalizedSegment = normalizeCompanySegment(segment);
  const lines = String(notes || '')
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .filter(line => !/^COMPANY_SEGMENT:/i.test(line) && !/^PROVIDER_TYPE:/i.test(line));

  lines.unshift(`COMPANY_SEGMENT:${normalizedSegment.toUpperCase()}`);
  return lines.join('\n');
}
