import { useEffect } from 'react';
import { StyleSheet, View, type DimensionValue, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
    cancelAnimation,
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withRepeat,
    withTiming,
} from 'react-native-reanimated';

import { BorderRadius, BrandColors } from '@/constants/theme';

type Props = Readonly<{
  width?: DimensionValue;
  height?: DimensionValue;
  borderRadius?: number;
  style?: StyleProp<ViewStyle>;
}>;

/**
 * A pulsing placeholder block used while real content is loading. Animates
 * opacity only (no layout-affecting properties), so it's cheap to run on the
 * UI thread and never causes reflow. Compose several of these, shaped like the
 * real content, to build a skeleton screen that matches the eventual layout
 * and avoids a layout jump when data arrives.
 */
export function Skeleton({ width = '100%', height = 16, borderRadius = BorderRadius.sm, style }: Props) {
  const opacity = useSharedValue(0.45);

  useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
    return () => cancelAnimation(opacity);
  }, [opacity]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <Animated.View
      style={[
        styles.base,
        { width, height, borderRadius },
        animatedStyle,
        style,
      ]}
    />
  );
}

/** A horizontal row of skeleton blocks, useful for icon+label placeholders. */
export function SkeletonRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: BrandColors.lightGray,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
  },
});
