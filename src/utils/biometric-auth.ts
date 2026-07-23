// Beneficiary payment approval gate — device biometrics with an accessible
// secure fallback (Requirements 20.3, 20.4).
//
// Beneficiary payment approval is authorized cryptographically by the wallet
// signature over the EXACT prepared transaction or Soroban auth entry; that
// signature is the true control. This gate is the local, human approval step
// that runs BEFORE the wallet signs: it uses device biometrics when available
// and falls back to the device passcode/credential when biometrics are not
// enrolled (Requirement 20.4). When a device offers no biometric and no
// passcode at all, the gate reports `unenrolled` so the caller can require an
// explicit on-screen confirmation instead — it never silently skips approval.
//
// This module performs no signing and moves no value. A cancelled or failed gate
// simply stops the flow, so the balance is preserved (Requirement 11.9).

import * as LocalAuthentication from 'expo-local-authentication';

export type ApprovalMethod = 'biometric' | 'device_credential' | 'explicit_confirmation';

export type PaymentApprovalResult =
  | { ok: true; method: ApprovalMethod }
  /** The user actively dismissed the prompt; no value moves. */
  | { ok: false; reason: 'cancelled'; message: string }
  /** The device has neither biometrics nor a passcode; require explicit confirmation. */
  | { ok: false; reason: 'unenrolled'; message: string }
  /** Authentication was attempted and failed (e.g. too many attempts). */
  | { ok: false; reason: 'failed'; message: string };

const CANCEL_ERRORS: ReadonlySet<string> = new Set([
  'user_cancel',
  'system_cancel',
  'app_cancel',
  'user_fallback',
]);

const UNAVAILABLE_ERRORS: ReadonlySet<string> = new Set([
  'not_available',
  'not_enrolled',
  'passcode_not_set',
  'no_space',
]);

/**
 * Requests the beneficiary's device approval before the wallet signs a payment.
 * Biometrics are used when available; otherwise the OS presents the device
 * passcode as the accessible secure fallback (`disableDeviceFallback: false`).
 *
 * Returns `unenrolled` only when the device exposes no biometric hardware and no
 * device credential, so the caller can gate on an explicit in-app confirmation
 * rather than bypassing approval.
 */
export const requestPaymentApproval = async (
  promptMessage: string,
): Promise<PaymentApprovalResult> => {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const isEnrolled = hasHardware ? await LocalAuthentication.isEnrolledAsync() : false;

    const result = await LocalAuthentication.authenticateAsync({
      promptMessage,
      // The device passcode is the accessible secure fallback (Requirement 20.4).
      disableDeviceFallback: false,
      fallbackLabel: 'Use device passcode',
      cancelLabel: 'Cancel',
    });

    if (result.success) {
      return { ok: true, method: isEnrolled ? 'biometric' : 'device_credential' };
    }

    const errorCode = result.error ?? 'unknown';
    if (CANCEL_ERRORS.has(errorCode)) {
      return { ok: false, reason: 'cancelled', message: 'Authorization was cancelled. No funds were moved.' };
    }
    if (UNAVAILABLE_ERRORS.has(errorCode)) {
      return {
        ok: false,
        reason: 'unenrolled',
        message: 'This device has no biometric or passcode lock set up.',
      };
    }
    return {
      ok: false,
      reason: 'failed',
      message: 'Device authentication did not succeed. Please try again.',
    };
  } catch {
    // A thrown error here means the local authentication API itself is
    // unavailable on this device; treat it as unenrolled so the caller can fall
    // back to an explicit confirmation rather than failing the payment.
    return {
      ok: false,
      reason: 'unenrolled',
      message: 'Device authentication is unavailable on this device.',
    };
  }
};
