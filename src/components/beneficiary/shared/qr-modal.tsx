import { FontAwesome } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';

type Props = {
  visible: boolean;
  publicKey?: string;
  onClose: () => void;
};

export function QrModal({ visible, publicKey, onClose }: Props) {
  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <Pressable accessibilityLabel="Close QR code" onPress={onClose} style={styles.closeButton}>
            <FontAwesome name="close" size={22} color={BrandColors.navy} />
          </Pressable>

          <View style={styles.qrContainer}>
            {publicKey ? (
              <QRCode value={publicKey} size={200} color={BrandColors.navy} backgroundColor="white" />
            ) : (
              <View style={styles.placeholder} />
            )}
          </View>

          <ThemedText style={styles.title}>Your Payment QR</ThemedText>
          <ThemedText style={styles.subtitle}>Present this to merchants to receive aid or redeem vouchers</ThemedText>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: 'white',
    borderRadius: BorderRadius.lg,
    padding: Spacing.five,
    alignItems: 'center',
  },
  closeButton: {
    alignSelf: 'flex-end',
    marginBottom: Spacing.two,
  },
  qrContainer: {
    padding: Spacing.three,
    backgroundColor: 'white',
    borderRadius: BorderRadius.md,
    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
    marginBottom: Spacing.three,
  },
  placeholder: {
    width: 200,
    height: 200,
    backgroundColor: BrandColors.lightGray,
  },
  title: {
    color: BrandColors.navy,
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: Spacing.one,
  },
  subtitle: {
    color: BrandColors.grey,
    fontSize: 12,
    textAlign: 'center',
  },
});
