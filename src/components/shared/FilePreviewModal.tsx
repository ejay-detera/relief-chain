import { FontAwesome } from '@expo/vector-icons';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { buildPreviewTarget, inferFileKind } from '@/utils/file-preview';

type Props = {
  visible: boolean;
  /** Display name shown in the header; also used to infer the file kind when `signedUrl` has no extension. */
  fileName: string;
  /** A ready-to-use, already-signed Storage URL. Null/undefined renders a loading state. */
  signedUrl: string | null | undefined;
  /** True while the caller is still generating the signed URL. */
  isLoading?: boolean;
  onClose: () => void;
};

/**
 * In-app preview for a reviewed document (government ID, program requirement
 * upload, or appeal attachment), shared by every reviewer screen that opens a
 * signed Storage URL (Requirement: beneficiary/organization document review).
 *
 * Images render inline with pinch-to-zoom via `expo-image`. PDFs and Office
 * formats (docx/xlsx/pptx) open in the device's in-app browser
 * (`expo-web-browser`) — Office files are routed through Google's public
 * document viewer first, since no mobile OS or installed library renders
 * them natively. A signed URL is short-lived (300s by default); if it has
 * expired by the time this opens, the browser/viewer will show its own
 * fetch-failure page rather than this component silently failing.
 */
export const FilePreviewModal = ({ visible, fileName, signedUrl, isLoading = false, onClose }: Props) => {
  const [imageFailed, setImageFailed] = useState(false);
  const kind = inferFileKind(fileName) !== 'other' ? inferFileKind(fileName) : inferFileKind(signedUrl);

  const openExternally = async () => {
    if (!signedUrl) return;
    await WebBrowser.openBrowserAsync(buildPreviewTarget(kind, signedUrl));
  };

  const renderBody = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator color={BrandColors.navy} size="large" />
          <ThemedText style={styles.statusText}>Preparing preview…</ThemedText>
        </View>
      );
    }

    if (!signedUrl) {
      return (
        <View style={styles.centered}>
          <FontAwesome color={BrandColors.grey} name="exclamation-circle" size={28} />
          <ThemedText style={styles.statusText}>This file could not be loaded.</ThemedText>
        </View>
      );
    }

    if (kind === 'image' && !imageFailed) {
      return (
        <Image
          contentFit="contain"
          onError={() => setImageFailed(true)}
          source={{ uri: signedUrl }}
          style={styles.image}
        />
      );
    }

    return (
      <View style={styles.centered}>
        <FontAwesome
          color={kind === 'pdf' ? '#D32F2F' : BrandColors.navy}
          name={kind === 'pdf' ? 'file-pdf-o' : kind === 'office' ? 'file-word-o' : 'file-o'}
          size={48}
        />
        <ThemedText style={styles.statusText}>
          {kind === 'pdf'
            ? 'Open this PDF to view it.'
            : kind === 'office'
              ? 'Open this document to preview it.'
              : 'Open this file to view it.'}
        </ThemedText>
        <Pressable accessibilityRole="button" onPress={openExternally} style={styles.openButton}>
          <FontAwesome color="white" name="external-link" size={14} />
          <ThemedText style={styles.openButtonText}>Open File</ThemedText>
        </Pressable>
      </View>
    );
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} transparent visible={visible}>
      <View style={styles.overlay}>
        <View style={styles.card}>
          <View style={styles.header}>
            <ThemedText numberOfLines={1} style={styles.title}>
              {fileName}
            </ThemedText>
            <Pressable accessibilityLabel="Close preview" onPress={onClose} style={styles.closeButton}>
              <FontAwesome color={BrandColors.navy} name="close" size={20} />
            </Pressable>
          </View>

          <View style={styles.body}>{renderBody()}</View>

          {signedUrl && kind === 'image' && (
            <Pressable accessibilityRole="button" onPress={openExternally} style={styles.footerLink}>
              <FontAwesome color={BrandColors.navy} name="external-link" size={13} />
              <ThemedText style={styles.footerLinkText}>Open externally</ThemedText>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  card: {
    backgroundColor: 'white',
    borderTopLeftRadius: BorderRadius.xl,
    borderTopRightRadius: BorderRadius.xl,
    height: '85%',
    width: '100%',
  },
  header: {
    alignItems: 'center',
    borderBottomColor: '#eee',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.three,
  },
  title: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
    marginRight: Spacing.three,
  },
  closeButton: {
    padding: 4,
  },
  body: {
    flex: 1,
    padding: Spacing.four,
  },
  image: {
    flex: 1,
    width: '100%',
  },
  centered: {
    alignItems: 'center',
    flex: 1,
    gap: Spacing.three,
    justifyContent: 'center',
  },
  statusText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 13,
    textAlign: 'center',
  },
  openButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    flexDirection: 'row',
    gap: Spacing.two,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  openButtonText: {
    color: 'white',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 14,
  },
  footerLink: {
    alignItems: 'center',
    borderTopColor: '#eee',
    borderTopWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: Spacing.two,
    justifyContent: 'center',
    paddingVertical: Spacing.three,
  },
  footerLinkText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
});
