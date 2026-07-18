import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { applyForAccreditation } from '@/services/merchantAccreditationService';
import { fetchActiveLGUs } from '@/services/organizationService';

type Lgu = { id: string; name: string };

type LguSelectionViewProps = {
  onApplied: () => void;
};

export function LguSelectionView({ onApplied }: LguSelectionViewProps) {
  const [lgus, setLgus] = useState<Lgu[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedLguId, setSelectedLguId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const loadLGUs = async () => {
      try {
        const data = await fetchActiveLGUs();
        setLgus(data);
      } catch (error) {
        console.error('Failed to load LGUs:', error);
      } finally {
        setLoading(false);
      }
    };
    loadLGUs();
  }, []);

  const handleApply = async () => {
    if (!selectedLguId) return;
    setSubmitting(true);
    try {
      await applyForAccreditation(selectedLguId, 'General');
      Alert.alert('Success', 'Your application has been submitted and is pending review.');
      onApplied();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'Failed to submit application.');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator color="#112E58" size="large" />
      </View>
    );
  }

  if (lgus.length === 0) {
    return (
      <View style={styles.centered}>
        <ThemedText>No LGUs are currently accepting applications.</ThemedText>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <ThemedText style={styles.title}>Apply for Accreditation</ThemedText>
      <ThemedText style={styles.subtitle}>
        To participate in ReliefChain programs, you must be accredited by an Organization/LGU. Please select one below.
      </ThemedText>
      
      <View style={styles.list}>
        {lgus.map((lgu) => (
          <Pressable
            key={lgu.id}
            onPress={() => setSelectedLguId(lgu.id)}
            style={[styles.lguItem, selectedLguId === lgu.id && styles.lguItemSelected]}
          >
            <ThemedText style={[styles.lguItemText, selectedLguId === lgu.id && styles.lguItemTextSelected]}>
              {lgu.name}
            </ThemedText>
          </Pressable>
        ))}
      </View>

      <Pressable
        disabled={!selectedLguId || submitting}
        onPress={handleApply}
        style={[styles.button, (!selectedLguId || submitting) && styles.buttonDisabled]}
      >
        {submitting ? (
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <ThemedText style={styles.buttonText}>Submit Application</ThemedText>
        )}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    backgroundColor: '#112E58',
    borderRadius: 8,
    marginTop: 16,
    paddingVertical: 14,
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#FFFFFF',
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 16,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    minHeight: 200,
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    elevation: 2,
    margin: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
  },
  lguItem: {
    borderColor: '#EEEDED',
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
    padding: 16,
  },
  lguItemSelected: {
    backgroundColor: '#112E58',
    borderColor: '#112E58',
  },
  lguItemText: {
    color: '#333333',
    fontFamily: 'PlusJakartaSans-Medium',
    fontSize: 16,
  },
  lguItemTextSelected: {
    color: '#FFFFFF',
  },
  list: {
    marginVertical: 16,
  },
  subtitle: {
    color: '#666666',
    fontSize: 14,
    marginBottom: 16,
  },
  title: {
    fontFamily: 'PlusJakartaSans-Bold',
    fontSize: 20,
    marginBottom: 8,
  },
});
