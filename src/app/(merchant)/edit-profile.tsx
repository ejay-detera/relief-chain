import { FontAwesome, MaterialCommunityIcons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { FadeInView } from '@/components/shared/FadeInView';
import { ThemedText } from '@/components/themed-text';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { useAuth } from '@/context/AuthContext';
import { merchantWalletPublicKey, useMerchantWallet } from '@/hooks/use-merchant-wallet';
import { supabase } from '@/lib/supabase';
import { extractMerchantMetadata, updateMerchantProfile } from '@/services/profileService';
import type { MerchantBusinessType } from '@/types/merchant-registration';

type BusinessTypeOption = {
  label: string;
  type: MerchantBusinessType;
  icon: React.ComponentProps<typeof MaterialCommunityIcons>['name'];
};

const businessCategories: BusinessTypeOption[] = [
  { label: 'Grocery / Retail', type: 'grocery', icon: 'cart-outline' },
  { label: 'Pharmacy / Drugstore', type: 'pharmacy', icon: 'medical-bag' },
  { label: 'Convenience Store', type: 'convenienceStore', icon: 'store-outline' },
  { label: 'General / Others', type: 'other', icon: 'dots-horizontal-circle-outline' },
];

export default function MerchantEditProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { profile, session, refreshProfile } = useAuth();
  const { state: walletState, merchantEntityId } = useMerchantWallet();

  const metadata = session?.user?.user_metadata;
  const extracted = extractMerchantMetadata(metadata);

  // Form states initialized with existing profile/metadata
  const [businessName, setBusinessName] = useState(
    extracted.businessName || profile?.full_name || '',
  );
  const [ownerName, setOwnerName] = useState(
    extracted.contactPerson ||
      [profile?.first_name, profile?.last_name].filter(Boolean).join(' ') ||
      profile?.full_name ||
      '',
  );
  const [address, setAddress] = useState(
    profile?.complete_address || profile?.location || extracted.businessAddress || '',
  );
  const [mobileNumber, setMobileNumber] = useState(
    profile?.mobile_number || extracted.contactNumber || session?.user?.phone || '',
  );
  const [email, setEmail] = useState(session?.user?.email || '');
  const [businessType, setBusinessType] = useState<MerchantBusinessType>(
    (extracted.businessType as MerchantBusinessType) || 'grocery',
  );
  const [operatingNotes, setOperatingNotes] = useState(extracted.operatingNotes || '');
  const [isSaving, setIsSaving] = useState(false);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // Load merchant_entities display_name if available and form is blank
  useEffect(() => {
    let isActive = true;
    const fetchEntityName = async () => {
      if (!session?.user?.id) return;
      try {
        const { data } = await supabase
          .from('merchant_entities')
          .select('display_name')
          .eq('profile_id', session.user.id)
          .maybeSingle();

        if (data?.display_name && isActive) {
          setBusinessName((prev) => (prev.trim() ? prev : data.display_name));
        }
      } catch {
        // Fall back gracefully
      }
    };
    void fetchEntityName();
    return () => {
      isActive = false;
    };
  }, [session?.user?.id]);

  // Read-only reference account credentials
  const publicKey = merchantWalletPublicKey(walletState);
  const merchantId = merchantEntityId || profile?.id || session?.user?.id || 'Not available';
  const walletAddress = profile?.stellar_pubkey || publicKey || 'Not available';
  const registeredMobile = profile?.mobile_number || session?.user?.phone || extracted.contactNumber || 'Not available';

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(merchant)/profile' as never);
    }
  };

  const copyToClipboard = useCallback(async (text: string, key: string) => {
    if (!text || text === 'Not available') return;
    await Clipboard.setStringAsync(text);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey(null);
    }, 2000);
  }, []);

  const handleSave = async () => {
    if (!session?.user?.id) return;

    if (!businessName.trim()) {
      Alert.alert('Business Name Required', 'Please enter your business or store name.');
      return;
    }

    if (!ownerName.trim()) {
      Alert.alert('Owner Name Required', 'Please enter the owner or authorized representative name.');
      return;
    }

    if (!address.trim()) {
      Alert.alert('Address Required', 'Please enter the store or business address.');
      return;
    }

    if (!mobileNumber.trim()) {
      Alert.alert('Contact Number Required', 'Please enter a contact phone number.');
      return;
    }

    setIsSaving(true);
    try {
      await updateMerchantProfile(session.user.id, {
        businessName: businessName.trim(),
        ownerName: ownerName.trim(),
        address: address.trim(),
        mobileNumber: mobileNumber.trim(),
        businessType,
        email: email.trim(),
        operatingNotes: operatingNotes.trim(),
      });

      await refreshProfile();

      Alert.alert('Profile Updated', 'Your business information has been successfully updated.', [
        { text: 'OK', onPress: handleBack },
      ]);
    } catch (error: unknown) {
      console.error('Error updating merchant profile:', error);
      const message = error instanceof Error ? error.message : 'Please try again later.';
      Alert.alert('Update Failed', message);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardView}
      >
        <View style={styles.header}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={12}
            onPress={handleBack}
            style={styles.backButton}
          >
            <FontAwesome color={BrandColors.navy} name="chevron-left" size={18} />
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <ThemedText style={styles.headerTitle}>Edit Business Profile</ThemedText>
            <ThemedText style={styles.headerSubtitle}>Manage store info and credentials</ThemedText>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: insets.bottom + Spacing.six },
          ]}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* SECTION 1: Account & Settlement Details (Read-only reference) */}
          <FadeInView delay={0}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons color={BrandColors.navy} name="shield-check-outline" size={20} />
                <ThemedText style={styles.cardTitle}>Account & Settlement Details</ThemedText>
              </View>
              <ThemedText style={styles.cardDescription}>
                Permanent identifiers tied to your accredited merchant account.
              </ThemedText>

              {/* Merchant ID */}
              <View style={styles.credentialItem}>
                <View style={styles.credentialLeft}>
                  <View style={styles.credentialIconWrap}>
                    <MaterialCommunityIcons color={BrandColors.navy} name="identifier" size={18} />
                  </View>
                  <View style={styles.credentialTextWrap}>
                    <ThemedText style={styles.credentialLabel}>Merchant ID</ThemedText>
                    <ThemedText numberOfLines={1} selectable style={styles.credentialValue}>
                      {merchantId}
                    </ThemedText>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Copy Merchant ID"
                  accessibilityRole="button"
                  onPress={() => void copyToClipboard(merchantId, 'merchantId')}
                  style={[styles.copyButton, copiedKey === 'merchantId' && styles.copyButtonActive]}
                >
                  <MaterialCommunityIcons
                    color={copiedKey === 'merchantId' ? BrandColors.green : BrandColors.navy}
                    name={copiedKey === 'merchantId' ? 'check' : 'content-copy'}
                    size={16}
                  />
                  <ThemedText
                    style={[
                      styles.copyButtonText,
                      copiedKey === 'merchantId' && styles.copyButtonTextActive,
                    ]}
                  >
                    {copiedKey === 'merchantId' ? 'Copied' : 'Copy'}
                  </ThemedText>
                </Pressable>
              </View>

              {/* Stellar Wallet Address */}
              <View style={styles.credentialItem}>
                <View style={styles.credentialLeft}>
                  <View style={styles.credentialIconWrap}>
                    <MaterialCommunityIcons color={BrandColors.navy} name="wallet-outline" size={18} />
                  </View>
                  <View style={styles.credentialTextWrap}>
                    <View style={styles.labelWithBadge}>
                      <ThemedText style={styles.credentialLabel}>Stellar Wallet Address</ThemedText>
                      <View style={styles.badge}>
                        <ThemedText style={styles.badgeText}>Testnet</ThemedText>
                      </View>
                    </View>
                    <ThemedText numberOfLines={1} selectable style={styles.credentialValueMono}>
                      {walletAddress}
                    </ThemedText>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Copy Stellar Wallet Address"
                  accessibilityRole="button"
                  onPress={() => void copyToClipboard(walletAddress, 'walletAddress')}
                  style={[styles.copyButton, copiedKey === 'walletAddress' && styles.copyButtonActive]}
                >
                  <MaterialCommunityIcons
                    color={copiedKey === 'walletAddress' ? BrandColors.green : BrandColors.navy}
                    name={copiedKey === 'walletAddress' ? 'check' : 'content-copy'}
                    size={16}
                  />
                  <ThemedText
                    style={[
                      styles.copyButtonText,
                      copiedKey === 'walletAddress' && styles.copyButtonTextActive,
                    ]}
                  >
                    {copiedKey === 'walletAddress' ? 'Copied' : 'Copy'}
                  </ThemedText>
                </Pressable>
              </View>

              {/* Registered Mobile Number */}
              <View style={styles.credentialItem}>
                <View style={styles.credentialLeft}>
                  <View style={styles.credentialIconWrap}>
                    <MaterialCommunityIcons color={BrandColors.navy} name="cellphone-check" size={18} />
                  </View>
                  <View style={styles.credentialTextWrap}>
                    <View style={styles.labelWithBadge}>
                      <ThemedText style={styles.credentialLabel}>Registered Mobile</ThemedText>
                      <View style={styles.badgeSuccess}>
                        <ThemedText style={styles.badgeSuccessText}>Registered</ThemedText>
                      </View>
                    </View>
                    <ThemedText numberOfLines={1} selectable style={styles.credentialValue}>
                      {registeredMobile}
                    </ThemedText>
                  </View>
                </View>
                <Pressable
                  accessibilityLabel="Copy Mobile Number"
                  accessibilityRole="button"
                  onPress={() => void copyToClipboard(registeredMobile, 'registeredMobile')}
                  style={[styles.copyButton, copiedKey === 'registeredMobile' && styles.copyButtonActive]}
                >
                  <MaterialCommunityIcons
                    color={copiedKey === 'registeredMobile' ? BrandColors.green : BrandColors.navy}
                    name={copiedKey === 'registeredMobile' ? 'check' : 'content-copy'}
                    size={16}
                  />
                  <ThemedText
                    style={[
                      styles.copyButtonText,
                      copiedKey === 'registeredMobile' && styles.copyButtonTextActive,
                    ]}
                  >
                    {copiedKey === 'registeredMobile' ? 'Copied' : 'Copy'}
                  </ThemedText>
                </Pressable>
              </View>
            </View>
          </FadeInView>

          {/* SECTION 2: Editable Business Information */}
          <FadeInView delay={40}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons color={BrandColors.navy} name="storefront-outline" size={20} />
                <ThemedText style={styles.cardTitle}>Business Information</ThemedText>
              </View>
              <ThemedText style={styles.cardDescription}>
                Editable details shown on invoices, customer receipts, and program listings.
              </ThemedText>

              {/* Business Name */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Business / Store Name</ThemedText>
                  <ThemedText style={styles.requiredStar}>*</ThemedText>
                </View>
                <View style={styles.inputContainer}>
                  <MaterialCommunityIcons color={BrandColors.grey} name="store" size={18} style={styles.inputIcon} />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setBusinessName}
                    placeholder="e.g. Aling Nena's General Store"
                    placeholderTextColor={BrandColors.grey}
                    style={styles.input}
                    value={businessName}
                  />
                </View>
              </View>

              {/* Owner / Representative */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Owner / Authorized Representative</ThemedText>
                  <ThemedText style={styles.requiredStar}>*</ThemedText>
                </View>
                <View style={styles.inputContainer}>
                  <MaterialCommunityIcons color={BrandColors.grey} name="account-outline" size={18} style={styles.inputIcon} />
                  <TextInput
                    autoCapitalize="words"
                    onChangeText={setOwnerName}
                    placeholder="e.g. Maria Santos"
                    placeholderTextColor={BrandColors.grey}
                    style={styles.input}
                    value={ownerName}
                  />
                </View>
              </View>

              {/* Business Category */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Business Category</ThemedText>
                  <ThemedText style={styles.requiredStar}>*</ThemedText>
                </View>
                <View style={styles.categoryGrid}>
                  {businessCategories.map((cat) => {
                    const isSelected = businessType === cat.type;
                    return (
                      <Pressable
                        key={cat.type}
                        onPress={() => setBusinessType(cat.type)}
                        style={[styles.categoryChip, isSelected && styles.categoryChipSelected]}
                      >
                        <MaterialCommunityIcons
                          color={isSelected ? BrandColors.navy : BrandColors.grey}
                          name={cat.icon}
                          size={16}
                        />
                        <ThemedText
                          style={[styles.categoryChipText, isSelected && styles.categoryChipTextSelected]}
                        >
                          {cat.label}
                        </ThemedText>
                      </Pressable>
                    );
                  })}
                </View>
              </View>

              {/* Business Address */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Store / Business Address</ThemedText>
                  <ThemedText style={styles.requiredStar}>*</ThemedText>
                </View>
                <View style={[styles.inputContainer, styles.textAreaContainer]}>
                  <MaterialCommunityIcons
                    color={BrandColors.grey}
                    name="map-marker-outline"
                    size={18}
                    style={[styles.inputIcon, styles.textAreaIcon]}
                  />
                  <TextInput
                    multiline
                    numberOfLines={3}
                    onChangeText={setAddress}
                    placeholder="Street, Barangay, Municipality/City, Province"
                    placeholderTextColor={BrandColors.grey}
                    style={[styles.input, styles.textAreaInput]}
                    value={address}
                  />
                </View>
              </View>
            </View>
          </FadeInView>

          {/* SECTION 3: Contact & Communication Details */}
          <FadeInView delay={80}>
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <MaterialCommunityIcons color={BrandColors.navy} name="phone-in-talk-outline" size={20} />
                <ThemedText style={styles.cardTitle}>Contact Details</ThemedText>
              </View>
              <ThemedText style={styles.cardDescription}>
                Direct phone and email contact for program coordinators and customer support.
              </ThemedText>

              {/* Contact Number */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Contact / Mobile Number</ThemedText>
                  <ThemedText style={styles.requiredStar}>*</ThemedText>
                </View>
                <View style={styles.inputContainer}>
                  <MaterialCommunityIcons color={BrandColors.grey} name="phone-outline" size={18} style={styles.inputIcon} />
                  <TextInput
                    keyboardType="phone-pad"
                    onChangeText={(val) => setMobileNumber(val.replace(/[^\d+]/g, ''))}
                    placeholder="09171234567 or +639171234567"
                    placeholderTextColor={BrandColors.grey}
                    style={styles.input}
                    value={mobileNumber}
                  />
                </View>
              </View>

              {/* Business Email */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Contact Email</ThemedText>
                </View>
                <View style={styles.inputContainer}>
                  <MaterialCommunityIcons color={BrandColors.grey} name="email-outline" size={18} style={styles.inputIcon} />
                  <TextInput
                    autoCapitalize="none"
                    keyboardType="email-address"
                    onChangeText={setEmail}
                    placeholder="merchant@example.com"
                    placeholderTextColor={BrandColors.grey}
                    style={styles.input}
                    value={email}
                  />
                </View>
              </View>

              {/* Operating Hours / Notes */}
              <View style={styles.fieldGroup}>
                <View style={styles.fieldLabelRow}>
                  <ThemedText style={styles.fieldLabel}>Operating Hours & Special Instructions</ThemedText>
                </View>
                <View style={styles.inputContainer}>
                  <MaterialCommunityIcons color={BrandColors.grey} name="clock-outline" size={18} style={styles.inputIcon} />
                  <TextInput
                    onChangeText={setOperatingNotes}
                    placeholder="e.g. Open Mon - Sat, 7:00 AM - 8:00 PM"
                    placeholderTextColor={BrandColors.grey}
                    style={styles.input}
                    value={operatingNotes}
                  />
                </View>
              </View>
            </View>
          </FadeInView>

          {/* SECTION 4: Action Buttons */}
          <FadeInView delay={120}>
            <View style={styles.actionsContainer}>
              <Pressable
                accessibilityLabel="Save business profile changes"
                accessibilityRole="button"
                disabled={isSaving}
                onPress={handleSave}
                style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              >
                {isSaving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <View style={styles.saveButtonContent}>
                    <FontAwesome color="#FFFFFF" name="check" size={16} />
                    <ThemedText style={styles.saveButtonText}>Save Changes</ThemedText>
                  </View>
                )}
              </Pressable>

              <Pressable
                accessibilityLabel="Cancel editing"
                accessibilityRole="button"
                disabled={isSaving}
                onPress={handleBack}
                style={styles.cancelButton}
              >
                <ThemedText style={styles.cancelButtonText}>Cancel</ThemedText>
              </Pressable>
            </View>
          </FadeInView>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: '#F8F9FB',
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomColor: BrandColors.lightGray,
    borderBottomWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingBottom: Spacing.two,
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
  },
  backButton: {
    alignItems: 'center',
    borderRadius: BorderRadius.full,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  headerTitleContainer: {
    alignItems: 'center',
  },
  headerTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 17,
  },
  headerSubtitle: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 11,
    marginTop: 1,
  },
  headerSpacer: {
    width: 40,
  },
  scrollContent: {
    padding: Spacing.four,
    rowGap: Spacing.four,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E8ECF2',
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    elevation: 2,
    padding: Spacing.four,
    shadowColor: '#112E58',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
  },
  cardHeader: {
    alignItems: 'center',
    columnGap: Spacing.two,
    flexDirection: 'row',
  },
  cardTitle: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 16,
  },
  cardDescription: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_400Regular',
    fontSize: 12,
    marginBottom: Spacing.three,
    marginTop: 4,
  },
  credentialItem: {
    alignItems: 'center',
    backgroundColor: BrandColors.lightGray,
    borderRadius: BorderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.two,
    padding: Spacing.three,
  },
  credentialLeft: {
    alignItems: 'center',
    columnGap: Spacing.two,
    flex: 1,
    flexDirection: 'row',
    marginRight: Spacing.two,
  },
  credentialIconWrap: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: BorderRadius.full,
    height: 34,
    justifyContent: 'center',
    width: 34,
  },
  credentialTextWrap: {
    flex: 1,
  },
  labelWithBadge: {
    alignItems: 'center',
    columnGap: Spacing.one,
    flexDirection: 'row',
  },
  credentialLabel: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 10,
    textTransform: 'uppercase',
  },
  badge: {
    backgroundColor: '#E2E8F0',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
  },
  badgeSuccess: {
    backgroundColor: '#E8F5E9',
    borderRadius: BorderRadius.sm,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  badgeSuccessText: {
    color: '#2E7D32',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 9,
  },
  credentialValue: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
    marginTop: 2,
  },
  credentialValueMono: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
    marginTop: 2,
  },
  copyButton: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderColor: '#D3D9E2',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    columnGap: 4,
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  copyButtonActive: {
    backgroundColor: '#F0FDF4',
    borderColor: BrandColors.green,
  },
  copyButtonText: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 11,
  },
  copyButtonTextActive: {
    color: BrandColors.green,
  },
  fieldGroup: {
    marginBottom: Spacing.three,
  },
  fieldLabelRow: {
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 6,
  },
  fieldLabel: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 13,
  },
  requiredStar: {
    color: '#E53E3E',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 13,
    marginLeft: 3,
  },
  inputContainer: {
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    flexDirection: 'row',
    minHeight: 46,
    paddingHorizontal: Spacing.three,
  },
  inputIcon: {
    marginRight: Spacing.two,
  },
  input: {
    color: BrandColors.navy,
    flex: 1,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 14,
    paddingVertical: 10,
  },
  textAreaContainer: {
    alignItems: 'flex-start',
    minHeight: 88,
    paddingTop: Spacing.two,
  },
  textAreaIcon: {
    marginTop: 3,
  },
  textAreaInput: {
    minHeight: 70,
    textAlignVertical: 'top',
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  categoryChip: {
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    columnGap: 6,
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  categoryChipSelected: {
    backgroundColor: '#E6F4EA',
    borderColor: BrandColors.green,
  },
  categoryChipText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_500Medium',
    fontSize: 12,
  },
  categoryChipTextSelected: {
    color: BrandColors.navy,
    fontFamily: 'PlusJakartaSans_700Bold',
  },
  actionsContainer: {
    marginTop: Spacing.two,
    rowGap: Spacing.two,
  },
  saveButton: {
    alignItems: 'center',
    backgroundColor: BrandColors.navy,
    borderRadius: BorderRadius.full,
    elevation: 3,
    height: 52,
    justifyContent: 'center',
    shadowColor: BrandColors.navy,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
  },
  saveButtonDisabled: {
    opacity: 0.65,
  },
  saveButtonContent: {
    alignItems: 'center',
    columnGap: 8,
    flexDirection: 'row',
  },
  saveButtonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans_700Bold',
    fontSize: 15,
  },
  cancelButton: {
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderColor: '#D3D9E2',
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    height: 46,
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: BrandColors.grey,
    fontFamily: 'PlusJakartaSans_600SemiBold',
    fontSize: 14,
  },
});
