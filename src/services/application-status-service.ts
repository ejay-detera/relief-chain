import { supabase } from '@/lib/supabase';
import { ApplicationStage, ApplicationStatusDetails, StatusHistoryEntry } from '@/types/application-status';

interface RawEnrollmentQueryRow {
  id: string;
  program_id: string;
  approval_status: 'Approved' | 'Pending' | 'Rejected';
  voucher_balance: number | null;
  category: string;
  created_at: string;
  approved_at: string | null;
  rejection_remarks?: string | null;
  program?: {
    id: string;
    name: string;
    organization?: {
      name: string;
    } | null;
  } | null;
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
 */
function buildTimeline(
  row: RawEnrollmentQueryRow,
  hasRedemptions: boolean,
  firstRedemptionAt: string | null,
  isFullyConsumed: boolean
): { currentStage: ApplicationStage; currentStageLabel: string; timeline: StatusHistoryEntry[] } {
  const approvalStatus = row.approval_status;
  const rejectionReason = row.rejection_remarks ?? null;

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
        timestamp: row.approved_at ?? row.created_at,
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
    } else if (stage === 'verified' || stage === 'approved' || stage === 'aid_released') {
      ts = idx <= activeStageIndex ? (row.approved_at ?? row.created_at) : null;
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

export const fetchApplicationStatusDetails = async (
  enrollmentId: string
): Promise<ApplicationStatusDetails> => {
  const { data: enrollment, error: enrollmentError } = await supabase
    .from('enrollments')
    .select(`
      id,
      program_id,
      approval_status,
      voucher_balance,
      category,
      created_at,
      approved_at,
      rejection_remarks,
      program:programs (
        id,
        name,
        organization:organizations (
          name
        )
      )
    `)
    .eq('id', enrollmentId)
    .single();

  if (enrollmentError || !enrollment) {
    throw enrollmentError ?? new Error('Application enrollment not found');
  }

  // Check redemptions
  const { data: redemptions } = await supabase
    .from('redemptions')
    .select('id, created_at, amount, remaining_balance')
    .eq('enrollment_id', enrollmentId)
    .order('created_at', { ascending: true });

  const redemptionList = redemptions ?? [];
  const hasRedemptions = redemptionList.length > 0;
  const firstRedemptionAt = hasRedemptions ? redemptionList[0].created_at : null;
  const balance = Number(enrollment.voucher_balance ?? 0);
  const isFullyConsumed = hasRedemptions && balance <= 0;

  const rawRow = enrollment as unknown as RawEnrollmentQueryRow;
  const { currentStage, currentStageLabel, timeline } = buildTimeline(
    rawRow,
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
      approval_status,
      voucher_balance,
      category,
      created_at,
      approved_at,
      rejection_remarks,
      program:programs (
        id,
        name,
        organization:organizations (
          name
        )
      )
    `)
    .eq('beneficiary_id', targetBeneficiaryId)
    .order('created_at', { ascending: false });

  if (error || !enrollments) return [];

  const results: ApplicationStatusDetails[] = [];
  for (const item of enrollments) {
    const rawRow = item as unknown as RawEnrollmentQueryRow;
    const { currentStage, currentStageLabel, timeline } = buildTimeline(
      rawRow,
      Number(rawRow.voucher_balance ?? 0) > 0,
      null,
      false
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
      voucherBalance: Number(rawRow.voucher_balance ?? 0),
      timeline,
      createdAt: rawRow.created_at,
      updatedAt: rawRow.approved_at,
    });
  }

  return results;
};
