import { StyleSheet, View } from 'react-native';

import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { FadeInView } from '@/components/shared/FadeInView';
import { Spacing } from '@/constants/theme';
import { OrganizationProgram } from '@/types/organization';

import { FindOrganizationSkeleton } from './find-organization-skeleton';
import { OrganizationProgramCard } from './organization-program-card';

type OrganizationProgramListProps = {
  organizations: OrganizationProgram[];
  isLoading: boolean;
  error: Error | null;
  applyDisabled: boolean;
  onApply: (program: OrganizationProgram) => void;
  onRetry: () => void;
};

export function OrganizationProgramList({
  organizations,
  isLoading,
  error,
  applyDisabled,
  onApply,
  onRetry,
}: OrganizationProgramListProps) {
  if (isLoading) {
    return <FindOrganizationSkeleton />;
  }

  if (error) {
    return <ErrorState message="We couldn't load organizations right now." onRetry={onRetry} />;
  }

  if (organizations.length === 0) {
    return (
      <EmptyState
        actionLabel="Refresh"
        description="No organizations are currently offering assistance. Check back later."
        onAction={onRetry}
        title="No Organizations Available"
      />
    );
  }

  return (
    <View style={styles.list}>
      {organizations.map((program, index) => (
        <FadeInView delay={Math.min(index, 4) * 40} key={program.id}>
          <OrganizationProgramCard
            disabled={applyDisabled}
            onApply={onApply}
            program={program}
          />
        </FadeInView>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    paddingHorizontal: Spacing.four,
  },
});
