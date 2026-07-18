import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { ThemedText } from '@/components/themed-text';
import { BrandColors, BorderRadius, Spacing } from '@/constants/theme';

type Variant = 'approve' | 'reject' | 'suspend' | 'reactivate';

const VARIANT_CONFIG: Record<Variant, { confirmColor: string; confirmLabel: string }> = {
  approve:    { confirmColor: BrandColors.green, confirmLabel: 'Approve' },
  reject:     { confirmColor: '#E74C3C',          confirmLabel: 'Reject' },
  suspend:    { confirmColor: '#E74C3C',          confirmLabel: 'Suspend' },
  reactivate: { confirmColor: BrandColors.green, confirmLabel: 'Reactivate' },
};

type Props = {
  visible: boolean;
  title: string;
  body: string;
  variant: Variant;
  onConfirm: () => void;
  onCancel: () => void;
};

export const ConfirmationModal = ({ visible, title, body, variant, onConfirm, onCancel }: Props) => {
  const cfg = VARIANT_CONFIG[variant];
  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <ThemedText style={styles.title}>{title}</ThemedText>
          <ThemedText style={styles.body}>{body}</ThemedText>
          <View style={styles.actions}>
            <Pressable style={styles.cancelBtn} onPress={onCancel} accessibilityRole="button">
              <ThemedText style={styles.cancelText}>Cancel</ThemedText>
            </Pressable>
            <Pressable style={[styles.confirmBtn, { backgroundColor: cfg.confirmColor }]} onPress={onConfirm} accessibilityRole="button">
              <ThemedText style={styles.confirmText}>{cfg.confirmLabel}</ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: Spacing.four },
  card: { backgroundColor: '#FFF', borderRadius: BorderRadius.lg, padding: Spacing.four, width: '100%', gap: Spacing.three },
  title: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 17 },
  body: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_400Regular', fontSize: 14, lineHeight: 20 },
  actions: { flexDirection: 'row', gap: Spacing.two },
  cancelBtn: { flex: 1, borderWidth: 1, borderColor: BrandColors.grey, borderRadius: BorderRadius.md, paddingVertical: Spacing.two, alignItems: 'center' },
  cancelText: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  confirmBtn: { flex: 1, borderRadius: BorderRadius.md, paddingVertical: Spacing.two, alignItems: 'center' },
  confirmText: { color: '#FFF', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
});
