import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View, ScrollView, Alert, ActivityIndicator } from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useCreateProgram } from '../create-program/_layout';
import { deleteLguProgram, updateProgramStatus } from '@/services/programService';
import { resolveProgramStatus } from '@/components/LguPrograms/ProgramCard';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';
import { FontAwesome } from '@expo/vector-icons';

export default function ProgramDetailsScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { programsList, fetchProgramsList, startEditingProgram } = useCreateProgram();
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    if (programsList.length === 0) {
      setLoading(true);
      fetchProgramsList().finally(() => setLoading(false));
    }
  }, []);

  const program = programsList.find((p) => p.id === id);

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={BrandColors.green} />
        <Text style={styles.loadingText}>Loading program details...</Text>
      </View>
    );
  }

  if (!program) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorIcon}>⚠️</Text>
        <Text style={styles.errorTitle}>Program Not Found</Text>
        <Text style={styles.errorSubtitle}>The requested program details could not be loaded.</Text>
        <TouchableOpacity style={styles.backLink} onPress={() => router.back()}>
          <Text style={styles.backLinkText}>Return to Programs</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const calculatedStatus = resolveProgramStatus(program.status, program.startDate);
  const isCompleted = calculatedStatus === 'completed';

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2,
    }).format(val);
  };

  const formatHumanDate = (dateStr: string) => {
    if (!dateStr) return 'N/A';
    const date = new Date(dateStr);
    if (isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleEdit = () => {
    startEditingProgram(program);
    router.push('/(lgu)/create-program' as any);
  };

  const handleDelete = () => {
    Alert.alert(
      'Delete Program',
      `Are you sure you want to delete "${program.name}"? This action cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setActionLoading(true);
            try {
              await deleteLguProgram(program.id);
              await fetchProgramsList();
              router.replace('/(lgu)/programs' as any);
              Alert.alert('Success', 'Program deleted successfully.');
            } catch (err) {
              console.error('Error deleting program:', err);
              Alert.alert('Error', 'Failed to delete program.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleMarkCompleted = () => {
    Alert.alert(
      'Complete Program',
      `Are you sure you want to mark "${program.name}" as completed? This will freeze further allocations.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Mark Completed',
          onPress: async () => {
            setActionLoading(true);
            try {
              await updateProgramStatus(program.id, 'completed');
              await fetchProgramsList();
              Alert.alert('Success', 'Program marked as completed.');
            } catch (err) {
              console.error('Error completing program:', err);
              Alert.alert('Error', 'Failed to mark program as completed.');
            } finally {
              setActionLoading(false);
            }
          },
        },
      ]
    );
  };

  const getStatusBadgeStyle = () => {
    switch (calculatedStatus) {
      case 'active':
        return { bg: '#6FCA4B', text: 'Active' };
      case 'scheduled':
        return { bg: '#E4CF10', text: 'Scheduled' };
      case 'completed':
        return { bg: '#0E8B2C', text: 'Completed' };
      default:
        return { bg: '#8E9AA8', text: 'Draft' };
    }
  };

  const badgeInfo = getStatusBadgeStyle();

  return (
    <View style={styles.container}>
      {/* Header with Back Button */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()} hitSlop={{ top: 15, bottom: 15, left: 15, right: 15 }}>
          <FontAwesome name="chevron-left" size={18} color={BrandColors.navy} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Program Details</Text>
        <View style={styles.headerRightSpacer} />
      </View>

      {/* Details Body */}
      <ScrollView style={styles.detailsScrollView} contentContainerStyle={styles.scrollContent}>
        {/* Title Card */}
        <View style={styles.titleCard}>
          <View style={styles.statusBadgeRow}>
            <View style={[styles.statusBadge, { backgroundColor: badgeInfo.bg }]}>
              <Text style={styles.statusText}>{badgeInfo.text}</Text>
            </View>
          </View>
          <Text style={styles.programName}>{program.name}</Text>
          <Text style={styles.programDesc}>{program.description || 'No description provided.'}</Text>
        </View>

        {/* General Metadata Info */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>General Information</Text>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Disaster Type</Text>
              <Text style={styles.gridValue}>{program.disasterType || 'General'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Implementing Agency</Text>
              <Text style={styles.gridValue}>{program.implementingAgency || 'N/A'}</Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Funding Source</Text>
              <Text style={styles.gridValue}>{program.fundingSource || 'N/A'}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Affected Location</Text>
              <Text style={styles.gridValue}>
                {program.affectedBarangays && program.affectedBarangays.length > 0
                  ? `${program.affectedAreas?.join(', ') || ''} (${program.affectedBarangays.join(', ')})`
                  : (program.affectedAreas?.join(', ') || 'N/A')}
              </Text>
            </View>
          </View>
        </View>

        {/* Financial Configuration */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Financial Allocation</Text>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Total Budget</Text>
              <Text style={[styles.gridValue, styles.highlightValue]}>{formatCurrency(program.totalBudget)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Assistance per Family</Text>
              <Text style={styles.gridValue}>{formatCurrency(program.aidPerHousehold)}</Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Max Beneficiaries</Text>
              <Text style={styles.gridValue}>{program.maxBeneficiaries?.toLocaleString()} households</Text>
            </View>
          </View>
        </View>

        {/* Schedule */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Schedule</Text>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Program Start Date</Text>
              <Text style={styles.gridValue}>{formatHumanDate(program.startDate)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Program End Date</Text>
              <Text style={styles.gridValue}>{formatHumanDate(program.endDate)}</Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Registration Open</Text>
              <Text style={styles.gridValue}>
                {program.registrationOpen ? formatHumanDate(program.registrationOpen) : 'Open Indefinitely'}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Registration Close</Text>
              <Text style={styles.gridValue}>
                {program.registrationClose ? formatHumanDate(program.registrationClose) : 'Open Indefinitely'}
              </Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Distribution Start</Text>
              <Text style={styles.gridValue}>{formatHumanDate(program.distributionStart)}</Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Distribution Deadline</Text>
              <Text style={styles.gridValue}>{formatHumanDate(program.distributionEnd)}</Text>
            </View>
          </View>
        </View>

        {/* Vouchers configuration */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Voucher Settings</Text>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Voucher Types</Text>
              <Text style={styles.gridValue}>
                {program.voucherTypes?.map((val: string) => val.charAt(0).toUpperCase() + val.slice(1)).join(', ') || 'None (Pure Cash)'}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Redemption Method</Text>
              <Text style={styles.gridValue}>
                {program.redemptionType === 'merchant' ? 'Accredited Merchant' : 'Cash Out'}
              </Text>
            </View>
          </View>
          {program.voucherTypes && program.voucherTypes.length > 0 && (
            <>
              <View style={styles.detailGrid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Voucher Value</Text>
                  <Text style={styles.gridValue}>{formatCurrency(program.voucherValue)}</Text>
                </View>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Quantity / User</Text>
                  <Text style={styles.gridValue}>{program.voucherQuantity}</Text>
                </View>
              </View>
              <View style={styles.detailGrid}>
                <View style={styles.gridItem}>
                  <Text style={styles.gridLabel}>Voucher Expiration</Text>
                  <Text style={styles.gridValue}>{formatHumanDate(program.voucherExpiration)}</Text>
                </View>
                {program.redemptionType === 'merchant' && (
                  <View style={styles.gridItem}>
                    <Text style={styles.gridLabel}>Selected Merchants</Text>
                    <Text style={styles.gridValue}>
                      {program.selectedMerchants?.join(', ') || 'None'}
                    </Text>
                  </View>
                )}
              </View>
            </>
          )}
        </View>

        {/* Distribution and Wallet settings */}
        <View style={styles.infoSection}>
          <Text style={styles.sectionTitle}>Distribution Settings</Text>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Method</Text>
              <Text style={styles.gridValue}>
                {program.distributionMethod ? program.distributionMethod.charAt(0).toUpperCase() + program.distributionMethod.slice(1) : 'Automatic'}
              </Text>
            </View>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Wallet Type</Text>
              <Text style={styles.gridValue}>
                {program.walletTypeToggle ? 'Organization Multi-sig' : 'Individual Wallet'}
              </Text>
            </View>
          </View>
          <View style={styles.detailGrid}>
            <View style={styles.gridItem}>
              <Text style={styles.gridLabel}>Auto Distribute</Text>
              <Text style={styles.gridValue}>{program.autoDistributeToggle ? 'Enabled' : 'Disabled'}</Text>
            </View>
          </View>
        </View>

        {/* Eligibility criteria list */}
        {program.eligibilityCriteria && program.eligibilityCriteria.length > 0 && (
          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Eligibility Criteria</Text>
            {program.eligibilityCriteria.map((item: string, index: number) => (
              <View key={index} style={styles.bulletRow}>
                <Text style={styles.bullet}>•</Text>
                <Text style={styles.bulletText}>{item}</Text>
              </View>
            ))}

            {/* Auto-Eligibility Notice */}
            {!program.registrationOpen && !program.registrationClose && (
              <View style={styles.autoEligibilityNotice}>
                <Text style={styles.noticeIcon}>ℹ️</Text>
                <Text style={styles.noticeText}>
                  <Text style={styles.noticeBoldText}>Auto-Eligibility: </Text>
                  Registration period is open indefinitely. Any beneficiary passing the eligibility criteria is automatically eligible.
                </Text>
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* Row of Action Buttons (Delete Icon, Edit, and Complete) */}
      <View style={styles.actionsRow}>
        {/* Delete button: Icon only (trash icon) */}
        <TouchableOpacity
          style={styles.deleteIconButton}
          onPress={handleDelete}
          disabled={actionLoading}
          activeOpacity={0.7}
        >
          <FontAwesome name="trash" size={20} color="#D32F2F" />
        </TouchableOpacity>

        {/* Edit button */}
        <TouchableOpacity
          style={[styles.actionButton, styles.editButton, isCompleted && styles.fullFlex]}
          onPress={handleEdit}
          disabled={actionLoading}
          activeOpacity={0.8}
        >
          <Text style={styles.actionButtonText}>Edit</Text>
        </TouchableOpacity>

        {/* Mark Completed button */}
        {!isCompleted && (
          <TouchableOpacity
            style={[styles.actionButton, styles.completeButton]}
            onPress={handleMarkCompleted}
            disabled={actionLoading}
            activeOpacity={0.8}
          >
            <Text style={styles.actionButtonText}>Completed</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAF9F6',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.six,
    backgroundColor: '#FAF9F6',
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: Spacing.three,
  },
  errorTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.one,
  },
  errorSubtitle: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    textAlign: 'center',
    marginBottom: Spacing.four,
  },
  backLink: {
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.four,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
  },
  backLinkText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  header: {
    paddingTop: 54, // clearing notch
    paddingBottom: 16,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: 44,
    height: 44,
  },
  backText: {
    fontSize: 15,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginLeft: 8,
  },
  headerTitle: {
    fontSize: 17,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    textAlign: 'center',
  },
  headerRightSpacer: {
    width: 44,
  },
  detailsScrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: Spacing.four,
    paddingBottom: Spacing.six,
  },
  titleCard: {
    backgroundColor: '#FFFFFF',
    padding: Spacing.four,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    marginBottom: Spacing.four,
    elevation: 1,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.02,
    shadowRadius: 2,
  },
  statusBadgeRow: {
    flexDirection: 'row',
    marginBottom: Spacing.two,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  programName: {
    fontSize: 22,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  programDesc: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#5E6B7A',
    lineHeight: 20,
  },
  infoSection: {
    marginBottom: Spacing.four,
    backgroundColor: '#FFFFFF',
    padding: Spacing.four,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
  },
  sectionTitle: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: BrandColors.lightGray,
    paddingBottom: 6,
  },
  detailGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 6,
  },
  gridItem: {
    flex: 1,
    marginRight: Spacing.two,
  },
  gridLabel: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    marginBottom: 3,
  },
  gridValue: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  highlightValue: {
    color: '#6FCA4B',
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  bullet: {
    fontSize: 14,
    marginRight: 8,
    color: BrandColors.green,
  },
  bulletText: {
    flex: 1,
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.navy,
    lineHeight: 20,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: Spacing.four,
    borderTopWidth: 1,
    borderTopColor: BrandColors.lightGray,
    backgroundColor: '#FFFFFF',
  },
  deleteIconButton: {
    width: 50,
    height: 50,
    borderRadius: BorderRadius.md,
    backgroundColor: '#FFEBEE',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.three,
    borderWidth: 1,
    borderColor: '#FFCDD2',
  },
  deleteIconText: {
    fontSize: 20,
  },
  actionButton: {
    flex: 1,
    height: 50,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editButton: {
    backgroundColor: BrandColors.navy,
    marginRight: Spacing.three,
  },
  fullFlex: {
    marginRight: 0, // take up full width next to delete button if complete button is hidden
  },
  completeButton: {
    backgroundColor: '#0E8B2C',
  },
  actionButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  btnIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  autoEligibilityNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#E3F2FD',
    borderColor: '#BBDEFB',
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.three,
    marginTop: Spacing.three,
  },
  noticeIcon: {
    fontSize: 16,
    marginRight: 8,
    marginTop: 1,
  },
  noticeText: {
    flex: 1,
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#0D47A1', // Dark blue text
    lineHeight: 18,
  },
  noticeBoldText: {
    fontFamily: 'PlusJakartaSans_700Bold',
  },
});
