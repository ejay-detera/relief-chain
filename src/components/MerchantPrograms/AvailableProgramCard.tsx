import { MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { AvailableAidProgram } from '@/types/merchant-program';

type Props = {
  program: AvailableAidProgram;
  onApply: (program: AvailableAidProgram) => void;
  onWithdraw?: (program: AvailableAidProgram) => void;
};

const formatDate = (value: string | null): string => {
  if (!value) return 'TBD';
  const parsed = new Date(value);
  if (isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-PH', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
};

const formatValue = (value: number) =>
  `₱${value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const AvailableProgramCard = ({ program, onApply, onWithdraw }: Props) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isDraft = program.status.toLowerCase() === 'draft';
  const voucherTypes = program.voucherTypes.length > 0 ? program.voucherTypes.join(', ') : 'All categories';

  return (
    <View style={styles.card}>
      {/* Header status tags */}
      <View style={styles.headerRow}>
        <View style={styles.tagsContainer}>
          <View style={[styles.programStatusTag, isDraft ? styles.draftTag : styles.activeTag]}>
            <Text style={isDraft ? styles.draftText : styles.activeText}>
              {isDraft ? 'DRAFT' : 'ACTIVE PROGRAM'}
            </Text>
          </View>
        </View>
      </View>

      <ThemedText style={styles.title}>{program.name}</ThemedText>
      <ThemedText style={styles.purpose}>{program.purpose}</ThemedText>

      {/* Program Quick Specs */}
      <View style={styles.specRow}>
        <View style={styles.specItem}>
          <ThemedText style={styles.specLabel}>Voucher Value</ThemedText>
          <ThemedText style={styles.specValue}>{formatValue(program.voucherValue)}</ThemedText>
        </View>
        <View style={styles.specItem}>
          <ThemedText style={styles.specLabel}>Voucher Types</ThemedText>
          <ThemedText style={styles.specValue} numberOfLines={1}>
            {voucherTypes}
          </ThemedText>
        </View>
        <View style={styles.specItem}>
          <ThemedText style={styles.specLabel}>Valid Through</ThemedText>
          <ThemedText style={styles.specValue}>{formatDate(program.voucherExpiration || program.endDate)}</ThemedText>
        </View>
      </View>

      {/* Expandable Details */}
      {isExpanded && (
        <View style={styles.expandedDetails}>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Distribution Period</ThemedText>
            <ThemedText style={styles.detailValue}>
              {formatDate(program.distributionStart)} – {formatDate(program.distributionEnd)}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Program Timeline</ThemedText>
            <ThemedText style={styles.detailValue}>
              {formatDate(program.startDate)} – {formatDate(program.endDate)}
            </ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Vouchers per Beneficiary</ThemedText>
            <ThemedText style={styles.detailValue}>{program.voucherQuantity}</ThemedText>
          </View>
          <View style={styles.detailRow}>
            <ThemedText style={styles.detailLabel}>Method</ThemedText>
            <ThemedText style={styles.detailValue}>{program.distributionMethod}</ThemedText>
          </View>
        </View>
      )}

      {/* Toggle Expansion */}
      <Pressable
        onPress={() => setIsExpanded((prev) => !prev)}
        style={styles.expandToggle}
        accessibilityRole="button"
      >
        <ThemedText style={styles.expandText}>{isExpanded ? 'Show less' : 'View program details'}</ThemedText>
        <MaterialCommunityIcons
          name={isExpanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={BrandColors.navy}
        />
      </Pressable>

      {/* Application Status / Action Footer */}
      <View style={styles.actionFooter}>
        {program.applicationStatus === 'none' && (
          <TouchableOpacity
            style={styles.applyBtn}
            onPress={() => onApply(program)}
            accessibilityRole="button"
          >
            <MaterialCommunityIcons name="send-check" size={16} color="#FFFFFF" />
            <Text style={styles.applyBtnText}>Apply to Accept Vouchers</Text>
          </TouchableOpacity>
        )}

        {program.applicationStatus === 'pending' && (
          <View style={styles.statusBoxPending}>
            <View style={styles.statusBoxHeader}>
              <MaterialCommunityIcons name="clock-outline" size={16} color="#D97706" />
              <Text style={styles.pendingStatusText}>Application Under Review</Text>
            </View>
            <Text style={styles.statusNote}>
              Submitted on {formatDate(program.appliedAt)}. Awaiting administrator approval.
            </Text>
            {onWithdraw && (
              <TouchableOpacity
                onPress={() => onWithdraw(program)}
                style={styles.withdrawLink}
                accessibilityRole="button"
              >
                <Text style={styles.withdrawLinkText}>Withdraw Application</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {program.applicationStatus === 'approved' && (
          <View style={styles.statusBoxApproved}>
            <MaterialCommunityIcons name="check-circle" size={18} color={BrandColors.green} />
            <View style={styles.statusTextContainer}>
              <Text style={styles.approvedStatusText}>Application Approved & Accredited</Text>
              <Text style={styles.statusNote}>
                Your store is authorized to accept and redeem vouchers for this program.
              </Text>
            </View>
          </View>
        )}

        {program.applicationStatus === 'rejected' && (
          <View style={styles.statusBoxRejected}>
            <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#DC2626" />
            <View style={styles.statusTextContainer}>
              <Text style={styles.rejectedStatusText}>Application Declined</Text>
              {program.rejectionReason && (
                <Text style={styles.rejectionReasonText}>
                  Reason: {program.rejectionReason}
                </Text>
              )}
              <TouchableOpacity
                style={styles.reapplyBtn}
                onPress={() => onApply(program)}
                accessibilityRole="button"
              >
                <Text style={styles.reapplyBtnText}>Re-apply</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {program.applicationStatus === 'withdrawn' && (
          <View style={styles.statusBoxWithdrawn}>
            <View style={styles.statusBoxHeader}>
              <MaterialCommunityIcons name="undo-variant" size={16} color="#4B5563" />
              <Text style={styles.withdrawnStatusText}>Application Withdrawn</Text>
            </View>
            <Text style={styles.statusNoteWithdrawn}>
              You previously withdrew your application for this aid program. You can apply again anytime before distribution begins.
            </Text>
            <TouchableOpacity
              style={styles.reapplyBtnWithdrawn}
              onPress={() => onApply(program)}
              accessibilityRole="button"
            >
              <MaterialCommunityIcons name="send-check" size={14} color="#FFFFFF" />
              <Text style={styles.reapplyBtnWithdrawnText}>Apply Again</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.md,
    elevation: 3,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  headerRow: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
  },
  tagsContainer: {
    flexDirection: 'row',
    gap: Spacing.one,
  },
  programStatusTag: {
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.two,
    paddingVertical: 3,
  },
  draftTag: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#F59E0B',
  },
  draftText: {
    color: '#92400E',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
  },
  activeTag: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: BrandColors.green,
  },
  activeText: {
    color: '#15803D',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
  },
  title: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  purpose: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    lineHeight: 16,
    marginTop: Spacing.one,
  },
  specRow: {
    borderTopColor: '#F3F4F6',
    borderTopWidth: 1,
    flexDirection: 'row',
    gap: Spacing.two,
    marginTop: Spacing.three,
    paddingTop: Spacing.two,
  },
  specItem: {
    flex: 1,
  },
  specLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 9,
  },
  specValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
    marginTop: 2,
  },
  expandedDetails: {
    backgroundColor: '#F9FAFB',
    borderRadius: BorderRadius.sm,
    gap: Spacing.one,
    marginTop: Spacing.two,
    padding: Spacing.two,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  detailLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 9,
  },
  detailValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 9,
  },
  expandToggle: {
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: Spacing.two,
    gap: 2,
  },
  expandText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
  actionFooter: {
    borderTopColor: '#F3F4F6',
    borderTopWidth: 1,
    marginTop: Spacing.two,
    paddingTop: Spacing.two,
  },
  applyBtn: {
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    justifyContent: 'center',
    paddingVertical: 10,
    gap: Spacing.two,
  },
  applyBtnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  statusBoxPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FCD34D',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.two,
  },
  statusBoxHeader: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: Spacing.one,
  },
  pendingStatusText: {
    color: '#B45309',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  statusNote: {
    color: '#78350F',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 2,
  },
  withdrawLink: {
    alignSelf: 'flex-start',
    marginTop: 6,
  },
  withdrawLinkText: {
    color: '#B45309',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
    textDecorationLine: 'underline',
  },
  statusBoxApproved: {
    backgroundColor: '#F0FDF4',
    borderColor: '#86EFAC',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    padding: Spacing.two,
    gap: Spacing.two,
    alignItems: 'center',
  },
  statusTextContainer: {
    flex: 1,
  },
  approvedStatusText: {
    color: '#15803D',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  statusBoxRejected: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    flexDirection: 'row',
    padding: Spacing.two,
    gap: Spacing.two,
  },
  rejectedStatusText: {
    color: '#B91C1C',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  rejectionReasonText: {
    color: '#7F1D1D',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 2,
  },
  reapplyBtn: {
    alignSelf: 'flex-start',
    backgroundColor: '#DC2626',
    borderRadius: BorderRadius.sm,
    marginTop: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 4,
  },
  reapplyBtnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  statusBoxWithdrawn: {
    backgroundColor: '#F9FAFB',
    borderColor: '#D1D5DB',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    padding: Spacing.two,
  },
  withdrawnStatusText: {
    color: '#374151',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 11,
  },
  statusNoteWithdrawn: {
    color: '#6B7280',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
    marginTop: 2,
    lineHeight: 14,
  },
  reapplyBtnWithdrawn: {
    alignSelf: 'flex-start',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 6,
    paddingHorizontal: Spacing.two,
    paddingVertical: 5,
  },
  reapplyBtnWithdrawnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
});
