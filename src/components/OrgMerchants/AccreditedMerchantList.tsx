import { useState } from 'react';
import { Alert, FlatList } from 'react-native';
import { EmptyState } from '@/components/shared/empty-state';
import { AccreditedMerchantCard } from './AccreditedMerchantCard';
import { ConfirmationModal } from './ConfirmationModal';
import { suspendMerchant, reactivateMerchant, type AccreditedMerchant } from '@/services/merchantManagementService';
import { BottomTabInset, FloatingTabBarHeight, FloatingTabBarGap, Spacing } from '@/constants/theme';

type Props = {
  merchants: AccreditedMerchant[];
  onRefresh: () => Promise<void>;
  organizationId: string;
};

export const AccreditedMerchantList = ({ merchants, onRefresh, organizationId }: Props) => {
  const [selectedMerchant, setSelectedMerchant] = useState<AccreditedMerchant | null>(null);
  const [actionType, setActionType] = useState<'suspend' | 'reactivate' | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await onRefresh();
    setIsRefreshing(false);
  };

  const handleConfirmAction = async () => {
    if (!selectedMerchant || !actionType) return;
    try {
      if (actionType === 'suspend') {
        await suspendMerchant(selectedMerchant.accreditationId);
      } else {
        await reactivateMerchant(selectedMerchant.accreditationId);
      }
      setSelectedMerchant(null);
      setActionType(null);
      await onRefresh();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : `Failed to ${actionType} merchant.`);
    }
  };

  return (
    <>
      <FlatList
        data={merchants}
        keyExtractor={(item) => item.accreditationId}
        renderItem={({ item }) => (
          <AccreditedMerchantCard
            merchant={item}
            onSuspend={() => { setSelectedMerchant(item); setActionType('suspend'); }}
            onReactivate={() => { setSelectedMerchant(item); setActionType('reactivate'); }}
          />
        )}
        refreshing={isRefreshing}
        onRefresh={handleRefresh}
        ListEmptyComponent={<EmptyState title="No Accredited Merchants" description="Approved merchants will appear here." />}
        contentContainerStyle={{ paddingBottom: BottomTabInset + FloatingTabBarGap + FloatingTabBarHeight + Spacing.four }}
      />
      <ConfirmationModal
        visible={!!selectedMerchant && !!actionType}
        title={actionType === 'suspend' ? 'Suspend Merchant?' : 'Reactivate Merchant?'}
        body={actionType === 'suspend' ? `Suspending "${selectedMerchant?.displayName}" will prevent them from redeeming vouchers.` : `Reactivating "${selectedMerchant?.displayName}" will restore their ability to redeem vouchers.`}
        variant={actionType ?? 'suspend'}
        onConfirm={handleConfirmAction}
        onCancel={() => { setSelectedMerchant(null); setActionType(null); }}
      />
    </>
  );
};
