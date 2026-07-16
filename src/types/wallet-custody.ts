export type WalletProofPurpose = 'new_binding' | 'rotation';

export type WalletProofChallengeV1 = Readonly<{
  version: 1;
  domain: 'relief-chain.wallet-proof';
  network: 'stellar_testnet';
  purpose: WalletProofPurpose;
  walletId: string;
  beneficiaryIdentityId: string;
  walletAddress: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}>;

export type WalletProofResponse = Readonly<{
  challenge: WalletProofChallengeV1;
  signatureBase64: string;
}>;

export type VerifiedWalletProof = Readonly<{
  walletId: string;
  beneficiaryIdentityId: string;
  walletAddress: string;
  purpose: WalletProofPurpose;
  challengeDigest: string;
  signatureDigest: string;
  verifiedAt: string;
}>;

export type WalletBindingSnapshot = Readonly<{
  id: string;
  beneficiaryIdentityId: string;
  address: string;
  network: 'stellar_testnet';
  verificationStatus: 'pending' | 'challenge_issued' | 'verified' | 'rejected' | 'expired';
  isActive: boolean;
}>;

export type WalletRotationSecurityContext = Readonly<{
  aal: 'aal1' | 'aal2';
  steppedUpAt: string | null;
  identityReverifiedAt: string | null;
  identityReverificationExpiresAt: string | null;
}>;

export type WalletRotationIneligibilityReason =
  | 'identity_mismatch'
  | 'identity_reverification_required'
  | 'identity_reverification_expired'
  | 'recent_step_up_required'
  | 'current_wallet_not_active'
  | 'replacement_wallet_not_verified'
  | 'replacement_wallet_already_active'
  | 'same_wallet';

export type WalletRotationEligibility =
  | Readonly<{ eligible: true; beneficiaryIdentityId: string }>
  | Readonly<{ eligible: false; reasons: readonly WalletRotationIneligibilityReason[] }>;

/**
 * One voucher-contract entitlement migration performed atomically at confirmed
 * rotation. Carries only pseudonymous contract identifiers and public addresses.
 */
export type WalletRotationEntitlementMigration = Readonly<{
  voucherContractId: string;
  entitlementId: string;
  currentWalletAddress: string;
  replacementWalletAddress: string;
}>;

/** Immutable inputs used to build the canonical rotation intent and signing package. */
export type WalletRotationIntentInput = Readonly<{
  walletRotationIntentId: string;
  organizationId: string;
  beneficiaryIdentityId: string;
  correlationId: string;
  currentWallet: WalletBindingSnapshot;
  replacementWallet: WalletBindingSnapshot;
  entitlementMigrations: readonly WalletRotationEntitlementMigration[];
}>;

/**
 * Deterministic, hashable projection of a rotation intent. The digest of its
 * canonical bytes binds every prepared attempt and submitted authorization.
 */
export type CanonicalWalletRotationIntent = Readonly<{
  version: 1;
  domain: 'relief-chain.wallet-rotation';
  network: 'stellar_testnet';
  walletRotationIntentId: string;
  organizationId: string;
  beneficiaryIdentityId: string;
  correlationId: string;
  currentWalletId: string;
  currentWalletAddress: string;
  replacementWalletId: string;
  replacementWalletAddress: string;
  entitlementMigrations: readonly WalletRotationEntitlementMigration[];
}>;

/** The exact package the caller must authorize; nothing outside it may be signed or submitted. */
export type WalletRotationSigningPackage = Readonly<{
  operationType: 'wallet_rotation';
  network: 'stellar_testnet';
  intentPayloadHash: string;
  replacementWalletProofDigest: string;
  entitlementMigrations: readonly WalletRotationEntitlementMigration[];
}>;

/** Result of a prepare step: immutable intent, payload hash, signing package, and attempt linkage. */
export type PreparedWalletRotation = Readonly<{
  intent: CanonicalWalletRotationIntent;
  intentPayloadHash: string;
  signingPackage: WalletRotationSigningPackage;
  attemptNumber: number;
}>;

/** Authorization returned by the caller and re-verified against the stored intent before submission. */
export type WalletRotationAuthorizationSubmission = Readonly<{
  intentPayloadHash: string;
  replacementWalletProofDigest: string;
  entitlementMigrations: readonly WalletRotationEntitlementMigration[];
  envelopeXdr: string | null;
  authorizationEntries: readonly string[];
}>;

/**
 * Submission outcome. Submission never yields `confirmed`; only reconciliation
 * against observed ledger evidence can advance a rotation to confirmed.
 */
export type WalletRotationSubmissionDecision = Readonly<{
  status: 'submitted';
  intentPayloadHash: string;
  attemptNumber: number;
}>;

/** Observed on-chain evidence required before a rotation may be confirmed. */
export type WalletRotationConfirmationObservation = Readonly<{
  network: 'stellar_testnet';
  transactionHash: string;
  confirmedLedger: number;
  intentPayloadHash: string;
}>;

/**
 * The single atomic effect set applied at confirmed rotation: the old wallet is
 * revoked and the replacement activated together with every entitlement migration.
 */
export type WalletRotationConfirmationPlan = Readonly<{
  status: 'confirmed';
  beneficiaryIdentityId: string;
  revokeWalletId: string;
  activateWalletId: string;
  entitlementMigrations: readonly WalletRotationEntitlementMigration[];
  transactionHash: string;
  confirmedLedger: number;
  atomic: true;
}>;

/** Public, non-secret metadata returned by a production custody provider. */
export type ProductionWalletDescriptor = Readonly<{
  provider: string;
  providerWalletReference: string;
  publicAddress: string;
  network: 'stellar_public';
  custodyModel: 'external_self_custody' | 'partner_managed';
}>;

/** Exact public payload sent to a production wallet for user authorization. */
export type ProductionWalletAuthorizationRequest = Readonly<{
  providerWalletReference: string;
  publicAddress: string;
  canonicalPayload: string;
  purpose: 'wallet_binding' | 'wallet_rotation' | 'cash_payment' | 'voucher_redemption';
  expiresAt: string;
}>;

/** Non-secret authorization evidence; raw production keys never cross this interface. */
export type ProductionWalletAuthorization = Readonly<{
  publicAddress: string;
  signatureBase64: string;
  providerAuthorizationReference: string;
  authorizedAt: string;
}>;

export type ExternalWalletConnectionRequest = Readonly<{
  userReference: string;
  requestedAddress?: string;
}>;

export type ExternalWalletRecoveryDisclosure = Readonly<{
  recoverableByReliefChain: false;
  message: string;
}>;

export interface ExternalWalletAdapter {
  readonly custodyModel: 'external_self_custody';
  connect(request: ExternalWalletConnectionRequest): Promise<ProductionWalletDescriptor>;
  authorize(request: ProductionWalletAuthorizationRequest): Promise<ProductionWalletAuthorization>;
  recoveryDisclosure(): ExternalWalletRecoveryDisclosure;
}

export type PartnerWalletRequest = Readonly<{
  userReference: string;
  identityVerificationReference: string;
}>;

export type PartnerRecoveryRequest = Readonly<{
  userReference: string;
  providerWalletReference: string;
  identityReverificationReference: string;
  reason: 'lost_device' | 'lost_credentials' | 'suspected_compromise';
}>;

export type PartnerRecoveryCase = Readonly<{
  providerRecoveryReference: string;
  status: 'requested' | 'in_review' | 'approved' | 'rejected' | 'completed';
  nextAction: string | null;
}>;

export interface PartnerManagedWalletAdapter {
  readonly custodyModel: 'partner_managed';
  provisionOrConnect(request: PartnerWalletRequest): Promise<ProductionWalletDescriptor>;
  authorize(request: ProductionWalletAuthorizationRequest): Promise<ProductionWalletAuthorization>;
  beginRecovery(request: PartnerRecoveryRequest): Promise<PartnerRecoveryCase>;
  getRecoveryStatus(providerRecoveryReference: string): Promise<PartnerRecoveryCase>;
}

export type ProductionWalletAdapter = ExternalWalletAdapter | PartnerManagedWalletAdapter;
