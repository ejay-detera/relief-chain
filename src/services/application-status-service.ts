import { supabase } from '@/lib/supabase';
import { ApplicationStage, ApplicationStatusDetails, StatusHistoryEntry } from '@/types/application-status';

interface RawEnrollmentQueryRow {
  id: string;
  program_id: string;
  beneficiary_identity_id: string | null;
  approval_status: 'Approved' | 'Pending' | 'Rejected';
  voucher_balance: number | null;
  category: string;
  created_at: string;
  approved_at: string | null;
  rejected_at?: string | null;
  rejection_remarks?: string | null;
  program?: {
    id: string;
    name: string;
    organization?: {
      name: string;
    } | null;
  } | null;
  beneficiary_identity?: {
    verified_at: string | null;
  } | null;
}

/** Real timestamps gathered for stages that `enrollments` alone cannot answer. */
interface TimelineEvidence {
  /** When this enrollment's distribution_recipients row (if any) reached `confirmed` — the actual aid-release event. */
  aidReleasedAt: string | null;
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
 * and distribution events.
 *
 * Timestamps are drawn from real, distinct columns where one exists —
 * `rejected_at` for a rejection, `beneficiary_identities.verified_at` for
 * verification, `distribution_recipients.confirmed_at` for aid release — so
 * adjacent stages no longer silently share one `approved_at` value. Only
 * `registered`/`pending_verification` still share `created_at`: the schema
 * genuinely has no earlier moment to point to, since registration and
 * program application are the same `enrollments` insert today.
 */
function buildTimeline(
  row: RawEnrollmentQueryRow,
  evidence: TimelineEvidence,
  hasRedemptions: boolean,
  firstRedemptionAt: string | null,
  isFullyConsumed: boolean
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
        // rejected_at is the real moment of rejection (set by the
        // enrollments_set_rejected_at trigger); approved_at/created_at are
        // only fallbacks for rows written before that column existed.
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
    // If approved, check if aid released / redeemed / completed
    if (isFullyConsumed) {
      activeStageIndex = 6; // 'completed'
    } else if (hasRedemptions) {
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
      // Real verification timestamp from beneficiary_identities when
      // available; falls back to approved_at only for identities verified
      // before this column was wired to the status screen.
      ts = idx <= activeStageIndex ? (verifiedAt ?? row.approved_at ?? row.created_at) : null;
    } else if (stage === 'approved') {
      ts = idx <= activeStageIndex ? (row.approved_at ?? row.created_at) : null;
    } else if (stage === 'aid_released') {
      // Real aid-release timestamp from the confirmed distribution_recipients
      // row when one exists; falls back to approved_at if the enrollment was
      // approved outside the batch-distribution workflow.
      ts = idx <= activeStageIndex ? (evidence.aidReleasedAt ?? row.approved_at ?? row.created_at) : null;
    } else if (stage === 'redeemed' || stage === 'completed') {
      ts = idx <= activeStageIndex ? firstRedemptionAt : null;
    }

    return {
      stage,
      label: STAGE_LABELS[stage].label,
      description: STAGE_LABELS[stage].description,
      timestamp: ts,
      isCompleted: idx < activeStageIndex || (idx === activeStageIndex && stage === 'completed'),
      isCurrent: idx === activeStageIndex && stage !== 'completed',
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
      category,
      created_at,
      approved_at,
      rejected_at,
      rejection_remarks,
      program:programs (
        id,
        name,
        organization:organizations (
          name
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

  // Check redemptions and the real aid-release timestamp in parallel.
  const [{ data: redemptions }, aidReleasedAt] = await Promise.all([
    supabase
      .from('redemptions')
      .select('id, created_at, amount, remaining_balance')
      .eq('enrollment_id', enrollmentId)
      .order('created_at', { ascending: true }),
    fetchAidReleasedAt(enrollmentId),
  ]);

  const redemptionList = redemptions ?? [];
  const hasRedemptions = redemptionList.length > 0;
  const firstRedemptionAt = hasRedemptions ? redemptionList[0].created_at : null;
  const balance = Number(enrollment.voucher_balance ?? 0);
  const isFullyConsumed = hasRedemptions && balance <= 0;

  const rawRow = enrollment as unknown as RawEnrollmentQueryRow;
  const { currentStage, currentStageLabel, timeline } = buildTimeline(
    rawRow,
    { aidReleasedAt },
    hasRedemptions,
    firstRedemptionAt,
    isFullyConsumed
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
      category,
      created_at,
      approved_at,
      rejected_at,
      rejection_remarks,
      program:programs (
        id,
        name,
        organization:organizations (
          name
        )
      ),
      beneficiary_identity:beneficiary_identities (
        verified_at
      )
    `)
    .eq('beneficiary_id', targetBeneficiaryId)
    .order('created_at', { ascending: false });

  if (error || !enrollments) return [];

  // Same per-enrollment redemption/aid-release lookup as the single-item
  // detail fetch, run for every row in parallel rather than serially — this
  // also fixes the previous inconsistency where the list view inferred
  // "has this been redeemed" from `voucher_balance > 0` while the detail
  // view actually queried `redemptions`, which could disagree for the same
  // enrollment depending on which screen was open.
  const evidenceByEnrollmentId = new Map<
    string,
    { hasRedemptions: boolean; firstRedemptionAt: string | null; aidReleasedAt: string | null }
  >();

  await Promise.all(
    enrollments.map(async (item: any) => {
      const [{ data: redemptions }, aidReleasedAt] = await Promise.all([
        supabase
          .from('redemptions')
          .select('id, created_at')
          .eq('enrollment_id', item.id)
          .order('created_at', { ascending: true }),
        fetchAidReleasedAt(item.id),
      ]);
      const redemptionList = redemptions ?? [];
      evidenceByEnrollmentId.set(item.id, {
        hasRedemptions: redemptionList.length > 0,
        firstRedemptionAt: redemptionList.length > 0 ? redemptionList[0].created_at : null,
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
      aidReleasedAt: null,
    };
    const isFullyConsumed = evidence.hasRedemptions && balance <= 0;

    const { currentStage, currentStageLabel, timeline } = buildTimeline(
      rawRow,
      { aidReleasedAt: evidence.aidReleasedAt },
      evidence.hasRedemptions,
      evidence.firstRedemptionAt,
      isFullyConsumed
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
    });
  }

  return results;
};
