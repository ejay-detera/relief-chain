import { ProgramItem } from '@/components/LguPrograms/ProgramCard';
import { ProgramFilterTabs, ProgramFilterType } from '@/components/LguPrograms/ProgramFilterTabs';
import { ProgramList } from '@/components/LguPrograms/ProgramList';
import { BrandColors, FloatingTabBarGap, FloatingTabBarHeight, Spacing } from '@/constants/theme';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCreateProgram } from './create-program/_layout';

export default function LguProgramsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { programsList, fetchProgramsList, clearEditingState } = useCreateProgram();

  const [selectedTab, setSelectedTab] = useState<ProgramFilterType>('All');
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetchProgramsList();
    } catch (err) {
      console.error('Error refreshing programs:', err);
    } finally {
      setRefreshing(false);
    }
  };

  const handleCardPress = (program: ProgramItem) => {
    router.push(`/(lgu)/program/${program.id}` as any);
  };

  const handleOpenMenu = (program: ProgramItem) => {
    router.push(`/(lgu)/program/${program.id}` as any);
  };

  return (
    <SafeAreaView edges={['top', 'left', 'right']} style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Aid Programs</Text>
        <Text style={styles.headerSubtitle}>
          Manage and monitor active relief distribution programs for transparency and community resilience.
        </Text>
      </View>

      <ProgramFilterTabs
        selectedTab={selectedTab}
        onChangeTab={setSelectedTab}
      />

      <ProgramList
        programs={programsList as ProgramItem[]}
        selectedTab={selectedTab}
        onCardPress={handleCardPress}
        onOpenMenu={handleOpenMenu}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      {/* FAB - Create Program */}
      <TouchableOpacity
        style={[
          styles.fab,
          { bottom: insets.bottom + FloatingTabBarGap + FloatingTabBarHeight + Spacing.three },
        ]}
        onPress={() => {
          clearEditingState();
          router.push('/(lgu)/create-program' as any);
        }}
        activeOpacity={0.8}
      >
        <Text style={styles.fabIcon}>+</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF9F6',
  },
  header: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.five,
    paddingBottom: Spacing.three,
    backgroundColor: '#FFFFFF',
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'PlusJakartaSans_700Bold',
    color: BrandColors.navy,
  },
  headerSubtitle: {
    fontSize: 13,
    fontFamily: 'PlusJakartaSans_400Regular',
    color: '#8E9AA8',
    marginTop: Spacing.one,
    lineHeight: 18,
  },
  fab: {
    position: 'absolute',
    right: 16,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: BrandColors.green,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  fabIcon: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
});
