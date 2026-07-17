import type {
    ExternalWalletAdapter,
    ExternalWalletConnectionRequest,
    ExternalWalletRecoveryDisclosure,
    PartnerManagedWalletAdapter,
    PartnerRecoveryCase,
    PartnerRecoveryRequest,
    PartnerWalletRequest,
    ProductionWalletAdapter,
    ProductionWalletAuthorization,
    ProductionWalletAuthorizationRequest,
    ProductionWalletDescriptor,
} from '@/types/wallet-custody';
import { assertProductionCustodyBoundary } from './wallet-custody-core';

const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;
const SIGNATURE_BASE64 = /^[A-Za-z0-9+/]{86}==$/;

const assertNonEmptyReference = (value: string, label: string): void => {
  if (value.trim().length === 0 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label} must be a non-empty opaque reference.`);
  }
};

const assertDescriptor = (
  descriptor: ProductionWalletDescriptor,
  custodyModel: ProductionWalletDescriptor['custodyModel'],
): void => {
  assertProductionCustodyBoundary(descriptor);
  if (descriptor.custodyModel !== custodyModel || descriptor.network !== 'stellar_public') {
    throw new TypeError('Production wallet descriptor has an invalid custody or network boundary.');
  }
  if (!STELLAR_ADDRESS.test(descriptor.publicAddress)) {
    throw new TypeError('Production wallet descriptor has an invalid public address.');
  }
  assertNonEmptyReference(descriptor.provider, 'Provider');
  assertNonEmptyReference(descriptor.providerWalletReference, 'Provider wallet reference');
};

const assertAuthorizationRequest = (request: ProductionWalletAuthorizationRequest): void => {
  assertProductionCustodyBoundary(request);
  assertNonEmptyReference(request.providerWalletReference, 'Provider wallet reference');
  if (!STELLAR_ADDRESS.test(request.publicAddress) || request.canonicalPayload.length === 0) {
    throw new TypeError('Production wallet authorization request is invalid.');
  }
  if (!Number.isFinite(Date.parse(request.expiresAt))) {
    throw new TypeError('Production wallet authorization expiry is invalid.');
  }
};

const assertAuthorization = (
  authorization: ProductionWalletAuthorization,
  request: ProductionWalletAuthorizationRequest,
): void => {
  assertProductionCustodyBoundary(authorization);
  if (
    authorization.publicAddress !== request.publicAddress
    || !SIGNATURE_BASE64.test(authorization.signatureBase64)
    || !Number.isFinite(Date.parse(authorization.authorizedAt))
  ) {
    throw new TypeError('Production wallet authorization evidence is invalid.');
  }
  assertNonEmptyReference(
    authorization.providerAuthorizationReference,
    'Provider authorization reference',
  );
};

const assertRecoveryCase = (recoveryCase: PartnerRecoveryCase): void => {
  assertProductionCustodyBoundary(recoveryCase);
  assertNonEmptyReference(
    recoveryCase.providerRecoveryReference,
    'Provider recovery reference',
  );
};

const guardExternalAdapter = (adapter: ExternalWalletAdapter): ExternalWalletAdapter =>
  Object.freeze({
    custodyModel: 'external_self_custody' as const,
    async connect(request: ExternalWalletConnectionRequest): Promise<ProductionWalletDescriptor> {
      assertProductionCustodyBoundary(request);
      const descriptor = await adapter.connect.call(adapter, request);
      assertDescriptor(descriptor, 'external_self_custody');
      return descriptor;
    },
    async authorize(
      request: ProductionWalletAuthorizationRequest,
    ): Promise<ProductionWalletAuthorization> {
      assertAuthorizationRequest(request);
      const authorization = await adapter.authorize.call(adapter, request);
      assertAuthorization(authorization, request);
      return authorization;
    },
    recoveryDisclosure(): ExternalWalletRecoveryDisclosure {
      const disclosure = adapter.recoveryDisclosure.call(adapter);
      assertProductionCustodyBoundary(disclosure);
      if (
        disclosure.recoverableByReliefChain !== false
        || disclosure.message.trim().length === 0
      ) {
        throw new TypeError('External self-custody recovery disclosure is invalid.');
      }
      return disclosure;
    },
  });

const guardPartnerAdapter = (
  adapter: PartnerManagedWalletAdapter,
): PartnerManagedWalletAdapter => Object.freeze({
  custodyModel: 'partner_managed' as const,
  async provisionOrConnect(request: PartnerWalletRequest): Promise<ProductionWalletDescriptor> {
    assertProductionCustodyBoundary(request);
    const descriptor = await adapter.provisionOrConnect.call(adapter, request);
    assertDescriptor(descriptor, 'partner_managed');
    return descriptor;
  },
  async authorize(
    request: ProductionWalletAuthorizationRequest,
  ): Promise<ProductionWalletAuthorization> {
    assertAuthorizationRequest(request);
    const authorization = await adapter.authorize.call(adapter, request);
    assertAuthorization(authorization, request);
    return authorization;
  },
  async beginRecovery(request: PartnerRecoveryRequest): Promise<PartnerRecoveryCase> {
    assertProductionCustodyBoundary(request);
    const recoveryCase = await adapter.beginRecovery.call(adapter, request);
    assertRecoveryCase(recoveryCase);
    return recoveryCase;
  },
  async getRecoveryStatus(providerRecoveryReference: string): Promise<PartnerRecoveryCase> {
    assertNonEmptyReference(providerRecoveryReference, 'Provider recovery reference');
    const recoveryCase = await adapter.getRecoveryStatus.call(
      adapter,
      providerRecoveryReference,
    );
    assertRecoveryCase(recoveryCase);
    return recoveryCase;
  },
});

/**
 * Wraps production providers so every request and result is checked before it
 * crosses into application state. Only public addresses, signatures, and opaque
 * provider references may cross this boundary; production private keys never do.
 */
export function useProductionWalletAdapter(
  adapter: ExternalWalletAdapter,
): ExternalWalletAdapter;
export function useProductionWalletAdapter(
  adapter: PartnerManagedWalletAdapter,
): PartnerManagedWalletAdapter;
export function useProductionWalletAdapter(
  adapter: ProductionWalletAdapter,
): ProductionWalletAdapter {
  assertProductionCustodyBoundary(adapter);
  return adapter.custodyModel === 'external_self_custody'
    ? guardExternalAdapter(adapter)
    : guardPartnerAdapter(adapter);
}

export const isExternalWalletAdapter = (
  adapter: ProductionWalletAdapter,
): adapter is ExternalWalletAdapter => adapter.custodyModel === 'external_self_custody';

export const isPartnerManagedWalletAdapter = (
  adapter: ProductionWalletAdapter,
): adapter is PartnerManagedWalletAdapter => adapter.custodyModel === 'partner_managed';
