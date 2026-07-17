// Derives the beneficiary-facing wallet-rotation status view from the local
// pilot wallet state (Requirement 16.4). This is a presentation mapping only: it
// never asserts confirmation. A `confirmed` rotation view is produced elsewhere
// from reconciled ledger evidence via the wallet-rotation infrastructure; this
// mapper only surfaces whether the local signer is healthy or a rotation is
// needed, and what prerequisites remain (identity re-verification, recent step-up).

import type { PilotWalletState } from '@/types/wallet';
import type { WalletRotationStatusView } from '@/types/wallet-recovery';

const REVERIFY_IDENTITY = 'Re-verify your identity';
const RECENT_STEP_UP = 'Complete a recent step-up authentication';
const REPLACE_WALLET = 'Replace the lost wallet with a new one';

const RECOVERY_REASON_LABEL: Record<string, string> = {
  missing_signer: 'Your wallet key isn’t on this device.',
  invalid_signer: 'Your stored wallet key is unreadable.',
  signer_mismatch: 'This device’s key no longer matches your active wallet.',
};

const empty = (status: WalletRotationStatusView['status']): WalletRotationStatusView => ({
  status,
  replacementAddress: null,
  transactionHash: null,
  confirmedLedger: null,
  blockingReasons: [],
});

/**
 * Maps the current local wallet state to a rotation status view. `ready` shows no
 * rotation in progress; a recovery-required state that can start rotation lists
 * the required prerequisites so the beneficiary understands the controlled path.
 */
export const rotationStatusFromWalletState = (
  state: PilotWalletState | null,
): WalletRotationStatusView => {
  if (!state) return empty('none');

  switch (state.status) {
    case 'ready':
      return empty('none');
    case 'binding_required':
      return {
        ...empty('prerequisites_required'),
        blockingReasons: ['Verify your wallet to activate it.'],
      };
    case 'recovery_required': {
      const reason = RECOVERY_REASON_LABEL[state.reason] ?? 'Your wallet needs recovery.';
      if (!state.canStartRotation) {
        return { ...empty('failed'), blockingReasons: [reason] };
      }
      return {
        ...empty('prerequisites_required'),
        blockingReasons: [reason, REVERIFY_IDENTITY, RECENT_STEP_UP, REPLACE_WALLET],
      };
    }
    case 'unavailable':
      return {
        ...empty('prerequisites_required'),
        blockingReasons: ['Secure storage is unavailable on this device right now.'],
      };
    default:
      return empty('none');
  }
};
