import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Switch, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { PILOT_ASSET_CODE, PILOT_NETWORK_LABEL, PILOT_NO_VALUE_LABEL } from '@/constants/pilot-disclosure';
import { BorderRadius, BrandColors, Spacing } from '@/constants/theme';
import { normalizeReceiptDigest } from '@/services/pos-adapter';
import type { InvoiceKind, MerchantInvoiceDraft, VoucherInvoiceProgramOption } from '@/types/invoice';
import { stroopsFromDecimalInput } from '@/utils/format-stroops';

type Props = {
  voucherPrograms: readonly VoucherInvoiceProgramOption[];
  isSubmitting: boolean;
  onSubmit: (draft: MerchantInvoiceDraft) => void;
};

const KINDS: readonly { key: InvoiceKind; label: string }[] = [
  { key: 'cash', label: 'Cash' },
  { key: 'voucher', label: 'Voucher' },
];

export const InvoiceAmountForm = ({ voucherPrograms, isSubmitting, onSubmit }: Props) => {
  const [kind, setKind] = useState<InvoiceKind>('cash');
  const [amount, setAmount] = useState('');
  const [programId, setProgramId] = useState<string | null>(null);
  const [categoryAttested, setCategoryAttested] = useState(false);
  const [evidenceDigest, setEvidenceDigest] = useState('');
  const [evidenceNote, setEvidenceNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedProgram = useMemo(
    () => voucherPrograms.find((program) => program.programId === programId) ?? null,
    [voucherPrograms, programId],
  );
  const voucherUnavailable = kind === 'voucher' && voucherPrograms.length === 0;

  const submit = () => {
    setError(null);
    let amountStroops;
    try {
      amountStroops = stroopsFromDecimalInput(amount);
    } catch (caught: unknown) {
      setError(caught instanceof RangeError ? caught.message : 'Enter a valid amount.');
      return;
    }

    let receiptDigest: string | undefined;
    try {
      receiptDigest = normalizeReceiptDigest(evidenceDigest);
    } catch (caught: unknown) {
      setError(caught instanceof RangeError ? caught.message : 'Invalid receipt digest.');
      return;
    }

    if (kind === 'voucher') {
      if (!selectedProgram) {
        setError('Select the voucher program this sale applies to.');
        return;
      }
      if (!categoryAttested) {
        setError(`Attest that this sale complies with the ${selectedProgram.category} category.`);
        return;
      }
      onSubmit({
        kind: 'voucher',
        amountStroops,
        category: selectedProgram.category,
        programId: selectedProgram.programId,
        contractId: selectedProgram.contractId,
        categoryAttested: true,
        ...(receiptDigest ? { receiptDigest } : {}),
        ...(evidenceNote.trim() ? { evidenceNote: evidenceNote.trim() } : {}),
      });
      return;
    }

    onSubmit({
      kind: 'cash',
      amountStroops,
      categoryAttested: false,
      ...(receiptDigest ? { receiptDigest } : {}),
      ...(evidenceNote.trim() ? { evidenceNote: evidenceNote.trim() } : {}),
    });
  };

  return (
    <View style={styles.container}>
      <ThemedText style={styles.label}>Payment type</ThemedText>
      <View style={styles.segment}>
        {KINDS.map((option) => {
          const active = option.key === kind;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={option.key}
              onPress={() => { setKind(option.key); setError(null); }}
              style={[styles.segmentItem, active && styles.segmentItemActive]}
            >
              <ThemedText style={[styles.segmentText, active && styles.segmentTextActive]}>{option.label}</ThemedText>
            </Pressable>
          );
        })}
      </View>

      <ThemedText style={styles.label}>Amount ({PILOT_ASSET_CODE})</ThemedText>
      <TextInput
        accessibilityLabel="Invoice amount"
        keyboardType="decimal-pad"
        onChangeText={(text) => { setAmount(text); setError(null); }}
        placeholder="0.00"
        placeholderTextColor={BrandColors.grey}
        style={styles.amountInput}
        value={amount}
      />
      <ThemedText style={styles.disclosure}>{PILOT_NETWORK_LABEL} · {PILOT_NO_VALUE_LABEL}</ThemedText>

      {kind === 'voucher' && (
        <View style={styles.block}>
          <ThemedText style={styles.label}>Voucher program</ThemedText>
          {voucherUnavailable ? (
            <ThemedText style={styles.helper}>
              No activated voucher program with a deployed contract is available for your accreditation yet.
            </ThemedText>
          ) : (
            voucherPrograms.map((program) => {
              const active = program.programId === programId;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  key={program.programId}
                  onPress={() => { setProgramId(program.programId); setCategoryAttested(false); setError(null); }}
                  style={[styles.programRow, active && styles.programRowActive]}
                >
                  <View style={styles.programText}>
                    <ThemedText style={styles.programName}>{program.name}</ThemedText>
                    <ThemedText style={styles.programCategory}>Category: {program.category}</ThemedText>
                  </View>
                  {active && <ThemedText style={styles.programCheck}>✓</ThemedText>}
                </Pressable>
              );
            })
          )}

          {selectedProgram && (
            <View style={styles.attestRow}>
              <Switch
                onValueChange={(value) => { setCategoryAttested(value); setError(null); }}
                thumbColor="#FFFFFF"
                trackColor={{ false: BrandColors.grey, true: BrandColors.green }}
                value={categoryAttested}
              />
              <ThemedText style={styles.attestText}>
                I attest this sale complies with the {selectedProgram.category} category. Item-level details are not verified on-chain.
              </ThemedText>
            </View>
          )}
        </View>
      )}

      <View style={styles.block}>
        <ThemedText style={styles.label}>Off-chain evidence (optional)</ThemedText>
        <TextInput
          accessibilityLabel="Receipt digest"
          autoCapitalize="none"
          onChangeText={(text) => { setEvidenceDigest(text); setError(null); }}
          placeholder="Receipt digest (64 hex chars)"
          placeholderTextColor={BrandColors.grey}
          style={styles.evidenceInput}
          value={evidenceDigest}
        />
        <TextInput
          accessibilityLabel="Evidence note"
          onChangeText={setEvidenceNote}
          placeholder="Internal note (kept off-chain)"
          placeholderTextColor={BrandColors.grey}
          style={styles.evidenceInput}
          value={evidenceNote}
        />
      </View>

      {error && <ThemedText style={styles.error}>{error}</ThemedText>}

      <Pressable
        accessibilityRole="button"
        disabled={isSubmitting || voucherUnavailable}
        onPress={submit}
        style={({ pressed }) => [styles.submit, (pressed || isSubmitting || voucherUnavailable) && styles.submitDisabled]}
      >
        <ThemedText style={styles.submitText}>Create signed invoice</ThemedText>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { gap: Spacing.two },
  label: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 13, marginTop: Spacing.two },
  segment: { backgroundColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, flexDirection: 'row', padding: Spacing.half },
  segmentItem: { alignItems: 'center', borderRadius: BorderRadius.md, flex: 1, paddingVertical: Spacing.two },
  segmentItemActive: { backgroundColor: BrandColors.navy },
  segmentText: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  segmentTextActive: { color: '#FFFFFF' },
  amountInput: { backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, borderWidth: 1.5, color: BrandColors.navy, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 28, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  disclosure: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 11 },
  block: { gap: Spacing.two },
  helper: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  programRow: { alignItems: 'center', backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderRadius: BorderRadius.lg, borderWidth: 1.5, flexDirection: 'row', justifyContent: 'space-between', padding: Spacing.three },
  programRowActive: { borderColor: BrandColors.green },
  programText: { flex: 1, gap: 2 },
  programName: { color: BrandColors.navy, fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 14 },
  programCategory: { color: BrandColors.grey, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12 },
  programCheck: { color: BrandColors.green, fontFamily: 'PlusJakartaSans_700Bold', fontSize: 18, marginLeft: Spacing.two },
  attestRow: { alignItems: 'center', flexDirection: 'row', gap: Spacing.two },
  attestText: { color: BrandColors.navy, flex: 1, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 12, lineHeight: 17 },
  evidenceInput: { backgroundColor: '#FFFFFF', borderColor: BrandColors.lightGray, borderRadius: BorderRadius.md, borderWidth: 1.5, color: BrandColors.navy, fontFamily: 'PlusJakartaSans_500Medium', fontSize: 13, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  error: { color: '#C0392B', fontFamily: 'PlusJakartaSans_600SemiBold', fontSize: 12 },
  submit: { alignItems: 'center', backgroundColor: BrandColors.green, borderRadius: BorderRadius.xl, marginTop: Spacing.two, padding: Spacing.three },
  submitDisabled: { opacity: 0.55 },
  submitText: { color: '#FFFFFF', fontFamily: 'PlusJakartaSans_700Bold', fontSize: 15 },
});
