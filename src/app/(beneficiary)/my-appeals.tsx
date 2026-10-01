import React, { useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FontAwesome } from '@expo/vector-icons';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { LogoHeader } from '@/components/LogoHeader/LogoHeader';
import { EmptyState } from '@/components/shared/empty-state';
import { FadeInView } from '@/components/shared/FadeInView';
import { AppealCard } from '@/components/beneficiary/Appeals/appeal-card';
import { BottomTabInset, BrandColors, MaxContentWidth, Spacing } from '@/constants/theme';
import { useAppeals } from '@/hooks/use-appeals';
import { BeneficiaryAppeal } from '@/types/appeal';

export default function MyAppealsScreen() {
  const router = useRouter();
  const { appeals, isLoading, refresh } = useAppeals();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = async () => {
    setRefreshing(true);
    await refresh();
    setRefreshing(false);
  };

  const renderItem = ({ item }: { item: BeneficiaryAppeal }) => (
    <FadeInView delay={40}>
      <AppealCard appeal={item} />
    </FadeInView>
  );

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView edges={['top', 'left', 'right']} style={styles.safeArea}>
        <LogoHeader />

        <View style={styles.navBar}>
          <Pressable onPress={() => router.back()} style={styles.backButton}>
            <FontAwesome name="arrow-left" size={16} color={BrandColors.navy} />
          </Pressable>
          <ThemedText style={styles.screenTitle}>My Appeals</ThemedText>
          <View style={styles.placeholder} />
        </View>

        <FlatList
          data={appeals}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[BrandColors.navy]}
              tintColor={BrandColors.navy}
            />
          }
          ListEmptyComponent={
            !isLoading ? (
              <FadeInView delay={50}>
                <EmptyState
                  title="No Appeals Submitted"
                  description="You have not filed any assistance appeals. If an application is declined, you can appeal from the Application Status screen."
                />
              </FadeInView>
            ) : null
          }
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAFAFC',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    width: '100%',
  },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.four,
    marginBottom: Spacing.three,
  },
  backButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'white',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
  },
  screenTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: BrandColors.navy,
  },
  placeholder: {
    width: 36,
  },
  listContent: {
    paddingHorizontal: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.six,
  },
});
