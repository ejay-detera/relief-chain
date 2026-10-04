import type { GeneratedReport } from '@/types/reports';
import {
  convertReportToCsv,
  escapeCsvValue,
  generateReportHtml,
} from '@/utils/report-utils';
import * as FileSystem from 'expo-file-system/legacy';
import { Platform, Share } from 'react-native';

export { convertReportToCsv, escapeCsvValue, generateReportHtml };

export interface ExportResult {
  success: boolean;
  filename: string;
  fileUri?: string;
  format: 'csv' | 'pdf_html';
}

/**
 * Exports report to Excel (CSV format) and triggers OS save/share dialog.
 */
export const exportReportToExcel = async (report: GeneratedReport): Promise<ExportResult> => {
  const csvData = convertReportToCsv(report);
  const safeFilename = `${report.reportType}-report-${Date.now()}.csv`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', safeFilename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      return { success: true, filename: safeFilename, format: 'csv' };
    }
  }

  // Native iOS / Android file write and share using React Native Share API
  const fileUri = `${FileSystem.cacheDirectory ?? ''}${safeFilename}`;
  await FileSystem.writeAsStringAsync(fileUri, csvData, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    await Share.share({
      title: `Export ${report.title}`,
      url: fileUri,
      message: csvData,
    });
  } catch (shareErr) {
    console.warn('[reportExportService] Native share dismissed or unavailable:', shareErr);
  }

  return { success: true, filename: safeFilename, fileUri, format: 'csv' };
};

/**
 * Exports report to PDF / Printable Document.
 * In Web, triggers window.print() (native Print to PDF).
 * In Native, creates self-contained verified HTML report file and shares it.
 */
export const exportReportToPdf = async (report: GeneratedReport): Promise<ExportResult> => {
  const htmlContent = generateReportHtml(report);
  const safeFilename = `${report.reportType}-audit-report-${Date.now()}.html`;

  if (Platform.OS === 'web') {
    if (typeof window !== 'undefined') {
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => {
          printWindow.print();
        }, 300);
        return { success: true, filename: safeFilename, format: 'pdf_html' };
      }
    }
  }

  // Native iOS / Android: write standalone print-ready HTML document
  const fileUri = `${FileSystem.cacheDirectory ?? ''}${safeFilename}`;
  await FileSystem.writeAsStringAsync(fileUri, htmlContent, {
    encoding: FileSystem.EncodingType.UTF8,
  });

  try {
    const summaryHeader = `[RELIEF CHAIN AUDIT REPORT: ${report.title.toUpperCase()}]\nOrganization: ${report.organizationName}\nScope: ${report.programLabel} | Period: ${report.dateRangeLabel}\nRecords: ${report.totalRecords} | Blockchain Reconciled: ${report.reconciliation?.isReconciled ? 'YES (100%)' : 'NO'}\nProof: ${report.reconciliation?.ledgerProofHash ?? 'N/A'}`;

    await Share.share({
      title: `${report.title} - Official Audit Report`,
      url: fileUri,
      message: `${summaryHeader}\n\nGenerated on: ${new Date(report.generatedAt).toLocaleString()}`,
    });
  } catch (shareErr) {
    console.warn('[reportExportService] Native share dismissed or unavailable:', shareErr);
  }

  return { success: true, filename: safeFilename, fileUri, format: 'pdf_html' };
};
