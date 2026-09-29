import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { InvoiceDetailMetadata } from '@/components/MerchantPaymentHistory/InvoiceDetailMetadata';
import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import type { MerchantInvoiceRecord } from '@/types/merchant-payment-history';
import { formatStroops } from '@/utils/format-stroops';

type Props = {
  record: MerchantInvoiceRecord | null;
  visible: boolean;
  onClose: () => void;
  onCheckSettlement?: (record: MerchantInvoiceRecord) => Promise<boolean>;
};

export const InvoiceDetailModal = ({ record, visible, onClose, onCheckSettlement }: Props) => {
  const router = useRouter();
  const [isChecking, setIsChecking] = useState(false);
  const [copiedPayload, setCopiedPayload] = useState(false);

  const copyPayload = useCallback(async (payload: string) => {
    await Clipboard.setStringAsync(payload);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 2000);
  }, []);

  if (!record) return null;
  const { invoice, transport, status } = record;
  const isSettled = status === 'settled';
  const isActive = status === 'active';
  const isExpired = status === 'expired';

  const handleCheck = async () => {
    if (!onCheckSettlement) return;
    setIsChecking(true);
    await onCheckSettlement(record);
    setIsChecking(false);
  };

  const handleOpenInReceive = () => {
    onClose();
    router.push({
      pathname: '/(merchant)/receive',
      params: { nonce: invoice.nonce },
    });
  };

  return (
    <Modal animationType="slide" transparent visible={visible}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.titleRow}>
              <ThemedText style={styles.title}>Payment Request</ThemedText>
              <Pressable accessibilityLabel="Close" accessibilityRole="button" hitSlop={10} onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons color={BrandColors.navy} name="close" size={22} />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            <View style={[styles.statusBanner, isSettled ? styles.bannerSettled : isActive ? styles.bannerActive : styles.bannerExpired]}>
              <MaterialCommunityIcons
                color={isSettled ? BrandColors.green : isActive ? '#B28900' : '#C0392B'}
                name={isSettled ? 'check-circle' : isActive ? 'clock-outline' : 'alert-circle-outline'}
                size={20}
              />
              <ThemedText style={[styles.statusBannerText, { color: isSettled ? BrandColors.green : isActive ? '#B28900' : '#C0392B' }]}>
                {isSettled
                  ? 'Payment Settled & Confirmed on Chain'
                  : isActive
                  ? `Active QR — Expires at ${new Date(invoice.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
                  : `Expired on ${new Date(invoice.expiresAt).toLocaleDateString([], { month: 'short', day: 'numeric' })} at ${new Date(invoice.expiresAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`}
              </ThemedText>
            </View>

            <View style={styles.qrSection}>
              <View style={[styles.qrWrapper, isExpired && styles.qrExpiredWrapper]}>
                <QRCode backgroundColor="#FFFFFF" color={isExpired ? '#999999' : BrandColors.navy} size={200} value={transport.qr} />
                {isExpired && (
                  <View style={styles.expiredOverlay}>
                    <ThemedText style={styles.expiredOverlayText}>EXPIRED</ThemedText>
                  </View>
                )}
              </View>
              <ThemedText style={styles.qrHelper}>
                {isSettled ? 'Receipt QR (Paid)' : isActive ? 'Scan to pay this request' : 'This QR code can no longer be paid'}
              </ThemedText>
            </View>

            <View style={styles.amountBox}>
              <ThemedText style={styles.amountLabel}>Requested Amount</ThemedText>
              <ThemedText style={styles.amountValue}>₱{formatStroops(invoice.amountStroops)}</ThemedText>
              <ThemedText style={styles.assetInfo}>{PILOT_ASSET_CODE} ({PILOT_NETWORK_LABEL})</ThemedText>
            </View>

            <InvoiceDetailMetadata record={record} />

            <View style={styles.actions}>
              {isActive && (
                <>
                  <Pressable accessibilityRole="button" onPress={handleOpenInReceive} style={styles.primaryButton}>
                    <MaterialCommunityIcons color="#FFFFFF" name="qrcode-scan" size={18} />
                    <ThemedText style={styles.primaryButtonText}>Present in Scanner</ThemedText>
                  </Pressable>
                  <Pressable accessibilityRole="button" disabled={isChecking} onPress={handleCheck} style={styles.secondaryButton}>
                    <MaterialCommunityIcons color={BrandColors.navy} name="refresh" size={18} />
                    <ThemedText style={styles.secondaryButtonText}>{isChecking ? 'Checking…' : 'Check Settlement'}</ThemedText>
                  </Pressable>
                </>
              )}
              {isExpired && (
                <Pressable accessibilityRole="button" onPress={handleOpenInReceive} style={styles.primaryButton}>
                  <MaterialCommunityIcons color="#FFFFFF" name="plus-circle-outline" size={18} />
                  <ThemedText style={styles.primaryButtonText}>Generate New QR</ThemedText>
                </Pressable>
              )}
              <Pressable accessibilityRole="button" onPress={() => void copyPayload(transport.qr)} style={styles.outlineButton}>
                <ThemedText style={styles.outlineButtonText}>{copiedPayload ? 'Copied QR Payload!' : 'Copy QR Payload'}</ThemedText>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: { backgroundColor: 'rgba(0,0,0,0.5)', flex: 1, justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#FFFFFF', borderTopLeftRadius: BorderRadius.xl, borderTopRightRadius: BorderRadius.xl, maxHeight: '90%', paddingBottom: Spacing.four },
  header: { alignItems: 'center', borderBottomColor: '#EEF2F6', borderBottomWidth: 1, paddingBottom: Spacing.two, paddingTop: Spacing.two },
  handle: { backgroundColor: '#CBD5E1', borderRadius: 2, height: 4, marginBottom: Spacing.two, width: 40 },
  titleRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: Spacing.four, width: '100%' },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18 },
  closeBtn: { padding: 4 },
  content: { gap: Spacing.three, padding: Spacing.four },
  statusBanner: { alignItems: 'center', borderRadius: BorderRadius.md, flexDirection: 'row', gap: Spacing.two, padding: Spacing.three },
  bannerSettled: { backgroundColor: 'rgba(111, 202, 75, 0.12)' },
  bannerActive: { backgroundColor: 'rgba(228, 207, 16, 0.14)' },
  bannerExpired: { backgroundColor: 'rgba(192, 57, 43, 0.1)' },
  statusBannerText: { flex: 1, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 13 },
  qrSection: { alignItems: 'center', gap: Spacing.two, paddingVertical: Spacing.one },
  qrWrapper: { backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, borderWidth: 1.5, padding: Spacing.three, position: 'relative' },
  qrExpiredWrapper: { opacity: 0.6 },
  expiredOverlay: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.7)', justifyContent: 'center' },
  expiredOverlayText: { color: '#C0392B', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 24, letterSpacing: 2 },
  qrHelper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  amountBox: { alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: BorderRadius.lg, padding: Spacing.three },
  amountLabel: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  amountValue: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, marginVertical: 2 },
  assetInfo: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 11 },
  actions: { gap: Spacing.two, marginTop: Spacing.two },
  primaryButton: { alignItems: 'center', backgroundColor: BrandColors.navy, borderRadius: 24, flexDirection: 'row', gap: Spacing.two, justifyContent: 'center', padding: Spacing.three },
  primaryButtonText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
  secondaryButton: { alignItems: 'center', backgroundColor: '#EEF2F6', borderRadius: 24, flexDirection: 'row', gap: Spacing.two, justifyContent: 'center', padding: Spacing.three },
  secondaryButtonText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 14 },
  outlineButton: { alignItems: 'center', borderColor: BrandColors.navy, borderRadius: 24, borderWidth: 1, padding: Spacing.three },
  outlineButtonText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13 },
});
