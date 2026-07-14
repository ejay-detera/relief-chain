import { useEffect } from 'react';
import { Easing, useSharedValue, withTiming, type SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

/** Total runtime of the splash sequence, in milliseconds. */
export const SPLASH_TOTAL_DURATION = 3200;

/**
 * Drives a single 0 -> 1 progress value across the whole splash sequence.
 * Every visual property (size, color crossfades, rotation, logo reveal)
 * is derived from this one value via `interpolate`, so the animation stays
 * perfectly in sync across components.
 */
export function useSplashProgress(start: boolean, onFinished: () => void): SharedValue<number> {
  const progress = useSharedValue(0);

  useEffect(() => {
    if (!start) return;

    progress.value = withTiming(1, { duration: SPLASH_TOTAL_DURATION, easing: Easing.linear }, (finished) => {
      'worklet';
      if (finished) {
        scheduleOnRN(onFinished);
      }
    });
  }, [start, onFinished, progress]);

  return progress;
}
