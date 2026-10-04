import { ProgramItem } from '@/components/LguPrograms/ProgramCard';
import { supabase } from '@/lib/supabase';
import { ProgramProgressMetrics } from '@/types/program-progress';
import { STROOPS_PER_PESO } from '@/utils/report-utils';
import {
  computeProgramProgressMetrics,
  deriveProgramTimeline,
  RawProgressAggregates,
} from '@/utils/program-progress';

// Re-export pure logic
export {
  computeProgramProgressMetrics,
  deriveProgramTimeline,
  RawProgressAggregates,
};

/**
 * Fetches real-time aggregates from Supabase (enrollments & distribution_jobs)
 * and returns the computed ProgramProgressMetrics.
 */
export async function fetchProgramProgress(
  program: ProgramItem
): Promise<ProgramProgressMetrics> {
  try {
    const [enrollmentsRes, jobsRes] = await Promise.all([
      supabase
        .from('enrollments')
        .select('id, approval_status, profiles:beneficiary_id(verification_status)')
        .eq('program_id', program.id),
      supabase
        .from('distribution_jobs')
        .select('total_amount_stroops, confirmed_count, status')
        .eq('program_id', program.id),
    ]);

    const enrollments = enrollmentsRes.data || [];
    const jobs = jobsRes.data || [];

    const enrolled = enrollments.length;
    const approved = enrollments.filter((e: any) => e.approval_status === 'Approved').length;
    const verified = enrollments.filter(
      (e: any) => e.profiles?.verification_status === 'Verified'
    ).length;

    let distributedAmount = 0;
    let confirmedRecipients = 0;

    for (const job of jobs) {
      if (job.status === 'completed' || job.status === 'confirmed') {
        distributedAmount += Number(job.total_amount_stroops || 0) / STROOPS_PER_PESO;
        confirmedRecipients += Number(job.confirmed_count || 0);
      }
    }

    return computeProgramProgressMetrics(program, {
      enrolled,
      approved,
      verified,
      distributedAmount,
      confirmedRecipients,
    });
  } catch (error) {
    console.warn(`[ProgramProgress] Fallback calculation used for ${program.id}:`, error);
    return computeProgramProgressMetrics(program);
  }
}

/**
 * Subscribes to realtime Postgres changes on `enrollments` and `distribution_jobs`
 * for a specific program so the card's progress updates in real time.
 */
export function subscribeToProgramProgress(
  programId: string,
  onUpdate: () => void
): () => void {
  const channelName = `program-progress-${programId}-${Date.now()}`;
  const channel = supabase
    .channel(channelName)
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'enrollments',
        filter: `program_id=eq.${programId}`,
      },
      () => {
        onUpdate();
      }
    )
    .on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'distribution_jobs',
        filter: `program_id=eq.${programId}`,
      },
      () => {
        onUpdate();
      }
    )
    .subscribe();

  return () => {
    void supabase.removeChannel(channel);
  };
}
