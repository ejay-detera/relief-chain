import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import React, { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { FadeInView } from '@/components/shared/FadeInView';
import {
  type StatusDropdownOption,
  StatusFilterDropdown,
} from '@/components/shared/StatusFilterDropdown';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantProgramApplicant } from '@/types/merchant-management';
import { MerchantSearchBar } from './MerchantSearchBar';

export type ApplicationFilterStatus = 'All' | 'Pending' | 'Approved' | 'Rejected';

const APPLICATION_STATUS_OPTIONS: StatusDropdownOption<ApplicationFilterStatus>[] = [
  {
    label: 'All Statuses',
    value: 'All',
    subtitle: 'Show all program applications',
  },
  {
    label: 'Pending',
    value: 'Pending',
    subtitle: 'Awaiting approval decision',
  },
  {
    label: 'Approved',
    value: 'Approved',
    subtitle: 'Accepted to relief program',
  },
  {
    label: 'Rejected',
    value: 'Rejected',
    subtitle: 'Application declined',
  },
];

type Props = {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  selectedStatus: ApplicationFilterStatus;
  onStatusChange: (status: ApplicationFilterStatus) => void;
  data: MerchantProgramApplicant[];
  loading: boolean;
  refreshing: boolean;
  onRefresh: () => void;
  onApprove: (applicant: MerchantProgramApplicant) => Promise<void>;
  onReject: (applicant: MerchantProgramApplicant, reason: string) => Promise<void>;
};

const statusStyleFor = (status: MerchantProgramApplicant['status']) => {
  switch (status) {
    case 'approved':
      return { bg: '#E8F5E9', text: BrandColors.green, icon: 'check-circle' as const, label: 'Approved' };
    case 'rejected':
      return { bg: '#FFEBEE', text: '#D32F2F', icon: 'times-circle' as const, label: 'Declined' };
    case 'withdrawn':
      return { bg: '#F3F4F6', text: BrandColors.grey, icon: 'minus-circle' as const, label: 'Withdrawn' };
    default:
      return { bg: '#FFF8E1', text: BrandColors.yellow, icon: 'clock-o' as const, label: 'Pending Review' };
  }
};

const formatAppliedDate = (dateStr: string) => {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

export const MerchantApplicationsView = ({
  searchQuery,
  onSearchChange,
  selectedStatus,
  onStatusChange,
  data,
  loading,
  refreshing,
  onRefresh,
  onApprove,
  onReject,
}: Props) => {
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReasons, setRejectionReasons] = useState<Record<string, string>>({});

  const handleApprovePress = async (applicant: MerchantProgramApplicant) => {
    setUpdatingId(applicant.application_id);
    try {
      await onApprove(applicant);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleConfirmRejectPress = async (applicant: MerchantProgramApplicant) => {
    const reason = rejectionReasons[applicant.application_id]?.trim() || '';
    if (!reason) return;
    setUpdatingId(applicant.application_id);
    try {
      await onReject(applicant, reason);
      setRejectingId(null);
    } finally {
      setUpdatingId(null);
    }
  };

  const renderItem = ({ item }: { item: MerchantProgramApplicant }) => {
    const style = statusStyleFor(item.status);
    const isPending = item.status === 'pending';
    const isRejecting = rejectingId === item.application_id;
    const isUpdating = updatingId === item.application_id;

    return (
      <View style={styles.card}>
        {/* Top Header */}
        <View style={styles.cardHeader}>
          <View style={styles.storeInfo}>
            <Text style={styles.storeName}>{item.display_name}</Text>
            {item.owner_name ? (
              <Text style={styles.ownerText}>Owner: {item.owner_name}</Text>
            ) : null}
            {item.mobile_number ? (
              <Text style={styles.contactText}>Phone: {item.mobile_number}</Text>
            ) : null}
          </View>

          <View style={[styles.statusBadge, { backgroundColor: style.bg }]}>
            <FontAwesome name={style.icon} size={11} color={style.text} />
            <Text style={[styles.statusBadgeText, { color: style.text }]}>
              {style.label}
            </Text>
          </View>
        </View>

        {/* Program target badge */}
        <View style={styles.programBadgeRow}>
          <View style={styles.programBadge}>
            <FontAwesome name="handshake-o" size={11} color={BrandColors.navy} />
            <Text style={styles.programBadgeText}>
              Program: <Text style={styles.programNameHighlight}>{item.program_name || 'Aid Program'}</Text>
            </Text>
          </View>
          <Text style={styles.dateText}>Applied {formatAppliedDate(item.applied_at)}</Text>
        </View>

        {/* Notes from merchant */}
        {item.notes ? (
          <View style={styles.notesBox}>
            <Text style={styles.notesLabel}>Merchant Note:</Text>
            <Text style={styles.notesText}>{item.notes}</Text>
          </View>
        ) : null}

        {/* Rejection reason if declined */}
        {item.rejection_reason ? (
          <View style={styles.rejectionBox}>
            <Text style={styles.rejectionLabel}>Decline Reason:</Text>
            <Text style={styles.rejectionText}>{item.rejection_reason}</Text>
          </View>
        ) : null}

        {/* Action Controls for Pending Application */}
        {isPending && (
          <View style={styles.actionsContainer}>
            {isRejecting ? (
              <View style={styles.rejectInputContainer}>
                <TextInput
                  style={styles.reasonInput}
                  placeholder="State reason for declining application..."
                  placeholderTextColor={BrandColors.grey}
                  value={rejectionReasons[item.application_id] || ''}
                  onChangeText={(text) =>
                    setRejectionReasons((prev) => ({
                      ...prev,
                      [item.application_id]: text,
                    }))
                  }
                  multiline
                />
                <View style={styles.rejectBtnRow}>
                  <TouchableOpacity
                    style={styles.cancelRejectBtn}
                    onPress={() => setRejectingId(null)}
                    disabled={isUpdating}
                  >
                    <Text style={styles.cancelRejectText}>Cancel</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.confirmRejectBtn,
                      !rejectionReasons[item.application_id]?.trim() && styles.disabledBtn,
                    ]}
                    onPress={() => void handleConfirmRejectPress(item)}
                    disabled={isUpdating || !rejectionReasons[item.application_id]?.trim()}
                  >
                    {isUpdating ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.confirmRejectText}>Confirm Decline</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <View style={styles.actionButtonGroup}>
                <TouchableOpacity
                  style={styles.declineBtn}
                  onPress={() => setRejectingId(item.application_id)}
                  disabled={isUpdating}
                >
                  <Text style={styles.declineBtnText}>Decline</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.approveBtn}
                  onPress={() => void handleApprovePress(item)}
                  disabled={isUpdating}
                >
                  {isUpdating ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <FontAwesome name="check" size={12} color="#FFFFFF" />
                      <Text style={styles.approveBtnText}>Accept Merchant</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            )}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* Search Bar */}
      <FadeInView delay={20}>
        <MerchantSearchBar
          value={searchQuery}
          onChangeText={onSearchChange}
          placeholder="Search merchant, owner, program name..."
        />
      </FadeInView>

      {/* Status Filter Dropdown */}
      <FadeInView delay={40}>
        <StatusFilterDropdown<ApplicationFilterStatus>
          selected={selectedStatus}
          onSelect={onStatusChange}
          options={APPLICATION_STATUS_OPTIONS}
          title="Filter Applications by Status"
        />
      </FadeInView>

      {/* Applications List */}
      {loading ? (
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={BrandColors.green} />
          <Text style={styles.loadingText}>Loading merchant applications...</Text>
        </View>
      ) : (
        <FlatList
          data={data}
          keyExtractor={(item) => item.application_id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BrandColors.green}
            />
          }
          ListEmptyComponent={
            <View style={styles.emptyContainer}>
              <MaterialCommunityIcons
                name="store-search-outline"
                size={48}
                color={BrandColors.grey}
              />
              <Text style={styles.emptyTitle}>No Merchant Applications Found</Text>
              <Text style={styles.emptyDesc}>
                {searchQuery || selectedStatus !== 'All'
                  ? 'No applications match your search or filter criteria.'
                  : 'Merchants can discover your aid programs and apply to accept relief vouchers. When they apply, their applications will show up here.'}
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  listContent: {
    padding: Spacing.four,
    gap: Spacing.three,
    paddingBottom: 100,
  },
  centerBox: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.two,
    paddingTop: Spacing.five,
  },
  loadingText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.five * 2,
    paddingHorizontal: Spacing.four,
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    marginTop: Spacing.three,
  },
  emptyTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    marginTop: Spacing.three,
  },
  emptyDesc: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
    marginTop: Spacing.one,
    maxWidth: 280,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    padding: Spacing.four,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  storeInfo: {
    flex: 1,
  },
  storeName: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  ownerText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  contactText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 1,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 4,
  },
  statusBadgeText: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 10,
  },
  programBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: Spacing.two,
  },
  programBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: BorderRadius.sm,
    gap: 5,
  },
  programBadgeText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
  },
  programNameHighlight: {
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  dateText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 10,
  },
  notesBox: {
    backgroundColor: '#F9FAFB',
    borderColor: '#E5E7EB',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.two,
    padding: Spacing.two,
  },
  notesLabel: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
  notesText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  rejectionBox: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderRadius: BorderRadius.sm,
    borderWidth: 1,
    marginTop: Spacing.two,
    padding: Spacing.two,
  },
  rejectionLabel: {
    color: '#991B1B',
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 10,
  },
  rejectionText: {
    color: '#B91C1C',
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 2,
  },
  actionsContainer: {
    marginTop: Spacing.three,
    paddingTop: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: '#F3F4F6',
  },
  actionButtonGroup: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  declineBtn: {
    backgroundColor: '#FEE2E2',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  declineBtnText: {
    color: '#DC2626',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  approveBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.four,
    paddingVertical: 8,
    gap: 6,
    justifyContent: 'center',
  },
  approveBtnText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
  rejectInputContainer: {
    gap: Spacing.two,
  },
  reasonInput: {
    backgroundColor: '#FFFFFF',
    borderColor: '#D1D5DB',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    minHeight: 52,
    padding: Spacing.two,
    textAlignVertical: 'top',
  },
  rejectBtnRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  cancelRejectBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    justifyContent: 'center',
  },
  cancelRejectText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 12,
  },
  confirmRejectBtn: {
    backgroundColor: '#DC2626',
    borderRadius: BorderRadius.md,
    paddingHorizontal: Spacing.three,
    paddingVertical: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
  disabledBtn: {
    opacity: 0.5,
  },
  confirmRejectText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 12,
  },
});
