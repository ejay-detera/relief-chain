import { supabase } from '@/lib/supabase';
import type { MerchantProgram, MerchantProgramStatus } from '@/types/merchant-program';

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === 'object' ? value as Record<string, unknown> : null;

const text = (value: unknown): string | null =>
  typeof value === 'string' && value.trim() ? value.trim() : null;

const number = (value: unknown): number => {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const textArray = (value: unknown): string[] =>
  Array.isArray(value) ? value.map(text).filter((item): item is string => item !== null) : [];

const relatedNames = (value: unknown, relationKey: string): string[] => {
  if (!Array.isArray(value)) return [];
  const names: string[] = [];
  value.forEach((entry) => {
    const relation = asRecord(entry)?.[relationKey];
    const candidates = Array.isArray(relation) ? relation : [relation];
    candidates.forEach((candidate) => {
      const name = text(asRecord(candidate)?.name);
      if (name) names.push(name);
    });
  });
  return names;
};

export const normalizeMerchantName = (value: string): string =>
  value.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-PH');

const localDateKey = (): string => {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
};

const deriveStatus = (rawStatus: string, startDate: string | null, endDate: string | null): MerchantProgramStatus => {
  const today = localDateKey();
  if (rawStatus === 'completed' || rawStatus === 'closed' || (endDate !== null && endDate < today)) return 'completed';
  if (rawStatus === 'scheduled' || (startDate !== null && startDate > today)) return 'scheduled';
  return 'active';
};

const parseProgram = (value: unknown, merchantName: string): MerchantProgram | null => {
  const row = asRecord(value);
  if (!row) return null;
  const id = text(row.id);
  const name = text(row.name);
  const rawStatus = text(row.status)?.toLowerCase() ?? 'active';
  if (!id || !name || rawStatus === 'draft') return null;

  const selectedMerchants = textArray(row.selected_merchants);
  const normalizedMerchantName = normalizeMerchantName(merchantName);
  const isVisible = selectedMerchants.length === 0 || (
    normalizedMerchantName.length > 0
    && selectedMerchants.some((selected) => normalizeMerchantName(selected) === normalizedMerchantName)
  );
  if (!isVisible) return null;

  const startDate = text(row.start_date);
  const endDate = text(row.expires_at);
  const areas = relatedNames(row.program_areas, 'areas');
  const barangays = relatedNames(row.program_barangays, 'barangays');

  return {
    id,
    name,
    purpose: text(row.purpose) ?? 'No purpose provided.',
    voucherValue: number(row.voucher_value),
    voucherTypes: textArray(row.voucher_types),
    voucherExpiration: text(row.voucher_expiration) ?? endDate,
    voucherQuantity: Math.max(0, Math.trunc(number(row.voucher_quantity))),
    distributionMethod: text(row.distribution_method) ?? 'Not specified',
    startDate,
    endDate,
    distributionStart: text(row.distribution_start),
    distributionEnd: text(row.distribution_end),
    scope: Array.from(new Set([...areas, ...barangays])),
    isOpenToAllMerchants: selectedMerchants.length === 0,
    status: deriveStatus(rawStatus, startDate, endDate),
    createdAt: text(row.created_at),
  };
};

const statusOrder: Record<MerchantProgramStatus, number> = { active: 0, scheduled: 1, completed: 2 };

const comparePrograms = (left: MerchantProgram, right: MerchantProgram): number => {
  const statusDifference = statusOrder[left.status] - statusOrder[right.status];
  if (statusDifference !== 0) return statusDifference;
  if (left.status === 'scheduled') {
    const dateDifference = (left.startDate ?? '9999-12-31').localeCompare(right.startDate ?? '9999-12-31');
    if (dateDifference !== 0) return dateDifference;
  } else if (left.status === 'completed') {
    const dateDifference = (right.endDate ?? '').localeCompare(left.endDate ?? '');
    if (dateDifference !== 0) return dateDifference;
  } else {
    const dateDifference = (left.endDate ?? '9999-12-31').localeCompare(right.endDate ?? '9999-12-31');
    if (dateDifference !== 0) return dateDifference;
  }
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
};

export const fetchMerchantPrograms = async (merchantName: string | null): Promise<MerchantProgram[]> => {
  const { data, error } = await supabase
    .from('programs')
    .select(`
      id, name, purpose, voucher_value, voucher_types, voucher_quantity,
      voucher_expiration, distribution_method, start_date, expires_at,
      distribution_start, distribution_end, selected_merchants, status, created_at,
      program_areas (areas (name)),
      program_barangays (barangays (name))
    `)
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!Array.isArray(data)) return [];
  return data
    .map((row: unknown) => parseProgram(row, merchantName ?? ''))
    .filter((program): program is MerchantProgram => program !== null)
    .sort(comparePrograms);
};