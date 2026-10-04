import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { pilotWalletPublicKey, usePilotWallet } from '@/hooks/use-pilot-wallet';
import { parseStroopAmount, type StroopAmount } from '@/types/blockchain';
import type { BeneficiaryProgramEntitlement, ProjectionState } from '@/types/projection';
import { EnrolledProgram } from '@/types/wallet';
import { formatStroops, ZERO_STROOPS } from '@/utils/format-stroops';
import { VoucherQrModal } from './voucher-qr-modal';

type Props = {
  program: EnrolledProgram;
  /** Reconciled entitlement for this program, or null if none is reconciled yet. */
  entitlement: BeneficiaryProgramEntitlement | null;
  /** The parent projection state, used to explain why a balance is not shown. */
  balanceState: ProjectionState<BeneficiaryProgramEntitlement[]>;
};

const balancePlaceholder = (status: ProjectionState<unknown>['status']): string => {
  switch (status) {
    case 'loading':
      return 'Loading…';
    case 'unavailable':
      return 'Unavailable';
    case 'quarantined':
      return 'Under review';
    default:
      return 'No reconciled balance';
  }
};

const getStroopAmountSafe = (value: unknown): StroopAmount => {
  if (value == null) return ZERO_STROOPS;
  try {
    return parseStroopAmount(value);
  } catch {
    return ZERO_STROOPS;
  }
};

export function ProgramVoucherCard({ program, entitlement, balanceState }: Props) {
  const router = useRouter();
  const { state: walletState } = usePilotWallet();
  const walletAddress = pilotWalletPublicKey(walletState) ?? undefined;
  const [isVoucherQrVisible, setIsVoucherQrVisible] = useState(false);

  const isApproved = program.approvalStatus === 'Approved';
  const isRejected = program.approvalStatus === 'Rejected';

  // Compute current spendable balance: prioritize reconciled projection row;
  // fall back to live voucher balance, or DB approved allocation if reconciliation hasn't indexed yet.
  const currentStroops: StroopAmount = useMemo(() => {
    if (entitlement) {
      return entitlement.availableStroops;
    }
    if (isApproved) {
      if (program.remainingVoucherStroops != null) {
        return getStroopAmountSafe(program.remainingVoucherStroops);
      }
      if (program.allocatedAmountStroops != null) {
        return getStroopAmountSafe(program.allocatedAmountStroops);
      }
    }
    return ZERO_STROOPS;
  }, [entitlement, isApproved, program.remainingVoucherStroops, program.allocatedAmountStroops]);

  const allocatedStroops: StroopAmount | null = useMemo(() => {
    if (entitlement?.allocatedStroops) {
      return entitlement.allocatedStroops;
    }
    if (program.allocatedAmountStroops != null) {
      return getStroopAmountSafe(program.allocatedAmountStroops);
    }
    return null;
  }, [entitlement, program.allocatedAmountStroops]);

  const hasBalance = isApproved && BigInt(currentStroops) > 0n;

  const currentBalanceText = `₱${formatStroops(currentStroops)} ${PILOT_ASSET_CODE}`;
  const statusBalanceText = balancePlaceholder(balanceState.status);

  const goToStatus = () => {
    router.push({
      pathname: '/(beneficiary)/application-status',
      params: program.enrollmentId ? { enrollmentId: program.enrollmentId } : undefined,
    });
  };

  const isCompleted =
    program.isCompleted ||
    program.currentStage === 'completed' ||
    (isApproved && program.voucherBalance != null && program.voucherBalance <= 0);
  const isRedeemed = program.isRedeemed || program.currentStage === 'redeemed';
  const stageLabel = isRejected
    ? 'Rejected'
    : !isApproved
    ? 'Pending'
    : isCompleted
    ? 'Completed'
    : isRedeemed
    ? 'Redeemed'
    : program.currentStageLabel ?? 'Aid Released';

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <View
          style={[
            styles.statusBadge,
            isCompleted && styles.statusCompleted,
            isRedeemed && !isCompleted && styles.statusRedeemed,
            isApproved && !isCompleted && !isRedeemed && styles.statusAidReleased,
            isRejected && styles.statusRejected,
            !isApproved && !isRejected && styles.statusPending,
          ]}
        >
          <ThemedText
            style={[
              styles.statusText,
              isCompleted && styles.statusTextCompleted,
              isRedeemed && !isCompleted && styles.statusTextRedeemed,
              isApproved && !isCompleted && !isRedeemed && styles.statusTextAidReleased,
              isRejected && styles.statusTextRejected,
              !isApproved && !isRejected && styles.statusTextPending,
            ]}
          >
            {stageLabel}
          </ThemedText>
        </View>

        <Pressable
          accessibilityLabel="View application timeline"
          accessibilityRole="button"
          onPress={goToStatus}
          hitSlop={8}
        >
          <ThemedText style={styles.viewTimelineText}>View Timeline ›</ThemedText>
        </Pressable>
      </View>

      <Pressable
        onPress={goToStatus}
        accessibilityRole="button"
        accessibilityLabel={`View timeline for ${program.name}`}
      >
        <ThemedText style={styles.name} numberOfLines={1}>{program.name}</ThemedText>
      </Pressable>

      {/* If rejected, show reason and appeal prompt */}
      {isRejected && (
        <View style={styles.rejectionNotice}>
          <ThemedText style={styles.rejectionNoticeText}>
            {program.rejectionRemarks ? `Reason: ${program.rejectionRemarks}` : 'Application was declined.'}
          </ThemedText>
          <Pressable
            style={styles.appealLink}
            onPress={() =>
              router.push({
                pathname: '/(beneficiary)/submit-appeal',
                params: {
                  enrollmentId: program.enrollmentId ?? '',
                  programName: program.name,
                  programId: program.id,
                },
              })
            }
          >
            <ThemedText style={styles.appealLinkText}>File an Appeal ›</ThemedText>
          </Pressable>
        </View>
      )}

      <View style={styles.bodyRow}>
        <View style={styles.balanceColumn}>
          <View style={styles.balanceHeaderRow}>
            <ThemedText style={styles.balanceLabel}>
              {isApproved ? 'Available Balance' : 'Program Balance'}
            </ThemedText>
          </View>

          <ThemedText
            style={[
              styles.balanceValue,
              isApproved && !hasBalance && styles.balanceValueDepleted,
            ]}
          >
            {isApproved ? currentBalanceText : statusBalanceText}
          </ThemedText>

          {isApproved && allocatedStroops != null && allocatedStroops !== currentStroops && (
            <ThemedText style={styles.allocatedSubText}>
              Initial Grant: ₱{formatStroops(allocatedStroops)} {PILOT_ASSET_CODE}
            </ThemedText>
          )}

          <View style={styles.expiryRow}>
            <FontAwesome name="calendar" size={11} color={BrandColors.grey} />
            <ThemedText style={styles.expiryText}>Expires: {program.expiresAt}</ThemedText>
          </View>
        </View>
      </View>


      {isApproved ? (
        <Pressable
          accessibilityLabel={
            isCompleted
              ? 'Voucher Completed / Lifecycle Finished'
              : hasBalance
              ? 'Show Voucher QR'
              : 'Voucher Depleted / No Balance'
          }
          accessibilityRole="button"
          accessibilityState={{ disabled: !hasBalance || isCompleted }}
          disabled={!hasBalance || isCompleted}
          onPress={() => setIsVoucherQrVisible(true)}
          style={[
            styles.redeemButton,
            (!hasBalance || isCompleted) && styles.redeemButtonDisabled,
          ]}
        >
          <FontAwesome
            name={isCompleted ? 'check-circle' : hasBalance ? 'qrcode' : 'ban'}
            size={16}
            color={!isCompleted && hasBalance ? 'white' : '#94A3B8'}
          />
          <ThemedText
            style={[
              styles.redeemButtonText,
              (!hasBalance || isCompleted) && styles.redeemButtonTextDisabled,
            ]}
          >
            {isCompleted
              ? 'Voucher Completed'
              : hasBalance
              ? 'Show Voucher QR'
              : 'No Balance Available'}
          </ThemedText>
        </Pressable>
      ) : (
        <Pressable onPress={goToStatus} style={styles.statusDetailButton}>
          <ThemedText style={styles.statusDetailButtonText}>Check Status Details</ThemedText>
        </Pressable>
      )}

      {isApproved && hasBalance && (
        <VoucherQrModal
          beneficiaryWallet={walletAddress}
          entitlement={entitlement}
          onClose={() => setIsVoucherQrVisible(false)}
          program={program}
          visible={isVoucherQrVisible}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginHorizontal: Spacing.four,
    marginBottom: Spacing.three,
    boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.two,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusApproved: {
    backgroundColor: '#E8F5E9',
  },
  statusCompleted: {
    backgroundColor: '#E8F5E9',
  },
  statusRedeemed: {
    backgroundColor: '#FFF3E0',
  },
  statusAidReleased: {
    backgroundColor: '#E0F2FE',
  },
  statusPending: {
    backgroundColor: '#FFF8E1',
  },
  statusRejected: {
    backgroundColor: '#FDE8E8',
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  statusTextApproved: {
    color: BrandColors.green,
  },
  statusTextCompleted: {
    color: BrandColors.green,
  },
  statusTextRedeemed: {
    color: '#D97706',
  },
  statusTextAidReleased: {
    color: '#0284C7',
  },
  statusTextPending: {
    color: '#B8860B',
  },
  statusTextRejected: {
    color: '#D9383A',
  },
  viewTimelineText: {
    fontSize: 11,
    color: BrandColors.navy,
    fontWeight: '600',
  },
  name: {
    fontSize: 15,
    fontWeight: '700',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  rejectionNotice: {
    backgroundColor: '#FFF5F5',
    borderLeftWidth: 3,
    borderLeftColor: '#D9383A',
    padding: Spacing.two,
    borderRadius: 4,
    marginBottom: Spacing.three,
  },
  rejectionNoticeText: {
    fontSize: 12,
    color: '#C53030',
    marginBottom: 4,
  },
  appealLink: {
    alignSelf: 'flex-start',
  },
  appealLinkText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#9B2C2C',
  },
  bodyRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.three,
  },
  balanceColumn: {
    flex: 1,
  },
  balanceHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
    marginBottom: 2,
  },
  balanceLabel: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: 2,
  },
  balanceValueDepleted: {
    color: '#94A3B8',
  },
  allocatedSubText: {
    fontSize: 11,
    color: BrandColors.grey,
    fontWeight: '500',
    marginBottom: 4,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    marginTop: 2,
  },
  expiryText: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  redeemButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    columnGap: 8,
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingVertical: 12,
  },
  redeemButtonDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  redeemButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
  redeemButtonTextDisabled: {
    color: '#94A3B8',
  },
  statusDetailButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EDF2F7',
    borderRadius: BorderRadius.md,
    paddingVertical: 10,
  },
  statusDetailButtonText: {
    color: BrandColors.navy,
    fontSize: 13,
    fontWeight: '600',
  },
});
