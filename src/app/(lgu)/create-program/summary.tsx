import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Text, TouchableOpacity, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useCreateProgram } from './_layout';
import { StepIndicator } from '@/components/CreateProgram/StepIndicator';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

export default function SummaryScreen() {
  const router = useRouter();
  const { draft, publishProgram } = useCreateProgram();
  const [successModalVisible, setSuccessModalVisible] = useState(false);
  const [publishedStatus, setPublishedStatus] = useState<'draft' | 'published'>('draft');

  const handleAction = (status: 'draft' | 'published') => {
    setPublishedStatus(status);
    publishProgram(status);
    setSuccessModalVisible(true);
  };

  const handleCloseSuccess = () => {
    setSuccessModalVisible(false);
    // Navigate back to the LGU programs tab
    router.replace('/(lgu)/programs' as any);
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP', minimumFractionDigits: 0 }).format(val);
  };

  return (
    <View style={styles.container}>
      <StepIndicator currentStep={7} title="Review Summary" />

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.sectionDescription}>
          Review all configured parameters for this aid program. Once published, vouchers will be ready for allocation.
        </Text>

        {/* SECTION 1: BASIC INFO */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardHeader}>1. Basic Information</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Program Name</Text>
            <Text style={styles.detailValue}>{draft.name}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.detailValue}>{draft.description}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Disaster Type</Text>
            <Text style={styles.detailValue}>{draft.disasterType}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Affected Areas</Text>
            <Text style={styles.detailValue}>{draft.affectedAreas.join(', ')}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Implementing Agency</Text>
            <Text style={styles.detailValue}>{draft.implementingAgency}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Funding Source</Text>
            <Text style={styles.detailValue}>{draft.fundingSource}</Text>
          </View>
        </View>

        {/* SECTION 2: BUDGET & SCHEDULE */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardHeader}>2. Budget & Schedule</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Total Budget</Text>
            <Text style={styles.detailValue}>{formatCurrency(draft.totalBudget)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Aid per Household</Text>
            <Text style={styles.detailValue}>{formatCurrency(draft.aidPerHousehold)}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Max Beneficiaries</Text>
            <Text style={styles.detailValue}>{draft.maxBeneficiaries.toLocaleString()} households</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Start Date</Text>
            <Text style={styles.detailValue}>{draft.startDate}</Text>
          </View>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Deadline</Text>
            <Text style={styles.detailValue}>{draft.endDate}</Text>
          </View>
        </View>

        {/* SECTION 3: ELIGIBILITY */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardHeader}>3. Eligibility Criteria</Text>
          {draft.eligibilityCriteria.map((item, index) => (
            <View key={index} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
        </View>

        {/* SECTION 4: VOUCHER CONFIG */}
        <View style={styles.summaryCard}>
          <Text style={styles.cardHeader}>4. Voucher Configuration</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Voucher Types</Text>
            <Text style={styles.detailValue}>
              {draft.voucherTypes.map(val => {
                if (val === 'food') return 'Food';
                if (val === 'medicine') return 'Medicine';
                if (val === 'supplies') return 'Supplies';
                return val;
              }).join(', ') || 'None (Pure Cash)'}
            </Text>
          </View>
          {draft.voucherTypes.length > 0 && (
            <>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Voucher Value</Text>
                <Text style={styles.detailValue}>{formatCurrency(draft.voucherValue)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Quantity per User</Text>
                <Text style={styles.detailValue}>{draft.voucherQuantity}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Voucher Expiration</Text>
                <Text style={styles.detailValue}>{draft.voucherExpiration}</Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Redemption Type</Text>
                <Text style={styles.detailValue}>
                  {draft.redemptionType === 'cash' ? 'Cash Out' : 'Merchant Voucher'}
                </Text>
              </View>
            </>
          )}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Remaining Cash Assistance</Text>
            <Text style={[styles.detailValue, { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold' }]}>
              {formatCurrency(draft.aidPerHousehold - (draft.voucherTypes.length > 0 ? draft.voucherValue * draft.voucherQuantity : 0))}
            </Text>
          </View>
          {draft.voucherTypes.length > 0 && draft.redemptionType === 'merchant' && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Selected Merchants</Text>
              <Text style={styles.detailValue}>{draft.selectedMerchants.join(', ')}</Text>
            </View>
          )}
        </View>

        {/* SECTION 5: SUPPORTING DOCUMENTS */}
        {draft.supportingDocuments.length > 0 && (
          <View style={styles.summaryCard}>
            <Text style={styles.cardHeader}>5. Supporting Documents</Text>
            {draft.supportingDocuments.map((item, index) => (
              <View key={index} style={styles.bulletRow}>
                <Text style={styles.bullet}>📄</Text>
                <Text style={styles.bulletText}>{item.name}</Text>
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* FOOTER ACTIONS */}
      <View style={styles.footer}>
        <TouchableOpacity
          style={styles.draftButton}
          onPress={() => handleAction('draft')}>
          <Text style={styles.draftButtonText}>Save as Draft</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.publishButton}
          onPress={() => handleAction('published')}>
          <Text style={styles.publishButtonText}>Publish Program</Text>
        </TouchableOpacity>
      </View>

      {/* SUCCESS MODAL */}
      <Modal visible={successModalVisible} transparent animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.successBadge}>
              <Text style={styles.successCheck}>✓</Text>
            </View>
            
            <Text style={styles.successTitle}>
              Program {publishedStatus === 'published' ? 'Published!' : 'Saved as Draft!'}
            </Text>
            
            <Text style={styles.successMsg}>
              Your relief assistance program has been successfully configured and{' '}
              {publishedStatus === 'published' ? 'published to the LGU portal.' : 'saved in your drafts.'}
            </Text>

            <TouchableOpacity style={styles.confirmBtn} onPress={handleCloseSuccess}>
              <Text style={styles.confirmBtnText}>Return to Dashboard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  scrollContent: {
    padding: Spacing.three,
    paddingBottom: Spacing.six,
  },
  sectionDescription: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    lineHeight: 20,
    marginBottom: Spacing.four,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
    padding: Spacing.three,
    marginBottom: Spacing.three,
  },
  cardHeader: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.green,
    marginBottom: Spacing.two,
    textTransform: 'uppercase',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.one,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.grey,
    width: '40%',
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    textAlign: 'right',
    flex: 1,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.one,
  },
  bullet: {
    fontSize: 14,
    color: BrandColors.navy,
    marginRight: Spacing.two,
  },
  bulletText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: BrandColors.lightGray,
    paddingBottom: Spacing.four,
  },
  draftButton: {
    flex: 1,
    height: 48,
    borderWidth: 1,
    borderColor: BrandColors.grey,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: Spacing.two,
  },
  draftButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  publishButton: {
    flex: 1.5,
    height: 48,
    backgroundColor: BrandColors.green,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  publishButtonText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: Spacing.four,
  },
  modalContent: {
    width: '90%',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    alignItems: 'center',
  },
  successBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E8F5E9',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  successCheck: {
    fontSize: 28,
    fontWeight: 'bold',
    color: BrandColors.green,
  },
  successTitle: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.two,
  },
  successMsg: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: BrandColors.grey,
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: Spacing.four,
  },
  confirmBtn: {
    width: '100%',
    height: 48,
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.md,
    justifyContent: 'center',
    alignItems: 'center',
  },
  confirmBtnText: {
    fontSize: 14,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
});
