import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ReconciliationBadge } from '@/components/shared/reconciliation-badge';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { pilotWalletPublicKey, usePilotWallet } from '@/hooks/use-pilot-wallet';
import { parseStroopAmount } from '@/types/blockchain';
import type { BeneficiaryProgramEntitlement, ProjectionState } from '@/types/projection';
import { EnrolledProgram } from '@/types/wallet';
import { formatStroops } from '@/utils/format-stroops';
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

export function ProgramVoucherCard({ program, entitlement, balanceState }: Props) {
  const router = useRouter();
  const { state: walletState } = usePilotWallet();
  const walletAddress = pilotWalletPublicKey(walletState) ?? undefined;
  const [isVoucherQrVisible, setIsVoucherQrVisible] = useState(false);

  const isApproved = program.approvalStatus === 'Approved';
  const isRejected = program.approvalStatus === 'Rejected';
  const balanceLabel = entitlement
    ? `${formatStroops(entitlement.availableStroops)} ${PILOT_ASSET_CODE}`
    : balancePlaceholder(balanceState.status);

  const goToStatus = () => {
    router.push({
      pathname: '/(beneficiary)/application-status',
      params: program.enrollmentId ? { enrollmentId: program.enrollmentId } : undefined,
    });
  };

  return (
    <View style={styles.card}>
      <View style={styles.headerRow}>
        <Pressable onPress={goToStatus} style={styles.statusPressable}>
          <View
            style={[
              styles.statusBadge,
              isApproved && styles.statusApproved,
              isRejected && styles.statusRejected,
              !isApproved && !isRejected && styles.statusPending,
            ]}
          >
            <ThemedText
              style={[
                styles.statusText,
                isApproved && styles.statusTextApproved,
                isRejected && styles.statusTextRejected,
                !isApproved && !isRejected && styles.statusTextPending,
              ]}
            >
              {program.approvalStatus}
            </ThemedText>
          </View>
          <ThemedText style={styles.viewTimelineText}>View Timeline ›</ThemedText>
        </Pressable>

        <Pressable
          accessibilityLabel="Program options"
          onPress={goToStatus}
          style={styles.kebabButton}
        >
          <FontAwesome name="ellipsis-v" size={16} color={BrandColors.grey} />
        </Pressable>
      </View>

      <ThemedText style={styles.name} numberOfLines={1}>{program.name}</ThemedText>

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

      {/* Approved allocation amount — visible immediately on approval,
          independent of whether reconciliation has produced a balance
          projection row yet (US3: "amount... visible immediately after
          Organization approval"). Previously only the reconciled balance
          below was shown, which could read "No reconciled balance" for a
          window after approval even though the approved amount was already
          on file. */}
      {isApproved && program.allocatedAmountStroops != null && (
        <View style={styles.allocatedRow}>
          <ThemedText style={styles.allocatedLabel}>Approved Amount</ThemedText>
          <ThemedText style={styles.allocatedValue}>
            {formatStroops(parseStroopAmount(program.allocatedAmountStroops))} {PILOT_ASSET_CODE}
          </ThemedText>
        </View>
      )}

      <View style={styles.bodyRow}>
        <View style={styles.balanceColumn}>
          <ThemedText style={styles.balanceLabel}>Reconciled Balance</ThemedText>
          <ThemedText style={styles.balanceValue}>{balanceLabel}</ThemedText>
          <ReconciliationBadge
            state={balanceState}
            transactionHash={entitlement?.latestTransactionHash}
          />
          <View style={styles.expiryRow}>
            <FontAwesome name="calendar" size={11} color={BrandColors.grey} />
            <ThemedText style={styles.expiryText}>Expires: {program.expiresAt}</ThemedText>
          </View>
        </View>
        <View style={styles.purposeColumn}>
          <ThemedText style={styles.purposeLabel}>Aid Type / Purpose</ThemedText>
          <ThemedText style={styles.purposeValue}>
            {program.category ? `${program.category} • ` : ''}
            {program.purpose}
          </ThemedText>
        </View>
      </View>

      {/* Merchant Categories & Redemption Instructions (US3). Only real,
          DB-accredited `program_merchants` rows are ever shown here — an
          empty list means "no accredited merchants listed yet" and says so
          plainly, rather than fabricating participant names. */}
      <View style={styles.merchantsSection}>
        <ThemedText style={styles.merchantsLabel}>Accepted at:</ThemedText>
        {program.acceptedMerchantCategories && program.acceptedMerchantCategories.length > 0 ? (
          <>
            <View style={styles.categoriesWrap}>
              {program.acceptedMerchantCategories.map((cat, idx) => (
                <View key={idx} style={styles.categoryChip}>
                  <FontAwesome name="shopping-bag" size={10} color={BrandColors.navy} />
                  <ThemedText style={styles.categoryChipText}>{cat}</ThemedText>
                </View>
              ))}
            </View>
            {program.redemptionInstructions && (
              <ThemedText style={styles.instructionsText}>
                {program.redemptionInstructions}
              </ThemedText>
            )}
          </>
        ) : (
          <ThemedText style={styles.noMerchantsText}>
            No accredited merchants listed yet for this program. Check back soon.
          </ThemedText>
        )}
      </View>

      {isApproved ? (
        <Pressable
          accessibilityLabel="Show Voucher QR"
          accessibilityRole="button"
          onPress={() => setIsVoucherQrVisible(true)}
          style={styles.redeemButton}
        >
          <FontAwesome name="qrcode" size={16} color="white" />
          <ThemedText style={styles.redeemButtonText}>Show Voucher QR</ThemedText>
        </Pressable>
      ) : (
        <Pressable onPress={goToStatus} style={styles.statusDetailButton}>
          <ThemedText style={styles.statusDetailButtonText}>Check Status Details</ThemedText>
        </Pressable>
      )}

      {isApproved && (
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
  statusPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  statusApproved: {
    backgroundColor: '#E8F5E9',
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
  kebabButton: {
    padding: Spacing.one,
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
  balanceLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  balanceValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  expiryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
  },
  expiryText: {
    fontSize: 11,
    color: BrandColors.grey,
  },
  purposeColumn: {
    alignItems: 'flex-end',
    flex: 0.8,
  },
  purposeLabel: {
    fontSize: 11,
    color: BrandColors.grey,
    marginBottom: 2,
  },
  purposeValue: {
    fontSize: 12,
    fontWeight: '600',
    color: BrandColors.navy,
    textAlign: 'right',
  },
  merchantsSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: BorderRadius.md,
    padding: Spacing.two,
    marginBottom: Spacing.three,
  },
  merchantsLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: BrandColors.grey,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  categoriesWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 4,
    backgroundColor: 'white',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipText: {
    fontSize: 11,
    color: BrandColors.navy,
    fontWeight: '500',
  },
  instructionsText: {
    fontSize: 11,
    color: '#718096',
    marginTop: 2,
    fontStyle: 'italic',
  },
  noMerchantsText: {
    fontSize: 11,
    color: '#718096',
    fontStyle: 'italic',
  },
  allocatedRow: {
    backgroundColor: '#F0FDF4',
    borderRadius: BorderRadius.md,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  allocatedLabel: {
    fontSize: 12,
    color: '#166534',
    fontWeight: '600',
  },
  allocatedValue: {
    fontSize: 14,
    color: '#166534',
    fontWeight: '700',
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
  redeemButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
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
