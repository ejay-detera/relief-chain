import { FontAwesome } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { LedgerReconciliationCard } from '@/components/AuditReports/LedgerReconciliationCard';
import { ReportExportBar } from '@/components/AuditReports/ReportExportBar';
import { ReportFilterBar } from '@/components/AuditReports/ReportFilterBar';
import { ReportKpiSection } from '@/components/AuditReports/ReportKpiSection';
import { ReportTable } from '@/components/AuditReports/ReportTable';
import { ReportTypePills } from '@/components/AuditReports/ReportTypePills';
import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { resolveCallerOrganizationId } from '@/services/organizationMerchantService';
import { exportReportToExcel, exportReportToPdf } from '@/services/reportExportService';
import {
  fetchOrganizationPrograms,
  generateReportData,
  type ProgramOption,
} from '@/services/reportService';
import type { DateRangePreset, GeneratedReport, ReportType } from '@/types/reports';

export default function AuditReportsScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [orgId, setOrgId] = useState<string>('');
  const [programs, setPrograms] = useState<ProgramOption[]>([]);
  const [selectedType, setSelectedType] = useState<ReportType>('financial');
  const [selectedProgramId, setSelectedProgramId] = useState<string>('all');
  const [selectedDatePreset, setSelectedDatePreset] = useState<DateRangePreset>('all');
  const [selectedStartDate, setSelectedStartDate] = useState<string | null>(null);
  const [selectedEndDate, setSelectedEndDate] = useState<string | null>(null);
  const [selectedSpecificDate, setSelectedSpecificDate] = useState<string | null>(null);

  const [report, setReport] = useState<GeneratedReport | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isExportingPdf, setIsExportingPdf] = useState<boolean>(false);
  const [isExportingExcel, setIsExportingExcel] = useState<boolean>(false);

  // Initialize Organization & Program Scope
  useEffect(() => {
    let isMounted = true;

    async function init() {
      try {
        const resolvedOrg = await resolveCallerOrganizationId();
        const activeOrgId = resolvedOrg || profile?.id || '';
        if (!isMounted) return;
        setOrgId(activeOrgId);

        const progList = await fetchOrganizationPrograms(activeOrgId);
        if (!isMounted) return;
        setPrograms(progList);
      } catch (err) {
        console.warn('[AuditReportsScreen] Initialization warning:', err);
      }
    }

    init();
    return () => {
      isMounted = false;
    };
  }, [profile?.id]);

  // Load / Re-generate Report when filters change
  const loadReport = useCallback(async () => {
    setIsLoading(true);
    try {
      const orgName = profile?.full_name || 'Relief Organization';
      const result = await generateReportData(
        {
          reportType: selectedType,
          programId: selectedProgramId,
          datePreset: selectedDatePreset,
          startDate: selectedStartDate,
          endDate: selectedEndDate,
          specificDate: selectedSpecificDate,
        },
        orgId,
        orgName,
      );
      setReport(result);
    } catch (err: any) {
      console.error('[AuditReportsScreen] Error generating report:', err);
      Alert.alert('Report Generation Error', 'Unable to compile report. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [
    selectedType,
    selectedProgramId,
    selectedDatePreset,
    selectedStartDate,
    selectedEndDate,
    selectedSpecificDate,
    orgId,
    profile?.full_name,
  ]);

  useEffect(() => {
    loadReport();
  }, [loadReport]);

  const handleSelectDateFilter = (
    preset: DateRangePreset,
    startDate?: string | null,
    endDate?: string | null,
    specificDate?: string | null,
  ) => {
    setSelectedDatePreset(preset);
    setSelectedStartDate(startDate || null);
    setSelectedEndDate(endDate || null);
    setSelectedSpecificDate(specificDate || null);
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    loadReport();
  };

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(lgu)/settings' as any);
    }
  };

  const handleExportPdf = async () => {
    if (!report) return;
    setIsExportingPdf(true);
    try {
      await exportReportToPdf(report);
    } catch (err: any) {
      console.error('[AuditReportsScreen] PDF Export error:', err);
      Alert.alert('Export Failed', 'Unable to create PDF export. Please try again.');
    } finally {
      setIsExportingPdf(false);
    }
  };

  const handleExportExcel = async () => {
    if (!report) return;
    setIsExportingExcel(true);
    try {
      await exportReportToExcel(report);
    } catch (err: any) {
      console.error('[AuditReportsScreen] Excel Export error:', err);
      Alert.alert('Export Failed', 'Unable to create Excel export. Please try again.');
    } finally {
      setIsExportingExcel(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Go back"
          accessibilityRole="button"
          hitSlop={10}
          onPress={handleBack}
          style={styles.backButton}
        >
          <FontAwesome color={BrandColors.navy} name="chevron-left" size={16} />
        </Pressable>
        <View style={styles.headerCenter}>
          <ThemedText style={styles.title}>Audit & Compliance Reports</ThemedText>
          <ThemedText style={styles.subtitle}>ORG-07 • Verified Blockchain Reporting</ThemedText>
        </View>
        <Pressable
          accessibilityLabel="Refresh report"
          accessibilityRole="button"
          hitSlop={10}
          onPress={handleRefresh}
          style={styles.refreshButton}
        >
          <FontAwesome color={BrandColors.navy} name="refresh" size={16} />
        </Pressable>
      </View>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            colors={[BrandColors.navy]}
            onRefresh={handleRefresh}
            refreshing={isRefreshing}
            tintColor={BrandColors.navy}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* 1. Report Category Selector Pills (7 Report Types) */}
        <FadeInView delay={0}>
          <ReportTypePills
            onSelectType={(t) => setSelectedType(t)}
            selectedType={selectedType}
          />
        </FadeInView>

        {/* 2. Program Scope & Date Range Filter Bar */}
        <FadeInView delay={40}>
          <ReportFilterBar
            onSelectDateFilter={handleSelectDateFilter}
            onSelectProgram={(pid) => setSelectedProgramId(pid)}
            programs={programs}
            selectedDatePreset={selectedDatePreset}
            selectedEndDate={selectedEndDate}
            selectedProgramId={selectedProgramId}
            selectedSpecificDate={selectedSpecificDate}
            selectedStartDate={selectedStartDate}
          />
        </FadeInView>

        {/* 3. Export Action Bar (PDF & Excel with progress) */}
        <FadeInView delay={80}>
          <ReportExportBar
            isExportingExcel={isExportingExcel}
            isExportingPdf={isExportingPdf}
            onExportExcel={handleExportExcel}
            onExportPdf={handleExportPdf}
          />
        </FadeInView>

        {/* 4. Live Loading or Loaded Report Views */}
        {isLoading && !isRefreshing ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={BrandColors.navy} size="large" />
            <ThemedText style={styles.loadingText}>Compiling {selectedType} audit records...</ThemedText>
          </View>
        ) : report ? (
          <>
            {/* Blockchain Ledger Reconciliation Banner (Financial / Audit) */}
            {report.reconciliation && (
              <FadeInView delay={120}>
                <LedgerReconciliationCard reconciliation={report.reconciliation} />
              </FadeInView>
            )}

            {/* High-Level Summary Metrics */}
            <FadeInView delay={160}>
              <ReportKpiSection kpis={report.summaryKpis} />
            </FadeInView>

            {/* Detailed Table Preview */}
            <FadeInView delay={200}>
              <ReportTable
                columns={report.columns}
                rows={report.rows}
                totalRecords={report.totalRecords}
              />
            </FadeInView>
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  backButton: {
    padding: 6,
    borderRadius: BorderRadius.sm,
  },
  headerCenter: {
    flex: 1,
    marginHorizontal: Spacing.two,
  },
  title: {
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
    color: BrandColors.navy,
  },
  subtitle: {
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  refreshButton: {
    padding: 6,
    borderRadius: BorderRadius.sm,
  },
  scrollContent: {
    paddingBottom: Spacing.eight,
  },
  loadingContainer: {
    padding: Spacing.eight,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    color: '#64748B',
  },
});
