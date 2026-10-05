import type { OfflineRedemptionEnvelope } from '../../types/offline-sync';

export interface IOfflineTransport {
  readonly mode: 'ble' | 'qr';
  isAvailable(): Promise<boolean>;
  sendPayload(envelope: OfflineRedemptionEnvelope): Promise<boolean>;
}
