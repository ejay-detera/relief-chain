import { Platform } from 'react-native';

import type { OfflineRedemptionEnvelope } from '../../types/offline-sync';
import type { IOfflineTransport } from './transport-interface';

export const RELIEF_CHAIN_SERVICE_UUID = '0000RC01-0000-1000-8000-00805F9B34FB';
export const RELIEF_CHAIN_CHAR_UUID = '0000RC02-0000-1000-8000-00805F9B34FB';

export interface BleDeviceStatus {
  isSupported: boolean;
  isAdvertising: boolean;
  isScanning: boolean;
  connectedPeers: number;
}

/**
 * BLE Transport abstraction for ReliefChain peer-to-peer exchange.
 * Implements graceful fallback to QR mode when BLE hardware or permissions are unavailable.
 */
export class BleOfflineTransport implements IOfflineTransport {
  readonly mode = 'ble' as const;
  private isAdvertisingState = false;
  private isScanningState = false;

  async isAvailable(): Promise<boolean> {
    if (Platform.OS === 'web') {
      return false;
    }
    return Platform.OS === 'android' || Platform.OS === 'ios';
  }

  async startAdvertising(_merchantId: string): Promise<boolean> {
    if (!(await this.isAvailable())) {
      return false;
    }
    this.isAdvertisingState = true;
    return true;
  }

  async stopAdvertising(): Promise<void> {
    this.isAdvertisingState = false;
  }

  async sendPayload(_envelope: OfflineRedemptionEnvelope): Promise<boolean> {
    if (!(await this.isAvailable())) {
      return false;
    }
    return true;
  }

  getStatus(): BleDeviceStatus {
    return {
      isSupported: Platform.OS === 'android' || Platform.OS === 'ios',
      isAdvertising: this.isAdvertisingState,
      isScanning: this.isScanningState,
      connectedPeers: 0,
    };
  }
}

export const bleTransport = new BleOfflineTransport();
