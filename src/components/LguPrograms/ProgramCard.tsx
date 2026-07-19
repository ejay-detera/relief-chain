import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export interface ProgramItem {
  id: string;
  name: string;
  description: string;
  disasterType: string;
  disasterTypeId: number | null;
  implementingAgency: string;
  implementingAgencyId: number | null;
  fundingSource: string;
  fundingSourceId: number | null;
  totalBudget: number;
  aidPerHousehold: number;
  maxBeneficiaries: number;
  startDate: string;
  endDate: string;
  registrationOpen: string;
  registrationClose: string;
  distributionStart: string;
  distributionEnd: string;
  eligibilityCriteria: string[];
  voucherTypes: string[];
  voucherValue: number;
  voucherQuantity: number;
  voucherExpiration: string;
  redemptionType: 'cash' | 'merchant';
  selectedMerchants: string[];
  distributionMethod: 'automatic' | 'manual' | 'batch';
  walletTypeToggle: boolean;
  autoDistributeToggle: boolean;
  supportingDocuments: any[];
  status: string;
  created_at?: string;
  affectedAreas: string[];
  affectedAreaIds: number[];
}

interface ProgramCardProps {
  program: ProgramItem;
  onPress: (program: ProgramItem) => void;
  onOpenMenu: (program: ProgramItem) => void;
}

// Status badge helper
export const resolveProgramStatus = (status: string, startDate?: string): 'active' | 'scheduled' | 'completed' | 'draft' => {
  if (status === 'completed') return 'completed';
  if (status === 'draft') return 'draft';
  
  if (startDate) {
    const todayStr = new Date().toISOString().split('T')[0];
    if (startDate <= todayStr) {
      return 'active';
    } else {
      return 'scheduled';
    }
  }
  return 'active';
};

// Date formatter
const formatHumanDate = (dateStr: string) => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  if (isNaN(date.getTime())) return dateStr;
  return date.toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export const ProgramCard = ({ program, onPress, onOpenMenu }: ProgramCardProps) => {
  const calculatedStatus = resolveProgramStatus(program.status, program.startDate);

  const formatCurrency = (val: number) => {
    return `${val.toLocaleString(undefined, { 
      minimumFractionDigits: 2, 
      maximumFractionDigits: 2 
    })} RCPHP`;
  };

  const formatCurrencyMuted = (val: number) => {
    return `${val.toLocaleString(undefined, { 
      minimumFractionDigits: 0, 
      maximumFractionDigits: 0 
    })} RCPHP`;
  };

  // Determine progress and beneficiary mock count
  let progress = 0;
  let beneficiaryCount = 0;

  if (calculatedStatus === 'active') {
    // Deterministic progress for active programs
    const code = program.name.charCodeAt(0) || 0;
    progress = 50 + (code % 5) * 10; // 50%, 60%, 70%, 80%, 90%
    beneficiaryCount = Math.round((progress / 100) * program.maxBeneficiaries);
  } else if (calculatedStatus === 'completed') {
    progress = 100;
    beneficiaryCount = program.maxBeneficiaries;
  }

  // Get status pill style
  const getStatusBadgeStyle = () => {
    switch (calculatedStatus) {
      case 'active':
        return {
          bg: '#6FCA4B', // Brand Green
          text: 'Active',
        };
      case 'scheduled':
        return {
          bg: '#E4CF10', // Brand Yellow
          text: 'Scheduled',
        };
      case 'completed':
        return {
          bg: '#0E8B2C', // Deep Green
          text: 'Completed',
        };
      default:
        return {
          bg: '#8E9AA8',
          text: 'Draft',
        };
    }
  };

  const badgeInfo = getStatusBadgeStyle();

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={() => onPress(program)}
      activeOpacity={0.95}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.statusBadge, { backgroundColor: badgeInfo.bg }]}>
          <Text style={styles.statusText}>{badgeInfo.text}</Text>
        </View>
        <TouchableOpacity
          style={styles.menuButton}
          onPress={() => onOpenMenu(program)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.menuIcon}>⋮</Text>
        </TouchableOpacity>
      </View>

      <Text style={styles.cardTitle}>{program.name}</Text>

      <View style={styles.detailsContainer}>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Budget Allocation</Text>
          <Text style={styles.detailValue}>{formatCurrency(program.totalBudget)}</Text>
        </View>
        <View style={styles.detailRow}>
          <Text style={styles.detailLabel}>Assistance / Family</Text>
          <Text style={styles.detailValue}>{formatCurrencyMuted(program.aidPerHousehold)}</Text>
        </View>
      </View>

      <View style={styles.progressContainer}>
        <View style={styles.progressLabelRow}>
          <Text style={styles.progressLabel}>Distribution Progress</Text>
          <Text style={styles.progressValue}>{progress}%</Text>
        </View>
        <View style={styles.progressBarBg}>
          <View style={[styles.progressBarFill, { width: `${progress}%` }]} />
        </View>
      </View>

      <View style={styles.cardFooter}>
        {calculatedStatus === 'scheduled' ? (
          <View style={styles.scheduledContainer}>
            <Text style={styles.calendarIcon}>📅</Text>
            <Text style={styles.scheduledText}>Starts {formatHumanDate(program.startDate)}</Text>
          </View>
        ) : (
          <View style={styles.avatarList}>
            <View style={styles.avatarsWrapper}>
              {[0, 1, 2, 3].map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.avatarCircle,
                    { marginLeft: i > 0 ? -12 : 0, zIndex: 10 - i },
                  ]}
                />
              ))}
              <View style={[styles.avatarCircle, styles.avatarCountCircle, { marginLeft: -12, zIndex: 0 }]}>
                <Text style={styles.avatarCountText}>+{beneficiaryCount}</Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.lg,
    padding: Spacing.four,
    marginBottom: Spacing.four,
    elevation: 3,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    borderWidth: 1,
    borderColor: BrandColors.lightGray,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.three,
  },
  statusBadge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: BorderRadius.full,
  },
  statusText: {
    fontSize: 12,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#FFFFFF',
  },
  menuButton: {
    paddingHorizontal: 4,
  },
  menuIcon: {
    fontSize: 20,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#8E9AA8',
  },
  cardTitle: {
    fontSize: 18,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
    marginBottom: Spacing.three,
  },
  detailsContainer: {
    marginBottom: Spacing.three,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginVertical: 3,
  },
  detailLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
  },
  detailValue: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  progressContainer: {
    marginBottom: Spacing.three,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabel: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
  },
  progressValue: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  progressBarBg: {
    height: 12,
    backgroundColor: '#EEEDED',
    borderRadius: BorderRadius.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#6FCA4B', // Brand Green
    borderRadius: BorderRadius.full,
  },
  cardFooter: {
    marginTop: Spacing.two,
    flexDirection: 'row',
    alignItems: 'center',
  },
  scheduledContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  calendarIcon: {
    fontSize: 14,
    marginRight: 6,
  },
  scheduledText: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_500Medium',
    color: BrandColors.navy,
  },
  avatarList: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarsWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#D0D5DD',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  avatarCountCircle: {
    backgroundColor: '#EEEDED',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarCountText: {
    fontSize: 11,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: '#5E6B7A',
  },
});
