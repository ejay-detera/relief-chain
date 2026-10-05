import React, { useState } from 'react';
import { View } from 'react-native';

import { OfflineBanner } from '@/components/offline/OfflineBanner';
import { SyncStatusModal } from '@/components/offline/SyncStatusModal';
import { useOfflineSync } from '@/hooks/use-offline-sync';

interface MerchantOfflineSyncWidgetProps {
  merchantEntityId: string | null;
}

/**
 * MerchantOfflineSyncWidget mounts the offline sync engine on the main Merchant dashboard.
 * Automatically synchronizes pending offline redemptions when internet is detected
 * and allows immediate manual sync via the sync status modal.
 */
export function MerchantOfflineSyncWidget({ merchantEntityId }: MerchantOfflineSyncWidgetProps) {
  const [isModalVisible, setIsModalVisible] = useState(false);
  const {
    queue,
    pendingCount,
    settledCount,
    rejectedCount,
    cachedBeneficiariesCount,
    isSyncing,
    syncNow,
    clearSettled,
  } = useOfflineSync(merchantEntityId);

  return (
    <View>
      <OfflineBanner
        cachedBeneficiariesCount={cachedBeneficiariesCount}
        onPressSync={() => setIsModalVisible(true)}
        pendingCount={pendingCount}
      />
      <SyncStatusModal
        isSyncing={isSyncing}
        onClearSettled={clearSettled}
        onClose={() => setIsModalVisible(false)}
        onSyncNow={syncNow}
        pendingCount={pendingCount}
        queue={queue}
        rejectedCount={rejectedCount}
        settledCount={settledCount}
        visible={isModalVisible}
      />
    </View>
  );
}
