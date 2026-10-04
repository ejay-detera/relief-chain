import { supabase } from '@/lib/supabase';
import { isVoucherScannedLocally } from '@/services/voucher-sync-service';
import { ApplicationStage, ApplicationStatusDetails, StatusHistoryEntry } from '@/types/application-status';

interface RawEnrollmentQueryRow {
  id: string;
  program_id: string;
  beneficiary_identity_id: string | null;
  approval_status: 'Approved' | 'Pending' | 'Rejected';
  voucher_balance: number | null;
  allocation_amount_stroops?: number | string | null;
  category: string;
  expires_at?: string | null;
  scanned_at?: string | null;
  created_at: string;
  approved_at: string | null;
  rejected_at?: string | null;
  rejection_remarks?: string | null;
  program?: {
    id: string;
    name: string;
    purpose?: string | null;
    voucher_type?: string | null;
    selected_merchants?: unknown;
    expires_at?: string | null;
    voucher_expiration?: string | null;
    distribution_end?: string | null;
    amount_per_beneficiary?: number | null;
    voucher_value?: number | null;
    organization?: {
      name: string;
    } | null;
    program_merchants?: {
      category: string | null;
    }[] | null;
  } | null;
  beneficiary_identity?: {
    verified_at: string | null;
  } | null;
}

function resolveAccreditedMerchants(
  program?: RawEnrollmentQueryRow['program'],
  enrollmentCategory?: string
): {
  accreditedMerchants: string[];
  redemptionInstructions: string | null;
} {
  const rawSelected = program?.selected_merchants;
  const selectedList: string[] = Array.isArray(rawSelected)
    ? rawSelected.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
    : typeof rawSelected === 'string'
      ? (() => {
          try {
            const parsed = JSON.parse(rawSelected);
            return Array.isArray(parsed)
              ? parsed.filter((m): m is string => typeof m === 'string' && m.trim().length > 0)
              : [rawSelected.trim()];
          } catch {
            return [rawSelected.trim()];
          }
        })()
      : [];

  const pmCategories = Array.from(
    new Set(
      (program?.program_merchants ?? [])
        .map((pm) => pm.category)
        .filter((cat): cat is string => Boolean(cat))
    )
  );

  const accreditedMerchants = Array.from(
    new Set([...selectedList, ...pmCategories])
  );

  const aidCategory = enrollmentCategory || program?.voucher_type || 'General Assistance';
  const redemptionInstructions =
    accreditedMerchants.length === 0
      ? null
      : aidCategory === 'Cash'
        ? 'Present your digital QR voucher at authorized cash disbursement stations.'
        : `Present your voucher QR to scan at accredited ${aidCategory.toLowerCase()} retail partners.`;

  return { accreditedMerchants, redemptionInstructions };
}

/** Real timestamps and lifecycle flags gathered across tables. */
interface TimelineEvidence {
  /** When this enrollment's distribution_recipients row reached `confirmed`. */
  aidReleasedAt: string | null;
  hasRedemptions: boolean;
  firstRedemptionAt: string | null;
  lastRedemptionAt: string | null;
  isFullyConsumed: boolean;
  isDeadlineDue: boolean;
  isScanned: boolean;
  scannedAt: string | null;
  expiresAt: string | null;
}

const STAGES_ORDER: ApplicationStage[] = [
  'registered',
  'pending_verification',
  'verified',
  'approved',
  'aid_released',
  'redeemed',
  'completed',
];

const STAGE_LABELS: Record<ApplicationStage, { label: string; description: string }> = {
  registered: {
    label: 'Registered',
    description: 'Application submitted and profile information registered.',
  },
  pending_verification: {
    label: 'Pending Verification',
    description: 'Documents and eligibility criteria undergoing verification review.',
  },
  verified: {
    label: 'Verified',
    description: 'Applicant identity and eligibility requirements successfully verified.',
  },
  approved: {
    label: 'Approved',
    description: 'Program assistance approved by the distributing organization.',
  },
  aid_released: {
    label: 'Aid Released',
    description: 'Assistance allocation and digital vouchers released to wallet.',
  },
  redeemed: {
    label: 'Redeemed',
    description: 'Voucher assistance partially or fully redeemed with accredited merchants.',
  },
  completed: {
    label: 'Completed',
    description: 'Assistance lifecycle completed successfully.',
  },
  rejected: {
    label: 'Rejected',
    description: 'Application was not approved.',
  },
};

/**
 * Builds the chronological stepper/timeline based on enrollment state, redemptions,
 * scans, and distribution events.
 */
function buildTimeline(
  row: RawEnrollmentQueryRow,
  evidence: TimelineEvidence
): { currentStage: ApplicationStage; currentStageLabel: string; timeline: StatusHistoryEntry[] } {
  const approvalStatus = row.approval_status;
  const rejectionReason = row.rejection_remarks ?? null;
  const verifiedAt = row.beneficiary_identity?.verified_at ?? null;

  if (approvalStatus === 'Rejected') {
    const timeline: StatusHistoryEntry[] = [
      {
        stage: 'registered',
        label: STAGE_LABELS.registered.label,
        description: STAGE_LABELS.registered.description,
        timestamp: row.created_at,
        isCompleted: true,
        isCurrent: false,
      },
      {
        stage: 'pending_verification',
        label: STAGE_LABELS.pending_verification.label,
        description: STAGE_LABELS.pending_verification.description,
        timestamp: row.created_at,
        isCompleted: true,
        isCurrent: false,
      },
      {
        stage: 'rejected',
        label: STAGE_LABELS.rejected.label,
        description: rejectionReason ? `Reason: ${rejectionReason}` : STAGE_LABELS.rejected.description,
        timestamp: row.rejected_at ?? row.approved_at ?? row.created_at,
        isCompleted: true,
        isCurrent: true,
      },
    ];
    return {
      currentStage: 'rejected',
      currentStageLabel: 'Rejected',
      timeline,
    };
  }

  // Determine current active stage index
  let activeStageIndex = 0; // 'registered'
  if (approvalStatus === 'Pending') {
    activeStageIndex = 1; // 'pending_verification'
  } else if (approvalStatus === 'Approved') {
    // Stage resolution hierarchy:
    // 1. If all value is claimed or deadline is now due -> 'completed'
    // 2. Else if voucher has redemptions or has been scanned -> 'redeemed'
    // 3. Otherwise -> 'aid_released'
    if (evidence.isFullyConsumed || evidence.isDeadlineDue) {
      activeStageIndex = 6; // 'completed'
    } else if (evidence.hasRedemptions || evidence.isScanned) {
      activeStageIndex = 5; // 'redeemed'
    } else {
      activeStageIndex = 4; // 'aid_released'
    }
  }

  const timeline: StatusHistoryEntry[] = STAGES_ORDER.map((stage, idx) => {
    let ts: string | null = null;
    if (stage === 'registered' || stage === 'pending_verification') {
      ts = row.created_at;
    } else if (stage === 'verified') {
      ts = idx <= activeStageIndex ? (verifiedAt ?? row.approved_at ?? row.created_at) : null;
    } else if (stage === 'approved') {
      ts = idx <= activeStageIndex ? (row.approved_at ?? row.created_at) : null;
    } else if (stage === 'aid_released') {
      ts = idx <= activeStageIndex ? (evidence.aidReleasedAt ?? row.approved_at ?? row.created_at) : null;
    } else if (stage === 'redeemed') {
      ts = idx <= activeStageIndex
        ? (evidence.firstRedemptionAt ?? evidence.scannedAt ?? evidence.aidReleasedAt ?? row.approved_at ?? row.created_at)
        : null;
    } else if (stage === 'completed') {
      ts = idx <= activeStageIndex
        ? (evidence.lastRedemptionAt ?? evidence.firstRedemptionAt ?? evidence.expiresAt ?? row.approved_at ?? row.created_at)
        : null;
    }

    return {
      stage,
      label: STAGE_LABELS[stage].label,
      description: STAGE_LABELS[stage].description,
      timestamp: ts,
      isCompleted: idx < activeStageIndex || (idx === activeStageIndex && stage === 'completed'),
      isCurrent: idx === activeStageIndex,
    };
  });

  const currentStage = STAGES_ORDER[activeStageIndex];
  return {
    currentStage,
    currentStageLabel: STAGE_LABELS[currentStage].label,
    timeline,
  };
}

/**
 * Fetches the confirmed-at timestamp of this enrollment's distribution
 * (aid-release) record, if one exists. A beneficiary can read their own
 * `distribution_recipients` rows per the
 * "Beneficiaries can view own distribution recipients" policy
 * (20261002220000_add_rejected_at_and_require_rejection_remarks.sql).
 */
const fetchAidReleasedAt = async (enrollmentId: string): Promise<string | null> => {
  const { data } = await supabase
    .from('distribution_recipients')
    .select('confirmed_at')
    .eq('enrollment_id', enrollmentId)
    .eq('status', 'confirmed')
    .order('confirmed_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  return data?.confirmed_at ?? null;
};

export const fetchApplicationStatusDetails = async (
  enrollmentId: string
): Promise<ApplicationStatusDetails> => {
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select(`
      id,
      program_id,
      beneficiary_identity_id,
      approval_status,
      voucher_balance,
      allocation_amount_stroops,
      category,
      expires_at,
      scanned_at,
      created_at,
      approved_at,
      rejected_at,
      rejection_remarks,
      program:programs (
        id,
        name,
        purpose,
        voucher_type,
        selected_merchants,
        expires_at,
        voucher_expiration,
        distribution_end,
        amount_per_beneficiary,
        voucher_value,
        organization:organizations (
          name
        ),
        program_merchants (
          category
        )
      ),
      beneficiary_identity:beneficiary_identities (
        verified_at
      )
    `)
    .eq('id', enrollmentId)
    .single();

  if (enrollmentError || !enrollment) {
    throw enrollmentError ?? new Error('Application enrollment not found');
  }

  const rawRow = enrollment as unknown as RawEnrollmentQueryRow;

  // Check redemptions and the real aid-release timestamp in parallel.
  const [{ data: redemptions }, aidReleasedAt] = await Promise.all([
    supabase
      .from('redemptions')
      .select('id, redeemed_at, amount, remaining_balance')
      .eq('enrollment_id', enrollmentId)
      .order('redeemed_at', { ascending: true }),
    fetchAidReleasedAt(enrollmentId),
  ]);

  const redemptionList = (redemptions ?? []) as { id: string; redeemed_at: string | null; amount: number; remaining_balance: number | null }[];
  let hasRedemptions = redemptionList.length > 0;
  let firstRedemptionAt = hasRedemptions ? redemptionList[0].redeemed_at : null;
  let lastRedemptionAt = hasRedemptions ? redemptionList[redemptionList.length - 1].redeemed_at : null;

  // Fallback to projection if no redemptions rows found
  if (!hasRedemptions) {
    const { data: proj } = await supabase
      .from('beneficiary_balance_projection')
      .select('redeemed_stroops, reconciled_at, updated_at')
      .eq('program_id', rawRow.program_id)
      .maybeSingle();

    if (proj && Number(proj.redeemed_stroops ?? 0) > 0) {
      hasRedemptions = true;
      firstRedemptionAt = proj.updated_at || proj.reconciled_at || null;
      lastRedemptionAt = proj.updated_at || proj.reconciled_at || null;
    }
  }

  const deadlineCandidate =
    rawRow.expires_at ||
    rawRow.program?.expires_at ||
    rawRow.program?.voucher_expiration ||
    rawRow.program?.distribution_end ||
    null;

  const isDeadlineDue = (() => {
    if (!deadlineCandidate) return false;
    const d = new Date(deadlineCandidate).getTime();
    return !isNaN(d) && Date.now() >= d;
  })();

  const isLocallyScanned = isVoucherScannedLocally(rawRow.id);
  const isScanned = Boolean(rawRow.scanned_at) || isLocallyScanned;
  const scannedAt = rawRow.scanned_at ?? (isLocallyScanned ? new Date().toISOString() : null);

  const balance = Number(rawRow.voucher_balance ?? 0);
  const initialAllocationPhp = rawRow.allocation_amount_stroops
    ? Number(rawRow.allocation_amount_stroops) / 10_000_000
    : (rawRow.program?.voucher_value ?? rawRow.program?.amount_per_beneficiary ?? null);
  const hasBalanceDrop = initialAllocationPhp != null && balance < initialAllocationPhp;
  const isFullyConsumed = (hasRedemptions || hasBalanceDrop || isScanned) && balance <= 0;

  const { currentStage, currentStageLabel, timeline } = buildTimeline(
    rawRow,
    {
      aidReleasedAt,
      hasRedemptions,
      firstRedemptionAt,
      lastRedemptionAt,
      isFullyConsumed,
      isDeadlineDue,
      isScanned,
      scannedAt,
      expiresAt: deadlineCandidate,
    }
  );

  const { accreditedMerchants, redemptionInstructions } = resolveAccreditedMerchants(
    rawRow.program,
    rawRow.category
  );

  return {
    enrollmentId: rawRow.id,
    programId: rawRow.program_id,
    programName: rawRow.program?.name ?? 'Assistance Program',
    organizationName: rawRow.program?.organization?.name ?? 'Relief Organization',
    currentStage,
    currentStageLabel,
    approvalStatus: rawRow.approval_status,
    rejectionReason: rawRow.rejection_remarks ?? null,
    category: rawRow.category,
    voucherBalance: balance,
    timeline,
    createdAt: rawRow.created_at,
    updatedAt: rawRow.approved_at,
    accreditedMerchants,
    redemptionInstructions,
    purpose: rawRow.program?.purpose ?? null,
    expiresAt: deadlineCandidate,
    isDeadlineDue,
  };
};

export const fetchBeneficiaryApplicationHistory = async (
  beneficiaryId?: string
): Promise<ApplicationStatusDetails[]> => {
  let targetBeneficiaryId = beneficiaryId;
  if (!targetBeneficiaryId) {
    const { data: sessionData } = await supabase.auth.getSession();
    targetBeneficiaryId = sessionData.session?.user.id;
  }
  if (!targetBeneficiaryId) return [];

  const { data: enrollments, error } = await supabase
    .from('enrollments')
    .select(`
      id,
      program_id,
      beneficiary_identity_id,
      approval_status,
      voucher_balance,
      allocation_amount_stroops,
      category,
      expires_at,
      scanned_at,
      created_at,
      approved_at,
      rejected_at,
      rejection_remarks,
      program:programs (
        id,
        name,
        purpose,
        voucher_type,
        selected_merchants,
        expires_at,
        voucher_expiration,
        distribution_end,
        amount_per_beneficiary,
        voucher_value,
        organization:organizations (
          name
        ),
        program_merchants (
          category
        )
      ),
      beneficiary_identity:beneficiary_identities (
        verified_at
      )
    `)
    .eq('beneficiary_id', targetBeneficiaryId)
    .order('created_at', { ascending: false });

  if (error || !enrollments) return [];

  const evidenceByEnrollmentId = new Map<
    string,
    {
      hasRedemptions: boolean;
      firstRedemptionAt: string | null;
      lastRedemptionAt: string | null;
      aidReleasedAt: string | null;
    }
  >();

  await Promise.all(
    enrollments.map(async (item: any) => {
      const [{ data: redemptions }, aidReleasedAt] = await Promise.all([
        supabase
          .from('redemptions')
          .select('id, redeemed_at, amount, remaining_balance')
          .eq('enrollment_id', item.id)
          .order('redeemed_at', { ascending: true }),
        fetchAidReleasedAt(item.id),
      ]);
      const redemptionList = (redemptions ?? []) as { id: string; redeemed_at: string | null; amount: number; remaining_balance: number | null }[];
      let hasRedemptions = redemptionList.length > 0;
      let firstRedemptionAt = hasRedemptions ? redemptionList[0].redeemed_at : null;
      let lastRedemptionAt = hasRedemptions ? redemptionList[redemptionList.length - 1].redeemed_at : null;

      if (!hasRedemptions && item.program_id) {
        const { data: proj } = await supabase
          .from('beneficiary_balance_projection')
          .select('redeemed_stroops, reconciled_at, updated_at')
          .eq('program_id', item.program_id)
          .maybeSingle();

        if (proj && Number(proj.redeemed_stroops ?? 0) > 0) {
          hasRedemptions = true;
          firstRedemptionAt = proj.updated_at || proj.reconciled_at || null;
          lastRedemptionAt = proj.updated_at || proj.reconciled_at || null;
        }
      }

      evidenceByEnrollmentId.set(item.id, {
        hasRedemptions,
        firstRedemptionAt,
        lastRedemptionAt,
        aidReleasedAt,
      });
    })
  );

  const results: ApplicationStatusDetails[] = [];
  for (const item of enrollments) {
    const rawRow = item as unknown as RawEnrollmentQueryRow;
    const balance = Number(rawRow.voucher_balance ?? 0);
    const evidence = evidenceByEnrollmentId.get(rawRow.id) ?? {
      hasRedemptions: false,
      firstRedemptionAt: null,
      lastRedemptionAt: null,
      aidReleasedAt: null,
    };

    const deadlineCandidate =
      rawRow.expires_at ||
      rawRow.program?.expires_at ||
      rawRow.program?.voucher_expiration ||
      rawRow.program?.distribution_end ||
      null;

    const isDeadlineDue = (() => {
      if (!deadlineCandidate) return false;
      const d = new Date(deadlineCandidate).getTime();
      return !isNaN(d) && Date.now() >= d;
    })();

    const isLocallyScanned = isVoucherScannedLocally(rawRow.id);
    const isScanned = Boolean(rawRow.scanned_at) || isLocallyScanned;
    const scannedAt = rawRow.scanned_at ?? (isLocallyScanned ? new Date().toISOString() : null);

    const initialAllocationPhp = rawRow.allocation_amount_stroops
      ? Number(rawRow.allocation_amount_stroops) / 10_000_000
      : (rawRow.program?.voucher_value ?? rawRow.program?.amount_per_beneficiary ?? null);
    const hasBalanceDrop = initialAllocationPhp != null && balance < initialAllocationPhp;
    const isFullyConsumed = (evidence.hasRedemptions || hasBalanceDrop || isScanned) && balance <= 0;

    const { currentStage, currentStageLabel, timeline } = buildTimeline(
      rawRow,
      {
        aidReleasedAt: evidence.aidReleasedAt,
        hasRedemptions: evidence.hasRedemptions,
        firstRedemptionAt: evidence.firstRedemptionAt,
        lastRedemptionAt: evidence.lastRedemptionAt,
        isFullyConsumed,
        isDeadlineDue,
        isScanned,
        scannedAt,
        expiresAt: deadlineCandidate,
      }
    );

    const { accreditedMerchants, redemptionInstructions } = resolveAccreditedMerchants(
      rawRow.program,
      rawRow.category
    );

    results.push({
      enrollmentId: rawRow.id,
      programId: rawRow.program_id,
      programName: rawRow.program?.name ?? 'Assistance Program',
      organizationName: rawRow.program?.organization?.name ?? 'Relief Organization',
      currentStage,
      currentStageLabel,
      approvalStatus: rawRow.approval_status,
      rejectionReason: rawRow.rejection_remarks ?? null,
      category: rawRow.category,
      voucherBalance: balance,
      timeline,
      createdAt: rawRow.created_at,
      updatedAt: rawRow.approved_at,
      accreditedMerchants,
      redemptionInstructions,
      purpose: rawRow.program?.purpose ?? null,
      expiresAt: deadlineCandidate,
      isDeadlineDue,
    });
  }

  return results;
};
